jest.mock('../../../models', () => ({
  SubscriptionPlan: { findOne: jest.fn() },
}));

const { SubscriptionPlan } = require('../../../models');
const {
  buildBaseFeatureFlags,
  getTenantEffectiveEntitlements,
} = require('../../../utils/tenantEntitlements');
const { getFeatureFlagsForPlan } = require('../../../config/features');

describe('tenantEntitlements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses canonical professional flags when no db plan row exists', () => {
    const flags = buildBaseFeatureFlags('professional', null);
    expect(flags.automations).toBe(true);
    expect(flags.apiAccess).toBe(false);
    expect(flags.studioLocationsModule).toBe(true);
  });

  it('merges db matrix overrides on top of canonical defaults', () => {
    const flags = buildBaseFeatureFlags('professional', {
      marketing: {
        featureFlags: {
          crm: false,
          apiAccess: true,
        },
      },
    });
    expect(flags.crm).toBe(false);
    expect(flags.apiAccess).toBe(true);
    expect(flags.automations).toBe(true);
  });

  it('applies the admin Feature Table matrix to trial plans too, not just paid plans', () => {
    const flags = buildBaseFeatureFlags('trial', {
      marketing: {
        featureFlags: {
          crm: false,
          automations: false,
        },
      },
    });
    expect(flags.crm).toBe(false);
    expect(flags.automations).toBe(false);
    // Canonical trial features the matrix didn't touch stay enabled.
    expect(flags.expenses).toBe(true);
  });

  it('falls back to canonical (all-enabled) trial flags when no db plan row exists', () => {
    const flags = buildBaseFeatureFlags('trial', null);
    const canonicalTrial = getFeatureFlagsForPlan('trial');
    expect(flags).toEqual(canonicalTrial);
    expect(Object.values(flags).every(Boolean)).toBe(true);
  });

  it('applies admin feature overrides last over gated trial defaults', async () => {
    SubscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-trial',
      planId: 'trial',
      name: 'Trial',
      marketing: {
        featureFlags: {
          automations: true,
          apiAccess: false,
        },
      },
      seatLimit: 5,
      branchLimit: 5,
      storageLimitMB: 1024,
    });

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-1',
      plan: 'trial',
      businessType: 'shop',
      metadata: {
        entitlements: {
          featureOverrides: {
            automations: false,
            apiAccess: true,
          },
        },
      },
    });

    expect(entitlements.baseFeatureFlags).toEqual({
      ...getFeatureFlagsForPlan('trial'),
      automations: true,
      apiAccess: false,
    });
    expect(entitlements.featureOverrides).toEqual({
      automations: false,
      apiAccess: true,
    });
    expect(entitlements.effectiveFeatureFlags.automations).toBe(false);
    expect(entitlements.effectiveFeatureFlags.apiAccess).toBe(true);
    expect(entitlements.enabledFeatures).not.toContain('automations');
    expect(entitlements.enabledFeatures).toContain('apiAccess');
  });

  it('falls back to canonical self-service limits when no db plan row exists', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-2',
      plan: 'professional',
      businessType: 'shop',
      metadata: {},
    });

    expect(entitlements.limits.seatLimit).toBe(3);
    expect(entitlements.limits.branchLimit).toBe(3);
  });

  it('enables kitchen orders for restaurant shops', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-restaurant',
      plan: 'trial',
      businessType: 'shop',
      metadata: { shopType: 'restaurant' },
    });

    expect(entitlements.effectiveFeatureFlags.orders).toBe(true);
    expect(entitlements.enabledFeatures).toContain('orders');
  });

  it('keeps kitchen orders disabled for non-restaurant shops', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-retail',
      plan: 'trial',
      businessType: 'shop',
      metadata: { shopType: 'retail' },
    });

    expect(entitlements.baseFeatureFlags.orders).toBe(true);
    expect(entitlements.effectiveFeatureFlags.orders).toBe(false);
    expect(entitlements.enabledFeatures).not.toContain('orders');
  });

  it('enables dealers account for professional shop tenants', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-shop-pro',
      plan: 'professional',
      businessType: 'shop',
      metadata: {},
    });

    expect(entitlements.baseFeatureFlags.dealersAccount).toBe(true);
    expect(entitlements.effectiveFeatureFlags.dealersAccount).toBe(true);
    expect(entitlements.enabledFeatures).toContain('dealersAccount');
  });

  it('enables dealers account for professional pharmacy tenants', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-pharmacy-pro',
      plan: 'professional',
      businessType: 'pharmacy',
      metadata: {},
    });

    expect(entitlements.baseFeatureFlags.dealersAccount).toBe(true);
    expect(entitlements.effectiveFeatureFlags.dealersAccount).toBe(true);
    expect(entitlements.enabledFeatures).toContain('dealersAccount');
  });

  it('strips dealers account for studio tenants even on professional plan', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-studio-pro',
      plan: 'professional',
      businessType: 'studio',
      metadata: {},
    });

    expect(entitlements.baseFeatureFlags.dealersAccount).toBe(true);
    expect(entitlements.effectiveFeatureFlags.dealersAccount).toBe(false);
    expect(entitlements.enabledFeatures).not.toContain('dealersAccount');
  });

  it('does not include dealers account on starter plan', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-shop-starter',
      plan: 'starter',
      businessType: 'shop',
      metadata: {},
    });

    expect(entitlements.baseFeatureFlags.dealersAccount).toBe(false);
    expect(entitlements.effectiveFeatureFlags.dealersAccount).toBe(false);
    expect(entitlements.enabledFeatures).not.toContain('dealersAccount');
  });

  it('grants rentals for starter rental tenants even when plan omits rentals', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-rental-starter',
      plan: 'starter',
      businessType: 'rental',
      metadata: { businessSubType: 'equipment_rental' },
    });

    expect(entitlements.baseFeatureFlags.rentals).toBe(false);
    expect(entitlements.effectiveFeatureFlags.rentals).toBe(true);
    expect(entitlements.enabledFeatures).toContain('rentals');
    expect(entitlements.effectiveFeatureFlags.shopsModule).toBe(true);
    expect(entitlements.enabledFeatures).toContain('shopsModule');
  });

  it('strips rentals for non-rental tenants even on professional plan', async () => {
    SubscriptionPlan.findOne.mockResolvedValue(null);

    const entitlements = await getTenantEffectiveEntitlements({
      id: 'tenant-shop-pro',
      plan: 'professional',
      businessType: 'shop',
      metadata: {},
    });

    expect(entitlements.baseFeatureFlags.rentals).toBe(true);
    expect(entitlements.effectiveFeatureFlags.rentals).toBe(false);
    expect(entitlements.enabledFeatures).not.toContain('rentals');
  });
});
