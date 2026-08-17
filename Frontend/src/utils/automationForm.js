/**
 * Structured automation rule builder — maps UI state ↔ API triggerConfig / conditionConfig / actionConfig.
 * Keep in sync with Backend/services/automationEngineService.js action types.
 */

export const TRIGGER_OPTIONS = [
  {
    value: 'invoice_due_in_days',
    label: 'Before an invoice is due',
    hint: 'Fires relative to each invoice’s due date.',
  },
  {
    value: 'invoice_overdue',
    label: 'After an invoice is overdue',
    hint: 'Fires when an invoice is past due.',
  },
  {
    value: 'low_stock_detected',
    label: 'Low stock',
    hint: 'When stock crosses your threshold (e.g. reorder level).',
  },
  {
    value: 'quote_no_response',
    label: 'Quote with no response',
    hint: 'When a quote has had no activity for a set time.',
  },
  {
    value: 'customer_inactive_days',
    label: 'Inactive customer',
    hint: 'When a customer has not been active for a while.',
  },
  {
    value: 'customer_birthday',
    label: 'Customer birthday',
    hint: 'When today matches a customer date of birth.',
  },
  {
    value: 'payment_received',
    label: 'Payment received',
    hint: 'When a payment is recorded on an invoice.',
  },
  {
    value: 'review_request',
    label: 'Review request',
    hint: 'After a job, sale, or standalone invoice is fully paid.',
  },
  {
    value: 'job_completed',
    label: 'Job completed',
    hint: 'When a job or service is marked complete.',
  },
  {
    value: 'job_created',
    label: 'Job created',
    hint: 'When a new job is created.',
  },
  {
    value: 'daily_sales_summary',
    label: 'Daily sales summary',
    hint: 'Scheduled recap of sales activity for your team.',
  },
  {
    value: 'new_lead',
    label: 'New lead',
    hint: 'When a new lead is created.',
  },
  {
    value: 'high_value_invoice',
    label: 'High value invoice',
    hint: 'When an invoice exceeds a set amount.',
  },
  {
    value: 'customer_created',
    label: 'New customer',
    hint: 'When a new customer is added.',
  },
  {
    value: 'lead_no_contact_days',
    label: 'Lead no contact',
    hint: 'When a lead has had no contact for a set time.',
  },
  {
    value: 'invoice_sent',
    label: 'Invoice sent',
    hint: 'When an invoice is sent to a customer.',
  },
  {
    value: 'sale_completed',
    label: 'Sale completed',
    hint: 'When a sale is completed (receipt / confirmation).',
  },
  {
    value: 'order_created',
    label: 'Order created',
    hint: 'When an order/sale is created for a customer (includes tracking link).',
  },
  {
    value: 'low_stock_on_change',
    label: 'Low stock (real-time)',
    hint: 'When stock drops to reorder level after a sale or adjustment.',
  },
  {
    value: 'out_of_stock_detected',
    label: 'Out of stock (real-time)',
    hint: 'When a product goes out of stock.',
  },
  {
    value: 'quote_sent',
    label: 'Quote sent',
    hint: 'When a quote is sent to a customer.',
  },
  {
    value: 'job_due_in_hours',
    label: 'Job due soon',
    hint: 'Remind the assigned team member when a job is due within a set number of hours.',
  },
  {
    value: 'prescription_refill_due',
    label: 'Prescription refill due',
    hint: 'Pharmacy: when a prescription refill is approaching.',
  },
  {
    value: 'low_profit_margin',
    label: 'Low profit margin',
    hint: 'When a completed sale margin is below threshold.',
  },
  {
    value: 'job_assigned_staff',
    label: 'Job assigned (staff)',
    hint: 'Notify the assignee when a job is assigned or reassigned.',
  },
  {
    value: 'payment_received_staff',
    label: 'Payment received (staff)',
    hint: 'Notify owners/managers when a payment is recorded.',
  },
  {
    value: 'invoice_paid_staff',
    label: 'Invoice fully paid (staff)',
    hint: 'Notify staff when an invoice balance reaches zero.',
  },
  {
    value: 'invoice_overdue_staff',
    label: 'Invoice overdue (staff)',
    hint: 'Notify staff when an invoice is past due.',
  },
  {
    value: 'order_created_staff',
    label: 'Order created (staff)',
    hint: 'Notify kitchen managers/staff when a restaurant order is created.',
  },
  {
    value: 'order_status_staff',
    label: 'Order status changed (staff)',
    hint: 'Notify staff when kitchen order status changes (e.g. ready).',
  },
  {
    value: 'quote_accepted_staff',
    label: 'Quote accepted (staff)',
    hint: 'Notify the team when a customer accepts a quote.',
  },
  {
    value: 'new_lead_staff',
    label: 'New lead (staff)',
    hint: 'Email staff about a new lead (does not message the lead).',
  },
  {
    value: 'job_created_staff',
    label: 'Job created (staff)',
    hint: 'Notify managers when a new job is created.',
  },
  {
    value: 'job_completed_staff',
    label: 'Job completed (staff)',
    hint: 'Notify managers when a job is completed.',
  },
  {
    value: 'sale_completed_staff',
    label: 'Sale completed (staff)',
    hint: 'Optionally notify managers when a sale is completed.',
  },
  {
    value: 'lead_assigned_staff',
    label: 'Lead assigned (staff)',
    hint: 'Notify the assignee when a lead is assigned.',
  },
  {
    value: 'task_assigned_staff',
    label: 'Task assigned (staff)',
    hint: 'Notify the assignee when a workspace task is assigned to them.',
  },
];

export const THRESHOLD_MODE_OPTIONS = [
  { value: 'reorder_level', label: 'At or below reorder level' },
  { value: 'fixed', label: 'Below a fixed quantity' },
];

export const ACTION_TYPE_OPTIONS = [
  { value: 'create_task', label: 'Create a task' },
  { value: 'send_email_platform', label: 'Send email (platform)' },
  { value: 'send_sms', label: 'Send SMS' },
  { value: 'send_whatsapp', label: 'Send WhatsApp (template)' },
];

export const MESSAGING_ACTION_TYPES = ['send_sms', 'send_whatsapp', 'send_email_platform'];

export const STAFF_RECIPIENT_TYPE_OPTIONS = [
  { value: 'assignee', label: 'Job / lead / task assignee' },
  { value: 'role', label: 'Staff roles' },
  { value: 'user', label: 'Specific user' },
];

export const STAFF_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
];

/** Triggers that message internal staff (recipient model applies). */
export const INTERNAL_TRIGGER_TYPES = new Set([
  'job_assigned_staff',
  'job_due_in_hours',
  'job_created_staff',
  'job_completed_staff',
  'payment_received_staff',
  'invoice_paid_staff',
  'invoice_overdue_staff',
  'low_stock_detected',
  'low_stock_on_change',
  'out_of_stock_detected',
  'order_created_staff',
  'order_status_staff',
  'quote_accepted_staff',
  'daily_sales_summary',
  'new_lead',
  'new_lead_staff',
  'lead_assigned_staff',
  'task_assigned_staff',
  'high_value_invoice',
  'sale_completed_staff',
  'low_profit_margin',
]);

/**
 * @param {string} triggerType
 * @returns {boolean}
 */
export function isInternalStaffTrigger(triggerType) {
  return INTERNAL_TRIGGER_TYPES.has(String(triggerType || ''));
}

/**
 * Whether a test run should pick a team member instead of a customer.
 * Uses internal trigger set, action audience, or staff recipient config.
 * @param {{ triggerType?: string, actionRows?: Record<string, unknown>[] }} [params]
 * @returns {boolean}
 */
export function isStaffAutomationAudience({ triggerType, actionRows } = {}) {
  if (isInternalStaffTrigger(triggerType)) return true;
  const type = String(triggerType || '');
  if (type.endsWith('_staff')) return true;
  const rows = Array.isArray(actionRows) ? actionRows : [];
  return rows.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const audience = String(row.audience || '').toLowerCase();
    if (audience === 'internal' || audience === 'staff') return true;
    if (String(row.recipientType || '').trim()) return true;
    if (row.recipient && typeof row.recipient === 'object') return true;
    return false;
  });
}

