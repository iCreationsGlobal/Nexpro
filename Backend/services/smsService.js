const axios = require('axios');
const { formatToE164, isValidPhoneNumber } = require('../utils/phoneUtils');
const { Setting } = require('../models');
const { getSavedPlatformSmsConfig } = require('./platformSmsSettingsService');
const { incrementPlatformSmsUsage } = require('./platformSmsUsageService');
const {
  resolvePlatformSmsBilling,
  debitForSend,
} = require('./absCreditsService');

const ARKESEL_BASE_URL = 'https://sms.arkesel.com';
const MNOTIFY_BASE_URL = process.env.MNOTIFY_BASE_URL || 'https://api.mnotify.com/api';
/** Provider send APIs (e.g. Arkesel) can take 30–40s before responding. */
const SMS_SEND_TIMEOUT_MS = 45000;
/** Shorter timeout for balance/credential verification calls. */
const SMS_CONNECTION_TEST_TIMEOUT_MS = 15000;

/**
 * Whether an HTTP response indicates the provider accepted the send request.
 * @param {import('axios').AxiosResponse} response
 * @returns {boolean}
 */
function isProviderAcceptedResponse(response) {
  const status = response?.status;
  if (!Number.isFinite(status)) return true;
  return status >= 200 && status < 300;
}

/**
 * Extract the raw provider error string from an axios/provider error object.
 * @param {Error|object} error
 * @returns {string}
 */
function extractSmsProviderRawMessage(error) {
  const code = error?.code;
  const message = String(error?.message || '');
  if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return 'SMS provider did not respond in time - the message may still be delivered';
  }
  return error?.response?.data?.message
    || error?.response?.data?.Message
    || error?.response?.data?.errorMessage
    || error?.response?.data?.error
    || message
    || 'Failed to send SMS message';
}

/**
 * Map SMS provider / Arkesel errors to actionable merchant-facing messages.
 * Distinguishes provider wallet/coverage failures from ABS platform monthly quota.
 * @param {Error|object|string} errorOrMessage - Axios error, provider payload, or raw message
 * @param {object} [hints]
 * @param {string|number} [hints.providerCode] - Provider status code when known
 * @param {number} [hints.httpStatus] - HTTP status from provider response
 * @param {string} [hints.providerName] - Display name (Arkesel, Mnotify, …)
 * @returns {{ error: string, errorCode?: string }}
 * @example
 * classifySmsProviderError({ response: { data: { message: 'Insufficient balance or invalid coverage!' } } })
 * // → { error: 'SMS provider (Arkesel) balance empty…', errorCode: 'SMS_PROVIDER_BALANCE_OR_COVERAGE' }
 */
function classifySmsProviderError(errorOrMessage, hints = {}) {
  const providerLabel = hints.providerName || 'Arkesel';
  const isTimeoutObject = errorOrMessage
    && typeof errorOrMessage === 'object'
    && (errorOrMessage.code === 'ECONNABORTED' || /timeout/i.test(String(errorOrMessage.message || '')));
  if (isTimeoutObject) {
    return {
      error: 'SMS provider did not respond in time - the message may still be delivered',
      errorCode: 'SMS_PROVIDER_TIMEOUT',
    };
  }

  const raw = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : extractSmsProviderRawMessage(errorOrMessage);
  const providerCode = String(
    hints.providerCode
      ?? errorOrMessage?.response?.data?.code
      ?? errorOrMessage?.response?.data?.status
      ?? errorOrMessage?.code
      ?? ''
  ).toLowerCase();
  const httpStatus = Number(
    hints.httpStatus
      ?? errorOrMessage?.response?.status
      ?? NaN
  );
  const lower = String(raw || '').toLowerCase();

  const looksLikeBalanceOrCoverage = (
    /insufficient balance/i.test(lower)
    || /invalid coverage/i.test(lower)
    || providerCode === '105'
    || providerCode === '402'
    || providerCode === '1007'
    || providerCode === '1008'
    || httpStatus === 402
  );

  if (looksLikeBalanceOrCoverage) {
    return {
      error:
        `SMS provider (${providerLabel}) balance empty or destination not covered — top up ${providerLabel} (this is not the ABS platform SMS quota)`,
      errorCode: 'SMS_PROVIDER_BALANCE_OR_COVERAGE',
    };
  }

  if (
    providerCode === '104'
    || /phone coverage not active/i.test(lower)
    || /coverage not active/i.test(lower)
  ) {
    return {
      error: `${providerLabel} cannot reach this number — network coverage is not active for the destination`,
      errorCode: 'SMS_PROVIDER_COVERAGE',
    };
  }

  if (
    providerCode === '103'
    || /invalid phone/i.test(lower)
  ) {
    return {
      error: raw || 'Invalid phone number',
      errorCode: 'INVALID_PHONE',
    };
  }

  if (
    /sender id is not registered/i.test(lower)
    || /sender.?id.*(not|un).*(registered|approved)/i.test(lower)
    || /sender.*(not|un).*(registered|approved)/i.test(lower)
    || /unregistered sender/i.test(lower)
  ) {
    return {
      error:
        `Sender ID is not registered or approved with ${providerLabel}. `
        + 'Register/approve this exact Sender ID in your provider dashboard (Ghana networks require approval). '
        + 'API key tests only check credentials — they do not validate Sender ID.',
      errorCode: 'SMS_PROVIDER_SENDER_NOT_APPROVED',
    };
  }

  return { error: raw || 'Failed to send SMS message' };
}

