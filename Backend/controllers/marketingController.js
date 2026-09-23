const { Op } = require('sequelize');
const { MarketingCampaign } = require('../models');
const { enrichCapabilitiesWithVerification } = require('../services/marketingChannelVerification');
const {
  MAX_AUDIENCE_SIZE,
  buildAudiencePreview,
  normalizeAudienceType,
  normalizeChannels,
  normalizeFilterForAudience,
  resolveCapabilities,
} = require('../services/marketingAudienceService');
const {
  dryRunCampaign,
  listCampaignRecipients,
  retryFailedRecipients,
  startCampaignSend,
} = require('../services/marketingSendQueueService');

const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'sending', 'sent', 'failed']);
/** Statuses where the campaign is locked because it is sending or has gone out. */
const LOCKED_STATUSES = new Set(['sending', 'sent']);
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

/**
 * Query-string / body values → normalized audience filter. The preview endpoint receives
 * booleans as strings, so both forms are accepted.
 */
function readAudienceFilter(audienceType, input = {}) {
  const truthy = (value) => value === true || value === 'true';
  return normalizeFilterForAudience(audienceType, {
    ...input,
    activeOnly: input.activeOnly !== 'false' && input.activeOnly !== false,
    marketingConsentOnly: truthy(input.marketingConsentOnly),
    owingOnly: truthy(input.owingOnly),
  });
}

async function buildPreviewData(tenantId, query = {}) {
  const audienceType = normalizeAudienceType(query.audienceType);
  const filter = readAudienceFilter(audienceType, query);
  const [preview, baseCaps] = await Promise.all([
    buildAudiencePreview(tenantId, audienceType, filter),
    resolveCapabilities(tenantId),
  ]);
  const capabilities = await enrichCapabilitiesWithVerification(tenantId, baseCaps);

  return {
    audienceType,
    totalInWorkspace: preview.total,
    batchSize: Math.min(preview.total, MAX_AUDIENCE_SIZE),
    truncated: preview.truncated,
    maxRecipients: MAX_AUDIENCE_SIZE,
    withEmail: preview.withEmail,
    withSmsPhone: preview.withSmsPhone,
    withWhatsappPhone: preview.withWhatsappPhone,
    eligible: preview.eligible,
    consentWarnings: preview.consentWarnings,
    requestedChannels: normalizeChannels(query.channels),
    capabilities,
    contacts: preview.contacts,
  };
}

/** Audience summary saved on drafts (counts only; the full list is rebuilt at send time). */
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
  };
}

function handleControllerError(error, res, next) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return next(error);
}

async function findTenantCampaign(req) {
  return MarketingCampaign.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });
}