/** Placeholders available in trigger context when automations run (see automationEngineService). */
export const TRIGGER_PLACEHOLDERS = {
  invoice_due_in_days: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'balance',
    'balanceFormatted',
    'amount',
    'totalAmount',
    'dueDate',
    'paymentLink',
    'paymentPath',
    'email',
    'phone',
  ],
  invoice_overdue: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'balance',
    'balanceFormatted',
    'amount',
    'totalAmount',
    'dueDate',
    'overdueDays',
    'paymentLink',
    'paymentPath',
    'email',
    'phone',
  ],
  low_stock_detected: ['productName', 'sku', 'quantityOnHand', 'reorderLevel', 'businessName'],
  quote_no_response: ['customerName', 'businessName', 'quoteNumber', 'amount', 'email', 'phone'],
  customer_inactive_days: [
    'customerName',
    'businessName',
    'lastPurchaseDaysAgo',
    'totalSpend',
    'email',
    'phone',
  ],
  customer_birthday: ['customerName', 'businessName', 'email', 'phone', 'dateOfBirth'],
  payment_received: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'amount',
    'amountPaid',
    'paymentAmount',
    'paymentMethod',
    'paymentNumber',
    'balance',
    'totalAmount',
    'email',
    'phone',
  ],
  payment_received_staff: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'amount',
    'paymentMethod',
    'balance',
    'totalAmount',
  ],
  invoice_paid_staff: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'totalAmountFormatted',
    'amount',
  ],
  invoice_overdue_staff: [
    'customerName',
    'businessName',
    'invoiceNumber',
    'balance',
    'dueDate',
    'overdueDays',
  ],
  review_request: [
    'customerName',
    'businessName',
    'reviewLink',
    'reviewUrl',
    'jobNumber',
    'saleNumber',
    'invoiceNumber',
    'sourceNumber',
    'email',
    'phone',
  ],
  job_completed: [
    'customerName',
    'businessName',
    'jobNumber',
    'jobTitle',
    'trackingLink',
    'trackingLinkLine',
    'email',
    'phone',
  ],
  job_completed_staff: ['customerName', 'businessName', 'jobNumber', 'jobTitle'],
  job_created_staff: ['customerName', 'businessName', 'jobNumber', 'jobTitle'],
  job_assigned_staff: [
    'assigneeName',
    'businessName',
    'jobNumber',
    'jobTitle',
    'dueDate',
    'customerName',
  ],
  daily_sales_summary: [
    'businessName',
    'date',
    'periodLabel',
    'totalSales',
    'totalSalesFormatted',
    'transactionCount',
    'topProducts',
  ],
  new_lead: ['leadName', 'leadCompany', 'leadSource', 'businessName', 'leadEmail', 'leadPhone'],
  new_lead_staff: ['leadName', 'leadCompany', 'leadSource', 'businessName', 'leadEmail', 'leadPhone'],
  lead_assigned_staff: [
    'assigneeName',
    'leadName',
    'leadCompany',
    'leadSource',
    'businessName',
    'leadEmail',
    'leadPhone',
  ],
  task_assigned_staff: [
    'assigneeName',
    'assignedByName',
    'taskTitle',
    'taskDescription',
    'taskPriority',
    'dueDate',
    'taskLink',
    'businessName',
  ],
  high_value_invoice: ['customerName', 'businessName', 'invoiceNumber', 'totalAmount', 'totalAmountFormatted'],
  customer_created: ['customerName', 'businessName', 'email', 'phone'],
  lead_no_contact_days: ['leadName', 'leadCompany', 'leadSource', 'noContactDays', 'businessName', 'email', 'phone'],
  invoice_sent: ['customerName', 'businessName', 'invoiceNumber', 'totalAmountFormatted', 'balance', 'paymentLink', 'dueDate', 'email', 'phone'],
  sale_completed: ['customerName', 'businessName', 'saleNumber', 'totalAmountFormatted', 'email', 'phone'],
  sale_completed_staff: ['customerName', 'businessName', 'saleNumber', 'totalAmountFormatted'],
  order_created: [
    'customerName',
    'businessName',
    'orderNumber',
    'saleNumber',
    'trackingLink',
    'trackingUrl',
    'trackingLinkLine',
    'totalAmountFormatted',
    'email',
    'phone',
  ],
  order_created_staff: ['customerName', 'businessName', 'orderNumber', 'saleNumber', 'totalAmountFormatted'],
  order_status_staff: ['customerName', 'businessName', 'orderNumber', 'orderStatus', 'previousStatus', 'totalAmountFormatted'],
  low_stock_on_change: ['productName', 'sku', 'quantityOnHand', 'reorderLevel', 'businessName'],
  out_of_stock_detected: ['productName', 'sku', 'quantityOnHand', 'reorderLevel', 'businessName'],
  quote_sent: ['customerName', 'businessName', 'quoteNumber', 'quoteTitle', 'quoteLink', 'totalAmountFormatted', 'email', 'phone'],
  quote_accepted_staff: ['customerName', 'businessName', 'quoteNumber', 'quoteTitle', 'totalAmountFormatted'],
  job_due_in_hours: ['assigneeName', 'businessName', 'jobNumber', 'jobTitle', 'dueDate', 'customerName'],
  prescription_refill_due: ['customerName', 'businessName', 'prescriptionNumber', 'refillDueDate', 'email', 'phone'],
  low_profit_margin: ['saleNumber', 'customerName', 'businessName', 'profitMargin', 'profitMarginFormatted', 'totalAmountFormatted', 'minMarginPercent'],
};

/**
 * Default messaging/task content per trigger and action type.
 * Values use {{placeholder}} syntax resolved at send time by the automation engine.
 */