/**
 * Normalize provider errors, including axios timeouts.
 * @param {Error} error
 * @returns {string}
 */
function formatSmsProviderError(error) {
  return classifySmsProviderError(error).error;
}

/**
 * Format E.164 phone for Arkesel recipients array (digits only, no +).
 * @param {string} e164Phone
 * @returns {string}
 */
function toArkeselRecipient(e164Phone) {
  return String(e164Phone || '').replace(/^\+/, '');
}

/**
 * Format E.164 phone for Mnotify recipients (digits only, no +).
 * @param {string} e164Phone
 * @returns {string}
 */
function toMnotifyRecipient(e164Phone) {
  return String(e164Phone || '').replace(/^\+/, '');
}

function providerDisplayName(provider) {
  const key = String(provider || '').toLowerCase();
  if (key === 'mnotify') return 'Mnotify';
  if (key === 'arkesel') return 'Arkesel';
  if (key === 'termii') return 'Termii';
  if (key === 'twilio') return 'Twilio';
  if (key === 'africas_talking') return "Africa's Talking";
  return 'SMS provider';
}

/**
 * Whether tenant SMS config has valid credentials for its provider.
 * @param {Object} config
 * @returns {boolean}
 */
function hasValidTenantSmsCredentials(config) {
  if (!config?.enabled) return false;
  const provider = (config.provider || 'termii').toLowerCase();

  if (provider === 'termii') {
    return Boolean(config.apiKey && String(config.senderId || '').trim());
  }
  if (provider === 'arkesel') {
    return Boolean(config.apiKey && String(config.senderId || '').trim());
  }
  if (provider === 'twilio') {
    return Boolean(config.accountSid && config.authToken && config.fromNumber);
  }
  if (provider === 'africas_talking') {
    return Boolean(config.apiKey && config.username && config.fromNumber);
  }
  return false;
}

class SMSService {
  /**
   * Fire-and-forget delivery event for System Health (never throws).
   * @param {object} payload
   */
  _recordDelivery(payload) {
    try {
      const { recordDeliveryEvent } = require('./deliveryEventService');
      return recordDeliveryEvent(payload);
    } catch (err) {
      console.error('[SMS] delivery event record failed:', err?.message || err);
      return Promise.resolve(null);
    }
  }

  /**
   * Get SMS configuration for a tenant (tenant-only, no platform fallback)
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>} - SMS configuration or null
   */
  async getConfig(tenantId) {
    try {
      const setting = await Setting.findOne({
        where: { tenantId, key: 'sms' },
      });

      if (!setting || !setting.value?.enabled) {
        return null;
      }

      return setting.value;
    } catch (error) {
      console.error('[SMS] Error getting config:', error);
      return null;
    }
  }

  /**
   * Whether platform SMS is configured in admin settings.
   * @returns {Promise<boolean>}
   */
  async isPlatformSmsEnabled() {
    const config = await getSavedPlatformSmsConfig();
    return config !== null;
  }

