const { Op, col, fn, where: sequelizeWhere } = require('sequelize');
const {
  AutomationRule,
  AutomationRun,
  AutomationDelayedRun,
  Customer,
  Invoice,
  Job,
  Lead,
  Prescription,
  PrescriptionItem,
  Product,
  Quote,
  Sale,
  SaleItem,
  Tenant,
  User,
  UserTask,
} = require('../models');
const { loadTenantOrganization } = require('../utils/documentOrganizationUtils');
const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const emailTemplates = require('./emailTemplates');
const whatsappTemplates = require('./whatsappTemplates');
const { resolveBusinessNameForContext, extractBranchIdsFromContext } = require('../utils/resolveBusinessNameForContext');
const { matchBirthdayMonthDay } = require('../utils/customerBirthday');
const {
  annotateTemplateEligibility,
  filterTemplatesForTenant,
  isTriggerAllowedForTenant,
} = require('../utils/automationBusinessType');
const {
  isInternalAudience,
  resolveStaffRecipients,
  getActionRecipientConfig,
} = require('./automationRecipientService');

const DEDUPE_WINDOW_HOURS = 24;
const MAX_RULES_PER_TICK = 100;
const MAX_SUBJECTS_PER_RULE = 50;
const MAX_DELAYED_RUNS_PER_TICK = 100;
/** Default Send-after delay (minutes) for review_request templates. */
const DEFAULT_REVIEW_REQUEST_DELAY_MINUTES = 60;

/** Sticky (condition-while-true) triggers that support repeat frequency. */
const STICKY_TRIGGER_TYPES = new Set([
  'invoice_overdue',
  'invoice_overdue_staff',
  'invoice_due_in_days',
  'quote_no_response',
  'lead_no_contact_days',
  'customer_inactive_days',
  'low_stock_detected',
  'out_of_stock_detected',
  'low_stock_on_change',
  'job_due_in_hours',
]);

const MESSAGING_ACTION_TYPES = new Set([
  'send_email_platform',
  'send_sms',
  'send_whatsapp',
]);

const FREQUENCY_COOLDOWN_HOURS = {
  daily: 24,
  weekly: 168,
  monthly: 720,
};

/**
 * Whether a rule's branch scope (shopId/studioLocationId) matches the subject/context
 * a trigger fired for. A rule with both fields null applies to all branches.
 * @param {{ shopId?: string|null, studioLocationId?: string|null }} rule
 * @param {object} context - trigger context (or subject-shaped object) carrying branch hints
 * @returns {boolean}
 */
function ruleMatchesContextBranch(rule, context = {}) {
  const ruleShopId = rule?.shopId || null;
  const ruleStudioLocationId = rule?.studioLocationId || null;
  if (!ruleShopId && !ruleStudioLocationId) return true;
  const ids = extractBranchIdsFromContext(context);
  if (ruleShopId && ruleShopId !== ids.shopId) return false;
  if (ruleStudioLocationId && ruleStudioLocationId !== ids.studioLocationId) return false;
  return true;
}

/**
 * Sequelize `where` fragment restricting a shopId column to a rule's branch scope.
 * @param {{ shopId?: string|null }} rule
 * @returns {object}
 */
function shopBranchWhere(rule) {
  return rule?.shopId ? { shopId: rule.shopId } : {};
}

/**
 * Sequelize `where` fragment restricting a studioLocationId column to a rule's branch scope.
 * @param {{ studioLocationId?: string|null }} rule
 * @returns {object}
 */
function studioBranchWhere(rule) {
  return rule?.studioLocationId ? { studioLocationId: rule.studioLocationId } : {};
}

/**
 * Catalog of automation templates. Each entry is annotated with allowedBusinessTypes
 * and optional feature gates (requiresQuotes / requiresOrders) via annotateTemplateEligibility.
 * @returns {object[]}
 */
