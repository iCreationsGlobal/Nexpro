const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Customer, Lead, MarketingCampaign, Sale, Setting, Tenant } = require('../models');
const emailTemplates = require('../services/emailTemplates');
const { applyTenantFilter } = require('../utils/tenantUtils');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const whatsappService = require('../services/whatsappService');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { applySmsTemplate } = require('../utils/smsTemplateMerge');
const {
  enrichCapabilitiesWithVerification,
  applyVerificationAfterBroadcast,
} = require('../services/marketingChannelVerification');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_BROADCAST_RECIPIENTS = 2000;
const MAX_FAILED_SAMPLES = 40;
const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'sent', 'failed']);

/**
 * Email is “available” only when Settings → Email is enabled and has outbound credentials
 * (SMTP host, SendGrid, or SES). A company profile email alone does not send mail.
 * Matches GET /api/settings/notification-channels `email` flag.
 *
 * @param {string} tenantId
 * @returns {Promise<{ email: { available: boolean, businessProfileEmailSet: boolean }, sms: { available: boolean }, whatsapp: { available: boolean } }>}
 */
async function resolveCapabilities(tenantId) {
  const [emailCfg, smsCfg, waCfg, orgSetting, emailSettingRow] = await Promise.all([
    emailService.getConfig(tenantId),
    smsService.getResolvedConfig(tenantId),
    whatsappService.getConfig(tenantId),
    Setting.findOne({
      where: { tenantId, key: 'organization' },
      attributes: ['value'],
    }),
    Setting.findOne({
      where: { tenantId, key: 'email' },
      attributes: ['value'],
    }),
  ]);
  const ev = emailCfg || {};
  const emailAvailable = !!(
    emailCfg &&
    (ev.smtpHost || ev.sendgridApiKey || ev.sesAccessKeyId || ev.resendApiKey)
  );
  const orgEmail = (orgSetting?.value?.email || '').trim();
  const businessProfileEmailSet = EMAIL_REGEX.test(orgEmail);
  const rawEmail = emailSettingRow?.value || {};
  console.log(
    `[Marketing][capabilities] marketingEmailAvailable=${emailAvailable} businessProfileEmailSet=${businessProfileEmailSet} ` +
      `${emailService.formatTenantEmailAudit(tenantId, rawEmail)}`
  );
  return {
    email: { available: emailAvailable, businessProfileEmailSet },
    sms: { available: !!smsCfg },
    whatsapp: { available: !!waCfg },
  };
}

function customerDisplayName(c) {
  return (c.name && String(c.name).trim()) || (c.company && String(c.company).trim()) || 'Customer';
}

function leadDisplayName(l) {
  return (l.name && String(l.name).trim()) || (l.company && String(l.company).trim()) || 'Lead';
}

function normalizeAudienceType(value) {
  return value === 'lead' ? 'lead' : 'customer';
}

/**
 * Unified per-row view over Customer/Lead rows so preview/broadcast logic can stay audience-agnostic.
 * Leads have no per-channel consent columns like Customer does — `doNotContact` is the single suppression flag.
 */
function getRowMeta(row, audienceType) {
  if (audienceType === 'lead') {
    const allowed = row.doNotContact !== true;
    return {
      id: row.id,
      name: leadDisplayName(row),
      company: row.company,
      email: row.email,
      phone: row.phone,
      balance: null,
      marketingAllowed: allowed,
      smsAllowed: allowed,
      whatsappAllowed: allowed,
      consent: { marketing: allowed, sms: allowed, whatsapp: allowed },
    };
  }
  const marketingAllowed = row.marketingConsent === true;
  return {
    id: row.id,
    name: customerDisplayName(row),
    company: row.company,
    email: row.email,
    phone: row.phone,
    balance: row.balance,
    marketingAllowed,
    smsAllowed: marketingAllowed && row.smsConsent !== false,
    whatsappAllowed: marketingAllowed && row.whatsappConsent !== false,
    consent: { marketing: row.marketingConsent, sms: row.smsConsent, whatsapp: row.whatsappConsent },
  };
}

/**
 * Load customers for broadcast (newest first), capped.
 * @returns {Promise<{ rows: object[], total: number, truncated: boolean }>}
 */
