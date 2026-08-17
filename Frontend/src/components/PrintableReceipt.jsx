import React from 'react';
import dayjs from 'dayjs';
import { MapPin, Phone, Globe, Mail } from 'lucide-react';
import { APP_LOGO_SRC } from '../config/appBrand';
import { API_BASE_URL } from '../services/api';
import { getSalePartyDetails } from '../utils/saleParty';
import GraEvatStampBlock from './GraEvatStampBlock';

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
    || item?.product?.productCode
    || item?.variant?.productCode
    || item?.product?.barcodeAliases?.[0]
    || item?.variant?.barcodeAliases?.[0]
    || item?.product?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode
    || item?.variant?.barcodes?.find?.((barcode) => barcode?.isActive !== false)?.barcode;

  return String(alias || '').trim();
};

const getItemVariantLabel = (item) => {
  const variant = item?.variant;
  if (!variant) return '';
  const attributeText = Object.values(variant.attributes || {})
    .filter(Boolean)
    .join(' / ');
  return variant.name || attributeText || variant.sku || '';
};

const getItemCatalogUnitPrice = (item) => {
  const value = item?.metadata?.catalogUnitPrice
    ?? item?.metadata?.originalUnitPrice
    ?? item?.catalogUnitPrice
    ?? item?.originalUnitPrice
    ?? null;
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
};

const isItemPriceOverridden = (item) => item?.metadata?.priceOverridden === true || item?.priceOverridden === true;

