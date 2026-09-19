/**
 * Business-type eligibility for automation triggers and templates.
 * Resolved types: shop | studio | pharmacy | rental. Feature gates: quotes (not restaurant), orders (restaurant shops).
 */

const {
  resolveBusinessType,
  getTenantShopType,
  isQuotesEnabledForTenant,
  ORDERS_ENABLED_SHOP_TYPES,
} = require('../config/businessTypes');

const ALL_RESOLVED_TYPES = Object.freeze(['shop', 'studio', 'pharmacy', 'rental']);

/**
 * Trigger → resolved business types (+ optional feature gates).
 * Gates: requiresQuotes (quotes enabled), requiresOrders (restaurant shopType).
 */
const TRIGGER_ELIGIBILITY = Object.freeze({
  // Shop: stock / sales / profit / daily sales
  low_stock_detected: { allowedBusinessTypes: ['shop'] },
  low_stock_on_change: { allowedBusinessTypes: ['shop'] },
  out_of_stock_detected: { allowedBusinessTypes: ['shop'] },
  sale_completed: { allowedBusinessTypes: ['shop'] },
  sale_completed_staff: { allowedBusinessTypes: ['shop'] },
  low_profit_margin: { allowedBusinessTypes: ['shop'] },
  daily_sales_summary: { allowedBusinessTypes: ['shop'] },
  product_expiring: { allowedBusinessTypes: ['shop', 'pharmacy'] },

  // Shop + restaurant orders
  order_created: { allowedBusinessTypes: ['shop'], requiresOrders: true },
  order_created_staff: { allowedBusinessTypes: ['shop'], requiresOrders: true },
  order_status_staff: { allowedBusinessTypes: ['shop'], requiresOrders: true },

  // Studio: jobs
  job_completed: { allowedBusinessTypes: ['studio'] },
  job_completed_staff: { allowedBusinessTypes: ['studio'] },
  job_due_in_hours: { allowedBusinessTypes: ['studio'] },
  job_created: { allowedBusinessTypes: ['studio'] },
  job_created_staff: { allowedBusinessTypes: ['studio'] },
  job_assigned_staff: { allowedBusinessTypes: ['studio'] },

  // Pharmacy
  prescription_refill_due: { allowedBusinessTypes: ['pharmacy'] },

  // Rental lifecycle
  rental_created: { allowedBusinessTypes: ['rental'] },
  rental_created_staff: { allowedBusinessTypes: ['rental'] },
  rental_checked_out: { allowedBusinessTypes: ['rental'] },
  rental_returned: { allowedBusinessTypes: ['rental'] },
  rental_returned_staff: { allowedBusinessTypes: ['rental'] },
  rental_cancelled: { allowedBusinessTypes: ['rental'] },
  rental_due_in_days: { allowedBusinessTypes: ['rental'] },
  rental_overdue: { allowedBusinessTypes: ['rental'] },
  rental_overdue_staff: { allowedBusinessTypes: ['rental'] },

  // Quotes: studio + pharmacy + shop except restaurant
  quote_no_response: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },
  quote_sent: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },
  quote_accepted_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },

  // All business types
  invoice_due_in_days: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  invoice_overdue: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  invoice_overdue_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  invoice_sent: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  invoice_paid_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  high_value_invoice: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  payment_received: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  payment_received_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  customer_inactive_days: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  customer_birthday: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  customer_created: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  new_lead: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  new_lead_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  lead_assigned_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  lead_no_contact_days: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  task_assigned_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  review_request: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
});

/**
 * @param {object|null|undefined} tenant
 * @returns {{ resolvedType: string, shopType: string|null, quotesEnabled: boolean, ordersEnabled: boolean }}
 */
function getTenantAutomationContext(tenant) {
  const resolvedType = resolveBusinessType(tenant?.businessType);
  const shopType = getTenantShopType(tenant);
  const quotesEnabled = isQuotesEnabledForTenant(tenant?.businessType, shopType);
  const ordersEnabled =
    resolvedType === 'shop' && ORDERS_ENABLED_SHOP_TYPES.includes(shopType || '');
  return { resolvedType, shopType, quotesEnabled, ordersEnabled };
}

/**
 * @param {string} triggerType
 * @returns {{ allowedBusinessTypes: string[], requiresQuotes?: boolean, requiresOrders?: boolean }|null}
 */
function getTriggerEligibility(triggerType) {
  return TRIGGER_ELIGIBILITY[String(triggerType || '')] || null;
}

/**
 * @param {string} triggerType
 * @param {object|null|undefined} tenant
 * @returns {boolean}
 */
function isTriggerAllowedForTenant(triggerType, tenant) {
  const eligibility = getTriggerEligibility(triggerType);
  if (!eligibility) return false;
  const ctx = getTenantAutomationContext(tenant);
  if (!eligibility.allowedBusinessTypes.includes(ctx.resolvedType)) return false;
  if (eligibility.requiresQuotes && !ctx.quotesEnabled) return false;
  if (eligibility.requiresOrders && !ctx.ordersEnabled) return false;
  return true;
}

/**
 * Annotate a template with eligibility metadata derived from its triggerType (and optional overrides).
 * @param {object} template
 * @returns {object}
 */
function annotateTemplateEligibility(template) {
  const eligibility = getTriggerEligibility(template?.triggerType) || {
    allowedBusinessTypes: ALL_RESOLVED_TYPES,
  };
  const overrideTypes = Array.isArray(template?.allowedBusinessTypes)
    ? template.allowedBusinessTypes
    : eligibility.allowedBusinessTypes;
  const requiresQuotes =
    template?.requiresQuotes === true || eligibility.requiresQuotes === true;
  const requiresOrders =
    template?.requiresOrders === true || eligibility.requiresOrders === true;
  return {
    ...template,
    allowedBusinessTypes: [...overrideTypes],
    ...(requiresQuotes ? { requiresQuotes: true } : {}),
    ...(requiresOrders ? { requiresOrders: true } : {}),
  };
}

/**
 * @param {object[]} templates
 * @param {object|null|undefined} tenant
 * @returns {object[]}
 */
function filterTemplatesForTenant(templates, tenant) {
  const ctx = getTenantAutomationContext(tenant);
  return (templates || [])
    .map(annotateTemplateEligibility)
    .filter((template) => {
      if (!template.allowedBusinessTypes.includes(ctx.resolvedType)) return false;
      if (template.requiresQuotes && !ctx.quotesEnabled) return false;
      if (template.requiresOrders && !ctx.ordersEnabled) return false;
      return true;
    });
}

/**
 * @param {string[]} triggerTypes
 * @param {object|null|undefined} tenant
 * @returns {string[]}
 */
function filterTriggerTypesForTenant(triggerTypes, tenant) {
  return (triggerTypes || []).filter((triggerType) => isTriggerAllowedForTenant(triggerType, tenant));
}

module.exports = {
  ALL_RESOLVED_TYPES,
  TRIGGER_ELIGIBILITY,
  getTenantAutomationContext,
  getTriggerEligibility,
  isTriggerAllowedForTenant,
  annotateTemplateEligibility,
  filterTemplatesForTenant,
  filterTriggerTypesForTenant,
};
