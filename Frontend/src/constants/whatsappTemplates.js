/**
 * Fallback WhatsApp template catalog when Settings API has not loaded yet.
 * Names must match Backend/services/whatsappTemplates.js and Meta template names.
 */
export const WHATSAPP_TEMPLATES = [
  { name: 'invoice_notification', description: 'Invoice with payment link', parameters: ['customerName', 'invoiceNumber', 'amount', 'paymentLink'] },
  { name: 'quote_delivery', description: 'Quote / proposal', parameters: ['customerName', 'quoteNumber', 'title', 'quoteLink'] },
  { name: 'order_confirmation', description: 'Order or job confirmation', parameters: ['customerName', 'orderNumber'] },
  { name: 'payment_reminder', description: 'Overdue invoice reminder (Pay now button)', parameters: ['customerName', 'invoiceNumber', 'balanceFormatted', 'dueDate'], buttonParameters: ['paymentPath'] },
  { name: 'payment_received', description: 'Thank you after payment', parameters: ['customerName', 'invoiceNumber', 'amount', 'businessName'] },
  { name: 'low_stock_alert', description: 'Low stock alert', parameters: ['productName', 'currentStock', 'reorderLevel'] },
  { name: 'sale_receipt', description: 'POS sale receipt', parameters: ['customerName', 'saleNumber', 'amount', 'businessName'] },
  { name: 'order_created', description: 'Order received', parameters: ['customerName', 'orderNumber', 'amount', 'businessName'] },
  { name: 'review_request', description: 'Ask for a review', parameters: ['customerName', 'businessName', 'reviewLink'] },
  { name: 'job_completed', description: 'Job completed', parameters: ['customerName', 'jobNumber', 'businessName'] },
  { name: 'birthday_greeting', description: 'Birthday greeting', parameters: ['customerName'] },
  { name: 'win_back', description: 'Win-back inactive customers', parameters: ['customerName', 'businessName'] },
  { name: 'quote_follow_up', description: 'Quote with no response', parameters: ['customerName', 'quoteNumber', 'businessName'] },
  { name: 'welcome_customer', description: 'Welcome a new customer', parameters: ['customerName', 'businessName'] },
  { name: 'new_lead_alert', description: 'New lead alert', parameters: ['leadName', 'leadSource', 'businessName'] },
  { name: 'lead_follow_up', description: 'Lead with no contact', parameters: ['leadName', 'noContactDays', 'businessName'] },
  { name: 'prescription_refill', description: 'Prescription refill due', parameters: ['customerName', 'prescriptionNumber', 'refillDueDate', 'businessName'] },
  { name: 'low_profit_alert', description: 'Low margin sale', parameters: ['saleNumber', 'profitMarginFormatted', 'businessName'] },
  { name: 'daily_sales_summary', description: 'Daily sales recap', parameters: ['date', 'totalSalesFormatted', 'transactionCount', 'businessName'] },
];

/**
 * @param {{ parameters?: string[] }} template
 * @returns {string}
 */
export function parametersTextFromTemplate(template) {
  return (template?.parameters || []).map((name) => `{{${name}}}`).join(', ');
}

/**
 * @param {{ buttonParameters?: string[] }} template
 * @returns {string}
 */
export function buttonParametersTextFromTemplate(template) {
  return (template?.buttonParameters || []).map((name) => `{{${name}}}`).join(', ');
}