function getTemplates() {
  const templates = [
    {
      key: 'invoice_due_reminder',
      name: 'Invoice due reminder',
      description: 'Email customers before an invoice is due.',
      triggerType: 'invoice_due_in_days',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { daysBeforeDue: 2 },
      actionConfig: {
        actions: [{ type: 'send_email_platform', subject: 'Invoice due soon', body: 'Your invoice is due soon.' }]
      }
    },
    {
      key: 'low_stock_alert',
      name: 'Low-stock alert',
      description: 'Create a task and email staff when stock reaches the reorder level.',
      triggerType: 'low_stock_detected',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      triggerConfig: { thresholdMode: 'reorder_level' },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'create_task',
          title: 'Restock low item',
          priority: 'high',
          link: '/materials'
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Low stock: {{productName}}',
          body: 'Stock alert for {{productName}} (SKU: {{sku}}).\n\nQuantity on hand: {{quantityOnHand}}\nReorder level: {{reorderLevel}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'win_back_campaign',
      name: 'Win-back campaign',
      description: 'Email customers after a period of inactivity.',
      triggerType: 'customer_inactive_days',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { inactiveDays: 30 },
      actionConfig: {
        actions: [{ type: 'send_email_platform', subject: 'We miss you', body: 'Come back for a special offer.' }]
      }
    },
    {
      key: 'birthday_greeting',
      name: 'Birthday greeting',
      description: 'Send customers a birthday message on their birthday.',
      triggerType: 'customer_birthday',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'birthday_greeting',
          language: 'en',
          parameters: ['{{customerName}}']
        }]
      }
    },
    {
      key: 'overdue_invoice_reminder',
      name: 'Overdue invoice reminder',
      description: 'Send a payment reminder after an invoice is overdue.',
      triggerType: 'invoice_overdue',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { daysAfterDue: 1 },
      scheduleConfig: { frequency: 'weekly', cooldownHours: 168 },
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'payment_reminder',
          language: 'en',
          parameters: ['{{customerName}}', '{{invoiceNumber}}', '{{balanceFormatted}}', '{{dueDate}}'],
          buttonParameters: ['{{paymentPath}}'],
          buttonIndex: 0
        }]
      }
    },
    {
      key: 'quote_follow_up',
      name: 'Quote follow-up',
      description: 'Email customers when a sent quote has no response.',
      triggerType: 'quote_no_response',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      requiresQuotes: true,
      triggerConfig: { silentDays: 3 },
      actionConfig: {
        actions: [{
          type: 'send_email_platform',
          subject: 'Following up on your quote',
          body: 'Hi, just checking whether you have any questions about your quote.'
        }]
      }
    },
    {
      key: 'payment_received_thank_you',
      name: 'Payment received thank-you',
      description: 'Thank customers after a payment is recorded.',
      triggerType: 'payment_received',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'payment_received',
          language: 'en',
          parameters: ['{{customerName}}', '{{invoiceNumber}}', '{{amount}}', '{{businessName}}']
        }, {
          type: 'send_email_platform',
          subject: 'Payment received — thank you',
          body: 'Hi {{customerName}},\n\nThank you! We have received your payment of {{amount}} for invoice {{invoiceNumber}}.\n\nRemaining balance: {{balance}}\n\n{{businessName}}'
        }]
      }
    },
    {
      key: 'job_completed_notification',
      name: 'Job completed notification',
      description: 'Notify customers when a job is completed.',
      triggerType: 'job_completed',
      allowedBusinessTypes: ['studio'],
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'job_completed',
          language: 'en',
          parameters: ['{{customerName}}', '{{jobNumber}}', '{{businessName}}']
        }, {
          type: 'send_email_platform',
          subject: 'Your job {{jobNumber}} is complete',
          body: 'Hi {{customerName}},\n\nGood news! Your job {{jobNumber}} has been completed.\n\n{{trackingLinkLine}}\n\nThank you,\n{{businessName}}'
        }]
      }
    },
    {
      key: 'daily_sales_summary',
      name: 'Daily sales summary',
      description: 'Send the team a daily sales recap.',
      triggerType: 'daily_sales_summary',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      triggerConfig: { summaryPeriod: 'yesterday' },
      conditionConfig: { runAfterTime: '06:00' },
      scheduleConfig: { cooldownHours: 20 },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Daily sales summary — {{date}}',
          body: 'Daily sales recap for {{date}} ({{periodLabel}}):\n\nTotal sales: {{totalSalesFormatted}}\nTransactions: {{transactionCount}}\nTop products: {{topProducts}}\n\n— {{businessName}}'
        }, {
          type: 'create_task',
          title: 'Review daily sales — {{date}}',
          priority: 'medium',
          description: '{{totalSalesFormatted}} from {{transactionCount}} transactions. Top: {{topProducts}}.',
          link: '/sales'
        }]
      }
    },
    {
      key: 'review_request',
      name: 'Review request',
      description: 'Ask customers for a review after a job, sale, or paid invoice.',
      triggerType: 'review_request',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      scheduleConfig: { cooldownHours: 168, delayMinutes: DEFAULT_REVIEW_REQUEST_DELAY_MINUTES },
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'review_request',
          language: 'en',
          parameters: ['{{customerName}}', '{{businessName}}', '{{reviewLink}}']
        }, {
          type: 'send_email_platform',
          subject: 'How did we do, {{customerName}}?',
          body: 'Hi {{customerName}},\n\nThank you for choosing {{businessName}}! We would love to hear about your experience.\n\nLeave a review here: {{reviewLink}}\n\nThank you,\n{{businessName}}'
        }]
      }
    },
    {
      key: 'low_profit_margin_alert',
      name: 'Low profit margin alert',
      description: 'Create an internal alert when a sale margin is too low.',
      triggerType: 'low_profit_margin',
      allowedBusinessTypes: ['shop'],
      triggerConfig: { minMarginPercent: 15 },
      actionConfig: {
        actions: [{
          type: 'create_task',
          title: 'Low margin sale — {{saleNumber}}',
          priority: 'high',
          description: 'Sale {{saleNumber}} margin is {{profitMarginFormatted}} (threshold {{minMarginPercent}}%). Revenue: {{totalAmountFormatted}}.',
          link: '/sales',
        }]
      }
    },
    {
      key: 'new_lead_notification',
      name: 'New lead notification',
      description: 'Notify the team when a new lead is created.',
      triggerType: 'new_lead',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'create_task',
          title: 'Follow up new lead — {{leadName}}',
          priority: 'medium',
          description: 'New lead {{leadName}} from {{leadSource}}. Phone: {{leadPhone}}. Email: {{leadEmail}}.',
          link: '/leads',
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'New lead: {{leadName}}',
          body: 'A new lead was added:\n\nName: {{leadName}}\nCompany: {{leadCompany}}\nPhone: {{leadPhone}}\nEmail: {{leadEmail}}\nSource: {{leadSource}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'new_lead_staff',
      name: 'New lead — staff alert',
      description: 'Email staff when a new lead is created (does not message the lead).',
      triggerType: 'new_lead_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
          subject: 'New lead: {{leadName}}',
          body: 'A new lead was added:\n\nName: {{leadName}}\nCompany: {{leadCompany}}\nPhone: {{leadPhone}}\nEmail: {{leadEmail}}\nSource: {{leadSource}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'high_value_invoice_alert',
      name: 'High value invoice alert',
      description: 'Alert managers when an invoice exceeds a set amount.',
      triggerType: 'high_value_invoice',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { minAmount: 1000 },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'create_task',
          title: 'High value invoice — {{invoiceNumber}}',
          priority: 'high',
          description: 'Invoice {{invoiceNumber}} for {{customerName}} is {{totalAmountFormatted}}.',
          link: '/invoices',
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'High value invoice {{invoiceNumber}}',
          body: 'Invoice {{invoiceNumber}} for {{customerName}} totals {{totalAmountFormatted}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'customer_created_welcome',
      name: 'New customer welcome',
      description: 'Welcome new customers by email, SMS, or WhatsApp.',
      triggerType: 'customer_created',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_email_platform',
          subject: 'Welcome to {{businessName}}, {{customerName}}!',
          body: 'Hi {{customerName}},\n\nWelcome to {{businessName}}! We are glad to have you as a customer.\n\nWarm regards,\n{{businessName}}',
        }, {
          type: 'send_sms',
          body: 'Hi {{customerName}}, welcome to {{businessName}}! We look forward to serving you.',
        }]
      }
    },
    {
      key: 'lead_no_contact_follow_up',
      name: 'Lead follow-up',
      description: 'Follow up when a lead has had no contact for a set time.',
      triggerType: 'lead_no_contact_days',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { noContactDays: 3 },
      actionConfig: {
        actions: [{
          type: 'create_task',
          title: 'Follow up lead — {{leadName}}',
          priority: 'medium',
          description: 'Lead {{leadName}} has had no contact for {{noContactDays}} days.',
          link: '/leads',
        }, {
          type: 'send_email_platform',
          subject: 'Following up on lead {{leadName}}',
          body: 'Hi team,\n\nLead {{leadName}} ({{leadCompany}}) has had no contact for {{noContactDays}} days. Please follow up.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'invoice_sent_notification',
      name: 'Invoice sent',
      description: 'Notify the customer when an invoice is sent.',
      triggerType: 'invoice_sent',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'invoice_notification',
          language: 'en',
          parameters: ['{{customerName}}', '{{invoiceNumber}}', '{{totalAmountFormatted}}', '{{paymentLink}}'],
        }, {
          type: 'send_email_platform',
          subject: 'Invoice {{invoiceNumber}} from {{businessName}}',
          body: 'Hi {{customerName}},\n\nYour invoice {{invoiceNumber}} for {{totalAmountFormatted}} is ready.\n\nPay online: {{paymentLink}}\n\nThank you,\n{{businessName}}',
        }]
      }
    },
    {
      key: 'sale_completed_receipt',
      name: 'Sale receipt',
      description: 'Send customers an order confirmation when a sale is completed.',
      triggerType: 'sale_completed',
      allowedBusinessTypes: ['shop'],
      // Transactional receipt: do not gate on smsConsent / marketingConsent.
      // Channel gaps (no email) soft-skip at send time; SMS/WhatsApp still send when reachable.
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'sale_receipt',
          language: 'en',
          parameters: ['{{customerName}}', '{{saleNumber}}', '{{totalAmountFormatted}}', '{{businessName}}'],
        }, {
          type: 'send_email_platform',
          subject: 'Your receipt — {{saleNumber}}',
          body: 'Hi {{customerName}},\n\nThank you for your purchase! Your receipt {{saleNumber}} totals {{totalAmountFormatted}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'low_stock_on_change',
      name: 'Low stock (real-time)',
      description: 'Alert staff when stock drops to reorder level after a sale or adjustment.',
      triggerType: 'low_stock_on_change',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      triggerConfig: { thresholdMode: 'reorder_level' },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'create_task',
          title: 'Restock {{productName}}',
          priority: 'high',
          description: '{{productName}} is low ({{quantityOnHand}} on hand, reorder at {{reorderLevel}}).',
          link: '/materials',
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Low stock: {{productName}}',
          body: '{{productName}} ({{sku}}) is low.\n\nOn hand: {{quantityOnHand}}\nReorder level: {{reorderLevel}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'out_of_stock_alert',
      name: 'Out of stock (real-time)',
      description: 'Alert staff when a product goes out of stock.',
      triggerType: 'out_of_stock_detected',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'create_task',
          title: 'Out of stock — {{productName}}',
          priority: 'high',
          description: '{{productName}} ({{sku}}) is out of stock.',
          link: '/materials',
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Out of stock: {{productName}}',
          body: '{{productName}} ({{sku}}) is out of stock.\n\n— {{businessName}}',
        }, {
          type: 'send_whatsapp',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          templateName: 'low_stock_alert',
          language: 'en',
          parameters: ['{{productName}}', '{{quantityOnHand}}', '{{reorderLevel}}'],
        }]
      }
    },
    {
      key: 'quote_sent_notification',
      name: 'Quote sent',
      description: 'Notify the customer when a quote is sent.',
      triggerType: 'quote_sent',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      requiresQuotes: true,
      triggerConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_whatsapp',
          templateName: 'quote_delivery',
          language: 'en',
          parameters: ['{{customerName}}', '{{quoteNumber}}', '{{quoteTitle}}', '{{quoteLink}}'],
        }, {
          type: 'send_email_platform',
          subject: 'Your quote {{quoteNumber}} from {{businessName}}',
          body: 'Hi {{customerName}},\n\nYour quote {{quoteNumber}} ({{totalAmountFormatted}}) is ready.\n\nView it here: {{quoteLink}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'job_due_reminder',
      name: 'Job due soon',
      description: 'Remind the assigned team member when a job is due within a set number of hours.',
      triggerType: 'job_due_in_hours',
      audience: 'internal',
      allowedBusinessTypes: ['studio'],
      triggerConfig: { hoursBeforeDue: 24 },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'assignee' },
        actions: [{
          type: 'create_task',
          title: 'Job due soon — {{jobNumber}}',
          priority: 'medium',
          description: 'Job {{jobNumber}} for {{customerName}} is due on {{dueDate}}.',
          link: '/jobs',
        }, {
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'assignee' },
          subject: 'Job {{jobNumber}} due soon',
          body: 'Hi {{assigneeName}},\n\nJob {{jobNumber}} for {{customerName}} is due on {{dueDate}}.\n\nPlease prioritize this work before the due date.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'prescription_refill_reminder',
      name: 'Prescription refill due',
      description: 'Remind pharmacy customers when a prescription refill is due.',
      triggerType: 'prescription_refill_due',
      allowedBusinessTypes: ['pharmacy'],
      triggerConfig: { daysBeforeDue: 3 },
      actionConfig: {
        actions: [{
          type: 'send_sms',
          body: 'Hi {{customerName}}, your prescription {{prescriptionNumber}} refill is due on {{refillDueDate}}. — {{businessName}}',
        }, {
          type: 'send_email_platform',
          subject: 'Prescription refill reminder — {{prescriptionNumber}}',
          body: 'Hi {{customerName}},\n\nYour prescription {{prescriptionNumber}} refill is due on {{refillDueDate}}.\n\nPlease visit us or call to arrange your refill.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'job_created_tracking_email',
      name: 'Job created — tracking email',
      description: 'Email customers a tracking link when a job is created.',
      triggerType: 'job_created',
      allowedBusinessTypes: ['studio'],
      triggerConfig: { channel: 'email' },
      conditionConfig: { customerHasEmail: true },
      actionConfig: {
        actions: [{
          type: 'send_email_platform',
          subject: 'Your job {{jobNumber}} has been created',
          body: 'Hi {{customerName}},\n\n{{businessName}} created job {{jobNumber}} ({{jobTitle}}).\n\nTrack your order: {{trackingLink}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'job_created_tracking_sms',
      name: 'Job created — tracking SMS',
      description: 'SMS customers a tracking link when a job is created.',
      triggerType: 'job_created',
      allowedBusinessTypes: ['studio'],
      triggerConfig: { channel: 'sms' },
      conditionConfig: { customerHasPhone: true, smsConsent: true },
      actionConfig: {
        actions: [{
          type: 'send_sms',
          body: 'Hi {{customerName}}, {{businessName}} created job {{jobNumber}}. Track: {{trackingLink}}',
        }]
      }
    },
    {
      key: 'job_created_send_invoice',
      name: 'Job created — send invoice',
      description: 'Automatically send an invoice when a job is created.',
      triggerType: 'job_created',
      allowedBusinessTypes: ['studio'],
      triggerConfig: { action: 'send_invoice' },
      actionConfig: { actions: [] }
    },
    {
      key: 'order_created_notification',
      name: 'Order created — tracking notification',
      description: 'Notify customers with an order tracking link when an order is created.',
      triggerType: 'order_created',
      allowedBusinessTypes: ['shop'],
      requiresOrders: true,
      triggerConfig: {},
      conditionConfig: {},
      actionConfig: {
        actions: [{
          type: 'send_sms',
          body: 'Hi {{customerName}}, we received order {{orderNumber}} at {{businessName}}. Track your order: {{trackingLink}}',
        }, {
          type: 'send_email_platform',
          subject: 'Order {{orderNumber}} received — {{businessName}}',
          body: 'Hi {{customerName}},\n\nWe have received your order {{orderNumber}}.\n\n{{trackingLinkLine}}\n\nThank you,\n{{businessName}}',
        }]
      }
    },
    {
      key: 'job_assigned_staff',
      name: 'Job assigned — staff notify',
      description: 'Notify the assignee when a job is assigned or reassigned.',
      triggerType: 'job_assigned_staff',
      audience: 'internal',
      allowedBusinessTypes: ['studio'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'assignee' },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'assignee' },
          subject: 'You were assigned job {{jobNumber}}',
          body: 'Hi {{assigneeName}},\n\nYou have been assigned job {{jobNumber}} ({{jobTitle}}) for {{customerName}}.\n\nDue: {{dueDate}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'payment_received_staff',
      name: 'Payment received — staff alert',
      description: 'Notify owners and managers when a payment is recorded.',
      triggerType: 'payment_received_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Payment received — {{invoiceNumber}}',
          body: 'Payment of {{amount}} received for invoice {{invoiceNumber}} ({{customerName}}).\n\nRemaining balance: {{balance}}\nMethod: {{paymentMethod}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'invoice_paid_staff',
      name: 'Invoice fully paid — staff alert',
      description: 'Notify owners and managers when an invoice is fully paid.',
      triggerType: 'invoice_paid_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Invoice paid — {{invoiceNumber}}',
          body: 'Invoice {{invoiceNumber}} for {{customerName}} is fully paid ({{totalAmountFormatted}}).\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'invoice_overdue_staff',
      name: 'Overdue invoice — staff alert',
      description: 'Notify staff when an invoice becomes overdue.',
      triggerType: 'invoice_overdue_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: { daysAfterDue: 1 },
      scheduleConfig: { frequency: 'weekly', cooldownHours: 168 },
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Overdue invoice {{invoiceNumber}}',
          body: 'Invoice {{invoiceNumber}} for {{customerName}} is {{overdueDays}} days overdue.\n\nBalance due: {{balance}}\nDue date: {{dueDate}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'order_created_staff',
      name: 'Order created — staff alert',
      description: 'Notify kitchen managers and staff when a restaurant order is created.',
      triggerType: 'order_created_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      requiresOrders: true,
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
          subject: 'New order {{orderNumber}}',
          body: 'New order {{orderNumber}} for {{customerName}} — {{totalAmountFormatted}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'order_status_staff',
      name: 'Order status — staff alert',
      description: 'Notify staff when kitchen order status changes (especially ready).',
      triggerType: 'order_status_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      requiresOrders: true,
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager', 'staff'] },
          subject: 'Order {{orderNumber}} is {{orderStatus}}',
          body: 'Order {{orderNumber}} for {{customerName}} is now {{orderStatus}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'quote_accepted_staff',
      name: 'Quote accepted — staff alert',
      description: 'Notify the team when a customer accepts a quote.',
      triggerType: 'quote_accepted_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      requiresQuotes: true,
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Quote {{quoteNumber}} accepted',
          body: '{{customerName}} accepted quote {{quoteNumber}} ({{totalAmountFormatted}}).\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'job_created_staff',
      name: 'Job created — staff alert',
      description: 'Notify managers when a new job is created.',
      triggerType: 'job_created_staff',
      audience: 'internal',
      allowedBusinessTypes: ['studio'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'New job {{jobNumber}}',
          body: 'Job {{jobNumber}} ({{jobTitle}}) was created for {{customerName}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'job_completed_staff',
      name: 'Job completed — staff alert',
      description: 'Notify managers when a job is completed.',
      triggerType: 'job_completed_staff',
      audience: 'internal',
      allowedBusinessTypes: ['studio'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Job {{jobNumber}} completed',
          body: 'Job {{jobNumber}} for {{customerName}} has been completed.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'sale_completed_staff',
      name: 'Sale completed — staff alert',
      description: 'Optionally notify managers when a sale is completed (off by default — enable when needed).',
      triggerType: 'sale_completed_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'role', roles: ['owner', 'manager'] },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'role', roles: ['owner', 'manager'] },
          subject: 'Sale {{saleNumber}} completed',
          body: 'Sale {{saleNumber}} for {{customerName}} completed — {{totalAmountFormatted}}.\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'lead_assigned_staff',
      name: 'Lead assigned — staff notify',
      description: 'Notify the assignee when a lead is assigned.',
      triggerType: 'lead_assigned_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'assignee' },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'assignee' },
          subject: 'Lead assigned: {{leadName}}',
          body: 'Hi {{assigneeName}},\n\nYou were assigned lead {{leadName}} ({{leadCompany}}).\n\nPhone: {{leadPhone}}\nEmail: {{leadEmail}}\n\n— {{businessName}}',
        }]
      }
    },
    {
      key: 'task_assigned_staff',
      name: 'Task assigned — staff notify',
      description: 'Notify assignees when a workspace task is assigned to them.',
      triggerType: 'task_assigned_staff',
      audience: 'internal',
      allowedBusinessTypes: ['shop', 'studio', 'pharmacy'],
      triggerConfig: {},
      actionConfig: {
        audience: 'internal',
        defaultRecipient: { type: 'assignee' },
        actions: [{
          type: 'send_email_platform',
          audience: 'internal',
          recipient: { type: 'assignee' },
          subject: 'Task assigned: {{taskTitle}}',
          body: 'Hi {{assigneeName}},\n\n{{assignedByName}} assigned you the task "{{taskTitle}}".\n\nPriority: {{taskPriority}}\nDue: {{dueDate}}\n\n{{taskDescription}}\n\nOpen tasks: {{taskLink}}\n\n— {{businessName}}',
        }]
      }
    },
  ];
  return templates.map(annotateTemplateEligibility);
}

function getTemplateByKey(key) {
  return getTemplates().find((template) => template.key === key) || null;
}

function normalizeActions(actionConfig) {
  if (!actionConfig) return [];
  if (Array.isArray(actionConfig.actions)) return actionConfig.actions;
  return [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasValue(value) {
  return value !== '' && value !== null && value !== undefined;
}

function compareNumber(actualValue, operator, expectedValue) {
  const actual = toNumber(actualValue, 0);
  const expected = toNumber(expectedValue, 0);
  if (operator === 'less_than') return actual < expected;
  if (operator === 'equal_to') return actual === expected;
  return actual > expected;
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getBooleanContextValue(triggerContext, key, fallbackKey = null) {
  if (typeof triggerContext[key] === 'boolean') return triggerContext[key];
  if (fallbackKey && typeof triggerContext[fallbackKey] === 'boolean') return triggerContext[fallbackKey];
  if (triggerContext.customer && typeof triggerContext.customer[key] === 'boolean') return triggerContext.customer[key];
  return undefined;
}

function paymentStatusForInvoice(invoice) {
  const total = toNumber(invoice.totalAmount, 0);
  const paid = toNumber(invoice.amountPaid, 0);
  const balance = toNumber(invoice.balance, Math.max(0, total - paid));
  if (String(invoice.status || '').toLowerCase() === 'overdue') return 'overdue';
  if (balance <= 0 || String(invoice.status || '').toLowerCase() === 'paid') return 'paid';
  if (paid > 0 || String(invoice.status || '').toLowerCase() === 'partial') return 'partial';
  return 'unpaid';
}

function daysBetween(start, end) {
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Attach branch-aware businessName / branchName to a trigger context.
 * @param {string} tenantId
 * @param {object} triggerContext
 * @returns {Promise<object>}
 */
async function enrichTriggerContextWithBusinessName(tenantId, triggerContext) {
  const names = await resolveBusinessNameForContext(tenantId, triggerContext);
  return {
    ...triggerContext,
    businessName: names.businessName,
    branchName: names.branchName,
  };
}

function formatAutomationDate(date) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date);
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const INVOICE_TEMPLATE_FALLBACKS = {
  dueDate: ['invoice.dueDate'],
  invoiceNumber: ['invoice.invoiceNumber'],
  balance: ['invoice.balance'],
  amount: ['invoice.balance', 'invoice.totalAmount'],
  totalAmount: ['invoice.totalAmount'],
};

function getTemplateContextValue(triggerContext, keyPath) {
  return String(keyPath).split('.').reduce((acc, part) => acc?.[part], triggerContext);
}

function applyTemplateValues(parameters, triggerContext) {
  if (!Array.isArray(parameters)) return [];
  return parameters.map((param) => {
    if (typeof param === 'string') {
      return param.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
        let value = getTemplateContextValue(triggerContext, key);
        if ((value == null || value === '') && !String(key).includes('.')) {
          for (const fallbackPath of INVOICE_TEMPLATE_FALLBACKS[key] || []) {
            value = getTemplateContextValue(triggerContext, fallbackPath);
            if (value != null && value !== '') break;
          }
        }
        return value == null ? '' : String(value);
      });
    }
    if (param && typeof param === 'object') {
      return {
        ...param,
        text: param.text != null ? applyTemplateValues([param.text], triggerContext)[0] : param.text,
        value: param.value != null ? applyTemplateValues([param.value], triggerContext)[0] : param.value
      };
    }
    return param;
  });
}

function scheduleAllowsRun(rule, now = new Date()) {
  const schedule = rule.scheduleConfig || {};
  if (schedule.pausedUntil && new Date(schedule.pausedUntil) > now) {
    return { allowed: false, reason: 'paused_until' };
  }
  if (schedule.startDate && now < new Date(schedule.startDate)) {
    return { allowed: false, reason: 'before_start_date' };
  }
  if (schedule.endDate && now > new Date(schedule.endDate)) {
    return { allowed: false, reason: 'after_end_date' };
  }
  if (Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0) {
    const day = now.getDay();
    if (!schedule.daysOfWeek.map(Number).includes(day)) {
      return { allowed: false, reason: 'day_not_allowed' };
    }
  }
  return { allowed: true };
}

function conditionsAllowRun(rule, triggerContext, now = new Date()) {
  const conditions = rule.conditionConfig || {};
  if (conditions.weekdaysOnly === true) {
    const day = now.getDay();
    if (day === 0 || day === 6) return { allowed: false, reason: 'weekend' };
  }
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (conditions.runAfterTime) {
    const afterMinutes = timeToMinutes(conditions.runAfterTime);
    if (afterMinutes != null && currentMinutes < afterMinutes) return { allowed: false, reason: 'before_time_window' };
  }
  if (conditions.runBeforeTime) {
    const beforeMinutes = timeToMinutes(conditions.runBeforeTime);
    if (beforeMinutes != null && currentMinutes > beforeMinutes) return { allowed: false, reason: 'after_time_window' };
  }
  if (conditions.minInvoiceAmount != null) {
    const amount = toNumber(triggerContext.amount ?? triggerContext.balance ?? triggerContext.totalAmount, 0);
    if (amount < toNumber(conditions.minInvoiceAmount, 0)) {
      return { allowed: false, reason: 'below_min_invoice_amount' };
    }
  }
  if (conditions.maxInvoiceAmount != null) {
    const amount = toNumber(triggerContext.amount ?? triggerContext.balance ?? triggerContext.totalAmount, 0);
    if (amount > toNumber(conditions.maxInvoiceAmount, Infinity)) {
      return { allowed: false, reason: 'above_max_invoice_amount' };
    }
  }
  if (hasValue(conditions.invoiceAmountValue)) {
    const amount = triggerContext.totalAmount ?? triggerContext.invoice?.totalAmount ?? triggerContext.amount;
    if (!compareNumber(amount, conditions.invoiceAmountOperator, conditions.invoiceAmountValue)) {
      return { allowed: false, reason: 'invoice_amount_condition' };
    }
  }
  if (hasValue(conditions.balanceDueValue)) {
    const balance = triggerContext.balance ?? triggerContext.invoice?.balance ?? triggerContext.amount;
    if (!compareNumber(balance, conditions.balanceDueOperator, conditions.balanceDueValue)) {
      return { allowed: false, reason: 'balance_due_condition' };
    }
  }
  if (conditions.invoiceStatus) {
    const status = String(triggerContext.invoiceStatus ?? triggerContext.invoice?.status ?? '').toLowerCase();
    if (status !== String(conditions.invoiceStatus).toLowerCase()) return { allowed: false, reason: 'invoice_status_condition' };
  }
  if (conditions.paymentStatus) {
    const paymentStatus = String(triggerContext.paymentStatus ?? '').toLowerCase();
    if (paymentStatus !== String(conditions.paymentStatus).toLowerCase()) return { allowed: false, reason: 'payment_status_condition' };
  }
  if (hasValue(conditions.overdueDaysValue)) {
    if (!compareNumber(triggerContext.overdueDays, conditions.overdueDaysOperator, conditions.overdueDaysValue)) {
      return { allowed: false, reason: 'overdue_days_condition' };
    }
  }
  if (typeof conditions.hasOverdueInvoices === 'boolean') {
    const value = getBooleanContextValue(triggerContext, 'hasOverdueInvoices');
    if (value !== conditions.hasOverdueInvoices) return { allowed: false, reason: 'has_overdue_invoices_condition' };
  }
  if (typeof conditions.customerHasPhone === 'boolean') {
    const hasPhone = Boolean(triggerContext.phone || triggerContext.customer?.phone);
    if (hasPhone !== conditions.customerHasPhone) return { allowed: false, reason: 'customer_phone_condition' };
  }
  if (typeof conditions.customerHasEmail === 'boolean') {
    const hasEmail = Boolean(triggerContext.email || triggerContext.customer?.email);
    if (hasEmail !== conditions.customerHasEmail) return { allowed: false, reason: 'customer_email_condition' };
  }
  for (const consentKey of ['whatsappConsent', 'smsConsent', 'marketingConsent']) {
    if (typeof conditions[consentKey] === 'boolean') {
      const value = getBooleanContextValue(triggerContext, consentKey);
      if (value !== conditions[consentKey]) return { allowed: false, reason: `${consentKey}_condition` };
    }
  }
  if (hasValue(conditions.lastPurchaseOlderThanDays)) {
    const daysAgo = triggerContext.lastPurchaseDaysAgo;
    if (!hasValue(daysAgo) || toNumber(daysAgo, 0) <= toNumber(conditions.lastPurchaseOlderThanDays, 0)) {
      return { allowed: false, reason: 'last_purchase_condition' };
    }
  }
  if (hasValue(conditions.totalSpendValue)) {
    if (!compareNumber(triggerContext.totalSpend, conditions.totalSpendOperator, conditions.totalSpendValue)) {
      return { allowed: false, reason: 'total_spend_condition' };
    }
  }
  if (conditions.birthdayMatch) {
    const dob = triggerContext.dateOfBirth || triggerContext.customer?.dateOfBirth;
    if (!dob) return { allowed: false, reason: 'birthday_condition' };
    const { sameMonth, sameDay } = matchBirthdayMonthDay(dob, now);
    if (conditions.birthdayMatch === 'today' && (!sameMonth || !sameDay)) return { allowed: false, reason: 'birthday_condition' };
    if (conditions.birthdayMatch === 'this_month' && !sameMonth) return { allowed: false, reason: 'birthday_condition' };
  }
  if (conditions.stockBelowReorderLevel === true) {
    const quantity = triggerContext.quantityOnHand ?? triggerContext.product?.quantityOnHand;
    const reorderLevel = triggerContext.reorderLevel ?? triggerContext.product?.reorderLevel;
    if (toNumber(quantity, 0) > toNumber(reorderLevel, 0)) return { allowed: false, reason: 'stock_reorder_condition' };
  }
  if (hasValue(conditions.quantityValue)) {
    const quantity = triggerContext.quantityOnHand ?? triggerContext.product?.quantityOnHand;
    if (!compareNumber(quantity, conditions.quantityOperator, conditions.quantityValue)) {
      return { allowed: false, reason: 'quantity_condition' };
    }
  }
  return { allowed: true };
}

function triggerConfigAllowsRun(rule, triggerContext) {
  const cfg = rule.triggerConfig || {};
  const triggerType = rule.triggerType;

  if (triggerType === 'high_value_invoice') {
    const minAmount = toNumber(cfg.minAmount, 0);
    const amount = toNumber(triggerContext.totalAmount ?? triggerContext.amount, 0);
    if (amount < minAmount) return { allowed: false, reason: 'below_min_invoice_threshold' };
  }

  if (triggerType === 'low_profit_margin') {
    const minMargin = toNumber(cfg.minMarginPercent, 15);
    const margin = toNumber(triggerContext.profitMargin, 100);
    if (margin >= minMargin) return { allowed: false, reason: 'margin_above_threshold' };
  }

  if (triggerType === 'low_stock_on_change') {
    const mode = cfg.thresholdMode === 'fixed' ? 'fixed' : 'reorder_level';
    const quantity = toNumber(triggerContext.quantityOnHand ?? triggerContext.product?.quantityOnHand, 0);
    if (mode === 'fixed') {
      const fixedThreshold = toNumber(cfg.fixedThreshold, 0);
      if (quantity > fixedThreshold) return { allowed: false, reason: 'above_fixed_threshold' };
    } else if (quantity > toNumber(triggerContext.reorderLevel ?? triggerContext.product?.reorderLevel, 0)) {
      return { allowed: false, reason: 'above_reorder_level' };
    }
  }

  if (triggerType === 'out_of_stock_detected') {
    const quantity = toNumber(triggerContext.quantityOnHand ?? triggerContext.product?.quantityOnHand, 0);
    if (quantity > 0) return { allowed: false, reason: 'not_out_of_stock' };
  }

  return { allowed: true };
}

/**
 * Whether a trigger type supports sticky repeat frequency.
 * @param {string} triggerType
 * @returns {boolean}
 */
function isStickyTriggerType(triggerType) {
  return STICKY_TRIGGER_TYPES.has(String(triggerType || ''));
}

/**
 * Resolve Send-after delay in minutes for event-driven rules.
 * Sticky / scheduler paths ignore delayMinutes (return 0).
 * @param {{ triggerType?: string, scheduleConfig?: object }} rule
 * @returns {number}
 */
function getDelayMinutes(rule) {
  if (isStickyTriggerType(rule?.triggerType)) return 0;
  const schedule = (rule?.scheduleConfig && typeof rule.scheduleConfig === 'object')
    ? rule.scheduleConfig
    : {};
  const n = toNumber(schedule.delayMinutes, 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Enqueue a delayed automation run. Dedupes pending rows for the same rule + subjectKey.
 * @param {{ tenantId: string, ruleId: string, triggerContext?: object, delayMinutes: number, actorUserId?: string|null }} params
 * @returns {Promise<{ delayed: true, delayedRunId: string|null, runAt: Date, reason?: string }>}
 */
async function enqueueDelayedRun({
  tenantId,
  ruleId,
  triggerContext = {},
  delayMinutes,
  actorUserId = null,
}) {
  const minutes = Math.max(0, Math.floor(toNumber(delayMinutes, 0)));
  const runAt = new Date(Date.now() + minutes * 60 * 1000);
  const subjectKey = triggerContext?.subjectKey ? String(triggerContext.subjectKey) : null;
  const contextPayload = {
    ...triggerContext,
    delayed: true,
    delayMinutes: minutes,
    enqueuedAt: new Date().toISOString(),
    actorUserId: actorUserId || triggerContext?.actorUserId || null,
  };

  if (subjectKey) {
    const existing = await AutomationDelayedRun.findOne({
      where: {
        tenantId,
        ruleId,
        subjectKey,
        status: 'pending',
      },
      attributes: ['id', 'runAt'],
    });
    if (existing) {
      return {
        delayed: true,
        delayedRunId: existing.id,
        runAt: existing.runAt,
        reason: 'already_pending',
      };
    }
  }

  try {
    const row = await AutomationDelayedRun.create({
      tenantId,
      ruleId,
      triggerContext: contextPayload,
      runAt,
      status: 'pending',
      subjectKey,
    });
    return { delayed: true, delayedRunId: row.id, runAt: row.runAt };
  } catch (error) {
    // Unique pending subject race — treat as already queued.
    if (error?.name === 'SequelizeUniqueConstraintError' && subjectKey) {
      const existing = await AutomationDelayedRun.findOne({
        where: { tenantId, ruleId, subjectKey, status: 'pending' },
        attributes: ['id', 'runAt'],
      });
      return {
        delayed: true,
        delayedRunId: existing?.id || null,
        runAt: existing?.runAt || runAt,
        reason: 'already_pending',
      };
    }
    throw error;
  }
}

/**
 * Process due delayed event-driven automation runs (DB queue + 1-min cron).
 * Re-checks rule enabled / conditions / dedupe via executeRule(skipDelay: true).
 * @param {{ now?: Date, limit?: number }} [params]
 * @returns {Promise<{ checked: number, executed: number, skipped: number, failed: number, cancelled: number }>}
 */
async function processDueDelayedRuns({ now = new Date(), limit = MAX_DELAYED_RUNS_PER_TICK } = {}) {
  const due = await AutomationDelayedRun.findAll({
    where: {
      status: 'pending',
      runAt: { [Op.lte]: now },
    },
    order: [['runAt', 'ASC']],
    limit,
  });

  const summary = {
    checked: due.length,
    executed: 0,
    skipped: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const delayed of due) {
    const [claimed] = await AutomationDelayedRun.update(
      { status: 'processing', updatedAt: new Date() },
      { where: { id: delayed.id, status: 'pending' } }
    );
    if (!claimed) continue;

    try {
      const rule = await AutomationRule.findByPk(delayed.ruleId);
      if (!rule || !rule.enabled) {
        await delayed.update({
          status: 'cancelled',
          error: rule ? 'rule_disabled' : 'rule_missing',
        });
        summary.cancelled += 1;
        continue;
      }

      const triggerContext = {
        ...(delayed.triggerContext && typeof delayed.triggerContext === 'object'
          ? delayed.triggerContext
          : {}),
        delayedRunId: delayed.id,
        delayedFire: true,
      };
      const actorUserId = triggerContext.actorUserId || rule.createdBy || rule.updatedBy || null;

      const result = await executeRule({
        rule,
        tenantId: delayed.tenantId,
        triggerContext,
        actorUserId,
        options: { skipDelay: true },
      });

      if (result.skipped) {
        await delayed.update({
          status: 'done',
          error: result.reason || 'skipped',
        });
        summary.skipped += 1;
      } else if (result.success) {
        await delayed.update({ status: 'done', error: null });
        summary.executed += 1;
      } else {
        await delayed.update({
          status: 'failed',
          error: result.error || 'execution_failed',
        });
        summary.failed += 1;
      }
    } catch (error) {
      await delayed.update({
        status: 'failed',
        error: error?.message || String(error),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Resolve schedule frequency / cooldown for a rule.
 * once / maxSends:1 → lifetime success gate; else frequency → cooldownHours;
 * fallback legacy cooldownHours, sticky empty → daily, else DEDUPE_WINDOW_HOURS.
 * @param {{ triggerType?: string, scheduleConfig?: object, actionConfig?: object }} rule
 * @returns {{ mode: 'lifetime'|'cooldown'|'dedupe', frequency: string|null, cooldownHours: number, maxSends: number, intervalDays: number|null }}
 */
function resolveRuleSchedule(rule) {
  const schedule = (rule?.scheduleConfig && typeof rule.scheduleConfig === 'object')
    ? rule.scheduleConfig
    : {};
  const frequency = String(schedule.frequency || '').trim() || null;
  const maxSends = toNumber(schedule.maxSends, 0);
  const intervalDaysRaw = toNumber(schedule.intervalDays, 0);

  if (frequency === 'once' || maxSends === 1) {
    return {
      mode: 'lifetime',
      frequency: 'once',
      cooldownHours: 0,
      maxSends: 1,
      intervalDays: null,
    };
  }

  if (frequency === 'daily') {
    return { mode: 'cooldown', frequency, cooldownHours: FREQUENCY_COOLDOWN_HOURS.daily, maxSends: 0, intervalDays: null };
  }
  if (frequency === 'weekly') {
    return { mode: 'cooldown', frequency, cooldownHours: FREQUENCY_COOLDOWN_HOURS.weekly, maxSends: 0, intervalDays: null };
  }
  if (frequency === 'monthly') {
    return { mode: 'cooldown', frequency, cooldownHours: FREQUENCY_COOLDOWN_HOURS.monthly, maxSends: 0, intervalDays: null };
  }
  if (frequency === 'every_n_days') {
    const intervalDays = Math.max(1, intervalDaysRaw || 1);
    return {
      mode: 'cooldown',
      frequency,
      cooldownHours: intervalDays * 24,
      maxSends: 0,
      intervalDays,
    };
  }

  const legacyCooldown = toNumber(
    schedule.cooldownHours ?? rule?.actionConfig?.cooldownHours,
    0
  );
  if (legacyCooldown > 0) {
    return {
      mode: 'cooldown',
      frequency: null,
      cooldownHours: legacyCooldown,
      maxSends: 0,
      intervalDays: null,
    };
  }

  if (isStickyTriggerType(rule?.triggerType)) {
    return {
      mode: 'cooldown',
      frequency: 'daily',
      cooldownHours: FREQUENCY_COOLDOWN_HOURS.daily,
      maxSends: 0,
      intervalDays: null,
    };
  }

  return {
    mode: 'dedupe',
    frequency: null,
    cooldownHours: DEDUPE_WINDOW_HOURS,
    maxSends: 0,
    intervalDays: null,
  };
}

async function isDuplicateRun({ tenantId, ruleId, subjectKey }) {
  if (!subjectKey) return false;
  const threshold = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await AutomationRun.findOne({
    where: {
      tenantId,
      ruleId,
      createdAt: { [Op.gte]: threshold },
      triggerContext: { subjectKey }
    }
  });
  return Boolean(existing);
}

async function isCooldownRun({ tenantId, ruleId, subjectKey, cooldownHours }) {
  if (!subjectKey || !cooldownHours) return false;
  const threshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
  const existing = await AutomationRun.findOne({
    where: {
      tenantId,
      ruleId,
      createdAt: { [Op.gte]: threshold },
      triggerContext: { subjectKey }
    }
  });
  return Boolean(existing);
}

/**
 * Skip further sends when a successful lifetime run already exists (frequency once / maxSends:1).
 * @param {{ tenantId: string, ruleId: string, subjectKey: string }} params
 * @returns {Promise<boolean>}
 */
async function hasSuccessfulLifetimeRun({ tenantId, ruleId, subjectKey }) {
  if (!subjectKey) return false;
  const existing = await AutomationRun.findOne({
    where: {
      tenantId,
      ruleId,
      status: 'success',
      triggerContext: { subjectKey },
    },
    attributes: ['id'],
  });
  return Boolean(existing);
}

async function executeRule({
  rule,
  tenantId,
  triggerContext = {},
  actorUserId = null,
  options = {}
}) {
  const {
    ignoreEnabled = false,
    alwaysRecordRun = false,
    skipDedupe = false,
    skipDelay = false,
  } = options;
  const startedAt = new Date();

  const recordSkipped = async (reason) => {
    if (!alwaysRecordRun) {
      return { skipped: true, reason };
    }
    const run = await AutomationRun.create({
      tenantId,
      ruleId: rule.id,
      status: 'skipped',
      triggerContext: { ...triggerContext, skipReason: reason },
      resultSummary: { skipped: true, reason },
      error: null,
      startedAt,
      finishedAt: new Date()
    });
    return { skipped: true, reason, runId: run.id, status: 'skipped' };
  };

  try {
    if (!rule?.enabled && !ignoreEnabled) {
      return recordSkipped('rule_disabled');
    }

    const scheduleCheck = scheduleAllowsRun(rule, startedAt);
    if (!scheduleCheck.allowed) {
      return recordSkipped(scheduleCheck.reason);
    }

    const conditionCheck = conditionsAllowRun(rule, triggerContext, startedAt);
    if (!conditionCheck.allowed) {
      return recordSkipped(conditionCheck.reason);
    }

    const triggerConfigCheck = triggerConfigAllowsRun(rule, triggerContext);
    if (!triggerConfigCheck.allowed) {
      return recordSkipped(triggerConfigCheck.reason);
    }

    const subjectKey = triggerContext?.subjectKey || null;
    const resolvedSchedule = resolveRuleSchedule(rule);
    if (!skipDedupe && resolvedSchedule.mode === 'lifetime') {
      if (await hasSuccessfulLifetimeRun({ tenantId, ruleId: rule.id, subjectKey })) {
        return recordSkipped('max_sends_reached');
      }
    } else if (!skipDedupe && resolvedSchedule.mode === 'cooldown') {
      if (await isCooldownRun({
        tenantId,
        ruleId: rule.id,
        subjectKey,
        cooldownHours: resolvedSchedule.cooldownHours,
      })) {
        return recordSkipped('cooldown_window');
      }
    } else if (!skipDedupe && resolvedSchedule.mode === 'dedupe') {
      if (await isDuplicateRun({ tenantId, ruleId: rule.id, subjectKey })) {
        return recordSkipped('duplicate_window');
      }
    }

    // Event-driven Send after: enqueue instead of running immediately.
    // Scheduler sticky path ignores delayMinutes; manual tests pass skipDelay: true.
    const isSchedulerPath = Boolean(options.scheduler || triggerContext?.scheduler);
    const delayMinutes = getDelayMinutes(rule);
    if (!skipDelay && !isSchedulerPath && delayMinutes > 0) {
      const delayed = await enqueueDelayedRun({
        tenantId,
        ruleId: rule.id,
        triggerContext,
        delayMinutes,
        actorUserId,
      });
      return {
        delayed: true,
        reason: delayed.reason || 'delayed',
        delayedRunId: delayed.delayedRunId,
        runAt: delayed.runAt,
        delayMinutes,
      };
    }

    const actions = normalizeActions(rule.actionConfig);
    const results = [];

    /**
     * Map messaging action type to channel key for delivery history.
     * @param {string} type
     * @returns {'sms'|'email'|'whatsapp'|null}
     */
    const channelForActionType = (type) => {
      if (type === 'send_sms') return 'sms';
      if (type === 'send_email_platform') return 'email';
      if (type === 'send_whatsapp') return 'whatsapp';
      return null;
    };

    /**
     * Resolve display name and address from contact context for a channel.
     * @param {object} contactContext
     * @param {'sms'|'email'|'whatsapp'|null} channel
     * @returns {{ recipientName: string|null, recipientAddress: string|null, recipientUserId: string|null, customerId: string|null }}
     */
    const resolveDeliveryRecipient = (contactContext, channel) => {
      const recipientName =
        contactContext?.recipientName ||
        contactContext?.assigneeName ||
        contactContext?.customerName ||
        contactContext?.companyName ||
        null;
      const recipientAddress =
        channel === 'email'
          ? (contactContext?.email || null)
          : (contactContext?.phone || null);
      return {
        recipientName,
        recipientAddress,
        recipientUserId: contactContext?.recipientUserId || contactContext?.assigneeId || null,
        customerId: contactContext?.customerId || null,
      };
    };

    /**
     * Build a messaging action result with delivery metadata (no message body).
     * @param {object} params
     * @returns {object}
     */
    const buildMessagingResult = ({
      type,
      success,
      error = null,
      contactContext = null,
      messageId = undefined,
      errorCode = undefined,
      skipped = false,
      reason = null,
      extras = {},
    }) => {
      const channel = channelForActionType(type);
      const recipient = resolveDeliveryRecipient(contactContext, channel);
      const result = {
        type,
        channel,
        success,
        error: error || null,
        recipientName: recipient.recipientName,
        recipientAddress: recipient.recipientAddress,
        recipientUserId: recipient.recipientUserId,
        customerId: recipient.customerId,
        sentAt: new Date().toISOString(),
        ...extras,
      };
      if (messageId !== undefined) result.messageId = messageId;
      if (errorCode !== undefined) result.errorCode = errorCode;
      if (skipped) {
        result.skipped = true;
        result.reason = reason || result.reason || 'skipped';
      } else if (reason) {
        result.reason = reason;
      }
      return result;
    };

    /**
     * Soft-skip a messaging channel when the recipient has no usable address.
     * Does not fail the automation run; Logs show Warning (reason), not Error.
     * @param {string} type
     * @param {string} reason
     * @param {object} contactContext
     * @returns {object}
     */
    const skipMessagingAction = (type, reason, contactContext) => buildMessagingResult({
      type,
      success: true,
      skipped: true,
      reason,
      contactContext,
    });

    /**
     * Send one messaging action to a single contact context.
     * @param {object} action
     * @param {object} contactContext
     * @returns {Promise<object>}
     */
    const sendMessagingAction = async (action, contactContext) => {
      if (action.type === 'send_email_platform') {
        if (!contactContext?.email) {
          // Optional channel: no address → skip (not a hard error).
          return skipMessagingAction('send_email_platform', 'No recipient email', contactContext);
        }
        const rawSubject = action.subject || `${rule.name}`;
        const rawBody = action.body || contactContext.message || '';
        const subject = applyTemplateValues([rawSubject], contactContext)[0];
        const body = applyTemplateValues([rawBody], contactContext)[0];
        const html = emailTemplates.marketingPlainMessageEmail(body, {
          name: contactContext.businessName || 'Business',
          audience: contactContext.audience || 'customer',
        });
        const response = await emailService.sendPlatformMessage(
          contactContext.email,
          subject,
          html,
          body
        );
        return buildMessagingResult({
          type: 'send_email_platform',
          success: !!response?.success,
          error: response?.error || null,
          contactContext,
          // Keep legacy `email` field for older UI consumers.
          extras: { email: contactContext.email },
        });
      }

      if (action.type === 'send_sms') {
        if (!contactContext?.phone) {
          const reason = contactContext?.audience === 'internal'
            ? 'No staff phone'
            : 'No recipient phone';
          return skipMessagingAction('send_sms', reason, contactContext);
        }
        try {
          const rawBody = action.body || contactContext.message || '';
          const message = typeof rawBody === 'string'
            ? applyTemplateValues([rawBody], contactContext)[0]
            : rawBody;
          const response = await smsService.sendMessage(tenantId, contactContext.phone, message, action.fromNumber || null);
          return buildMessagingResult({
            type: 'send_sms',
            success: !!response?.success,
            messageId: response?.messageId || null,
            error: response?.error || null,
            errorCode: response?.errorCode || null,
            contactContext,
          });
        } catch (error) {
          return buildMessagingResult({
            type: 'send_sms',
            success: false,
            error: error?.message || 'send_failed',
            contactContext,
          });
        }
      }

      if (action.type === 'send_whatsapp') {
        if (!contactContext?.phone) {
          const reason = contactContext?.audience === 'internal'
            ? 'No staff phone'
            : 'No recipient phone';
          return skipMessagingAction('send_whatsapp', reason, contactContext);
        }
        try {
          const templateName = String(action.templateName || contactContext.templateName || '').trim();
          if (!templateName) {
            return skipMessagingAction('send_whatsapp', 'Missing WhatsApp template name', contactContext);
          }

          let parameters = applyTemplateValues(
            Array.isArray(action.parameters) ? action.parameters : [],
            contactContext
          );
          let buttonParameters = Array.isArray(action.buttonParameters)
            ? applyTemplateValues(action.buttonParameters, contactContext).filter((value) => String(value || '').trim())
            : undefined;

          // Meta payment_overdue_2 shape: body [name, account, amount, dueDate] + Pay now URL button.
          // Rebuild from context so older automation configs still send a valid payload.
          if (templateName === 'payment_reminder') {
            const hasInvoiceContext = Boolean(
              contactContext?.invoiceNumber || contactContext?.customerName || contactContext?.paymentPath
            );
            if (hasInvoiceContext) {
              parameters = [
                contactContext.customerName || 'Customer',
                contactContext.invoiceNumber || 'N/A',
                contactContext.balanceFormatted
                  || whatsappTemplates.formatCurrency(contactContext.balance ?? contactContext.amount),
                contactContext.dueDate || 'N/A',
              ];
              if ((!buttonParameters || buttonParameters.length === 0) && contactContext.paymentPath) {
                buttonParameters = [String(contactContext.paymentPath)];
              }
            }
          }

          const response = await whatsappService.sendMessage(
            tenantId,
            contactContext.phone,
            templateName,
            parameters,
            action.language || 'en',
            {
              category: action.category || action.messageCategory || 'transactional',
              metadata: {
                automationRuleId: rule.id,
                triggerType: rule.triggerType,
                subjectKey
              },
              buttonParameters: buttonParameters && buttonParameters.length > 0 ? buttonParameters : undefined,
              buttonIndex: action.buttonIndex
            }
          );
          return buildMessagingResult({
            type: 'send_whatsapp',
            success: !!response?.success,
            messageId: response?.messageId || null,
            error: response?.error || null,
            contactContext,
          });
        } catch (error) {
          return buildMessagingResult({
            type: 'send_whatsapp',
            success: false,
            error: error?.message || 'send_failed',
            contactContext,
          });
        }
      }

      return { type: action.type, success: false, error: 'unsupported_action', sentAt: new Date().toISOString() };
    };

    for (const action of actions) {
      if (action.type === 'create_task') {
        const taskAssigneeId = triggerContext.assigneeId || actorUserId;
        if (!taskAssigneeId) {
          results.push({ type: 'create_task', success: false, reason: 'missing_assignee' });
          continue;
        }
        const task = await UserTask.create({
          tenantId,
          userId: actorUserId || taskAssigneeId,
          assigneeId: taskAssigneeId,
          title: applyTemplateValues([action.title || `Automation task: ${rule.name}`], triggerContext)[0],
          description: applyTemplateValues(
            [action.description || triggerContext?.message || ''],
            triggerContext
          )[0] || null,
          status: 'todo',
          priority: action.priority || 'medium',
          dueDate: action.dueDate || new Date().toISOString().slice(0, 10),
          isPrivate: false,
          sourceType: 'automation',
          sourceId: rule.id,
          sourceEvent: rule.triggerType,
          dedupeKey: `automation:${rule.id}:${subjectKey || 'none'}`,
          shopId: triggerContext.shopId || triggerContext.shop?.id || null,
          studioLocationId: triggerContext.studioLocationId || triggerContext.studioLocation?.id || null,
          metadata: { automationRuleId: rule.id, link: action.link || null }
        });
        results.push({ type: 'create_task', success: true, taskId: task.id });
        continue;
      }

      if (!MESSAGING_ACTION_TYPES.has(action.type)) {
        continue;
      }

      const internal = isInternalAudience({ action, rule });
      const recipientConfig = getActionRecipientConfig(action, rule);

      if (internal || recipientConfig) {
        const staffRecipients = await resolveStaffRecipients({
          tenantId,
          recipient: recipientConfig || { type: 'role', roles: ['owner', 'manager'] },
          triggerContext,
        });

        if (!staffRecipients.length) {
          results.push({
            type: action.type,
            channel: channelForActionType(action.type),
            success: false,
            error: 'No staff recipients resolved',
            audience: 'internal',
            recipientName: null,
            recipientAddress: null,
            recipientUserId: null,
            customerId: null,
            sentAt: new Date().toISOString(),
          });
          continue;
        }

        // Never fall back to customer/lead contacts for internal messaging.
        for (const staff of staffRecipients) {
          const contactContext = {
            ...triggerContext,
            email: staff.email || null,
            phone: staff.phone || null,
            recipientName: staff.name || null,
            recipientUserId: staff.userId,
            assigneeName: triggerContext.assigneeName || staff.name || null,
            audience: 'internal',
          };
          results.push(await sendMessagingAction(action, contactContext));
        }
        continue;
      }

      // Customer-facing path: single implied recipient from trigger context.
      results.push(await sendMessagingAction(action, {
        ...triggerContext,
        audience: 'customer',
      }));
    }

    const deliveredOrAttempted = results.filter((result) => !result.skipped);
    const anyFailed = results.some((result) => result.success === false);
    const allSucceeded = deliveredOrAttempted.length > 0
      && deliveredOrAttempted.every((result) => result.success !== false);
    const onlySkipped = results.length > 0 && results.every((result) => result.skipped);
    const run = await AutomationRun.create({
      tenantId,
      ruleId: rule.id,
      status: anyFailed ? 'failed' : onlySkipped ? 'skipped' : allSucceeded ? 'success' : 'skipped',
      triggerContext,
      resultSummary: { results },
      error: anyFailed ? 'One or more actions failed' : null,
      startedAt,
      finishedAt: new Date()
    });
    return { success: !anyFailed, runId: run.id, results };
  } catch (error) {
    const run = await AutomationRun.create({
      tenantId,
      ruleId: rule.id,
      status: 'failed',
      triggerContext,
      resultSummary: {},
      error: error?.message || 'execution_failed',
      startedAt,
      finishedAt: new Date()
    });
    return { success: false, runId: run.id, error: error?.message || 'execution_failed' };
  }
}

function paymentLinkForInvoice(invoice) {
  const { buildInvoicePaymentLink } = require('../utils/frontendUrl');
  return buildInvoicePaymentLink(invoice);
}

function paymentPathForInvoice(invoice) {
  const { buildInvoicePaymentPathParam } = require('../utils/frontendUrl');
  return buildInvoicePaymentPathParam(invoice);
}

function reviewLinkForTenant(slug) {
  const normalized = String(slug || '').trim();
  if (!normalized) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/review/${encodeURIComponent(normalized)}`;
}

/**
 * Resolve the tenant public review URL from organization slug.
 * @param {string} tenantId
 * @returns {Promise<{ reviewLink: string|null, reviewUrl: string|null, reviewSlug: string|null, hasReviewLink: boolean }>}
 */
async function getTenantReviewLink(tenantId) {
  if (!tenantId) {
    return { reviewLink: null, reviewUrl: null, reviewSlug: null, hasReviewLink: false };
  }
  const tenant = await Tenant.findByPk(tenantId, { attributes: ['slug'] });
  const reviewSlug = tenant?.slug?.trim() || null;
  const reviewLink = reviewLinkForTenant(reviewSlug);
  return {
    reviewLink,
    reviewUrl: reviewLink,
    reviewSlug,
    hasReviewLink: Boolean(reviewLink),
  };
}

/**
 * Build trigger context when a payment is recorded on an invoice.
 * @param {object} params
 * @param {object} params.invoice
 * @param {object} [params.customer]
 * @param {object} [params.payment]
 * @param {number} [params.paymentAmount]
 * @param {string} [params.paymentMethod]
 * @returns {object}
 */
function buildPaymentReceivedTriggerContext({
  invoice,
  customer = null,
  payment = null,
  paymentAmount = null,
  paymentMethod = null,
}) {
  const customerObj = customer || invoice?.customer || {};
  const amountPaid = toNumber(paymentAmount ?? payment?.amount, 0);
  const balance = toNumber(invoice?.balance, 0);
  const totalAmount = toNumber(invoice?.totalAmount, balance + amountPaid);
  const paymentId = payment?.id || null;
  const resolvedPaymentMethod = paymentMethod || payment?.paymentMethod || null;
  const formattedAmount = whatsappTemplates.formatCurrency(amountPaid);

  return {
    subjectKey: `payment_received:${invoice.id}:${paymentId || payment?.paymentNumber || Date.now()}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: customerObj.id || invoice.customerId,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    amount: amountPaid,
    amountPaid,
    paymentAmount: amountPaid,
    balance,
    totalAmount,
    paymentMethod: resolvedPaymentMethod,
    paymentDate: payment?.paymentDate || null,
    paymentNumber: payment?.paymentNumber || null,
    invoiceStatus: invoice.status || null,
    paymentStatus: paymentStatusForInvoice(invoice),
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    customer: {
      id: customerObj.id || invoice.customerId,
      name: customerObj.name || null,
      company: customerObj.company || null,
      email: customerObj.email || null,
      phone: customerObj.phone || null,
      shopId: customerObj.shopId || null,
      studioLocationId: customerObj.studioLocationId || null,
      whatsappConsent: customerObj.whatsappConsent === true,
      smsConsent: customerObj.smsConsent === true,
      marketingConsent: customerObj.marketingConsent === true,
    },
    shopId: invoice.shopId || customerObj.shopId || null,
    studioLocationId: invoice.studioLocationId || customerObj.studioLocationId || null,
    invoice: {
      id: invoice.id,
      shopId: invoice.shopId || null,
      studioLocationId: invoice.studioLocationId || null,
    },
    message: `Payment of ${formattedAmount} received for invoice ${invoice.invoiceNumber || invoice.id}.`,
  };
}

function invoiceContext(invoice, rule, kind, now = new Date(), extras = {}) {
  const customer = invoice.customer || {};
  const paymentLink = paymentLinkForInvoice(invoice);
  const paymentPath = paymentPathForInvoice(invoice);
  const balance = toNumber(invoice.balance || invoice.totalAmount, 0);
  const overdueDays = invoice.dueDate && balance > 0 && new Date(invoice.dueDate) < now
    ? daysBetween(invoice.dueDate, now)
    : 0;
  return {
    subjectKey: `${kind}:${invoice.id}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: customer.id || invoice.customerId,
    customerName: customer.name || customer.company || 'Customer',
    email: customer.email || null,
    phone: customer.phone || null,
    amount: balance,
    balance,
    balanceFormatted: whatsappTemplates.formatCurrency(balance),
    totalAmount: toNumber(invoice.totalAmount, balance),
    invoiceStatus: invoice.status || null,
    paymentStatus: paymentStatusForInvoice(invoice),
    overdueDays,
    hasOverdueInvoices: extras.hasOverdueInvoices ?? (overdueDays > 0),
    dueDate: formatAutomationDate(invoice.dueDate),
    paymentLink,
    paymentPath,
    customerHasPhone: Boolean(customer.phone),
    customerHasEmail: Boolean(customer.email),
    whatsappConsent: customer.whatsappConsent === true,
    smsConsent: customer.smsConsent === true,
    marketingConsent: customer.marketingConsent === true,
    customer: {
      id: customer.id || invoice.customerId,
      name: customer.name || null,
      company: customer.company || null,
      email: customer.email || null,
      phone: customer.phone || null,
      whatsappConsent: customer.whatsappConsent === true,
      smsConsent: customer.smsConsent === true,
      marketingConsent: customer.marketingConsent === true
    },
    shopId: invoice.shopId || null,
    studioLocationId: invoice.studioLocationId || null,
    invoice: {
      id: invoice.id,
      shopId: invoice.shopId || null,
      studioLocationId: invoice.studioLocationId || null,
      invoiceNumber: invoice.invoiceNumber || null,
      dueDate: formatAutomationDate(invoice.dueDate),
      balance,
      totalAmount: toNumber(invoice.totalAmount, balance),
    },
    message: `Invoice ${invoice.invoiceNumber || invoice.id} has an outstanding balance of ${whatsappTemplates.formatCurrency(balance)}.`
  };
}

async function overdueInvoiceCustomerIds(tenantId, customerIds, now = new Date()) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await Invoice.findAll({
    where: {
      tenantId,
      customerId: { [Op.in]: ids },
      status: { [Op.in]: ['sent', 'partial', 'overdue'] },
      balance: { [Op.gt]: 0 },
      dueDate: { [Op.lt]: startOfDay(now) }
    },
    attributes: ['customerId'],
    group: ['customerId'],
    raw: true
  });
  return new Set(rows.map((row) => row.customerId).filter(Boolean));
}

async function saleStatsForCustomers(tenantId, customerIds, now = new Date()) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await Sale.findAll({
    where: { tenantId, customerId: { [Op.in]: ids } },
    attributes: [
      'customerId',
      [fn('MAX', col('createdAt')), 'lastPurchaseAt'],
      [fn('SUM', col('total')), 'totalSpend']
    ],
    group: ['customerId'],
    raw: true
  });
  return new Map(rows.map((row) => {
    const lastPurchaseAt = row.lastPurchaseAt || null;
    return [row.customerId, {
      lastPurchaseAt,
      lastPurchaseDaysAgo: lastPurchaseAt ? daysBetween(lastPurchaseAt, now) : null,
      totalSpend: toNumber(row.totalSpend, 0)
    }];
  }));
}

/**
 * Last activity timestamps across sales, jobs, and invoices for win-back evaluation.
 * @param {string} tenantId
 * @param {string[]} customerIds
 * @returns {Promise<Map<string, Date|null>>}
 */
async function lastActivityAtForCustomers(tenantId, customerIds) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  const activityByCustomer = new Map(ids.map((id) => [id, null]));
  if (!ids.length) return activityByCustomer;

  const [saleRows, jobRows, invoiceRows] = await Promise.all([
    Sale.findAll({
      where: { tenantId, customerId: { [Op.in]: ids } },
      attributes: ['customerId', [fn('MAX', col('createdAt')), 'lastAt']],
      group: ['customerId'],
      raw: true,
    }),
    Job.findAll({
      where: { tenantId, customerId: { [Op.in]: ids } },
      attributes: ['customerId', [fn('MAX', col('updatedAt')), 'lastAt']],
      group: ['customerId'],
      raw: true,
    }),
    Invoice.findAll({
      where: { tenantId, customerId: { [Op.in]: ids } },
      attributes: ['customerId', [fn('MAX', col('createdAt')), 'lastAt']],
      group: ['customerId'],
      raw: true,
    }),
  ]);

  const consider = (rows) => {
    for (const row of rows) {
      const customerId = row.customerId;
      const lastAt = row.lastAt ? new Date(row.lastAt) : null;
      if (!customerId || !lastAt || Number.isNaN(lastAt.getTime())) continue;
      const existing = activityByCustomer.get(customerId);
      if (!existing || lastAt > existing) activityByCustomer.set(customerId, lastAt);
    }
  };

  consider(saleRows);
  consider(jobRows);
  consider(invoiceRows);
  return activityByCustomer;
}

function productStockContext(product, subjectPrefix = 'low_stock') {
  const quantityOnHand = toNumber(product.quantityOnHand, 0);
  const reorderLevel = toNumber(product.reorderLevel, 0);
  return {
    subjectKey: `${subjectPrefix}:${product.id}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku || null,
    quantityOnHand,
    reorderLevel,
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku || null,
      quantityOnHand,
      reorderLevel,
      isActive: product.isActive !== false,
      shopId: product.shopId || null,
    },
    shopId: product.shopId || null,
    message: `${product.name} stock is ${quantityOnHand} (reorder ${reorderLevel}).`,
  };
}

function parseDurationDays(duration) {
  if (!duration) return null;
  const match = String(duration).match(/(\d+)\s*day/i);
  return match ? Number(match[1]) : null;
}

function getPrescriptionRefillDueDate(prescription, items = []) {
  const metadata = prescription.metadata && typeof prescription.metadata === 'object' ? prescription.metadata : {};
  if (metadata.refillDueDate) {
    const parsed = new Date(metadata.refillDueDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const base = prescription.filledAt || prescription.updatedAt || prescription.prescriptionDate;
  if (!base) return null;
  const refillDays = toNumber(
    metadata.refillDays,
    parseDurationDays(items[0]?.duration) || 30
  );
  return addDays(base, refillDays);
}

/**
 * Estimate sale profit margin from line items and catalog cost prices.
 * @param {object} sale
 * @param {object[]} [saleItems]
 * @param {Map<string, object>} [productsById]
 * @returns {{ revenue: number, cost: number, profit: number, profitMargin: number }}
 */
function calculateSaleProfitMargin(sale, saleItems = [], productsById = new Map()) {
  const revenue = toNumber(sale?.total, 0);
  let cost = 0;
  for (const item of saleItems) {
    const qty = toNumber(item.quantity, 0);
    const product = item.productId ? productsById.get(item.productId) : null;
    const unitCost = toNumber(
      item.metadata?.costPrice ?? product?.costPrice,
      0
    );
    cost += qty * unitCost;
  }
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cost, profit, profitMargin };
}

function customerContext(customer, rule, subjectKey, message, stats = {}) {
  return {
    subjectKey,
    customerId: customer.id,
    customerName: customer.name || customer.company || 'Customer',
    email: customer.email || null,
    phone: customer.phone || null,
    dateOfBirth: customer.dateOfBirth || null,
    customerHasPhone: Boolean(customer.phone),
    customerHasEmail: Boolean(customer.email),
    whatsappConsent: customer.whatsappConsent === true,
    smsConsent: customer.smsConsent === true,
    marketingConsent: customer.marketingConsent === true,
    lastPurchaseAt: stats.lastPurchaseAt || null,
    lastPurchaseDaysAgo: stats.lastPurchaseDaysAgo,
    totalSpend: toNumber(stats.totalSpend, 0),
    customer: {
      id: customer.id,
      name: customer.name || null,
      company: customer.company || null,
      email: customer.email || null,
      phone: customer.phone || null,
      dateOfBirth: customer.dateOfBirth || null,
      shopId: customer.shopId || null,
      studioLocationId: customer.studioLocationId || null,
      whatsappConsent: customer.whatsappConsent === true,
      smsConsent: customer.smsConsent === true,
      marketingConsent: customer.marketingConsent === true
    },
    shopId: customer.shopId || null,
    studioLocationId: customer.studioLocationId || null,
    message
  };
}

async function finalizeTriggerContexts(tenantId, contexts) {
  return Promise.all((contexts || []).map((context) => enrichTriggerContextWithBusinessName(tenantId, context)));
}

async function getTriggerContextsForRule(rule, now = new Date()) {
  const tenantId = rule.tenantId;
  const triggerConfig = rule.triggerConfig || {};
  const triggerType = rule.triggerType;

  if (triggerType === 'invoice_due_in_days') {
    const daysBeforeDue = toNumber(triggerConfig.daysBeforeDue, 0);
    const target = addDays(now, daysBeforeDue);
    const invoices = await Invoice.findAll({
      where: {
        tenantId,
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balance: { [Op.gt]: 0 },
        dueDate: { [Op.between]: [startOfDay(target), endOfDay(target)] },
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule)
      },
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'phone', 'email', 'whatsappConsent', 'smsConsent', 'marketingConsent'] }],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['dueDate', 'ASC']]
    });
    const overdueCustomerIds = await overdueInvoiceCustomerIds(tenantId, invoices.map((invoice) => invoice.customerId), now);
    return finalizeTriggerContexts(tenantId, invoices.map((invoice) => invoiceContext(invoice, rule, 'invoice_due', now, {
      hasOverdueInvoices: overdueCustomerIds.has(invoice.customerId)
    })));
  }

  if (triggerType === 'invoice_overdue' || triggerType === 'invoice_overdue_staff') {
    const daysAfterDue = toNumber(triggerConfig.daysAfterDue, 0);
    const cutoff = endOfDay(addDays(now, -daysAfterDue));
    const invoices = await Invoice.findAll({
      where: {
        tenantId,
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balance: { [Op.gt]: 0 },
        dueDate: { [Op.lte]: cutoff },
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule)
      },
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'phone', 'email', 'whatsappConsent', 'smsConsent', 'marketingConsent'] }],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['dueDate', 'ASC']]
    });
    const overdueCustomerIds = await overdueInvoiceCustomerIds(tenantId, invoices.map((invoice) => invoice.customerId), now);
    const kind = triggerType === 'invoice_overdue_staff' ? 'invoice_overdue_staff' : 'invoice_overdue';
    return finalizeTriggerContexts(tenantId, invoices.map((invoice) => {
      const ctx = invoiceContext(invoice, rule, kind, now, {
        hasOverdueInvoices: overdueCustomerIds.has(invoice.customerId)
      });
      if (triggerType === 'invoice_overdue_staff') {
        // Staff twin: keep customer fields as data placeholders, clear messaging contacts.
        return {
          ...ctx,
          subjectKey: `invoice_overdue_staff:${invoice.id}`,
          customerEmail: ctx.email || null,
          customerPhone: ctx.phone || null,
          email: null,
          phone: null,
        };
      }
      return ctx;
    }));
  }

  if (triggerType === 'low_stock_detected') {
    const mode = triggerConfig.thresholdMode === 'fixed' ? 'fixed' : 'reorder_level';
    const fixedThreshold = toNumber(triggerConfig.fixedThreshold, 0);
    const products = await Product.findAll({
      where: {
        tenantId,
        isActive: true,
        trackStock: { [Op.ne]: false },
        ...(mode === 'fixed'
          ? { quantityOnHand: { [Op.lte]: fixedThreshold } }
          : { reorderLevel: { [Op.gt]: 0 } }),
        ...shopBranchWhere(rule)
      },
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['updatedAt', 'DESC']]
    });
    return finalizeTriggerContexts(tenantId, products
      .filter((product) => mode === 'fixed' || toNumber(product.quantityOnHand, 0) <= toNumber(product.reorderLevel, 0))
      .map((product) => ({
      subjectKey: `low_stock:${product.id}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku || null,
      quantityOnHand: toNumber(product.quantityOnHand, 0),
      reorderLevel: toNumber(product.reorderLevel, 0),
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku || null,
        quantityOnHand: toNumber(product.quantityOnHand, 0),
        reorderLevel: toNumber(product.reorderLevel, 0),
        isActive: product.isActive !== false,
        shopId: product.shopId || null
      },
      shopId: product.shopId || null,
      message: `${product.name} is low on stock. Current stock: ${product.quantityOnHand}.`
    })));
  }

  if (triggerType === 'quote_no_response') {
    const silentDays = toNumber(triggerConfig.silentDays, 7);
    const cutoff = addDays(now, -silentDays);
    const quotes = await Quote.findAll({
      where: {
        tenantId,
        status: 'sent',
        updatedAt: { [Op.lte]: cutoff },
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule)
      },
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'phone', 'email', 'whatsappConsent', 'smsConsent', 'marketingConsent'] }],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['updatedAt', 'ASC']]
    });
    return finalizeTriggerContexts(tenantId, quotes.map((quote) => ({
      subjectKey: `quote_no_response:${quote.id}`,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerId: quote.customer?.id || quote.customerId,
      customerName: quote.customer?.name || quote.customer?.company || 'Customer',
      email: quote.customer?.email || null,
      phone: quote.customer?.phone || null,
      amount: toNumber(quote.totalAmount, 0),
      customerHasPhone: Boolean(quote.customer?.phone),
      customerHasEmail: Boolean(quote.customer?.email),
      whatsappConsent: quote.customer?.whatsappConsent === true,
      smsConsent: quote.customer?.smsConsent === true,
      marketingConsent: quote.customer?.marketingConsent === true,
      customer: {
        id: quote.customer?.id || quote.customerId,
        name: quote.customer?.name || null,
        company: quote.customer?.company || null,
        email: quote.customer?.email || null,
        phone: quote.customer?.phone || null,
        whatsappConsent: quote.customer?.whatsappConsent === true,
        smsConsent: quote.customer?.smsConsent === true,
        marketingConsent: quote.customer?.marketingConsent === true
      },
      shopId: quote.shopId || null,
      studioLocationId: quote.studioLocationId || null,
      quote: {
        id: quote.id,
        shopId: quote.shopId || null,
        studioLocationId: quote.studioLocationId || null
      },
      message: `Quote ${quote.quoteNumber || quote.id} has not received a response.`
    })));
  }

  if (triggerType === 'customer_inactive_days') {
    const inactiveDays = toNumber(triggerConfig.inactiveDays, 30);
    const cutoff = addDays(now, -inactiveDays);
    const customers = await Customer.findAll({
      where: {
        tenantId,
        isActive: true,
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule)
      },
      limit: MAX_SUBJECTS_PER_RULE * 3,
      order: [['updatedAt', 'ASC']]
    });
    const lastActivityByCustomer = await lastActivityAtForCustomers(
      tenantId,
      customers.map((customer) => customer.id)
    );
    const inactiveCustomers = customers.filter((customer) => {
      const lastActivity = lastActivityByCustomer.get(customer.id);
      const reference = lastActivity || customer.updatedAt || customer.createdAt;
      return reference && new Date(reference) <= cutoff;
    }).slice(0, MAX_SUBJECTS_PER_RULE);
    const statsByCustomer = await saleStatsForCustomers(tenantId, inactiveCustomers.map((customer) => customer.id), now);
    return finalizeTriggerContexts(tenantId, inactiveCustomers.map((customer) => {
      const lastActivity = lastActivityByCustomer.get(customer.id);
      const lastPurchaseDaysAgo = lastActivity ? daysBetween(lastActivity, now) : daysBetween(customer.updatedAt || customer.createdAt, now);
      const stats = {
        ...(statsByCustomer.get(customer.id) || {}),
        lastPurchaseAt: lastActivity || statsByCustomer.get(customer.id)?.lastPurchaseAt || null,
        lastPurchaseDaysAgo,
      };
      return customerContext(
        customer,
        rule,
        `customer_inactive:${customer.id}`,
        `${customer.name || 'Customer'} has been inactive for ${inactiveDays} days.`,
        stats
      );
    }));
  }

  if (triggerType === 'customer_birthday') {
    const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const customers = await Customer.findAll({
      where: {
        tenantId,
        isActive: true,
        dateOfBirth: { [Op.ne]: null },
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule),
        [Op.and]: [
          sequelizeWhere(fn('to_char', col('dateOfBirth'), 'MM-DD'), monthDay)
        ]
      },
      attributes: ['id', 'name', 'company', 'phone', 'email', 'dateOfBirth', 'shopId', 'studioLocationId', 'whatsappConsent', 'smsConsent', 'marketingConsent'],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['updatedAt', 'ASC']]
    });
    const statsByCustomer = await saleStatsForCustomers(tenantId, customers.map((customer) => customer.id), now);
    return finalizeTriggerContexts(tenantId, customers.map((customer) => customerContext(
      customer,
      rule,
      `customer_birthday:${customer.id}:${now.getFullYear()}`,
      `Happy birthday, ${customer.name || 'Customer'}!`,
      statsByCustomer.get(customer.id) || {}
    )));
  }

  if (triggerType === 'daily_sales_summary') {
    const period = triggerConfig.summaryPeriod === 'today' ? 'today' : 'yesterday';
    const periodStart = period === 'today' ? startOfDay(now) : startOfDay(addDays(now, -1));
    const periodEnd = period === 'today' ? endOfDay(now) : endOfDay(addDays(now, -1));
    const context = await buildDailySalesSummaryContext(tenantId, {
      periodStart,
      periodEnd,
      periodLabel: period,
      now,
      shopId: rule.shopId || null,
    });
    return finalizeTriggerContexts(tenantId, [context]);
  }

  if (triggerType === 'lead_no_contact_days') {
    const noContactDays = toNumber(triggerConfig.noContactDays, 3);
    const cutoff = addDays(now, -noContactDays);
    const leads = await Lead.findAll({
      where: {
        tenantId,
        isActive: true,
        status: { [Op.in]: ['new', 'contacted', 'qualified'] },
        [Op.or]: [
          { lastContactedAt: { [Op.lte]: cutoff } },
          { lastContactedAt: null, createdAt: { [Op.lte]: cutoff } },
        ],
        ...shopBranchWhere(rule),
        ...studioBranchWhere(rule)
      },
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['updatedAt', 'ASC']],
    });
    return finalizeTriggerContexts(tenantId, leads.map((lead) => ({
      subjectKey: `lead_no_contact:${lead.id}`,
      leadId: lead.id,
      leadName: lead.name,
      leadCompany: lead.company || lead.name,
      leadSource: lead.source || 'unknown',
      customerName: lead.name,
      email: lead.email || null,
      phone: lead.phone || null,
      noContactDays,
      customerHasPhone: Boolean(lead.phone),
      customerHasEmail: Boolean(lead.email),
      shopId: lead.shopId || null,
      studioLocationId: lead.studioLocationId || null,
      message: `Lead ${lead.name} has had no contact for ${noContactDays} days.`,
    })));
  }

  if (triggerType === 'job_due_in_hours') {
    const hoursBeforeDue = toNumber(triggerConfig.hoursBeforeDue, 24);
    const windowEnd = new Date(now.getTime() + hoursBeforeDue * 60 * 60 * 1000);
    const jobs = await Job.findAll({
      where: {
        tenantId,
        dueDate: { [Op.between]: [now, windowEnd] },
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        assignedTo: { [Op.ne]: null },
        ...studioBranchWhere(rule)
      },
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'company'], required: false },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'], required: true },
      ],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['dueDate', 'ASC']],
    });
    return finalizeTriggerContexts(tenantId, jobs.map((job) => {
      const customer = job.customer || {};
      const assignee = job.assignedUser || {};
      const customerName = customer.name || customer.company || 'Customer';
      const dueDate = formatAutomationDate(job.dueDate);
      return {
        subjectKey: `job_due:${job.id}:${dueDate}`,
        jobId: job.id,
        jobNumber: job.jobNumber || null,
        jobTitle: job.title || null,
        dueDate,
        hoursBeforeDue,
        customerId: customer.id || job.customerId || null,
        customerName,
        assigneeId: assignee.id || job.assignedTo,
        assigneeName: assignee.name || 'Team member',
        email: assignee.email || null,
        recipientName: assignee.name || null,
        shopId: job.shopId || null,
        studioLocationId: job.studioLocationId || null,
        message: `Job ${job.jobNumber || job.id} for ${customerName} is due on ${dueDate}.`,
      };
    }));
  }

  if (triggerType === 'prescription_refill_due') {
    const daysBeforeDue = toNumber(triggerConfig.daysBeforeDue, 3);
    const windowEnd = endOfDay(addDays(now, daysBeforeDue));
    // Pharmacy branches are modeled as Shop rows; Prescription has no shopId of its own,
    // so branch scope is inferred from the linked customer's shopId.
    const prescriptions = await Prescription.findAll({
      where: {
        tenantId,
        status: { [Op.in]: ['filled', 'partially_filled'] },
      },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'company', 'phone', 'email', 'shopId', 'whatsappConsent', 'smsConsent', 'marketingConsent'],
          ...(rule.shopId ? { where: { shopId: rule.shopId }, required: true } : {}),
        },
        { model: PrescriptionItem, as: 'items', attributes: ['id', 'duration', 'drugName'] },
      ],
      limit: MAX_SUBJECTS_PER_RULE,
      order: [['filledAt', 'ASC']],
    });
    const contexts = [];
    for (const prescription of prescriptions) {
      const refillDueDate = getPrescriptionRefillDueDate(prescription, prescription.items || []);
      if (!refillDueDate) continue;
      if (refillDueDate < startOfDay(now) || refillDueDate > windowEnd) continue;
      const customer = prescription.customer || {};
      contexts.push({
        subjectKey: `prescription_refill:${prescription.id}:${formatAutomationDate(refillDueDate)}`,
        prescriptionId: prescription.id,
        prescriptionNumber: prescription.prescriptionNumber,
        refillDueDate: formatAutomationDate(refillDueDate),
        daysBeforeDue,
        customerId: customer.id || prescription.customerId,
        customerName: customer.name || customer.company || 'Customer',
        email: customer.email || null,
        phone: customer.phone || null,
        customerHasPhone: Boolean(customer.phone),
        customerHasEmail: Boolean(customer.email),
        whatsappConsent: customer.whatsappConsent === true,
        smsConsent: customer.smsConsent === true,
        marketingConsent: customer.marketingConsent === true,
        shopId: customer.shopId || null,
        message: `Prescription ${prescription.prescriptionNumber} refill is due on ${formatAutomationDate(refillDueDate)}.`,
      });
    }
    return finalizeTriggerContexts(tenantId, contexts);
  }

  return [];
}

/**
 * Execute enabled automation rules for an event-driven trigger.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.triggerType
 * @param {object} params.triggerContext
 * @param {string|null} [params.actorUserId]
 * @param {object} [params.options]
 * @returns {Promise<{ rulesChecked: number, executed: number, skipped: number, failed: number }>}
 */
async function executeMatchingRules({
  tenantId,
  triggerType,
  triggerContext = {},
  actorUserId = null,
  options = {},
}) {
  const rules = await AutomationRule.findAll({
    where: { tenantId, enabled: true, triggerType },
    order: [['updatedAt', 'ASC']],
  });
  const enrichedContext = await enrichTriggerContextWithBusinessName(tenantId, {
    ...triggerContext,
    triggerType,
    scheduler: false,
  });
  const summary = { rulesChecked: rules.length, executed: 0, skipped: 0, failed: 0, delayed: 0 };

  for (const rule of rules) {
    if (!ruleMatchesContextBranch(rule, enrichedContext)) {
      summary.skipped += 1;
      continue;
    }
    const result = await executeRule({
      rule,
      tenantId,
      triggerContext: enrichedContext,
      actorUserId,
      options,
    });
    if (result.delayed) summary.delayed += 1;
    else if (result.skipped) summary.skipped += 1;
    else if (result.success) summary.executed += 1;
    else summary.failed += 1;
  }

  return summary;
}

/**
 * Run payment-received automations after an invoice payment is recorded.
 * @param {object} params
 * @returns {Promise<object>}
 */
async function runPaymentReceivedAutomations({
  tenantId,
  invoice,
  customer = null,
  payment = null,
  paymentAmount = null,
  paymentMethod = null,
  actorUserId = null,
}) {
  if (!tenantId || !invoice || toNumber(paymentAmount ?? payment?.amount, 0) <= 0) {
    return { skipped: true, reason: 'missing_payment' };
  }

  const triggerContext = buildPaymentReceivedTriggerContext({
    invoice,
    customer: customer || invoice.customer || null,
    payment,
    paymentAmount,
    paymentMethod,
  });

  const customerSummary = await executeMatchingRules({
    tenantId,
    triggerType: 'payment_received',
    triggerContext,
    actorUserId,
  });

  const staffContext = {
    ...triggerContext,
    subjectKey: `payment_received_staff:${invoice.id}:${payment?.id || payment?.paymentNumber || Date.now()}`,
    customerEmail: triggerContext.email || null,
    customerPhone: triggerContext.phone || null,
    email: null,
    phone: null,
  };

  const staffSummary = await executeMatchingRules({
    tenantId,
    triggerType: 'payment_received_staff',
    triggerContext: staffContext,
    actorUserId,
  });

  const balance = toNumber(invoice?.balance, 0);
  const isFullyPaid = balance <= 0 || invoice?.status === 'paid';
  let invoicePaidSummary = { skipped: true, reason: 'not_fully_paid' };
  if (isFullyPaid) {
    invoicePaidSummary = await executeMatchingRules({
      tenantId,
      triggerType: 'invoice_paid_staff',
      triggerContext: {
        ...staffContext,
        subjectKey: `invoice_paid_staff:${invoice.id}`,
        totalAmountFormatted: whatsappTemplates.formatCurrency(
          toNumber(invoice.totalAmount, triggerContext.totalAmount)
        ),
        message: `Invoice ${invoice.invoiceNumber || invoice.id} is fully paid.`,
      },
      actorUserId,
    });
  }

  return {
    payment_received: customerSummary,
    payment_received_staff: staffSummary,
    invoice_paid_staff: invoicePaidSummary,
  };
}

/**
 * Build trigger context when a review request should be sent after service or sale completion.
 * @param {object} params
 * @param {'job'|'sale'|'invoice'} params.sourceType
 * @param {object} params.source
 * @param {object} [params.customer]
 * @param {string|null} [params.reviewLink]
 * @param {string|null} [params.reviewSlug]
 * @returns {object}
 */
function buildReviewRequestTriggerContext({
  sourceType,
  source,
  customer = null,
  reviewLink = null,
  reviewSlug = null,
}) {
  const customerObj = customer || source?.customer || {};
  const customerId = customerObj.id || source?.customerId || null;
  const resolvedReviewLink = reviewLink || '';
  let sourceId = source?.id || null;
  let sourceNumber = null;
  let jobNumber = null;
  let saleNumber = null;
  let invoiceNumber = null;

  if (sourceType === 'job') {
    jobNumber = source?.jobNumber || null;
    sourceNumber = jobNumber;
  } else if (sourceType === 'sale') {
    saleNumber = source?.saleNumber || null;
    sourceNumber = saleNumber;
  } else if (sourceType === 'invoice') {
    invoiceNumber = source?.invoiceNumber || null;
    sourceNumber = invoiceNumber;
  }

  const subjectKey = customerId
    ? `review_request:customer:${customerId}:${sourceType}:${sourceId}`
    : `review_request:${sourceType}:${sourceId}`;

  return {
    subjectKey,
    sourceType,
    sourceId,
    sourceNumber,
    jobId: sourceType === 'job' ? sourceId : source?.jobId || null,
    jobNumber,
    saleId: sourceType === 'sale' ? sourceId : source?.saleId || null,
    saleNumber,
    invoiceId: sourceType === 'invoice' ? sourceId : source?.invoiceId || null,
    invoiceNumber,
    customerId,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    reviewLink: resolvedReviewLink,
    reviewUrl: resolvedReviewLink,
    reviewSlug: reviewSlug || null,
    hasReviewLink: Boolean(resolvedReviewLink),
    amount: toNumber(source?.total ?? source?.totalAmount, 0),
    totalAmount: toNumber(source?.total ?? source?.totalAmount, 0),
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    customer: {
      id: customerId,
      name: customerObj.name || null,
      company: customerObj.company || null,
      email: customerObj.email || null,
      phone: customerObj.phone || null,
      shopId: customerObj.shopId || null,
      studioLocationId: customerObj.studioLocationId || null,
      whatsappConsent: customerObj.whatsappConsent === true,
      smsConsent: customerObj.smsConsent === true,
      marketingConsent: customerObj.marketingConsent === true,
    },
    shopId: source?.shopId || customerObj.shopId || null,
    studioLocationId: source?.studioLocationId || customerObj.studioLocationId || null,
    message: resolvedReviewLink
      ? `We would love your feedback! Leave a review: ${resolvedReviewLink}`
      : 'We would love your feedback! Leave us a review when you have a moment.',
  };
}

/**
 * Run review-request automations after a qualifying completion or payment event.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {'job'|'sale'|'invoice'} params.sourceType
 * @param {object} params.source
 * @param {object} [params.customer]
 * @param {string|null} [params.actorUserId]
 * @returns {Promise<object>}
 */
async function runReviewRequestAutomations({
  tenantId,
  sourceType,
  source,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !source?.id || !sourceType) {
    return { skipped: true, reason: 'missing_source' };
  }

  const customerObj = customer || source.customer || null;
  const customerId = customerObj?.id || source.customerId || null;
  if (!customerId) {
    return { skipped: true, reason: 'missing_customer' };
  }

  const reviewMeta = await getTenantReviewLink(tenantId);
  const triggerContext = buildReviewRequestTriggerContext({
    sourceType,
    source,
    customer: customerObj,
    reviewLink: reviewMeta.reviewLink,
    reviewSlug: reviewMeta.reviewSlug,
  });

  const summary = await executeMatchingRules({
    tenantId,
    triggerType: 'review_request',
    triggerContext,
    actorUserId,
  });

  return { ...summary, hasReviewLink: reviewMeta.hasReviewLink };
}

function trackingLinkForJob(jobId, viewToken) {
  if (!viewToken) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/track-job/${viewToken}`;
}

/**
 * Build trigger context when a job is marked completed.
 * @param {object} params
 * @param {object} params.job
 * @param {object} [params.customer]
 * @param {string|null} [params.trackingLink]
 * @param {string|null} [params.jobTitle]
 * @returns {object}
 */
function buildJobCompletedTriggerContext({
  job,
  customer = null,
  trackingLink = null,
  jobTitle = null,
}) {
  const customerObj = customer || job?.customer || {};
  const resolvedJobTitle = jobTitle || job?.title || job?.description || null;
  const resolvedTrackingLink = trackingLink || null;
  const trackingLinkLine = resolvedTrackingLink
    ? `Track your order: ${resolvedTrackingLink}`
    : '';

  return {
    subjectKey: `job_completed:${job.id}`,
    jobId: job.id,
    jobNumber: job.jobNumber || null,
    jobTitle: resolvedJobTitle,
    customerId: customerObj.id || job.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    trackingLink: resolvedTrackingLink,
    trackingUrl: resolvedTrackingLink,
    trackingLinkLine,
    hasTrackingLink: Boolean(resolvedTrackingLink),
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    customer: {
      id: customerObj.id || job.customerId || null,
      name: customerObj.name || null,
      company: customerObj.company || null,
      email: customerObj.email || null,
      phone: customerObj.phone || null,
      shopId: customerObj.shopId || null,
      studioLocationId: customerObj.studioLocationId || null,
      whatsappConsent: customerObj.whatsappConsent === true,
      smsConsent: customerObj.smsConsent === true,
      marketingConsent: customerObj.marketingConsent === true,
    },
    shopId: job.shopId || customerObj.shopId || null,
    studioLocationId: job.studioLocationId || customerObj.studioLocationId || null,
    job: {
      id: job.id,
      jobNumber: job.jobNumber || null,
      title: resolvedJobTitle,
      shopId: job.shopId || null,
      studioLocationId: job.studioLocationId || null,
    },
    message: resolvedTrackingLink
      ? `Job ${job.jobNumber || job.id} is complete. Track here: ${resolvedTrackingLink}`
      : `Job ${job.jobNumber || job.id} is complete.`,
  };
}

/**
 * Build trigger context when a job is created (tracking notifications).
 * @param {object} params
 * @returns {object}
 */
function buildJobCreatedTriggerContext({
  job,
  customer = null,
  trackingLink = null,
  jobTitle = null,
}) {
  const customerObj = customer || job?.customer || {};
  const resolvedJobTitle = jobTitle || job?.title || job?.description || null;
  const resolvedTrackingLink = trackingLink || null;
  const trackingLinkLine = resolvedTrackingLink
    ? `Track your order: ${resolvedTrackingLink}`
    : '';

  return {
    subjectKey: `job_created:${job.id}`,
    jobId: job.id,
    jobNumber: job.jobNumber || null,
    jobTitle: resolvedJobTitle,
    customerId: customerObj.id || job.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    trackingLink: resolvedTrackingLink,
    trackingUrl: resolvedTrackingLink,
    trackingLinkLine,
    hasTrackingLink: Boolean(resolvedTrackingLink),
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    customer: {
      id: customerObj.id || job.customerId || null,
      name: customerObj.name || null,
      company: customerObj.company || null,
      email: customerObj.email || null,
      phone: customerObj.phone || null,
      shopId: customerObj.shopId || null,
      studioLocationId: customerObj.studioLocationId || null,
      whatsappConsent: customerObj.whatsappConsent === true,
      smsConsent: customerObj.smsConsent === true,
      marketingConsent: customerObj.marketingConsent === true,
    },
    shopId: job.shopId || customerObj.shopId || null,
    studioLocationId: job.studioLocationId || customerObj.studioLocationId || null,
    job: {
      id: job.id,
      jobNumber: job.jobNumber || null,
      title: resolvedJobTitle,
      shopId: job.shopId || null,
      studioLocationId: job.studioLocationId || null,
    },
    message: resolvedTrackingLink
      ? `Job ${job.jobNumber || job.id} created. Track here: ${resolvedTrackingLink}`
      : `Job ${job.jobNumber || job.id} created.`,
  };
}

/**
 * Run job-created customer notification automations (tracking email/SMS).
 * @param {object} params
 * @returns {Promise<object>}
 */
async function runJobCreatedAutomations({
  tenantId,
  job,
  jobId = null,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId) return { skipped: true, reason: 'missing_tenant' };

  let resolvedJob = job;
  let trackingLink = null;
  if (!resolvedJob?.id && jobId) {
    const { loadJobTrackingNotificationContext } = require('./jobCustomerTrackingService');
    const ctx = await loadJobTrackingNotificationContext(tenantId, jobId);
    resolvedJob = ctx.job;
    trackingLink = ctx.trackUrl;
  }

  if (!resolvedJob?.id) return { skipped: true, reason: 'missing_job' };

  if (!trackingLink) {
    try {
      const { ensureJobViewToken } = require('./jobCustomerTrackingService');
      const viewToken = await ensureJobViewToken(resolvedJob.id, tenantId);
      trackingLink = trackingLinkForJob(resolvedJob.id, viewToken);
    } catch (_error) {
      trackingLink = null;
    }
  }

  let jobTitle = resolvedJob.title || null;
  try {
    const { buildCustomerFacingJobTitle } = require('../utils/jobCustomerMessageText');
    jobTitle = buildCustomerFacingJobTitle(
      typeof resolvedJob?.toJSON === 'function' ? resolvedJob.toJSON() : resolvedJob
    );
  } catch (_error) {
    jobTitle = resolvedJob.title || null;
  }

  return executeMatchingRules({
    tenantId,
    triggerType: 'job_created',
    triggerContext: buildJobCreatedTriggerContext({
      job: resolvedJob,
      customer: customer || resolvedJob.customer || null,
      trackingLink,
      jobTitle,
    }),
    actorUserId,
  });
}

async function runJobCompletedAutomations({
  tenantId,
  job,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !job?.id) {
    return { skipped: true, reason: 'missing_job' };
  }

  const customerObj = customer || job.customer || null;
  if (!customerObj?.id && !job.customerId) {
    return { skipped: true, reason: 'missing_customer' };
  }

  let trackingLink = null;
  try {
    const { ensureJobViewToken } = require('./jobCustomerTrackingService');
    const viewToken = await ensureJobViewToken(job.id, tenantId);
    trackingLink = trackingLinkForJob(job.id, viewToken);
  } catch (_error) {
    trackingLink = null;
  }

  let jobTitle = job.title || null;
  try {
    const { buildCustomerFacingJobTitle } = require('../utils/jobCustomerMessageText');
    jobTitle = buildCustomerFacingJobTitle(typeof job?.toJSON === 'function' ? job.toJSON() : job);
  } catch (_error) {
    jobTitle = job.title || null;
  }

  const triggerContext = buildJobCompletedTriggerContext({
    job,
    customer: customerObj,
    trackingLink,
    jobTitle,
  });

  return executeMatchingRules({
    tenantId,
    triggerType: 'job_completed',
    triggerContext,
    actorUserId,
  });
}

/**
 * Resolve workspace/business email for internal automation notifications.
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
async function getTenantBusinessEmail(tenantId) {
  if (!tenantId) return null;
  const { organization } = await loadTenantOrganization(tenantId);
  return organization?.email || null;
}

/**
 * Build trigger context for a daily sales summary scheduler run.
 * @param {string} tenantId
 * @param {object} params
 * @param {Date} params.periodStart
 * @param {Date} params.periodEnd
 * @param {'today'|'yesterday'} params.periodLabel
 * @param {Date} [params.now]
 * @returns {Promise<object>}
 */
async function buildDailySalesSummaryContext(tenantId, {
  periodStart,
  periodEnd,
  periodLabel = 'yesterday',
  now = new Date(),
  shopId = null,
}) {
  const dateKey = formatAutomationDate(periodEnd);
  const salesWhere = {
    tenantId,
    status: { [Op.notIn]: ['cancelled', 'refunded'] },
    createdAt: { [Op.between]: [periodStart, periodEnd] },
    ...(shopId ? { shopId } : {}),
  };

  const salesAgg = await Sale.findOne({
    where: salesWhere,
    attributes: [
      [fn('COUNT', col('id')), 'transactionCount'],
      [fn('SUM', col('total')), 'totalSales'],
    ],
    raw: true,
  });

  const transactionCount = toNumber(salesAgg?.transactionCount, 0);
  const totalSales = toNumber(salesAgg?.totalSales, 0);

  const saleRows = await Sale.findAll({
    where: salesWhere,
    attributes: ['id'],
    raw: true,
    limit: MAX_SUBJECTS_PER_RULE,
  });
  const saleIds = saleRows.map((row) => row.id).filter(Boolean);

  let topProducts = 'None';
  if (saleIds.length) {
    const topRows = await SaleItem.findAll({
      where: { saleId: { [Op.in]: saleIds } },
      attributes: [
        'name',
        [fn('SUM', col('quantity')), 'qty'],
        [fn('SUM', col('total')), 'revenue'],
      ],
      group: ['name'],
      order: [[fn('SUM', col('total')), 'DESC']],
      limit: 5,
      raw: true,
    });
    topProducts = topRows.length
      ? topRows.map((row) => `${row.name} (${whatsappTemplates.formatCurrency(row.revenue)})`).join(', ')
      : 'None';
  }

  const businessEmail = await getTenantBusinessEmail(tenantId);
  const formattedTotal = whatsappTemplates.formatCurrency(totalSales);
  const periodText = periodLabel === 'today' ? 'today' : 'yesterday';

  return {
    subjectKey: `daily_sales_summary:${dateKey}`,
    date: dateKey,
    summaryDate: dateKey,
    periodLabel: periodText,
    totalSales,
    totalSalesFormatted: formattedTotal,
    transactionCount,
    topProducts,
    email: businessEmail,
    customerHasEmail: Boolean(businessEmail),
    message: `Daily sales summary for ${dateKey}: ${formattedTotal} from ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}. Top products: ${topProducts}.`,
    scheduler: true,
    triggerType: 'daily_sales_summary',
  };
}

function quoteLinkForQuote(quote) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return quote.viewToken
    ? `${frontendUrl}/view-quote/${quote.viewToken}`
    : `${frontendUrl}/quotes/${quote.id}`;
}

function buildLeadTriggerContext(lead) {
  return {
    subjectKey: `new_lead:${lead.id}`,
    leadId: lead.id,
    leadName: lead.name,
    leadCompany: lead.company || lead.name,
    leadSource: lead.source || 'unknown',
    customerName: lead.name,
    // Lead contact stored separately — internal staff messaging must not use these as recipients.
    leadEmail: lead.email || null,
    leadPhone: lead.phone || null,
    email: null,
    phone: null,
    assigneeId: lead.assignedTo || lead.assigneeId || null,
    assigneeName: lead.assigneeName || null,
    customerHasPhone: Boolean(lead.phone),
    customerHasEmail: Boolean(lead.email),
    shopId: lead.shopId || null,
    studioLocationId: lead.studioLocationId || null,
    message: `New lead: ${lead.name} from ${lead.source || 'unknown'}.`,
  };
}

function buildCustomerCreatedTriggerContext(customer) {
  return {
    subjectKey: `customer_created:${customer.id}`,
    customerId: customer.id,
    customerName: customer.name || customer.company || 'Customer',
    email: customer.email || null,
    phone: customer.phone || null,
    dateOfBirth: customer.dateOfBirth || null,
    customerHasPhone: Boolean(customer.phone),
    customerHasEmail: Boolean(customer.email),
    whatsappConsent: customer.whatsappConsent === true,
    smsConsent: customer.smsConsent === true,
    marketingConsent: customer.marketingConsent === true,
    customer: {
      id: customer.id,
      name: customer.name || null,
      company: customer.company || null,
      email: customer.email || null,
      phone: customer.phone || null,
      shopId: customer.shopId || null,
      studioLocationId: customer.studioLocationId || null,
      whatsappConsent: customer.whatsappConsent === true,
      smsConsent: customer.smsConsent === true,
      marketingConsent: customer.marketingConsent === true,
    },
    shopId: customer.shopId || null,
    studioLocationId: customer.studioLocationId || null,
    message: `Welcome new customer ${customer.name || customer.company || 'Customer'}.`,
  };
}

function buildInvoiceSentTriggerContext(invoice, customer = null, paymentLink = null) {
  const base = invoiceContext(invoice, null, 'invoice_sent');
  const customerObj = customer || invoice.customer || {};
  const balance = toNumber(invoice.balance ?? invoice.totalAmount, 0);
  const totalAmount = toNumber(invoice.totalAmount, balance);
  return {
    ...base,
    subjectKey: `invoice_sent:${invoice.id}`,
    paymentLink: paymentLink || paymentLinkForInvoice(invoice),
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    customerName: customerObj.name || customerObj.company || base.customerName,
    email: customerObj.email || base.email,
    phone: customerObj.phone || base.phone,
    message: `Invoice ${invoice.invoiceNumber || invoice.id} has been sent.`,
  };
}

function buildHighValueInvoiceTriggerContext(invoice, customer = null) {
  const customerObj = customer || invoice.customer || {};
  const totalAmount = toNumber(invoice.totalAmount, 0);
  return {
    subjectKey: `high_value_invoice:${invoice.id}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: customerObj.id || invoice.customerId,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    balance: toNumber(invoice.balance, totalAmount),
    invoiceStatus: invoice.status || null,
    shopId: invoice.shopId || null,
    studioLocationId: invoice.studioLocationId || null,
    message: `High value invoice ${invoice.invoiceNumber || invoice.id}: ${whatsappTemplates.formatCurrency(totalAmount)}.`,
  };
}

function buildSaleCompletedTriggerContext(sale, customer = null) {
  const customerObj = customer || sale.customer || {};
  const totalAmount = toNumber(sale.total, 0);
  return {
    subjectKey: `sale_completed:${sale.id}`,
    saleId: sale.id,
    saleNumber: sale.saleNumber || null,
    customerId: customerObj.id || sale.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    shopId: sale.shopId || customerObj.shopId || null,
    studioLocationId: sale.studioLocationId || customerObj.studioLocationId || null,
    message: `Sale ${sale.saleNumber || sale.id} completed for ${whatsappTemplates.formatCurrency(totalAmount)}.`,
  };
}

/**
 * Build trigger context when a sale/order is created for a customer.
 * @param {object} params
 * @param {object} params.sale
 * @param {object|null} [params.customer]
 * @param {string|null} [params.trackingLink]
 * @returns {object}
 */
function buildOrderCreatedTriggerContext({
  sale,
  customer = null,
  trackingLink = null,
}) {
  const customerObj = customer || sale?.customer || {};
  const totalAmount = toNumber(sale?.total, 0);
  const orderNumber = sale?.saleNumber || String(sale?.id || '');
  const resolvedTrackingLink = trackingLink || null;
  const trackingLinkLine = resolvedTrackingLink
    ? `Track your order: ${resolvedTrackingLink}`
    : '';

  return {
    subjectKey: `order_created:${sale.id}`,
    saleId: sale.id,
    saleNumber: sale.saleNumber || null,
    orderNumber,
    orderId: sale.id,
    customerId: customerObj.id || sale.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    amountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    trackingLink: resolvedTrackingLink,
    trackingUrl: resolvedTrackingLink,
    trackingLinkLine,
    hasTrackingLink: Boolean(resolvedTrackingLink),
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    customer: {
      id: customerObj.id || sale.customerId || null,
      name: customerObj.name || null,
      company: customerObj.company || null,
      email: customerObj.email || null,
      phone: customerObj.phone || null,
      shopId: customerObj.shopId || null,
      studioLocationId: customerObj.studioLocationId || null,
      whatsappConsent: customerObj.whatsappConsent === true,
      smsConsent: customerObj.smsConsent === true,
      marketingConsent: customerObj.marketingConsent === true,
    },
    shopId: sale.shopId || customerObj.shopId || null,
    studioLocationId: sale.studioLocationId || customerObj.studioLocationId || null,
    sale: {
      id: sale.id,
      saleNumber: sale.saleNumber || null,
      shopId: sale.shopId || null,
      studioLocationId: sale.studioLocationId || null,
    },
    message: resolvedTrackingLink
      ? `Order ${orderNumber} created. Track here: ${resolvedTrackingLink}`
      : `Order ${orderNumber} created.`,
  };
}

function buildQuoteSentTriggerContext(quote, customer = null, quoteLink = null) {
  const customerObj = customer || quote.customer || {};
  const totalAmount = toNumber(quote.totalAmount, 0);
  const resolvedQuoteLink = quoteLink || quoteLinkForQuote(quote);
  return {
    subjectKey: `quote_sent:${quote.id}`,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    quoteTitle: quote.title || 'Your quote',
    quoteLink: resolvedQuoteLink,
    customerId: customerObj.id || quote.customerId,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    customerHasPhone: Boolean(customerObj.phone),
    customerHasEmail: Boolean(customerObj.email),
    whatsappConsent: customerObj.whatsappConsent === true,
    smsConsent: customerObj.smsConsent === true,
    marketingConsent: customerObj.marketingConsent === true,
    shopId: quote.shopId || null,
    studioLocationId: quote.studioLocationId || null,
    message: `Quote ${quote.quoteNumber || quote.id} sent to customer.`,
  };
}

function buildLowProfitMarginTriggerContext(sale, marginMeta, customer = null) {
  const customerObj = customer || sale.customer || {};
  const profitMargin = toNumber(marginMeta.profitMargin, 0);
  const totalAmount = toNumber(sale.total, 0);
  return {
    subjectKey: `low_profit_margin:${sale.id}`,
    saleId: sale.id,
    saleNumber: sale.saleNumber || null,
    customerId: customerObj.id || sale.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    email: customerObj.email || null,
    phone: customerObj.phone || null,
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    profitMargin,
    profitMarginFormatted: `${profitMargin.toFixed(1)}%`,
    minMarginPercent: null,
    revenue: toNumber(marginMeta.revenue, totalAmount),
    cost: toNumber(marginMeta.cost, 0),
    profit: toNumber(marginMeta.profit, 0),
    shopId: sale.shopId || null,
    message: `Sale ${sale.saleNumber || sale.id} margin is ${profitMargin.toFixed(1)}%.`,
  };
}

async function runNewLeadAutomations({ tenantId, lead, actorUserId = null }) {
  if (!tenantId || !lead?.id) return { skipped: true, reason: 'missing_lead' };
  const triggerContext = buildLeadTriggerContext(lead);
  const newLead = await executeMatchingRules({
    tenantId,
    triggerType: 'new_lead',
    triggerContext,
    actorUserId,
  });
  const newLeadStaff = await executeMatchingRules({
    tenantId,
    triggerType: 'new_lead_staff',
    triggerContext: {
      ...triggerContext,
      subjectKey: `new_lead_staff:${lead.id}`,
    },
    actorUserId,
  });
  return { new_lead: newLead, new_lead_staff: newLeadStaff };
}

async function runCustomerCreatedAutomations({ tenantId, customer, actorUserId = null }) {
  if (!tenantId || !customer?.id) return { skipped: true, reason: 'missing_customer' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'customer_created',
    triggerContext: buildCustomerCreatedTriggerContext(customer),
    actorUserId,
  });
}

async function runInvoiceSentAutomations({
  tenantId,
  invoice,
  customer = null,
  paymentLink = null,
  actorUserId = null,
}) {
  if (!tenantId || !invoice?.id) return { skipped: true, reason: 'missing_invoice' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'invoice_sent',
    triggerContext: buildInvoiceSentTriggerContext(invoice, customer, paymentLink),
    actorUserId,
  });
}

async function runHighValueInvoiceAutomations({
  tenantId,
  invoice,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !invoice?.id) return { skipped: true, reason: 'missing_invoice' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'high_value_invoice',
    triggerContext: buildHighValueInvoiceTriggerContext(invoice, customer),
    actorUserId,
  });
}

async function runSaleCompletedAutomations({
  tenantId,
  sale,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !sale?.id || sale.status !== 'completed') {
    return { skipped: true, reason: 'missing_or_incomplete_sale' };
  }
  return executeMatchingRules({
    tenantId,
    triggerType: 'sale_completed',
    triggerContext: buildSaleCompletedTriggerContext(sale, customer),
    actorUserId,
  });
}

/**
 * Run order-created customer notification automations (tracking SMS/email).
 * @param {object} params
 * @returns {Promise<object>}
 */
async function runOrderCreatedAutomations({
  tenantId,
  sale,
  customer = null,
  actorUserId = null,
  trackingLink = null,
}) {
  if (!tenantId || !sale?.id) {
    return { skipped: true, reason: 'missing_sale' };
  }

  const customerObj = customer || sale.customer || null;
  if (!customerObj && !sale.customerId) {
    return { skipped: true, reason: 'missing_customer' };
  }

  let resolvedTrackingLink = trackingLink || null;
  if (!resolvedTrackingLink) {
    try {
      const { resolveOrderTrackingLink } = require('../utils/orderTrackingLink');
      resolvedTrackingLink = await resolveOrderTrackingLink(tenantId, {
        orderNumber: sale.saleNumber || sale.id,
      });
    } catch (_error) {
      resolvedTrackingLink = null;
    }
  }

  return executeMatchingRules({
    tenantId,
    triggerType: 'order_created',
    triggerContext: buildOrderCreatedTriggerContext({
      sale,
      customer: customerObj,
      trackingLink: resolvedTrackingLink,
    }),
    actorUserId,
  });
}

async function runQuoteSentAutomations({
  tenantId,
  quote,
  customer = null,
  quoteLink = null,
  actorUserId = null,
}) {
  if (!tenantId || !quote?.id) return { skipped: true, reason: 'missing_quote' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'quote_sent',
    triggerContext: buildQuoteSentTriggerContext(quote, customer, quoteLink),
    actorUserId,
  });
}

async function runStockChangeAutomations({
  tenantId,
  product,
  stockEvent = 'low_stock_on_change',
  actorUserId = null,
}) {
  if (!tenantId || !product?.id) return { skipped: true, reason: 'missing_product' };
  if (product.trackStock === false) return { skipped: true, reason: 'stock_not_tracked' };

  const quantityOnHand = toNumber(product.quantityOnHand, 0);
  const reorderLevel = toNumber(product.reorderLevel, 0);
  let triggerType = stockEvent;
  if (stockEvent === 'auto') {
    if (quantityOnHand <= 0) triggerType = 'out_of_stock_detected';
    else if (quantityOnHand <= reorderLevel) triggerType = 'low_stock_on_change';
    else return { skipped: true, reason: 'stock_above_threshold' };
  }

  const subjectPrefix = triggerType === 'out_of_stock_detected' ? 'out_of_stock' : 'low_stock_on_change';
  return executeMatchingRules({
    tenantId,
    triggerType,
    triggerContext: productStockContext(product, subjectPrefix),
    actorUserId,
  });
}

async function runLowProfitMarginAutomations({
  tenantId,
  sale,
  saleItems = [],
  productsById = null,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !sale?.id) return { skipped: true, reason: 'missing_sale' };
  const marginMeta = calculateSaleProfitMargin(sale, saleItems, productsById || new Map());
  if (marginMeta.revenue <= 0) return { skipped: true, reason: 'no_revenue' };

  const rules = await AutomationRule.findAll({
    where: { tenantId, enabled: true, triggerType: 'low_profit_margin' },
  });
  if (!rules.length) return { skipped: true, reason: 'no_rules' };

  const triggerContext = buildLowProfitMarginTriggerContext(sale, marginMeta, customer);
  const summary = { rulesChecked: rules.length, executed: 0, skipped: 0, failed: 0 };

  for (const rule of rules) {
    if (!ruleMatchesContextBranch(rule, { shopId: sale.shopId || null })) {
      summary.skipped += 1;
      continue;
    }
    const minMargin = toNumber(rule.triggerConfig?.minMarginPercent, 15);
    if (marginMeta.profitMargin >= minMargin) {
      summary.skipped += 1;
      continue;
    }
    const result = await executeRule({
      rule,
      tenantId,
      triggerContext: {
        ...(await enrichTriggerContextWithBusinessName(tenantId, triggerContext)),
        minMarginPercent: minMargin,
        triggerType: 'low_profit_margin',
      },
      actorUserId,
    });
    if (result.skipped) summary.skipped += 1;
    else if (result.success) summary.executed += 1;
    else summary.failed += 1;
  }

  return summary;
}

async function runDueAutomations({ now = new Date(), limit = MAX_RULES_PER_TICK } = {}) {
  const rules = await AutomationRule.findAll({
    where: { enabled: true },
    include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name'] }],
    order: [['updatedAt', 'ASC']],
    limit
  });
  const summary = { rulesChecked: rules.length, executed: 0, skipped: 0, failed: 0 };

  for (const rule of rules) {
    const scheduleCheck = scheduleAllowsRun(rule, now);
    if (!scheduleCheck.allowed) {
      summary.skipped += 1;
      continue;
    }
    let contexts = [];
    try {
      contexts = await getTriggerContextsForRule(rule, now);
    } catch (error) {
      summary.failed += 1;
      await AutomationRun.create({
        tenantId: rule.tenantId,
        ruleId: rule.id,
        status: 'failed',
        triggerContext: { scheduler: true, triggerType: rule.triggerType },
        resultSummary: {},
        error: error?.message || 'trigger_evaluation_failed',
        startedAt: now,
        finishedAt: new Date()
      });
      continue;
    }

    for (const triggerContext of contexts) {
      // Belt-and-suspenders: most subject queries above already filter by the rule's
      // branch scope, but this guards trigger types (e.g. prescription refills, daily
      // sales summary) that don't push the filter into their query.
      if (!ruleMatchesContextBranch(rule, triggerContext)) {
        summary.skipped += 1;
        continue;
      }
      const result = await executeRule({
        rule,
        tenantId: rule.tenantId,
        triggerContext: { ...triggerContext, scheduler: true, triggerType: rule.triggerType },
        actorUserId: triggerContext.assigneeId || rule.createdBy || rule.updatedBy || null
      });
      if (result.skipped) summary.skipped += 1;
      else if (result.success) summary.executed += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Build staff-facing context when a job is assigned/reassigned.
 * @param {object} params
 * @returns {object}
 */
function buildJobAssignedStaffTriggerContext({
  job,
  assignee = null,
  customer = null,
  assignedByUser = null,
}) {
  const assigneeUser = assignee || job?.assignedUser || {};
  const customerObj = customer || job?.customer || {};
  const dueDate = job?.dueDate ? formatAutomationDate(job.dueDate) : null;
  return {
    subjectKey: `job_assigned_staff:${job.id}:${assigneeUser.id || job.assignedTo || 'none'}`,
    jobId: job.id,
    jobNumber: job.jobNumber || null,
    jobTitle: job.title || job.description || null,
    dueDate,
    customerId: customerObj.id || job.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    assigneeId: assigneeUser.id || job.assignedTo || null,
    assigneeName: assigneeUser.name || 'Team member',
    assignedByName: assignedByUser?.name || null,
    email: null,
    phone: null,
    shopId: job.shopId || null,
    studioLocationId: job.studioLocationId || null,
    message: `Job ${job.jobNumber || job.id} assigned to ${assigneeUser.name || 'team member'}.`,
  };
}

/**
 * Build staff-facing context when a quote is accepted.
 * @param {object} quote
 * @param {object|null} [customer]
 * @returns {object}
 */
function buildQuoteAcceptedStaffTriggerContext(quote, customer = null) {
  const customerObj = customer || quote?.customer || {};
  const totalAmount = toNumber(quote?.totalAmount, 0);
  return {
    subjectKey: `quote_accepted_staff:${quote.id}`,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber || null,
    quoteTitle: quote.title || 'Quote',
    customerId: customerObj.id || quote.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    amount: totalAmount,
    email: null,
    phone: null,
    shopId: quote.shopId || null,
    studioLocationId: quote.studioLocationId || null,
    message: `Quote ${quote.quoteNumber || quote.id} was accepted.`,
  };
}

/**
 * Build staff-facing context for order status changes.
 * @param {object} params
 * @returns {object}
 */
function buildOrderStatusStaffTriggerContext({
  sale,
  customer = null,
  orderStatus = null,
  previousStatus = null,
}) {
  const customerObj = customer || sale?.customer || {};
  const totalAmount = toNumber(sale?.total, 0);
  const orderNumber = sale?.saleNumber || String(sale?.id || '');
  const status = orderStatus || sale?.orderStatus || null;
  return {
    subjectKey: `order_status_staff:${sale.id}:${status || 'unknown'}`,
    saleId: sale.id,
    saleNumber: sale.saleNumber || null,
    orderNumber,
    orderStatus: status,
    previousStatus: previousStatus || null,
    customerId: customerObj.id || sale.customerId || null,
    customerName: customerObj.name || customerObj.company || 'Customer',
    totalAmount,
    totalAmountFormatted: whatsappTemplates.formatCurrency(totalAmount),
    email: null,
    phone: null,
    shopId: sale.shopId || null,
    studioLocationId: sale.studioLocationId || null,
    message: `Order ${orderNumber} is now ${status || 'updated'}.`,
  };
}

/**
 * Build staff-facing context when a lead is assigned.
 * @param {object} params
 * @returns {object}
 */
function buildLeadAssignedStaffTriggerContext({ lead, assignee = null }) {
  const base = buildLeadTriggerContext(lead);
  const assigneeUser = assignee || {};
  return {
    ...base,
    subjectKey: `lead_assigned_staff:${lead.id}:${assigneeUser.id || lead.assignedTo || 'none'}`,
    assigneeId: assigneeUser.id || lead.assignedTo || base.assigneeId || null,
    assigneeName: assigneeUser.name || base.assigneeName || 'Team member',
    email: null,
    phone: null,
    message: `Lead ${lead.name} assigned to ${assigneeUser.name || 'team member'}.`,
  };
}

async function runJobAssignedStaffAutomations({
  tenantId,
  job,
  assignee = null,
  customer = null,
  assignedByUser = null,
  actorUserId = null,
}) {
  if (!tenantId || !job?.id) return { skipped: true, reason: 'missing_job' };
  const assigneeUser = assignee || job.assignedUser || null;
  if (!assigneeUser?.id && !job.assignedTo) {
    return { skipped: true, reason: 'missing_assignee' };
  }
  return executeMatchingRules({
    tenantId,
    triggerType: 'job_assigned_staff',
    triggerContext: buildJobAssignedStaffTriggerContext({
      job,
      assignee: assigneeUser,
      customer: customer || job.customer || null,
      assignedByUser,
    }),
    actorUserId,
  });
}

async function runQuoteAcceptedStaffAutomations({
  tenantId,
  quote,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !quote?.id) return { skipped: true, reason: 'missing_quote' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'quote_accepted_staff',
    triggerContext: buildQuoteAcceptedStaffTriggerContext(quote, customer || quote.customer || null),
    actorUserId,
  });
}

async function runOrderCreatedStaffAutomations({
  tenantId,
  sale,
  customer = null,
  actorUserId = null,
  trackingLink = null,
}) {
  if (!tenantId || !sale?.id) return { skipped: true, reason: 'missing_sale' };
  const customerCtx = buildOrderCreatedTriggerContext({
    sale,
    customer: customer || sale.customer || null,
    trackingLink,
  });
  return executeMatchingRules({
    tenantId,
    triggerType: 'order_created_staff',
    triggerContext: {
      ...customerCtx,
      subjectKey: `order_created_staff:${sale.id}`,
      customerEmail: customerCtx.email || null,
      customerPhone: customerCtx.phone || null,
      email: null,
      phone: null,
    },
    actorUserId,
  });
}

async function runOrderStatusStaffAutomations({
  tenantId,
  sale,
  customer = null,
  orderStatus = null,
  previousStatus = null,
  actorUserId = null,
}) {
  if (!tenantId || !sale?.id) return { skipped: true, reason: 'missing_sale' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'order_status_staff',
    triggerContext: buildOrderStatusStaffTriggerContext({
      sale,
      customer: customer || sale.customer || null,
      orderStatus,
      previousStatus,
    }),
    actorUserId,
  });
}

async function runJobCreatedStaffAutomations({
  tenantId,
  job,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !job?.id) return { skipped: true, reason: 'missing_job' };
  const base = buildJobCreatedTriggerContext({ job, customer: customer || job.customer || null });
  return executeMatchingRules({
    tenantId,
    triggerType: 'job_created_staff',
    triggerContext: {
      ...base,
      subjectKey: `job_created_staff:${job.id}`,
      customerEmail: base.email || null,
      customerPhone: base.phone || null,
      email: null,
      phone: null,
      assigneeId: job.assignedTo || null,
    },
    actorUserId,
  });
}

async function runJobCompletedStaffAutomations({
  tenantId,
  job,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !job?.id) return { skipped: true, reason: 'missing_job' };
  const base = buildJobCompletedTriggerContext({ job, customer: customer || job.customer || null });
  return executeMatchingRules({
    tenantId,
    triggerType: 'job_completed_staff',
    triggerContext: {
      ...base,
      subjectKey: `job_completed_staff:${job.id}`,
      customerEmail: base.email || null,
      customerPhone: base.phone || null,
      email: null,
      phone: null,
      assigneeId: job.assignedTo || null,
    },
    actorUserId,
  });
}

async function runSaleCompletedStaffAutomations({
  tenantId,
  sale,
  customer = null,
  actorUserId = null,
}) {
  if (!tenantId || !sale?.id || sale.status !== 'completed') {
    return { skipped: true, reason: 'missing_or_incomplete_sale' };
  }
  const base = buildSaleCompletedTriggerContext(sale, customer);
  return executeMatchingRules({
    tenantId,
    triggerType: 'sale_completed_staff',
    triggerContext: {
      ...base,
      subjectKey: `sale_completed_staff:${sale.id}`,
      customerEmail: base.email || null,
      customerPhone: base.phone || null,
      email: null,
      phone: null,
    },
    actorUserId,
  });
}

async function runLeadAssignedStaffAutomations({
  tenantId,
  lead,
  assignee = null,
  actorUserId = null,
}) {
  if (!tenantId || !lead?.id) return { skipped: true, reason: 'missing_lead' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'lead_assigned_staff',
    triggerContext: buildLeadAssignedStaffTriggerContext({ lead, assignee }),
    actorUserId,
  });
}

/**
 * Build staff-facing context when a workspace task is assigned.
 * @param {object} params
 * @param {object} params.task
 * @param {object|null} [params.assignee]
 * @param {object|null} [params.assignedByUser]
 * @returns {object}
 */
function buildTaskAssignedStaffTriggerContext({
  task,
  assignee = null,
  assignedByUser = null,
}) {
  const assigneeUser = assignee || task?.assignee || {};
  const dueDate = task?.dueDate ? formatAutomationDate(task.dueDate) : 'No due date';
  const priority = task?.priority ? String(task.priority) : 'medium';
  const description = String(task?.description || '').trim();
  return {
    subjectKey: `task_assigned_staff:${task.id}:${assigneeUser.id || task.assigneeId || 'none'}`,
    taskId: task.id,
    taskTitle: task.title || 'Task',
    taskDescription: description || 'No description',
    taskPriority: priority,
    dueDate,
    assigneeId: assigneeUser.id || task.assigneeId || null,
    assigneeName: assigneeUser.name || 'Team member',
    assignedByName: assignedByUser?.name || assignedByUser?.email || 'A teammate',
    taskLink: '/workspace',
    email: null,
    phone: null,
    shopId: task.shopId || null,
    studioLocationId: task.studioLocationId || null,
    message: `Task "${task.title || task.id}" assigned to ${assigneeUser.name || 'team member'}.`,
  };
}

async function runTaskAssignedStaffAutomations({
  tenantId,
  task,
  assignee = null,
  assignedByUser = null,
  actorUserId = null,
}) {
  if (!tenantId || !task?.id) return { skipped: true, reason: 'missing_task' };
  const assigneeId = assignee?.id || task.assigneeId || null;
  if (!assigneeId) return { skipped: true, reason: 'missing_assignee' };
  return executeMatchingRules({
    tenantId,
    triggerType: 'task_assigned_staff',
    triggerContext: buildTaskAssignedStaffTriggerContext({
      task,
      assignee,
      assignedByUser,
    }),
    actorUserId,
  });
}

module.exports = {
  DEDUPE_WINDOW_HOURS,
  STICKY_TRIGGER_TYPES,
  FREQUENCY_COOLDOWN_HOURS,
  DEFAULT_REVIEW_REQUEST_DELAY_MINUTES,
  MAX_DELAYED_RUNS_PER_TICK,
  getTemplates,
  getTemplateByKey,
  filterTemplatesForTenant,
  isTriggerAllowedForTenant,
  executeRule,
  executeMatchingRules,
  enqueueDelayedRun,
  processDueDelayedRuns,
  getDelayMinutes,
  buildPaymentReceivedTriggerContext,
  buildReviewRequestTriggerContext,
  buildJobCreatedTriggerContext,
  buildJobCompletedTriggerContext,
  buildJobAssignedStaffTriggerContext,
  buildQuoteAcceptedStaffTriggerContext,
  buildOrderStatusStaffTriggerContext,
  buildLeadAssignedStaffTriggerContext,
  buildTaskAssignedStaffTriggerContext,
  buildDailySalesSummaryContext,
  buildLeadTriggerContext,
  buildCustomerCreatedTriggerContext,
  buildInvoiceSentTriggerContext,
  buildHighValueInvoiceTriggerContext,
  buildSaleCompletedTriggerContext,
  buildOrderCreatedTriggerContext,
  buildQuoteSentTriggerContext,
  buildLowProfitMarginTriggerContext,
  calculateSaleProfitMargin,
  productStockContext,
  getTenantReviewLink,
  getTenantBusinessEmail,
  reviewLinkForTenant,
  runPaymentReceivedAutomations,
  runReviewRequestAutomations,
  runJobCreatedAutomations,
  runJobCompletedAutomations,
  runJobAssignedStaffAutomations,
  runJobCreatedStaffAutomations,
  runJobCompletedStaffAutomations,
  runQuoteAcceptedStaffAutomations,
  runOrderCreatedStaffAutomations,
  runOrderStatusStaffAutomations,
  runSaleCompletedStaffAutomations,
  runLeadAssignedStaffAutomations,
  runTaskAssignedStaffAutomations,
  runNewLeadAutomations,
  runCustomerCreatedAutomations,
  runInvoiceSentAutomations,
  runHighValueInvoiceAutomations,
  runSaleCompletedAutomations,
  runOrderCreatedAutomations,
  runQuoteSentAutomations,
  runStockChangeAutomations,
  runLowProfitMarginAutomations,
  runDueAutomations,
  scheduleAllowsRun,
  conditionsAllowRun,
  triggerConfigAllowsRun,
  getTriggerContextsForRule,
  isStickyTriggerType,
  resolveRuleSchedule,
  isCooldownRun,
  hasSuccessfulLifetimeRun,
};