/** Campaign fields from a create/broadcast body, including a fresh audience snapshot. */
async function buildCampaignFields(tenantId, body, existing = null) {
  const audienceType = normalizeAudienceType(body.audienceType ?? existing?.audienceType);
  const channels = body.channels !== undefined ? normalizeChannels(body.channels) : (existing?.channels || []);
  const audienceFilter = readAudienceFilter(audienceType, body.audienceFilter || existing?.audienceFilter || body);
  const messageContent = normalizeMessageContent(body.messageContent || existing?.messageContent || body);
  const preview = await buildPreviewData(tenantId, { ...audienceFilter, audienceType, channels });
  return {
    audienceType,
    channels,
    audienceFilter,
    messageContent,
    audienceSnapshot: buildCampaignSnapshot(preview, channels),
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

// @desc    Recipient counts for the selected audience
// @route   GET /api/marketing/preview
// @access  Private (admin, manager)
exports.getPreview = async (req, res, next) => {
  try {
    const data = await buildPreviewData(req.tenantId, req.query || {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc    One-step broadcast: create a campaign and start sending it (or dry-run it)
// @route   POST /api/marketing/broadcast
// @access  Private (admin, manager)
exports.postBroadcast = async (req, res, next) => {
  try {
    const body = req.body || {};
    const fields = await buildCampaignFields(req.tenantId, body);
    const campaignData = {
      tenantId: req.tenantId,
      name: body.name?.trim() || `Broadcast ${new Date().toLocaleDateString('en-US')}`,
      goal: body.goal?.trim() || null,
      status: 'draft',
      tags: normalizeTags(body.tags),
      ...fields,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    };

    if (body.dryRun) {
      const result = await dryRunCampaign(MarketingCampaign.build(campaignData));
      return res.status(200).json({ success: true, data: result });
    }

    const campaign = await MarketingCampaign.create(campaignData);
    const result = await startCampaignSend({ tenantId: req.tenantId, userId: req.user?.id }, campaign);
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.getOverview = async (req, res, next) => {
  try {
    const where = { tenantId: req.tenantId };
    const [recent, total, draft, scheduled, sending, sent, failed] = await Promise.all([
      MarketingCampaign.findAll({ where, order: [['createdAt', 'DESC']], limit: 5 }),
      MarketingCampaign.count({ where }),
      MarketingCampaign.count({ where: { ...where, status: 'draft' } }),
      MarketingCampaign.count({ where: { ...where, status: 'scheduled' } }),
      MarketingCampaign.count({ where: { ...where, status: 'sending' } }),
      MarketingCampaign.count({ where: { ...where, status: 'sent' } }),
      MarketingCampaign.count({ where: { ...where, status: 'failed' } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: { total, draft, scheduled, sending, sent, failed },
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
    res.status(200).json({
      success: true,
      data: {
        campaigns: rows,
        total: count,
        totalPages: Math.max(Math.ceil(count / limit), 1),
        currentPage: Math.floor(offset / limit) + 1,
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
    const campaign = await findTenantCampaign(req);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return next(error);
  }
};

exports.createCampaign = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.name?.trim()) {
      return res.status(400).json({ success: false, message: 'Campaign name is required' });
    }
    const fields = await buildCampaignFields(req.tenantId, body);
    const campaign = await MarketingCampaign.create({
      tenantId: req.tenantId,
      name: body.name.trim(),
      goal: body.goal?.trim() || null,
      status: body.scheduledAt ? 'scheduled' : 'draft',
      tags: normalizeTags(body.tags),
      ...fields,
      scheduledAt: body.scheduledAt || null,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });
    return res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const campaign = await findTenantCampaign(req);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (LOCKED_STATUSES.has(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: campaign.status === 'sending' ? 'This campaign is sending and cannot be edited' : 'Sent campaigns cannot be edited',
      });
    }

    const body = req.body || {};
    const fields = await buildCampaignFields(req.tenantId, body, campaign);
    const requestedStatus = body.status && ['draft', 'scheduled'].includes(body.status) ? body.status : 'draft';
    await campaign.update({
      name: body.name?.trim() || campaign.name,
      goal: body.goal !== undefined ? body.goal?.trim() || null : campaign.goal,
      status: body.scheduledAt ? 'scheduled' : requestedStatus,
      tags: body.tags !== undefined ? normalizeTags(body.tags) : campaign.tags,
      ...fields,
      scheduledAt: body.scheduledAt || null,
      updatedBy: req.user?.id || null,
    });
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

// @desc    Start sending a campaign (queued; returns immediately). `dryRun` only counts.
// @route   POST /api/marketing/campaigns/:id/send
exports.sendCampaign = async (req, res, next) => {
  try {
    const campaign = await findTenantCampaign(req);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (req.body?.dryRun) {
      const result = await dryRunCampaign(campaign);
      return res.status(200).json({ success: true, data: result });
    }
    const result = await startCampaignSend({ tenantId: req.tenantId, userId: req.user?.id }, campaign);
    return res.status(202).json({ success: true, data: result });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

// @desc    Per-recipient send log for a campaign
// @route   GET /api/marketing/campaigns/:id/recipients
exports.getCampaignRecipients = async (req, res, next) => {
  try {
    const campaign = await findTenantCampaign(req);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    const data = await listCampaignRecipients(req.tenantId, campaign.id, req.query || {});
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

// @desc    Resend the messages that failed
// @route   POST /api/marketing/campaigns/:id/retry-failed
exports.retryCampaignFailed = async (req, res, next) => {
  try {
    const data = await retryFailedRecipients(req.tenantId, req.params.id, req.user?.id || null);
    return res.status(202).json({ success: true, data });
  } catch (error) {
    return handleControllerError(error, res, next);
  }
};

exports.scheduleCampaign = async (req, res, next) => {
  try {
    const campaign = await findTenantCampaign(req);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (LOCKED_STATUSES.has(campaign.status)) {
      return res.status(400).json({ success: false, message: 'This campaign has already started sending' });
    }
    if (!req.body?.scheduledAt) {
      return res.status(400).json({ success: false, message: 'scheduledAt is required' });
    }
    await campaign.update({
      status: 'scheduled',
      scheduledAt: req.body.scheduledAt,
      updatedBy: req.user?.id || null,
    });
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return next(error);
  }
};

/**
 * Cron: start sending campaigns whose scheduledAt is due. The atomic claim inside
 * startCampaignSend means a campaign starts once even if several servers run this.
 * @returns {Promise<Array<{ id: string, ok: boolean, error?: string }>>}
 */
exports.dispatchDueScheduledCampaigns = async () => {
  const due = await MarketingCampaign.findAll({
    where: { status: 'scheduled', scheduledAt: { [Op.lte]: new Date() } },
    order: [['scheduledAt', 'ASC']],
    limit: 25,
  });

  const outcomes = [];
  for (const campaign of due) {
    try {
      await startCampaignSend({ tenantId: campaign.tenantId, userId: null }, campaign);
      outcomes.push({ id: campaign.id, ok: true });
    } catch (error) {
      outcomes.push({ id: campaign.id, ok: false, error: error?.message || 'dispatch failed' });
      console.error('[Marketing] Scheduled campaign could not start:', campaign.id, error?.message);
    }
  }
  return outcomes;
};
