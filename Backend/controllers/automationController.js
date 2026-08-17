const { Op, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const { AutomationRule, AutomationRun, Invoice, Product, WhatsAppMessageEvent } = require('../models');
const {
  getTemplates,
  executeRule,
  filterTemplatesForTenant,
  isTriggerAllowedForTenant,
} = require('../services/automationEngineService');
const { resolveBusinessNameForContext } = require('../utils/resolveBusinessNameForContext');
const { applyScopedReadFilters } = require('../utils/shopUtils');
const automationSchedulerService = require('../services/automationSchedulerService');
const openaiService = require('../services/openaiService');
const { getPagination } = require('../utils/paginationUtils');

const MESSAGING_ACTION_TYPES = new Set(['send_email_platform', 'send_sms', 'send_whatsapp']);

/**
 * @param {object|null|undefined} actionConfig
 * @returns {string[]}
 */
function messagingActionTypesFromConfig(actionConfig) {
  const actions = actionConfig?.actions;
  if (!Array.isArray(actions)) return [];
  return [...new Set(
    actions
      .map((action) => String(action?.type || '').trim())
      .filter((type) => MESSAGING_ACTION_TYPES.has(type))
  )];
}

/**
 * Block repeated birthday/email (etc.) rules for the same branch scope.
 * @param {object} params
 * @returns {Promise<object|null>}
 */
async function findDuplicateMessagingAutomationRule({
  tenantId,
  triggerType,
  actionConfig,
  shopId = null,
  studioLocationId = null,
  excludeId = null,
}) {
  const candidateChannels = messagingActionTypesFromConfig(actionConfig);
  if (!candidateChannels.length || !triggerType) return null;

  const where = {
    tenantId,
    triggerType: String(triggerType).trim(),
    shopId: shopId || null,
    studioLocationId: studioLocationId || null,
  };
  if (excludeId) {
    where.id = { [Op.ne]: String(excludeId) };
  }

  const rows = await AutomationRule.findAll({
    where,
    attributes: ['id', 'name', 'triggerType', 'actionConfig', 'shopId', 'studioLocationId'],
    limit: 100,
  });

  return rows.find((rule) => {
    const existingChannels = messagingActionTypesFromConfig(rule.actionConfig);
    return candidateChannels.some((channel) => existingChannels.includes(channel));
  }) || null;
}

/**
 * Resolve the rule's default branch scope from the active request context
 * (mirrors how Job/Customer/Quote inherit the active shop/studio location on create).
 * @param {object} req
 * @returns {{ shopId: string|null, studioLocationId: string|null }}
 */
function defaultBranchIdsFromContext(req) {
  return {
    shopId: req.shopScoped ? (req.shopFilterId || req.defaultShopId || null) : null,
    studioLocationId: req.studioLocationScoped ? (req.studioLocationFilterId || req.defaultStudioLocationId || null) : null,
  };
}

/**
 * Resolve shopId/studioLocationId for create/update, honoring an explicit `null`
 * (meaning "all branches") while defaulting to the active branch context when the
 * field is omitted entirely.
 * @param {object} req
 * @param {object} body
 * @returns {{ shopId: string|null, studioLocationId: string|null }}
 */
function resolveBranchIdsForWrite(req, body = {}) {
  const defaults = defaultBranchIdsFromContext(req);
  const shopId = Object.prototype.hasOwnProperty.call(body, 'shopId')
    ? (body.shopId || null)
    : defaults.shopId;
  const studioLocationId = Object.prototype.hasOwnProperty.call(body, 'studioLocationId')
    ? (body.studioLocationId || null)
    : defaults.studioLocationId;
  return { shopId, studioLocationId };
}

/**
 * Reject branch ids outside the requester's assigned shops/studio locations.
 * @param {object} req
 * @param {{ shopId: string|null, studioLocationId: string|null }} branchIds
 * @returns {string|null} error message, or null if valid
 */
function validateBranchAccess(req, { shopId, studioLocationId }) {
  if (shopId && req.shopScoped && !req.canAccessAllShops && !(req.allowedShopIds || []).includes(shopId)) {
    return 'You do not have access to this shop';
  }
  if (studioLocationId && req.studioLocationScoped && !req.canAccessAllStudioLocations && !(req.allowedStudioLocationIds || []).includes(studioLocationId)) {
    return 'You do not have access to this studio location';
  }
  return null;
}

const DISALLOWED_TRIGGER_MESSAGE = 'This trigger is not available for your business type';

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1';
}