  /**
   * Synchronous helper for legacy callers; prefer isPlatformSmsEnabled().
   * @returns {boolean}
   */
  isPlatformSmsEnabledSync() {
    return false;
  }

  /**
   * Resolve SMS config:
   * 1. Tenant own SMS (enabled + valid creds) → source tenant, limited false
 * 2. Platform SMS (enabled + active provider creds) → source platform, limited true
 * 3. null
 * @param {string} tenantId
 * @returns {Promise<Object|null>}
 */
  async getResolvedConfig(tenantId) {
    const tenantConfig = await this.getConfig(tenantId);
    if (hasValidTenantSmsCredentials(tenantConfig)) {
      return {
        ...tenantConfig,
        source: 'tenant',
        limited: false,
      };
    }

    const platformConfig = await getSavedPlatformSmsConfig();
    if (platformConfig) {
      let preferredSender = null;
      try {
        const setting = await Setting.findOne({
          where: { tenantId, key: 'sms' },
        });
        preferredSender = setting?.value?.preferredPlatformSenderId || null;
      } catch (_) {
        preferredSender = null;
      }
      const senderId = preferredSender
        ? String(preferredSender).trim().substring(0, 11)
        : platformConfig.senderId;
      return {
        ...platformConfig,
        senderId: senderId || platformConfig.senderId,
      };
    }

    return null;
  }

  /**
   * @param {string} tenantId
   * @returns {Promise<'own'|'platform'|'none'>}
   */
  async getSmsMode(tenantId) {
    const resolved = await this.getResolvedConfig(tenantId);
    if (!resolved) return 'none';
    return resolved.source === 'tenant' ? 'own' : 'platform';
  }

  /**
   * Validate phone number format
   * @param {string} phone - Phone number
   * @returns {string|null} - Formatted E.164 phone number or null
   */
  validatePhoneNumber(phone) {
    if (!phone) return null;
    const formatted = formatToE164(phone);
    return formatted && isValidPhoneNumber(formatted) ? formatted : null;
  }

  /**
   * Legacy rate-limit check — platform monthly limits are enforced in sendMessage.
   * @deprecated
   * @param {string} tenantId
   * @returns {boolean}
   */
  checkRateLimit(tenantId) {
    void tenantId;
    return true;
  }