export const DEFAULT_ACTION_CONTENT = {
  invoice_due_in_days: {
    send_sms: {
      body:
        'Hi {{customerName}}, invoice {{invoiceNumber}} for {{balance}} is due on {{dueDate}}. Pay here: {{paymentLink}} — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'payment_reminder',
      language: 'en',
      parametersText: '{{customerName}}, {{invoiceNumber}}, {{balanceFormatted}}, {{dueDate}}',
      buttonParametersText: '{{paymentPath}}',
    },
    send_email_platform: {
      subject: 'Invoice {{invoiceNumber}} due soon',
      body:
        'Hi {{customerName}},\n\nThis is a friendly reminder that invoice {{invoiceNumber}} for {{balance}} is due on {{dueDate}}.\n\nPay online: {{paymentLink}}\n\nThank you,\n{{businessName}}',
    },
    create_task: {
      title: 'Follow up on invoice {{invoiceNumber}}',
      priority: 'medium',
      description: 'Invoice {{invoiceNumber}} is due on {{dueDate}}. Balance: {{balance}}.',
      link: '/invoices',
    },
  },
  invoice_overdue: {
    send_sms: {
      body:
        'Hi {{customerName}}, invoice {{invoiceNumber}} is overdue ({{overdueDays}} days). Balance due: {{balance}}. Pay here: {{paymentLink}} — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'payment_reminder',
      language: 'en',
      parametersText: '{{customerName}}, {{invoiceNumber}}, {{balanceFormatted}}, {{dueDate}}',
      buttonParametersText: '{{paymentPath}}',
    },
    send_email_platform: {
      subject: 'Overdue invoice {{invoiceNumber}}',
      body:
        'Hi {{customerName}},\n\nInvoice {{invoiceNumber}} is now {{overdueDays}} days overdue. Outstanding balance: {{balance}}.\n\nPlease pay as soon as possible: {{paymentLink}}\n\n{{businessName}}',
    },
    create_task: {
      title: 'Collect overdue payment — {{invoiceNumber}}',
      priority: 'high',
      description: 'Invoice {{invoiceNumber}} is {{overdueDays}} days overdue. Balance: {{balance}}.',
      link: '/invoices',
    },
  },
  low_stock_detected: {
    send_sms: {
      body: 'Low stock alert: {{productName}} ({{sku}}) has {{quantityOnHand}} left. Reorder level: {{reorderLevel}}. — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'low_stock_alert',
      language: 'en',
      parametersText: '{{productName}}, {{quantityOnHand}}, {{reorderLevel}}',
    },
    send_email_platform: {
      subject: 'Low stock: {{productName}}',
      body:
        'Stock alert for {{productName}} (SKU: {{sku}}).\n\nQuantity on hand: {{quantityOnHand}}\nReorder level: {{reorderLevel}}\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Restock {{productName}}',
      priority: 'high',
      description: '{{productName}} is low on stock ({{quantityOnHand}} on hand, reorder at {{reorderLevel}}).',
      link: '/materials',
    },
  },
  quote_no_response: {
    send_sms: {
      body:
        'Hi {{customerName}}, just checking in on quote {{quoteNumber}} from {{businessName}}. Reply if you have any questions or would like to proceed.',
    },
    send_whatsapp: {
      templateName: 'quote_follow_up',
      language: 'en',
      parametersText: '{{customerName}}, {{quoteNumber}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'Following up on quote {{quoteNumber}}',
      body:
        'Hi {{customerName}},\n\nWe wanted to follow up on quote {{quoteNumber}} ({{amount}}). Let us know if you have any questions or would like to move forward.\n\nBest regards,\n{{businessName}}',
    },
    create_task: {
      title: 'Follow up on quote {{quoteNumber}}',
      priority: 'medium',
      description: 'Quote {{quoteNumber}} for {{customerName}} has had no response.',
      link: '/quotes',
    },
  },
  customer_inactive_days: {
    send_sms: {
      body:
        'Hi {{customerName}}, we miss you at {{businessName}}! It has been a while since your last visit. We would love to see you again.',
    },
    send_whatsapp: {
      templateName: 'win_back',
      language: 'en',
      parametersText: '{{customerName}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'We miss you, {{customerName}}',
      body:
        'Hi {{customerName}},\n\nWe have not seen you at {{businessName}} in a while and would love to welcome you back.\n\nWarm regards,\n{{businessName}}',
    },
    create_task: {
      title: 'Win back {{customerName}}',
      priority: 'medium',
      description: 'Customer inactive for a while. Last purchase was {{lastPurchaseDaysAgo}} days ago.',
      link: '/customers',
    },
  },
  customer_birthday: {
    send_sms: {
      body:
        'Happy birthday {{customerName}}! Wishing you a wonderful day from everyone at {{businessName}}.',
    },
    send_whatsapp: {
      templateName: 'birthday_greeting',
      language: 'en',
      parametersText: '{{customerName}}',
    },
    send_email_platform: {
      subject: 'Happy birthday, {{customerName}}!',
      body:
        'Hi {{customerName}},\n\nHappy birthday from all of us at {{businessName}}! We hope you have a fantastic day.\n\nWarm wishes,\n{{businessName}}',
    },
    create_task: {
      title: 'Send birthday greeting to {{customerName}}',
      priority: 'low',
      description: 'Today is {{customerName}}\'s birthday.',
      link: '/customers',
    },
  },
  payment_received: {
    send_sms: {
      body:
        'Hi {{customerName}}, thank you! We received {{amount}} for invoice {{invoiceNumber}}. Balance: {{balance}}. — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'payment_received',
      language: 'en',
      parametersText: '{{customerName}}, {{invoiceNumber}}, {{amount}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'Payment received — thank you',
      body:
        'Hi {{customerName}},\n\nThank you! We have received your payment of {{amount}} for invoice {{invoiceNumber}}.\n\nRemaining balance: {{balance}}\n\n{{businessName}}',
    },
    create_task: {
      title: 'Payment received for {{invoiceNumber}}',
      priority: 'low',
      description: '{{customerName}} paid {{amount}} via {{paymentMethod}}.',
      link: '/invoices',
    },
  },
  review_request: {
    send_sms: {
      body:
        'Hi {{customerName}}, thank you for choosing {{businessName}}! We would love your feedback: {{reviewLink}}',
    },
    send_whatsapp: {
      templateName: 'review_request',
      language: 'en',
      parametersText: '{{customerName}}, {{businessName}}, {{reviewLink}}',
    },
    send_email_platform: {
      subject: 'How did we do, {{customerName}}?',
      body:
        'Hi {{customerName}},\n\nThank you for choosing {{businessName}}! We would love to hear about your experience.\n\nLeave a review here: {{reviewLink}}\n\nThank you,\n{{businessName}}',
    },
    create_task: {
      title: 'Follow up for review — {{customerName}}',
      priority: 'low',
      description: 'Ask {{customerName}} for a review via {{reviewLink}}.',
      link: '/customers',
    },
  },
  job_completed: {
    send_sms: {
      body:
        'Hi {{customerName}}, your job {{jobNumber}} is complete. {{trackingLinkLine}} — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'job_completed',
      language: 'en',
      parametersText: '{{customerName}}, {{jobNumber}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'Your job {{jobNumber}} is complete',
      body:
        'Hi {{customerName}},\n\nGood news! Your job {{jobNumber}} has been completed.\n\n{{trackingLinkLine}}\n\nThank you,\n{{businessName}}',
    },
    create_task: {
      title: 'Job completed — {{jobNumber}}',
      priority: 'low',
      description: 'Notify {{customerName}} that job {{jobNumber}} is complete.',
      link: '/jobs',
    },
  },
  daily_sales_summary: {
    send_sms: {
      body:
        'Daily sales ({{date}}): {{totalSalesFormatted}} from {{transactionCount}} transactions. Top: {{topProducts}}. — {{businessName}}',
    },
    send_whatsapp: {
      templateName: 'daily_sales_summary',
      language: 'en',
      parametersText: '{{date}}, {{totalSalesFormatted}}, {{transactionCount}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'Daily sales summary — {{date}}',
      body:
        'Daily sales recap for {{date}} ({{periodLabel}}):\n\nTotal sales: {{totalSalesFormatted}}\nTransactions: {{transactionCount}}\nTop products: {{topProducts}}\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Review daily sales — {{date}}',
      priority: 'medium',
      description: '{{totalSalesFormatted}} from {{transactionCount}} transactions. Top: {{topProducts}}.',
      link: '/sales',
    },
  },
  new_lead: {
    send_sms: { body: 'New lead: {{leadName}} ({{leadSource}}). — {{businessName}}' },
    send_whatsapp: { templateName: 'new_lead_alert', language: 'en', parametersText: '{{leadName}}, {{leadSource}}, {{businessName}}' },
    send_email_platform: {
      subject: 'New lead: {{leadName}}',
      body: 'New lead added:\n\nName: {{leadName}}\nCompany: {{leadCompany}}\nSource: {{leadSource}}\nPhone: {{phone}}\nEmail: {{email}}\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Follow up new lead — {{leadName}}',
      priority: 'medium',
      description: 'Lead {{leadName}} from {{leadSource}}.',
      link: '/leads',
    },
  },
  high_value_invoice: {
    send_sms: { body: 'High value invoice {{invoiceNumber}}: {{totalAmountFormatted}} for {{customerName}}. — {{businessName}}' },
    send_whatsapp: { templateName: 'invoice_notification', language: 'en', parametersText: '{{customerName}}, {{invoiceNumber}}, {{totalAmountFormatted}}, {{paymentLink}}' },
    send_email_platform: {
      subject: 'High value invoice — {{invoiceNumber}}',
      body: 'Invoice {{invoiceNumber}} for {{customerName}} totals {{totalAmountFormatted}}.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'High value invoice — {{invoiceNumber}}',
      priority: 'high',
      description: '{{customerName}} — {{totalAmountFormatted}}.',
      link: '/invoices',
    },
  },
  customer_created: {
    send_sms: { body: 'Welcome to {{businessName}}, {{customerName}}! We look forward to serving you.' },
    send_whatsapp: { templateName: 'welcome_customer', language: 'en', parametersText: '{{customerName}}, {{businessName}}' },
    send_email_platform: {
      subject: 'Welcome to {{businessName}}, {{customerName}}!',
      body: 'Hi {{customerName}},\n\nWelcome to {{businessName}}! We are glad to have you.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Welcome {{customerName}}',
      priority: 'low',
      description: 'New customer {{customerName}} was added.',
      link: '/customers',
    },
  },
  lead_no_contact_days: {
    send_sms: { body: 'Follow up lead {{leadName}} — no contact for {{noContactDays}} days. — {{businessName}}' },
    send_whatsapp: { templateName: 'lead_follow_up', language: 'en', parametersText: '{{leadName}}, {{noContactDays}}, {{businessName}}' },
    send_email_platform: {
      subject: 'Follow up lead {{leadName}}',
      body: 'Lead {{leadName}} ({{leadCompany}}) has had no contact for {{noContactDays}} days.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Follow up lead — {{leadName}}',
      priority: 'medium',
      description: 'No contact for {{noContactDays}} days.',
      link: '/leads',
    },
  },
  invoice_sent: {
    send_sms: { body: 'Hi {{customerName}}, invoice {{invoiceNumber}} for {{totalAmountFormatted}} is ready. Pay: {{paymentLink}} — {{businessName}}' },
    send_whatsapp: { templateName: 'invoice_notification', language: 'en', parametersText: '{{customerName}}, {{invoiceNumber}}, {{totalAmountFormatted}}, {{paymentLink}}' },
    send_email_platform: {
      subject: 'Invoice {{invoiceNumber}} from {{businessName}}',
      body: 'Hi {{customerName}},\n\nInvoice {{invoiceNumber}} for {{totalAmountFormatted}} is ready.\n\nPay online: {{paymentLink}}\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Invoice sent — {{invoiceNumber}}',
      priority: 'low',
      description: 'Sent to {{customerName}} for {{totalAmountFormatted}}.',
      link: '/invoices',
    },
  },
  sale_completed: {
    send_sms: { body: 'Hi {{customerName}}, thank you! Receipt {{saleNumber}}: {{totalAmountFormatted}}. — {{businessName}}' },
    send_whatsapp: { templateName: 'sale_receipt', language: 'en', parametersText: '{{customerName}}, {{saleNumber}}, {{totalAmountFormatted}}, {{businessName}}' },
    send_email_platform: {
      subject: 'Your receipt — {{saleNumber}}',
      body: 'Hi {{customerName}},\n\nThank you for your purchase! Receipt {{saleNumber}} totals {{totalAmountFormatted}}.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Sale completed — {{saleNumber}}',
      priority: 'low',
      description: '{{customerName}} — {{totalAmountFormatted}}.',
      link: '/sales',
    },
  },
  order_created: {
    send_sms: {
      body:
        'Hi {{customerName}}, we received order {{orderNumber}} at {{businessName}}. Track your order: {{trackingLink}}',
    },
    send_whatsapp: {
      templateName: 'order_created',
      language: 'en',
      parametersText: '{{customerName}}, {{orderNumber}}, {{totalAmountFormatted}}, {{businessName}}',
    },
    send_email_platform: {
      subject: 'Order {{orderNumber}} received — {{businessName}}',
      body:
        'Hi {{customerName}},\n\nWe have received your order {{orderNumber}}.\n\n{{trackingLinkLine}}\n\nThank you,\n{{businessName}}',
    },
    create_task: {
      title: 'Order created — {{orderNumber}}',
      priority: 'low',
      description: 'Notify {{customerName}} about order {{orderNumber}}.',
      link: '/sales',
    },
  },
  low_stock_on_change: {
    send_sms: { body: 'Low stock: {{productName}} ({{sku}}) — {{quantityOnHand}} left. — {{businessName}}' },
    send_whatsapp: { templateName: 'low_stock_alert', language: 'en', parametersText: '{{productName}}, {{quantityOnHand}}, {{reorderLevel}}' },
    send_email_platform: {
      subject: 'Low stock: {{productName}}',
      body: '{{productName}} ({{sku}}) is low: {{quantityOnHand}} on hand (reorder {{reorderLevel}}).\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Restock {{productName}}',
      priority: 'high',
      description: '{{quantityOnHand}} on hand, reorder at {{reorderLevel}}.',
      link: '/materials',
    },
  },
  out_of_stock_detected: {
    send_sms: { body: 'Out of stock: {{productName}} ({{sku}}). — {{businessName}}' },
    send_whatsapp: { templateName: 'low_stock_alert', language: 'en', parametersText: '{{productName}}, {{quantityOnHand}}, {{reorderLevel}}' },
    send_email_platform: {
      subject: 'Out of stock: {{productName}}',
      body: '{{productName}} ({{sku}}) is out of stock.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Out of stock — {{productName}}',
      priority: 'high',
      description: '{{productName}} is out of stock.',
      link: '/materials',
    },
  },
  quote_sent: {
    send_sms: { body: 'Hi {{customerName}}, quote {{quoteNumber}} ({{totalAmountFormatted}}) is ready: {{quoteLink}} — {{businessName}}' },
    send_whatsapp: { templateName: 'quote_delivery', language: 'en', parametersText: '{{customerName}}, {{quoteNumber}}, {{quoteTitle}}, {{quoteLink}}' },
    send_email_platform: {
      subject: 'Your quote {{quoteNumber}} from {{businessName}}',
      body: 'Hi {{customerName}},\n\nQuote {{quoteNumber}} ({{totalAmountFormatted}}) is ready.\n\nView: {{quoteLink}}\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Quote sent — {{quoteNumber}}',
      priority: 'low',
      description: 'Sent to {{customerName}}.',
      link: '/quotes',
    },
  },
  job_due_in_hours: {
    send_email_platform: {
      subject: 'Job {{jobNumber}} due soon',
      body: 'Hi {{assigneeName}},\n\nJob {{jobNumber}} for {{customerName}} is due on {{dueDate}}.\n\nPlease prioritize this work before the due date.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Job due soon — {{jobNumber}}',
      priority: 'medium',
      description: 'Job {{jobNumber}} for {{customerName}} is due on {{dueDate}}.',
      link: '/jobs',
    },
  },
  prescription_refill_due: {
    send_sms: { body: 'Hi {{customerName}}, prescription {{prescriptionNumber}} refill due {{refillDueDate}}. — {{businessName}}' },
    send_whatsapp: { templateName: 'prescription_refill', language: 'en', parametersText: '{{customerName}}, {{prescriptionNumber}}, {{refillDueDate}}, {{businessName}}' },
    send_email_platform: {
      subject: 'Prescription refill — {{prescriptionNumber}}',
      body: 'Hi {{customerName}},\n\nYour prescription {{prescriptionNumber}} refill is due on {{refillDueDate}}.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Refill due — {{prescriptionNumber}}',
      priority: 'medium',
      description: '{{customerName}} refill due {{refillDueDate}}.',
      link: '/prescriptions',
    },
  },
  low_profit_margin: {
    send_sms: { body: 'Low margin sale {{saleNumber}}: {{profitMarginFormatted}}. — {{businessName}}' },
    send_whatsapp: { templateName: 'low_profit_alert', language: 'en', parametersText: '{{saleNumber}}, {{profitMarginFormatted}}, {{businessName}}' },
    send_email_platform: {
      subject: 'Low margin alert — {{saleNumber}}',
      body: 'Sale {{saleNumber}} margin is {{profitMarginFormatted}} (threshold {{minMarginPercent}}%). Total: {{totalAmountFormatted}}.\n\n— {{businessName}}',
    },
    create_task: {
      title: 'Low margin sale — {{saleNumber}}',
      priority: 'high',
      description: 'Margin {{profitMarginFormatted}} on {{totalAmountFormatted}}.',
      link: '/sales',
    },
  },
  task_assigned_staff: {
    send_email_platform: {
      subject: 'Task assigned: {{taskTitle}}',
      body: 'Hi {{assigneeName}},\n\n{{assignedByName}} assigned you the task "{{taskTitle}}".\n\nPriority: {{taskPriority}}\nDue: {{dueDate}}\n\n{{taskDescription}}\n\nOpen tasks: {{taskLink}}\n\n— {{businessName}}',
    },
  },
};

