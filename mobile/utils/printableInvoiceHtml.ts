import { formatCurrency, formatDecimal, toNumber } from '@/utils/formatCurrency';
import { resolveInvoiceDocumentContext } from '@/utils/invoiceDocumentContext';
import { resolvePrintedInvoiceTerms } from '@/utils/invoicePrintTerms';
import { getInvoiceTaxDisplay } from '@/utils/invoiceTaxDisplay';
import { formatLineItemQuantity } from '@/utils/documentLineItems';

type AnyRecord = Record<string, unknown>;

export type PrintableInvoiceHtmlOptions = {
  showProductCode?: boolean;
  showBalanceDue?: boolean;
  footerNote?: string;
  businessType?: string;
  documentTitle?: string;
};

const DEFAULT_THANK_YOU = 'Thank you for doing business with us.';

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

function pickFirst(...values: unknown[]): string {
  return values.map((value) => text(value)).find(Boolean) || '';
}

function formatInvoiceLongDate(value: unknown): string {
  if (!value) return '—';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return text(value, '—');
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatAddress(address: unknown): string {
  const addr = asRecord(address);
  if (!Object.keys(addr).length) return text(address);
  const parts = [
    pickFirst(addr.line1, addr.address, addr.street, addr.streetAddress),
    pickFirst(addr.line2, addr.address2),
    [pickFirst(addr.city), pickFirst(addr.state), pickFirst(addr.postalCode, addr.zipCode)]
      .filter(Boolean)
      .join(', '),
    pickFirst(addr.country),
  ].filter(Boolean);
  return parts.join('\n');
}

function resolveOrganization(invoice: AnyRecord): AnyRecord {
  const organization = asRecord(invoice.organization);
  const shop = asRecord(invoice.shop);
  const studioLocation = asRecord(invoice.studioLocation);
  if (Object.keys(organization).length) return organization;
  if (Object.keys(shop).length) return shop;
  return studioLocation;
}

function resolveLogoUrl(organization: AnyRecord, apiBaseUrl: string): string {
  const rawUrl = pickFirst(organization.logoUrl, organization.logo, organization.companyLogo);
  if (!rawUrl) return '';
  if (/^data:image\//i.test(rawUrl) || /^https?:\/\//i.test(rawUrl)) return rawUrl;
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
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
    product.productCode,
    variant.productCode,
    variant.barcode,
    product.barcode,
    variant.sku,
    product.sku
  );
}

function getItems(invoice: AnyRecord): AnyRecord[] {
  const items = invoice.items;
  return Array.isArray(items) ? items.map(asRecord) : [];
}

function getItemName(item: AnyRecord): string {
  const product = asRecord(item.product);
  return pickFirst(item.description, item.name, item.category, product.name, item.title, 'Item');
}

function getItemQuantity(item: AnyRecord): number {
  const quantity = toNumber((item.quantity ?? item.qty) as number | string | null | undefined);
  return quantity > 0 ? quantity : 1;
}

function getItemUnitPrice(item: AnyRecord): number {
  const quantity = getItemQuantity(item);
  const explicit = item.unitPrice ?? item.price ?? item.rate;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return toNumber(explicit as number | string | null | undefined);
  }
  const total = toNumber((item.total ?? item.lineTotal ?? item.totalPrice) as number | string | null | undefined);
  return quantity > 0 ? total / quantity : total;
}

function getItemLineTotal(item: AnyRecord): number {
  const explicit = item.total ?? item.lineTotal ?? item.totalPrice ?? item.subtotal;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return toNumber(explicit as number | string | null | undefined);
  }
  return getItemQuantity(item) * getItemUnitPrice(item);
}

function moneyValue(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  return toNumber(value as number | string | null | undefined);
}

function renderGraStamp(invoice: AnyRecord): string {
  const metadata = asRecord(invoice.metadata);
  const sale = asRecord(invoice.sale);
  const saleMetadata = asRecord(sale.metadata);
  const stamp = asRecord(metadata.graStamp || saleMetadata.graStamp);
  if (!text(stamp.irn)) return '';

  const qrSrc = text(stamp.qrCodeDataUrl);
  return `<div class="notes-section gra-stamp">
    <div class="notes-title">GRA e-VAT</div>
    <div class="gra-stamp-body">
      <div>
        <div>IRN: ${escapeHtml(stamp.irn)}</div>
        ${stamp.verificationEngineId ? `<div>Verification engine: ${escapeHtml(stamp.verificationEngineId)}</div>` : ''}
        ${stamp.stampedAt ? `<div>Stamped: ${escapeHtml(formatInvoiceLongDate(stamp.stampedAt))}</div>` : ''}
      </div>
      ${qrSrc ? `<img class="gra-qr" src="${escapeHtml(qrSrc)}" alt="GRA QR code" />` : ''}
    </div>
  </div>`;
}

