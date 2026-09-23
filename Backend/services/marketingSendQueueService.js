const cron = require('node-cron');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { MarketingCampaign, MarketingCampaignRecipient, Tenant } = require('../models');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const { getTenantLogoUrl } = require('../utils/tenantLogo');
const { applySmsTemplate } = require('../utils/smsTemplateMerge');
const { applyVerificationAfterBroadcast } = require('./marketingChannelVerification');
const {
  CHANNELS,
  normalizeAudienceType,
  normalizeChannels,
  normalizeFilterForAudience,
  planCampaignRecipients,
  resolveCapabilities,
  MAX_AUDIENCE_SIZE,
} = require('./marketingAudienceService');

/**
 * Marketing send queue.
 *
 * Sending a campaign no longer happens inside the HTTP request. Starting a send claims the
 * campaign (draft/scheduled → sending) so it can only start once, then writes one
 * marketing_campaign_recipients row per message. A background worker sends those rows in
 * small batches, records the outcome of each, and marks the campaign sent/failed when done.
 *
 * Delivery is at-most-once: a row interrupted mid-send (server restart) is marked failed as
 * "interrupted" and is never re-sent automatically, because it may already have gone out.
 */

const SEND_BATCH_SIZE = 50;
const INSERT_CHUNK_SIZE = 500;
const RUN_BUDGET_MS = 45 * 1000;
const STALE_LOCK_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const INTERRUPTED_ERROR = 'Interrupted during sending; not resent automatically to avoid a duplicate';
/** Statuses a campaign can start sending from. */
const STARTABLE_STATUSES = ['draft', 'scheduled', 'failed'];

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Throws a 400 when a channel is not configured or its message content is missing.
 */
function validateSendRequest(capabilities, channels, message) {
  if (channels.length === 0) {
    throw httpError(400, 'Select at least one channel: email, sms, or whatsapp');
  }
  for (const channel of channels) {
    if (!capabilities[channel]?.available) {
      throw httpError(400, `Channel "${channel}" is not configured for this workspace. Configure it in Settings first.`);
    }
  }
  if (channels.includes('email')) {
    if (!String(message.subject || '').trim()) throw httpError(400, 'Email subject is required');
    if (!String(message.emailBody || '').trim()) throw httpError(400, 'Email body is required');
  }
  if (channels.includes('sms') && !String(message.smsBody || '').trim()) {
    throw httpError(400, 'SMS message is required');
  }
  if (channels.includes('whatsapp') && !String(message.whatsappTemplateName || '').trim()) {
    throw httpError(400, 'WhatsApp requires a Meta-approved template name (whatsappTemplateName)');
  }
}

/**
 * Recompute a campaign's per-channel counts from its recipient rows.
 * `skipped` (contacts that could not be reached) is fixed when the send starts, so it is
 * carried over from the stored stats unless passed in.
 */
