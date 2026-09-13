const { Op } = require('sequelize');
const { AutomationRule, Setting, SaleActivity } = require('../models');
const { isInternalAudience } = require('./automationRecipientService');

/** Dedupe window for receipt sends (built-in vs POS auto_send vs automation). */
const RECEIPT_DEDUPE_WINDOW_MINUTES = 5;

const TEMPLATE_KEYS = {
  INVOICE_SENT: 'invoice_sent_notification',
  SALE_COMPLETED_RECEIPT: 'sale_completed_receipt',
  PAYMENT_RECEIVED_THANK_YOU: 'payment_received_thank_you',
  OVERDUE_INVOICE_REMINDER: 'overdue_invoice_reminder',
  JOB_CREATED_TRACKING_EMAIL: 'job_created_tracking_email',
  JOB_CREATED_TRACKING_SMS: 'job_created_tracking_sms',
  JOB_CREATED_SEND_INVOICE: 'job_created_send_invoice',
  ORDER_CREATED_NOTIFICATION: 'order_created_notification',
  JOB_ASSIGNED_STAFF: 'job_assigned_staff',
  QUOTE_ACCEPTED_STAFF: 'quote_accepted_staff',
  TASK_ASSIGNED_STAFF: 'task_assigned_staff',
  LOW_STOCK_ON_CHANGE: 'low_stock_on_change',
  OUT_OF_STOCK_ALERT: 'out_of_stock_alert',
  LOW_STOCK_ALERT: 'low_stock_alert',
  RENTAL_DUE_REMINDER: 'rental_due_reminder',
  RENTAL_OVERDUE_REMINDER: 'rental_overdue_reminder',
};

/** Staff-only templates — never count toward customer receipt channel coverage. */
const STAFF_TEMPLATE_KEYS = new Set([
  'job_assigned_staff',
  'quote_accepted_staff',
  'sale_completed_staff',
  'task_assigned_staff',
]);

/** Template keys that should also match by trigger type (any custom overdue rule). */
const TEMPLATE_KEY_TRIGGER_TYPES = {
  [TEMPLATE_KEYS.SALE_COMPLETED_RECEIPT]: 'sale_completed',
  [TEMPLATE_KEYS.OVERDUE_INVOICE_REMINDER]: 'invoice_overdue',
  [TEMPLATE_KEYS.ORDER_CREATED_NOTIFICATION]: 'order_created',
  [TEMPLATE_KEYS.JOB_ASSIGNED_STAFF]: 'job_assigned_staff',
  [TEMPLATE_KEYS.QUOTE_ACCEPTED_STAFF]: 'quote_accepted_staff',
  [TEMPLATE_KEYS.TASK_ASSIGNED_STAFF]: 'task_assigned_staff',
  [TEMPLATE_KEYS.LOW_STOCK_ON_CHANGE]: 'low_stock_on_change',
  [TEMPLATE_KEYS.OUT_OF_STOCK_ALERT]: 'out_of_stock_detected',
  [TEMPLATE_KEYS.LOW_STOCK_ALERT]: 'low_stock_detected',
  [TEMPLATE_KEYS.RENTAL_DUE_REMINDER]: 'rental_due_in_days',
  [TEMPLATE_KEYS.RENTAL_OVERDUE_REMINDER]: 'rental_overdue',
};

/** Maps automation messaging action types to the delivery channel they cover. */
const ACTION_TYPE_TO_CHANNEL = {
  send_sms: 'sms',
  send_email_platform: 'email',
  send_whatsapp: 'whatsapp',
};

/**
 * Find an enabled automation rule seeded from or matching a template key.
 * @param {string} tenantId
 * @param {string} templateKey
 * @returns {Promise<object|null>}
 */
// audience lives on metadata/actionConfig, not a table column — never select it here
const AUTOMATION_RULE_ATTRIBUTES = [
  'id',
  'name',
  'triggerType',
  'metadata',
  'enabled',
  'actionConfig',
];

