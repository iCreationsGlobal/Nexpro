/**
 * Auto-apply standard automation rules for a tenant based on business type
 * and connected messaging channels. Owners only edit or turn them off.
 */

const { Tenant, AutomationRule } = require('../models');
const {
  getDefaultTemplates,
  filterTemplatesForTenant,
} = require('./automationEngineService');

const MESSAGING_ACTION_TYPES = new Set(['send_email_platform', 'send_sms', 'send_whatsapp']);
const AUTOMATION_DEFAULTS_META_KEY = 'automationDefaults';

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
 * Keep actions the tenant can actually send.
 * @param {object[]} actions
 * @param {{ whatsapp: boolean, sms: boolean, email: boolean }} channels
 * @returns {object[]}
 */
function adaptActionsForChannels(actions, channels) {
  if (!Array.isArray(actions)) return [];
  return actions.filter((action) => {
    const type = String(action?.type || '').trim();
    if (type === 'send_whatsapp') return Boolean(channels?.whatsapp);
    if (type === 'send_sms') return Boolean(channels?.sms);
    if (type === 'send_email_platform' || type === 'send_email') return channels?.email !== false;
    return true;
  });
}

/**
 * @param {object} tenant
 * @returns {string[]}
 */
function skippedTemplateKeysFromTenant(tenant) {
  const keys = tenant?.metadata?.[AUTOMATION_DEFAULTS_META_KEY]?.skippedTemplateKeys;
  return Array.isArray(keys) ? keys.map((key) => String(key)).filter(Boolean) : [];
}

/**
 * @param {object} tenant
 * @returns {object}
 */
function automationDefaultsMeta(tenant) {
  const current = tenant?.metadata?.[AUTOMATION_DEFAULTS_META_KEY];
  return current && typeof current === 'object' ? { ...current } : {};
}

/**
 * @param {object[]} existingRules
 * @param {string} templateKey
 * @returns {object|null}
 */
function findRuleByTemplateKey(existingRules, templateKey) {
  return existingRules.find((rule) => rule.metadata?.templateKey === templateKey) || null;
}

/**
 * @param {object[]} existingRules
 * @param {string} triggerType
 * @param {object} actionConfig
 * @returns {object|null}
 */
function findDuplicateMessagingRule(existingRules, triggerType, actionConfig) {
  const candidateChannels = messagingActionTypesFromConfig(actionConfig);
  if (!candidateChannels.length || !triggerType) return null;
  return existingRules.find((rule) => {
    if (String(rule.triggerType || '') !== String(triggerType)) return false;
    if (rule.shopId || rule.studioLocationId) return false;
    const existingChannels = messagingActionTypesFromConfig(rule.actionConfig);
    return candidateChannels.some((channel) => existingChannels.includes(channel));
  }) || null;
}

/**
 * @param {object} rule
 * @returns {boolean}
 */
function isEditableSystemDefault(rule) {
  return Boolean(rule?.metadata?.systemDefault) && rule?.metadata?.userModified !== true;
}

/**
 * @param {object[]} existingActions
 * @param {object[]} adaptedTemplateActions
 * @returns {object[]}
 */
function mergeMissingChannelActions(existingActions, adaptedTemplateActions) {
  const current = Array.isArray(existingActions) ? existingActions : [];
  const existingTypes = new Set(current.map((action) => String(action?.type || '').trim()).filter(Boolean));
  const toAdd = (adaptedTemplateActions || []).filter((action) => {
    const type = String(action?.type || '').trim();
    return type && !existingTypes.has(type);
  });
  return toAdd.length ? [...current, ...toAdd] : current;
}

/**
 * Resolve WhatsApp / SMS availability for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{ whatsapp: boolean, sms: boolean, email: boolean }>}
 */
async function resolveChannelAvailability(tenantId) {
  const whatsappService = require('./whatsappService');
  const whatsappConfig = await whatsappService.getConfig(tenantId).catch(() => null);
  return {
    whatsapp: Boolean(whatsappConfig?.enabled && whatsappConfig?.phoneNumberId),
    // Platform SMS is the system channel (same as platform email).
    sms: true,
    email: true,
  };
}

/**
 * Persist automationDefaults on tenant.metadata.
 * @param {object} tenant
 * @param {object} patch
 * @returns {Promise<object>}
 */
async function patchAutomationDefaultsMeta(tenant, patch) {
  const metadata = { ...(tenant.metadata || {}) };
  metadata[AUTOMATION_DEFAULTS_META_KEY] = {
    ...automationDefaultsMeta(tenant),
    ...patch,
  };
  tenant.metadata = metadata;
  tenant.changed('metadata', true);
  await tenant.save();
  return tenant;
}

/**
 * Remember that the owner deleted a system default so ensure will not recreate it.
 * @param {string} tenantId
 * @param {object} rule
 * @returns {Promise<void>}
 */
