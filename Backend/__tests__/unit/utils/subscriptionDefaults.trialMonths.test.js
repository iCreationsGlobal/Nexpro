jest.mock('../../../models', () => ({
  SubscriptionPlan: { findOne: jest.fn() },
}));

const { SubscriptionPlan } = require('../../../models');
const {
  DEFAULT_TRIAL_MONTHS,
  MAX_TRIAL_MONTHS,
  normalizeTrialMonths,
  getTrialMonths,
  getTrialEndDate,
} = require('../../../utils/subscriptionDefaults');

describe('trial length', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeTrialMonths', () => {
    it('keeps whole months from 1 to the maximum', () => {
      expect(normalizeTrialMonths(1)).toBe(1);
      expect(normalizeTrialMonths(3)).toBe(3);
      expect(normalizeTrialMonths('6')).toBe(6);
      expect(normalizeTrialMonths(MAX_TRIAL_MONTHS)).toBe(MAX_TRIAL_MONTHS);
    });

    it('falls back to the default for anything else', () => {
      for (const value of [undefined, null, '', 0, -1, 1.5, MAX_TRIAL_MONTHS + 1, 'three']) {
        expect(normalizeTrialMonths(value)).toBe(DEFAULT_TRIAL_MONTHS);
      }
    });
  });

  describe('getTrialMonths', () => {
    it('reads the length set on the Trial plan', async () => {
      SubscriptionPlan.findOne.mockResolvedValue({ metadata: { trialMonths: 3 } });
      await expect(getTrialMonths()).resolves.toBe(3);
    });

    it('uses the default when the Trial plan has no length or no row', async () => {
      SubscriptionPlan.findOne.mockResolvedValueOnce({ metadata: {} }).mockResolvedValueOnce(null);
      await expect(getTrialMonths()).resolves.toBe(DEFAULT_TRIAL_MONTHS);
      await expect(getTrialMonths()).resolves.toBe(DEFAULT_TRIAL_MONTHS);
    });

    it('uses the default when the lookup fails, so signing up still works', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      SubscriptionPlan.findOne.mockRejectedValue(new Error('db down'));
      await expect(getTrialMonths()).resolves.toBe(DEFAULT_TRIAL_MONTHS);
      consoleError.mockRestore();
    });
  });

  describe('getTrialEndDate', () => {
    it('adds the trial length to the start', async () => {
      SubscriptionPlan.findOne.mockResolvedValue({ metadata: { trialMonths: 3 } });
      const end = await getTrialEndDate(new Date('2026-10-29T10:00:00.000Z'));
      expect(end.toISOString()).toBe('2027-01-29T10:00:00.000Z');
    });
  });
});