async function getEnabledRuleByTemplateKey(tenantId, templateKey) {
  if (!tenantId || !templateKey) return null;
  const rules = await AutomationRule.findAll({
    where: { tenantId, enabled: true },
    attributes: AUTOMATION_RULE_ATTRIBUTES,
  });
  return rules.find((rule) => rule.metadata?.templateKey === templateKey) || null;
}

/**
 * All enabled customer-facing automation rules for a template (by templateKey or trigger type).
 * Staff/internal rules are excluded so they never suppress manual customer receipt sends.
 * @param {string} tenantId
 * @param {string} templateKey
 * @returns {Promise<object[]>}
 */
async function getEnabledCustomerRulesForTemplate(tenantId, templateKey) {
  if (!tenantId || !templateKey) return [];
  const rules = await AutomationRule.findAll({
    where: { tenantId, enabled: true },
    attributes: AUTOMATION_RULE_ATTRIBUTES,
  });
  const triggerType = TEMPLATE_KEY_TRIGGER_TYPES[templateKey];
  return rules.filter((rule) => {
    const ruleTemplateKey = rule.metadata?.templateKey;
    if (STAFF_TEMPLATE_KEYS.has(ruleTemplateKey)) return false;
    if (isInternalAudience({ rule })) return false;
    if (ruleTemplateKey === templateKey) return true;
    if (triggerType && rule.triggerType === triggerType) return true;
    return false;
  });
}

/**
 * Find an enabled automation rule by trigger type.
 * @param {string} tenantId
 * @param {string} triggerType
 * @returns {Promise<object|null>}
 */
async function getEnabledRuleByTriggerType(tenantId, triggerType) {
  if (!tenantId || !triggerType) return null;
  return AutomationRule.findOne({
    where: { tenantId, enabled: true, triggerType },
    attributes: ['id', 'name', 'triggerType', 'metadata', 'enabled', 'actionConfig'],
  });
}

/**
 * When an enabled automation rule exists for this template (or matching trigger),
 * built-in channel sends should be skipped.
 * @param {string} tenantId
 * @param {string} templateKey
 * @returns {Promise<boolean>}
 */
async function shouldUseAutomationInsteadOfBuiltIn(tenantId, templateKey) {
  if (await getEnabledRuleByTemplateKey(tenantId, templateKey)) return true;
  const triggerType = TEMPLATE_KEY_TRIGGER_TYPES[templateKey];
  if (triggerType && await getEnabledRuleByTriggerType(tenantId, triggerType)) return true;
  return false;
}

/**
 * Which delivery channels (sms/email/whatsapp) are actually covered by the enabled
 * automation rule matching this template — an enabled "sale receipt" automation that only
 * sends WhatsApp + email should not silently swallow a manually-requested SMS send.
 * @param {string} tenantId
 * @param {string} templateKey
 * @returns {Promise<Set<string>>}
 */
async function getAutomationCoveredChannelsForTemplate(tenantId, templateKey) {
  const covered = new Set();
  const rules = await getEnabledCustomerRulesForTemplate(tenantId, templateKey);
  for (const rule of rules) {
    const actions = Array.isArray(rule.actionConfig?.actions) ? rule.actionConfig.actions : [];
    for (const action of actions) {
      if (action?.audience === 'internal') continue;
      const channel = ACTION_TYPE_TO_CHANNEL[action?.type];
      if (channel) covered.add(channel);
    }
  }
  return covered;
}

/**
 * Serialize automation channel coverage for API responses.
 * @param {Set<string>} covered
 * @returns {{ sms: boolean, email: boolean, whatsapp: boolean }}
 */
function automationCoverageToObject(covered) {
  return {
    sms: covered.has('sms'),
    email: covered.has('email'),
    whatsapp: covered.has('whatsapp'),
  };
}

/**
 * Receipt automation coverage for POS / sale receipt UI.
 * @param {string} tenantId
 * @returns {Promise<{ sms: boolean, email: boolean, whatsapp: boolean }>}
 */
async function getSaleReceiptAutomationCoverage(tenantId) {
  const covered = await getAutomationCoveredChannelsForTemplate(
    tenantId,
    TEMPLATE_KEYS.SALE_COMPLETED_RECEIPT
  );
  return automationCoverageToObject(covered);
}

