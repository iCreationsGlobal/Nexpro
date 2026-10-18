const { Op } = require('sequelize');
const { Setting, SaleActivity } = require('../models');

/** Dedupe window for receipt sends (auto-send vs manual send). */
const RECEIPT_DEDUPE_WINDOW_MINUTES = 5;

/**
 * Receipt auto-send is on unless the workspace explicitly turned it off.
 * @param {object|null|undefined} prefsValue - customer-notification-preferences value
 * @returns {boolean}
 */
function isAutoSendReceiptPreferenceOn(prefsValue) {
  return prefsValue?.autoSendReceiptToCustomer !== false;
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
 * Whether completed sales should email/SMS/WhatsApp a receipt automatically.
 * POS auto_send mode forces it on even when the preference is off.
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
async function isAutoSendReceiptEnabled(tenantId) {
  const prefs = await Setting.findOne({ where: { tenantId, key: 'customer-notification-preferences' } });
  if (isAutoSendReceiptPreferenceOn(prefs?.value)) return true;
  return isPosAutoSendReceiptEnabled(tenantId);
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
 * Record a receipt_sent activity for dedupe (auto-send path).
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
  RECEIPT_DEDUPE_WINDOW_MINUTES,
  isAutoSendReceiptPreferenceOn,
  isPosAutoSendReceiptEnabled,
  isAutoSendReceiptEnabled,
  hasRecentReceiptForSale,
  recordReceiptSentActivity,
};
