const {
  DEFAULT_RENTAL_SETTINGS,
  normalizeRentalSettings,
  getGraceAdjustedDueDate,
} = require('../../../services/rentalSettingsService');
const { recalculateLateCharge } = require('../../../services/rentalAvailabilityService');

describe('rentalSettingsService', () => {
  it('applies defaults when normalizing empty payload', () => {
    expect(normalizeRentalSettings({})).toEqual(DEFAULT_RENTAL_SETTINGS);
  });

  it('normalizes custom late fee and grace settings', () => {
    expect(normalizeRentalSettings({
      lateChargeRatePercent: 75,
      gracePeriodValue: 2,
      gracePeriodUnit: 'days',
      defaultDepositPercent: 25,
      requireIdVerification: true,
      preBookingExpiryDays: 7,
    })).toMatchObject({
      lateChargeRatePercent: 75,
      gracePeriodValue: 2,
      gracePeriodUnit: 'days',
      defaultDepositPercent: 25,
      defaultDepositAmount: null,
      requireIdVerification: true,
      preBookingExpiryDays: 7,
    });
  });

  it('rejects invalid late charge rate', () => {
    expect(() => normalizeRentalSettings({ lateChargeRatePercent: -1 }))
      .toThrow('Late charge rate must be between 0 and 200 percent');
  });

  it('defaults day billing to end of day and accepts overnight', () => {
    expect(normalizeRentalSettings({}).dayBillingMode).toBe('end_of_day');
    expect(normalizeRentalSettings({ dayBillingMode: 'overnight' }).dayBillingMode).toBe('overnight');
    expect(normalizeRentalSettings({ dayBillingMode: 'cars' }).dayBillingMode).toBe('end_of_day');
  });
});

describe('recalculateLateCharge with rental settings', () => {
  const rental = {
    startDate: '2026-01-01',
    endDate: '2026-01-03',
    amount: 300,
    metadata: {},
  };

  it('uses configured late charge rate instead of hardcoded 50%', () => {
    const result = recalculateLateCharge(rental, '2026-01-05', { lateChargeRatePercent: 100 });
    expect(result.chargePerDay).toBe(100);
    expect(result.totalCharge).toBe(200);
  });

  it('respects grace period in hours before charging', () => {
    const withinGrace = recalculateLateCharge(rental, '2026-01-03', {
      gracePeriodValue: 24,
      gracePeriodUnit: 'hours',
    });
    expect(withinGrace.totalCharge).toBe(0);

    const afterGrace = recalculateLateCharge(rental, '2026-01-05', {
      gracePeriodValue: 24,
      gracePeriodUnit: 'hours',
      lateChargeRatePercent: 50,
    });
    expect(afterGrace.daysLate).toBeGreaterThan(0);
    expect(afterGrace.totalCharge).toBeGreaterThan(0);
  });

  it('extends due date by grace days', () => {
    const graceEnd = getGraceAdjustedDueDate('2026-01-03', {
      gracePeriodValue: 2,
      gracePeriodUnit: 'days',
    });
    expect(graceEnd.toISOString().slice(0, 10)).toBe('2026-01-05');
  });
});
