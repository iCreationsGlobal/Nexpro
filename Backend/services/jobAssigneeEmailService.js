const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const { Tenant } = require('../models');
const { getTenantLogoUrl } = require('../utils/tenantLogo');

/**
 * Sends tenant SMTP email to the job assignee when a job is created or reassigned.
 * Does not use notification preference toggles (transactional). Skips self-assignment.
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {Object} params.job - Sequelize job (plain or model) with id, jobNumber, title, etc.
 * @param {Object} params.assignee - User with id, email, name
 * @param {Object|null} params.assignedByUser - req.user (optional)
 * @returns {Promise<void>}
 */
async function sendJobAssignedEmailToAssignee({ tenantId, job, assignee, assignedByUser = null }) {
  try {
    if (!tenantId || !job?.id || !assignee?.email) return;
    if (assignedByUser?.id && assignee.id === assignedByUser.id) return;

    const tenant = await Tenant.findByPk(tenantId, {
      attributes: ['id', 'name', 'metadata']
    });
    const company = {
      name: tenant?.name || 'African Business Suite',
      logo: getTenantLogoUrl(tenant),
      primaryColor: tenant?.metadata?.primaryColor || '#166534'
    };
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const jobUrl = `${frontendUrl}/jobs/${job.id}`;

    const jobPlain = typeof job.toJSON === 'function' ? job.toJSON() : job;
    const customer = jobPlain.customer || null;

    const { subject, html, text } = emailTemplates.jobAssignedNotifyAssignee(
      jobPlain,
      assignee,
      customer,
      jobUrl,
      company,
      assignedByUser
    );

    const result = await emailService.sendMessage(tenantId, assignee.email, subject, html, text);
    if (!result?.success) {
      console.warn(
        `[JobAssigneeEmail] send failed tenantId=${tenantId} jobId=${job.id} error=${result?.error || 'unknown'}`
      );
    }
  } catch (e) {
    console.error(`[JobAssigneeEmail] Error jobId=${job?.id}:`, e?.message || e);
  }
}

module.exports = { sendJobAssignedEmailToAssignee };