/**
 * @param {string} triggerType
 * @returns {string[]}
 */
export function getTriggerPlaceholders(triggerType) {
  return TRIGGER_PLACEHOLDERS[triggerType] || ['customerName', 'businessName'];
}

/**
 * @param {string} triggerType
 * @returns {string}
 */
export function formatPlaceholderHint(triggerType) {
  const keys = getTriggerPlaceholders(triggerType);
  return keys.map((key) => `{{${key}}}`).join(', ');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmptyActionField(value) {
  return value == null || String(value).trim() === '';
}

/**
 * @param {string} triggerType
 * @param {string} actionType
 * @returns {Record<string, unknown>}
 */
export function getDefaultActionContent(triggerType, actionType) {
  return DEFAULT_ACTION_CONTENT[triggerType]?.[actionType] || {};
}

/**
 * Merge trigger-specific defaults into an action row without overwriting user edits.
 * @param {Record<string, unknown>} row
 * @param {string} triggerType
 * @returns {Record<string, unknown>}
 */
export function prefillActionRow(row, triggerType) {
  if (!row?.type || !triggerType) return row;
  const defaults = getDefaultActionContent(triggerType, row.type);
  const out = { ...row };
  for (const [key, value] of Object.entries(defaults)) {
    if (isEmptyActionField(out[key])) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>[]} actionRows
 * @param {string} triggerType
 * @returns {Record<string, unknown>[]}
 */
export function prefillActionRows(actionRows, triggerType) {
  return (actionRows || []).map((row) => prefillActionRow(row, triggerType));
}

/**
 * Whether an automation rule includes outbound messaging actions.
 * @param {Record<string, unknown>[]} actionRows
 * @returns {boolean}
 */
export function ruleHasMessagingActions(actionRows) {
  return (actionRows || []).some((row) => MESSAGING_ACTION_TYPES.includes(row?.type));
}

/**
 * Recipient fields required for messaging test runs.
 * @param {Record<string, unknown>[]} actionRows
 * @returns {{ needsPhone: boolean, needsEmail: boolean }}
 */
export function messagingActionRequirements(actionRows) {
  const types = new Set((actionRows || []).map((row) => row?.type).filter(Boolean));
  return {
    needsPhone: types.has('send_sms') || types.has('send_whatsapp'),
    needsEmail: types.has('send_email_platform'),
  };
}

/**
 * Merge a real test recipient into automation trigger context.
 * Supports customer pickers and staff/team-member pickers.
 * @param {Record<string, unknown>} baseContext
 * @param {Record<string, unknown>} recipient
 * @returns {Record<string, unknown>}
 */
export function buildTestRecipientContext(baseContext = {}, recipient = {}) {
  const isStaff = Boolean(
    recipient?.userId
    || recipient?.recipientUserId
    || recipient?.audience === 'internal'
    || recipient?.audience === 'staff'
    || recipient?.forceTestRecipient
  );
  const defaultName = isStaff ? 'Test Staff' : 'Test Customer';
  const name = String(recipient.name || recipient.customerName || baseContext.customerName || defaultName).trim();
  const phone = String(recipient.phone || baseContext.phone || '').trim();
  const email = String(recipient.email || baseContext.email || '').trim();
  const userId = recipient.userId || recipient.recipientUserId || null;
  const customerId = isStaff
    ? (baseContext.customerId || 'test-customer')
    : (recipient.customerId || recipient.id || baseContext.customerId || 'test-customer');
  const dateOfBirth = recipient.dateOfBirth || baseContext.customer?.dateOfBirth || baseContext.dateOfBirth;

  const customer = {
    ...(baseContext.customer && typeof baseContext.customer === 'object' ? baseContext.customer : {}),
    id: customerId,
    name: isStaff ? (baseContext.customer?.name || 'Test Customer') : name,
    company: isStaff
      ? (baseContext.customer?.company || baseContext.customer?.name || 'Test Customer')
      : (recipient.company || baseContext.customer?.company || name),
    email: isStaff ? (baseContext.customer?.email || '') : email,
    phone: isStaff ? (baseContext.customer?.phone || '') : phone,
    dateOfBirth,
    whatsappConsent: true,
    smsConsent: true,
    marketingConsent: true,
  };

  const next = {
    ...baseContext,
    customerId,
    customerName: isStaff ? (baseContext.customerName || customer.name) : name,
    recipientName: name,
    email,
    phone,
    dateOfBirth,
    customerHasPhone: Boolean(isStaff ? customer.phone : phone),
    customerHasEmail: Boolean(isStaff ? customer.email : email),
    customer,
  };

  if (isStaff) {
    next.forceTestRecipient = true;
    next.audience = 'internal';
    if (userId) {
      next.testRecipientUserId = userId;
      next.recipientUserId = userId;
      next.assigneeId = userId;
      next.assignedTo = userId;
      next.assigneeName = name;
    }
  }

  return next;
}

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** Sticky (condition-while-true) triggers that show the repeat-frequency control. */
export const STICKY_TRIGGER_TYPES = [
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
];

export const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Once only' },
  { value: 'daily', label: 'Daily' },
  { value: 'every_n_days', label: 'Every N days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Scheduler-polled triggers (daysBeforeDue etc.) — hide Send after. */
export const SCHEDULER_TRIGGER_TYPES = [
  'invoice_due_in_days',
  'invoice_overdue',
  'invoice_overdue_staff',
  'low_stock_detected',
  'quote_no_response',
  'customer_inactive_days',
  'customer_birthday',
  'daily_sales_summary',
  'lead_no_contact_days',
  'job_due_in_hours',
  'prescription_refill_due',
];

/** UI presets for event-driven Send after (delayMinutes). */
export const DELAY_MINUTES_PRESETS = [
  { value: 0, label: 'Immediate' },
  { value: 3, label: '3 minutes' },
  { value: 60, label: '1 hour' },
  { value: 1440, label: '1 day' },
];

/** Default Send-after delay for review_request (1 hour). */
export const DEFAULT_REVIEW_REQUEST_DELAY_MINUTES = 60;

const FREQUENCY_COOLDOWN_HOURS = {
  daily: 24,
  weekly: 168,
  monthly: 720,
};

/**
 * @param {string} triggerType
 * @returns {boolean}
 */
export function isStickyTrigger(triggerType) {
  return STICKY_TRIGGER_TYPES.includes(String(triggerType || ''));
}

/**
 * @param {string} triggerType
 * @returns {boolean}
 */
export function isSchedulerTrigger(triggerType) {
  return SCHEDULER_TRIGGER_TYPES.includes(String(triggerType || ''));
}

/**
 * Event-driven customer/staff templates support Send after; sticky/scheduler do not.
 * @param {string} triggerType
 * @returns {boolean}
 */
export function supportsSendAfter(triggerType) {
  const type = String(triggerType || '');
  if (!type) return false;
  if (isStickyTrigger(type) || isSchedulerTrigger(type)) return false;
  return true;
}

/**
 * Sticky/scheduler triggers use a daily clock window; event triggers fire when the event happens.
 * @param {string} triggerType
 * @returns {boolean}
 */
export function usesDailySchedule(triggerType) {
  const type = String(triggerType || '');
  return isStickyTrigger(type) || isSchedulerTrigger(type);
}

/** Event noun phrase for timing copy: "Runs immediately when {phrase}" / "Runs 1 hour after {phrase}". */
const EVENT_TIMING_PHRASE = {
  job_created: 'a job is created',
  job_created_staff: 'a job is created',
  job_completed: 'a job is completed',
  job_completed_staff: 'a job is completed',
  job_assigned_staff: 'a job is assigned',
  payment_received: 'a payment is received',
  payment_received_staff: 'a payment is received',
  sale_completed: 'a sale is completed',
  sale_completed_staff: 'a sale is completed',
  invoice_sent: 'an invoice is sent',
  invoice_paid_staff: 'an invoice is fully paid',
  quote_sent: 'a quote is sent',
  quote_accepted_staff: 'a quote is accepted',
  customer_created: 'a customer is created',
  new_lead: 'a new lead is created',
  new_lead_staff: 'a new lead is created',
  order_created: 'an order is created',
  order_created_staff: 'an order is created',
  order_status_staff: 'an order status changes',
  high_value_invoice: 'a high-value invoice is created',
  review_request: 'a job, sale, or invoice is fully paid',
  low_stock_on_change: 'stock drops to reorder level',
  out_of_stock_detected: 'a product goes out of stock',
  low_profit_margin: 'a sale has a low profit margin',
  lead_assigned_staff: 'a lead is assigned',
  task_assigned_staff: 'a task is assigned',
};

/**
 * Format HH:mm (24h) for review/schedule UI, e.g. "09:00" → "09:00 AM".
 * @param {string} [timeValue]
 * @returns {string}
 */
export function formatScheduleTimeDisplay(timeValue) {
  const raw = String(timeValue || '09:00').trim();
  if (/am|pm/i.test(raw)) return raw.replace(/\s+/g, ' ').toUpperCase().replace(/AM|PM/, (m) => m);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '09:00 AM';
  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return '09:00 AM';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${minutes} ${period}`;
}

/**
 * @param {number} delayMinutes
 * @returns {string} e.g. "3 minutes", "1 hour", "1 day"
 */
export function formatDelayDurationLabel(delayMinutes) {
  const mins = Math.max(0, Math.floor(Number(delayMinutes) || 0));
  if (mins === 60) return '1 hour';
  if (mins === 1440) return '1 day';
  if (mins === 1) return '1 minute';
  return `${mins} minutes`;
}

/**
 * Resolve delayMinutes from condition form for event triggers.
 * @param {Record<string, unknown>} [conditionForm]
 * @param {string} triggerType
 * @returns {number}
 */
export function resolveDelayMinutes(conditionForm = {}, triggerType) {
  if (!supportsSendAfter(triggerType)) return 0;
  const raw = conditionForm?.delayMinutes;
  if (raw !== '' && raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return defaultDelayMinutesForTrigger(triggerType);
}

/**
 * Event-based timing line for Review / What happens next (not a daily clock).
 * @param {string} triggerType
 * @param {Record<string, unknown>} [conditionForm]
 * @returns {string} e.g. "Runs immediately when a job is created"
 * @example
 * getEventTimingCopy('job_created', {}) // "Runs immediately when a job is created"
 * getEventTimingCopy('job_created', { delayMinutes: '60' }) // "Runs 1 hour after a job is created"
 */
export function getEventTimingCopy(triggerType, conditionForm = {}) {
  const type = String(triggerType || '');
  const eventPhrase = EVENT_TIMING_PHRASE[type]
    || String(triggerLabel(type) || type).replace(/_/g, ' ').toLowerCase();
  const delayMinutes = resolveDelayMinutes(conditionForm, type);
  if (delayMinutes > 0) {
    return `Runs ${formatDelayDurationLabel(delayMinutes)} after ${eventPhrase}`;
  }
  return `Runs immediately when ${eventPhrase}`;
}

/**
 * Additional settings lines for the Review step.
 * Daily clock copy only for sticky/scheduler; event triggers get event-based timing.
 * @param {string} triggerType
 * @param {Record<string, unknown>} [conditionForm]
 * @returns {string[]}
 */
export function getReviewAdditionalSettingsLines(triggerType, conditionForm = {}) {
  if (usesDailySchedule(triggerType)) {
    const time = formatScheduleTimeDisplay(conditionForm?.runAfterTime || '09:00');
    return [`Time zone: (GMT+00:00) Accra`, `Runs every day at ${time}`];
  }
  return [getEventTimingCopy(triggerType, conditionForm)];
}

/**
 * Middle "What happens next?" bullet for Review.
 * @param {string} triggerType
 * @param {Record<string, unknown>} [conditionForm]
 * @returns {{ title: string, text: string }}
 */
export function getWhatHappensNextTiming(triggerType, conditionForm = {}) {
  if (usesDailySchedule(triggerType)) {
    const time = formatScheduleTimeDisplay(conditionForm?.runAfterTime || '09:00');
    return {
      title: `It will run every day at ${time}`,
      text: 'And perform actions for matching records.',
    };
  }
  const timing = getEventTimingCopy(triggerType, conditionForm);
  // "Runs …" → "It will run …"
  const title = timing.replace(/^Runs\b/, 'It will run');
  return {
    title,
    text: 'And perform the configured actions for matching records.',
  };
}

/**
 * Default delayMinutes when creating/switching to a trigger.
 * @param {string} triggerType
 * @returns {number}
 */
export function defaultDelayMinutesForTrigger(triggerType) {
  if (String(triggerType || '') === 'review_request') return DEFAULT_REVIEW_REQUEST_DELAY_MINUTES;
  return 0;
}

/**
 * Default frequency for sticky triggers when creating a new rule.
 * Overdue defaults to weekly to avoid daily spam.
 * @param {string} triggerType
 * @returns {string}
 */
export function defaultFrequencyForTrigger(triggerType) {
  if (triggerType === 'invoice_overdue' || triggerType === 'invoice_overdue_staff') return 'weekly';
  if (isStickyTrigger(triggerType)) return 'daily';
  return '';
}

/**
 * Map frequency form fields to engine scheduleConfig (including derived cooldownHours / maxSends).
 * @param {{ frequency?: string, intervalDays?: string|number, cooldownDays?: string|number, delayMinutes?: string|number, delayPreset?: string }} form
 * @param {string} triggerType
 * @returns {Record<string, unknown>}
 */
export function buildScheduleConfigFromForm(form = {}, triggerType) {
  if (isStickyTrigger(triggerType)) {
    const frequency = FREQUENCY_OPTIONS.some((o) => o.value === form.frequency)
      ? form.frequency
      : defaultFrequencyForTrigger(triggerType);
    const schedule = { frequency };
    if (frequency === 'once') {
      schedule.maxSends = 1;
      return schedule;
    }
    if (frequency === 'every_n_days') {
      const intervalDays = Math.max(1, Math.min(365, Number(form.intervalDays) || 1));
      schedule.intervalDays = intervalDays;
      schedule.cooldownHours = intervalDays * 24;
      return schedule;
    }
    schedule.cooldownHours = FREQUENCY_COOLDOWN_HOURS[frequency] || FREQUENCY_COOLDOWN_HOURS.daily;
    return schedule;
  }

  // Non-sticky: optional cooldown days + Send after (delayMinutes) for event triggers.
  const scheduleConfig = {};
  if (form?.cooldownDays !== '' && form?.cooldownDays != null) {
    const n = Number(form.cooldownDays);
    if (!Number.isNaN(n) && n > 0) scheduleConfig.cooldownHours = Math.round(n * 24);
  }
  if (supportsSendAfter(triggerType)) {
    let delayMinutes = 0;
    if (form?.delayMinutes !== '' && form?.delayMinutes != null) {
      const n = Number(form.delayMinutes);
      if (!Number.isNaN(n) && n >= 0) delayMinutes = Math.floor(n);
    } else {
      delayMinutes = defaultDelayMinutesForTrigger(triggerType);
    }
    scheduleConfig.delayMinutes = Math.max(0, delayMinutes);
  }
  return scheduleConfig;
}

/**
 * Infer frequency UI state from a saved scheduleConfig.
 * @param {Record<string, unknown>} scheduleConfig
 * @param {string} [triggerType]
 * @returns {{ frequency: string, intervalDays: string, cooldownDays: string, delayMinutes: string }}
 */
export function scheduleFormFromConfig(scheduleConfig = {}, triggerType = '') {
  const s = scheduleConfig && typeof scheduleConfig === 'object' ? scheduleConfig : {};
  const cooldownHours = Number(s.cooldownHours) > 0 ? Number(s.cooldownHours) : 0;
  const sticky = isStickyTrigger(triggerType);
  const delayMinutesRaw = Number(s.delayMinutes);
  const delayMinutes = supportsSendAfter(triggerType)
    ? String(
        Number.isFinite(delayMinutesRaw) && delayMinutesRaw >= 0
          ? Math.floor(delayMinutesRaw)
          : defaultDelayMinutesForTrigger(triggerType)
      )
    : '';

  if (s.frequency === 'once' || Number(s.maxSends) === 1) {
    return { frequency: 'once', intervalDays: '1', cooldownDays: '', delayMinutes };
  }
  if (FREQUENCY_OPTIONS.some((o) => o.value === s.frequency)) {
    return {
      frequency: s.frequency,
      intervalDays: String(Math.max(1, Number(s.intervalDays) || 1)),
      cooldownDays: cooldownHours > 0 ? String(cooldownHours / 24) : '',
      delayMinutes,
    };
  }

  // Lazy normalize: sticky rules with empty schedule → daily (matches engine).
  // New overdue templates set weekly explicitly in scheduleConfig.
  if (sticky && !s.frequency && cooldownHours <= 0) {
    return {
      frequency: 'daily',
      intervalDays: '1',
      cooldownDays: '',
      delayMinutes,
    };
  }

  // Infer from legacy cooldownHours when frequency is missing.
  if (sticky && cooldownHours > 0) {
    if (cooldownHours === 24) return { frequency: 'daily', intervalDays: '1', cooldownDays: '1', delayMinutes };
    if (cooldownHours === 168) return { frequency: 'weekly', intervalDays: '1', cooldownDays: '7', delayMinutes };
    if (cooldownHours === 720) return { frequency: 'monthly', intervalDays: '1', cooldownDays: '30', delayMinutes };
    if (cooldownHours % 24 === 0) {
      return {
        frequency: 'every_n_days',
        intervalDays: String(cooldownHours / 24),
        cooldownDays: String(cooldownHours / 24),
        delayMinutes,
      };
    }
  }

  return {
    frequency: sticky ? 'daily' : '',
    intervalDays: '1',
    cooldownDays: cooldownHours > 0 ? String(cooldownHours / 24) : '',
    delayMinutes,
  };
}

/**
 * @param {string} triggerType
 * @returns {Record<string, unknown>}
 */
export function defaultTriggerForm(triggerType) {
  switch (triggerType) {
    case 'invoice_due_in_days':
      return { daysBeforeDue: 2 };
    case 'invoice_overdue':
    case 'invoice_overdue_staff':
      return { daysAfterDue: 1 };
    case 'low_stock_detected':
      return { thresholdMode: 'reorder_level', fixedThreshold: 5 };
    case 'quote_no_response':
      return { silentDays: 7 };
    case 'customer_inactive_days':
      return { inactiveDays: 30 };
    case 'customer_birthday':
      return {};
    case 'payment_received':
      return {};
    case 'review_request':
      return {};
    case 'job_completed':
      return {};
    case 'daily_sales_summary':
      return { summaryPeriod: 'yesterday' };
    case 'new_lead':
      return {};
    case 'high_value_invoice':
      return { minAmount: 1000 };
    case 'customer_created':
      return {};
    case 'lead_no_contact_days':
      return { noContactDays: 3 };
    case 'invoice_sent':
      return {};
    case 'sale_completed':
      return {};
    case 'order_created':
      return {};
    case 'low_stock_on_change':
      return { thresholdMode: 'reorder_level', fixedThreshold: 5 };
    case 'out_of_stock_detected':
      return {};
    case 'quote_sent':
      return {};
    case 'job_due_in_hours':
      return { hoursBeforeDue: 24 };
    case 'prescription_refill_due':
      return { daysBeforeDue: 3 };
    case 'low_profit_margin':
      return { minMarginPercent: 15 };
    default:
      return {};
  }
}

/**
 * @param {string} triggerType
 * @param {Record<string, unknown>} patch
 */
export function mergeTriggerForm(triggerType, patch = {}) {
  return { ...defaultTriggerForm(triggerType), ...patch };
}

/**
 * @param {string} triggerType
 * @param {Record<string, unknown>} triggerForm
 */
export function buildTriggerConfig(triggerType, triggerForm) {
  const base = defaultTriggerForm(triggerType);
  const merged = { ...base, ...(triggerForm && typeof triggerForm === 'object' ? triggerForm : {}) };
  switch (triggerType) {
    case 'invoice_due_in_days':
      return {
        daysBeforeDue: Math.max(0, Math.min(365, Number(merged.daysBeforeDue) || 0)),
      };
    case 'invoice_overdue':
    case 'invoice_overdue_staff':
      return {
        daysAfterDue: Math.max(0, Math.min(365, Number(merged.daysAfterDue) || 0)),
      };
    case 'low_stock_detected': {
      const mode = merged.thresholdMode === 'fixed' ? 'fixed' : 'reorder_level';
      const out = { thresholdMode: mode };
      if (mode === 'fixed') {
        out.fixedThreshold = Math.max(0, Number(merged.fixedThreshold) || 0);
      }
      return out;
    }
    case 'quote_no_response':
      return {
        silentDays: Math.max(1, Math.min(365, Number(merged.silentDays) || 7)),
      };
    case 'customer_inactive_days':
      return {
        inactiveDays: Math.max(1, Math.min(730, Number(merged.inactiveDays) || 30)),
      };
    case 'customer_birthday':
      return {};
    case 'payment_received':
      return {};
    case 'review_request':
      return {};
    case 'job_completed':
      return {};
    case 'daily_sales_summary':
      return {
        summaryPeriod: merged.summaryPeriod === 'today' ? 'today' : 'yesterday',
      };
    case 'high_value_invoice':
      return {
        minAmount: Math.max(0, Number(merged.minAmount) || 1000),
      };
    case 'lead_no_contact_days':
      return {
        noContactDays: Math.max(1, Math.min(365, Number(merged.noContactDays) || 3)),
      };
    case 'job_due_in_hours':
      return {
        hoursBeforeDue: Math.max(1, Math.min(168, Number(merged.hoursBeforeDue) || 24)),
      };
    case 'prescription_refill_due':
      return {
        daysBeforeDue: Math.max(0, Math.min(30, Number(merged.daysBeforeDue) || 3)),
      };
    case 'low_profit_margin':
      return {
        minMarginPercent: Math.max(0, Math.min(100, Number(merged.minMarginPercent) || 15)),
      };
    case 'low_stock_on_change': {
      const mode = merged.thresholdMode === 'fixed' ? 'fixed' : 'reorder_level';
      const out = { thresholdMode: mode };
      if (mode === 'fixed') {
        out.fixedThreshold = Math.max(0, Number(merged.fixedThreshold) || 0);
      }
      return out;
    }
    case 'new_lead':
    case 'customer_created':
    case 'invoice_sent':
    case 'sale_completed':
    case 'order_created':
    case 'out_of_stock_detected':
    case 'quote_sent':
      return {};
    default:
      return merged && typeof merged === 'object' && !Array.isArray(merged) ? merged : {};
  }
}

/**
 * Default recipient config for internal staff triggers.
 * @param {string} triggerType
 * @returns {{ recipientType: string, recipientRoles: string[], recipientUserId: string }}
 */
export function defaultRecipientFormForTrigger(triggerType) {
  const type = String(triggerType || '');
  if (
    type === 'job_assigned_staff'
    || type === 'job_due_in_hours'
    || type === 'lead_assigned_staff'
    || type === 'task_assigned_staff'
  ) {
    return { recipientType: 'assignee', recipientRoles: [], recipientUserId: '' };
  }
  if (type === 'order_created_staff' || type === 'order_status_staff' || type === 'new_lead_staff') {
    return { recipientType: 'role', recipientRoles: ['owner', 'manager', 'staff'], recipientUserId: '' };
  }
  if (isInternalStaffTrigger(type)) {
    return { recipientType: 'role', recipientRoles: ['owner', 'manager'], recipientUserId: '' };
  }
  return { recipientType: '', recipientRoles: [], recipientUserId: '' };
}

/**
 * Serialize recipient form fields onto an action payload.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} out
 */
function attachRecipientToPayload(row, out) {
  const recipientType = String(row.recipientType || '').trim();
  if (!recipientType) return;
  if (recipientType === 'assignee') {
    out.audience = 'internal';
    out.recipient = { type: 'assignee' };
    return;
  }
  if (recipientType === 'user') {
    const userId = String(row.recipientUserId || '').trim();
    if (!userId) return;
    out.audience = 'internal';
    out.recipient = { type: 'user', userId };
    return;
  }
  if (recipientType === 'role') {
    const roles = Array.isArray(row.recipientRoles)
      ? row.recipientRoles.map((r) => String(r).trim()).filter(Boolean)
      : [];
    if (!roles.length) return;
    out.audience = 'internal';
    out.recipient = { type: 'role', roles };
  }
}

/**
 * Parse recipient from a saved action into form fields.
 * @param {object} action
 * @returns {{ recipientType: string, recipientRoles: string[], recipientUserId: string }}
 */
export function recipientFormFromAction(action = {}) {
  const recipient = action?.recipient;
  if (!recipient || typeof recipient !== 'object') {
    return { recipientType: '', recipientRoles: [], recipientUserId: '' };
  }
  if (recipient.type === 'assignee') {
    return { recipientType: 'assignee', recipientRoles: [], recipientUserId: '' };
  }
  if (recipient.type === 'user') {
    return {
      recipientType: 'user',
      recipientRoles: [],
      recipientUserId: String(recipient.userId || ''),
    };
  }
  if (recipient.type === 'role' || recipient.type === 'roles') {
    return {
      recipientType: 'role',
      recipientRoles: Array.isArray(recipient.roles) ? recipient.roles.map(String) : [],
      recipientUserId: '',
    };
  }
  return { recipientType: '', recipientRoles: [], recipientUserId: '' };
}

/**
 * @param {string} [type]
 * @param {string} [triggerType] - When set, pre-fills messaging fields from DEFAULT_ACTION_CONTENT.
 */
export function defaultActionFormRow(type = 'create_task', triggerType = null) {
  let row;
  switch (type) {
    case 'create_task':
      row = {
        type: 'create_task',
        title: 'Follow up',
        priority: 'medium',
        description: '',
        link: '',
      };
      break;
    case 'send_email_platform':
      row = {
        type: 'send_email_platform',
        subject: '',
        body: '',
        ...defaultRecipientFormForTrigger(triggerType),
      };
      break;
    case 'send_sms':
      row = {
        type: 'send_sms',
        body: '',
        ...defaultRecipientFormForTrigger(triggerType),
      };
      break;
    case 'send_whatsapp':
      row = {
        type: 'send_whatsapp',
        templateName: '',
        language: 'en',
        parametersText: '',
        buttonParametersText: '',
        ...defaultRecipientFormForTrigger(triggerType),
      };
      break;
    default:
      return defaultActionFormRow('create_task', triggerType);
  }
  return triggerType ? prefillActionRow(row, triggerType) : row;
}

/**
 * @param {Record<string, unknown>} row
 */
export function actionFormRowToPayload(row) {
  const t = row?.type || 'create_task';
  if (t === 'create_task') {
    const title = String(row.title || '').trim();
    const out = {
      type: 'create_task',
      title: title || 'Follow up',
      priority: ['low', 'medium', 'high'].includes(row.priority) ? row.priority : 'medium',
    };
    if (String(row.description || '').trim()) out.description = String(row.description).trim();
    if (String(row.link || '').trim()) out.link = String(row.link).trim();
    return out;
  }
  if (t === 'send_email_platform') {
    const out = {
      type: 'send_email_platform',
      subject: String(row.subject || '').trim() || 'Notification',
      body: String(row.body || '').trim(),
    };
    attachRecipientToPayload(row, out);
    return out;
  }
  if (t === 'send_sms') {
    const out = {
      type: 'send_sms',
      body: String(row.body || '').trim(),
    };
    attachRecipientToPayload(row, out);
    return out;
  }
  if (t === 'send_whatsapp') {
    const params = String(row.parametersText ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const buttonParams = String(row.buttonParametersText ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const templateName = String(row.templateName || '').trim();
    const out = {
      type: 'send_whatsapp',
      templateName,
      language: String(row.language || 'en').trim() || 'en',
      parameters: params.length ? params : Array.isArray(row.parameters) ? row.parameters : [],
    };
    // Meta payment_overdue_2 requires a dynamic Pay now URL button.
    if (buttonParams.length > 0) {
      out.buttonParameters = buttonParams;
      out.buttonIndex = 0;
    } else if (templateName === 'payment_reminder') {
      out.buttonParameters = ['{{paymentPath}}'];
      out.buttonIndex = 0;
    }
    attachRecipientToPayload(row, out);
    return out;
  }
  return actionFormRowToPayload(defaultActionFormRow('create_task'));
}

/**
 * @param {{ actions?: unknown[] }} [actionConfig]
 * @returns {Record<string, unknown>[]}
 */
export function actionRowsFromConfig(actionConfig) {
  const raw = actionConfig?.actions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [defaultActionFormRow('create_task')];
  }
  return raw.map((a) => {
    if (!a || typeof a !== 'object') return defaultActionFormRow();
    if (a.type === 'create_task') {
      return {
        type: 'create_task',
        title: a.title ?? '',
        priority: a.priority ?? 'medium',
        description: a.description ?? '',
        link: a.link ?? '',
      };
    }
    if (a.type === 'send_email_platform') {
      return {
        type: 'send_email_platform',
        subject: a.subject ?? '',
        body: a.body ?? '',
        ...recipientFormFromAction(a),
      };
    }
    if (a.type === 'send_sms') {
      return {
        type: 'send_sms',
        body: a.body ?? '',
        ...recipientFormFromAction(a),
      };
    }
    if (a.type === 'send_whatsapp') {
      const params = Array.isArray(a.parameters) ? a.parameters : [];
      const buttonParams = Array.isArray(a.buttonParameters) ? a.buttonParameters : [];
      const templateName = a.templateName ?? '';
      return {
        type: 'send_whatsapp',
        templateName,
        language: a.language ?? 'en',
        parametersText: params.length ? params.join(', ') : '',
        buttonParametersText:
          buttonParams.length > 0
            ? buttonParams.join(', ')
            : templateName === 'payment_reminder'
              ? '{{paymentPath}}'
              : '',
        ...recipientFormFromAction(a),
      };
    }
    return defaultActionFormRow();
  });
}

/**
 * @param {{ minInvoiceAmount?: string, weekdaysOnly?: boolean }} form
 */
export function buildConditionConfig(form) {
  const o = {};
  const addNumberCondition = (valueKey, operatorKey, outValueKey, outOperatorKey, allowedOperators = ['greater_than', 'less_than', 'equal_to']) => {
    const raw = form?.[valueKey];
    if (raw === '' || raw == null || String(raw).trim() === '') return;
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) return;
    o[outValueKey] = n;
    const operator = allowedOperators.includes(form?.[operatorKey]) ? form[operatorKey] : allowedOperators[0];
    o[outOperatorKey] = operator;
  };
  const addBooleanCondition = (formKey, outKey) => {
    if (form?.[formKey] === 'yes') o[outKey] = true;
    if (form?.[formKey] === 'no') o[outKey] = false;
  };

  addNumberCondition('invoiceAmountValue', 'invoiceAmountOperator', 'invoiceAmountValue', 'invoiceAmountOperator');
  addNumberCondition('balanceDueValue', 'balanceDueOperator', 'balanceDueValue', 'balanceDueOperator');
  addNumberCondition('overdueDaysValue', 'overdueDaysOperator', 'overdueDaysValue', 'overdueDaysOperator');
  addNumberCondition('totalSpendValue', 'totalSpendOperator', 'totalSpendValue', 'totalSpendOperator');
  addNumberCondition('quantityValue', 'quantityOperator', 'quantityValue', 'quantityOperator', ['less_than']);

  if (form?.invoiceStatus) o.invoiceStatus = String(form.invoiceStatus);
  if (form?.paymentStatus) o.paymentStatus = String(form.paymentStatus);
  if (form?.birthdayMatch) o.birthdayMatch = String(form.birthdayMatch);

  addBooleanCondition('hasOverdueInvoices', 'hasOverdueInvoices');
  addBooleanCondition('customerHasPhone', 'customerHasPhone');
  addBooleanCondition('customerHasEmail', 'customerHasEmail');
  addBooleanCondition('whatsappConsent', 'whatsappConsent');
  addBooleanCondition('smsConsent', 'smsConsent');
  addBooleanCondition('marketingConsent', 'marketingConsent');

  if (form?.lastPurchaseOlderThanDays !== '' && form?.lastPurchaseOlderThanDays != null) {
    const n = Number(form.lastPurchaseOlderThanDays);
    if (!Number.isNaN(n) && n >= 0) o.lastPurchaseOlderThanDays = n;
  }
  if (form?.stockBelowReorderLevel) o.stockBelowReorderLevel = true;

  // Backward compatibility with older saved builder state.
  const raw = form?.minInvoiceAmount;
  if (raw !== '' && raw != null && String(raw).trim() !== '' && o.invoiceAmountValue == null) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) {
      o.invoiceAmountValue = n;
      o.invoiceAmountOperator = 'greater_than';
      o.minInvoiceAmount = n;
    }
  }
  if (form?.weekdaysOnly) o.weekdaysOnly = true;
  if (form?.runAfterTime) o.runAfterTime = String(form.runAfterTime);
  if (form?.runBeforeTime) o.runBeforeTime = String(form.runBeforeTime);
  return o;
}

/**
 * @param {Record<string, unknown>} conditionConfig
 * @param {Record<string, unknown>} scheduleConfig
 * @param {string} [triggerType]
 */
export function conditionFormFromConfig(conditionConfig, scheduleConfig = {}, triggerType = '') {
  const c = conditionConfig && typeof conditionConfig === 'object' ? conditionConfig : {};
  const s = scheduleConfig && typeof scheduleConfig === 'object' ? scheduleConfig : {};
  const boolToChoice = (value) => (value === true ? 'yes' : value === false ? 'no' : '');
  const legacyMinInvoiceAmount = c.invoiceAmountValue == null && c.minInvoiceAmount != null ? c.minInvoiceAmount : c.invoiceAmountValue;
  const scheduleForm = scheduleFormFromConfig(s, triggerType);
  return {
    minInvoiceAmount: c.minInvoiceAmount != null ? String(c.minInvoiceAmount) : '',
    invoiceAmountOperator: c.invoiceAmountOperator || 'greater_than',
    invoiceAmountValue: legacyMinInvoiceAmount != null ? String(legacyMinInvoiceAmount) : '',
    balanceDueOperator: c.balanceDueOperator || 'greater_than',
    balanceDueValue: c.balanceDueValue != null ? String(c.balanceDueValue) : '',
    invoiceStatus: c.invoiceStatus || '',
    paymentStatus: c.paymentStatus || '',
    overdueDaysOperator: c.overdueDaysOperator || 'greater_than',
    overdueDaysValue: c.overdueDaysValue != null ? String(c.overdueDaysValue) : '',
    hasOverdueInvoices: boolToChoice(c.hasOverdueInvoices),
    customerHasPhone: boolToChoice(c.customerHasPhone),
    customerHasEmail: boolToChoice(c.customerHasEmail),
    whatsappConsent: boolToChoice(c.whatsappConsent),
    smsConsent: boolToChoice(c.smsConsent),
    marketingConsent: boolToChoice(c.marketingConsent),
    lastPurchaseOlderThanDays: c.lastPurchaseOlderThanDays != null ? String(c.lastPurchaseOlderThanDays) : '',
    totalSpendOperator: c.totalSpendOperator || 'greater_than',
    totalSpendValue: c.totalSpendValue != null ? String(c.totalSpendValue) : '',
    birthdayMatch: c.birthdayMatch || '',
    weekdaysOnly: c.weekdaysOnly === true,
    runAfterTime: c.runAfterTime || '',
    runBeforeTime: c.runBeforeTime || '',
    cooldownDays: scheduleForm.cooldownDays,
    frequency: scheduleForm.frequency,
    intervalDays: scheduleForm.intervalDays,
    delayMinutes: scheduleForm.delayMinutes ?? '',
    stockBelowReorderLevel: c.stockBelowReorderLevel === true,
    quantityOperator: c.quantityOperator || 'less_than',
    quantityValue: c.quantityValue != null ? String(c.quantityValue) : '',
  };
}

/**
 * @param {string} raw
 * @param {string} fieldLabel
 * @returns {Record<string, unknown>}
 */
export function parseJsonObject(raw, fieldLabel) {
  const s = (raw ?? '').trim();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} must be a JSON object (e.g. {}).`);
    }
    return parsed;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`${fieldLabel} is not valid JSON.`);
    }
    throw e instanceof Error ? e : new Error(`${fieldLabel} is invalid.`);
  }
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.triggerType
 * @param {Record<string, unknown>} params.triggerForm
 * @param {{ minInvoiceAmount: string, weekdaysOnly: boolean, frequency?: string, intervalDays?: string, cooldownDays?: string }} params.conditionForm
 * @param {Record<string, unknown>[]} params.actionRows
 */
