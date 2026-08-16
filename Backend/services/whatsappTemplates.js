/**
 * WhatsApp Message Templates
 * Defines template structures for WhatsApp Business API messages
 * Note: Templates must be pre-approved in Meta Business Manager
 */

const TEMPLATES = {
  invoice_notification: {
    name: 'invoice_notification',
    language: 'en',
    description: 'Send invoice with payment link',
    parameters: ['customerName', 'invoiceNumber', 'amount', 'paymentLink'],
    example: 'Hello {{1}}, your invoice {{2}} for {{3}} is ready. Pay online: {{4}}'
  },
  quote_delivery: {
    name: 'quote_delivery',
    language: 'en',
    description: 'Send quote/proposal to customer',
    parameters: ['customerName', 'quoteNumber', 'title', 'quoteLink'],
    example: 'Hi {{1}}, your quote {{2}} for {{3}} is ready. View here: {{4}}'
  },
  order_confirmation: {
    name: 'order_confirmation',
    language: 'en',
    description: 'Confirm order/job creation',
    parameters: ['customerName', 'orderNumber'],
    example: "Thank you {{1}}! Your order {{2}} has been confirmed. We'll notify you when it's ready."
  },
  payment_reminder: {
    name: 'payment_reminder',
    language: 'en',
    description: 'Remind customer about overdue payment',
    parameters: ['invoiceNumber', 'amount', 'paymentLink'],
    example: 'Reminder: Invoice {{1}} for {{2}} is overdue. Please pay: {{3}}'
  },
  payment_received: {
    name: 'payment_received',
    language: 'en',
    description: 'Thank customer after a payment is recorded',
    parameters: ['customerName', 'invoiceNumber', 'amount', 'businessName'],
    example: 'Hi {{1}}, thank you! We received {{3}} for invoice {{2}}. — {{4}}'
  },
  low_stock_alert: {
    name: 'low_stock_alert',
    language: 'en',
    description: 'Alert shop owner about low stock',
    parameters: ['productName', 'currentStock', 'reorderLevel'],
    example: 'Alert: {{1}} is running low. Current stock: {{2}}, Reorder level: {{3}}'
  },
  sale_receipt: {
    name: 'sale_receipt',
    language: 'en',
    description: 'Send POS sale receipt summary',
    parameters: ['customerName', 'saleNumber', 'amount', 'businessName'],
    example: 'Hello {{1}}, receipt {{2}} for {{3}} from {{4}} is ready. Thank you for your purchase.'
  },
  order_created: {
    name: 'order_created',
    language: 'en',
    description: 'Notify customer when an order is created',
    parameters: ['customerName', 'orderNumber', 'amount', 'businessName'],
    example: 'Hello {{1}}, your order {{2}} for {{3}} from {{4}} has been received.'
  },
  review_request: {
    name: 'review_request',
    language: 'en',
    description: 'Ask customer to leave a review after service or sale',
    parameters: ['customerName', 'businessName', 'reviewLink'],
    example: 'Hi {{1}}, thank you for choosing {{2}}! We would love your feedback: {{3}}'
  },
  job_completed: {
    name: 'job_completed',
    language: 'en',
    description: 'Notify customer when a job or service is completed',
    parameters: ['customerName', 'jobNumber', 'businessName'],
    example: 'Hi {{1}}, your job {{2}} is complete. — {{3}}'
  },
  birthday_greeting: {
    name: 'birthday_greeting',
    language: 'en',
    description: 'Send a birthday greeting to a customer',
    parameters: ['customerName'],
    example: 'Happy birthday {{1}}! Wishing you a wonderful day.'
  },
  win_back: {
    name: 'win_back',
    language: 'en',
    description: 'Win-back message for inactive customers',
    parameters: ['customerName', 'businessName'],
    example: 'Hi {{1}}, we miss you at {{2}}! Come back soon.'
  },
  quote_follow_up: {
    name: 'quote_follow_up',
    language: 'en',
    description: 'Follow up on a quote with no response',
    parameters: ['customerName', 'quoteNumber', 'businessName'],
    example: 'Hi {{1}}, just checking in on quote {{2}} from {{3}}.'
  },
  welcome_customer: {
    name: 'welcome_customer',
    language: 'en',
    description: 'Welcome a newly created customer',
    parameters: ['customerName', 'businessName'],
    example: 'Hi {{1}}, welcome to {{2}}! We look forward to serving you.'
  },
  new_lead_alert: {
    name: 'new_lead_alert',
    language: 'en',
    description: 'Alert staff when a new lead is added',
    parameters: ['leadName', 'leadSource', 'businessName'],
    example: 'New lead: {{1}} from {{2}}. — {{3}}'
  },
  lead_follow_up: {
    name: 'lead_follow_up',
    language: 'en',
    description: 'Follow up a lead with no recent contact',
    parameters: ['leadName', 'noContactDays', 'businessName'],
    example: 'Follow up {{1}} — no contact for {{2}} days. — {{3}}'
  },
  prescription_refill: {
    name: 'prescription_refill',
    language: 'en',
    description: 'Remind a customer that a prescription refill is due',
    parameters: ['customerName', 'prescriptionNumber', 'refillDueDate', 'businessName'],
    example: 'Hi {{1}}, prescription {{2}} refill is due {{3}}. — {{4}}'
  },
  low_profit_alert: {
    name: 'low_profit_alert',
    language: 'en',
    description: 'Alert staff when a sale has a low profit margin',
    parameters: ['saleNumber', 'profitMarginFormatted', 'businessName'],
    example: 'Low margin sale {{1}}: {{2}}. — {{3}}'
  },
  daily_sales_summary: {
    name: 'daily_sales_summary',
    language: 'en',
    description: 'Daily sales recap for shop owners',
    parameters: ['date', 'totalSalesFormatted', 'transactionCount', 'businessName'],
    example: 'Daily sales ({{1}}): {{2}} from {{3}} transactions. — {{4}}'
  }
};

