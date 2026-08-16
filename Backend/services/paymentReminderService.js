const cron = require('node-cron');
const { Invoice, Customer, Tenant, Setting, WhatsAppMessageEvent } = require('../models');
const { Op } = require('sequelize');
const whatsappService = require('./whatsappService');
const whatsappTemplates = require('./whatsappTemplates');
const activityLogger = require('./activityLogger');
const smsService = require('./smsService');
const { Shop, StudioLocation } = require('../models');
const { formatCustomerSmsForTenant } = require('../utils/smsMessageUtils');
const smsTemplateService = require('./smsTemplateService');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const taskAutomationService = require('./taskAutomationService');
const { getTenantLogoUrl } = require('../utils/tenantLogo');

/**
 * Payment Reminder Service
 * Sends WhatsApp, SMS, and/or email reminders for overdue invoices
 * Runs daily at 9 AM
 */
class PaymentReminderService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Build SMS message for overdue invoice using tenant template.
   */
  async buildPaymentReminderSms(invoice, paymentLink) {
    const invNum = invoice.invoiceNumber || `#${invoice.id}`;
    const balance = parseFloat(invoice.balance);
    const amount = Number.isFinite(balance) ? `GHS ${balance.toFixed(2)}` : 'outstanding';
    const customer = invoice.customer || {};

    let shop = null;
    let studioLocation = null;
    if (invoice.shopId) {
      shop = await Shop.findByPk(invoice.shopId);
    } else if (invoice.studioLocationId) {
      studioLocation = await StudioLocation.findByPk(invoice.studioLocationId);
    }

    const branchName = shop?.name || studioLocation?.name || '';
    const tenant = await Tenant.findByPk(invoice.tenantId, { attributes: ['id', 'name'] });
    const businessName = branchName || tenant?.name || 'Business';
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

    const variables = {
      customerName: customer.name || customer.company || 'Customer',
      businessName,
      branchName,
      invoiceNumber: invNum,
      amount,
      paymentLink: paymentLink || '',
      dueDate,
    };

    const rendered = await smsTemplateService.renderForTenant(
      invoice.tenantId,
      'payment_reminder',
      variables
    );
    if (rendered) return rendered;

    return formatCustomerSmsForTenant({
      tenantId: invoice.tenantId,
      shop,
      studioLocation,
      body: `Reminder: invoice ${invNum} (${amount}) is overdue. Pay: ${paymentLink}`,
    });
  }

  /**
   * Check for overdue invoices and send reminders (WhatsApp, SMS, and/or email)
   */
  async checkAndSendReminders() {
    if (this.isRunning) {
      console.log('[PaymentReminder] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[PaymentReminder] Starting payment reminder check...');

    try {
      // Find all overdue invoices (status: sent, partial, or overdue, with balance > 0)
      const overdueInvoices = await Invoice.findAll({
        where: {
          status: { [Op.in]: ['sent', 'partial', 'overdue'] },
          balance: { [Op.gt]: 0 },
          dueDate: { [Op.lt]: new Date() }
        },
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'phone', 'email'],
            required: false
          }
        ]
      });

      console.log(`[PaymentReminder] Found ${overdueInvoices.length} overdue invoices`);

      let sentCount = 0;
      let skippedCount = 0;

      for (const invoice of overdueInvoices) {
        try {
          try {
            await taskAutomationService.createInvoiceOverdueTask({
              invoice,
              tenantId: invoice.tenantId,
              triggeredBy: null
            });
          } catch (taskError) {
            console.error('[PaymentReminder] Failed to auto-create overdue invoice task:', taskError?.message);
          }

          if (!invoice.customer) {
            skippedCount++;
            continue;
          }

          const { buildInvoicePaymentLink } = require('../utils/frontendUrl');
          const paymentLink = buildInvoicePaymentLink(invoice);

          let reminderSent = false;
          const { isChannelEnabledForEvent } = require('./messageDeliveryRulesService');
          const {
            TEMPLATE_KEYS,
            isCustomerNotificationEffectiveEnabled,
            shouldUseAutomationInsteadOfBuiltIn,
          } = require('./customerNotificationBridgeService');

          // When an overdue automation is enabled, skip all built-in channels (WA/SMS/email).
          const skipBuiltInReminders = await shouldUseAutomationInsteadOfBuiltIn(
            invoice.tenantId,
            TEMPLATE_KEYS.OVERDUE_INVOICE_REMINDER
          );
          if (skipBuiltInReminders) {
            skippedCount++;
            continue;
          }

          const [whatsappRule, smsRule, emailRule] = await Promise.all([
            isChannelEnabledForEvent(invoice.tenantId, 'payment_reminder', 'whatsapp'),
            isChannelEnabledForEvent(invoice.tenantId, 'payment_reminder', 'sms'),
            isChannelEnabledForEvent(invoice.tenantId, 'payment_reminder', 'email'),
          ]);

          const customerPhone = invoice.customer.phone;
          const customerEmail = String(invoice.customer.email || '').trim();

          // Send WhatsApp if enabled
          const whatsappConfig = whatsappRule ? await whatsappService.getConfig(invoice.tenantId) : null;
          if (whatsappConfig && whatsappConfig.enabled && customerPhone) {
            const phoneNumber = whatsappService.validatePhoneNumber(customerPhone);
            if (phoneNumber) {
              const reminderCooldownHours = Math.max(1, Number(whatsappConfig.paymentReminderCooldownHours || 24));
              const recentWhatsAppReminder = await WhatsAppMessageEvent.findOne({
                where: {
                  tenantId: invoice.tenantId,
                  eventType: 'send',
                  status: 'sent',
                  templateName: 'payment_reminder',
                  createdAt: { [Op.gte]: new Date(Date.now() - reminderCooldownHours * 60 * 60 * 1000) },
                  metadata: { invoiceId: invoice.id }
                }
              });
              if (!recentWhatsAppReminder) {
                const parameters = whatsappTemplates.preparePaymentReminder(invoice, paymentLink);
                const result = await whatsappService.sendMessage(
                  invoice.tenantId,
                  phoneNumber,
                  'payment_reminder',
                  parameters,
                  'en',
                  { category: 'transactional', metadata: { source: 'payment_reminder', invoiceId: invoice.id } }
                );
                if (result.success) {
                  reminderSent = true;
                  console.log(`[PaymentReminder] WhatsApp reminder sent for invoice ${invoice.invoiceNumber}`);
                } else {
                  console.error(`[PaymentReminder] WhatsApp failed for ${invoice.invoiceNumber}:`, result.error);
                }
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          // Send SMS if enabled (tenant or platform)
          const smsConfig = smsRule ? await smsService.getResolvedConfig(invoice.tenantId) : null;
          if (smsConfig && customerPhone) {
            const smsPhone = smsService.validatePhoneNumber(customerPhone);
            if (smsPhone) {
              const smsMessage = await this.buildPaymentReminderSms(invoice, paymentLink);
              const smsResult = await smsService.sendMessage(invoice.tenantId, smsPhone, smsMessage);
              if (smsResult.success) {
                reminderSent = true;
                console.log(`[PaymentReminder] SMS reminder sent for invoice ${invoice.invoiceNumber}`);
              } else {
                console.error(`[PaymentReminder] SMS failed for ${invoice.invoiceNumber}:`, smsResult.error);
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          // Send email if enabled (optional setting or automation rule)
          const prefsRow = await Setting.findOne({ where: { tenantId: invoice.tenantId, key: 'customer-notification-preferences' } });
          const prefs = prefsRow?.value || {};
          const emailEffective = await isCustomerNotificationEffectiveEnabled(invoice.tenantId, {
            settingEnabled: prefs.sendPaymentReminderEmail === true,
            templateKey: TEMPLATE_KEYS.OVERDUE_INVOICE_REMINDER,
          });
          if (emailRule && emailEffective && customerEmail) {
            const emailConfig = await emailService.getConfig(invoice.tenantId);
            if (emailConfig) {
              const tenant = await Tenant.findByPk(invoice.tenantId);
              const company = {
                name: tenant?.name || 'African Business Suite',
                logo: getTenantLogoUrl(tenant),
                primaryColor: tenant?.metadata?.primaryColor || '#166534'
              };
              const balance = parseFloat(invoice.balance);
              const invoiceForEmail = {
                ...invoice.toJSON(),
                total: Number.isFinite(balance) ? balance : (parseFloat(invoice.totalAmount) || 0),
                invoiceNumber: invoice.invoiceNumber,
                currency: invoice.currency || 'GHS',
                dueDate: invoice.dueDate
              };
              const { subject, html, text } = emailTemplates.paymentReminder(invoiceForEmail, invoice.customer, paymentLink, company, 'overdue');
              const emailResult = await emailService.sendMessage(invoice.tenantId, customerEmail, subject, html, text);
              if (emailResult.success) {
                reminderSent = true;
                console.log(`[PaymentReminder] Email reminder sent for invoice ${invoice.invoiceNumber}`);
              } else {
                console.error(`[PaymentReminder] Email failed for ${invoice.invoiceNumber}:`, emailResult.error);
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          if (reminderSent) {
            sentCount++;
            if (invoice.status !== 'overdue') {
              await invoice.update({ status: 'overdue' });
              try {
                await activityLogger.logInvoiceOverdue(invoice, null);
              } catch (logErr) {
                console.error('[PaymentReminder] logInvoiceOverdue failed:', logErr?.message);
              }
            }
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`[PaymentReminder] Error processing invoice ${invoice.invoiceNumber}:`, error);
          skippedCount++;
        }
      }

      console.log(`[PaymentReminder] Completed. Sent: ${sentCount}, Skipped: ${skippedCount}`);
      
    } catch (error) {
      console.error('[PaymentReminder] Error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the scheduled job
   */
  start() {
    // Run daily at 9 AM
    cron.schedule('0 9 * * *', () => {
      this.checkAndSendReminders();
    });

    console.log('[PaymentReminder] Scheduled job started (runs daily at 9 AM)');
  }

  /**
   * Stop the scheduled job
   */
  stop() {
    // Cron jobs can't be easily stopped, but we can prevent execution
    this.isRunning = true;
    console.log('[PaymentReminder] Service stopped');
  }
}

module.exports = new PaymentReminderService();
