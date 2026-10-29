const dayjs = require('dayjs');
const { getFeatureFlagsForPlan } = require('../config/features');
const { plans: PLANS_CONFIG } = require('../config/plans');
const {
  DEFAULT_PLAN_SEAT_LIMITS,
  DEFAULT_PLAN_BRANCH_LIMITS,
  PLAN_SEAT_PRICING,
  DEFAULT_STORAGE_LIMITS,
  STORAGE_PRICING,
} = require('../config/features');

const DEFAULT_TRIAL_MONTHS = 1;
const MAX_TRIAL_MONTHS = 12;

/** A trial length in whole months (1–MAX_TRIAL_MONTHS); anything else → DEFAULT_TRIAL_MONTHS. */
const normalizeTrialMonths = (value) => {
  const months = Number(value);
  return Number.isInteger(months) && months >= 1 && months <= MAX_TRIAL_MONTHS
    ? months
    : DEFAULT_TRIAL_MONTHS;
};

/**
 * How long a new trial lasts: what the admin set on the Trial plan (Subscription Plans →
 * Trial length, stored as metadata.trialMonths), else DEFAULT_TRIAL_MONTHS. A failed lookup
 * falls back to the default so signing up never fails over it.
 * @returns {Promise<number>}
 */
const getTrialMonths = async () => {
  try {
    const { SubscriptionPlan } = require('../models');
    const trialPlan = await SubscriptionPlan.findOne({ where: { planId: 'trial' }, attributes: ['metadata'] });
    return normalizeTrialMonths(trialPlan?.metadata?.trialMonths);
  } catch (error) {
    console.error('[subscriptionDefaults] Could not read the trial length; using %s month(s):', DEFAULT_TRIAL_MONTHS, error.message);
    return DEFAULT_TRIAL_MONTHS;
  }
};

/** When a trial that starts at `at` ends. */
const getTrialEndDate = async (at = new Date()) => dayjs(at).add(await getTrialMonths(), 'month').toDate();

const buildTrialSubscriptionSettingValue = (trialEndDate, seats = 1) => ({
  plan: 'trial',
  status: 'trialing',
  trialEndsAt: trialEndDate,
  paymentMethod: null,
  seats,
});

const resolveTrialEndDate = (existingDate) => {
  if (existingDate) {
    const parsed = new Date(existingDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return dayjs().add(DEFAULT_TRIAL_MONTHS, 'month').toDate();
};

const getTrialPlanFeatureFlags = () => getFeatureFlagsForPlan('trial');

const getTrialPlanDefinition = () => PLANS_CONFIG.find((plan) => plan.id === 'trial') || null;

const buildTrialPlanRowPayload = () => {
  const def = getTrialPlanDefinition();
  const featureFlags = getTrialPlanFeatureFlags();
  return {
    planId: 'trial',
    order: def?.order ?? 10,
    name: def?.name || 'Free Trial',
    description: def?.description || 'Try every feature with no commitment.',
    price: def?.price || {},
    highlights: def?.highlights || [],
    marketing: {
      ...(def?.marketing || {}),
      featureFlags,
    },
    onboarding: def?.onboarding || {},
    seatLimit: DEFAULT_PLAN_SEAT_LIMITS.trial,
    seatPricePerAdditional: PLAN_SEAT_PRICING.trial,
    branchLimit: DEFAULT_PLAN_BRANCH_LIMITS.trial,
    storageLimitMB: DEFAULT_STORAGE_LIMITS.trial,
    storagePrice100GB: STORAGE_PRICING.trial,
    isActive: true,
    metadata: {
      featureFlags,
      featureKeys: Object.keys(featureFlags).filter((key) => featureFlags[key] === true),
    },
  };
};

module.exports = {
  DEFAULT_TRIAL_MONTHS,
  MAX_TRIAL_MONTHS,
  normalizeTrialMonths,
  getTrialMonths,
  getTrialEndDate,
  buildTrialSubscriptionSettingValue,
  resolveTrialEndDate,
  getTrialPlanFeatureFlags,
  getTrialPlanDefinition,
  buildTrialPlanRowPayload,
};