  /**
   * Send SMS via resolved tenant or platform config.
   * @param {string} tenantId
   * @param {string} phoneNumber
   * @param {string} message
   * @param {string|null} fromNumber
   * @param {object} [options]
   * @param {number} [options.usageCount=1] - Recipients to count against platform quota
   * @returns {Promise<Object>}
   */
  async sendMessage(tenantId, phoneNumber, message, fromNumber = null, options = {}) {
    const source = options.source || options.context?.source || 'sms_send';
    const context = options.context || {};
    try {
      const config = await this.getResolvedConfig(tenantId);
      if (!config) {
        const fail = {
          success: false,
          error: 'SMS not configured for this tenant',
          errorCode: 'SMS_NOT_CONFIGURED',
        };
        void this._recordDelivery({
          tenantId,
          channel: 'sms',
          provider: null,
          source,
          status: 'failed',
          errorCode: fail.errorCode,
          errorMessage: fail.error,
          recipient: phoneNumber,
          subjectOrContext: message ? String(message).slice(0, 80) : null,
          metadata: context,
        });
        return fail;
      }

      const formattedPhone = this.validatePhoneNumber(phoneNumber);
      if (!formattedPhone) {
        const fail = {
          success: false,
          error: 'Invalid phone number format',
          errorCode: 'INVALID_PHONE',
        };
        void this._recordDelivery({
          tenantId,
          channel: 'sms',
          provider: config.provider || null,
          source,
          status: 'failed',
          errorCode: fail.errorCode,
          errorMessage: fail.error,
          recipient: phoneNumber,
          subjectOrContext: message ? String(message).slice(0, 80) : null,
          metadata: context,
        });
        return fail;
      }

      const usageCount = Math.max(1, parseInt(options.usageCount, 10) || 1);
      /** @type {'free'|'credits'|null} */
      let platformBillType = null;
      if (config.limited) {
        const billing = await resolvePlatformSmsBilling(tenantId, usageCount);
        if (!billing.allowed) {
          const fail = {
            success: false,
            error: billing.error,
            errorCode: billing.errorCode,
            usage: billing.freeSummary,
            creditsBalance: billing.creditsBalance,
          };
          void this._recordDelivery({
            tenantId,
            channel: 'sms',
            provider: config.provider || null,
            source,
            status: 'failed',
            errorCode: fail.errorCode,
            errorMessage: fail.error,
            recipient: formattedPhone,
            subjectOrContext: message ? String(message).slice(0, 80) : null,
            metadata: context,
          });
          return fail;
        }
        platformBillType = billing.billType;
      }

      const provider = (config.provider || 'termii').toLowerCase();
      let result;

      switch (provider) {
        case 'termii':
          result = await this.sendViaTermii(config, formattedPhone, message, fromNumber);
          break;
        case 'arkesel':
          result = await this.sendViaArkesel(config, formattedPhone, message, fromNumber);
          break;
        case 'mnotify':
          result = await this.sendViaMnotify(config, formattedPhone, message, fromNumber);
          break;
        case 'twilio':
          result = await this.sendViaTwilio(config, formattedPhone, message, fromNumber);
          break;
        case 'africas_talking':
          result = await this.sendViaAfricasTalking(config, formattedPhone, message, fromNumber);
          break;
        default:
          result = {
            success: false,
            error: `Unsupported SMS provider: ${provider}`,
            errorCode: 'UNSUPPORTED_PROVIDER',
          };
      }

      if (result.success && config.limited) {
        try {
          await incrementPlatformSmsUsage(tenantId, usageCount);
        } catch (usageError) {
          console.error('[SMS] Failed to increment platform usage counter:', usageError?.message);
        }
        if (platformBillType === 'credits') {
          try {
            await debitForSend(tenantId, usageCount, {
              messageId: result.messageId || null,
              source,
              provider,
            });
          } catch (creditError) {
            console.error('[SMS] Failed to debit ABS Credits after send:', creditError?.message);
          }
        }
      }

      void this._recordDelivery({
        tenantId,
        channel: 'sms',
        provider,
        source,
        status: result.success ? 'success' : 'failed',
        errorCode: result.errorCode || null,
        errorMessage: result.error || null,
        recipient: formattedPhone,
        subjectOrContext: message ? String(message).slice(0, 80) : null,
        metadata: {
          ...context,
          messageId: result.messageId || null,
          platformBillType,
        },
      });

      return {
        ...result,
        source: config.source,
        limited: config.limited,
        platformBillType,
      };
    } catch (error) {
      console.error('[SMS] Error sending message:', {
        error: error.response?.data || error.message,
        tenantId,
      });

      const fail = {
        success: false,
        error: error.message || 'Failed to send SMS message',
      };
      void this._recordDelivery({
        tenantId,
        channel: 'sms',
        provider: null,
        source,
        status: 'failed',
        errorCode: error.code || 'SMS_SEND_ERROR',
        errorMessage: fail.error,
        recipient: phoneNumber,
        subjectOrContext: message ? String(message).slice(0, 80) : null,
        metadata: context,
      });
      return fail;
    }
  }

