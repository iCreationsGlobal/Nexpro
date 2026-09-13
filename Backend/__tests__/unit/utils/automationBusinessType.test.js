const {
  filterTemplatesForTenant,
  isTriggerAllowedForTenant,
  getTenantAutomationContext,
  filterTriggerTypesForTenant,
} = require('../../../utils/automationBusinessType');
const { getTemplates } = require('../../../services/automationEngineService');

describe('automationBusinessType', () => {
  const studioTenant = { businessType: 'studio', metadata: {} };
  const shopTenant = { businessType: 'shop', metadata: { shopType: 'supermarket' } };
  const restaurantTenant = { businessType: 'shop', metadata: { shopType: 'restaurant' } };
  const pharmacyTenant = { businessType: 'pharmacy', metadata: {} };
  const printingPressTenant = { businessType: 'printing_press', metadata: {} };
  const rentalTenant = { businessType: 'rental', metadata: {} };

  it('resolves legacy studio-like types as studio', () => {
    expect(getTenantAutomationContext(printingPressTenant).resolvedType).toBe('studio');
  });

  it('does not allow low_stock triggers for studio tenants', () => {
    expect(isTriggerAllowedForTenant('low_stock_detected', studioTenant)).toBe(false);
    expect(isTriggerAllowedForTenant('low_stock_on_change', studioTenant)).toBe(false);
    expect(isTriggerAllowedForTenant('out_of_stock_detected', studioTenant)).toBe(false);
  });

  it('allows low_stock triggers for shop tenants', () => {
    expect(isTriggerAllowedForTenant('low_stock_detected', shopTenant)).toBe(true);
  });

  it('filters studio templates so low_stock is absent', () => {
    const templates = filterTemplatesForTenant(getTemplates(), studioTenant);
    const keys = templates.map((t) => t.key);
    expect(keys).not.toContain('low_stock_alert');
    expect(keys).not.toContain('low_stock_on_change');
    expect(keys).not.toContain('out_of_stock_alert');
    expect(keys).not.toContain('daily_sales_summary');
    expect(keys).not.toContain('sale_completed_receipt');
    expect(keys).toContain('job_completed_notification');
    expect(keys).toContain('invoice_due_reminder');
  });

  it('includes stock templates for shops and hides job templates', () => {
    const templates = filterTemplatesForTenant(getTemplates(), shopTenant);
    const keys = templates.map((t) => t.key);
    expect(keys).toContain('low_stock_alert');
    expect(keys).not.toContain('job_completed_notification');
    expect(keys).not.toContain('prescription_refill_reminder');
    expect(keys).not.toContain('order_created_notification');
  });

  it('allows order_created only for restaurant shops', () => {
    expect(isTriggerAllowedForTenant('order_created', shopTenant)).toBe(false);
    expect(isTriggerAllowedForTenant('order_created', restaurantTenant)).toBe(true);
    const restaurantKeys = filterTemplatesForTenant(getTemplates(), restaurantTenant).map((t) => t.key);
    expect(restaurantKeys).toContain('order_created_notification');
    expect(restaurantKeys).not.toContain('quote_follow_up');
  });

  it('allows prescription refill only for pharmacy', () => {
    expect(isTriggerAllowedForTenant('prescription_refill_due', pharmacyTenant)).toBe(true);
    expect(isTriggerAllowedForTenant('prescription_refill_due', shopTenant)).toBe(false);
    const keys = filterTemplatesForTenant(getTemplates(), pharmacyTenant).map((t) => t.key);
    expect(keys).toContain('prescription_refill_reminder');
    expect(keys).not.toContain('low_stock_alert');
  });

  it('allows invoice and rental triggers for rental tenants, not shop sales', () => {
    expect(isTriggerAllowedForTenant('payment_received', rentalTenant)).toBe(true);
    expect(isTriggerAllowedForTenant('invoice_sent', rentalTenant)).toBe(true);
    expect(isTriggerAllowedForTenant('rental_created', rentalTenant)).toBe(true);
    expect(isTriggerAllowedForTenant('rental_due_in_days', rentalTenant)).toBe(true);
    expect(isTriggerAllowedForTenant('sale_completed', rentalTenant)).toBe(false);
    expect(isTriggerAllowedForTenant('job_created', rentalTenant)).toBe(false);

    const keys = filterTemplatesForTenant(getTemplates(), rentalTenant).map((t) => t.key);
    expect(keys).toContain('payment_received_thank_you');
    expect(keys).toContain('rental_created_confirmation');
    expect(keys).toContain('invoice_due_reminder');
    expect(keys).not.toContain('sale_completed_receipt');
    expect(keys).not.toContain('job_completed_notification');
  });

  it('filters trigger type lists for OpenAI / builder use', () => {
    const filtered = filterTriggerTypesForTenant(
      ['low_stock_detected', 'job_completed', 'invoice_overdue', 'order_created'],
      studioTenant
    );
    expect(filtered).toEqual(['job_completed', 'invoice_overdue']);
  });
});
