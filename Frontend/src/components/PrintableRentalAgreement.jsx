import React from 'react';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../services/api';
import { formatDepositStatus } from '../utils/rentalDepositUtils';

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

/**
 * Printable rental agreement (A4) with tenant branding.
 * @param {{ document: object }} props
 */
const PrintableRentalAgreement = ({ document }) => {
  if (!document?.rental) return null;

  const { rental, organization = {}, terms, financials = {}, handover, documentNumber, documentTitle } = document;
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
    website: organization.website || '',
    location: formatAddress(organization.address),
    invoiceFooter: organization.invoiceFooter || '',
  };

  const items = rental.items || [];

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-rental-agreement, .printable-rental-agreement * { visibility: visible; }
          .printable-rental-agreement {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          @page { size: A4; margin: 14mm 16mm; }
        }

        .printable-rental-agreement {
          width: 210mm;
          max-width: 100%;
          padding: 18mm 16mm;
          margin: 0 auto;
          background: #fff;
          font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #111827;
          box-sizing: border-box;
        }

        .pra-header {
          display: flex;
          justify-content: space-between;
          gap: 28px;
          padding-bottom: 20px;
          margin-bottom: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .pra-brand img {
          max-height: 56px;
          max-width: 200px;
          object-fit: contain;
        }

        .pra-company-name {
          font-size: 20px;
          font-weight: 650;
          color: ${primaryColor};
          margin-bottom: 6px;
        }

        .pra-meta {
          text-align: right;
          font-size: 12px;
          color: #4b5563;
        }

        .pra-title {
          font-size: 22px;
          font-weight: 700;
          color: ${primaryColor};
          margin-bottom: 20px;
          letter-spacing: 0.02em;
        }

        .pra-section {
          margin-bottom: 22px;
        }

        .pra-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          margin-bottom: 10px;
        }

        .pra-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 24px;
        }

        .pra-field-label {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 2px;
        }

        .pra-field-value {
          font-size: 13px;
          color: #111827;
        }

        .pra-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .pra-table th {
          text-align: left;
          padding: 10px 8px;
          border-bottom: 2px solid #e5e7eb;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
        }

        .pra-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: top;
        }

        .pra-table td.num,
        .pra-table th.num {
          text-align: right;
        }

        .pra-summary {
          margin-top: 16px;
          margin-left: auto;
          width: 280px;
          font-size: 12px;
        }

        .pra-summary-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .pra-summary-row.total {
          font-weight: 700;
          font-size: 14px;
          border-top: 2px solid #e5e7eb;
          border-bottom: none;
          padding-top: 10px;
          margin-top: 4px;
        }

        .pra-terms {
          font-size: 11px;
          line-height: 1.6;
          color: #374151;
          white-space: pre-wrap;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 14px;
          background: #f9fafb;
        }

        .pra-footer {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
        }

        .pra-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 36px;
        }

        .pra-signature-line {
          border-top: 1px solid #9ca3af;
          padding-top: 8px;
          font-size: 11px;
          color: #6b7280;
        }
      `}</style>

      <div className="printable-rental-agreement">
        <div className="pra-header">
          <div className="pra-brand">
            {logoSource ? (
              <img src={logoSource} alt={companyInfo.name} />
            ) : (
              <div className="pra-company-name">{companyInfo.name}</div>
            )}
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '8px', lineHeight: 1.5 }}>
              {companyInfo.location ? <div>{companyInfo.location}</div> : null}
              {companyInfo.phone ? <div>{companyInfo.phone}</div> : null}
              {companyInfo.email ? <div>{companyInfo.email}</div> : null}
            </div>
          </div>
          <div className="pra-meta">
            <div style={{ fontSize: '14px', fontWeight: 700, color: primaryColor, marginBottom: '8px' }}>
              {documentTitle || 'Rental Agreement'}
            </div>
            <div><strong>Document #</strong> {documentNumber}</div>
            <div><strong>Date</strong> {dayjs(document.generatedAt).format('MMM DD, YYYY')}</div>
            <div><strong>Status</strong> {String(rental.status || '').replace(/_/g, ' ')}</div>
          </div>
        </div>

        <div className="pra-title">{documentTitle || 'Rental Agreement'}</div>

        <div className="pra-section">
          <div className="pra-section-title">Customer</div>
          <div className="pra-grid">
            <div>
              <div className="pra-field-label">Name</div>
              <div className="pra-field-value">{customer.name || '—'}</div>
            </div>
            <div>
              <div className="pra-field-label">Phone</div>
              <div className="pra-field-value">{customer.phone || '—'}</div>
            </div>
            <div>
              <div className="pra-field-label">Email</div>
              <div className="pra-field-value">{customer.email || '—'}</div>
            </div>
            <div>
              <div className="pra-field-label">ID / Reference</div>
              <div className="pra-field-value">{customer.metadata?.rental?.idNumber || '—'}</div>
            </div>
          </div>
        </div>

        <div className="pra-section">
          <div className="pra-section-title">Rental period</div>
          <div className="pra-grid">
            <div>
              <div className="pra-field-label">Start date</div>
              <div className="pra-field-value">
                {rental.startDate ? dayjs(rental.startDate).format('MMM DD, YYYY') : '—'}
              </div>
            </div>
            <div>
              <div className="pra-field-label">End date</div>
              <div className="pra-field-value">
                {rental.endDate ? dayjs(rental.endDate).format('MMM DD, YYYY') : '—'}
              </div>
            </div>
            <div>
              <div className="pra-field-label">Duration</div>
              <div className="pra-field-value">
                {rental.rentalDurationDays || 0} day{rental.rentalDurationDays === 1 ? '' : 's'}
              </div>
            </div>
            <div>
              <div className="pra-field-label">Payment method</div>
              <div className="pra-field-value" style={{ textTransform: 'capitalize' }}>
                {String(rental.paymentMethod || 'cash').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>

        {handover?.handedOverAt ? (
          <div className="pra-section">
            <div className="pra-section-title">Handover</div>
            <div className="pra-field-value">
              Checked out on {dayjs(handover.handedOverAt).format('MMM DD, YYYY h:mm A')}
              {handover.notes ? ` — ${handover.notes}` : ''}
            </div>
          </div>
        ) : null}

        <div className="pra-section">
          <div className="pra-section-title">Rented items</div>
          <table className="pra-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate/day</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product?.name || 'Rental item'}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{money(item.rentalRatePerDay)}</td>
                  <td className="num">{money(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pra-summary">
            <div className="pra-summary-row">
              <span>Rental subtotal</span>
              <span>{money(financials.amount)}</span>
            </div>
            {financials.discountAmount > 0 ? (
              <div className="pra-summary-row">
                <span>Discount</span>
                <span>−{money(financials.discountAmount)}</span>
              </div>
            ) : null}
            {financials.depositAmount > 0 ? (
              <div className="pra-summary-row">
                <span>Security deposit</span>
                <span>{money(financials.depositAmount)}</span>
              </div>
            ) : null}
            {financials.depositPaid > 0 ? (
              <div className="pra-summary-row">
                <span>Deposit collected ({formatDepositStatus(financials.depositStatus)})</span>
                <span>{money(financials.depositPaid)}</span>
              </div>
            ) : null}
            <div className="pra-summary-row total">
              <span>Total due</span>
              <span>{money(financials.totalDue)}</span>
            </div>
          </div>
        </div>

        {terms ? (
          <div className="pra-section">
            <div className="pra-section-title">Terms &amp; conditions</div>
            <div className="pra-terms">{terms}</div>
          </div>
        ) : null}

        <div className="pra-signatures">
          <div>
            <div className="pra-signature-line">Customer signature</div>
          </div>
          <div>
            <div className="pra-signature-line">Authorized representative</div>
          </div>
        </div>

        {companyInfo.invoiceFooter ? (
          <div className="pra-footer">{companyInfo.invoiceFooter}</div>
        ) : null}
      </div>
    </>
  );
};

export default PrintableRentalAgreement;
