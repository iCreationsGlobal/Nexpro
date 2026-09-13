import React from 'react';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../services/api';

const formatAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean);
  return parts.join('\n');
};

const money = (value) => `GH₵ ${parseFloat(value || 0).toFixed(2)}`;

const formatDamageType = (type) => String(type || 'other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatDamageSeverity = (severity) => String(severity || 'minor').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatLateChargeStatus = (status) => String(status || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Printable return inspection report (A4) with tenant branding.
 * @param {{ document: object }} props
 */
const PrintableRentalReturnInspection = ({ document }) => {
  if (!document?.rental) return null;

  const {
    rental,
    organization = {},
    returnInfo = {},
    lateChargesSummary = [],
    damageReports = [],
    financials = {},
    documentNumber,
    documentTitle,
    inspectedOn,
  } = document;

  const primaryColor = organization.primaryColor || '#166534';
  const customer = rental.customer || document.customer || {};

  const logoSource = organization?.logoUrl
    ? (organization.logoUrl.startsWith('data:') || organization.logoUrl.startsWith('http')
      ? organization.logoUrl
      : (API_BASE_URL
        ? `${API_BASE_URL}${organization.logoUrl.startsWith('/') ? '' : '/'}${organization.logoUrl}`
        : organization.logoUrl))
    : null;

  const companyInfo = {
    name: organization.name || 'Company Name',
    phone: organization.phone || '',
    email: organization.email || '',
    location: formatAddress(organization.address),
    invoiceFooter: organization.invoiceFooter || '',
  };

  const returnedAt = returnInfo.returnedAt || returnInfo.actualReturnDate;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-rental-return, .printable-rental-return * { visibility: visible; }
          .printable-rental-return {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          @page { size: A4; margin: 14mm 16mm; }
        }

        .printable-rental-return {
          width: 210mm;
          max-width: 100%;
          padding: 18mm 16mm;
          margin: 0 auto;
          background: #fff;
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #111827;
          box-sizing: border-box;
        }

        .prr-header {
          display: flex;
          justify-content: space-between;
          gap: 28px;
          padding-bottom: 20px;
          margin-bottom: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .prr-brand img {
          max-height: 56px;
          max-width: 200px;
          object-fit: contain;
        }

        .prr-company-name {
          font-size: 20px;
          font-weight: 650;
          color: ${primaryColor};
        }

        .prr-meta {
          text-align: right;
          font-size: 12px;
          color: #4b5563;
        }

        .prr-title {
          font-size: 22px;
          font-weight: 700;
          color: ${primaryColor};
          margin-bottom: 20px;
        }

        .prr-section {
          margin-bottom: 22px;
        }

        .prr-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          margin-bottom: 10px;
        }

        .prr-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 24px;
        }

        .prr-field-label {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 2px;
        }

        .prr-field-value {
          font-size: 13px;
          color: #111827;
        }

        .prr-notes {
          font-size: 12px;
          line-height: 1.6;
          color: #374151;
          white-space: pre-wrap;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 14px;
          background: #f9fafb;
          min-height: 60px;
        }

        .prr-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .prr-table th {
          text-align: left;
          padding: 10px 8px;
          border-bottom: 2px solid #e5e7eb;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
        }

        .prr-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: top;
        }

        .prr-table td.num,
        .prr-table th.num {
          text-align: right;
        }

        .prr-summary {
          margin-top: 16px;
          margin-left: auto;
          width: 300px;
          font-size: 12px;
        }

        .prr-summary-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .prr-summary-row.total {
          font-weight: 700;
          font-size: 14px;
          border-top: 2px solid #e5e7eb;
          border-bottom: none;
          padding-top: 10px;
        }

        .prr-empty {
          font-size: 12px;
          color: #6b7280;
          font-style: italic;
        }

        .prr-footer {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
        }

        .prr-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 36px;
        }

        .prr-signature-line {
          border-top: 1px solid #9ca3af;
          padding-top: 8px;
          font-size: 11px;
          color: #6b7280;
        }
      `}</style>

      <div className="printable-rental-return">
        <div className="prr-header">
          <div className="prr-brand">
            {logoSource ? (
              <img src={logoSource} alt={companyInfo.name} />
            ) : (
              <div className="prr-company-name">{companyInfo.name}</div>
            )}
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '8px', lineHeight: 1.5 }}>
              {companyInfo.location ? <div>{companyInfo.location}</div> : null}
              {companyInfo.phone ? <div>{companyInfo.phone}</div> : null}
            </div>
          </div>
          <div className="prr-meta">
            <div style={{ fontSize: '14px', fontWeight: 700, color: primaryColor, marginBottom: '8px' }}>
              {documentTitle || 'Return Inspection Report'}
            </div>
            <div><strong>Document #</strong> {documentNumber}</div>
            <div><strong>Inspection date</strong> {dayjs(inspectedOn || returnedAt).format('MMM DD, YYYY')}</div>
          </div>
        </div>

        <div className="prr-title">{documentTitle || 'Return Inspection Report'}</div>

        <div className="prr-section">
          <div className="prr-section-title">Rental &amp; customer</div>
          <div className="prr-grid">
            <div>
              <div className="prr-field-label">Customer</div>
              <div className="prr-field-value">{customer.name || '—'}</div>
            </div>
            <div>
              <div className="prr-field-label">Rental reference</div>
              <div className="prr-field-value">{documentNumber?.replace('-RET', '') || '—'}</div>
            </div>
            <div>
              <div className="prr-field-label">Scheduled return</div>
              <div className="prr-field-value">
                {returnInfo.scheduledEndDate
                  ? dayjs(returnInfo.scheduledEndDate).format('MMM DD, YYYY')
                  : '—'}
              </div>
            </div>
            <div>
              <div className="prr-field-label">Actual return</div>
              <div className="prr-field-value">
                {returnedAt ? dayjs(returnedAt).format('MMM DD, YYYY') : '—'}
              </div>
            </div>
            {returnInfo.daysLate != null && returnInfo.daysLate > 0 ? (
              <div>
                <div className="prr-field-label">Days late</div>
                <div className="prr-field-value" style={{ color: '#b91c1c' }}>
                  {returnInfo.daysLate} day{returnInfo.daysLate === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="prr-section">
          <div className="prr-section-title">Inspection notes &amp; condition</div>
          <div className="prr-notes">
            {returnInfo.inspectionNotes?.trim()
              ? returnInfo.inspectionNotes
              : 'No inspection notes recorded.'}
          </div>
        </div>

        <div className="prr-section">
          <div className="prr-section-title">Items returned</div>
          <table className="prr-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th>Condition notes</th>
              </tr>
            </thead>
            <tbody>
              {(rental.items || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.product?.name || 'Rental item'}</td>
                  <td className="num">{item.quantity}</td>
                  <td>{item.notes?.trim() || 'Returned — no item-specific notes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="prr-section">
          <div className="prr-section-title">Damage findings</div>
          {damageReports.length === 0 ? (
            <div className="prr-empty">No damage reported.</div>
          ) : (
            <table className="prr-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {damageReports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.product?.name || '—'}</td>
                    <td>{formatDamageType(report.damageType)}</td>
                    <td>{formatDamageSeverity(report.severity)}</td>
                    <td>{report.description || '—'}</td>
                    <td className="num">
                      {money(report.actualRepairCost ?? report.estimatedRepairCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="prr-section">
          <div className="prr-section-title">Late charges summary</div>
          {lateChargesSummary.length === 0 ? (
            <div className="prr-empty">No late charges.</div>
          ) : (
            <table className="prr-table">
              <thead>
                <tr>
                  <th>Days late</th>
                  <th className="num">Rate/day</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lateChargesSummary.map((charge) => (
                  <tr key={charge.id}>
                    <td>{charge.daysLate}</td>
                    <td className="num">{money(charge.chargePerDay)}</td>
                    <td className="num" style={charge.status === 'waived' ? { textDecoration: 'line-through', color: '#9ca3af' } : undefined}>
                      {money(charge.totalCharge)}
                    </td>
                    <td>
                      {formatLateChargeStatus(charge.status)}
                      {charge.waivedReason ? ` — ${charge.waivedReason}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="prr-section">
          <div className="prr-section-title">Charges summary</div>
          <div className="prr-summary">
            <div className="prr-summary-row">
              <span>Rental amount</span>
              <span>{money(financials.amount)}</span>
            </div>
            {financials.lateChargeTotal > 0 ? (
              <div className="prr-summary-row">
                <span>Late charges</span>
                <span>{money(financials.lateChargeTotal)}</span>
              </div>
            ) : null}
            {financials.damageTotal > 0 ? (
              <div className="prr-summary-row">
                <span>Damage charges</span>
                <span>{money(financials.damageTotal)}</span>
              </div>
            ) : null}
            {financials.discountAmount > 0 ? (
              <div className="prr-summary-row">
                <span>Discount</span>
                <span>−{money(financials.discountAmount)}</span>
              </div>
            ) : null}
            {financials.depositApplied > 0 ? (
              <div className="prr-summary-row">
                <span>Deposit applied</span>
                <span>−{money(financials.depositApplied)}</span>
              </div>
            ) : null}
            <div className="prr-summary-row total">
              <span>Balance due</span>
              <span>{money(financials.netBalance)}</span>
            </div>
          </div>
        </div>

        <div className="prr-signatures">
          <div>
            <div className="prr-signature-line">Inspector signature</div>
          </div>
          <div>
            <div className="prr-signature-line">Customer signature</div>
          </div>
        </div>

        {companyInfo.invoiceFooter ? (
          <div className="prr-footer">{companyInfo.invoiceFooter}</div>
        ) : null}
      </div>
    </>
  );
};

export default PrintableRentalReturnInspection;