/**
 * Format currency amount for display
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: GHS)
 * @returns {string} - Formatted amount
 */
function formatCurrency(amount, currency = 'GHS') {
  const numAmount = parseFloat(amount) || 0;
  return `${currency} ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Prepare template parameters for invoice notification
 * @param {Object} invoice - Invoice object
 * @param {Object} customer - Customer object
 * @param {string} paymentLink - Payment link URL
 * @returns {Array} - Template parameters array
 */
function prepareInvoiceNotification(invoice, customer, paymentLink) {
  return [
    customer.name || customer.company || 'Customer',
    invoice.invoiceNumber || 'N/A',
    formatCurrency(invoice.totalAmount || invoice.balance),
    paymentLink
  ];
}

/**
 * Prepare template parameters for quote delivery
 * @param {Object} quote - Quote object
 * @param {Object} customer - Customer object
 * @param {string} quoteLink - Quote link URL
 * @returns {Array} - Template parameters array
 */
function prepareQuoteDelivery(quote, customer, quoteLink) {
  return [
    customer.name || customer.company || 'Customer',
    quote.quoteNumber || 'N/A',
    quote.title || 'Quote',
    quoteLink
  ];
}

/**
 * Prepare template parameters for order confirmation
 * @param {Object} order - Job/Order object
 * @param {Object} customer - Customer object
 * @returns {Array} - Template parameters array
 */
function prepareOrderConfirmation(order, customer) {
  const orderNumber = order.jobNumber || order.saleNumber || order.prescriptionNumber || 'N/A';
  return [
    customer.name || customer.company || 'Customer',
    orderNumber
  ];
}

/**
 * Prepare template parameters for payment reminder
 * @param {Object} invoice - Invoice object
 * @param {string} paymentLink - Payment link URL
 * @returns {Array} - Template parameters array
 */
function preparePaymentReminder(invoice, paymentLink) {
  return [
    invoice.invoiceNumber || 'N/A',
    formatCurrency(invoice.balance || invoice.totalAmount),
    paymentLink
  ];
}

/**
 * Prepare template parameters for low stock alert
 * @param {Object} product - Product object
 * @returns {Array} - Template parameters array
 */
function prepareLowStockAlert(product) {
  return [
    product.name || 'Product',
    String(product.quantity || 0),
    String(product.reorderLevel || 0)
  ];
}

function prepareSaleReceipt(sale) {
  const customer = sale.customer || {};
  const business = sale.shop?.name || sale.tenant?.name || 'Business';
  return [
    customer.name || customer.company || 'Customer',
    sale.saleNumber || 'N/A',
    formatCurrency(sale.total || 0),
    business
  ];
}

function prepareOrderCreated(sale) {
  const customer = sale.customer || {};
  const business = sale.shop?.name || sale.tenant?.name || 'Business';
  return [
    customer.name || customer.company || 'Customer',
    sale.saleNumber || 'N/A',
    formatCurrency(sale.total || 0),
    business
  ];
}

/**
 * Get template definition
 * @param {string} templateName - Template name
 * @returns {Object|null} - Template definition or null
 */
function getTemplate(templateName) {
  return TEMPLATES[templateName] || null;
}

/**
 * Catalog for Settings and Automations UI (Meta template names to create).
 * @returns {Array<{ name: string, language: string, description: string, parameters: string[], example: string }>}
 */
function listTemplates() {
  return Object.values(TEMPLATES).map((template) => ({
    name: template.name,
    language: template.language,
    description: template.description,
    parameters: [...template.parameters],
    example: template.example
  }));
}

/**
 * Validate template parameters
 * @param {string} templateName - Template name
 * @param {Array} parameters - Parameters to validate
 * @returns {boolean} - True if valid
 */
function validateParameters(templateName, parameters) {
  const template = getTemplate(templateName);
  if (!template) return false;
  
  return parameters.length === template.parameters.length;
}

module.exports = {
  TEMPLATES,
  formatCurrency,
  prepareInvoiceNotification,
  prepareQuoteDelivery,
  prepareOrderConfirmation,
  preparePaymentReminder,
  prepareLowStockAlert,
  prepareSaleReceipt,
  prepareOrderCreated,
  getTemplate,
  validateParameters,
  listTemplates
};
