const { Op } = require('sequelize');
const { Rental, RentalItem, PreBooking, PreBookingItem, Product } = require('../models');
const { getShopStockQuantity } = require('../utils/productStockUtils');
const {
  getGraceAdjustedDueDate,
  DEFAULT_RENTAL_SETTINGS,
  normalizeDayBillingMode,
} = require('./rentalSettingsService');
const {
  productTracksSerialUnits,
  loadProductForUnitTracking,
  countOperationalUnits,
  getBookedUnitIdsForRange,
} = require('./rentalUnitService');
const {
  INVENTORY_BLOCKING_STATUSES,
  PRE_BOOKING_BLOCKING_STATUSES,
} = require('./rentalStatusConstants');

/** Allowed manual/API status transitions (from → to[]). */
const RENTAL_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'active', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active: ['overdue', 'returned', 'cancelled'],
  overdue: ['returned'],
  returned: ['completed'],
  completed: [],
  cancelled: []
};

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Initial status when a rental is created or converted from a pre-booking.
 * Same-day or past start → active; future start → confirmed.
 * @param {string|Date} startDate
 * @returns {'active'|'confirmed'}
 */
const getInitialRentalStatus = (startDate) => {
  const today = startOfDay(new Date());
  const start = startOfDay(startDate);
  return start <= today ? 'active' : 'confirmed';
};

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
const canTransitionRentalStatus = (fromStatus, toStatus) => {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return true;
  return (RENTAL_STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus);
};

/**
 * Whether the rental start date has been reached (inclusive, start of day).
 * @param {string|Date} startDate
 * @returns {boolean}
 */
const isRentalStartDateReached = (startDate) => startOfDay(startDate) <= startOfDay(new Date());

/**
 * Whether a confirmed rental can be checked out (handed over).
 * Staff may check out when start date is reached; managers/admins may check out early.
 * @param {import('../models/Rental')} rental
 * @param {{ allowEarlyOverride?: boolean }} [options]
 * @returns {boolean}
 */
const canCheckoutRental = (rental, { allowEarlyOverride = false } = {}) => {
  if (!rental || rental.status !== 'confirmed') return false;
  return isRentalStartDateReached(rental.startDate) || allowEarlyOverride === true;
};

/**
 * Promote pending→confirmed/active on create path; active→overdue when past end date.
 * Confirmed→active requires explicit checkout (handover) — not auto-promoted here.
 * Persists when status changes.
 * @param {import('../models/Rental')} rental
 * @returns {Promise<string>} Effective status after sync
 */
const syncRentalLifecycleStatus = async (rental) => {
  if (!rental) return null;

  const today = startOfDay(new Date());
  const start = startOfDay(rental.startDate);
  const end = startOfDay(rental.endDate);
  let nextStatus = rental.status;

  if (rental.status === 'pending') {
    nextStatus = start <= today ? 'active' : 'confirmed';
  }

  if (nextStatus === 'active' && end < today) {
    nextStatus = 'overdue';
  }

  if (nextStatus !== rental.status) {
    await rental.update({ status: nextStatus });
  }

  return nextStatus;
};

const overlap = (startA, endA, startB, endB) => {
  const aStart = new Date(startA);
  const aEnd = new Date(endA);
  const bStart = new Date(startB);
  const bEnd = new Date(endB);

  return aStart <= bEnd && bStart <= aEnd;
};

const parseDecimal = (value) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const resolveDayBillingMode = (modeOrSettings) => {
  if (modeOrSettings && typeof modeOrSettings === 'object') {
    return normalizeDayBillingMode(
      modeOrSettings.dayBillingMode || modeOrSettings.metadata?.dayBillingMode
    );
  }
  return normalizeDayBillingMode(modeOrSettings);
};