async function computeCampaignStats(campaignId, skippedOverride = null, previousStats = null) {
  const rows = await MarketingCampaignRecipient.findAll({
    where: { campaignId },
    attributes: ['channel', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['channel', 'status'],
    raw: true,
  });
  const skipped = skippedOverride || {
    email: Number(previousStats?.email?.skipped || 0),
    sms: Number(previousStats?.sms?.skipped || 0),
    whatsapp: Number(previousStats?.whatsapp?.skipped || 0),
  };

  const stats = {};
  for (const channel of CHANNELS) {
    stats[channel] = { queued: 0, pending: 0, sent: 0, delivered: 0, failed: 0, skipped: skipped[channel] || 0 };
  }
  for (const row of rows) {
    const block = stats[row.channel];
    if (!block) continue;
    const count = Number(row.count || 0);
    block.queued += count;
    if (row.status === 'sent') block.sent += count;
    else if (row.status === 'failed') block.failed += count;
    else block.pending += count; // pending + processing
  }

  const sum = (key) => CHANNELS.reduce((total, channel) => total + stats[channel][key], 0);
  stats.totalQueued = sum('queued');
  stats.totalSent = sum('sent');
  stats.totalFailed = sum('failed');
  stats.totalSkipped = sum('skipped');
  stats.totalPending = sum('pending');
  stats.progress = stats.totalQueued
    ? Math.round(((stats.totalSent + stats.totalFailed) / stats.totalQueued) * 100)
    : 0;
  return stats;
}

async function saveCampaignStats(campaignId, skippedOverride = null) {
  const campaign = await MarketingCampaign.findByPk(campaignId, { attributes: ['id', 'stats'] });
  const stats = await computeCampaignStats(campaignId, skippedOverride, campaign?.stats);
  await MarketingCampaign.update({ stats }, { where: { id: campaignId } });
  return stats;
}

/**
 * Preview a send without queuing anything: how many messages each channel would send.
 */
async function dryRunCampaign(campaign) {
  const audienceType = normalizeAudienceType(campaign.audienceType);
  const channels = normalizeChannels(campaign.channels);
  const capabilities = await resolveCapabilities(campaign.tenantId);
  validateSendRequest(capabilities, channels, campaign.messageContent || {});
  const filter = normalizeFilterForAudience(audienceType, campaign.audienceFilter || {});
  const plan = await planCampaignRecipients(campaign.tenantId, audienceType, filter, channels);

  const result = { campaignId: campaign.id, dryRun: true, channels, totalInWorkspace: plan.total, truncated: plan.truncated };
  for (const channel of CHANNELS) {
    result[channel] = {
      sent: plan.recipients.filter((r) => r.channel === channel).length,
      skipped: plan.skipped[channel],
      failed: [],
    };
  }
  return result;
}

/**
 * Start sending a campaign: claim it, queue one row per message, and wake the worker.
 * Returns immediately; sending continues in the background.
 *
 * @param {{ tenantId: string, userId?: string|null }} actor
 * @param {object} campaign - MarketingCampaign instance
 */
async function startCampaignSend(actor, campaign) {
  const { tenantId } = actor;
  const audienceType = normalizeAudienceType(campaign.audienceType);
  const channels = normalizeChannels(campaign.channels);
  const message = campaign.messageContent || {};
  const capabilities = await resolveCapabilities(tenantId);
  validateSendRequest(capabilities, channels, message);

  const previousStatus = campaign.status;
  if (previousStatus === 'failed') {
    const alreadyQueued = await MarketingCampaignRecipient.count({ where: { campaignId: campaign.id } });
    if (alreadyQueued > 0) {
      throw httpError(409, 'This campaign was already sent. Use "Retry failed" to resend the messages that failed.');
    }
  }

  // Atomic claim: only one request (or scheduler tick, or server) can move it to sending.
  const [claimed] = await MarketingCampaign.update(
    { status: 'sending', updatedBy: actor.userId || null },
    { where: { id: campaign.id, tenantId, status: { [Op.in]: STARTABLE_STATUSES } } }
  );
  if (!claimed) {
    throw httpError(409, campaign.status === 'sending'
      ? 'This campaign is already sending.'
      : 'This campaign has already been sent.');
  }

  try {
    const filter = normalizeFilterForAudience(audienceType, campaign.audienceFilter || {});
    const plan = await planCampaignRecipients(tenantId, audienceType, filter, channels);
    if (plan.truncated) {
      throw httpError(400, `This audience has ${plan.total.toLocaleString('en-US')} contacts. `
        + `A campaign can reach at most ${MAX_AUDIENCE_SIZE.toLocaleString('en-US')}; narrow your filters.`);
    }
    if (plan.recipients.length === 0) {
      throw httpError(400, 'No one in this audience can receive this campaign on the selected channels. '
        + 'Check that contacts have consent and a valid email or phone number.');
    }

    for (let i = 0; i < plan.recipients.length; i += INSERT_CHUNK_SIZE) {
      await MarketingCampaignRecipient.bulkCreate(
        plan.recipients.slice(i, i + INSERT_CHUNK_SIZE).map((recipient) => ({
          ...recipient,
          tenantId,
          campaignId: campaign.id,
          status: 'pending',
        })),
        { ignoreDuplicates: true }
      );
    }

    const stats = await computeCampaignStats(campaign.id, plan.skipped);
    await MarketingCampaign.update({
      stats,
      sentAt: new Date(),
      audienceSnapshot: {
        capturedAt: new Date().toISOString(),
        totalInWorkspace: plan.total,
        batchSize: stats.totalQueued,
        selectedChannels: channels,
        queued: stats.totalQueued,
        skipped: plan.skipped,
      },
      metadata: { ...(campaign.metadata || {}), lastError: null },
    }, { where: { id: campaign.id } });

    wakeWorker();
    return {
      campaignId: campaign.id,
      status: 'sending',
      channels,
      totalInWorkspace: plan.total,
      queued: stats.totalQueued,
      skipped: plan.skipped,
      stats,
    };
  } catch (error) {
    await MarketingCampaignRecipient.destroy({ where: { campaignId: campaign.id, status: 'pending' } });
    // A scheduled send that cannot start is marked failed so the owner sees why; a manual
    // send goes back to where it was so it can be fixed and sent again.
    await MarketingCampaign.update({
      status: previousStatus === 'scheduled' ? 'failed' : previousStatus,
      metadata: { ...(campaign.metadata || {}), lastError: error.message },
    }, { where: { id: campaign.id } });
    throw error;
  }
}

/**
 * Requeue a campaign's failed messages (not interrupted ones, which may have been delivered).
 */
async function retryFailedRecipients(tenantId, campaignId, userId = null) {
  const campaign = await MarketingCampaign.findOne({ where: { id: campaignId, tenantId } });
  if (!campaign) throw httpError(404, 'Campaign not found');
  if (campaign.status === 'sending') throw httpError(409, 'This campaign is still sending.');

  const [requeued] = await MarketingCampaignRecipient.update(
    { status: 'pending', error: null, lockedAt: null },
    {
      where: {
        campaignId,
        status: 'failed',
        attempts: { [Op.lt]: MAX_ATTEMPTS },
        error: { [Op.ne]: INTERRUPTED_ERROR },
      },
    }
  );
  if (!requeued) {
    throw httpError(400, 'There are no failed messages that can be retried.');
  }

  await MarketingCampaign.update({ status: 'sending', updatedBy: userId }, { where: { id: campaignId } });
  await saveCampaignStats(campaignId);
  wakeWorker();
  return { campaignId, requeued };
}

async function listCampaignRecipients(tenantId, campaignId, query = {}) {
  const where = { tenantId, campaignId };
  if (['pending', 'processing', 'sent', 'failed'].includes(query.status)) where.status = query.status;
  if (CHANNELS.includes(query.channel)) where.channel = query.channel;
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const page = Math.max(Number(query.page) || 1, 1);
  const { rows, count } = await MarketingCampaignRecipient.findAndCountAll({
    where,
    attributes: ['id', 'recipientType', 'recipientId', 'recipientName', 'channel', 'address', 'status', 'error', 'attempts', 'sentAt', 'updatedAt'],
    order: [['updatedAt', 'DESC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  return {
    recipients: rows,
    total: count,
    currentPage: page,
    totalPages: Math.max(Math.ceil(count / limit), 1),
    limit,
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/** Rows stuck in "processing" (worker crashed mid-send) are failed, never resent. */
async function recoverStaleLocks() {
  await MarketingCampaignRecipient.update(
    { status: 'failed', error: INTERRUPTED_ERROR, lockedAt: null },
    { where: { status: 'processing', lockedAt: { [Op.lt]: new Date(Date.now() - STALE_LOCK_MS) } } }
  );
}

/** Claim the next batch of pending rows. SKIP LOCKED keeps concurrent workers apart. */
async function claimBatch(campaignId) {
  const [rows] = await sequelize.query(
    `UPDATE marketing_campaign_recipients
        SET status = 'processing', "lockedAt" = NOW(), attempts = attempts + 1, "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM marketing_campaign_recipients
         WHERE "campaignId" = :campaignId AND status = 'pending'
         ORDER BY "createdAt", id
         LIMIT :limit
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    { replacements: { campaignId, limit: SEND_BATCH_SIZE } }
  );
  return rows || [];
}

async function markRecipient(id, success, error = null) {
  await MarketingCampaignRecipient.update(
    success
      ? { status: 'sent', sentAt: new Date(), error: null, lockedAt: null }
      : { status: 'failed', error: String(error || 'Send failed').slice(0, 500), lockedAt: null },
    { where: { id } }
  );
}

async function loadSenderCompany(tenantId, cache) {
  if (cache.has(tenantId)) return cache.get(tenantId);
  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'metadata'] });
  const company = {
    name: tenant?.name || 'Your business',
    primaryColor: tenant?.metadata?.primaryColor || '#166534',
    logoUrl: getTenantLogoUrl(tenant),
  };
  cache.set(tenantId, company);
  return company;
}

/**
 * Send one batch of a campaign's queued messages. Returns how many rows were processed.
 */
async function processCampaignBatch(campaign, companyCache) {
  const rows = await claimBatch(campaign.id);
  if (!rows.length) return 0;

  const message = campaign.messageContent || {};
  const baseCompany = await loadSenderCompany(campaign.tenantId, companyCache);
  const company = { ...baseCompany, audience: normalizeAudienceType(campaign.audienceType) };
  const mergeVarsFor = (row) => ({ name: row.recipientName || '', businessName: company.name });

  const emailRows = rows.filter((row) => row.channel === 'email');
  if (emailRows.length) {
    const jobs = emailRows.map((row) => {
      const body = applySmsTemplate(message.emailBody || '', mergeVarsFor(row));
      return {
        to: row.address,
        subject: applySmsTemplate(message.subject || '', mergeVarsFor(row)),
        html: emailTemplates.marketingPlainMessageEmail(body, company),
        text: body.trim(),
      };
    });
    let results;
    try {
      results = await emailService.sendBulkTenantEmails(campaign.tenantId, jobs);
    } catch (error) {
      results = jobs.map(() => ({ success: false, error: error?.message || 'Email send failed' }));
    }
    for (let i = 0; i < emailRows.length; i += 1) {
      await markRecipient(emailRows[i].id, results[i]?.success, results[i]?.error);
    }
  }

  for (const row of rows) {
    if (row.channel === 'email') continue;
    let outcome;
    try {
      if (row.channel === 'sms') {
        outcome = await smsService.sendMessage(
          campaign.tenantId,
          row.address,
          applySmsTemplate(message.smsBody || '', mergeVarsFor(row)),
          null,
          { source: 'marketing_campaign', context: { campaignId: campaign.id, customerId: row.recipientId } }
        );
      } else {
        const parameters = Array.isArray(message.whatsappParameters) ? message.whatsappParameters : [];
        outcome = await whatsappService.sendMessage(
          campaign.tenantId,
          row.address,
          message.whatsappTemplateName,
          message.whatsappPrependCustomerName ? [row.recipientName || '', ...parameters] : [...parameters],
          message.whatsappLanguage || 'en',
          {
            category: 'marketing',
            campaignId: campaign.id,
            metadata: { campaignId: campaign.id, source: 'marketing_campaign' },
          }
        );
      }
    } catch (error) {
      outcome = { success: false, error: error?.message };
    }
    await markRecipient(row.id, outcome?.success, outcome?.error);
  }

  await saveCampaignStats(campaign.id);
  return rows.length;
}

/** Close out a campaign once nothing is left pending or in flight. */
async function finalizeIfDone(campaign) {
  const remaining = await MarketingCampaignRecipient.count({
    where: { campaignId: campaign.id, status: { [Op.in]: ['pending', 'processing'] } },
  });
  if (remaining > 0) return false;

  const stats = await saveCampaignStats(campaign.id);
  const failedEverything = stats.totalSent === 0;
  await MarketingCampaign.update({
    status: failedEverything ? 'failed' : 'sent',
    metadata: {
      ...(campaign.metadata || {}),
      completedAt: new Date().toISOString(),
      lastError: failedEverything ? 'No messages could be sent. See the failed recipients for reasons.' : null,
    },
  }, { where: { id: campaign.id, status: 'sending' } });
  // A channel that delivered real messages counts as verified in Settings.
  await applyVerificationAfterBroadcast(campaign.tenantId, false, stats).catch((error) => {
    console.warn('[MarketingSendQueue] Channel verification update failed:', error?.message || error);
  });
  console.log('[MarketingSendQueue] Campaign finished', {
    campaignId: campaign.id,
    sent: stats.totalSent,
    failed: stats.totalFailed,
    skipped: stats.totalSkipped,
  });
  return true;
}

let running = false;
let rerunRequested = false;

/**
 * Drain queued messages for up to RUN_BUDGET_MS. Campaigns take turns batch by batch so one
 * large campaign does not hold up the others.
 */
async function runWorker() {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  const startedAt = Date.now();
  const companyCache = new Map();
  try {
    await recoverStaleLocks();
    while (Date.now() - startedAt < RUN_BUDGET_MS) {
      const campaigns = await MarketingCampaign.findAll({
        where: { status: 'sending' },
        order: [['updatedAt', 'ASC']],
        limit: 10,
      });
      if (!campaigns.length) break;

      let processed = 0;
      for (const campaign of campaigns) {
        const count = await processCampaignBatch(campaign, companyCache);
        processed += count;
        if (count === 0) await finalizeIfDone(campaign);
      }
      if (processed === 0) break;
    }
  } catch (error) {
    console.error('[MarketingSendQueue] Worker run failed:', error?.message || error);
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      setImmediate(runWorker);
    }
  }
}

/** Start draining right away instead of waiting for the next cron tick. */
function wakeWorker() {
  setImmediate(runWorker);
}

function startWorker() {
  // Safety net: also catches campaigns left mid-send by a restart.
  cron.schedule('* * * * *', () => {
    runWorker();
  });
  console.log('[MarketingSendQueue] Worker started (every minute + on demand)');
}

module.exports = {
  INTERRUPTED_ERROR,
  computeCampaignStats,
  dryRunCampaign,
  listCampaignRecipients,
  retryFailedRecipients,
  runWorker,
  startCampaignSend,
  startWorker,
  validateSendRequest,
  wakeWorker,
};
