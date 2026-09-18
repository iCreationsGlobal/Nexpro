const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const { Setting } = require('../models');

class EmailService {
  constructor() {
    this.rateLimitCache = new Map();
    this.maxEmailsPerDay = 1000;
  }

  /**
   * Fire-and-forget delivery event for System Health (never throws).
   * @param {object} payload
   */
  _recordDelivery(payload) {
    try {
      const { recordDeliveryEvent } = require('./deliveryEventService');
      return recordDeliveryEvent(payload);
    } catch (err) {
      console.error('[Email] delivery event record failed:', err?.message || err);
      return Promise.resolve(null);
    }
  }

  maskEmail(email) {
    if (!email) return '(empty)';
    const value = String(email).trim();
    const [local, domain] = value.split('@');
    if (!local || !domain) return value ? '***' : '(empty)';
    const maskedLocal = local.length <= 2 ? `${local[0] || ''}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
    const [domainName, ...domainRest] = domain.split('.');
    const maskedDomain =
      domainName && domainRest.length
        ? `${domainName[0] || ''}***.${domainRest.join('.')}`
        : '***';
    return `${maskedLocal}@${maskedDomain}`;
  }

  maskEmailsInText(text) {
    if (!text) return '';
    return String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => this.maskEmail(match));
  }

  summarizeProviderError(error) {
    if (!error) {
      return {
        code: 'n/a',
        responseCode: 'n/a',
        command: 'n/a',
        message: 'unknown_error',
        response: ''
      };
    }
    const responseBody =
      error.response?.body?.errors || error.response?.body?.message || error.response?.body || error.response;
    const response = responseBody ? JSON.stringify(responseBody).slice(0, 500) : '';
    return {
      code: error.code || 'n/a',
      responseCode: error.responseCode || error.statusCode || error.code || 'n/a',
      command: error.command || 'n/a',
      message: this.maskEmailsInText(error.message || 'Failed to send email message'),
      response: this.maskEmailsInText(response)
    };
  }

  formatContext(context = {}) {
    const parts = [];
    ['requestId', 'tenantId', 'userId', 'inviteId', 'inviteRequestId', 'source', 'mode'].forEach((key) => {
      if (context[key] !== undefined && context[key] !== null && context[key] !== '') {
        parts.push(`${key}=${context[key]}`);
      }
    });
    return parts.length ? ` ${parts.join(' ')}` : '';
  }

  getConfigDiagnostic(config = {}) {
    const provider = (config.provider || 'smtp').toString();
    const fromEmail = config.fromEmail || '';
    const smtpUser = config.smtpUser || '';
    const effectiveFrom = fromEmail || smtpUser || config.sesAccessKeyId || '';
    return {
      provider,
      host: config.smtpHost || config.sesHost || (provider === 'sendgrid' ? 'smtp.sendgrid.net' : provider === 'resend' ? 'smtp.resend.com' : 'n/a'),
      port: config.smtpPort || (provider === 'smtp' || provider === 'mailjet' ? 587 : 'n/a'),
      smtpUserSet: !!String(smtpUser || '').trim(),
      smtpPasswordSet: !!String(config.smtpPassword || '').trim(),
      sendgridSet: !!String(config.sendgridApiKey || '').trim(),
      sesAccessKeySet: !!String(config.sesAccessKeyId || '').trim(),
      sesSecretSet: !!String(config.sesSecretAccessKey || '').trim(),
      fromEmailMasked: this.maskEmail(fromEmail),
      smtpUserMasked: this.maskEmail(smtpUser),
      effectiveFromMasked: this.maskEmail(effectiveFrom),
      fromMatchesSmtpUser: !!fromEmail && !!smtpUser ? String(fromEmail).trim().toLowerCase() === String(smtpUser).trim().toLowerCase() : 'n/a'
    };
  }

  /**
   * Get platform email configuration from environment (for system emails: password reset, welcome, etc.).
   * Platform pays for these; businesses do not configure this.
   * @param {string} [providerOverride] - Optional persisted provider selection from platform settings.
   * @returns {Object|null} - Config object or null if not configured
   */
  getPlatformConfig(providerOverride = null) {
    const provider = (providerOverride || process.env.PLATFORM_EMAIL_PROVIDER || 'smtp').toString().toLowerCase();
    if (provider === 'gmail') {
      const user = process.env.PLATFORM_GMAIL_USER || process.env.GMAIL_USER || process.env.PLATFORM_SMTP_USER || process.env.PLATFORM_EMAIL_SMTP_USER;
      const pass = process.env.PLATFORM_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.PLATFORM_GMAIL_PASSWORD || process.env.GMAIL_PASSWORD || process.env.PLATFORM_SMTP_PASSWORD || process.env.PLATFORM_EMAIL_SMTP_PASSWORD;
      if (!user || !pass) return null;
      return {
        provider: 'smtp',
        smtpHost: process.env.PLATFORM_GMAIL_SMTP_HOST || 'smtp.gmail.com',
        smtpPort: parseInt(process.env.PLATFORM_GMAIL_SMTP_PORT || process.env.PLATFORM_SMTP_PORT || process.env.PLATFORM_EMAIL_SMTP_PORT || '587', 10),
        smtpUser: user,
        smtpPassword: pass,
        smtpRejectUnauthorized: process.env.PLATFORM_SMTP_REJECT_UNAUTHORIZED !== 'false',
        fromEmail: process.env.PLATFORM_EMAIL_FROM || user,
        fromName: process.env.PLATFORM_EMAIL_FROM_NAME || process.env.APP_NAME || 'African Business Suite'
      };
    }
    if (provider === 'smtp') {
      const host = process.env.PLATFORM_SMTP_HOST || process.env.PLATFORM_EMAIL_SMTP_HOST;
      const user = process.env.PLATFORM_SMTP_USER || process.env.PLATFORM_EMAIL_SMTP_USER;
      const pass = process.env.PLATFORM_SMTP_PASSWORD || process.env.PLATFORM_EMAIL_SMTP_PASSWORD;
      if (!host || !user || !pass) return null;
      return {
        provider: 'smtp',
        smtpHost: host,
        smtpPort: parseInt(process.env.PLATFORM_SMTP_PORT || process.env.PLATFORM_EMAIL_SMTP_PORT || '587', 10),
        smtpUser: user,
        smtpPassword: pass,
        smtpRejectUnauthorized: process.env.PLATFORM_SMTP_REJECT_UNAUTHORIZED !== 'false',
        fromEmail: process.env.PLATFORM_EMAIL_FROM || user,
        fromName: process.env.PLATFORM_EMAIL_FROM_NAME || process.env.APP_NAME || 'African Business Suite'
      };
    }
    if (provider === 'sendgrid') {
      const key = process.env.PLATFORM_SENDGRID_API_KEY;
      if (!key) return null;
      return {
        provider: 'sendgrid',
        sendgridApiKey: key,
        fromEmail: process.env.PLATFORM_EMAIL_FROM,
        fromName: process.env.PLATFORM_EMAIL_FROM_NAME || process.env.APP_NAME || 'African Business Suite'
      };
    }
    if (provider === 'ses') {
      const id = process.env.PLATFORM_SES_ACCESS_KEY_ID;
      const secret = process.env.PLATFORM_SES_SECRET_ACCESS_KEY;
      if (!id || !secret) return null;
      return {
        provider: 'ses',
        sesAccessKeyId: id,
        sesSecretAccessKey: secret,
        sesRegion: process.env.PLATFORM_SES_REGION || 'us-east-1',
        sesHost: process.env.PLATFORM_SES_HOST,
        fromEmail: process.env.PLATFORM_EMAIL_FROM,
        fromName: process.env.PLATFORM_EMAIL_FROM_NAME || process.env.APP_NAME || 'African Business Suite'
      };
    }
    if (provider === 'mailjet') {
      const apiKey = process.env.PLATFORM_MAILJET_API_KEY;
      const secretKey = process.env.PLATFORM_MAILJET_SECRET_KEY;
      if (!apiKey || !secretKey) return null;
      return {
        provider: 'mailjet',
        smtpHost: process.env.PLATFORM_MAILJET_SMTP_HOST || 'in.mailjet.com',
        smtpPort: parseInt(process.env.PLATFORM_MAILJET_SMTP_PORT || '587', 10),
        smtpUser: apiKey,
        smtpPassword: secretKey,
        fromEmail: process.env.PLATFORM_EMAIL_FROM,
        fromName: process.env.PLATFORM_EMAIL_FROM_NAME || process.env.APP_NAME || 'African Business Suite'
      };
    }
    return null;
  }

  /**
   * Resolve platform email config using persisted admin settings first, then ENV for bootstrapping.
   * @returns {Promise<Object|null>} - Config object or null if not configured
   */
  async resolvePlatformConfig() {
    try {
      const { getSavedPlatformEmailConfig } = require('./platformEmailSettingsService');
      const savedConfig = await getSavedPlatformEmailConfig();
      return savedConfig || this.getPlatformConfig();
    } catch (error) {
      console.error('[Email] Error resolving platform email config:', this.maskEmailsInText(error.message));
      return this.getPlatformConfig();
    }
  }

  /**
   * Send system email using platform config (password reset, welcome, etc.). Platform pays; no tenant config used.
   * @param {string} to - Recipient email
   * @param {string} subject - Subject
   * @param {string} html - HTML body
   * @param {string} [text] - Plain text body (optional)
   * @param {Array} [attachments] - Attachments (optional)
   * @param {Object} [options] - Optional: { categories, replyTo: { email, name? } } for SendGrid (e.g. ['transactional','signup']) to improve deliverability
   * @returns {Promise<Object>} - { success, messageId?, error? }
   */
  async sendPlatformMessage(to, subject, html, text = null, attachments = [], options = {}) {
    const logPrefix = '[Email]';
    const context = options.context || {};
    const contextText = this.formatContext({ ...context, source: context.source || 'platform_env' });
    const toMask = this.maskEmail(to);
    const subjectShort = subject ? subject.substring(0, 50) : '';

    try {
      const config = await this.resolvePlatformConfig();
      if (!config) {
        console.warn(`${logPrefix}[platform_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=platform_not_configured`);
        const fail = { success: false, error: 'Platform email not configured' };
        void this._recordDelivery({
          tenantId: context.tenantId || null,
          channel: 'email',
          provider: 'platform',
          source: context.source || 'platform_env',
          status: 'failed',
          errorCode: 'PLATFORM_EMAIL_NOT_CONFIGURED',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        console.warn(`${logPrefix}[platform_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=invalid_recipient`);
        const fail = { success: false, error: 'Invalid email address format' };
        void this._recordDelivery({
          tenantId: context.tenantId || null,
          channel: 'email',
          provider: config.provider || 'platform',
          source: context.source || 'platform_env',
          status: 'failed',
          errorCode: 'INVALID_EMAIL',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }
      const fromEmail = config.fromEmail || config.smtpUser;
      if (!fromEmail) {
        console.warn(`${logPrefix}[platform_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=sender_not_configured`);
        const fail = { success: false, error: 'Platform sender email not configured' };
        void this._recordDelivery({
          tenantId: context.tenantId || null,
          channel: 'email',
          provider: config.provider || 'platform',
          source: context.source || 'platform_env',
          status: 'failed',
          errorCode: 'PLATFORM_EMAIL_NOT_CONFIGURED',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }

      const diag = this.getConfigDiagnostic(config);
      const replyTo = options.replyTo?.email ? options.replyTo : null;
      const replyToMask = replyTo ? this.maskEmail(replyTo.email) : 'none';
      console.log(
        `${logPrefix}[platform_send_start]${contextText} to=${toMask} subject="${subjectShort}" ` +
          `provider=${diag.provider} from=${diag.effectiveFromMasked} fromMatchesSmtpUser=${diag.fromMatchesSmtpUser} replyTo=${replyToMask}`
      );

      // SendGrid: use HTTP API (port 443) instead of SMTP to avoid firewall/port 587 issues
      if (config.provider === 'sendgrid' && config.sendgridApiKey) {
        sgMail.setApiKey(config.sendgridApiKey);
        const msg = {
          to,
          from: { email: fromEmail, name: config.fromName || undefined },
          subject,
          html,
          text: text || html.replace(/<[^>]*>/g, ''),
          ...(replyTo ? { replyTo: { email: replyTo.email, name: replyTo.name || undefined } } : {}),
          ...(attachments.length ? { attachments: attachments.map(a => ({ content: (a.content || a.buffer || '').toString('base64'), filename: a.filename || 'file', type: a.contentType || 'application/octet-stream' })) } : {}),
          ...(options.categories && options.categories.length ? { categories: options.categories } : {})
        };
        const [res] = await sgMail.send(msg);
        const messageId = res?.headers?.['x-message-id'];
        console.log(
          `${logPrefix}[platform_send_success]${contextText} to=${toMask} subject="${subjectShort}" ` +
            `provider=sendgrid responseCode=${res?.statusCode || 'n/a'} messageId=${messageId || 'n/a'}`
        );
        void this._recordDelivery({
          tenantId: context.tenantId || null,
          channel: 'email',
          provider: 'sendgrid',
          source: context.source || 'platform_env',
          status: 'success',
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: { ...context, messageId: messageId || null },
        });
        return { success: true, messageId: messageId || res?.messageId, data: res };
      }

      const transporter = await this.createTransporter(config);
      const mailOptions = {
        from: config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
        attachments,
        ...(replyTo
          ? {
            replyTo: replyTo.name ? `${replyTo.name} <${replyTo.email}>` : replyTo.email,
          }
          : {}),
      };
      const info = await transporter.sendMail(mailOptions);
      console.log(
        `${logPrefix}[platform_send_success]${contextText} to=${toMask} subject="${subjectShort}" ` +
          `provider=${config.provider || 'smtp'} responseCode=${info.responseCode || 'n/a'} response="${this.maskEmailsInText(info.response || '').slice(0, 200)}" messageId=${info.messageId || 'n/a'}`
      );
      void this._recordDelivery({
        tenantId: context.tenantId || null,
        channel: 'email',
        provider: config.provider || 'smtp',
        source: context.source || 'platform_env',
        status: 'success',
        recipient: to,
        recipientMasked: toMask,
        subjectOrContext: subjectShort,
        metadata: { ...context, messageId: info.messageId || null },
      });
      return { success: true, messageId: info.messageId, data: info };
    } catch (error) {
      const err = this.summarizeProviderError(error);
      console.error(
        `${logPrefix}[platform_send_failure]${contextText} to=${toMask} subject="${subjectShort}" ` +
          `code=${err.code} responseCode=${err.responseCode} command=${err.command} message="${err.message}" response="${err.response}"`
      );
      void this._recordDelivery({
        tenantId: context.tenantId || null,
        channel: 'email',
        provider: 'platform',
        source: context.source || 'platform_env',
        status: 'failed',
        errorCode: err.code,
        errorMessage: error.message || 'Failed to send email',
        recipient: to,
        recipientMasked: toMask,
        subjectOrContext: subjectShort,
        metadata: context,
      });
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  /**
   * One-line audit for server logs: tenant email integration state (no secrets).
   * Use when loading/saving Settings → Email or resolving marketing capabilities.
   * @param {string} tenantId
   * @param {Object} [value] - Raw or merged `settings.email` value
   * @returns {string}
   */
  formatTenantEmailAudit(tenantId, value) {
    const v = value && typeof value === 'object' ? value : {};
    const enabled = v.enabled === true;
    const provider = (v.provider || 'smtp').toString().toLowerCase();
    const hasHost = !!(v.smtpHost && String(v.smtpHost).trim());
    const hasSg = !!(v.sendgridApiKey && String(v.sendgridApiKey).trim());
    const hasSes = !!(v.sesAccessKeyId && String(v.sesAccessKeyId).trim());
    const hasSesSecret = !!(v.sesSecretAccessKey && String(v.sesSecretAccessKey).trim());
    const hasResend = !!(v.resendApiKey && String(v.resendApiKey).trim());
    const smtpUserSet = !!(v.smtpUser && String(v.smtpUser).trim());
    const smtpPasswordSet = !!(v.smtpPassword && String(v.smtpPassword).trim());
    const fromEmail = (v.fromEmail && String(v.fromEmail).trim()) || '';
    const outboundReady = enabled && (
      (provider === 'smtp' && hasHost && smtpUserSet && smtpPasswordSet) ||
      (provider === 'sendgrid' && hasSg && !!fromEmail) ||
      (provider === 'ses' && hasSes && hasSesSecret && !!fromEmail) ||
      (provider === 'mailjet' && smtpUserSet && smtpPasswordSet && !!fromEmail) ||
      (provider === 'resend' && hasResend && !!fromEmail)
    );
    const fromNameSet = !!(v.fromName && String(v.fromName).trim());
    const fromMatchesSmtpUser = fromEmail && v.smtpUser
      ? fromEmail.toLowerCase() === String(v.smtpUser).trim().toLowerCase()
      : 'n/a';
    return (
      `tenantId=${tenantId} enabled=${enabled} provider=${provider} ` +
      `outboundReady=${outboundReady} smtpHostSet=${hasHost} smtpUserSet=${smtpUserSet} ` +
      `smtpPasswordSet=${smtpPasswordSet} sendgridSet=${hasSg} sesSet=${hasSes} resendSet=${hasResend} ` +
      `fromEmail=${this.maskEmail(fromEmail)} fromNameSet=${fromNameSet} fromMatchesSmtpUser=${fromMatchesSmtpUser}`
    );
  }

  validateTenantEmailConfig(value = {}) {
    const config = value && typeof value === 'object' ? value : {};
    const provider = (config.provider || 'smtp').toString().toLowerCase();
    const missingFields = [];
    const requireField = (field) => {
      if (!String(config[field] || '').trim()) missingFields.push(field);
    };

    if (config.enabled !== true) {
      return {
        ok: false,
        provider,
        reason: 'email_disabled',
        missingFields,
        error: 'Workspace email is disabled. Turn on Settings > Email before sending tenant emails.',
      };
    }

    switch (provider) {
      case 'smtp':
        requireField('smtpHost');
        requireField('smtpUser');
        requireField('smtpPassword');
        break;
      case 'sendgrid':
        requireField('sendgridApiKey');
        requireField('fromEmail');
        break;
      case 'ses':
        requireField('sesAccessKeyId');
        requireField('sesSecretAccessKey');
        requireField('fromEmail');
        break;
      case 'mailjet':
        requireField('smtpUser');
        requireField('smtpPassword');
        requireField('fromEmail');
        break;
      case 'resend':
        requireField('resendApiKey');
        requireField('fromEmail');
        break;
      default:
        return {
          ok: false,
          provider,
          reason: 'unsupported_provider',
          missingFields,
          error: `Unsupported tenant email provider: ${provider}`,
        };
    }

    if (missingFields.length) {
      return {
        ok: false,
        provider,
        reason: 'missing_fields',
        missingFields,
        error: `Workspace email settings are incomplete for ${provider}. Update Settings > Email and provide: ${missingFields.join(', ')}.`,
      };
    }

    return {
      ok: true,
      provider,
      reason: 'ready',
      missingFields,
      error: null,
    };
  }

  /**
   * Whether tenant email settings are enabled with valid provider credentials.
   * @param {Object} [config]
   * @returns {boolean}
   */
  hasValidTenantEmailCredentials(config) {
    if (!config || config.enabled !== true) return false;
    return this.validateTenantEmailConfig(config).ok;
  }

  /**
   * Whether platform email is configured in admin settings or ENV.
   * @returns {Promise<boolean>}
   */
  async isPlatformEmailEnabled() {
    const config = await this.resolvePlatformConfig();
    return config !== null;
  }

  /**
   * @param {string} tenantId
   * @returns {Promise<'own'|'platform'|'none'>}
   */
  async getEmailMode(tenantId) {
    const setting = await Setting.findOne({
      where: { tenantId, key: 'email' },
    });
    if (setting?.value && this.hasValidTenantEmailCredentials(setting.value)) {
      return 'own';
    }

    const platformConfig = await this.resolvePlatformConfig();
    if (platformConfig) {
      return 'platform';
    }

    return 'none';
  }

  async resolveTenantEmailConfig(tenantId) {
    const setting = await Setting.findOne({
      where: { tenantId, key: 'email' }
    });

    if (!setting) {
      const error = 'Workspace email is not configured. Enable Settings > Email and save email provider credentials before sending tenant emails.';
      console.warn(
        `[Email][tenant_config_unavailable] tenantId=${tenantId} source=tenant_config configured=false enabled=false ` +
          `outboundReady=false reason=email_not_configured`
      );
      return {
        ok: false,
        config: null,
        configured: false,
        enabled: false,
        provider: 'unknown',
        reason: 'email_not_configured',
        error,
      };
    }

    const config = setting.value || {};
    const validation = this.validateTenantEmailConfig(config);
    const audit = this.formatTenantEmailAudit(tenantId, config);

    if (!validation.ok) {
      console.warn(
        `[Email][tenant_config_unavailable] source=tenant_config ${audit} ` +
          `reason=${validation.reason} missingFields=${validation.missingFields.join(',') || 'none'}`
      );
      return {
        ok: false,
        config,
        configured: true,
        enabled: config.enabled === true,
        ...validation,
      };
    }

    console.log(`[Email][tenant_config_resolved] source=tenant_config ${audit} reason=ready`);
    return {
      ok: true,
      config,
      configured: true,
      enabled: true,
      ...validation,
    };
  }

  /**
   * Get Email configuration for a tenant (for business-to-customer emails: invoices, receipts). Business configures and pays.
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>} - Email configuration or null
   */
  async getConfig(tenantId) {
    try {
      const resolved = await this.resolveTenantEmailConfig(tenantId);
      return resolved.ok ? resolved.config : null;
    } catch (error) {
      console.error('[Email] Error getting config:', error);
      return null;
    }
  }

  /**
   * Check rate limit
   * @param {string} tenantId - Tenant ID
   * @returns {boolean} - True if within rate limit
   */
  checkRateLimit(tenantId) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${tenantId}_${today}`;
    const count = this.rateLimitCache.get(key) || 0;
    
    if (count >= this.maxEmailsPerDay) {
      return false;
    }
    
    this.rateLimitCache.set(key, count + 1);
    return true;
  }

  /**
   * Create email transporter based on provider
   * @param {Object} config - Email configuration
   * @returns {Promise<Object>} - Nodemailer transporter
   */
  async createTransporter(config) {
    const provider = config.provider || 'smtp';
    // Slightly longer timeouts for real sends; pooled transport reuses one TCP session (fewer Gmail “socket close” drops)
    const socketTimeout = 30000;
    const greetingTimeout = 15000;
    const poolOpts = { pool: true, maxConnections: 1, maxMessages: 1000 };

    switch (provider) {
      case 'smtp':
      case 'gmail':
        return nodemailer.createTransport({
          ...poolOpts,
          host: config.smtpHost,
          port: config.smtpPort || 587,
          secure: config.smtpPort === 465,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword
          },
          tls: {
            rejectUnauthorized: config.smtpRejectUnauthorized !== false
          },
          connectionTimeout: socketTimeout,
          greetingTimeout
        });

      case 'sendgrid':
        return nodemailer.createTransport({
          ...poolOpts,
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: config.sendgridApiKey
          },
          connectionTimeout: socketTimeout,
          greetingTimeout
        });

      case 'ses':
        return nodemailer.createTransport({
          ...poolOpts,
          host: config.sesHost || `email-smtp.${config.sesRegion || 'us-east-1'}.amazonaws.com`,
          port: 587,
          secure: false,
          auth: {
            user: config.sesAccessKeyId,
            pass: config.sesSecretAccessKey
          },
          connectionTimeout: socketTimeout,
          greetingTimeout
        });

      case 'mailjet':
        // Mailjet SMTP: in.mailjet.com, port 587 STARTTLS; username = API Key, password = Secret Key
        return nodemailer.createTransport({
          ...poolOpts,
          host: config.smtpHost || 'in.mailjet.com',
          port: config.smtpPort || 587,
          secure: config.smtpPort === 465,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword
          },
          connectionTimeout: socketTimeout,
          greetingTimeout
        });

      case 'resend':
        // Resend SMTP relay: smtp.resend.com, port 465 SSL; username is literally "resend", password = API key
        return nodemailer.createTransport({
          ...poolOpts,
          host: 'smtp.resend.com',
          port: 465,
          secure: true,
          auth: {
            user: 'resend',
            pass: config.resendApiKey
          },
          connectionTimeout: socketTimeout,
          greetingTimeout
        });

      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  /**
   * Map SMTP / nodemailer errors to a short user-facing string.
   * @param {Error} error
   * @returns {string}
   */
  formatTenantSmtpError(error) {
    const code = error.code || '';
    const rawMessage = error.message || 'Failed to send email message';
    const isConnectionError =
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      (rawMessage && /Greeting never received|socket close|Connection closed/i.test(rawMessage));
    if (isConnectionError) {
      return (
        'Could not complete send to the mail server (connection closed or blocked). ' +
        'Broadcasts reuse one mail connection; if this persists from your machine, try SMTP port 465 (SSL) in Settings → Email, or deploy where outbound SMTP is allowed.'
      );
    }
    return rawMessage;
  }

  /**
   * Send several tenant emails over one pooled SMTP connection (marketing broadcasts).
   * Avoids opening a new TCP+TLS session per recipient, which often triggers “Unexpected socket close” on Gmail.
   *
   * @param {string} tenantId
   * @param {Array<{ to: string, subject: string, html: string, text?: string, attachments?: Array }>} mailJobs
   * @returns {Promise<Array<{ success: boolean, messageId?: string, error?: string }>>}
   */
  async sendBulkTenantEmails(tenantId, mailJobs) {
    const logPrefix = '[Email]';
    if (!Array.isArray(mailJobs) || mailJobs.length === 0) {
      return [];
    }

    const config = await this.getConfig(tenantId);
    if (!config) {
      return mailJobs.map(() => ({ success: false, error: 'Email not configured for this tenant' }));
    }

    const fromEmail = config.fromEmail || config.smtpUser;
    if (!fromEmail) {
      return mailJobs.map(() => ({ success: false, error: 'Sender email address not configured' }));
    }

    const fromHeader = config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let transporter = await this.createTransporter(config);

    const isRetryableTransportError = (err) => {
      const msg = (err && err.message) || '';
      const c = err && err.code;
      return (
        c === 'ECONNRESET' ||
        c === 'ETIMEDOUT' ||
        c === 'ECONNREFUSED' ||
        /socket close|Greeting never received|Connection closed/i.test(msg)
      );
    };

    const recreateTransporter = async () => {
      try {
        transporter.close();
      } catch (_) {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 500));
      transporter = await this.createTransporter(config);
    };

    const results = [];

    try {
      for (const job of mailJobs) {
        const to = job.to;
        const subject = job.subject;
        const html = job.html;
        const text =
          job.text != null ? job.text : html ? String(html).replace(/<[^>]*>/g, '') : '';
        const toMask = this.maskEmail(to);

        if (!to || !emailRegex.test(String(to).trim())) {
          results.push({ success: false, error: 'Invalid email address format' });
          continue;
        }

        if (!this.checkRateLimit(tenantId)) {
          results.push({ success: false, error: 'Rate limit exceeded (1000 emails per day)' });
          continue;
        }

        let settled = false;
        for (let attempt = 0; attempt < 2 && !settled; attempt += 1) {
          try {
            const info = await transporter.sendMail({
              from: fromHeader,
              to: String(to).trim(),
              subject,
              html,
              text,
              attachments: job.attachments || [],
            });
            console.log(
              `${logPrefix}[tenant_bulk_send_success] tenantId=${tenantId} to=${toMask} subject="${(subject || '').substring(0, 50)}" ` +
                `responseCode=${info.responseCode || 'n/a'} messageId=${info.messageId || 'n/a'}`
            );
            results.push({ success: true, messageId: info.messageId });
            settled = true;
          } catch (err) {
            const errInfo = this.summarizeProviderError(err);
            console.error(
              `${logPrefix}[tenant_bulk_send_failure] tenantId=${tenantId} to=${toMask} attempt=${attempt + 1} ` +
                `code=${errInfo.code} responseCode=${errInfo.responseCode} command=${errInfo.command} message="${errInfo.message}" response="${errInfo.response}"`
            );
            if (attempt === 0 && isRetryableTransportError(err)) {
              await recreateTransporter();
              continue;
            }
            results.push({ success: false, error: this.formatTenantSmtpError(err) });
            settled = true;
          }
        }
      }
    } finally {
      try {
        transporter.close();
      } catch (_) {
        /* ignore */
      }
    }

    return results;
  }

  /**
   * Send email message
   * @param {string} tenantId - Tenant ID
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} html - Email HTML content
   * @param {string} text - Email plain text content (optional)
   * @param {Array} attachments - Email attachments (optional)
   * @param {string} from - Sender email address (optional, uses config default)
   * @returns {Promise<Object>} - API response
   */
  async sendMessage(tenantId, to, subject, html, text = null, attachments = [], from = null, options = {}) {
    const logPrefix = '[Email]';
    const context = options.context || {};
    const contextText = this.formatContext({ ...context, tenantId, source: context.source || 'tenant_config' });
    const toMask = this.maskEmail(to);
    const subjectShort = subject ? subject.substring(0, 50) : '';

    try {
      const resolvedConfig = await this.resolveTenantEmailConfig(tenantId);
      if (!resolvedConfig.ok) {
        console.warn(
          `${logPrefix}[tenant_send_skip]${contextText} to=${toMask} subject="${subjectShort}" ` +
            `source=tenant_config reason=${resolvedConfig.reason} provider=${resolvedConfig.provider || 'unknown'}`
        );
        const fail = {
          success: false,
          error: resolvedConfig.error
        };
        void this._recordDelivery({
          tenantId,
          channel: 'email',
          provider: resolvedConfig.provider || 'smtp',
          source: context.source || 'tenant_config',
          status: 'failed',
          errorCode: resolvedConfig.reason || 'EMAIL_CONFIG_INVALID',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }
      const config = resolvedConfig.config;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        console.warn(`${logPrefix}[tenant_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=invalid_recipient`);
        const fail = {
          success: false,
          error: 'Invalid email address format'
        };
        void this._recordDelivery({
          tenantId,
          channel: 'email',
          provider: config.provider || 'smtp',
          source: context.source || 'tenant_config',
          status: 'failed',
          errorCode: 'INVALID_EMAIL',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }

      if (!this.checkRateLimit(tenantId)) {
        console.warn(`${logPrefix}[tenant_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=rate_limit_exceeded`);
        const fail = {
          success: false,
          error: 'Rate limit exceeded (1000 emails per day)'
        };
        void this._recordDelivery({
          tenantId,
          channel: 'email',
          provider: config.provider || 'smtp',
          source: context.source || 'tenant_config',
          status: 'failed',
          errorCode: 'RATE_LIMIT',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }

      const fromEmail = from || config.fromEmail || config.smtpUser;

      if (!fromEmail) {
        console.warn(`${logPrefix}[tenant_send_skip]${contextText} to=${toMask} subject="${subjectShort}" reason=sender_not_configured`);
        const fail = {
          success: false,
          error: 'Sender email address not configured'
        };
        void this._recordDelivery({
          tenantId,
          channel: 'email',
          provider: config.provider || 'smtp',
          source: context.source || 'tenant_config',
          status: 'failed',
          errorCode: 'SENDER_NOT_CONFIGURED',
          errorMessage: fail.error,
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: context,
        });
        return fail;
      }

      const transporter = await this.createTransporter(config);
      const diag = this.getConfigDiagnostic(config);
      console.log(
        `${logPrefix}[tenant_send_start]${contextText} to=${toMask} subject="${subjectShort}" provider=${diag.provider} ` +
          `from=${this.maskEmail(fromEmail)} smtpUser=${diag.smtpUserMasked} fromMatchesSmtpUser=${diag.fromMatchesSmtpUser}`
      );
      const mailOptions = {
        from: config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
        attachments
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log(
          `${logPrefix}[tenant_send_success]${contextText} to=${toMask} subject="${subjectShort}" ` +
            `provider=${config.provider || 'smtp'} responseCode=${info.responseCode || 'n/a'} response="${this.maskEmailsInText(info.response || '').slice(0, 200)}" messageId=${info.messageId || 'n/a'}`
        );
        void this._recordDelivery({
          tenantId,
          channel: 'email',
          provider: config.provider || 'smtp',
          source: context.source || 'tenant_config',
          status: 'success',
          recipient: to,
          recipientMasked: toMask,
          subjectOrContext: subjectShort,
          metadata: { ...context, messageId: info.messageId || null },
        });
        return {
          success: true,
          messageId: info.messageId,
          data: info
        };
      } finally {
        try {
          transporter.close();
        } catch (_) {
          /* ignore */
        }
      }

    } catch (error) {
      const err = this.summarizeProviderError(error);
      console.error(
        `${logPrefix}[tenant_send_failure]${contextText} to=${toMask} subject="${subjectShort}" ` +
          `code=${err.code} responseCode=${err.responseCode} command=${err.command} message="${err.message}" response="${err.response}"`
      );
      const formatted = this.formatTenantSmtpError(error);
      void this._recordDelivery({
        tenantId,
        channel: 'email',
        provider: 'smtp',
        source: context.source || 'tenant_config',
        status: 'failed',
        errorCode: err.code,
        errorMessage: formatted,
        recipient: to,
        recipientMasked: toMask,
        subjectOrContext: subjectShort,
        metadata: context,
      });
      return {
        success: false,
        error: formatted
      };
    }
  }

  /**
   * Test email connection
   * @param {Object} config - Email configuration to test
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(config, options = {}) {
    const provider = config.provider || 'smtp';
    const logPrefix = '[Email Test]';
    const context = options.context || {};
    const mode = context.mode || 'verify';
    const contextText = this.formatContext({ ...context, mode });
    try {
      const diag = this.getConfigDiagnostic(config);
      console.log(
        `${logPrefix}[connection_verify_start]${contextText} provider=${provider} host=${diag.host} port=${diag.port} ` +
          `smtpUser=${diag.smtpUserMasked} from=${diag.fromEmailMasked} fromMatchesSmtpUser=${diag.fromMatchesSmtpUser}`
      );

      // Validate required fields based on provider
      switch (provider) {
        case 'smtp':
        case 'gmail':
          if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
            const missing = []; if (!config.smtpHost) missing.push('smtpHost'); if (!config.smtpUser) missing.push('smtpUser'); if (!config.smtpPassword) missing.push('smtpPassword');
            console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=missing_fields fields=${missing.join(',')}`);
            return {
              success: false,
              error: provider === 'gmail'
                ? 'Gmail address and app password are required'
                : 'SMTP Host, User, and Password are required'
            };
          }
          break;

        case 'sendgrid':
          if (!config.sendgridApiKey) {
            console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=missing_sendgrid_api_key`);
            return {
              success: false,
              error: 'SendGrid API Key is required'
            };
          }
          break;

        case 'ses':
          if (!config.sesAccessKeyId || !config.sesSecretAccessKey) {
            console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=missing_ses_credentials`);
            return {
              success: false,
              error: 'AWS SES Access Key ID and Secret Access Key are required'
            };
          }
          break;

        case 'mailjet':
          if (!config.smtpUser || !config.smtpPassword) {
            console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=missing_mailjet_credentials`);
            return {
              success: false,
              error: 'Mailjet API Key and Secret Key are required'
            };
          }
          break;

        case 'resend':
          if (!config.resendApiKey) {
            console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=missing_resend_api_key`);
            return {
              success: false,
              error: 'Resend API Key is required'
            };
          }
          break;

        default:
          console.log(`${logPrefix}[connection_verify_skip]${contextText} provider=${provider} reason=unsupported_provider`);
          return {
            success: false,
            error: `Unsupported email provider: ${provider}`
          };
      }

      console.log(`${logPrefix}[connection_verify_transport]${contextText} provider=${provider} host=${diag.host} user=${diag.smtpUserMasked}`);
      const transporter = await this.createTransporter(config);
      try {
        await transporter.verify();
        console.log(`${logPrefix}[connection_verify_success]${contextText} provider=${provider}`);
        return {
          success: true,
          message: 'Email connection verified successfully'
        };
      } finally {
        try {
          transporter.close();
        } catch (_) {
          /* ignore */
        }
      }
    } catch (error) {
      const err = this.summarizeProviderError(error);
      const code = error.code || '';
      console.error(
        `${logPrefix}[connection_verify_failure]${contextText} provider=${provider} ` +
          `code=${err.code} responseCode=${err.responseCode} command=${err.command} message="${err.message}" response="${err.response}"`
      );
      let userMessage = error.message || 'Failed to verify email connection';
      if (code === 'ETIMEDOUT' || (code === 'ECONNREFUSED') || (error.message && error.message.includes('Greeting never received'))) {
        userMessage = 'Could not reach the mail server (connection timed out or blocked). If you\'re on a local network, outbound SMTP is often blocked—try from a deployed server, or use port 465 (SSL) if your provider supports it.';
      }
      return {
        success: false,
        error: userMessage
      };
    }
  }
}

module.exports = new EmailService();