/** Calendar-day difference using noon UTC to avoid timezone drift. */
const getCalendarDayDiff = (startDate, endDate) => {
  const toDateStr = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
  };
  const start = new Date(`${toDateStr(startDate)}T12:00:00.000Z`).getTime();
  const end = new Date(`${toDateStr(endDate)}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
};

/**
 * Billable rental days for a date span.
 * end_of_day (cars): inclusive calendar days — same-day return = 1 day.
 * overnight (equipment): nights — pickup today / return tomorrow = 1 day.
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @param {string|object} [dayBillingModeOrSettings]
 * @returns {number}
 */
const getDayCount = (startDate, endDate, dayBillingModeOrSettings) => {
  const diff = getCalendarDayDiff(startDate, endDate);
  if (!Number.isFinite(diff) || diff < 0) return 0;
  if (resolveDayBillingMode(dayBillingModeOrSettings) === 'overnight') {
    return Math.max(1, diff);
  }
  return Math.max(1, diff + 1);
};

const calculateRentalTotals = (items = [], startDate, endDate, options = {}) => {
  const days = getDayCount(startDate, endDate, options);
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const rate = parseDecimal(item.rentalRatePerDay ?? item.rate ?? 0);
    return sum + (qty * rate * days);
  }, 0);

  return {
    days,
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(subtotal.toFixed(2))
  };
};

/** Advance a YYYY-MM-DD date by whole days without timezone drift. */
const addDaysToDateStr = (dateStr, days) => {
  const parsed = new Date(`${dateStr}T12:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

/**
 * Compute extension duration, charges, and per-item subtotals for a rental.
 * Extension days are the delta between the current and proposed rental durations.
 * @param {object} rental - Rental with startDate, endDate, amount
 * @param {object[]} items - Rental line items with quantity and rentalRatePerDay
 * @param {string} newEndDate - Proposed end date (YYYY-MM-DD)
 * @returns {object}
 */
const calculateExtensionPreview = (rental, items = [], newEndDate) => {
  const previousEndDate = rental.endDate;
  const dayBillingMode = rental?.metadata?.dayBillingMode;
  const previousDurationDays = getDayCount(rental.startDate, previousEndDate, dayBillingMode);
  const newDurationDays = getDayCount(rental.startDate, newEndDate, dayBillingMode);
  const extensionDays = Math.max(0, newDurationDays - previousDurationDays);
  const extensionStartDate = extensionDays > 0 ? addDaysToDateStr(previousEndDate, 1) : previousEndDate;

  const lineItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const rentalRatePerDay = parseDecimal(item.rentalRatePerDay ?? item.rate ?? 0);
    const previousSubtotal = Number((quantity * rentalRatePerDay * previousDurationDays).toFixed(2));
    const newSubtotal = Number((quantity * rentalRatePerDay * newDurationDays).toFixed(2));
    const additionalSubtotal = Number((newSubtotal - previousSubtotal).toFixed(2));

    return {
      rentalItemId: item.id || null,
      productId: item.productId,
      quantity,
      rentalRatePerDay,
      previousSubtotal,
      newSubtotal,
      additionalSubtotal,
    };
  });

  const previousAmount = Number(rental.amount || 0);
  const newSummary = calculateRentalTotals(items, rental.startDate, newEndDate, { dayBillingMode });
  const additionalCharge = Number((newSummary.total - previousAmount).toFixed(2));
  const extensionRateTotal = lineItems.reduce(
    (sum, item) => sum + (item.quantity * item.rentalRatePerDay * extensionDays),
    0
  );

  return {
    previousEndDate,
    newEndDate,
    extensionStartDate,
    extensionDays,
    previousDurationDays,
    newDurationDays,
    previousAmount,
    newAmount: newSummary.total,
    additionalCharge: Number(additionalCharge.toFixed(2)),
    extensionRateTotal: Number(extensionRateTotal.toFixed(2)),
    items: lineItems,
  };
};

const getProductInventory = async ({ tenantId, productId, branchId, transaction = null }) => {
  const product = await Product.findOne({
    where: { id: productId, tenantId },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });

  if (!product) {
    return {
      totalQty: 0,
      product: null,
      isRentable: false,
      notFound: true
    };
  }

  if (!product.isRentable) {
    return {
      totalQty: 0,
      product,
      isRentable: false,
      notFound: false
    };
  }

  const productWithCategory = product.category
    ? product
    : await loadProductForUnitTracking(productId, tenantId, { transaction });

  if (productTracksSerialUnits(productWithCategory)) {
    const totalQty = await countOperationalUnits({ tenantId, productId, branchId, transaction });
    return {
      totalQty: parseDecimal(totalQty),
      product: productWithCategory,
      isRentable: true,
      notFound: false
    };
  }

  const totalQty = await getShopStockQuantity({
    tenantId,
    productId,
    shopId: branchId,
    product,
    transaction
  });

  return {
    totalQty: parseDecimal(totalQty),
    product,
    isRentable: true,
    notFound: false
  };
};

