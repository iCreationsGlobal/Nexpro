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
    description: 'Overdue invoice reminder with Pay now button (Meta payment_overdue_2)',
    parameters: ['customerName', 'invoiceNumber', 'balanceFormatted', 'dueDate'],
    buttonParameters: ['paymentPath'],
    /**
     * Meta library: payment_overdue_2
     * Body: Hi {{1}}, Account {{2}}, Amount {{3}}, Due date {{4}}
     * Button: Pay now → {FRONTEND_URL}/{{1}} where {{1}} is paymentPath (pay-invoice/TOKEN)
     */
    example:
      'Hi {{1}}, you have a payment overdue: Account: {{2}}. Amount due: {{3}}. Due date: {{4}}. Use the Pay now button to complete payment.'
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
  job_completed: {
    name: 'job_completed',
    language: 'en',
    description: 'Notify customer when a job or service is completed',
    parameters: ['customerName', 'jobNumber', 'businessName'],
    example: 'Hi {{1}}, your job {{2}} is complete. — {{3}}'
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
 * Format invoice due date for WhatsApp body (Meta {{date}} as text).
 * @param {Date|string|null|undefined} dueDate
 * @returns {string}
 */
function formatDueDate(dueDate) {
  if (!dueDate) return 'N/A';
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return String(dueDate);
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Prepare body parameters for payment_reminder (Meta payment_overdue_2).
 * @param {Object} invoice - Invoice object
 * @param {Object} [customer] - Customer object (falls back to invoice.customer)
 * @returns {string[]} - [customerName, invoiceNumber, balanceFormatted, dueDate]
 */
function preparePaymentReminder(invoice, customer = null) {
  const cust = customer || invoice?.customer || {};
  return [
    cust.name || cust.company || 'Customer',
    invoice?.invoiceNumber || 'N/A',
    formatCurrency(invoice?.balance || invoice?.totalAmount),
    formatDueDate(invoice?.dueDate)
  ];
}

/**
 * Dynamic URL button suffix for payment_reminder Pay now button.
 * @param {Object} invoice - Invoice with paymentToken
 * @returns {string[]} - Empty if no path; otherwise [paymentPath]
 */
function preparePaymentReminderButtonParameters(invoice) {
  const { buildInvoicePaymentPathParam } = require('../utils/frontendUrl');
  const path = buildInvoicePaymentPathParam(invoice);
  return path ? [path] : [];
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
 * Catalog for the WhatsApp settings UI (Meta template names to create).
 * @returns {Array<{ name: string, language: string, description: string, parameters: string[], example: string }>}
 */
function listTemplates() {
  return Object.values(TEMPLATES).map((template) => ({
    name: template.name,
    language: template.language,
    description: template.description,
    parameters: [...template.parameters],
    buttonParameters: Array.isArray(template.buttonParameters) ? [...template.buttonParameters] : [],
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
  preparePaymentReminderButtonParameters,
  prepareLowStockAlert,
  prepareSaleReceipt,
  prepareOrderCreated,
  getTemplate,
  validateParameters,
  listTemplates
};
