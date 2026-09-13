/**
 * Sabito App (marketer program) platform-take defaults.
 * Control Center can persist a DB override; env is the initial fallback.
 */
const DEFAULT_PLATFORM_FEE_PERCENT = 20;

const clampFeePercent = (value) => {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_PLATFORM_FEE_PERCENT;
  return Number(n.toFixed(2));
};

const getEnvPlatformFeePercent = () => {
  if (process.env.SABITO_APP_PLATFORM_FEE_PERCENT == null || process.env.SABITO_APP_PLATFORM_FEE_PERCENT === '') {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  return clampFeePercent(process.env.SABITO_APP_PLATFORM_FEE_PERCENT);
};

module.exports = {
  DEFAULT_PLATFORM_FEE_PERCENT,
  clampFeePercent,
  getEnvPlatformFeePercent,
};
