import React from 'react';
import dayjs from 'dayjs';
import { MapPin, Phone, Globe, Mail } from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { getInvoiceTaxDisplay } from '../utils/invoiceTaxDisplay';
import { formatLineItemQuantity } from '../utils/documentLineItems';
import GraEvatStampBlock from './GraEvatStampBlock';

const DEFAULT_TERMS_TEXT =
  'Payment is due within the specified payment terms. Late payments may incur additional charges.';
const DEFAULT_THANK_YOU = 'Thank you for doing business with us.';

const formatAddress = (address) => {
  if (!address) return '';
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country
  ].filter(Boolean);
  return parts.join('\n');
};

const getPrintStyles = (printConfig) => {
  const format = printConfig?.format || 'a4';
  const isThermal = format === 'thermal_58' || format === 'thermal_80';
  const pageWidth = format === 'thermal_58' ? '58mm' : format === 'thermal_80' ? '80mm' : 'A4';
  const contentWidth = format === 'thermal_58' ? '52mm' : format === 'thermal_80' ? '72mm' : '210mm';
  const showLogo = printConfig?.showLogo !== false && !isThermal;
  const fontSize = isThermal ? 'small' : (printConfig?.fontSize || 'normal');
  const titleSize = fontSize === 'small' ? '14px' : '32px';
  const bodySize = fontSize === 'small' ? '10px' : '12px';
  const tableSize = fontSize === 'small' ? '9px' : '11px';
  const grayscale = isThermal ? 'filter: grayscale(100%); -webkit-print-color-adjust: none; print-color-adjust: none;' : '';
  return { isThermal, showLogo, titleSize, bodySize, tableSize, grayscale, pageWidth, contentWidth, fontSize };
};

const getItemProductCode = (item) => {
  const alias = item?.metadata?.productCode
    || item?.productCode
    || item?.code
    || item?.metadata?.barcode
    || item?.barcode
    || item?.sku
    || item?.metadata?.sku
    || item?.product?.productCode
    || item?.variant?.productCode
    || item?.variant?.barcode
    || item?.product?.barcode
    || item?.variant?.sku
    || item?.product?.sku
    || item?.product?.barcodeAliases?.[0]
    || item?.variant?.barcodeAliases?.[0]
    || item?.product?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode
    || item?.variant?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode;

  return String(alias || '').trim();
};