const PrintableReceipt = ({
  sale,
  documentTitle = 'RECEIPT',
  documentSubtitle,
  organization = {},
  printConfig = {}
}) => {
  if (!sale) return null;

  const titleText = documentTitle || 'RECEIPT';
  const printStyles = getPrintStyles(printConfig);
  const party = getSalePartyDetails(sale);

  // Format logo URL - handle relative paths by prepending API base URL
  const logoSource = organization?.logoUrl
    ? (organization.logoUrl.startsWith('data:') || organization.logoUrl.startsWith('http')
        ? organization.logoUrl
        : (API_BASE_URL
            ? `${API_BASE_URL}${organization.logoUrl.startsWith('/') ? '' : '/'}${organization.logoUrl}`
            : organization.logoUrl))
    : APP_LOGO_SRC;

  const companyInfo = {
    name: organization.name || 'Company Name',
    phone: organization.phone || '',
    website: organization.website || '',
    email: organization.email || '',
    location: formatAddress(organization.address),
    vatNumber: organization.tax?.vatNumber || '',
    tin: organization.tax?.tin || '',
    ghanaCardPin: organization.tax?.ghanaCardPin || ''
  };
  const graStamp = sale?.metadata?.graStamp || null;

  const paymentMethodLabels = {
    cash: 'Cash',
    card: 'Card',
    mobile_money: 'Mobile Money',
    bank_transfer: 'Bank Transfer',
    credit: 'Credit',
    other: 'Other'
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${printStyles.pageWidth} auto;
            margin: ${printStyles.isThermal ? '2mm' : '10mm'};
          }
          
          .printable-receipt {
            width: 100% !important;
            max-width: ${printStyles.contentWidth} !important;
            padding: ${printStyles.isThermal ? '2mm' : '0'} !important;
            margin: 0 !important;
            background: white !important;
            color: #000 !important;
            box-shadow: none !important;
            ${printStyles.grayscale}
            -webkit-print-color-adjust: ${printStyles.isThermal ? 'none' : 'exact'} !important;
            print-color-adjust: ${printStyles.isThermal ? 'none' : 'exact'} !important;
          }
          
          .receipt-header {
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
        .printable-receipt {
          width: 100%;
          max-width: ${printStyles.contentWidth};
          padding: ${printStyles.isThermal ? '4mm' : '15mm'};
          margin: 0 auto;
          font-family: Arial, sans-serif;
          background: var(--receipt-bg);
          color: var(--receipt-fg);
          box-sizing: border-box;
          ${printStyles.grayscale}
          overflow-x: hidden;
        }
        @media (max-width: 640px) {
          .printable-receipt {
            padding: ${printStyles.isThermal ? '4mm' : '12px'};
            max-width: 100%;
          }
        }
        
        /* Ensure content stays together */
        .receipt-header,
        .billing-section,
        .items-table,
        .totals-section,
        .notes-section,
        .footer {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .receipt-header {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid var(--receipt-border);
        }
        @media (min-width: 640px) {
          .receipt-header {
            flex-direction: row;
            justify-content: space-between;
          }
        }
        .company-info {
          flex: 1;
        }
        .company-logo {
          max-width: 200px;
          max-height: 80px;
          margin-bottom: 10px;
          object-fit: contain;
          ${!printStyles.showLogo ? 'display: none !important;' : ''}
        }
        @media (max-width: 640px) {
          .company-logo {
            max-width: 150px;
            max-height: 60px;
          }
        }
        .company-details {
          font-size: ${printStyles.bodySize};
          line-height: 1.6;
          color: var(--receipt-muted);
        }
        .company-details > div {
          word-break: break-word;
          overflow-wrap: break-word;
        }
        @media (max-width: 640px) {
          .company-details {
            font-size: ${printStyles.fontSize === 'small' ? '9px' : '11px'};
          }
          .company-details > div {
            font-size: ${printStyles.fontSize === 'small' ? '9px' : '11px'};
          }
        }
        .receipt-info {
          text-align: left;
          flex: 1;
        }
        @media (min-width: 640px) {
          .receipt-info {
            text-align: right;
          }
        }
        .receipt-title {
          font-size: ${printStyles.titleSize};
          font-weight: bold;
          margin-bottom: 6px;
          color: var(--receipt-fg);
          letter-spacing: 2px;
        }
        .receipt-subtitle {
          font-size: ${printStyles.fontSize === 'small' ? '10px' : '14px'};
          color: var(--receipt-muted);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .receipt-number {
          font-size: ${printStyles.bodySize};
          margin-bottom: 5px;
          word-break: break-word;
        }
        .receipt-label-value-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .receipt-label-value-row span:last-child {
          text-align: right;
        }
        @media (max-width: 640px) {
          .receipt-number {
            font-size: ${printStyles.fontSize === 'small' ? '9px' : '11px'};
          }
        }
        .receipt-details {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin: 20px 0;
        }
        @media (min-width: 640px) {
          .receipt-details {
            grid-template-columns: 1fr 1fr;
          }
        }
        .billing-section {
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 10px;
          text-transform: uppercase;
          color: var(--receipt-fg);
        }
        .billing-info {
          font-size: 12px;
          line-height: 1.8;
          word-break: break-word;
        }
        @media (max-width: 640px) {
          .billing-info {
            font-size: 11px;
            line-height: 1.6;
          }
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: ${printStyles.isThermal ? '8px 0' : '30px 0'};
          font-size: ${printStyles.tableSize};
          table-layout: auto;
          word-wrap: break-word;
        }
        @media (max-width: 640px) {
          .items-table {
            font-size: ${printStyles.fontSize === 'small' ? '8px' : '10px'};
            margin: ${printStyles.isThermal ? '8px 0' : '20px 0'};
          }
          .items-table th,
          .items-table td {
            padding: 4px;
            word-break: break-word;
          }
        }
        .items-table th {
          background-color: var(--receipt-muted-bg);
          padding: ${printStyles.isThermal ? '4px' : '8px'};
          text-align: left;
          font-weight: bold;
          font-size: ${printStyles.tableSize};
          border: 1px solid var(--receipt-border);
        }
        .items-table td {
          padding: ${printStyles.isThermal ? '3px 4px' : '6px 8px'};
          border: 1px solid var(--receipt-border);
          font-size: ${printStyles.tableSize};
        }
        .items-table tr:nth-child(even) {
          background-color: var(--receipt-muted-bg);
        }
        .receipt-items-list {
          margin: 16px 0;
          word-break: break-word;
        }
        @media (max-width: 640px) {
          .receipt-items-list {
            margin: 12px 0;
          }
        }
        .receipt-item-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: 4px 12px;
          padding: 6px 0;
          border-bottom: 1px solid var(--receipt-border);
          font-size: 12px;
          word-break: break-word;
        }
        .receipt-item-row .receipt-item-name {
          flex: 1;
          min-width: 0;
        }
        .receipt-item-row .receipt-item-price {
          text-align: right;
          font-weight: 500;
        }
        .receipt-item-row .receipt-item-detail {
          font-size: 11px;
          color: var(--receipt-muted);
          width: 100%;
        }
        @media (max-width: 640px) {
          .receipt-item-row {
            font-size: 11px;
            padding: 5px 0;
          }
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .totals-section {
          margin-top: 20px;
          margin-left: auto;
          width: 100%;
          max-width: 300px;
        }
        @media (max-width: 640px) {
          .totals-section {
            max-width: 100%;
            margin-left: 0;
          }
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: ${printStyles.isThermal ? '4px 0' : '8px 0'};
          font-size: ${printStyles.bodySize};
        }
        .total-row.bold {
          font-weight: bold;
          font-size: ${printStyles.fontSize === 'small' ? '11px' : '14px'};
          border-top: 2px solid var(--receipt-border);
          padding-top: 10px;
          margin-top: 10px;
        }
        .footer {
          margin-top: ${printStyles.isThermal ? '8px' : '20px'};
          padding-top: ${printStyles.isThermal ? '8px' : '15px'};
          border-top: 1px solid var(--receipt-border);
          text-align: center;
          font-size: ${printStyles.fontSize === 'small' ? '9px' : '10px'};
          color: var(--receipt-muted);
        }
        
        /* Thermal receipt layout */
        .thermal-receipt {
          text-align: center;
          max-width: ${printStyles.contentWidth};
          margin: 0 auto;
          padding: ${printStyles.isThermal ? '2mm' : '0'};
          font-family: Arial, sans-serif;
          font-size: 10px;
          color: var(--receipt-fg);
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
          color: var(--receipt-fg);
        }
        .thermal-separator {
          border: none;
          border-top: 1px dotted var(--receipt-border);
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
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          font-size: 9px;
          padding: 4px 0;
          border-bottom: none;
        }
        .thermal-item-name {
          flex: 1;
          min-width: 0;
        }
        .thermal-item-amount {
          font-weight: 500;
          text-align: right;
          flex-shrink: 0;
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
          border-top: 1px dotted var(--receipt-border);
          padding-top: 6px;
          margin-top: 4px;
        }
        .thermal-thanks {
          font-size: 12px;
          font-weight: bold;
          margin-top: 10px;
          letter-spacing: 2px;
        }
      `}</style>

      <div className={`printable-receipt ${printStyles.isThermal ? 'thermal-mode' : ''}`}>
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
              <span>Date: {dayjs(sale.createdAt).format('DD-MM-YYYY')}</span>
              <span>{dayjs(sale.createdAt).format('HH:mm')}</span>
            </div>
            <hr className="thermal-separator" />
            <div className="thermal-items">
              {sale.items && sale.items.length > 0 ? (
                sale.items.map((item, index) => {
                  const qty = item.quantity || 1;
                  const total = parseFloat(item.total || 0).toFixed(2);
                  const unitPrice = parseFloat(item.unitPrice || 0).toFixed(2);
                  const productCode = getItemProductCode(item);
                  const variantLabel = getItemVariantLabel(item);
                  const catalogUnitPrice = getItemCatalogUnitPrice(item);
                  const priceOverridden = isItemPriceOverridden(item) && catalogUnitPrice !== null;
                  return (
                    <div key={item.id || index} className="thermal-item-list">
                      <span className="thermal-item-name">{item.name || item.product?.name || 'Item'}</span>
                      {variantLabel && <span className="thermal-item-name">Variant: {variantLabel}</span>}
                      {productCode && <span className="thermal-item-name">Product Code: {productCode}</span>}
                      {priceOverridden && <span className="thermal-item-name">Catalog: ₵ {catalogUnitPrice.toFixed(2)}</span>}
                      <span className="thermal-item-amount">₵ {total}</span>
                    </div>
                  );
                })
              ) : (
                <div className="thermal-item-list">
                  <span className="thermal-item-name">No items</span>
                  <span className="thermal-item-amount">₵ 0.00</span>
                </div>
              )}
            </div>
            <hr className="thermal-separator" />
            <div className="thermal-total-row">
              <span>Sub-total</span>
              <span>₵ {parseFloat(sale.subtotal || 0).toFixed(2)}</span>
            </div>
            {parseFloat(sale.tax || 0) > 0 && (
              <div className="thermal-total-row">
                <span>Sales Tax</span>
                <span>₵ {parseFloat(sale.tax || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="thermal-total-row bold">
              <span>Total</span>
              <span>₵ {parseFloat(sale.total || 0).toFixed(2)}</span>
            </div>
            {graStamp?.irn && (
              <>
                <hr className="thermal-separator" />
                <GraEvatStampBlock stamp={graStamp} compact />
              </>
            )}
            <hr className="thermal-separator" />
            <div className="thermal-thanks text-center">THANK YOU</div>
            <div className="thermal-business-footer" style={{ fontSize: '9px', marginTop: '8px', lineHeight: 1.4 }}>
              {companyInfo.name}
              {companyInfo.phone && ` | ${companyInfo.phone}`}
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="receipt-header">
          <div className="company-info">
            <img src={logoSource} alt={companyInfo.name} className="company-logo" />
            <div className="company-details">
              {companyInfo.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <MapPin className="h-3.5 w-3.5" style={{ fontSize: '14px' }} />
                  <span style={{ whiteSpace: 'pre-line' }}>{companyInfo.location}</span>
                </div>
              )}
              {companyInfo.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Phone className="h-3.5 w-3.5" style={{ fontSize: '14px' }} />
                  <span>{companyInfo.phone}</span>
                </div>
              )}
              {companyInfo.website && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Globe className="h-3.5 w-3.5" style={{ fontSize: '14px' }} />
                  <span>{companyInfo.website}</span>
                </div>
              )}
              {companyInfo.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Mail className="h-3.5 w-3.5" style={{ fontSize: '14px' }} />
                  <span>{companyInfo.email}</span>
                </div>
              )}
              {(companyInfo.vatNumber || companyInfo.tin || companyInfo.ghanaCardPin) && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280' }}>
                  {companyInfo.vatNumber && <div>VAT: {companyInfo.vatNumber}</div>}
                  {companyInfo.tin && <div>TIN: {companyInfo.tin}</div>}
                  {companyInfo.ghanaCardPin && <div>Ghana Card PIN: {companyInfo.ghanaCardPin}</div>}
                </div>
              )}
            </div>
          </div>
          <div className="receipt-info">
            <div className="receipt-title">{titleText}</div>
            {documentSubtitle && (
              <div className="receipt-subtitle">{documentSubtitle}</div>
            )}
            <div className="receipt-number receipt-label-value-row">
              <span><strong>Receipt #:</strong></span>
              <span>{sale.saleNumber}</span>
            </div>
            <div className="receipt-number receipt-label-value-row">
              <span><strong>Date:</strong></span>
              <span>{dayjs(sale.createdAt).format('MMMM DD, YYYY')}</span>
            </div>
            <div className="receipt-number receipt-label-value-row">
              <span><strong>Time:</strong></span>
              <span>{dayjs(sale.createdAt).format('h:mm A')}</span>
            </div>
            <div className="receipt-number receipt-label-value-row">
              <span><strong>Payment Method:</strong></span>
              <span>{paymentMethodLabels[sale.paymentMethod] || sale.paymentMethod}</span>
            </div>
          </div>
        </div>

        {/* Customer / dealer details */}
        <div className="receipt-details">
          <div className="billing-section">
            <div className="section-title">{party.title}:</div>
            <div className="billing-info">
              <div><strong>{party.name}</strong></div>
              {party.company && (
                <div>{party.company}</div>
              )}
              {party.phone && (
                <div>Phone: {party.phone}</div>
              )}
              {party.email && (
                <div>Email: {party.email}</div>
              )}
            </div>
          </div>
          {sale.shop && (
            <div className="billing-section">
              <div className="section-title">Shop:</div>
              <div className="billing-info">
                <div><strong>{sale.shop.name}</strong></div>
                {sale.shop.address && (
                  <div>{sale.shop.address}</div>
                )}
                {sale.shop.phone && (
                  <div>Phone: {sale.shop.phone}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Items list (receipts use list, not table) */}
        <div className="receipt-items-list" style={{ margin: '16px 0' }}>
          {sale.items && sale.items.length > 0 ? (
            sale.items.map((item, index) => {
              const qty = item.quantity || 1;
              const total = parseFloat(item.total || 0).toFixed(2);
              const unitPrice = parseFloat(item.unitPrice || 0).toFixed(2);
              const productCode = getItemProductCode(item);
              const variantLabel = getItemVariantLabel(item);
              const catalogUnitPrice = getItemCatalogUnitPrice(item);
              const priceOverridden = isItemPriceOverridden(item) && catalogUnitPrice !== null;
              return (
                <div key={item.id || index} className="receipt-item-row">
                  <div className="receipt-item-name" style={{ fontWeight: 500 }}>{item.name || item.product?.name || 'Item'}</div>
                  <div className="receipt-item-price">₵ {total}</div>
                  <div className="receipt-item-detail">{qty} × ₵ {unitPrice}</div>
                  {priceOverridden && (
                    <div className="receipt-item-detail">Catalog price: ₵ {catalogUnitPrice.toFixed(2)}</div>
                  )}
                  {variantLabel && <div className="receipt-item-detail">Variant: {variantLabel}</div>}
                  {productCode && <div className="receipt-item-detail">Product Code: {productCode}</div>}
                </div>
              );
            })
          ) : (
            <div className="receipt-item-row">No items</div>
          )}
        </div>

        {/* Totals */}
        <div className="totals-section">
          <div className="total-row">
            <span>Subtotal:</span>
            <span>₵ {parseFloat(sale.subtotal || 0).toFixed(2)}</span>
          </div>
          {parseFloat(sale.discount || 0) > 0 && (
            <div className="total-row" style={{ color: '#52c41a', fontWeight: '500' }}>
              <span>Discount:</span>
              <span>-₵ {parseFloat(sale.discount || 0).toFixed(2)}</span>
            </div>
          )}
          {parseFloat(sale.tax || 0) > 0 && (
            <div className="total-row">
              <span>Tax:</span>
              <span>₵ {parseFloat(sale.tax || 0).toFixed(2)}</span>
            </div>
          )}
          <div className="total-row bold">
            <span>Total:</span>
            <span>₵ {parseFloat(sale.total || 0).toFixed(2)}</span>
          </div>
          {parseFloat(sale.amountPaid || 0) > 0 && (
            <div className="total-row">
              <span>Amount Paid:</span>
              <span style={{ color: '#52c41a' }}>₵ {parseFloat(sale.amountPaid || 0).toFixed(2)}</span>
            </div>
          )}
          {parseFloat(sale.change || 0) > 0 && (
            <div className="total-row">
              <span>Change:</span>
              <span style={{ color: '#52c41a' }}>₵ {parseFloat(sale.change || 0).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {sale.notes && (
          <div className="notes-section" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid var(--receipt-border)' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '8px' }}>Notes:</div>
            <div style={{ fontSize: '11px', lineHeight: '1.6', color: 'var(--receipt-muted)' }}>{sale.notes}</div>
          </div>
        )}

        <GraEvatStampBlock stamp={graStamp} />

        {/* Footer */}
        <div className="footer">
          <div>Thank you for your purchase!</div>
          <div style={{ marginTop: 5 }}>
            {companyInfo.name}
            {companyInfo.phone && ` | ${companyInfo.phone}`}
            {companyInfo.email && ` | ${companyInfo.email}`}
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
};

export default PrintableReceipt;
