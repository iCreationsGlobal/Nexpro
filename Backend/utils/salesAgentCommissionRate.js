/** Rates are stored as percentages with at most two decimal places in agent metadata. */
function validateCommissionPercent(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  const rate = normalized === '' || normalized == null || typeof normalized === 'boolean' ? NaN : Number(normalized);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-7) {
    throw Object.assign(new Error('Commission percentage must be between 0 and 100, with at most two decimal places.'), { statusCode: 400 });
  }
  return rate;
}
function getCommissionPercent(agent) {
  const value = agent?.metadata?.commissionPercent;
  return value == null ? null : validateCommissionPercent(value);
}
function calculatePercentageCommission(paymentAmount, percent) {
  const basisPoints = Math.round(validateCommissionPercent(percent) * 100);
  return Math.round(Number(paymentAmount) * basisPoints / 10000);
}
module.exports = { validateCommissionPercent, getCommissionPercent, calculatePercentageCommission };
