const {
  FEATURE_CATALOG,
  getFeatureFlagsForPlan,
} = require('../../../config/features');
const { plans } = require('../../../config/plans');

const expectedFeatureKeys = [
  'dealersAccount',
  'crm',
  'vendors',
  'marketing',
  'quoteAutomation',
  'pricingTemplates',
  'jobAutomation',
  'tasks',
  'paymentsExpenses',
  'orders',
  'deliveries',
  'products',
  'invoices',
  'expenses',
  'studioLocationsModule',
  'shopsModule',
  'pharmacyOps',
  'materials',
  'rentals',
  'watch',
  'reports',
  'graEvat',
  'notifications',
  'leadPipeline',
  'roleManagement',
  'accounting',
  'payroll',
  'advancedReporting',
  'apiAccess',
  'whiteLabel',
  'sso',
  'customWorkflows',
  'automations',
  'dedicatedSupport',
  'sla',
];

describe('plan feature matrix', () => {
  it('registers every platform settings feature key', () => {
    const catalogKeys = FEATURE_CATALOG.map((feature) => feature.key);
    expect(catalogKeys).toEqual(expectedFeatureKeys);
  });

  it('returns complete boolean feature flags for each canonical plan', () => {
    for (const planId of ['trial', 'starter', 'professional', 'enterprise']) {
      const flags = getFeatureFlagsForPlan(planId);
      expect(Object.keys(flags)).toEqual(expectedFeatureKeys);
      expect(Object.values(flags).every((value) => typeof value === 'boolean')).toBe(true);
    }
  });

  it('attaches complete feature flags to config plans seeded into subscription_plans', () => {
    for (const plan of plans) {
      expect(Object.keys(plan.marketing.featureFlags)).toEqual(expectedFeatureKeys);
      expect(plan.marketing.featureFlags).toEqual(getFeatureFlagsForPlan(plan.id));
    }
  });

  it('enables every feature for trial and enterprise', () => {
    expect(Object.values(getFeatureFlagsForPlan('trial')).every(Boolean)).toBe(true);
    expect(Object.values(getFeatureFlagsForPlan('enterprise')).every(Boolean)).toBe(true);
  });

  it('includes rentals on professional but not starter base plans', () => {
    expect(getFeatureFlagsForPlan('starter').rentals).toBe(false);
    expect(getFeatureFlagsForPlan('professional').rentals).toBe(true);
    expect(getFeatureFlagsForPlan('enterprise').rentals).toBe(true);
  });

  it('includes watch on professional but not starter base plans', () => {
    expect(getFeatureFlagsForPlan('starter').watch).toBe(false);
    expect(getFeatureFlagsForPlan('professional').watch).toBe(true);
    expect(getFeatureFlagsForPlan('enterprise').watch).toBe(true);
  });
});
