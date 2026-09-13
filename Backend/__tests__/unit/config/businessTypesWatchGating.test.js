const {
  applyFeatureGatesToFlags,
  getFeaturesForBusinessType,
} = require('../../../config/businessTypes');
const { getFeatureFlagsForPlan } = require('../../../config/features');

describe('businessTypes watch gating', () => {
  it('lists watch for every workspace type', () => {
    expect(getFeaturesForBusinessType('shop')).toContain('watch');
    expect(getFeaturesForBusinessType('pharmacy')).toContain('watch');
    expect(getFeaturesForBusinessType('studio')).toContain('watch');
    expect(getFeaturesForBusinessType('printing_press')).toContain('watch');
    expect(getFeaturesForBusinessType('rental')).toContain('watch');
  });

  it('keeps watch for trial, professional, and enterprise tenants of any type', () => {
    expect(getFeatureFlagsForPlan('trial').watch).toBe(true);
    expect(getFeatureFlagsForPlan('starter').watch).toBe(false);
    expect(getFeatureFlagsForPlan('professional').watch).toBe(true);
    expect(getFeatureFlagsForPlan('enterprise').watch).toBe(true);

    const proFlags = getFeatureFlagsForPlan('professional');
    expect(applyFeatureGatesToFlags(proFlags, { businessType: 'shop' }).watch).toBe(true);
    expect(applyFeatureGatesToFlags(proFlags, { businessType: 'pharmacy' }).watch).toBe(true);
    expect(applyFeatureGatesToFlags(proFlags, { businessType: 'studio' }).watch).toBe(true);
    expect(applyFeatureGatesToFlags(proFlags, { businessType: 'rental' }).watch).toBe(true);
  });
});