const PrintableInvoice = ({
  invoice,
  documentTitle = 'INVOICE',
  documentSubtitle,
  organization = {},
  /** When printing receipt from sale, pass saleNumber for Receipt # display */
  saleNumber,
  printConfig = {},
  /** When true, show XXX instead of monetary values (e.g. for sample/preview) */
  maskAmounts = false,
  /** 'mobile' enables phone-style card layout on screen (print/PDF stays document layout). */
  screenLayout = 'auto',
  /** Retail/shop types show product codes on line items; studio-like types hide them. */
  showProductCode = true,
  /** Hide Balance Due (e.g. quotations are not invoices). Default true for real invoices. */
  showBalanceDue = true,
  /** Hide Job Details column (e.g. product/proforma quotes without a linked job). */
  showJobDetails = true,
}) => {
  if (!invoice) return null;

  const titleText = documentTitle || 'INVOICE';
  const printStyles = getPrintStyles(printConfig);
  const useMobileScreenLayout =
    screenLayout === 'mobile' || printConfig?.screenLayout === 'mobile';
  const isReceipt = titleText.toUpperCase() === 'RECEIPT';
  const docNumberLabel = isReceipt ? 'Receipt #' : 'Invoice #';
  const docNumber = isReceipt && (saleNumber || invoice.sale?.saleNumber)
    ? (saleNumber || invoice.sale.saleNumber)
    : invoice.invoiceNumber;

  const amountDisplay = (value) => (maskAmounts ? 'XXX' : `₵ ${parseFloat(value || 0).toFixed(2)}`);

  // Format logo URL - data URLs (base64) and absolute URLs use as-is; relative paths get API base URL
  // Only use tenant logo; no generic fallback when none is set
  const logoSource = organization?.logoUrl
    ? (organization.logoUrl.startsWith('data:') || organization.logoUrl.startsWith('http')
        ? organization.logoUrl
        : (API_BASE_URL
            ? `${API_BASE_URL}${organization.logoUrl.startsWith('/') ? '' : '/'}${organization.logoUrl}`
            : organization.logoUrl))
    : null;

  const companyInfo = {
    name: organization.name || 'Company name',
    phone: organization.phone || '',
    website: organization.website || '',
    email: organization.email || '',
    location: formatAddress(organization.address),
    invoiceFooter: organization.invoiceFooter || '',
    paymentDetails: organization.paymentDetails || '',
    paymentDetailsEnabled: organization.paymentDetailsEnabled === true,
    vatNumber: organization.tax?.vatNumber || '',
    tin: organization.tax?.tin || '',
    ghanaCardPin: organization.tax?.ghanaCardPin || '',
    taxDisplayLabel: organization.tax?.displayLabel || 'Tax'
  };
  const graStamp = invoice?.metadata?.graStamp || invoice?.sale?.metadata?.graStamp || null;
  const taxDisplay = getInvoiceTaxDisplay(invoice, organization);
  const taxLabel = taxDisplay.isTaxInclusive
    ? taxDisplay.taxLabel
    : `${companyInfo.taxDisplayLabel} (${invoice.taxRate || 0}%)`;
  const subtotalLabel = taxDisplay.isTaxInclusive ? 'Subtotal (net)' : 'Subtotal';

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${printStyles.pageWidth} auto;
            margin: ${printStyles.isThermal ? '2mm' : '10mm'};
          }
          
          .printable-invoice {
            width: 100% !important;
            max-width: ${printStyles.contentWidth} !important;
            padding: ${printStyles.isThermal ? '2mm' : '0'} !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
            ${printStyles.grayscale}
            -webkit-print-color-adjust: ${printStyles.isThermal ? 'none' : 'exact'} !important;
            print-color-adjust: ${printStyles.isThermal ? 'none' : 'exact'} !important;
          }
          
          .invoice-header {
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .items-table {
            page-break-inside: avoid;
          }
          .items-table thead {
            display: table-header-group;
          }
          .items-table tbody tr {
            page-break-inside: avoid;
          }
          .totals-section {
            page-break-inside: avoid;
          }
          .notes-section {
            page-break-inside: avoid;
          }
        }
        
        /* Screen styles */
        .printable-invoice {
          width: 100%;
          max-width: ${printStyles.contentWidth};
          padding: ${printStyles.isThermal ? '4mm' : '15mm'};
          margin: 0 auto;
          background: white;
          font-family: Helvetica, Arial, sans-serif;
          color: #000;
          box-sizing: border-box;
          ${printStyles.grayscale}
        }
        
        /* Ensure content stays together */
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
        .company-info {
          flex: 1;
          min-width: 0;
        }
        .company-logo {
          max-width: 140px;
          max-height: 72px;
          margin-bottom: 10px;
          object-fit: contain;
          object-position: left center;
          ${!printStyles.showLogo ? 'display: none !important;' : ''}
        }
        .company-name-placeholder {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #111827;
        }
        .company-details {
          font-size: ${printStyles.bodySize};
          line-height: 1.55;
          color: #374151;
        }
        .company-details-line {
          margin-bottom: 2px;
        }
        .company-tax-line {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
        }
        .invoice-info {
          text-align: right;
          flex-shrink: 0;
          min-width: 200px;
        }
        .invoice-title {
          font-size: ${printStyles.titleSize};
          font-weight: 700;
          margin-bottom: 12px;
          color: #111827;
          letter-spacing: 0.08em;
          line-height: 1.1;
        }
        .invoice-subtitle {
          font-size: ${printStyles.fontSize === 'small' ? '10px' : '12px'};
          color: #6b7280;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .invoice-meta-row {
          font-size: ${printStyles.bodySize};
          margin-bottom: 4px;
          color: #111827;
        }
        .invoice-meta-row strong {
          font-weight: 700;
        }
        .invoice-parties {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          margin: 0 0 22px;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
        }
        .billing-section {
          padding: 14px 18px 14px 0;
        }
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
        .billing-info strong {
          font-weight: 700;
          color: #111827;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 18px;
          font-size: ${printStyles.tableSize};
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
          font-size: ${printStyles.tableSize};
          color: #111827;
          vertical-align: top;
        }
        .items-table tbody tr {
          background-color: #fff;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
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
          font-size: ${printStyles.bodySize};
          color: #111827;
        }
        .total-row.bold {
          font-weight: 700;
          font-size: ${printStyles.fontSize === 'small' ? '12px' : '13px'};
          border-top: 1px solid #d1d5db;
          padding-top: 8px;
          margin-top: 4px;
        }
        .total-row.paid span:last-child {
          color: #16a34a;
          font-weight: 600;
        }
        .total-row.balance {
          font-weight: 700;
          font-size: ${printStyles.fontSize === 'small' ? '13px' : '14px'};
          padding-top: 6px;
          margin-top: 2px;
          color: #dc2626;
        }
        .total-row.balance span {
          color: #dc2626;
        }
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
          font-size: ${printStyles.bodySize};
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
          padding-top: 0;
          border-top: none;
          text-align: center;
          font-size: 11px;
          color: #9ca3af;
          white-space: pre-line;
        }
        
        /* Thermal receipt layout */
        .thermal-receipt {
          text-align: center;
          max-width: ${printStyles.contentWidth};
          margin: 0 auto;
          padding: ${printStyles.isThermal ? '2mm' : '0'};
          font-family: Helvetica, Arial, sans-serif;
          font-size: 10px;
          color: #000;
        }
        .thermal-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 4px;
          letter-spacing: 1px;
        }
        .thermal-business {
          font-size: 9px;
          line-height: 1.4;
          margin-bottom: 6px;
          color: #000;
        }
        .thermal-separator {
          border: none;
          border-top: 1px dotted #000;
          margin: 6px 0;
        }
        .thermal-date-row {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          margin-bottom: 6px;
        }
        .thermal-items {
          text-align: left;
          margin: 8px 0;
          list-style: none;
          padding: 0;
        }
        .thermal-item-list {
          font-size: 9px;
          padding: 4px 0;
          border-bottom: none;
        }
        .thermal-item-name {
          display: block;
          margin-bottom: 2px;
        }
        .thermal-item-amount {
          display: block;
          font-weight: 500;
          padding-left: 8px;
        }
        .thermal-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          padding: 3px 0;
        }
        .thermal-total-row.bold {
          font-weight: bold;
          font-size: 11px;
          border-top: 1px dotted #000;
          padding-top: 6px;
          margin-top: 4px;
        }
        .thermal-thanks {
          font-size: 12px;
          font-weight: bold;
          margin-top: 10px;
          letter-spacing: 2px;
        }

        .company-details-line--mobile {
          display: none;
        }

        @media screen and (max-width: 639px) {
          .printable-invoice:not(.thermal-mode) {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box;
          }

          .print-invoice-preview .printable-invoice:not(.thermal-mode),
          .print-invoice-preview-inner {
            width: 100%;
            max-width: 100%;
          }

          .printable-invoice.invoice-layout-mobile:not(.thermal-mode),
          .pay-invoice-document .printable-invoice:not(.thermal-mode),
          .print-invoice-preview .printable-invoice:not(.thermal-mode) {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 0;
            background: transparent;
            max-width: 100%;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-header,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-header,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .invoice-header {
            flex-direction: column;
            gap: 14px;
            margin-bottom: 10px;
            padding: 14px;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-info,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-info,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .invoice-info {
            text-align: left;
            min-width: 0;
            width: 100%;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-title,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-title,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .invoice-title {
            font-size: 1.75rem;
            margin-bottom: 10px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-logo,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-logo,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .company-logo {
            max-width: 120px;
            max-height: 56px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-details-line--desktop,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-details-line--desktop,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .company-details-line--desktop {
            display: none;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-details-line--mobile,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-details-line--mobile,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .company-details-line--mobile {
            display: flex;
            align-items: flex-start;
            gap: 8px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-detail-icon,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-detail-icon,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .company-detail-icon {
            flex-shrink: 0;
            width: 14px;
            height: 14px;
            margin-top: 2px;
            color: #6b7280;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-parties,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-parties,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .invoice-parties {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 10px;
            border: none;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .billing-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .billing-section,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .billing-section {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px !important;
            min-height: 100%;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .billing-section + .billing-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .billing-section + .billing-section,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .billing-section + .billing-section {
            border-left: none;
            padding-left: 12px !important;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-table-card,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-table-card,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .invoice-table-card {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 10px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .items-table,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .items-table,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .items-table {
            margin: 0;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .items-table th,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .items-table td,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .items-table th,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .items-table td,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .items-table th,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .items-table td {
            padding: 8px 6px;
            font-size: 10px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .totals-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .totals-section,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .totals-section {
            width: 100%;
            margin-left: 0;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px 14px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .total-row,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .total-row,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .total-row {
            padding: 8px 0;
            border-bottom: 1px solid #f3f4f6;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .total-row:last-child,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .total-row:last-child,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .total-row:last-child {
            border-bottom: none;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .total-row.bold,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .total-row.bold,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .total-row.bold {
            border-top: 1px solid #e5e7eb;
            margin-top: 4px;
            padding-top: 10px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .notes-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .notes-section,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .notes-section {
            margin-top: 10px;
            padding: 12px 14px;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .footer,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .footer,
          .print-invoice-preview .printable-invoice:not(.thermal-mode) .footer {
            margin-top: 16px;
            padding-bottom: 8px;
          }
        }

        @media print {
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-header,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-header {
            flex-direction: row !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 0 14px !important;
            background: #fff !important;
          }
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-info,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-info {
            text-align: right !important;
            border-top: none !important;
            padding-top: 0 !important;
          }
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .billing-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .invoice-table-card,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .totals-section,
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .notes-section,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .billing-section,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .invoice-table-card,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .totals-section,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .notes-section {
            border: none !important;
            border-radius: 0 !important;
            background: #fff !important;
          }
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-details-line--desktop,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-details-line--desktop {
            display: block !important;
          }
          .pay-invoice-document .printable-invoice:not(.thermal-mode) .company-details-line--mobile,
          .printable-invoice.invoice-layout-mobile:not(.thermal-mode) .company-details-line--mobile {
            display: none !important;
          }
        }
      `}</style>

      <div
        className={`printable-invoice ${printStyles.isThermal ? 'thermal-mode' : ''} ${
          useMobileScreenLayout ? 'invoice-layout-mobile' : ''
        }`}
      >
        {printStyles.isThermal ? (
          /* Thermal receipt layout - simplified CASH RECEIPT style */
          <div className="thermal-receipt">
            <div className="thermal-title">CASH RECEIPT</div>
            <div className="thermal-business">
              <div style={{ fontWeight: 600 }}>{companyInfo.name}</div>
              {companyInfo.location && <div>Address: {companyInfo.location.replace(/\n/g, ', ')}</div>}
              {companyInfo.phone && <div>Tel: {companyInfo.phone}</div>}
              {companyInfo.vatNumber && <div>VAT: {companyInfo.vatNumber}</div>}
              {companyInfo.tin && <div>TIN: {companyInfo.tin}</div>}
              {companyInfo.ghanaCardPin && <div>Ghana Card PIN: {companyInfo.ghanaCardPin}</div>}
            </div>
            <hr className="thermal-separator" />
            <div className="thermal-date-row">
              <span>Date: {dayjs(invoice.invoiceDate).format('DD-MM-YYYY')}</span>
              <span>{dayjs(invoice.invoiceDate).format('HH:mm')}</span>
            </div>
            <hr className="thermal-separator" />
            <div className="thermal-items">
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, index) => {
                  const qty = item.quantity || 1;
                  const total = maskAmounts ? 'XXX' : parseFloat(item.total || item.unitPrice * qty || 0).toFixed(2);
                  const unitPrice = maskAmounts ? 'XXX' : parseFloat(item.unitPrice || 0).toFixed(2);
                  const productCode = getItemProductCode(item);
                  return (
                    <div key={index} className="thermal-item-list">
                      <span className="thermal-item-name">{item.description || item.category || 'Item'}</span>
                      {productCode && showProductCode && <span className="thermal-item-name">Product Code: {productCode}</span>}
                      <span className="thermal-item-amount">{formatLineItemQuantity(item, qty)} × ₵ {unitPrice} = ₵ {total}</span>
                    </div>
                  );
                })
              ) : (
                <div className="thermal-item-list">
                  <span className="thermal-item-name">No items</span>
                  <span className="thermal-item-amount">{amountDisplay(0)}</span>
                </div>
              )}
            </div>
            <hr className="thermal-separator" />
            <div className="thermal-total-row">
              <span>{subtotalLabel}</span>
              <span>{amountDisplay(taxDisplay.subtotal)}</span>
            </div>
            {taxDisplay.discountAmount > 0 && (
              <div className="thermal-total-row">
                <span>Discount</span>
                <span>{maskAmounts ? 'XXX' : `-₵ ${parseFloat(taxDisplay.discountAmount || 0).toFixed(2)}`}</span>
              </div>
            )}
            {taxDisplay.hasTax && (
              <div className="thermal-total-row">
                <span>{taxLabel}</span>
                <span>{amountDisplay(taxDisplay.taxAmount)}</span>
              </div>
            )}
            <div className="thermal-total-row bold">
              <span>Total</span>
              <span>{amountDisplay(invoice.totalAmount)}</span>
            </div>
            {graStamp?.irn && (
              <>
                <hr className="thermal-separator" />
                <GraEvatStampBlock stamp={graStamp} compact />
              </>
            )}
            <hr className="thermal-separator" />
            {(companyInfo.invoiceFooter || companyInfo.name) && (
              <div className="thermal-thanks text-center" style={{ whiteSpace: 'pre-line' }}>
                {companyInfo.invoiceFooter || companyInfo.name}
              </div>
            )}
            <div className="thermal-business-footer" style={{ fontSize: '9px', marginTop: '8px', lineHeight: 1.4 }}>
              {companyInfo.name}
              {companyInfo.phone && ` | ${companyInfo.phone}`}
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="invoice-header">
          <div className="company-info">
            {logoSource ? (
              <img src={logoSource} alt={companyInfo.name} className="company-logo" />
            ) : companyInfo.name ? (
              <div className="company-name-placeholder">{companyInfo.name}</div>
            ) : null}
            <div className="company-details">
              {companyInfo.location && (
                <>
                  <div className="company-details-line company-details-line--desktop" style={{ whiteSpace: 'pre-line' }}>
                    {companyInfo.location}
                  </div>
                  <div className="company-details-line company-details-line--mobile">
                    <MapPin className="company-detail-icon" aria-hidden />
                    <span style={{ whiteSpace: 'pre-line' }}>{companyInfo.location}</span>
                  </div>
                </>
              )}
              {companyInfo.phone && (
                <>
                  <div className="company-details-line company-details-line--desktop">Phone: {companyInfo.phone}</div>
                  <div className="company-details-line company-details-line--mobile">
                    <Phone className="company-detail-icon" aria-hidden />
                    <span>{companyInfo.phone}</span>
                  </div>
                </>
              )}
              {companyInfo.website && (
                <>
                  <div className="company-details-line company-details-line--desktop">Website: {companyInfo.website}</div>
                  <div className="company-details-line company-details-line--mobile">
                    <Globe className="company-detail-icon" aria-hidden />
                    <span>{companyInfo.website}</span>
                  </div>
                </>
              )}
              {companyInfo.email && (
                <>
                  <div className="company-details-line company-details-line--desktop">Email: {companyInfo.email}</div>
                  <div className="company-details-line company-details-line--mobile">
                    <Mail className="company-detail-icon" aria-hidden />
                    <span>{companyInfo.email}</span>
                  </div>
                </>
              )}
              {(companyInfo.vatNumber || companyInfo.tin || companyInfo.ghanaCardPin) && (
                <div className="company-tax-line">
                  {companyInfo.vatNumber && <div>VAT: {companyInfo.vatNumber}</div>}
                  {companyInfo.tin && <div>TIN: {companyInfo.tin}</div>}
                  {companyInfo.ghanaCardPin && <div>Ghana Card PIN: {companyInfo.ghanaCardPin}</div>}
                </div>
              )}
            </div>
          </div>
          <div className="invoice-info">
            <div className="invoice-title">{titleText}</div>
            {documentSubtitle && (
              <div className="invoice-subtitle">{documentSubtitle}</div>
            )}
            <div className="invoice-meta-row">
              <strong>{docNumberLabel}</strong> {docNumber}
            </div>
            <div className="invoice-meta-row">
              <strong>Date:</strong> {dayjs(invoice.invoiceDate).format('MMMM D, YYYY')}
            </div>
            {invoice.dueDate && (
              <div className="invoice-meta-row">
                <strong>Due Date:</strong> {dayjs(invoice.dueDate).format('MMMM D, YYYY')}
              </div>
            )}
            {invoice.paymentTerms && (
              <div className="invoice-meta-row">
                <strong>Terms:</strong> {invoice.paymentTerms}
              </div>
            )}
          </div>
        </div>

        {/* Bill To / Job Details */}
        <div className="invoice-parties">
          <div className="billing-section">
            <div className="section-title">Bill To:</div>
            <div className="billing-info">
              <div><strong>{invoice.customer?.name || 'N/A'}</strong></div>
              {invoice.customer?.company && (
                <div>{invoice.customer.company}</div>
              )}
              {invoice.customer?.address && (
                <div>{invoice.customer.address}</div>
              )}
              {(invoice.customer?.city || invoice.customer?.state || invoice.customer?.zipCode) && (
                <div>
                  {[invoice.customer.city, invoice.customer.state, invoice.customer.zipCode]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
              {invoice.customer?.email && <div>{invoice.customer.email}</div>}
              {invoice.customer?.phone && <div>{invoice.customer.phone}</div>}
            </div>
          </div>
          {showJobDetails && (
          <div className="billing-section">
            <div className="section-title">Job Details:</div>
            <div className="billing-info">
              {invoice.job?.jobNumber && (
                <div>
                  <strong>Job #:</strong> {invoice.job.jobNumber}
                </div>
              )}
              {invoice.job?.title && <div>{invoice.job.title}</div>}
              {invoice.paymentTerms && (
                <div>
                  {invoice.paymentTerms}
                  {String(invoice.paymentTerms).toLowerCase().includes('term') ? '' : ' Terms'}
                </div>
              )}
              {!invoice.job?.jobNumber && !invoice.paymentTerms && <div>—</div>}
            </div>
          </div>
          )}
        </div>

        {/* Items: list for receipts, table for invoices */}
        {isReceipt ? (
          <div className="receipt-items-list" style={{ margin: '16px 0' }}>
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item, index) => {
                const qty = item.quantity || 1;
                const total = maskAmounts ? 'XXX' : parseFloat(item.total || item.unitPrice * qty || 0).toFixed(2);
                const unitPrice = maskAmounts ? 'XXX' : parseFloat(item.unitPrice || 0).toFixed(2);
                const productCode = getItemProductCode(item);
                return (
                  <div key={index} className="receipt-item-row" style={{ display: 'block', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>{item.description || item.category || 'Item'}</div>
                    <div style={{ fontSize: '11px', color: '#555' }}>{formatLineItemQuantity(item, qty)} × ₵ {unitPrice} = ₵ {total}</div>
                    {productCode && showProductCode && <div style={{ fontSize: '11px', color: '#555' }}>Product Code: {productCode}</div>}
                  </div>
                );
              })
            ) : (
              <div className="receipt-item-row" style={{ padding: '6px 0', fontSize: '12px' }}>No items</div>
            )}
          </div>
        ) : (
          <div className="invoice-table-card">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '48%' }}>Description</th>
                <th style={{ width: showProductCode ? '16%' : '0%', display: showProductCode ? undefined : 'none' }}>Product Code</th>
                <th className="text-center" style={{ width: '14%' }}>QTY</th>
                <th className="text-right" style={{ width: '11%' }}>Unit Price</th>
                <th className="text-right" style={{ width: '11%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, index) => {
                  const productCode = getItemProductCode(item);
                  return (
                    <tr key={index}>
                      <td>
                        <div>{item.description || item.category || 'Item'}</div>
                        {item.paperSize && (
                          <div style={{ fontSize: '10px', color: '#666' }}>
                            Size: {item.paperSize}
                          </div>
                        )}
                      </td>
                      {showProductCode ? (
                        <td>{productCode || '-'}</td>
                      ) : null}
                      <td className="text-center">{formatLineItemQuantity(item)}</td>
                      <td className="text-right">{amountDisplay(item.unitPrice)}</td>
                      <td className="text-right">
                        <strong>{amountDisplay(item.total || item.unitPrice * (item.quantity || 1))}</strong>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={showProductCode ? 5 : 4} className="text-center">No items</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}

        {/* Totals */}
        <div className="totals-section">
          <div className="total-row">
            <span>{subtotalLabel}:</span>
            <span>{amountDisplay(taxDisplay.subtotal)}</span>
          </div>
          {taxDisplay.discountAmount > 0 && (
            <div className="total-row" style={{ color: '#52c41a', fontWeight: '500' }}>
              <span>
                Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}
                {invoice.discountReason && (
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: 'normal', marginTop: '2px' }}>
                    {invoice.discountReason}
                  </div>
                )}
              </span>
              <span>{maskAmounts ? 'XXX' : `-₵ ${parseFloat(taxDisplay.discountAmount || 0).toFixed(2)}`}</span>
            </div>
          )}
          {taxDisplay.hasTax && (
            <div className="total-row">
              <span>
                {taxLabel}:
              </span>
              <span>{amountDisplay(taxDisplay.taxAmount)}</span>
            </div>
          )}
          <div className="total-row bold">
            <span>Total Amount:</span>
            <span>{amountDisplay(invoice.totalAmount)}</span>
          </div>
          {(invoice.amountPaid > 0 || Number(invoice.balance) < Number(invoice.totalAmount)) && (
            <div className="total-row paid">
              <span>Amount Paid:</span>
              <span>{amountDisplay(invoice.amountPaid)}</span>
            </div>
          )}
          {showBalanceDue && (
            <div className={`total-row ${isReceipt && invoice.balance <= 0 ? '' : 'balance'}`}>
              <span>{isReceipt && invoice.balance <= 0 ? 'Status:' : 'Balance Due:'}</span>
              <span style={isReceipt && invoice.balance <= 0 ? { color: '#52c41a' } : undefined}>
                {isReceipt && invoice.balance <= 0 ? 'Paid' : amountDisplay(invoice.balance)}
              </span>
            </div>
          )}
        </div>

        {/* Pay to (payment details) */}
        {companyInfo.paymentDetailsEnabled && companyInfo.paymentDetails && (
          <div className="notes-section">
            <div className="pay-to-block">
              <div className="pay-to-title">Pay to</div>
              <div className="notes-content">
                {companyInfo.paymentDetails}
              </div>
            </div>
          </div>
        )}

        {/* Terms & Conditions */}
        {!isReceipt && (
          <div className="notes-section">
            <div className="notes-title">Terms &amp; Conditions:</div>
            <div className="notes-content">
              {invoice.termsAndConditions || DEFAULT_TERMS_TEXT}
            </div>
          </div>
        )}

        <GraEvatStampBlock stamp={graStamp} className="notes-section" />

        {/* Footer */}
        {!isReceipt && (
          <div className="footer">
            {companyInfo.invoiceFooter || DEFAULT_THANK_YOU}
          </div>
        )}
          </>
        )}
      </div>

    </>
  );
};

export default PrintableInvoice;

