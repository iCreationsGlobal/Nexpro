/**
 * Frontend mirror of Backend/utils/automationBusinessType.js for trigger filtering in the builder.
 */

import { STUDIO_LIKE_TYPES, isQuotesEnabledForTenant, QUOTES_HIDDEN_SHOP_TYPES } from '../constants';

const ALL_RESOLVED_TYPES = Object.freeze(['shop', 'studio', 'pharmacy', 'rental']);
const ORDERS_ENABLED_SHOP_TYPES = Object.freeze(['restaurant']);

/**
 * @param {string|null|undefined} businessType
 * @returns {'shop'|'studio'|'pharmacy'|'rental'}
 */
export function resolveBusinessType(businessType) {
  if (!businessType) return 'shop';
  if (STUDIO_LIKE_TYPES.includes(businessType) || businessType === 'studio') return 'studio';
  if (businessType === 'pharmacy') return 'pharmacy';
  if (businessType === 'shop') return 'shop';
  if (businessType === 'rental') return 'rental';
  return 'shop';
}

/**
 * Trigger → resolved business types (+ optional feature gates).
 */
export const TRIGGER_ELIGIBILITY = Object.freeze({
  low_stock_detected: { allowedBusinessTypes: ['shop'] },
  low_stock_on_change: { allowedBusinessTypes: ['shop'] },
  out_of_stock_detected: { allowedBusinessTypes: ['shop'] },
  sale_completed: { allowedBusinessTypes: ['shop'] },
  sale_completed_staff: { allowedBusinessTypes: ['shop'] },
  low_profit_margin: { allowedBusinessTypes: ['shop'] },
  daily_sales_summary: { allowedBusinessTypes: ['shop'] },
  order_created: { allowedBusinessTypes: ['shop'], requiresOrders: true },
  order_created_staff: { allowedBusinessTypes: ['shop'], requiresOrders: true },
  order_status_staff: { allowedBusinessTypes: ['shop'], requiresOrders: true },
  job_completed: { allowedBusinessTypes: ['studio'] },
  job_completed_staff: { allowedBusinessTypes: ['studio'] },
  job_due_in_hours: { allowedBusinessTypes: ['studio'] },
  job_created: { allowedBusinessTypes: ['studio'] },
  job_created_staff: { allowedBusinessTypes: ['studio'] },
  job_assigned_staff: { allowedBusinessTypes: ['studio'] },
  prescription_refill_due: { allowedBusinessTypes: ['pharmacy'] },
  rental_created: { allowedBusinessTypes: ['rental'] },
  rental_created_staff: { allowedBusinessTypes: ['rental'] },
  rental_checked_out: { allowedBusinessTypes: ['rental'] },
  rental_returned: { allowedBusinessTypes: ['rental'] },
  rental_returned_staff: { allowedBusinessTypes: ['rental'] },
  rental_cancelled: { allowedBusinessTypes: ['rental'] },
  rental_due_in_days: { allowedBusinessTypes: ['rental'] },
  rental_overdue: { allowedBusinessTypes: ['rental'] },
  rental_overdue_staff: { allowedBusinessTypes: ['rental'] },
  quote_no_response: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },
  quote_sent: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },
  quote_accepted_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES, requiresQuotes: true },
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
  task_assigned_staff: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  lead_no_contact_days: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
  review_request: { allowedBusinessTypes: ALL_RESOLVED_TYPES },
});

/**
 * @param {object|null|undefined} tenant
 * @returns {{ resolvedType: string, shopType: string|null, quotesEnabled: boolean, ordersEnabled: boolean }}
 */
export function getTenantAutomationContext(tenant) {
  const resolvedType = resolveBusinessType(tenant?.businessType);
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const shopType =
    resolvedType === 'shop'
      ? metadata.shopType || metadata.businessSubType || null
      : null;
  const quotesEnabled = isQuotesEnabledForTenant(tenant?.businessType, shopType);
  const ordersEnabled =
    resolvedType === 'shop' && ORDERS_ENABLED_SHOP_TYPES.includes(shopType || '');
  return { resolvedType, shopType, quotesEnabled, ordersEnabled };
}

/**
 * @param {string} triggerType
 * @param {object|null|undefined} tenant
 * @returns {boolean}
 */
export function isTriggerAllowedForTenant(triggerType, tenant) {
  const eligibility = TRIGGER_ELIGIBILITY[String(triggerType || '')];
  if (!eligibility) return false;
  const ctx = getTenantAutomationContext(tenant);
  if (!eligibility.allowedBusinessTypes.includes(ctx.resolvedType)) return false;
  if (eligibility.requiresQuotes && !ctx.quotesEnabled) return false;
  if (eligibility.requiresOrders && !ctx.ordersEnabled) return false;
  return true;
}

/**
 * @param {Array<{ value: string }>} triggerOptions
 * @param {object|null|undefined} tenant
 * @returns {Array}
 */
export function filterTriggerOptionsForTenant(triggerOptions, tenant) {
  return (triggerOptions || []).filter((option) => isTriggerAllowedForTenant(option.value, tenant));
}

export { ALL_RESOLVED_TYPES, ORDERS_ENABLED_SHOP_TYPES, QUOTES_HIDDEN_SHOP_TYPES };
