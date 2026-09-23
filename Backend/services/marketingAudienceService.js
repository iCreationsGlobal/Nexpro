const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Customer, Lead, Setting } = require('../models');
const { applyTenantFilter } = require('../utils/tenantUtils');
const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
/** Largest audience one campaign may target; bigger audiences must be narrowed with filters. */
const MAX_AUDIENCE_SIZE = 20000;
/** How many contacts the preview returns for manual selection in the UI. */
const PREVIEW_CONTACT_LIMIT = 2000;
const AUDIENCE_BATCH_SIZE = 1000;
const CHANNELS = ['email', 'sms', 'whatsapp'];
const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'lost', 'converted']);
const LEAD_PRIORITIES = new Set(['low', 'medium', 'high']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Email is “available” only when Settings → Email is enabled and has outbound credentials
 * (SMTP host, SendGrid, SES or Resend). A company profile email alone does not send mail.
 * Matches GET /api/settings/notification-channels `email` flag.
 *
 * @param {string} tenantId
 * @returns {Promise<{ email: { available: boolean, businessProfileEmailSet: boolean }, sms: { available: boolean }, whatsapp: { available: boolean } }>}
 */
async function resolveCapabilities(tenantId) {
  const [emailCfg, smsCfg, waCfg, orgSetting] = await Promise.all([
    emailService.getConfig(tenantId),
    smsService.getResolvedConfig(tenantId),
    whatsappService.getConfig(tenantId),
    Setting.findOne({
      where: { tenantId, key: 'organization' },
      attributes: ['value'],
    }),
  ]);
  const ev = emailCfg || {};
  const emailAvailable = !!(
    emailCfg &&
    (ev.smtpHost || ev.sendgridApiKey || ev.sesAccessKeyId || ev.resendApiKey)
  );
  const orgEmail = (orgSetting?.value?.email || '').trim();
  return {
    email: { available: emailAvailable, businessProfileEmailSet: EMAIL_REGEX.test(orgEmail) },
    sms: { available: !!smsCfg },
    whatsapp: { available: !!waCfg },
  };
}

function normalizeAudienceType(value) {
  return value === 'lead' ? 'lead' : 'customer';
}

function normalizeChannels(channels) {
  const list = Array.isArray(channels) ? channels.map((c) => String(c).toLowerCase()) : [];
  return [...new Set(list.filter((c) => CHANNELS.includes(c)))];
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
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

function normalizeFilterForAudience(audienceType, input = {}) {
  return audienceType === 'lead' ? normalizeLeadAudienceFilter(input) : normalizeAudienceFilter(input);
}

/** Sequelize where-clause fragment matching a non-null, non-empty column. */
function nonEmptyClause() {
  return { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] };
}

/**
 * Customer ids with a sale on/after `cutoff`, as a SQL subquery. Done in SQL so the
 * purchase filters apply to the whole audience, not just one loaded page of customers.
 */
function customersWithSaleSince(tenantId, cutoff) {
  return sequelize.literal(
    `(SELECT DISTINCT s."customerId" FROM sales s WHERE s."tenantId" = ${sequelize.escape(tenantId)} ` +
      `AND s."customerId" IS NOT NULL AND s."createdAt" >= ${sequelize.escape(cutoff.toISOString())})`
  );
}

function buildCustomerWhere(tenantId, filter) {
  const where = applyTenantFilter(tenantId, filter.activeOnly ? { isActive: true } : {});
  const idClauses = [];
  // A hand-picked list (even an empty one) limits the audience to exactly those contacts;
  // an empty selection must reach nobody, never fall back to everyone.
  if (Array.isArray(filter.customerIds)) {
    idClauses.push({ id: { [Op.in]: filter.customerIds } });
  }
  if (filter.lastPurchaseWindowDays) {
    const cutoff = new Date(Date.now() - filter.lastPurchaseWindowDays * DAY_MS);
    idClauses.push({ id: { [Op.in]: customersWithSaleSince(tenantId, cutoff) } });
  }
  if (filter.inactiveDays) {
    const cutoff = new Date(Date.now() - filter.inactiveDays * DAY_MS);
    idClauses.push({ id: { [Op.notIn]: customersWithSaleSince(tenantId, cutoff) } });
  }
  if (idClauses.length) where[Op.and] = [...(where[Op.and] || []), ...idClauses];
  if (filter.marketingConsentOnly) where.marketingConsent = true;
  if (filter.owingOnly) where.balance = { [Op.gt]: 0 };
  if (filter.hasEmail) where.email = nonEmptyClause();
  if (filter.hasPhone) where.phone = nonEmptyClause();
  return where;
}

function buildLeadWhere(tenantId, filter) {
  const where = { tenantId };
  if (filter.activeOnly) where.isActive = true;
  if (Array.isArray(filter.leadIds)) where.id = { [Op.in]: filter.leadIds };
  if (filter.status) where.status = filter.status;
  if (filter.source) where.source = filter.source;
  if (filter.priority) where.priority = filter.priority;
  if (filter.assignedTo) where.assignedTo = filter.assignedTo;
  if (filter.hasEmail) where.email = nonEmptyClause();
  if (filter.hasPhone) where.phone = nonEmptyClause();
  return where;
}

const CUSTOMER_ATTRIBUTES = [
  'id', 'name', 'company', 'email', 'phone', 'balance', 'isActive',
  'marketingConsent', 'smsConsent', 'whatsappConsent', 'createdAt',
];
const LEAD_ATTRIBUTES = [
  'id', 'name', 'company', 'email', 'phone', 'status', 'source', 'priority',
  'doNotContact', 'isActive', 'createdAt',
];

function audienceQuery(tenantId, audienceType, filter) {
  return audienceType === 'lead'
    ? { model: Lead, where: buildLeadWhere(tenantId, filter), attributes: LEAD_ATTRIBUTES }
    : { model: Customer, where: buildCustomerWhere(tenantId, filter), attributes: CUSTOMER_ATTRIBUTES };
}

/**
 * Unified per-row view over Customer/Lead rows so preview and sending stay audience-agnostic.
 * Leads have no per-channel consent columns like Customer does — `doNotContact` is the single suppression flag.
 */
function getRowMeta(row, audienceType) {
  const name = (row.name && String(row.name).trim())
    || (row.company && String(row.company).trim())
    || (audienceType === 'lead' ? 'Lead' : 'Customer');
  if (audienceType === 'lead') {
    const allowed = row.doNotContact !== true;
    return {
      id: row.id,
      name,
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
    name,
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
 * Walk the whole audience (newest first, in batches) and decide per contact which channels
 * can reach it: a valid address, consent, and not an address already used by an earlier contact.
 *
 * @param {string} tenantId
 * @param {'customer'|'lead'} audienceType
 * @param {object} filter - normalized audience filter
 * @param {{ onContact: (contact: object) => void }} handlers
 * @returns {Promise<{ total: number, truncated: boolean }>}
 */
async function scanAudience(tenantId, audienceType, filter, { onContact }) {
  const { model, where, attributes } = audienceQuery(tenantId, audienceType, filter);
  const total = await model.count({ where });
  const limit = Math.min(total, MAX_AUDIENCE_SIZE);
  const seen = { email: new Set(), sms: new Set(), whatsapp: new Set() };

  for (let offset = 0; offset < limit; offset += AUDIENCE_BATCH_SIZE) {
    const rows = await model.findAll({
      where,
      attributes,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: Math.min(AUDIENCE_BATCH_SIZE, limit - offset),
      offset,
    });
    if (!rows.length) break;

    for (const row of rows) {
      const meta = getRowMeta(row, audienceType);
      const email = normalizeEmail(meta.email);
      const addresses = {
        email: email && EMAIL_REGEX.test(email) ? email : null,
        sms: smsService.validatePhoneNumber(meta.phone) || null,
        whatsapp: whatsappService.validatePhoneNumber(meta.phone) || null,
      };
      const allowed = { email: meta.marketingAllowed, sms: meta.smsAllowed, whatsapp: meta.whatsappAllowed };
      const channels = {};
      for (const channel of CHANNELS) {
        const address = addresses[channel];
        const duplicate = Boolean(address && seen[channel].has(address));
        const eligible = Boolean(address && allowed[channel] && !duplicate);
        if (eligible) seen[channel].add(address);
        channels[channel] = { address, eligible, duplicate };
      }
      onContact({ meta, channels });
    }
  }

  return { total, truncated: total > MAX_AUDIENCE_SIZE };
}

/**
 * Recipient counts, consent warnings and (capped) contact list for the campaign preview.
 */
async function buildAudiencePreview(tenantId, audienceType, filter) {
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
  const contacts = [];

  const { total, truncated } = await scanAudience(tenantId, audienceType, filter, {
    onContact: ({ meta, channels }) => {
      if (channels.email.address && !channels.email.duplicate) counts.withEmail += 1;
      if (channels.sms.address && !channels.sms.duplicate) counts.withSmsPhone += 1;
      if (channels.whatsapp.address && !channels.whatsapp.duplicate) counts.withWhatsappPhone += 1;
      for (const channel of CHANNELS) {
        if (channels[channel].eligible) counts.eligible[channel] += 1;
      }
      if (!meta.marketingAllowed) counts.consentWarnings.marketingConsentRequired += 1;
      if (meta.consent.sms === false) counts.consentWarnings.smsOptedOut += 1;
      if (meta.consent.whatsapp === false) counts.consentWarnings.whatsappOptedOut += 1;
      if (!channels.email.address) counts.consentWarnings.missingEmail += 1;
      if (!channels.sms.address && !channels.whatsapp.address) counts.consentWarnings.missingPhone += 1;

      if (contacts.length < PREVIEW_CONTACT_LIMIT) {
        contacts.push({
          id: meta.id,
          name: meta.name,
          company: meta.company,
          email: meta.email,
          phone: meta.phone,
          balance: meta.balance,
          consent: meta.consent,
          eligibleChannels: {
            email: channels.email.eligible,
            sms: channels.sms.eligible,
            whatsapp: channels.whatsapp.eligible,
          },
        });
      }
    },
  });

  return { total, truncated, contacts, ...counts };
}

/**
 * The messages a campaign would send: one entry per reachable contact per selected channel,
 * plus how many contacts each channel had to skip (no address, no consent or duplicate).
 */
async function planCampaignRecipients(tenantId, audienceType, filter, channels) {
  const recipients = [];
  const skipped = { email: 0, sms: 0, whatsapp: 0 };
  const { total, truncated } = await scanAudience(tenantId, audienceType, filter, {
    onContact: ({ meta, channels: reach }) => {
      for (const channel of channels) {
        if (!reach[channel].eligible) {
          skipped[channel] += 1;
          continue;
        }
        recipients.push({
          recipientType: audienceType,
          recipientId: meta.id,
          recipientName: String(meta.name || '').slice(0, 255),
          channel,
          address: reach[channel].address,
        });
      }
    },
  });
  return { recipients, skipped, total, truncated };
}

module.exports = {
  CHANNELS,
  EMAIL_REGEX,
  MAX_AUDIENCE_SIZE,
  PREVIEW_CONTACT_LIMIT,
  buildAudiencePreview,
  normalizeAudienceFilter,
  normalizeAudienceType,
  normalizeChannels,
  normalizeFilterForAudience,
  normalizeLeadAudienceFilter,
  planCampaignRecipients,
  resolveCapabilities,
};