async function loadCustomersForBroadcast(tenantId, activeOnly, options = {}) {
  const {
    customerIds,
    marketingConsentOnly = false,
    lastPurchaseWindowDays,
    inactiveDays,
    owingOnly = false,
    hasEmail = false,
    hasPhone = false,
  } = options;
  const where = applyTenantFilter(tenantId, activeOnly ? { isActive: true } : {});
  if (Array.isArray(customerIds) && customerIds.length > 0) {
    where.id = { [Op.in]: customerIds };
  }
  if (marketingConsentOnly) {
    where.marketingConsent = true;
  }
  if (owingOnly) {
    where.balance = { [Op.gt]: 0 };
  }
  if (hasEmail) {
    where.email = nonEmptyClause();
  }
  if (hasPhone) {
    where.phone = nonEmptyClause();
  }
  const total = await Customer.count({ where });
  let rows = await Customer.findAll({
    where,
    attributes: [
      'id',
      'name',
      'company',
      'email',
      'phone',
      'balance',
      'isActive',
      'marketingConsent',
      'smsConsent',
      'whatsappConsent',
      'createdAt',
      'updatedAt',
    ],
    order: [['createdAt', 'DESC']],
    limit: MAX_BROADCAST_RECIPIENTS,
  });

  const hasPurchaseFilters = Number(lastPurchaseWindowDays) > 0 || Number(inactiveDays) > 0;
  if (hasPurchaseFilters && rows.length > 0) {
    const ids = rows.map((row) => row.id);
    const sales = await Sale.findAll({
      where: { tenantId, customerId: { [Op.in]: ids } },
      attributes: ['customerId', [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastPurchaseAt']],
      group: ['customerId'],
      raw: true,
    });
    const lastPurchaseByCustomer = new Map(
      sales.map((row) => [String(row.customerId), row.lastPurchaseAt ? new Date(row.lastPurchaseAt) : null])
    );

    if (Number(lastPurchaseWindowDays) > 0) {
      const cutoff = new Date(Date.now() - Number(lastPurchaseWindowDays) * 24 * 60 * 60 * 1000);
      rows = rows.filter((row) => {
        const last = lastPurchaseByCustomer.get(String(row.id));
        return last && last >= cutoff;
      });
    }

    if (Number(inactiveDays) > 0) {
      const cutoff = new Date(Date.now() - Number(inactiveDays) * 24 * 60 * 60 * 1000);
      rows = rows.filter((row) => {
        const last = lastPurchaseByCustomer.get(String(row.id));
        return !last || last < cutoff;
      });
    }
  }
  return { rows, total, truncated: total > MAX_BROADCAST_RECIPIENTS };
}

/**
 * Load leads for broadcast (newest first), capped. Leads have no purchase/consent columns —
 * eligibility is just isActive + not doNotContact, optionally narrowed by pipeline fields.
 * @returns {Promise<{ rows: object[], total: number, truncated: boolean }>}
 */
async function loadLeadsForBroadcast(tenantId, options = {}) {
  const {
    leadIds,
    activeOnly = true,
    status,
    source,
    priority,
    assignedTo,
    hasEmail = false,
    hasPhone = false,
  } = options;
  const where = { tenantId };
  if (activeOnly) where.isActive = true;
  if (Array.isArray(leadIds) && leadIds.length > 0) {
    where.id = { [Op.in]: leadIds };
  }
  if (status) where.status = status;
  if (source) where.source = source;
  if (priority) where.priority = priority;
  if (assignedTo) where.assignedTo = assignedTo;
  if (hasEmail) where.email = nonEmptyClause();
  if (hasPhone) where.phone = nonEmptyClause();

  const total = await Lead.count({ where });
  const rows = await Lead.findAll({
    where,
    attributes: [
      'id',
      'name',
      'company',
      'email',
      'phone',
      'status',
      'source',
      'priority',
      'doNotContact',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    order: [['createdAt', 'DESC']],
    limit: MAX_BROADCAST_RECIPIENTS,
  });
  return { rows, total, truncated: total > MAX_BROADCAST_RECIPIENTS };
}

async function loadRecipientsForBroadcast(tenantId, audienceType, filters) {
  if (audienceType === 'lead') {
    return loadLeadsForBroadcast(tenantId, filters);
  }
  return loadCustomersForBroadcast(tenantId, filters.activeOnly, filters);
}

/** Sequelize where-clause fragment matching a non-null, non-empty column. */
function nonEmptyClause() {
  return { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function pushFailure(bucket, customerId, reason, cap = MAX_FAILED_SAMPLES) {
  if (bucket.length >= cap) return;
  bucket.push({ customerId, reason: String(reason).slice(0, 200) });
}

function normalizeChannels(channels) {
  const list = Array.isArray(channels) ? channels.map((c) => String(c).toLowerCase()) : [];
  const allowed = new Set(['email', 'sms', 'whatsapp']);
  return [...new Set(list.filter((c) => allowed.has(c)))];
}

function normalizeAudienceFilter(input = {}) {
  return {
    activeOnly: input.activeOnly !== false,
    marketingConsentOnly: Boolean(input.marketingConsentOnly),
    lastPurchaseWindowDays: Number(input.lastPurchaseWindowDays) > 0 ? Number(input.lastPurchaseWindowDays) : null,
    owingOnly: Boolean(input.owingOnly),
    inactiveDays: Number(input.inactiveDays) > 0 ? Number(input.inactiveDays) : null,
    hasEmail: input.hasEmail === true || input.hasEmail === 'true',
    hasPhone: input.hasPhone === true || input.hasPhone === 'true',
    customerIds: Array.isArray(input.customerIds) ? input.customerIds.map((id) => String(id)) : undefined,
  };
}

const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'lost', 'converted']);
const LEAD_PRIORITIES = new Set(['low', 'medium', 'high']);

function normalizeLeadAudienceFilter(input = {}) {
  return {
    activeOnly: input.activeOnly !== false,
    hasEmail: input.hasEmail === true || input.hasEmail === 'true',
    hasPhone: input.hasPhone === true || input.hasPhone === 'true',
    status: LEAD_STATUSES.has(input.status) ? input.status : null,
    source: input.source ? String(input.source).trim() : null,
    priority: LEAD_PRIORITIES.has(input.priority) ? input.priority : null,
    assignedTo: input.assignedTo ? String(input.assignedTo) : null,
    leadIds: Array.isArray(input.leadIds) ? input.leadIds.map((id) => String(id)) : undefined,
  };
}

const MAX_CAMPAIGN_TAGS = 10;

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const tag = String(raw ?? '').trim().slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= MAX_CAMPAIGN_TAGS) break;
  }
  return out;
}