const PRINTABLE_INVOICE_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 15mm;
    font-family: Helvetica, Arial, sans-serif;
    color: #000;
    font-size: 12px;
    line-height: 1.45;
  }
  .printable-invoice {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
  }
  .invoice-header,
  .invoice-parties,
  .billing-section,
  .items-table,
  .totals-section,
  .notes-section,
  .footer {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid #d1d5db;
  }
  .company-info { flex: 1; min-width: 0; }
  .company-logo {
    max-width: 140px;
    max-height: 72px;
    margin-bottom: 10px;
    object-fit: contain;
    object-position: left center;
  }
  .company-name-placeholder {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
    color: #111827;
  }
  .company-details {
    font-size: 12px;
    line-height: 1.55;
    color: #374151;
  }
  .company-details-line { margin-bottom: 2px; }
  .company-tax-line {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #6b7280;
  }
  .invoice-info {
    text-align: right;
    flex: 0 1 240px;
    max-width: 42%;
    min-width: 0;
  }
  .invoice-title {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 12px;
    color: #111827;
    letter-spacing: 0.08em;
    line-height: 1.1;
  }
  .invoice-meta-row {
    font-size: 12px;
    margin-bottom: 4px;
    color: #111827;
  }
  .invoice-meta-row strong { font-weight: 700; }
  .invoice-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin: 0 0 22px;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
  }
  .invoice-parties--single { grid-template-columns: 1fr; }
  .billing-section { padding: 14px 18px 14px 0; }
  .billing-section + .billing-section {
    padding-left: 18px;
    border-left: 1px solid #e5e7eb;
  }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #111827;
  }
  .billing-info {
    font-size: 12px;
    line-height: 1.65;
    color: #374151;
  }
  .billing-info strong { font-weight: 700; color: #111827; }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 18px;
    font-size: 11px;
  }
  .items-table th {
    background-color: #f3f4f6;
    padding: 9px 10px;
    text-align: left;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #111827;
    border: 1px solid #e5e7eb;
  }
  .items-table td {
    padding: 9px 10px;
    border: 1px solid #e5e7eb;
    font-size: 11px;
    color: #111827;
    vertical-align: top;
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .item-meta { font-size: 10px; color: #666; margin-top: 2px; }
  .totals-section {
    margin-top: 4px;
    margin-left: auto;
    width: min(100%, 280px);
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 5px 0;
    font-size: 12px;
    color: #111827;
  }
  .total-row.bold {
    font-weight: 700;
    font-size: 13px;
    border-top: 1px solid #d1d5db;
    padding-top: 8px;
    margin-top: 4px;
  }
  .total-row.discount { color: #16a34a; font-weight: 500; }
  .total-row.discount-reason { font-size: 10px; color: #666; font-weight: 400; margin-top: 2px; }
  .total-row.paid span:last-child { color: #16a34a; font-weight: 600; }
  .total-row.balance,
  .total-row.balance span { color: #dc2626; font-weight: 700; font-size: 14px; }
  .notes-section {
    margin-top: 22px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
  }
  .notes-title {
    font-weight: 700;
    font-size: 11px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #111827;
  }
  .pay-to-block {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    background-color: #f9fafb;
    font-size: 12px;
    line-height: 1.6;
  }
  .pay-to-title {
    font-weight: 700;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
  }
  .notes-content {
    font-size: 11px;
    line-height: 1.65;
    color: #4b5563;
    white-space: pre-line;
  }
  .footer {
    margin-top: 28px;
    text-align: center;
    font-size: 11px;
    color: #9ca3af;
    white-space: pre-line;
  }
  .gra-stamp-body {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
    font-size: 11px;
  }
  .gra-qr { width: 96px; height: 96px; }
`;

function renderCompanyHeader(organization: AnyRecord, logoUrl: string): string {
  const name = pickFirst(organization.name, organization.legalName, 'Company name');
  const location = formatAddress(organization.address);
  const tax = asRecord(organization.tax);
  const logo = logoUrl
    ? `<img class="company-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" />`
    : name
      ? `<div class="company-name-placeholder">${escapeHtml(name)}</div>`
      : '';

  const details = [
    location ? `<div class="company-details-line" style="white-space:pre-line">${escapeHtml(location)}</div>` : '',
    organization.phone ? `<div class="company-details-line">Phone: ${escapeHtml(organization.phone)}</div>` : '',
    organization.website ? `<div class="company-details-line">Website: ${escapeHtml(organization.website)}</div>` : '',
    organization.email ? `<div class="company-details-line">Email: ${escapeHtml(organization.email)}</div>` : '',
  ].filter(Boolean).join('');

  const taxLines = [
    tax.vatNumber ? `<div>VAT: ${escapeHtml(tax.vatNumber)}</div>` : '',
    tax.tin ? `<div>TIN: ${escapeHtml(tax.tin)}</div>` : '',
    tax.ghanaCardPin ? `<div>Ghana Card PIN: ${escapeHtml(tax.ghanaCardPin)}</div>` : '',
  ].filter(Boolean).join('');

  return `<div class="company-info">
    ${logo}
    <div class="company-details">
      ${details}
      ${taxLines ? `<div class="company-tax-line">${taxLines}</div>` : ''}
    </div>
  </div>`;
}

function renderBillTo(customer: AnyRecord): string {
  const cityLine = [customer.city, customer.state, customer.zipCode].filter((v) => text(v)).join(', ');
  return `<div class="billing-section">
    <div class="section-title">Bill To:</div>
    <div class="billing-info">
      <div><strong>${escapeHtml(pickFirst(customer.name, 'N/A'))}</strong></div>
      ${customer.company ? `<div>${escapeHtml(customer.company)}</div>` : ''}
      ${customer.address ? `<div>${escapeHtml(customer.address)}</div>` : ''}
      ${cityLine ? `<div>${escapeHtml(cityLine)}</div>` : ''}
      ${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}
      ${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}
    </div>
  </div>`;
}

function renderItemsTable(items: AnyRecord[], showProductCode: boolean, quantityColumnLabel: string): string {
  const colSpan = showProductCode ? 5 : 4;
  const rows = items.length
    ? items
        .map((item) => {
          const productCode = getItemProductCode(item);
          const paperSize = text(item.paperSize);
          return `<tr>
            <td>
              <div>${escapeHtml(getItemName(item))}</div>
              ${paperSize ? `<div class="item-meta">Size: ${escapeHtml(paperSize)}</div>` : ''}
            </td>
            ${showProductCode ? `<td>${escapeHtml(productCode || '-')}</td>` : ''}
            <td class="text-center">${escapeHtml(formatLineItemQuantity(item, getItemQuantity(item)))}</td>
            <td class="text-right">${escapeHtml(formatCurrency(getItemUnitPrice(item)))}</td>
            <td class="text-right"><strong>${escapeHtml(formatCurrency(getItemLineTotal(item)))}</strong></td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="${colSpan}" class="text-center">No items</td></tr>`;

  return `<table class="items-table">
    <thead>
      <tr>
        <th style="width:48%">Description</th>
        ${showProductCode ? '<th style="width:16%">Product Code</th>' : ''}
        <th class="text-center" style="width:14%">${escapeHtml(quantityColumnLabel)}</th>
        <th class="text-right" style="width:11%">Unit Price</th>
        <th class="text-right" style="width:11%">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * Build full HTML document for invoice PDF — matches web PrintableInvoice (A4).
 */
export function buildPrintableInvoiceHtml(
  invoice: AnyRecord,
  apiBaseUrl: string,
  options: PrintableInvoiceHtmlOptions = {}
): string {
  const organization = resolveOrganization(invoice);
  const documentContext = resolveInvoiceDocumentContext(invoice, {
    businessType: options.businessType,
  });
  const showProductCode = options.showProductCode ?? documentContext.showProductCode;
  const showBalanceDue = options.showBalanceDue !== false;
  const titleText = options.documentTitle || 'INVOICE';
  const number = pickFirst(invoice.invoiceNumber, invoice.id);
  const customer = asRecord(invoice.customer);
  const items = getItems(invoice);
  const taxDisplay = getInvoiceTaxDisplay(invoice, organization);
  const tax = asRecord(organization.tax);
  const taxLabel = taxDisplay.isTaxInclusive
    ? taxDisplay.taxLabel
    : `${String(tax.displayLabel || 'Tax')} (${formatDecimal(invoice.taxRate ?? 0, 0)}%)`;
  const subtotalLabel = taxDisplay.isTaxInclusive ? 'Subtotal (net)' : 'Subtotal';
  const totalAmount = moneyValue(invoice.totalAmount ?? invoice.total);
  const amountPaid = moneyValue(invoice.amountPaid ?? invoice.paidAmount);
  const balance = moneyValue(invoice.balance, Math.max(0, totalAmount - amountPaid));
  const logoUrl = resolveLogoUrl(organization, apiBaseUrl);
  const footerNote = text(options.footerNote);
  const invoiceFooter = pickFirst(organization.invoiceFooter, DEFAULT_THANK_YOU);
  const paymentDetailsEnabled = organization.paymentDetailsEnabled === true;
  const paymentDetails = text(organization.paymentDetails);

  const sourceSection = documentContext.showJobDetails
    ? (() => {
        const job = asRecord(invoice.job);
        return `<div class="billing-section">
          <div class="section-title">Job Details:</div>
          <div class="billing-info">
            ${job.jobNumber ? `<div><strong>Job #:</strong> ${escapeHtml(job.jobNumber)}</div>` : ''}
            ${job.title ? `<div>${escapeHtml(job.title)}</div>` : ''}
          </div>
        </div>`;
      })()
    : documentContext.showRentalDetails
      ? `<div class="billing-section">
          <div class="section-title">Rental Details:</div>
          <div class="billing-info">
            ${documentContext.rentalDetails.periodLabel ? `<div><strong>Period:</strong> ${escapeHtml(documentContext.rentalDetails.periodLabel)}</div>` : ''}
            ${documentContext.rentalDetails.durationDays ? `<div><strong>Duration:</strong> ${escapeHtml(documentContext.rentalDetails.durationDays)} ${documentContext.rentalDetails.durationDays === 1 ? 'day' : 'days'}</div>` : ''}
          </div>
        </div>`
      : documentContext.showSaleDetails
        ? `<div class="billing-section">
            <div class="section-title">Sale Details:</div>
            <div class="billing-info">
              <div><strong>Sale #:</strong> ${escapeHtml(documentContext.saleNumber)}</div>
            </div>
          </div>`
        : '';

  const discountPct =
    invoice.discountType === 'percentage' && invoice.discountValue
      ? ` (${escapeHtml(invoice.discountValue)}%)`
      : '';
  const discountReason = text(invoice.discountReason);

  const body = `<div class="printable-invoice">
    <div class="invoice-header">
      ${renderCompanyHeader(organization, logoUrl)}
      <div class="invoice-info">
        <div class="invoice-title">${escapeHtml(titleText)}</div>
        <div class="invoice-meta-row"><strong>Invoice #</strong> ${escapeHtml(number)}</div>
        <div class="invoice-meta-row"><strong>Date:</strong> ${escapeHtml(formatInvoiceLongDate(invoice.invoiceDate ?? invoice.createdAt))}</div>
        ${invoice.dueDate ? `<div class="invoice-meta-row"><strong>Due Date:</strong> ${escapeHtml(formatInvoiceLongDate(invoice.dueDate))}</div>` : ''}
      </div>
    </div>

    <div class="invoice-parties${documentContext.hasSourceDetails ? '' : ' invoice-parties--single'}">
      ${renderBillTo(customer)}
      ${sourceSection}
    </div>

    ${renderItemsTable(items, showProductCode, documentContext.quantityColumnLabel)}

    <div class="totals-section">
      <div class="total-row"><span>${escapeHtml(subtotalLabel)}:</span><span>${escapeHtml(formatCurrency(taxDisplay.subtotal))}</span></div>
      ${
        taxDisplay.discountAmount > 0
          ? `<div class="total-row discount">
              <span>Discount${discountPct}${discountReason ? `<div class="total-row discount-reason">${escapeHtml(discountReason)}</div>` : ''}</span>
              <span>-${escapeHtml(formatCurrency(taxDisplay.discountAmount))}</span>
            </div>`
          : ''
      }
      ${
        taxDisplay.hasTax
          ? `<div class="total-row"><span>${escapeHtml(taxLabel)}:</span><span>${escapeHtml(formatCurrency(taxDisplay.taxAmount))}</span></div>`
          : ''
      }
      <div class="total-row bold"><span>Total Amount:</span><span>${escapeHtml(formatCurrency(totalAmount))}</span></div>
      ${
        amountPaid > 0 || balance < totalAmount
          ? `<div class="total-row paid"><span>Amount Paid:</span><span>${escapeHtml(formatCurrency(amountPaid))}</span></div>`
          : ''
      }
      ${
        showBalanceDue
          ? `<div class="total-row balance"><span>Balance Due:</span><span>${escapeHtml(formatCurrency(balance))}</span></div>`
          : ''
      }
    </div>

    ${
      paymentDetailsEnabled && paymentDetails
        ? `<div class="notes-section">
            <div class="pay-to-block">
              <div class="pay-to-title">Pay to</div>
              <div class="notes-content">${escapeHtml(paymentDetails)}</div>
            </div>
          </div>`
        : ''
    }

    <div class="notes-section">
      <div class="notes-title">Terms &amp; Conditions:</div>
      <div class="notes-content">${escapeHtml(resolvePrintedInvoiceTerms(invoice))}</div>
    </div>

    ${renderGraStamp(invoice)}

    ${footerNote ? `<div class="notes-section"><div class="notes-content">${escapeHtml(footerNote)}</div></div>` : ''}

    <div class="footer">${escapeHtml(invoiceFooter)}</div>
  </div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${PRINTABLE_INVOICE_CSS}</style>
    <title>${escapeHtml(`Invoice ${number}`)}</title>
  </head>
  <body>${body}</body>
</html>`;
}