export function buildRulePayloadFromForm({ name, triggerType, triggerForm, conditionForm, actionRows }) {
  const actions = (actionRows || []).map((r) => actionFormRowToPayload(r));
  const scheduleConfig = buildScheduleConfigFromForm(conditionForm, triggerType);
  return {
    name: String(name).trim(),
    triggerType: String(triggerType).trim(),
    triggerConfig: buildTriggerConfig(triggerType, triggerForm),
    conditionConfig: buildConditionConfig(conditionForm),
    actionConfig: { actions },
    scheduleConfig,
  };
}

/** Sentinel Select value meaning "no branch scope" (rule applies to every branch). */
export const ALL_BRANCHES_VALUE = 'all';

/**
 * Resolve a human-readable branch label for an automation rule, given the
 * shop/studio-location lists available in the current workspace.
 * A rule with both shopId and studioLocationId unset applies to all branches.
 * @param {{ shopId?: string|null, studioLocationId?: string|null }} rule
 * @param {{ shops?: Array<{id: string, name: string}>, studioLocations?: Array<{id: string, name: string}> }} [branches]
 * @returns {string}
 */
export function resolveAutomationBranchLabel(rule = {}, branches = {}) {
  const shopId = rule.shopId || null;
  const studioLocationId = rule.studioLocationId || null;
  if (!shopId && !studioLocationId) return 'All branches';
  if (shopId) {
    const shop = (branches.shops || []).find((s) => s.id === shopId);
    return shop?.name || 'Unknown branch';
  }
  const location = (branches.studioLocations || []).find((l) => l.id === studioLocationId);
  return location?.name || 'Unknown branch';
}