function normalizeMessageContent(input = {}) {
  return {
    subject: input.subject ? String(input.subject).trim() : '',
    emailBody: input.emailBody ? String(input.emailBody) : '',
    smsBody: input.smsBody ? String(input.smsBody).trim().substring(0, 480) : '',
    whatsappTemplateName: input.whatsappTemplateName ? String(input.whatsappTemplateName).trim() : '',
    whatsappLanguage: String(input.whatsappLanguage || 'en').trim() || 'en',
    whatsappParameters: Array.isArray(input.whatsappParameters)
      ? input.whatsappParameters.map((p) => String(p ?? ''))
      : [],
    whatsappPrependCustomerName: Boolean(input.whatsappPrependCustomerName),
  };
}

function getCampaignSendPayload(campaign) {
  const messageContent = campaign.messageContent || {};
  const audienceFilter = campaign.audienceFilter || {};
  const audienceType = normalizeAudienceType(campaign.audienceType);
  return {
    audienceType,
    channels: campaign.channels || [],
    ...audienceFilter,
    ...messageContent,
    customerIds: audienceType === 'lead' ? undefined : audienceFilter.customerIds,
    leadIds: audienceType === 'lead' ? audienceFilter.leadIds : undefined,
  };
}

function buildCampaignSnapshot(preview, selectedChannels) {
  return {
    capturedAt: new Date().toISOString(),
    totalInWorkspace: preview.totalInWorkspace,
    batchSize: preview.batchSize,
    truncated: preview.truncated,
    maxRecipients: preview.maxRecipients,
    selectedChannels,
    eligible: preview.eligible,
    warnings: preview.consentWarnings,
    contacts: (preview.contacts || []).map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      consent: c.consent,
      eligibleChannels: c.eligibleChannels,
    })),
  };
}

function summarizeStats(result) {
  const stats = {};
  for (const ch of ['email', 'sms', 'whatsapp']) {
    const block = result[ch] || {};
    stats[ch] = {
      sent: Number(block.sent || 0),
      delivered: Number(block.delivered || 0),
      failed: Array.isArray(block.failed) ? block.failed.length : Number(block.failed || 0),
      skipped: Number(block.skipped || 0),
    };
  }
  stats.totalSent = stats.email.sent + stats.sms.sent + stats.whatsapp.sent;
  stats.totalFailed = stats.email.failed + stats.sms.failed + stats.whatsapp.failed;
  stats.totalSkipped = stats.email.skipped + stats.sms.skipped + stats.whatsapp.skipped;
  return stats;
}

