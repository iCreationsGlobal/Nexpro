/**
 * Business events: the single hand-off point for Lynk (see .plans/abs-simplify-lynk-powered.md).
 * Advanced automations, insights and Watch run on Lynk; ABS only reports what happened.
 * For now events are dropped. Callers fire and forget.
 */

const BUSINESS_EVENT_TYPES = Object.freeze([
  'sale.completed',
  'order.created',
  'order.status_changed',
  'invoice.sent',
  'invoice.paid',
  'payment.received',
  'quote.sent',
  'quote.accepted',
  'job.created',
  'job.assigned',
  'job.completed',
  'lead.created',
  'lead.assigned',
  'customer.created',
  'stock.low',
  'stock.out',
  'task.assigned',
  'rental.created',
  'rental.checked_out',
  'rental.returned',
  'rental.cancelled',
]);

const BUSINESS_EVENT_TYPE_SET = new Set(BUSINESS_EVENT_TYPES);

/**
 * Report a business event. Never throws and never blocks the caller.
 * @param {string} tenantId
 * @param {string} type - One of BUSINESS_EVENT_TYPES
 * @param {Record<string, string|number|boolean|null>} [data] - Minimal ids (saleId, customerId, …)
 * @returns {void}
 */
function emitBusinessEvent(tenantId, type, data = {}) {
  if (!tenantId || !BUSINESS_EVENT_TYPE_SET.has(type)) return;
  // Step 3: send { tenantId, type, data } to Lynk here, off the request path, errors swallowed.
}

module.exports = {
  BUSINESS_EVENT_TYPES,
  emitBusinessEvent,
};