const getOverlappingRentalQuantity = async ({
  tenantId,
  productId,
  branchId,
  startDate,
  endDate,
  excludeRentalId = null,
  transaction = null
}) => {
  const rentalWhere = {
    tenantId,
    branchId,
    status: { [Op.in]: INVENTORY_BLOCKING_STATUSES },
    startDate: { [Op.lte]: endDate },
    endDate: { [Op.gte]: startDate }
  };

  if (excludeRentalId) {
    rentalWhere.id = { [Op.ne]: excludeRentalId };
  }

  const rows = await RentalItem.findAll({
    include: [{
      model: Rental,
      as: 'rental',
      required: true,
      where: rentalWhere
    }],
    where: {
      productId,
      branchId
    },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });

  return rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
};

const getOverlappingPreBookingQuantity = async ({
  tenantId,
  productId,
  branchId,
  startDate,
  endDate,
  excludePreBookingId = null,
  transaction = null
}) => {
  const preBookingWhere = {
    tenantId,
    branchId,
    status: { [Op.in]: PRE_BOOKING_BLOCKING_STATUSES },
    requestedStartDate: { [Op.lte]: endDate },
    requestedEndDate: { [Op.gte]: startDate }
  };

  if (excludePreBookingId) {
    preBookingWhere.id = { [Op.ne]: excludePreBookingId };
  }

  const rows = await PreBookingItem.findAll({
    include: [{
      model: PreBooking,
      as: 'preBooking',
      required: true,
      where: preBookingWhere
    }],
    where: {
      productId,
      branchId
    },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });

  return rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
};

const checkRentalAvailability = async ({
  tenantId,
  productId,
  branchId,
  startDate,
  endDate,
  excludeRentalId = null,
  excludePreBookingId = null,
  transaction = null
}) => {
  if (!productId || !branchId || !startDate || !endDate) {
    const err = new Error('productId, branchId, startDate and endDate are required');
    err.statusCode = 400;
    throw err;
  }

  const inventory = await getProductInventory({ tenantId, productId, branchId, transaction });
  const tracksSerialUnits = productTracksSerialUnits(inventory.product);

  let activeRentals = await getOverlappingRentalQuantity({
    tenantId,
    productId,
    branchId,
    startDate,
    endDate,
    excludeRentalId,
    transaction
  });

  if (tracksSerialUnits) {
    const bookedUnitIds = await getBookedUnitIdsForRange({
      tenantId,
      productId,
      branchId,
      startDate,
      endDate,
      excludeRentalId,
      transaction,
    });
    activeRentals = bookedUnitIds.length;
    if (!inventory.totalQty) {
      inventory.totalQty = await countOperationalUnits({ tenantId, productId, branchId, transaction });
    }
  }

  const preBookings = await getOverlappingPreBookingQuantity({
    tenantId,
    productId,
    branchId,
    startDate,
    endDate,
    excludePreBookingId,
    transaction
  });

  const availableQty = Math.max(0, inventory.totalQty - activeRentals - preBookings);

  return {
    tenantId,
    productId,
    branchId,
    startDate,
    endDate,
    productName: inventory.product?.name || null,
    isRentable: inventory.isRentable,
    tracksSerialUnits,
    notFound: inventory.notFound,
    totalQty: inventory.totalQty,
    activeRentals,
    preBookings,
    availableQty,
    overlaps: activeRentals > 0 || preBookings > 0
  };
};

/**
 * Authoritative availability check for rental line items.
 * Locks product rows when run inside a transaction to prevent double-booking.
 * @throws {Error} statusCode 400 with `details` array when stock is insufficient
 */