async function buildPreviewData(tenantId, query = {}) {
  const audienceType = normalizeAudienceType(query.audienceType);
  const audienceFilter = audienceType === 'lead'
    ? normalizeLeadAudienceFilter({
        activeOnly: query.activeOnly !== 'false' && query.activeOnly !== false,
        hasEmail: query.hasEmail,
        hasPhone: query.hasPhone,
        status: query.status,
        source: query.source,
        priority: query.priority,
        assignedTo: query.assignedTo,
        leadIds: query.leadIds,
      })
    : normalizeAudienceFilter({
        activeOnly: query.activeOnly !== 'false' && query.activeOnly !== false,
        marketingConsentOnly: query.marketingConsentOnly === 'true' || query.marketingConsentOnly === true,
        lastPurchaseWindowDays: query.lastPurchaseWindowDays,
        owingOnly: query.owingOnly === 'true' || query.owingOnly === true,
        inactiveDays: query.inactiveDays,
        hasEmail: query.hasEmail,
        hasPhone: query.hasPhone,
        customerIds: query.customerIds,
      });
  const channels = normalizeChannels(query.channels);
  const { rows, total, truncated } = await loadRecipientsForBroadcast(tenantId, audienceType, audienceFilter);

  const seenEmails = new Set();
  const seenSmsPhones = new Set();
  const seenWaPhones = new Set();
  const counts = {
    withEmail: 0,
    withSmsPhone: 0,
    withWhatsappPhone: 0,
    eligible: { email: 0, sms: 0, whatsapp: 0 },
    consentWarnings: {
      marketingConsentRequired: 0,
      smsOptedOut: 0,
      whatsappOptedOut: 0,
      missingEmail: 0,
      missingPhone: 0,
    },
  };

  const contacts = rows.map((row) => {
    const meta = getRowMeta(row, audienceType);
    const em = normalizeEmail(meta.email);
    const smsPhone = smsService.validatePhoneNumber(meta.phone);
    const waPhone = whatsappService.validatePhoneNumber(meta.phone);
    const hasEmail = Boolean(em && EMAIL_REGEX.test(em));
    const hasSmsPhone = Boolean(smsPhone);
    const hasWaPhone = Boolean(waPhone);
    const emailEligible = hasEmail && meta.marketingAllowed && !seenEmails.has(em);
    const smsEligible = hasSmsPhone && meta.smsAllowed && !seenSmsPhones.has(smsPhone);
    const whatsappEligible = hasWaPhone && meta.whatsappAllowed && !seenWaPhones.has(waPhone);

    if (hasEmail && !seenEmails.has(em)) counts.withEmail += 1;
    if (hasSmsPhone && !seenSmsPhones.has(smsPhone)) counts.withSmsPhone += 1;
    if (hasWaPhone && !seenWaPhones.has(waPhone)) counts.withWhatsappPhone += 1;
    if (emailEligible) {
      counts.eligible.email += 1;
      seenEmails.add(em);
    }
    if (smsEligible) {
      counts.eligible.sms += 1;
      seenSmsPhones.add(smsPhone);
    }
    if (whatsappEligible) {
      counts.eligible.whatsapp += 1;
      seenWaPhones.add(waPhone);
    }
    if (!meta.marketingAllowed) counts.consentWarnings.marketingConsentRequired += 1;
    if (meta.consent.sms === false) counts.consentWarnings.smsOptedOut += 1;
    if (meta.consent.whatsapp === false) counts.consentWarnings.whatsappOptedOut += 1;
    if (!hasEmail) counts.consentWarnings.missingEmail += 1;
    if (!hasSmsPhone && !hasWaPhone) counts.consentWarnings.missingPhone += 1;

    return {
      id: meta.id,
      name: meta.name,
      company: meta.company,
      email: meta.email,
      phone: meta.phone,
      balance: meta.balance,
      consent: meta.consent,
      eligibleChannels: {
        email: emailEligible,
        sms: smsEligible,
        whatsapp: whatsappEligible,
      },
    };
  });

  const baseCaps = await resolveCapabilities(tenantId);
  const capabilities = await enrichCapabilitiesWithVerification(tenantId, baseCaps);

  return {
    audienceType,
    totalInWorkspace: total,
    batchSize: rows.length,
    truncated,
    maxRecipients: MAX_BROADCAST_RECIPIENTS,
    withEmail: counts.withEmail,
    withSmsPhone: counts.withSmsPhone,
    withWhatsappPhone: counts.withWhatsappPhone,
    eligible: counts.eligible,
    consentWarnings: counts.consentWarnings,
    requestedChannels: channels,
    capabilities,
    contacts,
  };
}

