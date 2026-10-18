const crypto = require('crypto');
const { Job, JobItem, Customer, Setting, Tenant } = require('../models');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { buildCustomerFacingJobTitle } = require('../utils/jobCustomerMessageText');
const { emitBusinessEvent } = require('./businessEvents');

const JOB_INVOICE_DEFAULTS = {
  autoSendInvoiceOnJobCreation: false,
  customerJobTrackingEnabled: false,
  emailCustomerJobTrackingOnJobCreation: false,
  smsCustomerJobTrackingOnJobCreation: false,
  // Legacy key kept false: product cost must not create Expense (COGS handles cost).
  autoCreateExpenseFromProductCost: false
};

/**
 * @param {string} tenantId
 * @returns {Promise<typeof JOB_INVOICE_DEFAULTS & Record<string, unknown>>}
 */
async function getJobInvoiceSettingValue(tenantId) {
  const row = await Setting.findOne({ where: { tenantId, key: 'job-invoice' } });
  return { ...JOB_INVOICE_DEFAULTS, ...(row?.value || {}) };
}

/**
 * Ensure workspace job has a public view token for tracking links.
 * @param {string} jobId
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
async function ensureJobViewToken(jobId, tenantId) {
  const job = await Job.findOne({ where: applyTenantFilter(tenantId, { id: jobId }) });
  if (!job?.tenantId) return null;
  if (job.viewToken) return job.viewToken;
  const viewToken = crypto.randomBytes(32).toString('hex');
  await job.update({ viewToken });
  return viewToken;
}

/**
 * Load job + branding context for customer tracking notifications.
 * @param {string} tenantId
 * @param {string} jobId
 * @returns {Promise<{ job: object|null, company: object, trackUrl: string|null }>}
 */
async function loadJobTrackingNotificationContext(tenantId, jobId) {
  const job = await Job.findOne({
    where: applyTenantFilter(tenantId, { id: jobId }),
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'company', 'email', 'phone', 'smsConsent']
      },
      { model: JobItem, as: 'items', attributes: ['description'], required: false }
    ]
  });
  if (!job) {
    return { job: null, company: {}, trackUrl: null };
  }

  const viewToken = await ensureJobViewToken(job.id, tenantId);
  if (!viewToken) {
    return { job, company: {}, trackUrl: null };
  }

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const trackUrl = `${frontendUrl}/track-job/${viewToken}`;

  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'metadata'] });
  const orgRow = await Setting.findOne({ where: { tenantId, key: 'organization' } });
  const org = orgRow?.value || {};
  const company = {
    name: org.name || tenant?.name || 'Your service provider',
    logo: org.logoUrl || getTenantLogoUrl(tenant),
    primaryColor: org.primaryColor || tenant?.metadata?.primaryColor || '#166534'
  };

  return { job, company, trackUrl };
}

/**
 * Email customer a link to track their job when workspace settings allow it.
 * @param {{ tenantId: string, jobId: string, triggeredByUserId: string|null }} params
 */
async function maybeSendJobTrackingEmailOnJobCreated({ tenantId, jobId, triggeredByUserId }) {
  const flags = await getJobInvoiceSettingValue(tenantId);
  if (flags.customerJobTrackingEnabled !== true || flags.emailCustomerJobTrackingOnJobCreation !== true) {
    return;
  }

  const { job, company, trackUrl } = await loadJobTrackingNotificationContext(tenantId, jobId);
  if (!job?.customer?.email || !trackUrl) return;

  const emailTemplates = require('./emailTemplates');
  const emailService = require('./emailService');
  const { subject, html, text } = emailTemplates.jobTrackingNotification(job, job.customer, trackUrl, company);

  await emailService.sendMessage(tenantId, job.customer.email, subject, html, text);
}

/**
 * SMS customer a link to track their job when workspace settings allow it.
 * @param {{ tenantId: string, jobId: string, triggeredByUserId: string|null }} params
 */
async function maybeSendJobTrackingSmsOnJobCreated({ tenantId, jobId, triggeredByUserId }) {
  const flags = await getJobInvoiceSettingValue(tenantId);
  if (flags.customerJobTrackingEnabled !== true || flags.smsCustomerJobTrackingOnJobCreation !== true) {
    return;
  }

  const { job, company, trackUrl } = await loadJobTrackingNotificationContext(tenantId, jobId);
  if (!job?.customer?.phone || !trackUrl) return;
  if (job.customer.smsConsent === false) return;

  const smsService = require('./smsService');
  const smsConfig = await smsService.getResolvedConfig(tenantId);
  const smsPhone = smsService.validatePhoneNumber(job.customer.phone);
  if (!smsConfig || !smsPhone) return;

  const smsTemplateService = require('./smsTemplateService');
  const customerName = job.customer?.name || job.customer?.company || 'Customer';
  const jobNumber = job.jobNumber || 'your job';
  const jobTitle = buildCustomerFacingJobTitle(job);
  const variables = {
    customerName,
    businessName: company.name,
    jobNumber,
    jobTitle,
    trackingLink: trackUrl,
  };
  const smsMessage = await smsTemplateService.renderForTenant(tenantId, 'job_tracking_created', variables)
    || `Hi ${customerName}, ${company.name} created job ${jobNumber}. Track here: ${trackUrl}`;

  await smsService.sendMessage(tenantId, smsPhone, smsMessage);
}

/**
 * After job creation: report job.created and send configured customer tracking notifications.
 * @param {{ tenantId: string, jobId: string, triggeredByUserId: string|null }} params
 */
async function maybeSendJobTrackingNotificationsOnJobCreated(params) {
  const { tenantId, jobId } = params;

  emitBusinessEvent(tenantId, 'job.created', { jobId });

  await Promise.allSettled([
    maybeSendJobTrackingEmailOnJobCreated(params),
    maybeSendJobTrackingSmsOnJobCreated(params),
  ]);
}

module.exports = {
  getJobInvoiceSettingValue,
  ensureJobViewToken,
  loadJobTrackingNotificationContext,
  maybeSendJobTrackingEmailOnJobCreated,
  maybeSendJobTrackingSmsOnJobCreated,
  maybeSendJobTrackingNotificationsOnJobCreated,
  JOB_INVOICE_DEFAULTS
};