const assertItemsAvailable = async ({
  tenantId,
  branchId,
  startDate,
  endDate,
  items = [],
  excludeRentalId = null,
  excludePreBookingId = null,
  transaction = null
}) => {
  if (!branchId) {
    const err = new Error('branchId is required for availability checks');
    err.statusCode = 400;
    throw err;
  }

  const failures = [];

  for (const item of items) {
    const requestedQty = Number(item.quantity || 0);
    if (!item.productId || requestedQty <= 0) continue;

    const availability = await checkRentalAvailability({
      tenantId,
      productId: item.productId,
      branchId: branchId || item.branchId,
      startDate,
      endDate,
      excludeRentalId,
      excludePreBookingId,
      transaction
    });

    if (availability.notFound) {
      failures.push({
        productId: item.productId,
        productName: availability.productName,
        requestedQty,
        availableQty: 0,
        reason: 'Product not found'
      });
      continue;
    }

    if (!availability.isRentable) {
      failures.push({
        productId: item.productId,
        productName: availability.productName,
        requestedQty,
        availableQty: 0,
        reason: 'Product is not rentable'
      });
      continue;
    }

    if (availability.availableQty < requestedQty) {
      failures.push({
        productId: item.productId,
        productName: availability.productName,
        requestedQty,
        availableQty: availability.availableQty,
        totalQty: availability.totalQty,
        activeRentals: availability.activeRentals,
        preBookings: availability.preBookings,
        reason: 'Insufficient stock for selected dates'
      });
    }
  }

  if (failures.length) {
    const first = failures[0];
    const label = first.productName || first.productId;
    const err = new Error(
      failures.length === 1
        ? `Insufficient stock for ${label}: requested ${first.requestedQty}, available ${first.availableQty}`
        : `Insufficient stock for ${failures.length} product(s)`
    );
    err.statusCode = 400;
    err.code = 'INSUFFICIENT_RENTAL_STOCK';
    err.details = failures;
    throw err;
  }
};

const checkBatchAvailability = async ({
  tenantId,
  items = [],
  startDate,
  endDate,
  branchId,
  excludeRentalId = null,
  excludePreBookingId = null,
  transaction = null
}) => {
  const results = [];
  const aggregated = new Map();

  for (const item of items) {
    const productId = item.productId;
    if (!productId) continue;
    const qty = Number(item.quantity || 0);
    aggregated.set(productId, (aggregated.get(productId) || 0) + qty);
  }

  for (const [productId, requestedQty] of aggregated.entries()) {
    const result = await checkRentalAvailability({
      tenantId,
      productId,
      branchId,
      startDate,
      endDate,
      excludeRentalId,
      excludePreBookingId,
      transaction
    });

    const canFulfill = result.isRentable
      && !result.notFound
      && result.availableQty >= requestedQty;

    results.push({
      ...result,
      requestedQty,
      canFulfill,
      reason: result.notFound
        ? 'Product not found'
        : !result.isRentable
          ? 'Product is not rentable'
          : canFulfill
            ? null
            : 'Insufficient stock for selected dates'
    });
  }

  return results;
};

const recalculateLateCharge = (rental, actualReturnDate, settings = {}) => {
  const endDate = new Date(rental.endDate);
  const actualDate = new Date(actualReturnDate);
  const effectiveSettings = {
    ...DEFAULT_RENTAL_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
  };
  const graceAdjustedDueDate = getGraceAdjustedDueDate(endDate, effectiveSettings);

  if (actualDate <= graceAdjustedDueDate) {
    return { daysLate: 0, chargePerDay: 0, totalCharge: 0 };
  }

  const daysLate = Math.max(
    1,
    Math.ceil((actualDate.getTime() - graceAdjustedDueDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const dailyRate = Number(rental.metadata?.lateChargePerDay || rental.amount || 0)
    / Math.max(1, getDayCount(
      rental.startDate,
      rental.endDate,
      rental.metadata?.dayBillingMode || effectiveSettings.dayBillingMode
    ));
  const lateChargeRatePercent = Number(effectiveSettings.lateChargeRatePercent ?? 50);
  const chargePerDay = Number((dailyRate * (lateChargeRatePercent / 100)).toFixed(2));
  const totalCharge = Number((daysLate * chargePerDay).toFixed(2));

  return {
    daysLate,
    chargePerDay,
    totalCharge,
    lateChargeRatePercent,
    gracePeriodValue: effectiveSettings.gracePeriodValue,
    gracePeriodUnit: effectiveSettings.gracePeriodUnit,
  };
};

module.exports = {
  INVENTORY_BLOCKING_STATUSES,
  PRE_BOOKING_BLOCKING_STATUSES,
  RENTAL_STATUS_TRANSITIONS,
  getInitialRentalStatus,
  canTransitionRentalStatus,
  isRentalStartDateReached,
  canCheckoutRental,
  syncRentalLifecycleStatus,
  overlap,
  getDayCount,
  addDaysToDateStr,
  calculateRentalTotals,
  calculateExtensionPreview,
  checkRentalAvailability,
  checkBatchAvailability,
  assertItemsAvailable,
  recalculateLateCharge
};