  async sendViaTwilio(config, to, message, from) {
    try {
      const accountSid = config.accountSid;
      const authToken = config.authToken;
      const fromNumber = from || config.fromNumber;

      if (!accountSid || !authToken || !fromNumber) {
        return {
          success: false,
          error: 'Twilio credentials not configured',
        };
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const formData = new URLSearchParams();
      formData.append('To', to);
      formData.append('From', fromNumber);
      formData.append('Body', message);

      const response = await axios.post(url, formData, {
        auth: {
          username: accountSid,
          password: authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: SMS_SEND_TIMEOUT_MS,
      });

      if (!isProviderAcceptedResponse(response)) {
        return {
          success: false,
          error: `Twilio returned unexpected status ${response.status}`,
        };
      }

      console.log('[SMS] Message sent successfully via Twilio:', {
        phoneNumber: to.substring(0, 7) + '***',
        messageId: response.data?.sid,
      });

      return {
        success: true,
        messageId: response.data?.sid,
        data: response.data,
      };
    } catch (error) {
      console.error('[SMS] Twilio error:', error.response?.data || error.message);
      return {
        success: false,
        error: formatSmsProviderError(error),
        errorCode: error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')
          ? 'SMS_PROVIDER_TIMEOUT'
          : undefined,
      };
    }
  }

  async sendViaTermii(config, to, message, from) {
    try {
      const apiKey = config.apiKey;
      const senderId = from || config.senderId || config.fromNumber || '';

      if (!apiKey || !senderId) {
        return {
          success: false,
          error: 'Termii API Key and Sender ID are required',
        };
      }

      const baseUrl = process.env.TERMII_BASE_URL || 'https://api.termii.com';
      const url = `${baseUrl}/api/sms/send`;
      const toTermii = to.replace(/^\+/, '');

      const payload = {
        api_key: apiKey,
        to: toTermii,
        from: senderId.substring(0, 11),
        sms: message,
        type: 'plain',
        channel: 'dnd',
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: SMS_SEND_TIMEOUT_MS,
      });

      if (!isProviderAcceptedResponse(response)) {
        return {
          success: false,
          error: `Termii returned unexpected status ${response.status}`,
        };
      }

      const messageId = response.data?.message_id || response.data?.messageId;
      console.log('[SMS] Message sent successfully via Termii:', {
        phoneNumber: to.substring(0, 7) + '***',
        messageId,
      });

      return {
        success: true,
        messageId: messageId || response.data?.message_id,
        data: response.data,
      };
    } catch (error) {
      console.error('[SMS] Termii error:', error.response?.data || error.message);
      return {
        success: false,
        error: formatSmsProviderError(error),
        errorCode: error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')
          ? 'SMS_PROVIDER_TIMEOUT'
          : undefined,
      };
    }
  }

  async sendViaArkesel(config, to, message, from) {
    try {
      const apiKey = config.apiKey;
      const senderId = (from || config.senderId || '').substring(0, 11);

      if (!apiKey || !senderId) {
        return {
          success: false,
          error: 'Arkesel API key and Sender ID are required',
        };
      }

      const url = `${ARKESEL_BASE_URL}/api/v2/sms/send`;
      const response = await axios.post(
        url,
        {
          sender: senderId,
          message,
          recipients: [toArkeselRecipient(to)],
        },
        {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: SMS_SEND_TIMEOUT_MS,
        }
      );

      if (!isProviderAcceptedResponse(response)) {
        const classified = classifySmsProviderError(
          response.data?.message || `Arkesel returned unexpected status ${response.status}`,
          {
            httpStatus: response.status,
            providerCode: response.data?.code || response.data?.status,
            providerName: 'Arkesel',
          }
        );
        return {
          success: false,
          error: classified.error,
          errorCode: classified.errorCode,
        };
      }

      const bodyStatus = String(response.data?.status || response.data?.code || '').toLowerCase();
      const bodyLooksFailed = bodyStatus
        && bodyStatus !== 'success'
        && bodyStatus !== 'ok'
        && bodyStatus !== '200';
      if (bodyLooksFailed) {
        const classified = classifySmsProviderError(
          response.data?.message || response.data?.error || `Arkesel status: ${bodyStatus}`,
          {
            providerCode: response.data?.code || response.data?.status,
            httpStatus: response.status,
            providerName: 'Arkesel',
          }
        );
        return {
          success: false,
          error: classified.error,
          errorCode: classified.errorCode,
          data: response.data,
        };
      }

      const messageId = response.data?.data?.[0]?.id
        || response.data?.data?.[0]?.message_id
        || response.data?.message_id;

      console.log('[SMS] Message sent successfully via Arkesel:', {
        phoneNumber: to.substring(0, 7) + '***',
        messageId,
      });

      return {
        success: true,
        messageId,
        data: response.data,
      };
    } catch (error) {
      console.error('[SMS] Arkesel error:', error.response?.data || error.message);
      const classified = classifySmsProviderError(error, { providerName: 'Arkesel' });
      return {
        success: false,
        error: classified.error,
        errorCode: classified.errorCode,
      };
    }
  }

  /**
   * Send SMS via Mnotify quick SMS API.
   * @param {object} config
   * @param {string} to - E.164 phone
   * @param {string} message
   * @param {string|null} from
   * @returns {Promise<object>}
   */
  async sendViaMnotify(config, to, message, from) {
    try {
      const apiKey = config.apiKey;
      const senderId = (from || config.senderId || '').substring(0, 11);

      if (!apiKey || !senderId) {
        return {
          success: false,
          error: 'Mnotify API key and Sender ID are required',
        };
      }

      const url = `${MNOTIFY_BASE_URL.replace(/\/$/, '')}/sms/quick`;
      const response = await axios.post(
        url,
        {
          recipient: [toMnotifyRecipient(to)],
          sender: senderId,
          message,
          is_schedule: false,
          schedule_date: '',
        },
        {
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          params: { key: apiKey },
          timeout: SMS_SEND_TIMEOUT_MS,
        }
      );

      if (!isProviderAcceptedResponse(response)) {
        const classified = classifySmsProviderError(
          response.data?.message || `Mnotify returned unexpected status ${response.status}`,
          {
            httpStatus: response.status,
            providerCode: response.data?.code || response.data?.status,
            providerName: 'Mnotify',
          }
        );
        return {
          success: false,
          error: classified.error,
          errorCode: classified.errorCode,
        };
      }

      const bodyStatus = String(response.data?.status || response.data?.code || '').toLowerCase();
      const bodyLooksFailed = bodyStatus
        && bodyStatus !== 'success'
        && bodyStatus !== 'ok'
        && bodyStatus !== '200';
      if (bodyLooksFailed) {
        const classified = classifySmsProviderError(
          response.data?.message || response.data?.error || `Mnotify status: ${bodyStatus}`,
          {
            providerCode: response.data?.code || response.data?.status,
            httpStatus: response.status,
            providerName: 'Mnotify',
          }
        );
        return {
          success: false,
          error: classified.error,
          errorCode: classified.errorCode,
          data: response.data,
        };
      }

      const messageId = response.data?.summary?._id
        || response.data?.summary?.id
        || response.data?.message_id
        || response.data?._id;

      console.log('[SMS] Message sent successfully via Mnotify:', {
        phoneNumber: to.substring(0, 7) + '***',
        messageId,
      });

      return {
        success: true,
        messageId,
        data: response.data,
      };
    } catch (error) {
      console.error('[SMS] Mnotify error:', error.response?.data || error.message);
      const classified = classifySmsProviderError(error, { providerName: 'Mnotify' });
      return {
        success: false,
        error: classified.error,
        errorCode: classified.errorCode,
      };
    }
  }

  async sendViaAfricasTalking(config, to, message, from) {
    try {
      const apiKey = config.apiKey;
      const username = config.username;
      const fromNumber = from || config.fromNumber;

      if (!apiKey || !username || !fromNumber) {
        return {
          success: false,
          error: 'Africa\'s Talking credentials not configured',
        };
      }

      const url = 'https://api.africastalking.com/version1/messaging';

      const response = await axios.post(
        url,
        {
          username,
          to,
          message,
          from: fromNumber,
        },
        {
          headers: {
            ApiKey: apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: SMS_SEND_TIMEOUT_MS,
        }
      );

      if (!isProviderAcceptedResponse(response)) {
        return {
          success: false,
          error: `Africa's Talking returned unexpected status ${response.status}`,
        };
      }

      console.log('[SMS] Message sent successfully via Africa\'s Talking:', {
        phoneNumber: to.substring(0, 7) + '***',
        messageId: response.data?.SMSMessageData?.Recipients?.[0]?.messageId,
      });

      return {
        success: true,
        messageId: response.data?.SMSMessageData?.Recipients?.[0]?.messageId,
        data: response.data,
      };
    } catch (error) {
      console.error('[SMS] Africa\'s Talking error:', error.response?.data || error.message);
      return {
        success: false,
        error: formatSmsProviderError(error),
        errorCode: error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')
          ? 'SMS_PROVIDER_TIMEOUT'
          : undefined,
      };
    }
  }

  /**
   * Test SMS connection
   * @param {Object} config
   * @param {object} [meta]
   * @returns {Promise<Object>}
   */
  async testConnection(config, meta = {}) {
    void meta;
    try {
      const provider = (config.provider || 'termii').toLowerCase();

      switch (provider) {
        case 'termii': {
          if (!config.apiKey) {
            return { success: false, error: 'Termii API Key is required' };
          }
          const termiiBaseUrl = process.env.TERMII_BASE_URL || 'https://api.termii.com';
          const balanceUrl = `${termiiBaseUrl}/api/get-balance`;
          const termiiResponse = await axios.get(balanceUrl, {
            params: { api_key: config.apiKey },
            timeout: SMS_CONNECTION_TEST_TIMEOUT_MS,
          });
          return {
            success: true,
            message: 'Termii API key verified (balance OK). Sender ID is not checked until you send an SMS.',
            data: {
              balance: termiiResponse.data?.balance,
              currency: termiiResponse.data?.currency || 'NGN',
              user: termiiResponse.data?.user,
            },
          };
        }

        case 'arkesel': {
          if (!config.apiKey) {
            return { success: false, error: 'Arkesel API key is required' };
          }
          const balanceUrl = `${ARKESEL_BASE_URL}/api/v2/clients/balance-details`;
          const arkeselResponse = await axios.get(balanceUrl, {
            headers: { 'api-key': config.apiKey },
            timeout: SMS_CONNECTION_TEST_TIMEOUT_MS,
          });
          return {
            success: true,
            message: 'Arkesel API key verified (balance OK). Sender ID is not checked until you send an SMS.',
            data: arkeselResponse.data,
          };
        }

        case 'mnotify': {
          if (!config.apiKey) {
            return { success: false, error: 'Mnotify API key is required' };
          }
          const balanceUrl = `${MNOTIFY_BASE_URL.replace(/\/$/, '')}/balance/sms`;
          const mnotifyResponse = await axios.get(balanceUrl, {
            headers: {
              Authorization: config.apiKey,
              Accept: 'application/json',
            },
            params: { key: config.apiKey },
            timeout: SMS_CONNECTION_TEST_TIMEOUT_MS,
          });
          return {
            success: true,
            message: 'Mnotify API key verified (balance OK). Sender ID is not checked until you send an SMS.',
            data: {
              balance: mnotifyResponse.data?.balance,
              bonus: mnotifyResponse.data?.bonus,
              status: mnotifyResponse.data?.status,
              sms_balance: mnotifyResponse.data?.balance,
              ...mnotifyResponse.data,
            },
          };
        }

        case 'twilio': {
          if (!config.accountSid || !config.authToken) {
            return { success: false, error: 'Twilio Account SID and Auth Token are required' };
          }
          const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`;
          const response = await axios.get(url, {
            auth: {
              username: config.accountSid,
              password: config.authToken,
            },
            timeout: SMS_CONNECTION_TEST_TIMEOUT_MS,
          });
          return {
            success: true,
            message: 'Twilio connection verified',
            data: {
              accountName: response.data?.friendly_name,
              status: response.data?.status,
            },
          };
        }

        case 'africas_talking': {
          if (!config.apiKey || !config.username) {
            return { success: false, error: 'Africa\'s Talking API Key and Username are required' };
          }
          const atUrl = 'https://api.africastalking.com/version1/user';
          const atResponse = await axios.get(atUrl, {
            headers: {
              ApiKey: config.apiKey,
              Accept: 'application/json',
            },
            params: { username: config.username },
            timeout: SMS_CONNECTION_TEST_TIMEOUT_MS,
          });
          return {
            success: true,
            message: 'Africa\'s Talking connection verified',
            data: atResponse.data,
          };
        }

        default:
          return {
            success: false,
            error: `Unsupported SMS provider: ${provider}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: formatSmsProviderError(error),
      };
    }
  }
}

module.exports = new SMSService();
module.exports.hasValidTenantSmsCredentials = hasValidTenantSmsCredentials;
module.exports.toArkeselRecipient = toArkeselRecipient;
module.exports.toMnotifyRecipient = toMnotifyRecipient;
module.exports.providerDisplayName = providerDisplayName;
module.exports.formatSmsProviderError = formatSmsProviderError;
module.exports.classifySmsProviderError = classifySmsProviderError;
module.exports.isProviderAcceptedResponse = isProviderAcceptedResponse;
module.exports.SMS_SEND_TIMEOUT_MS = SMS_SEND_TIMEOUT_MS;
module.exports.SMS_CONNECTION_TEST_TIMEOUT_MS = SMS_CONNECTION_TEST_TIMEOUT_MS;