/**
 * Whether a specific channel is handled by an enabled automation for this template
 * (as opposed to shouldUseAutomationInsteadOfBuiltIn, which is all-or-nothing per rule match).
 * @param {string} tenantId
 * @param {string} templateKey
 * @param {string} channel - 'sms' | 'email' | 'whatsapp'
 * @returns {Promise<boolean>}
 */
async function isChannelHandledByAutomation(tenantId, templateKey, channel) {
  const covered = await getAutomationCoveredChannelsForTemplate(tenantId, templateKey);
  return covered.has(channel);
}

/**
 * Dual-read: feature is on if the legacy setting is on OR a matching automation rule is enabled.
 * @param {string} tenantId
 * @param {{ settingEnabled?: boolean, templateKey: string }} params
 * @returns {Promise<boolean>}
 */
async function isCustomerNotificationEffectiveEnabled(tenantId, { settingEnabled = false, templateKey }) {
  if (settingEnabled) return true;
  return Boolean(await getEnabledRuleByTemplateKey(tenantId, templateKey));
}

/**
 * Whether POS auto-send receipt mode is enabled for the tenant.
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
async function isPosAutoSendReceiptEnabled(tenantId) {
  const row = await Setting.findOne({ where: { tenantId, key: 'pos_config' } });
  const mode = row?.value?.receipt?.mode;
  return mode === 'auto_send' || mode === 'auto_both';
}

/**
 * Whether a receipt was sent for this sale within the dedupe window.
 * When `channel` is provided, only counts as a dupe if that specific channel was actually
 * recorded as sent — an auto-sent email should not block a manually-requested SMS.
 * @param {string} tenantId
 * @param {string} saleId
 * @param {string|null} [channel] - 'sms' | 'email' | 'whatsapp'; omit for a global (any-channel) check
 * @returns {Promise<boolean>}
 */
async function hasRecentReceiptForSale(tenantId, saleId, channel = null) {
  if (!tenantId || !saleId) return false;
  const threshold = new Date(Date.now() - RECEIPT_DEDUPE_WINDOW_MINUTES * 60 * 1000);
  const recent = await SaleActivity.findAll({
    where: {
      tenantId,
      saleId,
      type: 'receipt_sent',
      createdAt: { [Op.gte]: threshold },
    },
    attributes: ['id', 'metadata'],
  });
  if (!recent.length) return false;
  if (!channel) return true;
  return recent.some((activity) => {
    const channels = activity.metadata?.channels;
    return Array.isArray(channels) && channels.includes(channel);
  });
}

/**
 * Record a receipt_sent activity for dedupe (built-in auto-send path).
 * @param {string} tenantId
 * @param {string} saleId
 * @param {{ source?: string, channels?: string[] }} [metadata]
 * @returns {Promise<void>}
 */
async function recordReceiptSentActivity(tenantId, saleId, metadata = {}) {
  await SaleActivity.create({
    saleId,
    tenantId,
    type: 'receipt_sent',
    subject: 'Receipt Sent',
    notes: metadata.source ? `Receipt sent (${metadata.source})` : 'Receipt sent',
    createdBy: null,
    metadata: { automated: true, ...metadata },
  });
}

module.exports = {
  TEMPLATE_KEYS,
  TEMPLATE_KEY_TRIGGER_TYPES,
  STAFF_TEMPLATE_KEYS,
  RECEIPT_DEDUPE_WINDOW_MINUTES,
  getEnabledRuleByTemplateKey,
  getEnabledCustomerRulesForTemplate,
  getEnabledRuleByTriggerType,
  shouldUseAutomationInsteadOfBuiltIn,
  getAutomationCoveredChannelsForTemplate,
  automationCoverageToObject,
  getSaleReceiptAutomationCoverage,
  isChannelHandledByAutomation,
  isCustomerNotificationEffectiveEnabled,
  isPosAutoSendReceiptEnabled,
  hasRecentReceiptForSale,
  recordReceiptSentActivity,
};
