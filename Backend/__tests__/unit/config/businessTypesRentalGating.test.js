const {
  applyFeatureGatesToFlags,
  filterFeaturesForTenant,
  getFeaturesForBusinessType,
} = require('../../../config/businessTypes');
const { getFeatureFlagsForPlan } = require('../../../config/features');

describe('businessTypes rental plan gating', () => {
  it('lists rentals in rental business type feature set', () => {
    expect(getFeaturesForBusinessType('rental')).toContain('rentals');
    expect(getFeaturesForBusinessType('rental')).toContain('products');
    expect(getFeaturesForBusinessType('rental')).toContain('shopsModule');
  });

  it('does not list rentals for shop business type', () => {
    expect(getFeaturesForBusinessType('shop')).not.toContain('rentals');
  });

  it('grants rentals for starter rental tenants via core feature override', () => {
    const starterFlags = getFeatureFlagsForPlan('starter');
    expect(starterFlags.rentals).toBe(false);

    const tenant = {
      businessType: 'rental',
      metadata: { businessSubType: 'equipment_rental' },
    };

    const effective = applyFeatureGatesToFlags(starterFlags, tenant);
    expect(effective.rentals).toBe(true);
    expect(effective.shopsModule).toBe(true);
  });

  it('strips rentals for non-rental tenants on professional plan', () => {
    const proFlags = getFeatureFlagsForPlan('professional');
    expect(proFlags.rentals).toBe(true);

    const tenant = { businessType: 'shop', metadata: {} };
    const effective = applyFeatureGatesToFlags(proFlags, tenant);
    expect(effective.rentals).toBe(false);
  });

  it('filters plan features to rental-allowed keys for rental tenants', () => {
    const tenant = {
      businessType: 'rental',
      metadata: { businessSubType: 'equipment_rental' },
    };
    const planFeatures = getFeatureFlagsForPlan('professional');
    const enabledKeys = Object.keys(planFeatures).filter((key) => planFeatures[key]);
    const filtered = filterFeaturesForTenant(enabledKeys, tenant);

    expect(filtered).toContain('rentals');
    expect(filtered).toContain('shopsModule');
    expect(filtered).not.toContain('quoteAutomation');
    expect(filtered).not.toContain('jobAutomation');
  });
});