const ACTION_CHANNEL_MAP = {
  send_whatsapp: 'whatsapp',
  send_email_platform: 'email',
  send_sms: 'sms',
  create_task: 'task'
};

const RECENT_ACTIVITY_LIMIT = 10;
const TOP_RULES_LIMIT = 5;
const TOP_RULES_LOOKBACK_DAYS = 30;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRunActions(run) {
  const results = run?.resultSummary?.results;
  return Array.isArray(results) ? results : [];
}

function actionTypeToChannel(actionType) {
  return ACTION_CHANNEL_MAP[actionType] || null;
}

function getRunChannels(run) {
  const channels = getRunActions(run)
    .map((action) => actionTypeToChannel(action?.type))
    .filter(Boolean);
  return [...new Set(channels)];
}

function getPrimaryChannel(run) {
  const channels = getRunChannels(run);
  if (channels.length) return channels[0];
  const triggerType = String(run?.triggerContext?.triggerType || '').toLowerCase();
  if (triggerType.includes('whatsapp')) return 'whatsapp';
  if (triggerType.includes('email')) return 'email';
  if (triggerType.includes('sms')) return 'sms';
  return 'automation';
}

function statusIsSuccessful(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'success' || normalized === 'sent' || normalized === 'delivered' || normalized === 'read';
}

function statusIsFailed(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'failed' || normalized === 'error';
}

function runLevel(run) {
  if (statusIsFailed(run?.status)) return 'error';
  if (String(run?.status || '').toLowerCase() === 'skipped') return 'warning';
  if (String(run?.status || '').toLowerCase() === 'pending') return 'info';
  return 'success';
}

function buildRunLogMessage(run) {
  if (run?.error) return run.error;
  const actions = getRunActions(run);
  if (!actions.length) {
    return String(run?.status || '').toLowerCase() === 'skipped'
      ? `Run skipped${run?.resultSummary?.reason ? `: ${run.resultSummary.reason}` : ''}`
      : 'Automation run completed';
  }
  const failed = actions.find((action) => action?.success === false);
  if (failed) {
    return `${failed.type || 'action'} failed${failed.error ? `: ${failed.error}` : ''}`;
  }
  return `Completed ${actions.length} action${actions.length === 1 ? '' : 's'}`;
}

function buildChannelFilterClause(channel) {
  const actionType = Object.entries(ACTION_CHANNEL_MAP).find(([, mapped]) => mapped === channel)?.[0];
  if (!actionType) return null;
  return literal(`EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE("AutomationRun"."resultSummary"->'results', '[]'::jsonb)) AS elem
    WHERE elem->>'type' = ${sequelize.escape(actionType)}
  )`);
}

function buildRunWhereClause(req) {
  const where = { tenantId: req.tenantId };
  if (req.query.ruleId) where.ruleId = req.query.ruleId;
  if (req.query.status) where.status = req.query.status;

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  const channelClause = req.query.channel ? buildChannelFilterClause(String(req.query.channel).toLowerCase()) : null;
  if (channelClause) {
    where[Op.and] = [...(where[Op.and] || []), channelClause];
  }

  return where;
}

function paginatedPayload(rows, count, page, limit) {
  return {
    runs: rows,
    total: count,
    totalPages: Math.ceil(count / limit) || 0,
    currentPage: page,
    limit
  };
}

function countMessagesInRuns(runs) {
  return runs.reduce((total, run) => {
    const actions = getRunActions(run);
    return total + actions.filter(
      (action) => ['send_whatsapp', 'send_email_platform', 'send_sms'].includes(action?.type)
        && action?.success !== false
        && !action?.skipped
    ).length;
  }, 0);
}

function countTasksInRuns(runs) {
  return runs.reduce((total, run) => {
    const actions = getRunActions(run);
    return total + actions.filter((action) => action?.type === 'create_task' && action?.success !== false).length;
  }, 0);
}

