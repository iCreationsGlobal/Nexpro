const { Setting } = require('../models');
const { invalidateCache, invalidateAuthBootstrapCache } = require('../middleware/cache');

const SETTING_KEY = 'rental_settings';

const DAY_BILLING_END_OF_DAY = 'end_of_day';
const DAY_BILLING_OVERNIGHT = 'overnight';

const DEFAULT_RENTAL_SETTINGS = {
  lateChargeRatePercent: 50,
  gracePeriodValue: 0,
  gracePeriodUnit: 'hours',
  defaultDepositPercent: null,
  defaultDepositAmount: null,
  requireIdVerification: false,
  preBookingExpiryDays: null,
  dayBillingMode: DAY_BILLING_END_OF_DAY,
};

const normalizeDayBillingMode = (value) => (
  value === DAY_BILLING_OVERNIGHT ? DAY_BILLING_OVERNIGHT : DAY_BILLING_END_OF_DAY
);

const toFiniteNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeOptionalPositiveNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = toFiniteNumber(value);
  if (numberValue === null || numberValue < 0) {
    throw new Error('Optional numeric fields must be zero or greater');
  }
  return Math.round(numberValue * 100) / 100;
};

const normalizeRentalSettings = (value = {}) => {
  const merged = {
    ...DEFAULT_RENTAL_SETTINGS,
    ...(value && typeof value === 'object' ? value : {}),
  };

  const lateChargeRatePercent = toFiniteNumber(merged.lateChargeRatePercent);
  if (lateChargeRatePercent === null || lateChargeRatePercent < 0 || lateChargeRatePercent > 200) {
    throw new Error('Late charge rate must be between 0 and 200 percent');
  }

  const gracePeriodValue = toFiniteNumber(merged.gracePeriodValue);
  if (gracePeriodValue === null || gracePeriodValue < 0) {
    throw new Error('Grace period must be zero or greater');
  }

  const gracePeriodUnit = merged.gracePeriodUnit === 'days' ? 'days' : 'hours';

  const defaultDepositPercent = normalizeOptionalPositiveNumber(merged.defaultDepositPercent);
  const defaultDepositAmount = normalizeOptionalPositiveNumber(merged.defaultDepositAmount);

  if (defaultDepositPercent !== null && defaultDepositPercent > 100) {
    throw new Error('Default deposit percent cannot exceed 100');
  }

  let preBookingExpiryDays = null;
  if (merged.preBookingExpiryDays !== null && merged.preBookingExpiryDays !== undefined && merged.preBookingExpiryDays !== '') {
    const days = toFiniteNumber(merged.preBookingExpiryDays);
    if (days === null || days < 1) {
      throw new Error('Pre-booking expiry days must be at least 1 when set');
    }
    preBookingExpiryDays = Math.round(days);
  }

  return {
    lateChargeRatePercent: Math.round(lateChargeRatePercent * 100) / 100,
    gracePeriodValue: gracePeriodUnit === 'days'
      ? Math.round(gracePeriodValue)
      : Math.round(gracePeriodValue),
    gracePeriodUnit,
    defaultDepositPercent,
    defaultDepositAmount,
    requireIdVerification: merged.requireIdVerification === true,
    preBookingExpiryDays,
    dayBillingMode: normalizeDayBillingMode(merged.dayBillingMode),
  };
};

const invalidateTenantSettingsCache = (tenantId) => {
  try {
    invalidateCache(tenantId, 'settings:*');
    invalidateAuthBootstrapCache({ tenantId });
  } catch (cacheErr) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[RentalSettings] cache invalidation failed:', cacheErr?.message);
    }
  }
};

const getRentalSettings = async (tenantId) => {
  const setting = await Setting.findOne({ where: { tenantId, key: SETTING_KEY } });
  if (!setting?.value) return { ...DEFAULT_RENTAL_SETTINGS };
  return normalizeRentalSettings({
    ...DEFAULT_RENTAL_SETTINGS,
    ...setting.value,
  });
};

/**
 * Seed rental settings at workspace provision time if not yet persisted.
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
const ensureRentalSettings = async (tenantId) => {
  const [setting, created] = await Setting.findOrCreate({
    where: { tenantId, key: SETTING_KEY },
    defaults: {
      tenantId,
      key: SETTING_KEY,
      value: { ...DEFAULT_RENTAL_SETTINGS },
      description: 'Rental late fees, deposits, day billing, and booking defaults',
    },
  });

  if (!created && setting.value && typeof setting.value === 'object') {
    return normalizeRentalSettings({
      ...DEFAULT_RENTAL_SETTINGS,
      ...setting.value,
    });
  }

  const normalized = normalizeRentalSettings({
    ...DEFAULT_RENTAL_SETTINGS,
    ...(setting.value && typeof setting.value === 'object' ? setting.value : {}),
  });
  setting.value = normalized;
  setting.description = setting.description || 'Rental late fees, deposits, day billing, and booking defaults';
  await setting.save();
  return normalized;
};

const saveRentalSettings = async (tenantId, payload) => {
  const normalized = normalizeRentalSettings({
    ...DEFAULT_RENTAL_SETTINGS,
    ...(payload || {}),
  });
  const [setting] = await Setting.findOrCreate({
    where: { tenantId, key: SETTING_KEY },
    defaults: {
      tenantId,
      key: SETTING_KEY,
      value: normalized,
      description: 'Rental late fees, deposits, day billing, and booking defaults',
    },
  });
  setting.value = normalized;
  setting.description = setting.description || 'Rental late fees, deposits, and booking defaults';
  await setting.save();
  invalidateTenantSettingsCache(tenantId);
  return normalized;
};

/**
 * Resolve the effective due date after grace period for late charge calculation.
 * @param {string|Date} endDate
 * @param {object} settings
 * @returns {Date}
 */
const getGraceAdjustedDueDate = (endDate, settings = {}) => {
  const dueDate = new Date(endDate);
  const gracePeriodValue = Number(settings.gracePeriodValue ?? DEFAULT_RENTAL_SETTINGS.gracePeriodValue);
  const gracePeriodUnit = settings.gracePeriodUnit === 'days' ? 'days' : 'hours';
  const graceMs = gracePeriodUnit === 'days'
    ? gracePeriodValue * 24 * 60 * 60 * 1000
    : gracePeriodValue * 60 * 60 * 1000;
  return new Date(dueDate.getTime() + graceMs);
};

module.exports = {
  SETTING_KEY,
  DAY_BILLING_END_OF_DAY,
  DAY_BILLING_OVERNIGHT,
  DEFAULT_RENTAL_SETTINGS,
  normalizeDayBillingMode,
  normalizeRentalSettings,
  getRentalSettings,
  ensureRentalSettings,
  saveRentalSettings,
  getGraceAdjustedDueDate,
};