// @desc    Which marketing channels are configured for this tenant
// @route   GET /api/marketing/capabilities
// @access  Private (admin, manager)
exports.getCapabilities = async (req, res, next) => {
  try {
    const base = await resolveCapabilities(req.tenantId);
    const data = await enrichCapabilitiesWithVerification(req.tenantId, base);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    Recipient counts for current workspace customers
// @route   GET /api/marketing/preview
// @access  Private (admin, manager)
exports.getPreview = async (req, res, next) => {
  try {
    const data = await buildPreviewData(req.tenantId, req.query || {});
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

async function executeBroadcast(req, payload, options = {}) {
  const {
    campaign = null,
    updateCampaign = false,
  } = options;
  const audienceType = normalizeAudienceType(payload?.audienceType ?? campaign?.audienceType);
  const {
    channels = [],
    activeOnly = true,
    dryRun = false,
    customerIds: rawCustomerIds,
    leadIds: rawLeadIds,
  } = payload || {};
  const message = normalizeMessageContent(payload || {});

  const rawRecipientIds = audienceType === 'lead' ? rawLeadIds : rawCustomerIds;
  const recipientLabel = audienceType === 'lead' ? 'leadIds' : 'customerIds';
  let recipientIdFilter = null;
  if (rawRecipientIds !== undefined && rawRecipientIds !== null) {
    if (!Array.isArray(rawRecipientIds)) {
      const error = new Error(`${recipientLabel} must be an array of IDs`);
      error.statusCode = 400;
      throw error;
    }
    if (rawRecipientIds.length === 0) {
      const error = new Error('Select at least one contact to message');
      error.statusCode = 400;
      throw error;
    }
    if (rawRecipientIds.length > MAX_BROADCAST_RECIPIENTS) {
      const error = new Error(`At most ${MAX_BROADCAST_RECIPIENTS} recipients per broadcast`);
      error.statusCode = 400;
      throw error;
    }
    recipientIdFilter = rawRecipientIds.map((id) => String(id));
  }

  const normalizedChannels = normalizeChannels(channels);
  if (normalizedChannels.length === 0) {
    const error = new Error('Select at least one channel: email, sms, or whatsapp');
    error.statusCode = 400;
    throw error;
  }

  const capabilities = await resolveCapabilities(req.tenantId);
  for (const ch of normalizedChannels) {
    if (!capabilities[ch]?.available) {
      const error = new Error(`Channel "${ch}" is not configured for this workspace. Configure it in Settings first.`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (normalizedChannels.includes('email')) {
    if (!message.subject) {
      const error = new Error('Email subject is required');
      error.statusCode = 400;
      throw error;
    }
    if (!message.emailBody.trim()) {
      const error = new Error('Email body is required');
      error.statusCode = 400;
      throw error;
    }
  }

  if (normalizedChannels.includes('sms') && !message.smsBody) {
    const error = new Error('SMS message is required');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedChannels.includes('whatsapp') && !message.whatsappTemplateName) {
    const error = new Error('WhatsApp requires a Meta-approved template name (whatsappTemplateName)');
    error.statusCode = 400;
    throw error;
  }

  const audienceFilter = audienceType === 'lead'
    ? normalizeLeadAudienceFilter({
        activeOnly: Boolean(activeOnly),
        hasEmail: payload.hasEmail,
        hasPhone: payload.hasPhone,
        status: payload.status,
        source: payload.source,
        priority: payload.priority,
        assignedTo: payload.assignedTo,
        leadIds: recipientIdFilter,
      })
    : normalizeAudienceFilter({
        activeOnly: Boolean(activeOnly),
        marketingConsentOnly: payload.marketingConsentOnly,
        lastPurchaseWindowDays: payload.lastPurchaseWindowDays,
        owingOnly: payload.owingOnly,
        inactiveDays: payload.inactiveDays,
        hasEmail: payload.hasEmail,
        hasPhone: payload.hasPhone,
        customerIds: recipientIdFilter,
      });
  const { rows, total, truncated } = await loadRecipientsForBroadcast(req.tenantId, audienceType, audienceFilter);

  if (rows.length === 0) {
    const error = new Error('No matching contacts in the current audience. Refresh the list or adjust your filters.');
    error.statusCode = 400;
    throw error;
  }

  const result = {
    campaignId: campaign?.id || null,
    dryRun: Boolean(dryRun),
    totalInWorkspace: total,
    batchSize: rows.length,
    truncated,
    channels: normalizedChannels,
    email: { sent: 0, delivered: 0, skipped: 0, failed: [] },
    sms: { sent: 0, delivered: 0, skipped: 0, failed: [] },
    whatsapp: { sent: 0, delivered: 0, skipped: 0, failed: [] },
  };

  const tenantRow = message.emailBody
    ? await Tenant.findByPk(req.tenantId, { attributes: ['name', 'metadata'] })
    : null;
  const company = {
    name: tenantRow?.name || 'Your business',
    primaryColor: tenantRow?.metadata?.primaryColor || '#166534',
    logoUrl: getTenantLogoUrl(tenantRow),
    audience: audienceType === 'lead' ? 'lead' : 'customer',
  };
  const seenEmails = new Set();
  const seenSmsPhones = new Set();
  const seenWaPhones = new Set();
  const pendingEmailSends = [];

  for (const row of rows) {
    const meta = getRowMeta(row, audienceType);
    const mergeVars = { name: meta.name, businessName: company?.name || req.tenant?.name || '' };

    if (normalizedChannels.includes('email')) {
      const em = normalizeEmail(meta.email);
      if (!em || !EMAIL_REGEX.test(em) || seenEmails.has(em) || !meta.marketingAllowed) {
        result.email.skipped += 1;
      } else if (dryRun) {
        seenEmails.add(em);
        result.email.sent += 1;
      } else {
        seenEmails.add(em);
        const personalizedSubject = applySmsTemplate(message.subject, mergeVars);
        const personalizedBody = applySmsTemplate(message.emailBody, mergeVars);
        pendingEmailSends.push({
          recipientId: meta.id,
          to: em,
          subject: personalizedSubject,
          html: emailTemplates.marketingPlainMessageEmail(personalizedBody, company),
          text: personalizedBody.trim(),
        });
      }
    }

    if (normalizedChannels.includes('sms')) {
      const ph = smsService.validatePhoneNumber(meta.phone);
      if (!ph || seenSmsPhones.has(ph) || !meta.smsAllowed) {
        result.sms.skipped += 1;
      } else if (dryRun) {
        seenSmsPhones.add(ph);
        result.sms.sent += 1;
      } else {
        const smsBody = applySmsTemplate(message.smsBody, mergeVars);
        const sendRes = await smsService.sendMessage(req.tenantId, ph, smsBody, null, {
          source: 'marketing_campaign',
          context: { campaignId: campaign?.id || null, customerId: meta.id },
        });
        seenSmsPhones.add(ph);
        if (sendRes.success) {
          result.sms.sent += 1;
        } else {
          pushFailure(result.sms.failed, meta.id, sendRes.error || 'send failed');
        }
      }
    }

    if (normalizedChannels.includes('whatsapp')) {
      const ph = whatsappService.validatePhoneNumber(meta.phone);
      if (!ph || seenWaPhones.has(ph) || !meta.whatsappAllowed) {
        result.whatsapp.skipped += 1;
      } else {
        const params = message.whatsappPrependCustomerName
          ? [meta.name, ...message.whatsappParameters]
          : [...message.whatsappParameters];
        if (dryRun) {
          seenWaPhones.add(ph);
          result.whatsapp.sent += 1;
        } else {
          const sendRes = await whatsappService.sendMessage(
            req.tenantId,
            ph,
            message.whatsappTemplateName,
            params,
            message.whatsappLanguage,
            {
              category: 'marketing',
              campaignId: campaign?.id || null,
              metadata: { campaignId: campaign?.id || null, source: 'marketing_campaign' },
            }
          );
          seenWaPhones.add(ph);
          if (sendRes.success) {
            result.whatsapp.sent += 1;
          } else {
            pushFailure(result.whatsapp.failed, meta.id, sendRes.error || 'send failed');
          }
        }
      }
    }
  }

  if (!dryRun && pendingEmailSends.length > 0) {
    const mailJobs = pendingEmailSends.map((p) => ({
      to: p.to,
      subject: p.subject,
      html: p.html,
      text: p.text,
    }));
    const bulkResults = await emailService.sendBulkTenantEmails(req.tenantId, mailJobs);
    bulkResults.forEach((r, i) => {
      const cid = pendingEmailSends[i].recipientId;
      if (r.success) {
        result.email.sent += 1;
      } else {
        pushFailure(result.email.failed, cid, r.error || 'send failed');
      }
    });
  }

  try {
    await applyVerificationAfterBroadcast(req.tenantId, result.dryRun, result);
  } catch (verifyErr) {
    console.warn('[Marketing] applyVerificationAfterBroadcast:', verifyErr?.message || verifyErr);
  }

  if (campaign && updateCampaign) {
    const preview = await buildPreviewData(req.tenantId, {
      ...audienceFilter,
      audienceType,
      channels: normalizedChannels,
    });
    const stats = summarizeStats(result);
    const nextStatus = dryRun ? campaign.status : stats.totalSent > 0 || stats.totalSkipped > 0 ? 'sent' : 'failed';
    await campaign.update({
      status: nextStatus,
      audienceType,
      channels: normalizedChannels,
      audienceFilter,
      audienceSnapshot: buildCampaignSnapshot(preview, normalizedChannels),
      messageContent: message,
      stats: { ...stats, result },
      sentAt: dryRun ? campaign.sentAt : new Date(),
      updatedBy: req.user?.id || null,
    });
  }

  console.log('[Marketing] broadcast', {
    tenantId: req.tenantId,
    userId: req.user?.id,
    campaignId: campaign?.id || null,
    dryRun: result.dryRun,
    channels: normalizedChannels,
    email: { sent: result.email.sent, failed: result.email.failed.length, skipped: result.email.skipped },
    sms: { sent: result.sms.sent, failed: result.sms.failed.length, skipped: result.sms.skipped },
    whatsapp: { sent: result.whatsapp.sent, failed: result.whatsapp.failed.length, skipped: result.whatsapp.skipped },
  });

  return result;
}

function handleControllerError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return next(error);
}

// @desc    Broadcast message to customers (email / SMS / WhatsApp template)
// @route   POST /api/marketing/broadcast
// @access  Private (admin, manager)
exports.postBroadcast = async (req, res, next) => {
  try {
    const body = req.body || {};
    const audienceType = normalizeAudienceType(body.audienceType);
    const campaign = await MarketingCampaign.create({
      tenantId: req.tenantId,
      name: body.name?.trim() || `Broadcast ${new Date().toLocaleDateString('en-US')}`,
      goal: body.goal?.trim() || null,
      status: 'draft',
      audienceType,
      tags: normalizeTags(body.tags),
      channels: normalizeChannels(body.channels),
      audienceFilter: audienceType === 'lead' ? normalizeLeadAudienceFilter(body) : normalizeAudienceFilter(body),
      messageContent: normalizeMessageContent(body),
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });
    const result = await executeBroadcast(req, body, { campaign, updateCampaign: true });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

exports.getOverview = async (req, res, next) => {
  try {
    const [recent, total, draft, scheduled, sent, failed] = await Promise.all([
      MarketingCampaign.findAll({
        where: { tenantId: req.tenantId },
        order: [['createdAt', 'DESC']],
        limit: 5,
      }),
      MarketingCampaign.count({ where: { tenantId: req.tenantId } }),
      MarketingCampaign.count({ where: { tenantId: req.tenantId, status: 'draft' } }),
      MarketingCampaign.count({ where: { tenantId: req.tenantId, status: 'scheduled' } }),
      MarketingCampaign.count({ where: { tenantId: req.tenantId, status: 'sent' } }),
      MarketingCampaign.count({ where: { tenantId: req.tenantId, status: 'failed' } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: { total, draft, scheduled, sent, failed },
        recentCampaigns: recent,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listCampaigns = async (req, res, next) => {
  try {
    const where = { tenantId: req.tenantId };
    if (req.query.status && CAMPAIGN_STATUSES.has(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const requestedPage = Math.max(Number(req.query.page) || 1, 1);
    const offset = req.query.page
      ? (requestedPage - 1) * limit
      : Math.max(Number(req.query.offset) || 0, 0);
    const { rows, count } = await MarketingCampaign.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.max(Math.ceil(count / limit), 1);
    res.status(200).json({
      success: true,
      data: {
        campaigns: rows,
        total: count,
        totalPages,
        currentPage,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getCampaign = async (req, res, next) => {
  try {
    const campaign = await MarketingCampaign.findOne({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

exports.createCampaign = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.name?.trim()) {
      return res.status(400).json({ success: false, message: 'Campaign name is required' });
    }
    const audienceType = normalizeAudienceType(body.audienceType);
    const channels = normalizeChannels(body.channels);
    const audienceFilter = audienceType === 'lead'
      ? normalizeLeadAudienceFilter(body.audienceFilter || body)
      : normalizeAudienceFilter(body.audienceFilter || body);
    const messageContent = normalizeMessageContent(body.messageContent || body);
    const preview = await buildPreviewData(req.tenantId, {
      ...audienceFilter,
      audienceType,
      channels,
    });
    const campaign = await MarketingCampaign.create({
      tenantId: req.tenantId,
      name: body.name.trim(),
      goal: body.goal?.trim() || null,
      status: body.scheduledAt ? 'scheduled' : 'draft',
      audienceType,
      tags: normalizeTags(body.tags),
      channels,
      audienceFilter,
      audienceSnapshot: buildCampaignSnapshot(preview, channels),
      messageContent,
      scheduledAt: body.scheduledAt || null,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const campaign = await MarketingCampaign.findOne({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (campaign.status === 'sent') {
      return res.status(400).json({ success: false, message: 'Sent campaigns cannot be edited' });
    }

    const body = req.body || {};
    const audienceType = normalizeAudienceType(body.audienceType ?? campaign.audienceType);
    const channels = body.channels !== undefined ? normalizeChannels(body.channels) : campaign.channels;
    const audienceFilter = audienceType === 'lead'
      ? normalizeLeadAudienceFilter(body.audienceFilter || campaign.audienceFilter || {})
      : normalizeAudienceFilter(body.audienceFilter || campaign.audienceFilter || {});
    const messageContent = normalizeMessageContent(body.messageContent || campaign.messageContent || {});
    const preview = await buildPreviewData(req.tenantId, {
      ...audienceFilter,
      audienceType,
      channels,
    });
    await campaign.update({
      name: body.name?.trim() || campaign.name,
      goal: body.goal !== undefined ? body.goal?.trim() || null : campaign.goal,
      status: body.scheduledAt ? 'scheduled' : body.status && CAMPAIGN_STATUSES.has(body.status) ? body.status : 'draft',
      audienceType,
      tags: body.tags !== undefined ? normalizeTags(body.tags) : campaign.tags,
      channels,
      audienceFilter,
      audienceSnapshot: buildCampaignSnapshot(preview, channels),
      messageContent,
      scheduledAt: body.scheduledAt || null,
      updatedBy: req.user?.id || null,
    });
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

exports.sendCampaign = async (req, res, next) => {
  try {
    const campaign = await MarketingCampaign.findOne({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (campaign.status === 'sent') {
      return res.status(400).json({ success: false, message: 'Campaign has already been sent' });
    }
    const payload = getCampaignSendPayload(campaign);
    const result = await executeBroadcast(req, { ...payload, dryRun: Boolean(req.body?.dryRun) }, {
      campaign,
      updateCampaign: true,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleControllerError(error, res, next);
  }
};

exports.scheduleCampaign = async (req, res, next) => {
  try {
    const campaign = await MarketingCampaign.findOne({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (!req.body?.scheduledAt) {
      return res.status(400).json({ success: false, message: 'scheduledAt is required' });
    }
    await campaign.update({
      status: 'scheduled',
      scheduledAt: req.body.scheduledAt,
      updatedBy: req.user?.id || null,
    });
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

/**
 * Cron: send marketing campaigns whose scheduledAt is due.
 * @returns {Promise<Array<{ id: string, ok: boolean, error?: string }>>}
 */
exports.dispatchDueScheduledCampaigns = async () => {
  const due = await MarketingCampaign.findAll({
    where: {
      status: 'scheduled',
      scheduledAt: { [Op.lte]: new Date() },
    },
    order: [['scheduledAt', 'ASC']],
    limit: 25,
  });

  const outcomes = [];
  for (const campaign of due) {
    try {
      const req = { tenantId: campaign.tenantId, tenant: null, user: null };
      const payload = getCampaignSendPayload(campaign);
      await executeBroadcast(req, { ...payload, dryRun: false }, {
        campaign,
        updateCampaign: true,
      });
      outcomes.push({ id: campaign.id, ok: true });
    } catch (error) {
      try {
        await campaign.update({ status: 'failed' });
      } catch (_) {
        /* ignore */
      }
      outcomes.push({ id: campaign.id, ok: false, error: error?.message || 'dispatch failed' });
      console.error('[Marketing] Scheduled campaign dispatch failed:', campaign.id, error?.message);
    }
  }
  return outcomes;
};