function mapRunToActivityItem(run, ruleName) {
  const actions = getRunActions(run);
  const firstAction = actions[0];
  const channel = getPrimaryChannel(run);
  const title = statusIsFailed(run?.status)
    ? `${ruleName} failed`
    : `${ruleName} ran`;
  const subtitle = firstAction?.type
    ? `${firstAction.type.replace(/_/g, ' ')} workflow`
    : (run?.triggerContext?.triggerType || 'automation');
  return {
    id: `run-${run.id}`,
    title,
    subtitle,
    status: run?.status || 'success',
    time: run?.finishedAt || run?.createdAt || run?.startedAt,
    channel
  };
}

function mapWhatsAppEventToActivityItem(event) {
  return {
    id: `wa-${event.id}`,
    title: event?.templateName
      ? `${event.templateName} message ${event?.status || 'event'}`
      : 'WhatsApp message event',
    subtitle: [event?.direction, event?.eventType, event?.messageId].filter(Boolean).join(' · '),
    status: event?.status || event?.eventType || 'event',
    time: event?.occurredAt || event?.createdAt,
    channel: 'whatsapp'
  };
}

function normalizeRunLog(run, ruleName) {
  const level = runLevel(run);
  const channel = getPrimaryChannel(run);
  return {
    id: `run:${run.id}`,
    time: run?.finishedAt || run?.createdAt || run?.startedAt,
    level,
    ruleId: run.ruleId,
    ruleName,
    message: buildRunLogMessage(run),
    channel,
    metadata: {
      triggerContext: run.triggerContext,
      resultSummary: run.resultSummary,
      status: run.status
    },
    runId: run.id,
    whatsappEventId: null
  };
}

function normalizeWhatsAppLog(event, ruleNameById) {
  const metadata = event?.metadata || {};
  const ruleId = metadata.automationRuleId || metadata.ruleId || null;
  const level = event?.error ? 'error' : (statusIsFailed(event?.status) ? 'error' : 'info');
  return {
    id: `wa:${event.id}`,
    time: event?.occurredAt || event?.createdAt,
    level,
    ruleId,
    ruleName: ruleNameById.get(ruleId) || 'WhatsApp message event',
    message: event?.error
      ? `WhatsApp event failed: ${event.error}`
      : `WhatsApp ${event?.templateName || event?.eventType || 'message'}${event?.status ? ` ${event.status}` : ''}`,
    channel: 'whatsapp',
    metadata: {
      messageId: event.messageId,
      direction: event.direction,
      eventType: event.eventType,
      status: event.status,
      templateName: event.templateName,
      payload: event.payload,
      eventMetadata: metadata,
      error: event.error
    },
    runId: metadata.automationRunId || null,
    whatsappEventId: event.id
  };
}

function getMessagingRequirements(actionConfig) {
  const actions = Array.isArray(actionConfig?.actions) ? actionConfig.actions : [];
  return {
    needsPhone: actions.some((action) => ['send_sms', 'send_whatsapp'].includes(action?.type)),
    needsEmail: actions.some((action) => action?.type === 'send_email_platform'),
  };
}