/**
 * Build a representative record for manually testing an automation rule.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.triggerType
 * @param {Record<string, unknown>} params.triggerForm
 * @param {{ minInvoiceAmount: string, weekdaysOnly: boolean }} params.conditionForm
 * @param {Record<string, unknown>[]} params.actionRows
 * @returns {Record<string, unknown>}
 */
export function buildTestContextFromForm({ name, triggerType, triggerForm, conditionForm, actionRows }) {
  const payload = buildRulePayloadFromForm({ name, triggerType, triggerForm, conditionForm, actionRows });
  const minAmount = Number(payload.conditionConfig?.minInvoiceAmount || 0);
  const amountCondition = Number(payload.conditionConfig?.invoiceAmountValue || minAmount || 0);
  const matchingNumber = (value, operator, fallback = 100) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (operator === 'less_than') return Math.max(0, n - 1);
    if (operator === 'equal_to') return n;
    return n + 10;
  };
  const amount = Math.max(0, matchingNumber(amountCondition, payload.conditionConfig?.invoiceAmountOperator, 100));
  const balance = Math.max(0, matchingNumber(payload.conditionConfig?.balanceDueValue ?? amount, payload.conditionConfig?.balanceDueOperator, amount));
  const totalSpend = Math.max(0, matchingNumber(payload.conditionConfig?.totalSpendValue ?? amount * 3, payload.conditionConfig?.totalSpendOperator, amount * 3));
  const quantityOnHand = Math.max(0, matchingNumber(payload.conditionConfig?.quantityValue ?? 2, payload.conditionConfig?.quantityOperator, 2));
  const today = new Date();
  const sampleDueDate = new Date(today);
  if (payload.triggerType === 'invoice_overdue') {
    sampleDueDate.setDate(today.getDate() - Number(payload.triggerConfig?.daysAfterDue ?? 1));
  } else {
    sampleDueDate.setDate(today.getDate() + Number(payload.triggerConfig?.daysBeforeDue ?? 2));
  }
  const dueDateIso = sampleDueDate.toISOString().slice(0, 10);

  const customer = {
    id: 'test-customer',
    name: 'Test Customer',
    company: 'Test Customer Co.',
    email: '',
    phone: '',
    dateOfBirth: today.toISOString().slice(0, 10),
    whatsappConsent: true,
    smsConsent: true,
    marketingConsent: true,
  };
  const invoice = {
    id: 'test-invoice',
    invoiceNumber: 'INV-TEST-0001',
    customerId: customer.id,
    totalAmount: amount,
    amountPaid: 0,
    balance,
    dueDate: dueDateIso,
    status: payload.conditionConfig?.invoiceStatus || (payload.triggerType === 'invoice_overdue' ? 'overdue' : 'sent'),
    paymentToken: 'test',
  };
  const quote = {
    id: 'test-quote',
    quoteNumber: 'QTE-TEST-0001',
    customerId: customer.id,
    totalAmount: amount,
  };
  const product = {
    id: 'test-product',
    name: 'Test Product',
    sku: 'TEST-SKU',
    quantityOnHand,
    reorderLevel: 5,
    isActive: true,
  };

  return {
    subjectKey: `test:${payload.triggerType}:${Date.now()}`,
    triggerType: payload.triggerType,
    scheduler: false,
    manualTest: true,
    test: true,
    businessName: 'Test Business',
    customerId: customer.id,
    customerName: customer.name,
    email: customer.email,
    phone: customer.phone,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantityOnHand: product.quantityOnHand,
    reorderLevel: product.reorderLevel,
    amount,
    balance,
    totalAmount: amount,
    invoiceStatus: invoice.status,
    paymentStatus: payload.conditionConfig?.paymentStatus || 'unpaid',
    overdueDays: matchingNumber(payload.conditionConfig?.overdueDaysValue ?? (payload.triggerType === 'invoice_overdue' ? Number(payload.triggerConfig?.daysAfterDue || 1) : 0), payload.conditionConfig?.overdueDaysOperator, 0),
    hasOverdueInvoices: payload.conditionConfig?.hasOverdueInvoices ?? (payload.triggerType === 'invoice_overdue'),
    customerHasPhone: false,
    customerHasEmail: false,
    whatsappConsent: true,
    smsConsent: true,
    marketingConsent: true,
    lastPurchaseDaysAgo: 45,
    totalSpend,
    dueDate: invoice.dueDate,
    paymentLink: 'http://localhost:3000/pay-invoice/test',
    paymentPath: 'pay-invoice/test',
    balanceFormatted: `GHS ${Number(balance).toFixed(2)}`,
    reviewLink: 'http://localhost:3000/review/sample-workspace',
    reviewUrl: 'http://localhost:3000/review/sample-workspace',
    jobNumber: 'JOB-TEST-0001',
    jobTitle: 'Sample print job',
    trackingLink: 'http://localhost:3000/track-job/sample-token',
    trackingLinkLine: 'Track your order: http://localhost:3000/track-job/sample-token',
    saleNumber: 'SALE-TEST-0001',
    orderNumber: 'SALE-TEST-0001',
    sourceNumber: 'JOB-TEST-0001',
    leadName: 'Sample Lead',
    leadCompany: 'Sample Lead Co',
    leadSource: 'website',
    noContactDays: 3,
    quoteTitle: 'Sample quote',
    quoteLink: 'http://localhost:3000/view-quote/sample',
    totalAmountFormatted: `GHS ${amount.toFixed(2)}`,
    profitMargin: 12.5,
    profitMarginFormatted: '12.5%',
    minMarginPercent: 15,
    prescriptionNumber: 'RX-TEST-0001',
    refillDueDate: dueDateIso,
    hoursBeforeDue: 24,
    date: today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    periodLabel: payload.triggerType === 'daily_sales_summary' && payload.triggerConfig?.summaryPeriod === 'today' ? 'today' : 'yesterday',
    totalSales: amount,
    totalSalesFormatted: `GHS ${amount.toFixed(2)}`,
    transactionCount: 12,
    topProducts: 'Sample Product A (GHS 450.00), Sample Product B (GHS 320.00)',
    message: `Test automation run for ${payload.name || 'automation rule'}.`,
    customer,
    invoice,
    quote,
    product,
  };
}

