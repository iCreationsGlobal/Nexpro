import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { API_BASE_URL } from './api';
import { formatCurrency, formatDate, toNumber } from '@/utils/formatCurrency';
import { formatLineItemQuantity } from '@/utils/documentLineItems';
import { buildPrintableInvoiceHtml, type InvoicePrintFormat } from '@/utils/printableInvoiceHtml';
import { logger } from '@/utils/logger';

type AnyRecord = Record<string, unknown>;

type PdfDocumentOptions = {
  filename: string;
  title: string;
};

type ShareDocumentOptions = PdfDocumentOptions & {
  dialogTitle?: string;
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function text(value: unknown, fallback = ''): string {
  if (value && typeof value === 'object') return fallback;
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function escapeHtml(value: unknown): string {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function filenameSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

function pickFirst(...values: unknown[]): string {
  return values.map((value) => text(value)).find(Boolean) || '';
}

function joinParts(...values: unknown[]): string {
  return values.map((value) => text(value)).filter(Boolean).join(', ');
}

function getBaseAssetUrl(): string {
  return API_BASE_URL.replace(/\/+$/, '');
}

function isAbsoluteAssetUrl(value: string): boolean {
  return /^data:image\//i.test(value) || /^https?:\/\//i.test(value);
}

function resolveAssetUrl(value: unknown): string {
  const rawUrl = text(value);
  if (!rawUrl) return '';
  if (isAbsoluteAssetUrl(rawUrl)) return rawUrl;

  const normalizedPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  if (!normalizedPath.startsWith('/uploads/')) return '';

  return `${getBaseAssetUrl()}${normalizedPath}`;
}

function getOrganizationLogoUrl(source: AnyRecord): string {
  const organization = getOrganization(source);
  const tenant = asRecord(source.tenant);
  return resolveAssetUrl(
    pickFirst(
      organization.logoUrl,
      organization.logo,
      organization.companyLogo,
      tenant.logoUrl,
      tenant.logo,
      source.logoUrl,
      source.logo
    )
  );
}

function getInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials || 'AB';
}

function getAddressLines(value: unknown): string[] {
  const address = asRecord(value);
  if (!Object.keys(address).length) {
    const line = text(value);
    return line ? [line] : [];
  }

  return [
    pickFirst(address.line1, address.address, address.street, address.streetAddress),
    pickFirst(address.line2, address.address2),
    joinParts(address.city, address.state, address.postalCode),
    pickFirst(address.country),
  ].filter(Boolean);
}

function getOrganization(source: AnyRecord): AnyRecord {
  const organization = asRecord(source.organization);
  const shop = asRecord(source.shop);
  const studioLocation = asRecord(source.studioLocation);
  return Object.keys(organization).length ? organization : Object.keys(shop).length ? shop : studioLocation;
}

function getOrganizationName(source: AnyRecord): string {
  const organization = getOrganization(source);
  return pickFirst(organization.name, organization.legalName, source.tenantName, 'ABS');
}

function getOrganizationLines(source: AnyRecord): string[] {
  const organization = getOrganization(source);
  return [
    ...getAddressLines(organization.address),
    joinParts(organization.city, organization.state, organization.country),
    pickFirst(organization.phone),
    pickFirst(organization.email),
    pickFirst(organization.website),
  ].filter(Boolean);
}

function getCustomerName(customer: AnyRecord): string {
  return pickFirst(customer.name, customer.company, 'Walk-in');
}

function getItems(source: AnyRecord): AnyRecord[] {
  const items = source.items || source.saleItems || source.orderItems || source.lineItems || source.products;
  return Array.isArray(items) ? items.map(asRecord) : [];
}

function getItemName(item: AnyRecord): string {
  const product = asRecord(item.product);
  return pickFirst(item.description, item.name, item.productName, product.name, item.title, 'Item');
}

function getItemProductCode(item: AnyRecord): string {
  const product = asRecord(item.product);
  const variant = asRecord(item.variant);
  const metadata = asRecord(item.metadata);
  return pickFirst(
    metadata.productCode,
    item.productCode,
    item.code,
    metadata.barcode,
    item.barcode,
    item.sku,
    metadata.sku,
    variant.barcode,
    product.barcode,
    variant.sku,
    product.sku
  );
}

function getItemQuantity(item: AnyRecord): number {
  const quantity = toNumber((item.quantity ?? item.qty) as number | string | null | undefined);
  return quantity > 0 ? quantity : 1;
}

function getItemUnitPrice(item: AnyRecord): number {
  const quantity = getItemQuantity(item);
  const explicit = item.unitPrice ?? item.price ?? item.rate ?? item.salePrice;
  const fallback = getItemLineTotal(item) / quantity;
  return toNumber((explicit ?? fallback) as number | string | null | undefined);
}

function getItemLineTotal(item: AnyRecord): number {
  const explicit = item.total ?? item.lineTotal ?? item.totalPrice ?? item.subtotal;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return toNumber(explicit as number | string | null | undefined);
  }
  return getItemQuantity(item) * toNumber((item.unitPrice ?? item.price ?? 0) as number | string | null | undefined);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function getLineItemUnitSymbol(item: AnyRecord): string {
  const metadata = asRecord(item.metadata);
  const specifications = asRecord(item.specifications);
  const product = asRecord(item.product);

  const candidates = [
    item.unitSymbol,
    item.unit,
    metadata.unitSymbol,
    metadata.unit,
    specifications.unitSymbol,
    specifications.unit,
    specifications.itemUnit,
    item.itemUnit,
    product.unit,
  ];

  const unit = candidates.map((value) => text(value)).find(Boolean);
  if (unit) return unit;
  if (text(item.pricingMethod) === 'square_foot') return 'sq ft';
  return '';
}

/** @deprecated Use formatLineItemQuantity from @/utils/documentLineItems */
export function formatLineItemQuantityDisplay(item: AnyRecord, quantity?: number): string {
  return formatLineItemQuantity(item, quantity ?? getItemQuantity(item));
}

function moneyValue(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  return toNumber(value as number | string | null | undefined);
}

function documentShell(title: string, body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { background: #ffffff; }
      body { margin: 0; padding: 28px; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 14px; line-height: 1.45; }
      .doc { border: 1.5px solid #d1d5db; border-radius: 16px; overflow: hidden; background: #ffffff; }
      .header { background: #ffffff; color: #0f172a; padding: 28px; display: flex; justify-content: space-between; gap: 24px; border-bottom: 4px solid #166534; }
      .brand-wrap { display: flex; align-items: flex-start; gap: 14px; max-width: 58%; }
      .logo { width: 58px; height: 58px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 12px; background: #ffffff; padding: 6px; }
      .logo-fallback { width: 58px; height: 58px; border: 1px solid #166534; border-radius: 12px; background: #f0fdf4; color: #166534; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; letter-spacing: 0.06em; }
      .logo-fallback.hidden { display: none; }
      .brand { color: #111827; font-size: 22px; line-height: 1.2; font-weight: 900; margin-bottom: 8px; }
      .muted-light { color: #374151; font-size: 12px; line-height: 1.5; font-weight: 500; }
      .title { text-align: right; color: #111827; font-size: 30px; line-height: 1; font-weight: 900; letter-spacing: 0.08em; }
      .number { margin-top: 10px; color: #4b5563; font-size: 13px; font-weight: 800; }
      .content { padding: 28px; }
      .grid { display: flex; gap: 18px; margin-bottom: 22px; }
      .box { flex: 1; border: 1.25px solid #d1d5db; border-radius: 12px; padding: 14px; color: #111827; }
      .label { color: #374151; font-size: 11px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
      .value { color: #020617; font-size: 14px; font-weight: 800; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { color: #374151; border-bottom: 1.5px solid #d1d5db; font-size: 11px; font-weight: 900; letter-spacing: 0.06em; padding: 10px 8px; text-align: left; text-transform: uppercase; }
      td { color: #111827; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 500; padding: 12px 8px; vertical-align: top; }
      th:last-child, td:last-child { text-align: right; }
      .totals { margin-left: auto; margin-top: 18px; width: 280px; }
      .total-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; color: #111827; font-size: 13px; font-weight: 500; }
      .grand { border-top: 1.5px solid #d1d5db; color: #166534; font-size: 18px; font-weight: 900; margin-top: 6px; padding-top: 12px; }
      .footer { color: #374151; font-size: 12px; line-height: 1.5; margin-top: 26px; font-weight: 500; white-space: pre-line; }
    </style>
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div class="doc">${body}</div>
  </body>
</html>`;
}

function renderHeader(source: AnyRecord, title: string, number: string): string {
  const lines = getOrganizationLines(source).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
  const organizationName = getOrganizationName(source);
  const logoUrl = getOrganizationLogoUrl(source);
  const fallbackInitials = escapeHtml(getInitials(organizationName));
  const logo = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(organizationName)} logo" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');" /><span class="logo-fallback hidden">${fallbackInitials}</span>`
    : `<span class="logo-fallback">${fallbackInitials}</span>`;

  return `<div class="header">
    <div class="brand-wrap">
      ${logo}
      <div>
        <div class="brand">${escapeHtml(organizationName)}</div>
        <div class="muted-light">${lines}</div>
      </div>
    </div>
    <div>
      <div class="title">${escapeHtml(title)}</div>
      ${number ? `<div class="number">${escapeHtml(number)}</div>` : ''}
    </div>
  </div>`;
}

function renderItems(items: AnyRecord[], showProductCode = true): string {
  const rows = items.length
    ? items.map((item) => {
      const quantity = getItemQuantity(item);
      const unitPrice = getItemUnitPrice(item);
      const lineTotal = getItemLineTotal(item);
      const productCode = showProductCode ? getItemProductCode(item) : '';
      return `<tr>
        <td>
          <div>${escapeHtml(getItemName(item))}</div>
          ${productCode ? `<div class="muted-light">Code: ${escapeHtml(productCode)}</div>` : ''}
        </td>
        <td>${escapeHtml(formatLineItemQuantity(item, quantity))}</td>
        <td>${escapeHtml(formatCurrency(unitPrice))}</td>
        <td>${escapeHtml(formatCurrency(lineTotal))}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="4">No items listed</td></tr>';

  return `<table>
    <thead>
      <tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export type PreparedPdfFile = {
  uri: string;
  filename: string;
  title: string;
};

async function printHtmlToPdfFile(html: string, filename: string, title: string): Promise<PreparedPdfFile> {
  const file = await Print.printToFileAsync({
    html,
    base64: false,
  });
  const sourceFile = new File(file.uri);
  const namedFile = new File(Paths.cache, filenameSafe(filename));
  if (namedFile.exists) {
    namedFile.delete();
  }
  sourceFile.copy(namedFile);

  return {
    uri: namedFile.uri,
    filename: filenameSafe(filename),
    title,
  };
}

export async function sharePreparedPdf(
  prepared: PreparedPdfFile,
  options: { dialogTitle?: string } = {}
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('PDF sharing is not available on this device.');
  }

  await Sharing.shareAsync(prepared.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: options.dialogTitle || prepared.title,
  });
}

async function shareHtmlAsPdf(html: string, options: ShareDocumentOptions) {
  const prepared = await printHtmlToPdfFile(html, options.filename, options.title);
  await sharePreparedPdf(prepared, { dialogTitle: options.dialogTitle || options.title });
}

export function getInvoicePdfFilename(invoice: AnyRecord): string {
  return `${filenameSafe(pickFirst(invoice.invoiceNumber, invoice.id, 'invoice'))}.pdf`;
}

type InvoicePdfOptions = {
  showProductCode?: boolean;
  footerNote?: string;
  businessType?: string;
  printFormat?: InvoicePrintFormat;
};

function buildInvoicePdfBody(
  invoice: AnyRecord,
  options: InvoicePdfOptions = {}
): { html: string; number: string } {
  const number = pickFirst(invoice.invoiceNumber, invoice.id);
  const html = buildPrintableInvoiceHtml(invoice, getBaseAssetUrl(), {
    showProductCode: options.showProductCode,
    footerNote: options.footerNote,
    businessType: options.businessType,
    printFormat: options.printFormat,
  });
  return { html, number };
}

export async function prepareInvoicePdf(
  invoice: AnyRecord,
  options: InvoicePdfOptions = {}
): Promise<PreparedPdfFile> {
  const { html, number } = buildInvoicePdfBody(invoice, options);
  logger.info('PDFDocuments', 'Preparing invoice PDF', { invoiceId: invoice.id, invoiceNumber: number });
  return printHtmlToPdfFile(html, getInvoicePdfFilename(invoice), `Invoice ${number}`);
}

export async function shareInvoicePdf(
  invoice: AnyRecord,
  options: InvoicePdfOptions = {}
) {
  const prepared = await prepareInvoicePdf(invoice, options);
  logger.info('PDFDocuments', 'Sharing invoice PDF', {
    invoiceId: invoice.id,
    invoiceNumber: pickFirst(invoice.invoiceNumber, invoice.id),
  });
  await sharePreparedPdf(prepared, { dialogTitle: 'Download Invoice' });
}

/**
 * Open the native print dialog directly (AirPrint / Android print service) instead of
 * generating a PDF and handing it to the share sheet. Lets an OS-registered thermal
 * receipt printer show up as a normal print destination.
 */
export async function printInvoice(
  invoice: AnyRecord,
  options: InvoicePdfOptions = {}
) {
  const { html, number } = buildInvoicePdfBody(invoice, options);
  logger.info('PDFDocuments', 'Printing invoice', { invoiceId: invoice.id, invoiceNumber: number });
  await Print.printAsync({ html });
}

export function getReceiptPdfFilename(sale: AnyRecord): string {
  return `${filenameSafe(pickFirst(sale.saleNumber, sale.orderNumber, sale.id, 'receipt'))}.pdf`;
}

export function getQuotePdfFilename(quote: AnyRecord): string {
  return `${filenameSafe(pickFirst(quote.quoteNumber, quote.id, 'quote'))}.pdf`;
}

export async function shareQuotePdf(quote: AnyRecord) {
  const customer = asRecord(quote.customer);
  const items = getItems(quote);
  const total = moneyValue(quote.totalAmount ?? quote.total);
  const discount = moneyValue(quote.discountAmount);
  const tax = moneyValue(quote.taxAmount);
  const number = pickFirst(quote.quoteNumber, quote.id);

  const body = `${renderHeader(quote, 'QUOTE', number)}
    <div class="content">
      <div class="grid">
        <div class="box">
          <div class="label">Prepared for</div>
          <div class="value">${escapeHtml(getCustomerName(customer))}</div>
          ${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}
          ${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}
        </div>
        <div class="box">
          <div class="label">Quote details</div>
          <div class="value">Status: ${escapeHtml(quote.status || 'Quote')}</div>
          <div>Date: ${escapeHtml(formatDate((quote.createdAt ?? quote.quoteDate) as string | null | undefined))}</div>
          ${quote.validUntil ? `<div>Valid until: ${escapeHtml(formatDate(quote.validUntil as string))}</div>` : ''}
        </div>
      </div>
      ${renderItems(items)}
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(moneyValue(quote.subtotal, total)))}</strong></div>
        ${discount > 0 ? `<div class="total-row"><span>Discount</span><strong>-${escapeHtml(formatCurrency(discount))}</strong></div>` : ''}
        ${tax > 0 ? `<div class="total-row"><span>Tax</span><strong>${escapeHtml(formatCurrency(tax))}</strong></div>` : ''}
        <div class="total-row grand"><span>Total</span><span>${escapeHtml(formatCurrency(total))}</span></div>
      </div>
      ${quote.notes ? `<div class="footer">${escapeHtml(quote.notes)}</div>` : ''}
    </div>`;

  logger.info('PDFDocuments', 'Sharing quote PDF', { quoteId: quote.id, quoteNumber: number });
  await shareHtmlAsPdf(documentShell(`Quote ${number}`, body), {
    filename: getQuotePdfFilename(quote),
    title: `Quote ${number}`,
    dialogTitle: 'Download Quote',
  });
}

function buildReceiptPdfBody(sale: AnyRecord): { html: string; number: string } {
  const customer = asRecord(sale.customer);
  const items = getItems(sale);
  const total = moneyValue(sale.total ?? sale.totalAmount);
  const paid = moneyValue(sale.amountPaid ?? sale.paidAmount, total);
  const balance = Math.max(0, total - paid);
  const discount = moneyValue(sale.discount);
  const tax = moneyValue(sale.tax);
  const number = pickFirst(sale.saleNumber, sale.orderNumber, sale.id);

  const body = `${renderHeader(sale, 'RECEIPT', number)}
    <div class="content">
      <div class="grid">
        <div class="box">
          <div class="label">Customer</div>
          <div class="value">${escapeHtml(getCustomerName(customer))}</div>
          ${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}
          ${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}
        </div>
        <div class="box">
          <div class="label">Receipt details</div>
          <div class="value">Status: ${escapeHtml(sale.status || 'Completed')}</div>
          <div>Date: ${escapeHtml(formatDate((sale.createdAt ?? sale.saleDate) as string | null | undefined))}</div>
          ${sale.paymentMethod ? `<div>Payment: ${escapeHtml(sale.paymentMethod)}</div>` : ''}
        </div>
      </div>
      ${renderItems(items)}
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(moneyValue(sale.subtotal, total)))}</strong></div>
        ${discount > 0 ? `<div class="total-row"><span>Discount</span><strong>-${escapeHtml(formatCurrency(discount))}</strong></div>` : ''}
        ${tax > 0 ? `<div class="total-row"><span>Tax</span><strong>${escapeHtml(formatCurrency(tax))}</strong></div>` : ''}
        <div class="total-row grand"><span>Total</span><span>${escapeHtml(formatCurrency(total))}</span></div>
        <div class="total-row"><span>Paid</span><strong>${escapeHtml(formatCurrency(paid))}</strong></div>
        ${balance > 0 ? `<div class="total-row"><span>Balance</span><strong>${escapeHtml(formatCurrency(balance))}</strong></div>` : ''}
      </div>
      <div class="footer">Thank you for your purchase.</div>
    </div>`;

  return { html: documentShell(`Receipt ${number}`, body), number };
}

export async function prepareReceiptPdf(sale: AnyRecord): Promise<PreparedPdfFile> {
  const { html, number } = buildReceiptPdfBody(sale);
  logger.info('PDFDocuments', 'Preparing receipt PDF', { saleId: sale.id, saleNumber: number });
  return printHtmlToPdfFile(html, getReceiptPdfFilename(sale), `Receipt ${number}`);
}

export async function shareReceiptPdf(sale: AnyRecord) {
  const prepared = await prepareReceiptPdf(sale);
  logger.info('PDFDocuments', 'Sharing receipt PDF', { saleId: sale.id, saleNumber: prepared.title });
  await sharePreparedPdf(prepared, { dialogTitle: 'Download Receipt' });
}