function buildTestTriggerContext(rule) {
  const triggerType = rule?.triggerType || 'manual_test';
  return {
    subjectKey: `test:${rule?.id || Date.now()}:${Date.now()}`,
    triggerType,
    scheduler: false,
    customerName: 'Test Customer',
    invoiceNumber: 'INV-TEST-0001',
    quoteNumber: 'QTE-TEST-0001',
    productName: 'Test Product',
    quantityOnHand: 2,
    reorderLevel: 5,
    amount: 100,
    balance: 100,
    totalAmount: 100,
    invoiceStatus: 'sent',
    paymentStatus: 'unpaid',
    paymentAmount: 100,
    paymentMethod: 'cash',
    paymentNumber: 'PAY-TEST-0001',
    overdueDays: 2,
    hasOverdueInvoices: true,
    customerHasPhone: false,
    customerHasEmail: false,
    whatsappConsent: true,
    smsConsent: true,
    marketingConsent: true,
    dateOfBirth: new Date().toISOString().slice(0, 10),
    lastPurchaseDaysAgo: 45,
    totalSpend: 300,
    customer: {
      name: 'Test Customer',
      dateOfBirth: new Date().toISOString().slice(0, 10),
      whatsappConsent: true,
      smsConsent: true,
      marketingConsent: true
    },
    product: {
      name: 'Test Product',
      quantityOnHand: 2,
      reorderLevel: 5,
      isActive: true
    },
    paymentLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay-invoice/test`,
    message: `Test automation run for ${rule?.name || 'rule'}`
  };
}

exports.getTemplates = async (req, res, next) => {
  try {
    const templates = filterTemplatesForTenant(getTemplates(), req.tenant);
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

exports.listRules = async (req, res, next) => {
  try {
    const { ensureDefaultAutomationsSafe } = require('../services/defaultAutomationService');
    await ensureDefaultAutomationsSafe(req.tenantId, { tenant: req.tenant });

    const enabledOnly = parseBoolean(req.query.enabledOnly, false);
    let where = { tenantId: req.tenantId };
    if (enabledOnly) where.enabled = true;
    // Show rules for the active branch plus rules that apply to all branches (null scope).
    where = applyScopedReadFilters(req, where);
    const rows = await AutomationRule.findAll({ where, order: [['updatedAt', 'DESC']] });
    const ids = rows.map((row) => row.id);
    const runs = ids.length ? await AutomationRun.findAll({
      where: { tenantId: req.tenantId, ruleId: { [Op.in]: ids } },
      order: [['createdAt', 'DESC']],
      limit: Math.min(500, ids.length * 5)
    }) : [];
    const lastRunByRule = new Map();
    for (const run of runs) {
      if (!lastRunByRule.has(run.ruleId)) lastRunByRule.set(run.ruleId, run);
    }
    const data = rows.map((rule) => {
      const plain = rule.get({ plain: true });
      const lastRun = lastRunByRule.get(rule.id);
      return {
        ...plain,
        lastRun: lastRun ? lastRun.get({ plain: true }) : null,
        derivedStatus: !plain.enabled ? 'paused' : lastRun?.status === 'failed' ? 'failed' : lastRun ? 'active' : 'waiting'
      };
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.createRule = async (req, res, next) => {
  try {
    const {
      name,
      triggerType,
      triggerConfig = {},
      conditionConfig = {},
      actionConfig = {},
      scheduleConfig = {},
      enabled = true,
      metadata = {}
    } = req.body || {};
    if (!name || !triggerType) {
      return res.status(400).json({ success: false, error: 'name and triggerType are required' });
    }
    const normalizedTriggerType = String(triggerType).trim();
    if (!isTriggerAllowedForTenant(normalizedTriggerType, req.tenant)) {
      return res.status(400).json({ success: false, error: DISALLOWED_TRIGGER_MESSAGE, errorCode: 'TRIGGER_NOT_ALLOWED' });
    }
    const branchIds = resolveBranchIdsForWrite(req, req.body || {});
    const branchError = validateBranchAccess(req, branchIds);
    if (branchError) {
      return res.status(403).json({ success: false, error: branchError, errorCode: 'BRANCH_ACCESS_DENIED' });
    }

    const duplicate = await findDuplicateMessagingAutomationRule({
      tenantId: req.tenantId,
      triggerType: normalizedTriggerType,
      actionConfig,
      shopId: branchIds.shopId,
      studioLocationId: branchIds.studioLocationId,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: `A "${normalizedTriggerType}" automation with the same channel already exists ("${duplicate.name}"). Edit that rule instead of creating another.`,
        errorCode: 'DUPLICATE_AUTOMATION_RULE',
        data: { existingRuleId: duplicate.id, existingRuleName: duplicate.name },
      });
    }

    const created = await AutomationRule.create({
      tenantId: req.tenantId,
      name: String(name).trim(),
      triggerType: normalizedTriggerType,
      triggerConfig,
      conditionConfig,
      actionConfig,
      scheduleConfig,
      enabled: parseBoolean(enabled, true),
      metadata,
      shopId: branchIds.shopId,
      studioLocationId: branchIds.studioLocationId,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

exports.updateRule = async (req, res, next) => {
  try {
    const rule = await AutomationRule.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'triggerType')) {
      const nextTriggerType = String(body.triggerType || '').trim();
      if (nextTriggerType !== rule.triggerType && !isTriggerAllowedForTenant(nextTriggerType, req.tenant)) {
        return res.status(400).json({ success: false, error: DISALLOWED_TRIGGER_MESSAGE, errorCode: 'TRIGGER_NOT_ALLOWED' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'shopId') || Object.prototype.hasOwnProperty.call(body, 'studioLocationId')) {
      const branchIds = resolveBranchIdsForWrite(req, body);
      const branchError = validateBranchAccess(req, branchIds);
      if (branchError) {
        return res.status(403).json({ success: false, error: branchError, errorCode: 'BRANCH_ACCESS_DENIED' });
      }
      rule.shopId = branchIds.shopId;
      rule.studioLocationId = branchIds.studioLocationId;
    }
    const wasSystemDefault = Boolean(rule.metadata?.systemDefault);
    const allowedFields = ['name', 'triggerType', 'triggerConfig', 'conditionConfig', 'actionConfig', 'scheduleConfig', 'enabled', 'metadata'];
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        rule[key] = key === 'enabled' ? parseBoolean(body[key], rule.enabled) : body[key];
      }
    }
    if (wasSystemDefault) {
      const { markSystemDefaultUserModified } = require('../services/defaultAutomationService');
      rule.metadata = { ...(rule.metadata || {}), systemDefault: true };
      markSystemDefaultUserModified(rule);
    }
    rule.updatedBy = req.user?.id || null;

    const duplicate = await findDuplicateMessagingAutomationRule({
      tenantId: req.tenantId,
      triggerType: rule.triggerType,
      actionConfig: rule.actionConfig,
      shopId: rule.shopId,
      studioLocationId: rule.studioLocationId,
      excludeId: String(rule.id),
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: `A "${rule.triggerType}" automation with the same channel already exists ("${duplicate.name}"). Edit that rule instead.`,
        errorCode: 'DUPLICATE_AUTOMATION_RULE',
        data: { existingRuleId: duplicate.id, existingRuleName: duplicate.name },
      });
    }

    await rule.save();
    res.status(200).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
};

exports.toggleRule = async (req, res, next) => {
  try {
    const rule = await AutomationRule.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    rule.enabled = !rule.enabled;
    const { markSystemDefaultUserModified } = require('../services/defaultAutomationService');
    markSystemDefaultUserModified(rule);
    rule.updatedBy = req.user?.id || null;
    await rule.save();
    res.status(200).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
};

exports.deleteRule = async (req, res, next) => {
  try {
    const rule = await AutomationRule.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    const { recordSkippedDefaultTemplate } = require('../services/defaultAutomationService');
    await recordSkippedDefaultTemplate(req.tenantId, rule);
    await rule.destroy();
    res.status(200).json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    next(error);
  }
};

exports.listRuns = async (req, res, next) => {
  try {
    const where = buildRunWhereClause(req);
    const usePagination = req.query.page != null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    if (!usePagination) {
      const rows = await AutomationRun.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: Math.min(200, Number(req.query.limit || 50))
      });
      return res.status(200).json({ success: true, data: rows });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const { count, rows } = await AutomationRun.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    return res.status(200).json({
      success: true,
      data: paginatedPayload(rows, count, page, limit)
    });
  } catch (error) {
    next(error);
  }
};

exports.getOverview = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - TOP_RULES_LOOKBACK_DAYS);

    const [
      activeRulesCount,
      todayRuns,
      whatsappEventsToday,
      rules,
      recentRuns,
      recentWhatsAppEvents,
      lookbackRuns,
      schedulerRun
    ] = await Promise.all([
      AutomationRule.count({ where: { tenantId, enabled: true } }),
      AutomationRun.findAll({
        where: { tenantId, createdAt: { [Op.between]: [todayStart, todayEnd] } },
        order: [['createdAt', 'DESC']]
      }),
      WhatsAppMessageEvent.findAll({
        where: {
          tenantId,
          createdAt: { [Op.between]: [todayStart, todayEnd] },
          direction: { [Op.ne]: 'inbound' }
        },
        order: [['occurredAt', 'DESC']]
      }),
      AutomationRule.findAll({
        where: { tenantId },
        attributes: ['id', 'name', 'enabled', 'triggerType'],
        order: [['updatedAt', 'DESC']]
      }),
      AutomationRun.findAll({
        where: { tenantId },
        order: [['createdAt', 'DESC']],
        limit: RECENT_ACTIVITY_LIMIT
      }),
      WhatsAppMessageEvent.findAll({
        where: { tenantId },
        order: [['occurredAt', 'DESC']],
        limit: RECENT_ACTIVITY_LIMIT
      }),
      AutomationRun.findAll({
        where: { tenantId, createdAt: { [Op.gte]: lookbackStart } },
        attributes: ['id', 'ruleId', 'status', 'createdAt']
      }),
      AutomationRun.findOne({
        where: {
          tenantId,
          triggerContext: { [Op.contains]: { scheduler: true } }
        },
        order: [['createdAt', 'DESC']]
      })
    ]);

    const ruleNameById = new Map(rules.map((rule) => [rule.id, rule.name || 'Rule']));
    const runsToday = todayRuns.length;
    const successfulToday = todayRuns.filter((run) => statusIsSuccessful(run.status)).length;
    const failedToday = todayRuns.filter((run) => statusIsFailed(run.status)).length;
    const messageActionsToday = countMessagesInRuns(todayRuns);
    const whatsappSentToday = whatsappEventsToday.filter((event) => !statusIsFailed(event.status)).length;
    const tasksCreatedToday = countTasksInRuns(todayRuns);

    const recentActivity = [
      ...recentRuns.map((run) => mapRunToActivityItem(run, ruleNameById.get(run.ruleId) || 'Automation run')),
      ...recentWhatsAppEvents.map(mapWhatsAppEventToActivityItem)
    ]
      .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    const performanceByRule = new Map();
    for (const run of lookbackRuns) {
      const bucket = performanceByRule.get(run.ruleId) || { total: 0, success: 0 };
      bucket.total += 1;
      if (statusIsSuccessful(run.status)) bucket.success += 1;
      performanceByRule.set(run.ruleId, bucket);
    }

    const topPerformingRules = [...performanceByRule.entries()]
      .map(([ruleId, stats]) => ({
        ruleId,
        ruleName: ruleNameById.get(ruleId) || 'Automation',
        successRate: stats.total ? Math.round((stats.success / stats.total) * 100) : 0,
        runsCount: stats.total,
        channel: rules.find((rule) => rule.id === ruleId)?.triggerType || null
      }))
      .sort((a, b) => b.successRate - a.successRate || b.runsCount - a.runsCount)
      .slice(0, TOP_RULES_LIMIT);

    const schedulerStatus = automationSchedulerService.getStatus();
    const schedulerLastRunAt = schedulerStatus.lastCompletedAt
      || schedulerRun?.createdAt
      || null;
    const automationsEnabledCount = activeRulesCount;
    const schedulerHealthy = schedulerStatus.enabled !== false && !schedulerStatus.lastError;
    const systemHealth = {
      schedulerLastRunAt,
      schedulerCron: schedulerStatus.cron,
      schedulerEnabled: schedulerStatus.enabled,
      schedulerIsRunning: schedulerStatus.isRunning,
      automationsEnabledCount,
      status: schedulerHealthy ? 'healthy' : 'degraded',
      message: schedulerHealthy
        ? 'All systems operational'
        : (schedulerStatus.lastError || 'Automation scheduler needs attention')
    };

    res.status(200).json({
      success: true,
      data: {
        activeRulesCount,
        runsToday,
        successfulToday,
        failedToday,
        messagesSentToday: Math.max(messageActionsToday, whatsappSentToday),
        tasksCreatedToday,
        recentActivity,
        topPerformingRules,
        systemHealth
      }
    });
  } catch (error) {
    next(error);
  }
};

function buildEventWhereClause(req) {
  const eventWhere = { tenantId: req.tenantId };
  const andClauses = [];

  if (req.query.ruleId) {
    const ruleId = String(req.query.ruleId);
    andClauses.push({
      [Op.or]: [
        literal(`COALESCE("WhatsAppMessageEvent"."metadata"->>'automationRuleId', '') = ${sequelize.escape(ruleId)}`),
        literal(`COALESCE("WhatsAppMessageEvent"."metadata"->>'ruleId', '') = ${sequelize.escape(ruleId)}`)
      ]
    });
  }

  if (req.query.status) eventWhere.status = req.query.status;

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);
  if (from || to) {
    const dateFilter = {};
    if (from) dateFilter[Op.gte] = from;
    if (to) dateFilter[Op.lte] = to;
    andClauses.push({
      [Op.or]: [
        { occurredAt: dateFilter },
        { createdAt: dateFilter }
      ]
    });
  }

  if (andClauses.length) eventWhere[Op.and] = andClauses;
  return eventWhere;
}

exports.listLogs = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const tenantId = req.tenantId;
    const runWhere = buildRunWhereClause(req);
    const eventWhere = buildEventWhereClause(req);

    const channel = req.query.channel ? String(req.query.channel).toLowerCase() : null;
    if (channel === 'whatsapp') {
      runWhere[Op.and] = [...(runWhere[Op.and] || []), buildChannelFilterClause('whatsapp')].filter(Boolean);
    } else if (channel && channel !== 'whatsapp') {
      const channelClause = buildChannelFilterClause(channel);
      if (channelClause) {
        runWhere[Op.and] = [...(runWhere[Op.and] || []), channelClause];
      }
    }

    const level = req.query.level ? String(req.query.level).toLowerCase() : null;

    const [rules, runCount, eventCount] = await Promise.all([
      AutomationRule.findAll({
        where: { tenantId },
        attributes: ['id', 'name']
      }),
      AutomationRun.count({ where: runWhere }),
      channel && channel !== 'whatsapp' ? 0 : WhatsAppMessageEvent.count({ where: eventWhere })
    ]);

    const ruleNameById = new Map(rules.map((rule) => [rule.id, rule.name || 'Rule']));
    const fetchLimit = offset + limit;

    const [runs, events] = await Promise.all([
      AutomationRun.findAll({
        where: runWhere,
        order: [['createdAt', 'DESC']],
        limit: fetchLimit
      }),
      channel && channel !== 'whatsapp'
        ? Promise.resolve([])
        : WhatsAppMessageEvent.findAll({
          where: eventWhere,
          order: [['occurredAt', 'DESC']],
          limit: fetchLimit
        })
    ]);

    let logs = [
      ...runs.map((run) => normalizeRunLog(run, ruleNameById.get(run.ruleId) || 'Automation run')),
      ...events.map((event) => normalizeWhatsAppLog(event, ruleNameById))
    ];

    if (level) {
      logs = logs.filter((entry) => entry.level === level);
    }

    logs.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

    const total = channel && channel !== 'whatsapp'
      ? logs.length
      : runCount + eventCount;
    const entries = logs.slice(offset, offset + limit);

    res.status(200).json({
      success: true,
      data: {
        logs: entries,
        total: level ? logs.length : total,
        totalPages: Math.ceil((level ? logs.length : total) / limit) || 0,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.testRule = async (req, res, next) => {
  try {
    const rule = await AutomationRule.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    const force = parseBoolean(req.query.force ?? req.body?.force, true);
    const providedContext = req.body?.triggerContext && typeof req.body.triggerContext === 'object'
      ? req.body.triggerContext
      : {};
    const triggerContext = {
      ...buildTestTriggerContext(rule),
      ...providedContext,
      manualTest: true,
      test: true
    };
    const resolvedNames = await resolveBusinessNameForContext(req.tenantId, triggerContext);
    triggerContext.businessName = resolvedNames.businessName;
    triggerContext.branchName = resolvedNames.branchName;
    const messagingRequirements = getMessagingRequirements(rule.actionConfig);
    if (messagingRequirements.needsPhone && !String(triggerContext.phone || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'Test run requires a recipient phone number for SMS or WhatsApp actions.',
        errorCode: 'TEST_RECIPIENT_PHONE_REQUIRED'
      });
    }
    if (messagingRequirements.needsEmail && !String(triggerContext.email || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'Test run requires a recipient email address for email actions.',
        errorCode: 'TEST_RECIPIENT_EMAIL_REQUIRED'
      });
    }
    const result = await executeRule({
      rule,
      tenantId: req.tenantId,
      triggerContext,
      actorUserId: req.user?.id || null,
      options: {
        ignoreEnabled: force,
        alwaysRecordRun: true,
        skipDedupe: true,
        // Manual / force tests run immediately (do not enqueue delayMinutes).
        skipDelay: true,
      }
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.draftRule = async (req, res, next) => {
  try {
    const instruction = String(req.body?.instruction || '').trim();
    if (!instruction) {
      return res.status(400).json({ success: false, error: 'instruction is required' });
    }
    const draft = await openaiService.draftAutomationRule({
      instruction,
      businessType: req.tenant?.businessType || 'printing_press',
      tenant: req.tenant,
      tenantId: req.tenantId,
      suggestionsContext: { tenantName: req.tenant?.name || null }
    });
    res.status(200).json({ success: true, data: draft });
  } catch (error) {
    next(error);
  }
};

exports.getSuggestions = async (req, res, next) => {
  try {
    const [overdueCount, lowStockCount] = await Promise.all([
      Invoice.count({
        where: {
          tenantId: req.tenantId,
          balance: { [Op.gt]: 0 },
          dueDate: { [Op.lt]: new Date() },
          status: { [Op.in]: ['sent', 'partial', 'overdue'] }
        }
      }),
      Product.count({
        where: {
          tenantId: req.tenantId,
          isActive: true,
          trackStock: { [Op.ne]: false },
          reorderLevel: { [Op.gt]: 0 },
          [Op.and]: [
            sequelize.where(col('quantityOnHand'), Op.lte, col('reorderLevel'))
          ]
        }
      })
    ]);
    const suggestions = [];
    if (overdueCount > 0) {
      suggestions.push({
        key: 'overdue_invoice_whatsapp',
        title: 'Remind customers about overdue invoices',
        description: `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} currently have an outstanding overdue balance.`,
        prompt: 'Create a transactional WhatsApp reminder for overdue invoices with a payment link and a 24 hour cooldown.'
      });
    }
    if (lowStockCount > 0) {
      suggestions.push({
        key: 'low_stock_task',
        title: 'Create restock tasks for low stock',
        description: 'Some active products have reorder levels configured.',
        prompt: 'Create a task when product stock is at or below the reorder level.'
      });
    }
    res.status(200).json({ success: true, data: suggestions });
  } catch (error) {
    next(error);
  }
};

exports.listWhatsAppEvents = async (req, res, next) => {
  try {
    const where = { tenantId: req.tenantId };
    if (req.query.ruleId) {
      where[Op.or] = [
        literal(`COALESCE("WhatsAppMessageEvent"."metadata"->>'automationRuleId', '') = ${sequelize.escape(String(req.query.ruleId))}`),
        literal(`COALESCE("WhatsAppMessageEvent"."metadata"->>'ruleId', '') = ${sequelize.escape(String(req.query.ruleId))}`)
      ];
    }
    if (req.query.status) where.status = req.query.status;

    const from = parseIsoDate(req.query.from);
    const to = parseIsoDate(req.query.to);
    if (from || to) {
      const dateFilter = {};
      if (from) dateFilter[Op.gte] = from;
      if (to) dateFilter[Op.lte] = to;
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { occurredAt: dateFilter },
            { createdAt: dateFilter }
          ]
        }
      ];
    }

    const usePagination = req.query.page != null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    if (!usePagination) {
      const rows = await WhatsAppMessageEvent.findAll({
        where,
        order: [['occurredAt', 'DESC']],
        limit: Math.min(200, Number(req.query.limit || 50))
      });
      return res.status(200).json({ success: true, data: rows });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const { count, rows } = await WhatsAppMessageEvent.findAndCountAll({
      where,
      order: [['occurredAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      success: true,
      data: {
        events: rows,
        total: count,
        totalPages: Math.ceil(count / limit) || 0,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};
