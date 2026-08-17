/**
 * Email Templates for African Business Suite
 *
 * HTML email templates for various notification types.
 * All transactional emails use the same design system: sellfyCardTemplate + shared typography and spacing.
 */

// Shared design tokens (no shadows per project rules; use borders)
/**
 * Escape text for safe HTML email bodies (user-controlled strings).
 * @param {unknown} text
 * @returns {string}
 */
const escapeHtml = (text) => {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const { buildCustomerFacingJobTitle } = require('../utils/jobCustomerMessageText');

const EMAIL_DESIGN = {
  primaryColor: '#166534',
  headingColor: '#1a1a1a',
  bodyColor: '#555555',
  mutedColor: '#888888',
  footerColor: '#999999',
  linkColor: '#2563eb',
  borderColor: '#e5e7eb',
  tableHeaderBg: '#f8f9fa',
  headingSize: '22px',
  bodySize: '15px',
  smallSize: '13px',
  footnoteSize: '12px',
  buttonPadding: '14px 32px',
  buttonSize: '16px',
  cardBorder: '1px solid #e5e7eb',
  borderRadius: '8px',
  buttonRadius: '6px'
};

/**
 * Base email template wrapper
 * @param {string} content - Inner content HTML
 * @param {Object} options - Template options
 * @returns {string} - Complete HTML email
 */
const baseTemplate = (content, options = {}) => {
  const {
    companyName = 'African Business Suite',
    companyLogo = '',
    primaryColor = '#166534',
    footerText = ''
  } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email from ${companyName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f4f4f4;
      color: #333;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${primaryColor};
      padding: 24px;
      text-align: center;
    }
    .header img {
      max-height: 50px;
      max-width: 200px;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 32px 24px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .button {
      display: inline-block;
      padding: 12px 32px;
      background-color: ${primaryColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 16px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .info-table th,
    .info-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .info-table th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    .amount {
      font-size: 28px;
      font-weight: 700;
      color: ${primaryColor};
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-pending {
      background-color: #fef3c7;
      color: #92400e;
    }
    .status-paid {
      background-color: #d1fae5;
      color: #065f46;
    }
    .status-overdue {
      background-color: #fee2e2;
      color: #991b1b;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" />` : `<h1>${companyName}</h1>`}
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>${footerText || `&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.`}</p>
      <p>This email was sent automatically. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Centered card wrapper for all transactional emails. Consistent layout, no shadows (border only).
 * @param {string} innerContent - HTML for the main card body (use inline styles; prefer EMAIL_DESIGN tokens)
 * @param {Object} options - { companyName, primaryColor, logoUrl }
 * @returns {string} - Full HTML email
 */
const sellfyCardTemplate = (innerContent, options = {}) => {
  const companyName = options.companyName || 'African Business Suite';
  const primaryColor = options.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = options.logoUrl || '';
  const border = EMAIL_DESIGN.cardBorder;
  const radius = EMAIL_DESIGN.borderRadius;
  const footerColor = EMAIL_DESIGN.footerColor;

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style type="text/css">
    body, p, div { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; }
    body { color: #333333; margin: 0; padding: 0; background-color: #e8e8e8; }
    body a { text-decoration: none; color: ${EMAIL_DESIGN.linkColor}; }
    p { margin: 0; padding: 0; }
  </style>
</head>
<body style="background-color: #e8e8e8; padding: 40px 16px;">
  <center style="width: 100%;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: ${border}; border-radius: ${radius};">
      <tr>
        <td style="padding: 48px 40px 40px; text-align: center;">
          ${logoUrl ? `<p style="margin: 0 0 32px 0;"><img src="${logoUrl}" alt="${companyName}" style="max-height: 48px; max-width: 180px; height: auto;" /></p>` : `<p style="margin: 0 0 32px 0; font-size: 28px; font-weight: bold; color: ${primaryColor};">${companyName}</p>`}
          ${innerContent}
        </td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 560px; margin: 24px auto 0;">
      <tr>
        <td style="padding: 24px 16px; text-align: center; font-size: ${EMAIL_DESIGN.footnoteSize}; color: ${footerColor}; line-height: 1.5;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.<br>Powered by African Business Suite</td>
      </tr>
    </table>
  </center>
</body>
</html>`;
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} - Formatted amount
 */
const { formatCurrency, formatCedi } = require('../utils/formatNumber');

/**
 * Invoice rows use totalAmount, balance, amountPaid — not a `total` field.
 * @param {Object} invoice - Invoice payload (e.g. from Sequelize toJSON)
 * @param {'balance'|'paid'} mode - balance: amount owed; paid: amount paid (confirmation)
 * @returns {number}
 */
const resolveInvoiceDisplayAmount = (invoice, mode = 'balance') => {
  if (!invoice || typeof invoice !== 'object') return 0;
  const n = (v) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : NaN;
  };
  if (mode === 'paid') {
    const paid = n(invoice.amountPaid);
    if (Number.isFinite(paid) && paid > 0) return paid;
    const t = n(invoice.totalAmount ?? invoice.total);
    return Number.isFinite(t) ? t : 0;
  }
  const bal = n(invoice.balance);
  if (Number.isFinite(bal)) return bal;
  const totalAmt = n(invoice.totalAmount ?? invoice.total);
  return Number.isFinite(totalAmt) ? totalAmt : 0;
};

/**
 * Format date
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Invoice notification email template
 * @param {Object} invoice - Invoice data
 * @param {Object} customer - Customer data
 * @param {string} paymentLink - Payment link URL
 * @param {Object} company - Company/tenant data
 * @returns {Object} - { subject, html, text }
 */
const invoiceNotification = (invoice, customer, paymentLink, company = {}) => {
  const {
    invoiceNumber,
    currency = 'GHS',
    dueDate,
    status,
    items = []
  } = invoice;

  const amountDue = resolveInvoiceDisplayAmount(invoice, 'balance');
  const isPaid = String(status || '').toLowerCase() === 'paid';

  const customerName = customer?.name || customer?.companyName || 'Valued Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const statusBg = status === 'paid' ? '#d1fae5' : status === 'overdue' ? '#fee2e2' : '#fef3c7';
  const statusColor = status === 'paid' ? '#065f46' : status === 'overdue' ? '#991b1b' : '#92400e';
  const intro = isPaid
    ? `Hi ${customerName}, this invoice has been paid in full. Thank you.`
    : `Hi ${customerName}, click the button below to view and pay online.`;
  const amountLabel = isPaid ? 'Amount paid' : 'Amount Due';
  const payCta = isPaid
    ? ''
    : `
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${paymentLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">View &amp; Pay Invoice</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${paymentLink}" target="_blank" style="color: ${d.linkColor};">${paymentLink}</a></p>`;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Invoice ${invoiceNumber}</h1>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">${intro}</p>
    <div style="background-color: ${statusBg}; padding: 24px; border-radius: ${d.borderRadius}; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: ${statusColor};">${amountLabel}</p>
      <p style="margin: 0; font-size: 28px; font-weight: 700; color: ${statusColor};">${formatCurrency(isPaid ? resolveInvoiceDisplayAmount(invoice, 'paid') : amountDue, currency)}</p>
    </div>
    ${payCta}
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">If you have any questions about this invoice, please contact us.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = isPaid
    ? `
Invoice ${invoiceNumber}

Hi ${customerName},

This invoice has been paid in full. Thank you.

Amount paid: ${formatCurrency(resolveInvoiceDisplayAmount(invoice, 'paid'), currency)}

If you have any questions, please contact us.

${companyName}
  `.trim()
    : `
Invoice ${invoiceNumber}

Hi ${customerName},

Click the link below to view and pay online.

Amount Due: ${formatCurrency(amountDue, currency)}

View and pay: ${paymentLink}

If you have any questions, please contact us.

${companyName}
  `.trim();

  return {
    subject: isPaid
      ? `Invoice ${invoiceNumber} — paid`
      : `Invoice ${invoiceNumber} - ${formatCurrency(amountDue, currency)} Due`,
    html,
    text
  };
};

/**
 * Customer job tracking link (public page, no login).
 * @param {Object} job - Job row (jobNumber, title, status)
 * @param {Object} customer - Customer (name, company)
 * @param {string} trackUrl - Full URL to /track-job/:token
 * @param {Object} company - Branding
 * @returns {{ subject: string, html: string, text: string }}
 */
const jobTrackingNotification = (job, customer, trackUrl, company = {}) => {
  const customerName = customer?.name || customer?.company || 'Valued Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;
  const jobLabel = job?.jobNumber || 'Your job';
  const titleDetail = buildCustomerFacingJobTitle(job);
  const titleLine = `${jobLabel} — ${titleDetail}`;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">A job has been created for you</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${customerName},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;"><strong>${companyName}</strong> has created <strong>${titleLine}</strong>. You can view status and track progress using the secure link below.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">View &amp; track job</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${trackUrl}" target="_blank" style="color: ${d.linkColor};">${trackUrl}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">If you have questions, reply to this email or contact ${companyName}.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Hi ${customerName},

${companyName} has created ${titleLine}.

View and track your job (no login required):
${trackUrl}

If you have questions, please contact ${companyName}.
  `.trim();

  return {
    subject: `${jobLabel} — View & track your job`,
    html,
    text
  };
};

/**
 * Internal reminder email to assignee when a job is due soon.
 * @param {Object} job - Job row (jobNumber, title, dueDate, priority)
 * @param {Object} assignee - User row (name, email)
 * @param {Object} customer - Customer row (name, company)
 * @param {string} jobUrl - Full URL to /jobs/:id
 * @param {Object} company - Branding
 * @returns {{ subject: string, html: string, text: string }}
 */
const jobDueSoonReminder = (job, assignee, customer, jobUrl, company = {}) => {
  const assigneeName = assignee?.name || 'Team Member';
  const customerName = customer?.name || customer?.company || 'Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const jobLabel = job?.jobNumber || 'Job';
  const titleLine = job?.title ? `${jobLabel} — ${job.title}` : jobLabel;
  const dueDateLabel = formatDate(job?.dueDate || new Date());
  const priorityLabel = String(job?.priority || 'medium').toUpperCase();

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Job due soon</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${assigneeName},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">You have an assigned job due within 24 hours.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Job</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${titleLine}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Customer</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${customerName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Priority</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${priorityLabel}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Due Date</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${dueDateLabel}</td></tr>
    </table>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${jobUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Open job</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${jobUrl}" target="_blank" style="color: ${d.linkColor};">${jobUrl}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This is an automated reminder from ${companyName}.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Hi ${assigneeName},

You have an assigned job due within 24 hours.

Job: ${titleLine}
Customer: ${customerName}
Priority: ${priorityLabel}
Due Date: ${dueDateLabel}

Open job: ${jobUrl}

${companyName}
  `.trim();

  return {
    subject: `Job Due Soon — ${jobLabel}`,
    html,
    text
  };
};

/**
 * Email to team member when they are assigned a job (create or reassignment).
 * @param {Object} job - Job row (jobNumber, title, dueDate, priority, status)
 * @param {Object} assignee - User row (name, email)
 * @param {Object|null} customer - Customer row (name, company)
 * @param {string} jobUrl - Full URL to /jobs/:id
 * @param {Object} company - Branding
 * @param {Object|null} assignedByUser - User who assigned (id, name, email)
 * @returns {{ subject: string, html: string, text: string }}
 */
const jobAssignedNotifyAssignee = (job, assignee, customer, jobUrl, company = {}, assignedByUser = null) => {
  const assigneeName = assignee?.name || 'Team Member';
  const customerName = customer?.name || customer?.company || '—';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const jobLabel = job?.jobNumber || 'Job';
  const titleLine = job?.title ? `${jobLabel} — ${job.title}` : jobLabel;
  const dueDateLabel = job?.dueDate ? formatDate(job.dueDate) : 'Not set';
  const priorityLabel = String(job?.priority || 'medium').toUpperCase();
  const statusLabel = String(job?.status || 'new').replace(/_/g, ' ');
  const assignerName = assignedByUser?.name || assignedByUser?.email || 'A teammate';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">You have a new job assignment</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${assigneeName},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;"><strong>${assignerName}</strong> assigned this job to you.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Job</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${titleLine}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Customer</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${customerName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Status</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${statusLabel}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Priority</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${priorityLabel}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Due date</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${dueDateLabel}</td></tr>
    </table>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${jobUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Open job</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${jobUrl}" target="_blank" style="color: ${d.linkColor};">${jobUrl}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This is an automated message from ${companyName}.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Hi ${assigneeName},

${assignerName} assigned this job to you.

Job: ${titleLine}
Customer: ${customerName}
Status: ${statusLabel}
Priority: ${priorityLabel}
Due date: ${dueDateLabel}

Open job: ${jobUrl}

${companyName}
  `.trim();

  return {
    subject: `New job assigned — ${jobLabel}`,
    html,
    text
  };
};

/**
 * Invoice paid confirmation email template
 * @param {Object} invoice - Invoice data
 * @param {Object} customer - Customer data
 * @param {Object} company - Company/tenant data
 * @returns {Object} - { subject, html, text }
 */
const invoicePaidConfirmation = (invoice, customer, company = {}) => {
  const {
    invoiceNumber,
    currency = 'GHS',
    paidDate
  } = invoice;

  const paidAmount = resolveInvoiceDisplayAmount(invoice, 'paid');

  const customerName = customer?.name || customer?.companyName || 'Valued Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;
  const paidGreen = '#065f46';
  const paidBg = '#d1fae5';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Payment received</h1>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${customerName}, thank you! We have received your payment for invoice ${invoiceNumber}.</p>
    <div style="background-color: ${paidBg}; padding: 24px; border-radius: ${d.borderRadius}; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: ${paidGreen};">Payment confirmed</p>
      <p style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: ${paidGreen};">${formatCurrency(paidAmount, currency)}</p>
      <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: ${d.footnoteSize}; font-weight: 600; background-color: ${paidGreen}; color: #fff;">PAID</span>
    </div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Invoice Number</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${invoiceNumber}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Amount Paid</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${formatCurrency(paidAmount, currency)}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Payment Date</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${formatDate(paidDate || new Date())}</td></tr>
    </table>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This email serves as your payment confirmation. Thank you for your business!</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Payment Received - Invoice ${invoiceNumber}

Dear ${customerName},

Thank you! We have received your payment.

Invoice Number: ${invoiceNumber}
Amount Paid: ${formatCurrency(paidAmount, currency)}
Payment Date: ${formatDate(paidDate || new Date())}

This email serves as your payment confirmation.

Thank you for your business!

${companyName}
  `.trim();

  return {
    subject: `Payment Received - Invoice ${invoiceNumber}`,
    html,
    text
  };
};

/**
 * Payment reminder email template
 * @param {Object} invoice - Invoice data
 * @param {Object} customer - Customer data
 * @param {string} paymentLink - Payment link URL
 * @param {Object} company - Company/tenant data
 * @param {string} reminderType - Type: 'upcoming', 'due', 'overdue'
 * @returns {Object} - { subject, html, text }
 */
const paymentReminder = (invoice, customer, paymentLink, company = {}, reminderType = 'due') => {
  const {
    invoiceNumber,
    currency = 'GHS',
    dueDate
  } = invoice;

  const amountDue = resolveInvoiceDisplayAmount(invoice, 'balance');

  const customerName = customer?.name || customer?.companyName || 'Valued Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  let urgencyMessage, subjectPrefix, boxBg, boxColor, badgeText;
  switch (reminderType) {
    case 'upcoming':
      urgencyMessage = `Your invoice ${invoiceNumber} will be due on ${formatDate(dueDate)}.`;
      subjectPrefix = 'Payment Due Soon';
      boxBg = '#fef3c7';
      boxColor = '#92400e';
      badgeText = 'DUE';
      break;
    case 'overdue':
      urgencyMessage = `Your invoice ${invoiceNumber} is now overdue. It was due on ${formatDate(dueDate)}.`;
      subjectPrefix = 'Overdue Payment';
      boxBg = '#fee2e2';
      boxColor = '#991b1b';
      badgeText = 'OVERDUE';
      break;
    default:
      urgencyMessage = `Your invoice ${invoiceNumber} is due today.`;
      subjectPrefix = 'Payment Due Today';
      boxBg = '#fef3c7';
      boxColor = '#92400e';
      badgeText = 'DUE';
  }

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">${subjectPrefix}</h1>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${customerName}, ${urgencyMessage} Please pay at your earliest convenience.</p>
    <div style="background-color: ${boxBg}; padding: 24px; border-radius: ${d.borderRadius}; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: ${boxColor};">Amount Due</p>
      <p style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: ${boxColor};">${formatCurrency(amountDue, currency)}</p>
      <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: ${d.footnoteSize}; font-weight: 600; background-color: ${boxColor}; color: #fff;">${badgeText}</span>
    </div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Invoice Number</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${invoiceNumber}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Due Date</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${formatDate(dueDate)}</td></tr>
    </table>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${paymentLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Pay now</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${paymentLink}" target="_blank" style="color: ${d.linkColor};">${paymentLink}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">If you have already paid, please disregard this reminder.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
${subjectPrefix} - Invoice ${invoiceNumber}

Dear ${customerName},

${urgencyMessage}

Amount Due: ${formatCurrency(amountDue, currency)}
Due Date: ${formatDate(dueDate)}

Pay now: ${paymentLink}

If you have already made this payment, please disregard this reminder.

${companyName}
  `.trim();

  return {
    subject: `${subjectPrefix} - Invoice ${invoiceNumber}`,
    html,
    text
  };
};

/**
 * Quote notification email template (customer-facing "your quote is ready" link)
 * @param {Object} quote - Quote data (quoteNumber, title, totalAmount, currency, items)
 * @param {Object} customer - Customer data
 * @param {string} quoteLink - View quote URL
 * @param {Object} company - Company/tenant data (name, primaryColor, logo)
 * @param {string} customMessage - Optional custom intro message from sender
 * @returns {Object} - { subject, html, text }
 */
const quoteNotification = (quote, customer, quoteLink, company = {}, customMessage = '') => {
  const {
    quoteNumber,
    title = 'Your quote',
    totalAmount,
    currency = 'GHS',
    items = []
  } = quote;

  const customerName = customer?.name || customer?.companyName || 'Valued Customer';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const defaultMessage = 'Please find your quote below. Click the button to view the full details and accept when you are ready.';
  const messageParagraph = (typeof customMessage === 'string' && customMessage.trim())
    ? customMessage.trim().replace(/\n/g, '<br>')
    : defaultMessage;

  /* Itemized details are not included in the email; customer sees them on the view-quote page. */

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Quote ${quoteNumber}</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${customerName},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">${messageParagraph}</p>
    <div style="background-color: #f0fdf4; padding: 24px; border-radius: ${d.borderRadius}; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #166534;">Quote total</p>
      <p style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: ${primaryColor};">${formatCurrency(totalAmount, currency)}</p>
    </div>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${quoteLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">View your quote</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${quoteLink}" target="_blank" style="color: ${d.linkColor};">${quoteLink}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">If you have any questions about this quote, please reply to this email or contact us.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const messageText = (typeof customMessage === 'string' && customMessage.trim())
    ? customMessage.trim()
    : defaultMessage;
  const text = `
Quote ${quoteNumber} – ${title}

Hi ${customerName},

${messageText}

Quote total: ${formatCurrency(totalAmount, currency)}

View your quote: ${quoteLink}

If you have any questions, please contact us.

${companyName}
  `.trim();

  return {
    subject: `Quote ${quoteNumber} – ${title}`,
    html,
    text
  };
};

/**
 * Quote accepted – notify tenant (business) that customer accepted the quote
 * @param {Object} quote - Quote data (quoteNumber, title, totalAmount, customer)
 * @param {Object} organization - Tenant org (name, primaryColor, logo)
 * @param {string} quotesUrl - Dashboard quotes page URL
 * @returns {Object} - { subject, html, text }
 */
const quoteAcceptedNotifyTenant = (quote, organization = {}, quotesUrl = '') => {
  const quoteNumber = quote?.quoteNumber || 'Quote';
  const title = quote?.title || 'Your quote';
  const customerName = quote?.customer?.name || quote?.customer?.company || 'The customer';
  const totalAmount = quote?.totalAmount;
  const currency = quote?.currency || 'GHS';
  const companyName = organization.name || 'African Business Suite';
  const primaryColor = organization.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = organization.logo || '';
  const d = EMAIL_DESIGN;
  const defaultQuotesUrl = (quotesUrl || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '') + '/quotes';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Quote accepted</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor};">${customerName} has accepted your quote <strong>${quoteNumber}</strong>${title ? ` (${title})` : ''}.</p>
    ${totalAmount != null ? `<p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor};">Total: <strong>${formatCurrency(totalAmount, currency)}</strong></p>` : ''}
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${defaultQuotesUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">View quotes</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">You can view and manage this quote in your dashboard.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Quote accepted

${customerName} has accepted your quote ${quoteNumber}${title ? ` (${title})` : ''}.
${totalAmount != null ? `Total: ${formatCurrency(totalAmount, currency)}` : ''}

View quotes: ${defaultQuotesUrl}

${companyName}
  `.trim();

  return {
    subject: `Quote ${quoteNumber} accepted by ${customerName}`,
    html,
    text
  };
};

/**
 * Welcome email template for new users
 * @param {Object} user - User data
 * @param {Object} company - Company/tenant data
 * @param {string} loginUrl - Login URL
 * @returns {Object} - { subject, html, text }
 */
const welcomeEmail = (user, company = {}, loginUrl = '') => {
  const userName = user?.name || 'User';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;
  const defaultLoginUrl = (loginUrl || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const loginLink = `${defaultLoginUrl}/login`;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Welcome to ${companyName}</h1>
    <p style="margin: 0 0 32px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${userName}, your account has been created. Click the button below to log in and start using the platform.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${loginLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Log in to your account</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${loginLink}" target="_blank" style="color: ${d.linkColor};">${loginLink}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">If you did not create this account, please contact support.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Welcome to ${companyName}!

Dear ${userName},

Your account has been created successfully.

Log in here: ${loginLink}

If you did not create this account, please contact support.

${companyName}
  `.trim();

  return {
    subject: `Welcome to ${companyName}!`,
    html,
    text
  };
};

/**
 * Invite email – sent to invitee with signup link (platform email)
 * @param {string} inviteeEmail - Invitee email address
 * @param {string} inviteUrl - Full signup URL with token
 * @param {string} inviterName - Name of person who sent the invite
 * @param {string} organizationName - Business/team name
 * @returns {Object} - { subject, html, text }
 */
const inviteEmail = (inviteeEmail, inviteUrl, inviterName = 'A team member', organizationName = 'African Business Suite') => {
  const primaryColor = EMAIL_DESIGN.primaryColor;
  const d = EMAIL_DESIGN;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">You're invited to join ${organizationName}</h1>
    <p style="margin: 0 0 32px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">${inviterName} has invited you to join their team. Click the button below to create your account and get started.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Accept invite &amp; sign up</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${inviteUrl}" target="_blank" style="color: ${d.linkColor};">${inviteUrl}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This invite link will expire in 7 days. If you did not expect this email, you can ignore it.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName: organizationName, primaryColor, logoUrl: '' });

  const text = `
You're invited to join ${organizationName}

${inviterName} has invited you to join their team.

Accept the invite and create your account: ${inviteUrl}

This invite link will expire in 7 days. If you did not expect this email, you can ignore it.

${organizationName}
  `.trim();

  return {
    subject: `You're invited to join ${organizationName}`,
    html,
    text
  };
};

/**
 * Invite tenant email – sent when platform admin invites a new tenant (create your workspace).
 * @param {string} inviteeEmail - Invitee email address
 * @param {string} inviteUrl - Full signup URL with token
 * @param {string} inviterName - Name of admin who sent the invite
 * @returns {Object} - { subject, html, text }
 */
const inviteTenantEmail = (inviteeEmail, inviteUrl, inviterName = 'African Business Suite') => {
  const primaryColor = EMAIL_DESIGN.primaryColor;
  const d = EMAIL_DESIGN;
  const organizationName = 'African Business Suite';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Create your workspace</h1>
    <p style="margin: 0 0 32px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">You've been invited to create your workspace on ${organizationName}. Click the button below to set your password and get started.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Create account</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${inviteUrl}" target="_blank" style="color: ${d.linkColor};">${inviteUrl}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This invite link will expire in 7 days. If you did not expect this email, you can ignore it.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName: organizationName, primaryColor, logoUrl: '' });

  const text = `
Create your workspace on ${organizationName}

You've been invited to create your workspace. Set your password and get started: ${inviteUrl}

This invite link will expire in 7 days. If you did not expect this email, you can ignore it.

${organizationName}
  `.trim();

  return {
    subject: 'Create your workspace – African Business Suite',
    html,
    text
  };
};

/**
 * Password reset email template
 * @param {Object} user - User data
 * @param {string} resetLink - Password reset link
 * @param {Object} company - Company/tenant data
 * @returns {Object} - { subject, html, text }
 */
const passwordReset = (user, resetLink, company = {}) => {
  const userName = user?.name || 'User';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Reset your password</h1>
    <p style="margin: 0 0 32px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${userName}, we received a request to reset your password. Click the button below to create a new password.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${resetLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Reset password</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${resetLink}" target="_blank" style="color: ${d.linkColor};">${resetLink}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This link expires in 1 hour. If you did not request a password reset, please ignore this email.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = `
Password Reset Request

Dear ${userName},

We received a request to reset your password.

Reset your password here: ${resetLink}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email.

${companyName}
  `.trim();

  return {
    subject: 'Password Reset Request',
    html,
    text
  };
};

/**
 * Email verification template (after signup) – Sellfy-style, centered card.
 * Wording and subject avoid common spam/phishing triggers ("verify your email") so the message is more likely to land in inbox.
 * @param {Object} user - User data
 * @param {string} verifyLink - Verification link (FRONTEND_URL/verify-email?token=...)
 * @param {Object} company - Company/tenant data
 * @returns {Object} - { subject, html, text }
 */
const emailVerification = (user, verifyLink, company = {}) => {
  const userName = user?.name || 'User';
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Confirm your email</h1>
    <p style="margin: 0 0 32px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">You signed up for ${companyName}. Click the button below to confirm this email and activate your account.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${verifyLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Confirm email</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link into your browser:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${verifyLink}" target="_blank" style="color: ${d.linkColor};">${verifyLink}</a></p>
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This link expires in 24 hours.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = [
    `Confirm your ${companyName} account`,
    '',
    `Hi ${userName},`,
    '',
    `You signed up for ${companyName}. Confirm this email to activate your account:`,
    '',
    verifyLink,
    '',
    'This link expires in 24 hours.',
    '',
    companyName
  ].join('\n');

  return {
    subject: `Confirm your account – ${companyName}`,
    html,
    text
  };
};

/**
 * Low stock alert email template
 * @param {Array} items - Array of low stock items
 * @param {Object} company - Company/tenant data
 * @returns {Object} - { subject, html, text }
 */
const lowStockAlert = (items, company = {}) => {
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logo || '';
  const d = EMAIL_DESIGN;

  const itemsHtml = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <thead>
        <tr>
          <th style="padding: 12px; text-align: left; border-bottom: 1px solid ${d.borderColor}; background-color: ${d.tableHeaderBg}; font-weight: 600;">Item</th>
          <th style="padding: 12px; text-align: center; border-bottom: 1px solid ${d.borderColor}; background-color: ${d.tableHeaderBg}; font-weight: 600;">Current Stock</th>
          <th style="padding: 12px; text-align: center; border-bottom: 1px solid ${d.borderColor}; background-color: ${d.tableHeaderBg}; font-weight: 600;">Reorder Level</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${item.name}${item.sku ? ` (${item.sku})` : ''}</td>
            <td style="padding: 12px; text-align: center; border-bottom: 1px solid ${d.borderColor}; color: ${item.quantityOnHand <= 0 ? '#991b1b' : '#92400e'};">
              ${item.quantityOnHand} ${item.unit || 'pcs'}
            </td>
            <td style="padding: 12px; text-align: center; border-bottom: 1px solid ${d.borderColor};">${item.reorderLevel} ${item.unit || 'pcs'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Low stock alert</h1>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">The following items are running low and need to be restocked:</p>
    ${itemsHtml}
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">Please review and reorder these items to avoid stockouts.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const itemsList = items.map(i => `- ${i.name}: ${i.quantityOnHand} ${i.unit || 'pcs'} (Reorder at: ${i.reorderLevel})`).join('\n');

  const text = `
Low Stock Alert

The following items need to be restocked:

${itemsList}

Please review and reorder these items.

${companyName}
  `.trim();

  return {
    subject: `Low Stock Alert - ${items.length} item${items.length !== 1 ? 's' : ''} need restocking`,
    html,
    text
  };
};

/**
 * Platform-branded card for activity / notification emails (tenant sendMessage).
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string|null} [opts.link] - App path e.g. /jobs/uuid
 * @param {Object} [opts.company] - { name, primaryColor, logo (or logoUrl) }
 * @returns {string} full HTML
 */
const activityNotificationCard = ({ title, message, link = null, company = {} }) => {
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || company.logo || '';
  const d = EMAIL_DESIGN;
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const path = link ? (String(link).startsWith('/') ? String(link) : `/${String(link)}`) : '';
  const fullUrl = path ? `${base}${path}` : '';
  const safeLink = fullUrl ? escapeHtml(fullUrl) : '';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">${escapeHtml(title)}</h1>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">${escapeHtml(message)}</p>
    ${
      fullUrl
        ? `<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 32px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${safeLink}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">View details</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor};">If the button does not work, copy this link:</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all;"><a href="${safeLink}" target="_blank" style="color: ${d.linkColor};">${safeLink}</a></p>`
        : ''
    }
    <p style="margin: 0; font-size: ${d.footnoteSize}; color: ${d.footerColor};">This is an automated notification from ${escapeHtml(companyName)}.</p>
  `;
  return sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
};

/**
 * OTP / verification code (platform email) — same card layout as password reset / verification.
 * @param {Object} opts
 * @param {string} [opts.userName]
 * @param {string} opts.code
 * @param {string} opts.purpose - Short sentence, e.g. why they received the code
 * @param {number} [opts.minutesValid=10]
 * @param {Object} [opts.company] - { name, primaryColor, logoUrl }
 * @returns {{ subject: string, html: string, text: string }}
 */
const emailOtpCode = ({
  userName = 'there',
  code,
  purpose,
  minutesValid = 10,
  company = {}
}) => {
  const companyName = company.name || process.env.APP_NAME || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || company.logo || '';
  const d = EMAIL_DESIGN;
  const codeStr = escapeHtml(String(code ?? ''));

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Your verification code</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${escapeHtml(userName)},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">${escapeHtml(purpose)}</p>
    <p style="margin: 0 0 32px 0; padding: 20px 16px; font-size: 32px; font-weight: 700; letter-spacing: 0.35em; text-align: center; font-family: ui-monospace, monospace; color: ${d.headingColor}; border: 1px solid ${d.borderColor}; border-radius: ${d.borderRadius}; background-color: ${d.tableHeaderBg};">${codeStr}</p>
    <p style="margin: 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">This code expires in ${minutesValid} minutes. Do not share it with anyone.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });

  const text = [
    `Your verification code for ${companyName}`,
    '',
    `Hi ${userName},`,
    '',
    purpose,
    '',
    `Code: ${code}`,
    '',
    `Expires in ${minutesValid} minutes. Do not share this code.`,
    '',
    companyName
  ].join('\n');

  return {
    subject: `Your verification code — ${companyName}`,
    html,
    text
  };
};

/**
 * Audience-aware disclaimer for automation / marketing plain emails.
 * @param {string} companyName - Escaped company name
 * @param {string} [audience] - 'customer' (default) or 'internal' / 'staff'
 * @returns {string}
 */
const marketingPlainMessageDisclaimer = (companyName, audience = 'customer') => {
  const isInternal = audience === 'internal' || audience === 'staff';
  if (isInternal) {
    return `You are receiving this because you are a team member of ${companyName}.`;
  }
  return `You are receiving this because you are a customer of ${companyName}.`;
};

/**
 * Marketing broadcast / automation plain-text body, tenant-branded card.
 * @param {string} plainBody
 * @param {Object} [company] - { name, primaryColor, logoUrl, audience }
 *   audience: 'customer' (default) | 'internal' | 'staff' — controls footer disclaimer
 * @returns {string} HTML
 */
const marketingPlainMessageEmail = (plainBody, company = {}) => {
  const companyName = company.name || 'Your business';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || company.logo || '';
  const audience = company.audience || 'customer';
  const d = EMAIL_DESIGN;
  const bodyHtml = escapeHtml(String(plainBody ?? '')).replace(/\r\n/g, '\n').replace(/\n/g, '<br/>');
  const disclaimer = marketingPlainMessageDisclaimer(escapeHtml(companyName), audience);

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Message from ${escapeHtml(companyName)}</h1>
    <div style="margin: 0; font-size: ${d.bodySize}; line-height: 1.65; color: ${d.bodyColor}; text-align: left;">${bodyHtml}</div>
    <p style="margin: 24px 0 0 0; font-size: ${d.footnoteSize}; color: ${d.footerColor}; text-align: center;">${disclaimer}</p>
  `;
  return sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
};

/**
 * Paystack MoMo settlement linked (platform email).
 */
const paystackMomoLinkedEmail = ({ businessName, last4Digits }, company = {}) => {
  const companyName = company.name || process.env.APP_NAME || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || '';
  const d = EMAIL_DESIGN;
  const bn = escapeHtml((businessName || '').trim() || 'N/A');
  const last4 = escapeHtml(String(last4Digits || ''));

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">MoMo wallet linked</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Your mobile money wallet has been linked as your Paystack settlement destination.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Business name</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${bn}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Number ending</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">****${last4}</td></tr>
    </table>
    <p style="margin: 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">Your share of card and MoMo payments processed through Paystack will be settled to this wallet according to Paystack&apos;s schedule.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
  const text = `Your MoMo wallet has been linked for Paystack settlements.\n\nBusiness: ${(businessName || '').trim() || 'N/A'}\nNumber ending: ****${last4Digits}\n\nYour share of settlements will go to this wallet per Paystack's schedule.\n\n${companyName}`;
  return {
    subject: 'MoMo wallet linked – Paystack will settle your share here',
    html,
    text
  };
};

/**
 * Paystack bank settlement linked (platform email).
 */
const paystackBankLinkedEmail = ({ businessName, last4Digits }, company = {}) => {
  const companyName = company.name || process.env.APP_NAME || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || '';
  const d = EMAIL_DESIGN;
  const bn = escapeHtml((businessName || '').trim() || 'N/A');
  const last4 = escapeHtml(String(last4Digits || ''));

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Bank account linked</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Your bank account has been linked to receive your share of card and MoMo payments from Paystack.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Business name</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${bn}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Account ending</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">****${last4}</td></tr>
    </table>
    <p style="margin: 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">Settlements will be sent to this account. To change it, contact support.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
  const text = `Your bank account has been linked.\n\nBusiness name: ${(businessName || '').trim() || 'N/A'}\nAccount ending: ****${last4Digits}\n\nSettlements will be sent to this account. To change it, contact support.\n\n${companyName}`;
  return {
    subject: 'Bank account linked – you will receive Paystack payments here',
    html,
    text
  };
};

/**
 * POS / sale receipt email (tenant sendMessage).
 * @param {Object} sale - sale with saleNumber, createdAt, total, items[]
 * @param {Object} [company] - { name, primaryColor, logoUrl }
 * @param {string} [closingNote] - extra plain line(s) after table
 * @returns {{ subject: string, html: string, text: string }}
 */
const isReceiptLogoUrl = (value) => {
  const logoUrl = typeof value === 'string' ? value.trim() : '';
  if (!logoUrl) return false;
  if (/^data:image\//i.test(logoUrl)) return true;
  try {
    const parsed = new URL(logoUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
};

const getReceiptLogoInitials = (companyName) => {
  const words = String(companyName || 'African Business Suite')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'ABS';
  return words.slice(0, 3).map((word) => word.charAt(0).toUpperCase()).join('');
};

const saleReceiptEmail = (sale, company = {}, closingNote = '') => {
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoCandidate = company.logoUrl || company.logo || '';
  const logoUrl = isReceiptLogoUrl(logoCandidate) ? String(logoCandidate).trim() : '';
  const logoInitials = getReceiptLogoInitials(companyName);
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const currency = sale?.currency || 'GHS';
  const borderColor = EMAIL_DESIGN.borderColor;
  const mutedColor = EMAIL_DESIGN.mutedColor;
  const headingColor = EMAIL_DESIGN.headingColor;
  const bodyColor = EMAIL_DESIGN.bodyColor;
  const receiptBg = '#f7f8f5';
  const total = parseFloat(sale?.total ?? 0) || 0;
  const amountPaid = sale?.amountPaid != null ? parseFloat(sale.amountPaid) || 0 : null;
  const balance = Math.max(0, total - (amountPaid ?? total));
  const change = parseFloat(sale?.change ?? 0) || 0;
  const legacyClosingNote = typeof closingNote === 'string' ? closingNote.trim() : '';
  const customClosingNote = legacyClosingNote && !/```|SALES RECEIPT|Receipt No\./i.test(legacyClosingNote)
    ? legacyClosingNote
    : '';
  const saleNumRaw = sale?.saleNumber || 'Sale';
  const saleNum = escapeHtml(saleNumRaw);
  const dateStr = sale?.createdAt ? formatDate(sale.createdAt) : 'N/A';
  const currentYear = new Date().getFullYear();
  const money = (value) => formatCurrency(value, currency);
  const formatQuantity = (value) => {
    const number = parseFloat(value ?? 0);
    if (!Number.isFinite(number)) return '0';
    return number.toFixed(2);
  };
  const formatPaymentMethod = (value) => {
    const label = String(value || '').replace(/[_-]+/g, ' ').trim();
    return label ? label.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not recorded';
  };
  const compact = (...values) => values.map((value) => String(value || '').trim()).filter(Boolean);
  const formatAddress = (address) => {
    if (!address) return '';
    if (typeof address === 'string') return address.trim();
    return compact(
      address.line1 || address.address,
      address.line2,
      compact(address.city, address.state).join(', '),
      address.postalCode,
      address.country
    ).join(', ');
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
    const fallback = item?.sku || item?.product?.sku || item?.variant?.sku || item?.product?.barcode || item?.variant?.barcode;
    return String(alias || fallback || 'N/A').trim();
  };
  const addressText = formatAddress(company.address);
  const contactParts = compact(addressText, company.phone, company.email);
  const contactLine = contactParts.length ? contactParts.map(escapeHtml).join('&nbsp;&nbsp;|&nbsp;&nbsp;') : 'Contact details not available';
  const itemRows = items
    .map((item) => {
      const quantity = parseFloat(item.quantity ?? 0) || 0;
      const unitPrice = parseFloat(item.unitPrice ?? 0) || 0;
      const lineTotal = item.total != null ? parseFloat(item.total) || 0 : quantity * unitPrice;
      const productCode = getItemProductCode(item);
      const itemName = item.name || item.product?.name || item.variant?.name || 'Item';
      return `
      <tr>
        <td style="padding: 18px 16px; border-bottom: 1px solid ${borderColor}; text-align: left; color: ${headingColor}; font-size: 14px; line-height: 1.4;">${escapeHtml(itemName)}</td>
        <td style="padding: 18px 12px; border-bottom: 1px solid ${borderColor}; text-align: left; color: ${bodyColor}; font-size: 13px; line-height: 1.4;">${escapeHtml(productCode)}</td>
        <td style="padding: 18px 12px; border-bottom: 1px solid ${borderColor}; text-align: center; color: ${bodyColor}; font-size: 13px; line-height: 1.4;">${escapeHtml(formatQuantity(quantity))}</td>
        <td style="padding: 18px 12px; border-bottom: 1px solid ${borderColor}; text-align: right; color: ${bodyColor}; font-size: 13px; line-height: 1.4; white-space: nowrap;">${escapeHtml(money(unitPrice))}</td>
        <td style="padding: 18px 16px 18px 12px; border-bottom: 1px solid ${borderColor}; text-align: right; color: ${headingColor}; font-size: 13px; line-height: 1.4; white-space: nowrap;">${escapeHtml(money(lineTotal))}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${saleNum}</title>
  <style type="text/css">
    body, table, td, p { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    body { margin: 0; padding: 0; background-color: #eeeeee; color: ${headingColor}; }
    table { border-collapse: collapse; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #eeeeee;">
  <center style="width: 100%; background-color: #eeeeee; padding: 32px 12px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 720px; width: 100%; background-color: #ffffff; border: 1px solid ${borderColor};">
      <tr>
        <td style="padding: 40px 36px 28px; text-align: center;">
          ${logoUrl ? `<p style="margin: 0 0 16px 0;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" style="display: inline-block; max-height: 72px; max-width: 180px; height: auto; width: auto; border: 0;" /></p>` : `<p style="margin: 0 0 16px 0;"><span style="display: inline-block; min-width: 72px; height: 72px; padding: 0 12px; border: 1px solid ${borderColor}; border-radius: 9999px; background-color: ${receiptBg}; color: ${primaryColor}; font-size: 24px; line-height: 72px; font-weight: 700; letter-spacing: 2px; text-align: center;">${escapeHtml(logoInitials)}</span></p>`}
          <p style="margin: 0; color: ${primaryColor}; font-size: 30px; line-height: 1.2; font-weight: 700; letter-spacing: 4px; text-transform: uppercase;">${escapeHtml(companyName)}</p>
          <p style="margin: 14px 0 0 0; color: ${bodyColor}; font-size: 14px; line-height: 1.6;">${contactLine}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 36px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%;">
            <tr>
              <td style="width: 38%; border-top: 1px solid ${primaryColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
              <td style="width: 24%; text-align: center; color: ${primaryColor}; font-size: 18px; line-height: 1;">&#9670;</td>
              <td style="width: 38%; border-top: 1px solid ${primaryColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 28px 36px 34px; text-align: center;">
          <p style="margin: 0; color: #111111; font-family: Georgia, 'Times New Roman', serif; font-size: 48px; line-height: 1.1; font-weight: 700; letter-spacing: 10px;">RECEIPT</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 36px 34px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%;">
            <tr>
              <td style="width: 50%; padding: 0 24px 0 30px; text-align: left;">
                <p style="margin: 0 0 12px 0; color: ${bodyColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Receipt No.</p>
                <p style="margin: 0; color: #111111; font-size: 18px; line-height: 1.3; font-weight: 700;">${saleNum}</p>
              </td>
              <td style="width: 1px; background-color: ${borderColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
              <td style="width: 50%; padding: 0 30px 0 60px; text-align: left;">
                <p style="margin: 0 0 12px 0; color: ${bodyColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Date</p>
                <p style="margin: 0; color: #111111; font-size: 18px; line-height: 1.3; font-weight: 700;">${escapeHtml(dateStr)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 36px 26px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: ${receiptBg};">
                <th align="left" style="padding: 16px; border-top: 1px solid ${borderColor}; border-bottom: 1px solid ${borderColor}; color: ${primaryColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Item</th>
                <th align="left" style="padding: 16px 12px; border-top: 1px solid ${borderColor}; border-bottom: 1px solid ${borderColor}; color: ${primaryColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Product Code</th>
                <th align="center" style="padding: 16px 12px; border-top: 1px solid ${borderColor}; border-bottom: 1px solid ${borderColor}; color: ${primaryColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Qty</th>
                <th align="right" style="padding: 16px 12px; border-top: 1px solid ${borderColor}; border-bottom: 1px solid ${borderColor}; color: ${primaryColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase; white-space: nowrap;">Unit Price</th>
                <th align="right" style="padding: 16px 16px 16px 12px; border-top: 1px solid ${borderColor}; border-bottom: 1px solid ${borderColor}; color: ${primaryColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows || `<tr><td colspan="5" style="padding: 18px 16px; border-bottom: 1px solid ${borderColor}; color: ${mutedColor}; font-size: 14px; text-align: center;">No line items</td></tr>`}</tbody>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 36px 30px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%;">
            <tr>
              <td style="border-top: 1px solid ${borderColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
            </tr>
            <tr>
              <td align="right" style="padding: 32px 0 28px;">
                <span style="display: inline-block; margin-right: 24px; color: #111111; font-size: 14px; font-weight: 700; text-transform: uppercase;">Grand Total</span>
                <span style="display: inline-block; color: ${primaryColor}; font-size: 28px; line-height: 1.2; font-weight: 700;">${escapeHtml(money(total))}</span>
              </td>
            </tr>
            <tr>
              <td style="border-top: 2px solid ${primaryColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 36px 34px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%;">
            <tr>
              <td style="width: 50%; padding: 0 24px 0 66px; text-align: left;">
                <p style="margin: 0 0 12px 0; color: ${bodyColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Payment Method</p>
                <p style="margin: 0; color: #111111; font-size: 18px; line-height: 1.3;">${escapeHtml(formatPaymentMethod(sale?.paymentMethod))}</p>
              </td>
              <td style="width: 1px; background-color: ${borderColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
              <td style="width: 50%; padding: 0 24px 0 60px; text-align: left;">
                <p style="margin: 0 0 12px 0; color: ${bodyColor}; font-size: 13px; line-height: 1.2; text-transform: uppercase;">Amount Paid</p>
                <p style="margin: 0; color: #111111; font-size: 18px; line-height: 1.3;">${amountPaid == null ? 'Not recorded' : escapeHtml(money(amountPaid))}</p>
              </td>
            </tr>
            ${(balance > 0.009 || change > 0.009) ? `
            <tr>
              <td colspan="3" style="padding: 20px 0 0 0; text-align: center; color: ${bodyColor}; font-size: 13px; line-height: 1.5;">
                ${balance > 0.009 ? `Balance: <strong>${escapeHtml(money(balance))}</strong>` : ''}
                ${(balance > 0.009 && change > 0.009) ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : ''}
                ${change > 0.009 ? `Change: <strong>${escapeHtml(money(change))}</strong>` : ''}
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 34px 36px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%;">
            <tr>
              <td style="border-top: 1px solid ${borderColor}; line-height: 1px; font-size: 1px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 32px 0 0; text-align: center; color: ${bodyColor}; font-size: 13px; line-height: 1.6;">
                <p style="margin: 0 0 8px 0;">Thank you for your purchase!</p>
                ${customClosingNote ? `<p style="margin: 0 0 8px 0;">${escapeHtml(customClosingNote)}</p>` : ''}
                <p style="margin: 0;">&copy; ${currentYear} ${escapeHtml(companyName)}. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="height: 10px; line-height: 10px; font-size: 1px; background-color: ${primaryColor};">&nbsp;</td>
      </tr>
    </table>
  </center>
</body>
</html>`;

  const lines = items.map(
    (i) => {
      const quantity = parseFloat(i.quantity ?? 0) || 0;
      const unitPrice = parseFloat(i.unitPrice ?? 0) || 0;
      const lineTotal = i.total != null ? parseFloat(i.total) || 0 : quantity * unitPrice;
      const productCode = getItemProductCode(i);
      return `- ${i.name || i.product?.name || 'Item'} (Product Code: ${productCode}) x${formatQuantity(quantity)} @ ${money(unitPrice)} = ${money(lineTotal)}`;
    }
  );
  const text = [
    `Receipt - ${sale?.saleNumber || 'Sale'}`,
    `Date: ${dateStr}`,
    `Business: ${companyName}`,
    contactParts.length ? `Contact: ${contactParts.join(' | ')}` : '',
    '',
    ...lines,
    '',
    `Grand Total: ${money(total)}`,
    `Payment Method: ${formatPaymentMethod(sale?.paymentMethod)}`,
    `Amount Paid: ${amountPaid == null ? 'Not recorded' : money(amountPaid)}`,
    balance > 0.009 ? `Balance: ${money(balance)}` : '',
    change > 0.009 ? `Change: ${money(change)}` : '',
    '',
    'Thank you for your purchase!',
    customClosingNote,
    '',
    companyName
  ].filter((line) => line !== '').join('\n');

  return {
    subject: `Receipt - ${sale?.saleNumber || 'Purchase'}`,
    html,
    text
  };
};

/**
 * Customer order-created email (tenant sendMessage).
 * @returns {{ subject: string, html: string, text: string }}
 */
const orderCreatedEmail = (sale, customer = {}, company = {}, trackingLink = null) => {
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || company.logo || '';
  const d = EMAIL_DESIGN;
  const customerName = customer?.name || customer?.company || 'Customer';
  const orderNumber = sale?.saleNumber || 'your order';
  const total = formatCurrency(sale?.total || 0, sale?.currency || 'GHS');
  const delivery = sale?.metadata?.delivery;
  const deliveryLine = delivery?.required
    ? `<tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Delivery</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(delivery.label || 'Selected')} - ${formatCurrency(delivery.fee || 0, sale?.currency || 'GHS')}</td></tr>`
    : '';
  const trackUrl = String(trackingLink || '').trim();
  const trackButton = trackUrl
    ? `<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto 16px;">
      <tr>
        <td align="center" style="border-radius: ${d.buttonRadius}; background-color: ${primaryColor};">
          <a href="${escapeHtml(trackUrl)}" target="_blank" style="display: inline-block; padding: ${d.buttonPadding}; color: #ffffff !important; font-size: ${d.buttonSize}; font-weight: bold; text-decoration: none;">Track your order</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">Use order number <strong>${escapeHtml(orderNumber)}</strong> and your phone on the tracking page.</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.smallSize}; word-break: break-all; text-align: center;"><a href="${escapeHtml(trackUrl)}" target="_blank" style="color: ${d.linkColor};">${escapeHtml(trackUrl)}</a></p>`
    : '';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">Order received</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">We have received your order from ${escapeHtml(companyName)}.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Order number</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(orderNumber)}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Total</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(total)}</td></tr>
      ${deliveryLine}
    </table>
    ${trackButton}
    <p style="margin: 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">We will contact you with any updates.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
  const text = [
    `Hi ${customerName},`,
    '',
    `We have received your order from ${companyName}.`,
    `Order number: ${orderNumber}`,
    `Total: ${total}`,
    delivery?.required ? `Delivery: ${delivery.label || 'Selected'} - ${formatCurrency(delivery.fee || 0, sale?.currency || 'GHS')}` : '',
    trackUrl ? `Track your order: ${trackUrl}` : '',
    '',
    'We will contact you with any updates.',
    '',
    companyName
  ].filter((line) => line !== '').join('\n');

  return {
    subject: `Order received - ${orderNumber}`,
    html,
    text
  };
};

/**
 * Workspace task assigned (tenant sendMessage).
 * @returns {{ subject: string, html: string, text: string }}
 */
const workspaceTaskAssignedEmail = (assignee, actor, task, company = {}) => {
  const companyName = company.name || 'African Business Suite';
  const primaryColor = company.primaryColor || EMAIL_DESIGN.primaryColor;
  const logoUrl = company.logoUrl || company.logo || '';
  const d = EMAIL_DESIGN;
  const assigneeName = assignee?.name || 'there';
  const actorName = actor?.name || actor?.email || 'A teammate';
  const dueDateText = task?.dueDate
    ? formatDate(task.dueDate)
    : 'Not set';
  const title = task?.title || 'Task';

  const inner = `
    <h1 style="margin: 0 0 24px 0; font-size: ${d.headingSize}; font-weight: bold; color: ${d.headingColor}; line-height: 1.3;">New task assigned</h1>
    <p style="margin: 0 0 16px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;">Hi ${escapeHtml(assigneeName)},</p>
    <p style="margin: 0 0 24px 0; font-size: ${d.bodySize}; line-height: 1.6; color: ${d.bodyColor}; text-align: center;"><strong>${escapeHtml(actorName)}</strong> assigned you a task.</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Task</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(title)}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Status</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(task?.status || 'todo')}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Priority</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(task?.priority || 'Not set')}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};"><strong>Due date</strong></td><td style="padding: 12px; border-bottom: 1px solid ${d.borderColor};">${escapeHtml(dueDateText)}</td></tr>
    </table>
    <p style="margin: 0; font-size: ${d.smallSize}; color: ${d.mutedColor}; text-align: center;">Open <strong>Tasks</strong> in your workspace to view details and update progress.</p>
  `;
  const html = sellfyCardTemplate(inner, { companyName, primaryColor, logoUrl });
  const text = [
    `Hi ${assigneeName},`,
    '',
    `${actorName} assigned you a task.`,
    `Task: ${title}`,
    `Status: ${task?.status || 'todo'}`,
    `Priority: ${task?.priority || 'Not set'}`,
    `Due date: ${dueDateText}`,
    '',
    'Open Tasks in your workspace to view details and update progress.',
    '',
    companyName
  ].join('\n');

  return {
    subject: `New task assigned: ${title}`,
    html,
    text
  };
};

module.exports = {
  baseTemplate,
  sellfyCardTemplate,
  escapeHtml,
  activityNotificationCard,
  emailOtpCode,
  marketingPlainMessageEmail,
  marketingPlainMessageDisclaimer,
  paystackMomoLinkedEmail,
  paystackBankLinkedEmail,
  saleReceiptEmail,
  orderCreatedEmail,
  workspaceTaskAssignedEmail,
  formatCurrency,
  formatDate,
  invoiceNotification,
  jobTrackingNotification,
  jobDueSoonReminder,
  jobAssignedNotifyAssignee,
  invoicePaidConfirmation,
  paymentReminder,
  quoteNotification,
  quoteAcceptedNotifyTenant,
  welcomeEmail,
  inviteEmail,
  inviteTenantEmail,
  passwordReset,
  emailVerification,
  lowStockAlert
};