export function triggerLabel(triggerType) {
  return TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.label || triggerType;
}

export function actionTypeLabel(actionType) {
  return ACTION_TYPE_OPTIONS.find((o) => o.value === actionType)?.label || actionType;
}

/**
 * Messaging action types on a rule/payload (email / SMS / WhatsApp).
 * @param {{ actionConfig?: { actions?: Array<{ type?: string }> } }|null|undefined} ruleOrPayload
 * @returns {string[]}
 */
export function getMessagingActionTypesFromRule(ruleOrPayload) {
  const actions = ruleOrPayload?.actionConfig?.actions;
  if (!Array.isArray(actions)) return [];
  return [...new Set(
    actions
      .map((action) => String(action?.type || '').trim())
      .filter((type) => MESSAGING_ACTION_TYPES.includes(type))
  )].sort();
}

/**
 * @param {{ shopId?: string|null, studioLocationId?: string|null }} a
 * @param {{ shopId?: string|null, studioLocationId?: string|null }} b
 * @returns {boolean}
 */
export function sameAutomationBranchScope(a = {}, b = {}) {
  return String(a?.shopId || '') === String(b?.shopId || '')
    && String(a?.studioLocationId || '') === String(b?.studioLocationId || '');
}

/**
 * Normalize automation rule ids for duplicate-exclusion comparisons.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeAutomationRuleId(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Find an existing automation with the same trigger + messaging channel(s) + branch scope.
 * Prevents repeated birthday/email (etc.) rules.
 * @param {Array<object>} existingRules
 * @param {object} candidate - create/update payload
 * @param {{ excludeRuleId?: string|null }} [options]
 * @returns {object|null}
 */
