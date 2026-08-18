import { API_BASE_URL } from '../services/api';
import { formatAssistantMessage } from './assistantMessageFormatter';

/**
 * Escape text for safe HTML attribute/text injection.
 * @param {unknown} value
 * @returns {string}
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Format organization address for report letterhead.
 * @param {Object|string|null|undefined} address
 * @returns {string}
 */
export const formatOrganizationAddress = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address.trim();
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean);
  return parts.join(', ');
};

/**
 * Resolve organization logo URL for print/PDF (CORS-friendly absolute URL).
 * @param {Object} [organization]
 * @returns {string|null}
 */
export const resolveOrganizationLogoUrl = (organization) => {
  const logoUrl = organization?.logoUrl;
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  if (logoUrl.startsWith('data:') || logoUrl.startsWith('http')) return logoUrl;
  if (!API_BASE_URL) return logoUrl;
  return `${API_BASE_URL}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
};

/**
 * Build branded HTML for an ABS AI insight PDF export (report letterhead).
 * @param {Object} options
 * @param {string} options.content - Assistant markdown/text response
 * @param {Object} [options.organization] - Workspace organization settings
 * @param {string} [options.question] - User question that produced the answer
 * @param {string} [options.periodLabel] - Analysis period label
 * @param {Date|string|number} [options.generatedAt]
 * @returns {string}
 */
export function buildAssistantReportHtml({
  content,
  organization = {},
  question = '',
  periodLabel = '',
  generatedAt = new Date(),
} = {}) {
  const companyName = escapeHtml(organization.name || 'Company');
  const phone = escapeHtml(organization.phone || '');
  const email = escapeHtml(organization.email || '');
  const website = escapeHtml(organization.website || '');
  const location = escapeHtml(formatOrganizationAddress(organization.address));
  const vatNumber = escapeHtml(organization.tax?.vatNumber || '');
  const tin = escapeHtml(organization.tax?.tin || '');
  const logoUrl = resolveOrganizationLogoUrl(organization);
  const safeLogoUrl = logoUrl ? escapeHtml(logoUrl) : null;

  const generated = new Date(generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? escapeHtml(String(generatedAt))
    : escapeHtml(
        generated.toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      );

  const contactLines = [phone, email, website, location].filter(Boolean);
  const taxBits = [
    vatNumber ? `VAT: ${vatNumber}` : '',
    tin ? `TIN: ${tin}` : '',
  ].filter(Boolean);

  const questionBlock = question
    ? `<div class="ai-report-question">
        <div class="ai-report-label">Question</div>
        <div>${escapeHtml(question)}</div>
      </div>`
    : '';

  const periodBlock = periodLabel
    ? `<div class="ai-report-meta-row"><strong>Period:</strong> ${escapeHtml(periodLabel)}</div>`
    : '';

  return `
    <div class="ai-report" style="font-family: Helvetica, Arial, sans-serif; color: #111827; background: #ffffff;">
      <style>
        .ai-report { box-sizing: border-box; }
        .ai-report * { box-sizing: border-box; }
        .ai-report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 18px;
          padding-bottom: 14px;
          border-bottom: 1px solid #d1d5db;
        }
        .ai-report-company { flex: 1; min-width: 0; }
        .ai-report-logo {
          max-width: 140px;
          max-height: 72px;
          margin-bottom: 10px;
          object-fit: contain;
          object-position: left center;
        }
        .ai-report-company-name {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #111827;
        }
        .ai-report-details {
          font-size: 12px;
          line-height: 1.55;
          color: #374151;
        }
        .ai-report-details div { margin-bottom: 2px; }
        .ai-report-tax {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
        }
        .ai-report-doc {
          text-align: right;
          flex-shrink: 0;
          min-width: 180px;
        }
        .ai-report-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 10px 0;
          color: #166534;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .ai-report-meta-row {
          font-size: 12px;
          margin-bottom: 4px;
          color: #111827;
        }
        .ai-report-question {
          margin: 0 0 16px 0;
          padding: 12px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f9fafb;
          font-size: 13px;
          line-height: 1.5;
          color: #111827;
        }
        .ai-report-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .ai-report-body {
          font-size: 13px;
          line-height: 1.65;
          color: #111827;
        }
        .ai-report-body ul { list-style: disc; padding-left: 20px; margin: 8px 0; }
        .ai-report-body ol { list-style: decimal; padding-left: 20px; margin: 8px 0; }
        .ai-report-body li { margin: 4px 0; }
        .ai-report-body strong { font-weight: 600; }
        .ai-report-footer {
          margin-top: 28px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          font-size: 10px;
          color: #6b7280;
          line-height: 1.5;
        }
      </style>

      <div class="ai-report-header">
        <div class="ai-report-company">
          ${safeLogoUrl ? `<img class="ai-report-logo" src="${safeLogoUrl}" alt="${companyName} logo" />` : ''}
          <div class="ai-report-company-name">${companyName}</div>
          <div class="ai-report-details">
            ${contactLines.map((line) => `<div>${line}</div>`).join('')}
            ${taxBits.length ? `<div class="ai-report-tax">${taxBits.join(' · ')}</div>` : ''}
          </div>
        </div>
        <div class="ai-report-doc">
          <div class="ai-report-title">Ayebia Insight Report</div>
          ${periodBlock}
          <div class="ai-report-meta-row"><strong>Generated:</strong> ${generatedLabel}</div>
        </div>
      </div>

      ${questionBlock}

      <div class="ai-report-body">
        ${formatAssistantMessage(String(content || ''))}
      </div>

      <div class="ai-report-footer">
        Generated by Ayebia for ${companyName}. Based on workspace data at the time of generation.
        Figures may change as new sales, expenses, and inventory updates are recorded.
      </div>
    </div>
  `;
}