async function recordSkippedDefaultTemplate(tenantId, rule) {
  const templateKey = rule?.metadata?.templateKey;
  if (!tenantId || !templateKey || !rule?.metadata?.systemDefault) return;
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return;
  const skipped = new Set(skippedTemplateKeysFromTenant(tenant));
  skipped.add(String(templateKey));
  await patchAutomationDefaultsMeta(tenant, {
    skippedTemplateKeys: [...skipped],
  });
}

/**
 * Mark a system default as owner-edited so later ensure passes leave it alone.
 * @param {object} rule
 * @returns {object}
 */
function markSystemDefaultUserModified(rule) {
  if (!rule?.metadata?.systemDefault) return rule;
  rule.metadata = {
    ...(rule.metadata || {}),
    userModified: true,
  };
  return rule;
}

/**
 * Create or refresh standard automations for a tenant.
 * Idempotent: never recreates deleted defaults, never re-enables paused rules,
 * never rewrites owner-edited rules. May add newly available channel actions
 * onto unedited system defaults.
 *
 * @param {string} tenantId
 * @param {{ tenant?: object|null }} [options]
 * @returns {Promise<{ created: number, updated: number, skipped: number }>}
 */
async function ensureDefaultAutomations(tenantId, options = {}) {
  const summary = { created: 0, updated: 0, skipped: 0 };
  if (!tenantId) return summary;

  const tenant = options.tenant || await Tenant.findByPk(tenantId);
  if (!tenant) return summary;

  const skippedKeys = new Set(skippedTemplateKeysFromTenant(tenant));
  const channels = await resolveChannelAvailability(tenantId);
  const templates = filterTemplatesForTenant(getDefaultTemplates(), tenant);
  const existingRules = await AutomationRule.findAll({
    where: { tenantId },
    attributes: [
      'id',
      'name',
      'enabled',
      'triggerType',
      'triggerConfig',
      'conditionConfig',
      'actionConfig',
      'scheduleConfig',
      'metadata',
      'shopId',
      'studioLocationId',
    ],
  });

  for (const template of templates) {
    const templateKey = template.key;
    if (skippedKeys.has(templateKey)) {
      summary.skipped += 1;
      continue;
    }

    const adaptedActions = adaptActionsForChannels(template.actionConfig?.actions || [], channels);
    if (!adaptedActions.length) {
      summary.skipped += 1;
      continue;
    }

    const actionConfig = {
      ...(template.actionConfig || {}),
      actions: adaptedActions,
    };

    const existing = findRuleByTemplateKey(existingRules, templateKey);
    if (existing) {
      if (!isEditableSystemDefault(existing)) {
        summary.skipped += 1;
        continue;
      }
      const mergedActions = mergeMissingChannelActions(existing.actionConfig?.actions, adaptedActions);
      const addedCount = mergedActions.length - (existing.actionConfig?.actions || []).length;
      if (addedCount <= 0) {
        summary.skipped += 1;
        continue;
      }
      existing.actionConfig = {
        ...(existing.actionConfig || {}),
        actions: mergedActions,
      };
      existing.changed('actionConfig', true);
      await existing.save();
      summary.updated += 1;
      continue;
    }

    const duplicate = findDuplicateMessagingRule(existingRules, template.triggerType, actionConfig);
    if (duplicate) {
      summary.skipped += 1;
      continue;
    }

    const created = await AutomationRule.create({
      tenantId,
      name: template.name,
      enabled: true,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig || {},
      conditionConfig: template.conditionConfig || {},
      actionConfig,
      scheduleConfig: template.scheduleConfig || {},
      metadata: {
        templateKey,
        systemDefault: true,
        userModified: false,
      },
      shopId: null,
      studioLocationId: null,
    });
    existingRules.push(created);
    summary.created += 1;
  }

  await patchAutomationDefaultsMeta(tenant, {
    ensuredAt: new Date().toISOString(),
  });

  return summary;
}

/**
 * Best-effort ensure that never throws to the caller.
 * @param {string} tenantId
 * @param {{ tenant?: object|null }} [options]
 * @returns {Promise<{ created: number, updated: number, skipped: number }|null>}
 */
async function ensureDefaultAutomationsSafe(tenantId, options = {}) {
  try {
    return await ensureDefaultAutomations(tenantId, options);
  } catch (error) {
    console.error('[DefaultAutomations] ensure failed:', error?.message || error);
    return null;
  }
}

module.exports = {
  AUTOMATION_DEFAULTS_META_KEY,
  adaptActionsForChannels,
  ensureDefaultAutomations,
  ensureDefaultAutomationsSafe,
  findDuplicateMessagingRule,
  markSystemDefaultUserModified,
  mergeMissingChannelActions,
  recordSkippedDefaultTemplate,
  resolveChannelAvailability,
};