export function findDuplicateAutomationRule(existingRules, candidate, options = {}) {
  const triggerType = String(candidate?.triggerType || '').trim();
  if (!triggerType) return null;

  const candidateChannels = getMessagingActionTypesFromRule(candidate);
  if (!candidateChannels.length) return null;

  const excludeRuleId = normalizeAutomationRuleId(
    options.excludeRuleId ?? candidate?.id ?? null
  );
  const match = (existingRules || []).find((rule) => {
    if (!rule) return false;
    const ruleId = normalizeAutomationRuleId(rule.id);
    if (excludeRuleId && ruleId && ruleId === excludeRuleId) return false;
    if (String(rule.triggerType || '').trim() !== triggerType) return false;
    if (!sameAutomationBranchScope(rule, candidate)) return false;
    const existingChannels = getMessagingActionTypesFromRule(rule);
    return candidateChannels.some((channel) => existingChannels.includes(channel));
  });

  return match || null;
}

/**
 * User-facing message when a duplicate messaging automation already exists.
 * @param {object} existingRule
 * @param {object} candidate
 * @returns {string}
 */
export function describeAutomationDuplicateConflict(existingRule, candidate) {
  const trigger = triggerLabel(candidate?.triggerType);
  const channels = getMessagingActionTypesFromRule(candidate)
    .map((type) => actionTypeLabel(type))
    .join(' / ');
  const existingName = String(existingRule?.name || 'an existing rule').trim() || 'an existing rule';
  const channelBit = channels || 'the same channel';
  return `A "${trigger}" automation with ${channelBit} already exists ("${existingName}"). Open that rule to edit it instead of creating another.`;
}

