const { DeliveryEvent } = require('../models');

const CRITICAL_ERROR_CODES = new Set([
  'EAUTH',
  'SMTP_AUTH_FAILED',
  'SMS_PROVIDER_SENDER_NOT_APPROVED',
  'SENDER_ID_NOT_APPROVED',
  'PLATFORM_EMAIL_NOT_CONFIGURED',
  'ABS_CREDITS_INSUFFICIENT',
  'PLATFORM_SMS_NOT_CONFIGURED',
  'SMS_NOT_CONFIGURED',
]);

/**
 * Mask a phone number for logs / health UI.
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '(empty)';
  if (digits.length <= 4) return '***';
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

/**
 * Normalize provider errors into stable codes for fingerprinting.
 * @param {string|null|undefined} channel
 * @param {string|null|undefined} rawCode
 * @param {string|null|undefined} rawMessage
 * @returns {string|null}
 */
function normalizeDeliveryErrorCode(channel, rawCode, rawMessage) {
  const code = String(rawCode || '').trim().toUpperCase();
  const message = String(rawMessage || '');
  const lower = message.toLowerCase();

  if (code === 'EAUTH' || code === '535' || /username and password not accepted/i.test(message) || /badcredentials/i.test(lower)) {
    return 'EAUTH';
  }
  if (
    code === 'SMS_PROVIDER_SENDER_NOT_APPROVED'
    || /sender id is not registered/i.test(lower)
    || /sender.?id.*(not|un).*(registered|approved)/i.test(lower)
  ) {
    return 'SMS_PROVIDER_SENDER_NOT_APPROVED';
  }
  if (/platform email not configured/i.test(lower)) return 'PLATFORM_EMAIL_NOT_CONFIGURED';
  if (/sms not configured/i.test(lower)) return 'SMS_NOT_CONFIGURED';
  if (code) return code.slice(0, 80);
  if (!message) return null;
  if (channel === 'email' && /invalid login|authentication failed|535/i.test(lower)) return 'EAUTH';
  return 'DELIVERY_FAILED';
}

/**
 * Whether a failure should open a critical health issue.
 * @param {string|null} errorCode
 * @returns {boolean}
 */
function isCriticalDeliveryError(errorCode) {
  return CRITICAL_ERROR_CODES.has(String(errorCode || '').toUpperCase());
}

/**
 * Truncate free-text safely for storage.
 * @param {string|null|undefined} value
 * @param {number} [max=2000]
 * @returns {string|null}
 */
function truncateText(value, max = 2000) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Persist a delivery outcome and (on failure) upsert a health issue.
 * Never throws to callers — delivery recording must not break sends.
 *
 * @param {object} payload
 * @param {string|null} [payload.tenantId]
 * @param {'email'|'sms'|'whatsapp'|'api'} payload.channel
 * @param {string|null} [payload.provider]
 * @param {string|null} [payload.source]
 * @param {'success'|'failed'} payload.status
 * @param {string|null} [payload.errorCode]
 * @param {string|null} [payload.errorMessage]
 * @param {string|null} [payload.recipient]
 * @param {string|null} [payload.recipientMasked]
 * @param {string|null} [payload.subjectOrContext]
 * @param {object} [payload.metadata]
 * @returns {Promise<object|null>}
 */
async function recordDeliveryEvent(payload = {}) {
  try {
    const channel = String(payload.channel || 'api').toLowerCase();
    const status = payload.status === 'success' ? 'success' : 'failed';
    const errorCode = status === 'failed'
      ? normalizeDeliveryErrorCode(channel, payload.errorCode, payload.errorMessage)
      : null;

    let recipientMasked = payload.recipientMasked || null;
    if (!recipientMasked && payload.recipient) {
      if (channel === 'email') {
        try {
          const emailService = require('./emailService');
          recipientMasked = emailService.maskEmail(payload.recipient);
        } catch {
          recipientMasked = '***';
        }
      } else if (channel === 'sms' || channel === 'whatsapp') {
        recipientMasked = maskPhone(payload.recipient);
      } else {
        recipientMasked = String(payload.recipient).slice(0, 40);
      }
    }

    const event = await DeliveryEvent.create({
      tenantId: payload.tenantId || null,
      channel,
      provider: payload.provider ? String(payload.provider).slice(0, 60) : null,
      source: payload.source ? String(payload.source).slice(0, 80) : null,
      status,
      errorCode,
      errorMessage: truncateText(payload.errorMessage, 5000),
      recipientMasked: recipientMasked ? String(recipientMasked).slice(0, 120) : null,
      subjectOrContext: payload.subjectOrContext
        ? String(payload.subjectOrContext).slice(0, 255)
        : null,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    });

    // Lazy require to avoid circular deps with issue manager → notify → email
    const systemHealthIssueService = require('./systemHealthIssueService');
    if (status === 'failed') {
      await systemHealthIssueService.upsertIssueFromDeliveryFailure({
        tenantId: payload.tenantId || null,
        channel,
        provider: payload.provider || null,
        source: payload.source || null,
        errorCode,
        errorMessage: payload.errorMessage || null,
        subjectOrContext: payload.subjectOrContext || null,
        metadata: payload.metadata || {},
      });
    } else {
      await systemHealthIssueService.resolveIssueOnDeliverySuccess({
        tenantId: payload.tenantId || null,
        channel,
        provider: payload.provider || null,
        errorCode: normalizeDeliveryErrorCode(channel, payload.errorCode, payload.errorMessage),
      });
    }

    return event;
  } catch (err) {
    console.error('[DeliveryEvent] Failed to record event:', err?.message || err);
    return null;
  }
}

module.exports = {
  recordDeliveryEvent,
  normalizeDeliveryErrorCode,
  isCriticalDeliveryError,
  maskPhone,
  truncateText,
  CRITICAL_ERROR_CODES,
};
