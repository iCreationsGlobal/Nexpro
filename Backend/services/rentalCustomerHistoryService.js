const { Customer, Rental, LateCharge, DamageReport } = require('../models');
const { sumBillableLateCharges } = require('./rentalInvoiceService');

/** Late-charge total above which risk rating becomes high (GHS). */
const LATE_CHARGE_HIGH_THRESHOLD = 500;

const DEFAULT_HISTORY = {
  totalRentals: 0,
  totalRentalDays: 0,
  totalRentalRevenue: 0,
  totalLateCharges: 0,
  totalDamageIncidents: 0,
  totalDamageCost: 0,
  processedRentalIds: [],
};

/**
 * Ensure customer metadata has a rental section with history and risk profile.
 * @param {Record<string, unknown>|null|undefined} metadata
 * @returns {Record<string, unknown>}
 */
const ensureRentalMetadata = (metadata) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {};

  const rental = base.rental && typeof base.rental === 'object' && !Array.isArray(base.rental)
    ? { ...base.rental }
    : {};

  const history = rental.history && typeof rental.history === 'object' && !Array.isArray(rental.history)
    ? { ...rental.history }
    : { ...DEFAULT_HISTORY };

  if (!Array.isArray(history.processedRentalIds)) {
    history.processedRentalIds = [];
  }

  const riskProfile = rental.riskProfile && typeof rental.riskProfile === 'object' && !Array.isArray(rental.riskProfile)
    ? { ...rental.riskProfile }
    : { riskRating: 'low' };

  if (!riskProfile.riskRating) {
    riskProfile.riskRating = 'low';
  }

  rental.history = history;
  rental.riskProfile = riskProfile;
  base.rental = rental;
  return base;
};

/**
 * Derive risk rating from cumulative rental history.
 * @param {Record<string, unknown>} history
 * @returns {'low'|'medium'|'high'}
 */
const recalculateRiskRating = (history) => {
  const totalLate = Number(history.totalLateCharges || 0);
  const totalDamage = Number(history.totalDamageIncidents || 0);

  if (totalDamage > 0 || totalLate > LATE_CHARGE_HIGH_THRESHOLD) {
    return 'high';
  }
  if (totalLate > 0) {
    return 'medium';
  }
  return 'low';
};

/**
 * Extract per-rental metrics for history aggregation.
 * @param {object} rental
 * @returns {{
 *   rentalDuration: number,
 *   amount: number,
 *   lateChargeTotal: number,
 *   damageIncidents: number,
 *   damageCost: number,
 *   lastRentalDate: string,
 * }}
 */
const extractRentalMetrics = (rental) => {
  const damageReports = rental.damageReports || [];
  const lateChargeTotal = sumBillableLateCharges(rental.lateCharges);
  const damageCost = damageReports.reduce(
    (sum, report) => sum + Number(report.actualRepairCost || report.estimatedRepairCost || 0),
    0
  );

  const lastRentalDate = rental.actualReturnDate
    || rental.endDate
    || new Date().toISOString().slice(0, 10);

  return {
    rentalDuration: Number(rental.rentalDurationDays || 0),
    amount: Number(rental.amount || 0),
    lateChargeTotal,
    damageIncidents: damageReports.length,
    damageCost: Number(damageCost.toFixed(2)),
    lastRentalDate,
  };
};

/**
 * Load rental with billing relations needed for history aggregation.
 * @param {string} rentalId
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<object|null>}
 */
const loadRentalForHistory = async (rentalId, tenantId, transaction) => Rental.findOne({
  where: { id: rentalId, tenantId },
  include: [
    { model: LateCharge, as: 'lateCharges' },
    { model: DamageReport, as: 'damageReports' },
  ],
  transaction,
});

/**
 * Idempotently update customer rental history after a rental is returned or completed.
 * Tracks processed rental IDs in history.processedRentalIds to prevent double-counting.
 *
 * @param {object} options
 * @param {object} [options.rental] - Preloaded rental with lateCharges and damageReports
 * @param {string} [options.rentalId]
 * @param {string} options.tenantId
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<{ updated: boolean, customer: object|null, reason?: string }>}
 */
const updateRentalCustomerHistory = async ({
  rental: rentalInput,
  rentalId,
  tenantId,
  transaction,
} = {}) => {
  let rental = rentalInput;

  if (!rental && rentalId && tenantId) {
    rental = await loadRentalForHistory(rentalId, tenantId, transaction);
  }

  if (!rental?.customerId) {
    return { updated: false, customer: null, reason: 'missing_rental' };
  }

  const resolvedTenantId = rental.tenantId || tenantId;
  const customer = await Customer.findOne({
    where: { id: rental.customerId, tenantId: resolvedTenantId },
    transaction,
  });

  if (!customer) {
    return { updated: false, customer: null, reason: 'missing_customer' };
  }

  const metadata = ensureRentalMetadata(customer.metadata);
  const { history } = metadata.rental;
  const processedIds = history.processedRentalIds;

  if (processedIds.includes(rental.id)) {
    return { updated: false, customer, reason: 'already_processed' };
  }

  const metrics = extractRentalMetrics(rental);

  history.totalRentals = (history.totalRentals || 0) + 1;
  history.totalRentalDays = (history.totalRentalDays || 0) + metrics.rentalDuration;
  history.totalRentalRevenue = Number(((history.totalRentalRevenue || 0) + metrics.amount).toFixed(2));
  history.totalLateCharges = Number(((history.totalLateCharges || 0) + metrics.lateChargeTotal).toFixed(2));
  history.totalDamageIncidents = (history.totalDamageIncidents || 0) + metrics.damageIncidents;
  history.totalDamageCost = Number(((history.totalDamageCost || 0) + metrics.damageCost).toFixed(2));
  history.lastRentalDate = metrics.lastRentalDate;
  history.lastRentalId = rental.id;
  history.processedRentalIds = [...processedIds, rental.id];

  metadata.rental.riskProfile.riskRating = recalculateRiskRating(history);

  customer.metadata = metadata;
  customer.changed('metadata', true);
  await customer.save({ transaction });

  return { updated: true, customer };
};

module.exports = {
  LATE_CHARGE_HIGH_THRESHOLD,
  ensureRentalMetadata,
  recalculateRiskRating,
  extractRentalMetrics,
  loadRentalForHistory,
  updateRentalCustomerHistory,
};
