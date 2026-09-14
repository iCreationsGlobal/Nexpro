const { Op } = require('sequelize');
const { RentalUnit, RentalItem, Rental, Product, ProductCategory } = require('../models');
const { INVENTORY_BLOCKING_STATUSES } = require('./rentalStatusConstants');

const RENTAL_UNIT_STATUSES = ['available', 'rented', 'maintenance', 'retired'];

/**
 * Whether a product (or its category) requires per-unit serial assignment.
 * @param {object|null} product - Product instance or plain object with metadata and optional category
 * @returns {boolean}
 */
const productTracksSerialUnits = (product) => {
  if (!product) return false;
  const metadata = product.metadata && typeof product.metadata === 'object' ? product.metadata : {};
  if (metadata.tracksSerialUnits === true) return true;
  const categoryMeta = product.category?.metadata && typeof product.category.metadata === 'object'
    ? product.category.metadata
    : {};
  return categoryMeta.tracksSerialUnits === true || categoryMeta.requiresUnitAssignment === true;
};

/**
 * Load product with category for serial-tracking checks.
 * @param {string} productId
 * @param {string} tenantId
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
const loadProductForUnitTracking = async (productId, tenantId, { transaction = null } = {}) => {
  return Product.findOne({
    where: { id: productId, tenantId },
    include: [{ model: ProductCategory, as: 'category', required: false }],
    transaction,
  });
};

/**
 * List rental units for a product.
 */
const listRentalUnits = async ({ tenantId, productId, branchId = null, status = null }) => {
  const where = { tenantId, productId };
  if (branchId) where.branchId = branchId;
  if (status) where.status = status;

  return RentalUnit.findAll({
    where,
    order: [['serialNumber', 'ASC']],
  });
};

/**
 * Get IDs of units booked for overlapping rentals.
 */
const getBookedUnitIdsForRange = async ({
  tenantId,
  productId,
  branchId,
  startDate,
  endDate,
  excludeRentalId = null,
  transaction = null,
}) => {
  const rentalWhere = {
    tenantId,
    branchId,
    status: { [Op.in]: INVENTORY_BLOCKING_STATUSES },
    startDate: { [Op.lte]: endDate },
    endDate: { [Op.gte]: startDate },
  };

  if (excludeRentalId) {
    rentalWhere.id = { [Op.ne]: excludeRentalId };
  }

  const rows = await RentalItem.findAll({
    attributes: ['rentalUnitId'],
    where: {
      productId,
      branchId,
      rentalUnitId: { [Op.ne]: null },
    },
    include: [{
      model: Rental,
      as: 'rental',
      required: true,
      where: rentalWhere,
      attributes: [],
    }],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });

  return [...new Set(rows.map((row) => row.rentalUnitId).filter(Boolean))];
};

/**
 * Available units for a product and date range (excludes maintenance/retired and booked units).
 */
const getAvailableUnitsForDateRange = async ({
  tenantId,
  productId,
  branchId,
  startDate,
  endDate,
  excludeRentalId = null,
  transaction = null,
}) => {
  const bookedIds = await getBookedUnitIdsForRange({
    tenantId,
    productId,
    branchId,
    startDate,
    endDate,
    excludeRentalId,
    transaction,
  });

  const where = {
    tenantId,
    productId,
    status: 'available',
  };
  if (branchId) {
    where[Op.or] = [{ branchId }, { branchId: null }];
  }
  if (bookedIds.length) {
    where.id = { [Op.notIn]: bookedIds };
  }

  return RentalUnit.findAll({
    where,
    order: [['serialNumber', 'ASC']],
    transaction,
  });
};

/**
 * Count operational units (non-retired) for a product.
 */
const countOperationalUnits = async ({ tenantId, productId, branchId = null, transaction = null }) => {
  const where = {
    tenantId,
    productId,
    status: { [Op.ne]: 'retired' },
  };
  if (branchId) {
    where[Op.or] = [{ branchId }, { branchId: null }];
  }
  return RentalUnit.count({ where, transaction });
};

const createRentalUnit = async ({
  tenantId,
  productId,
  branchId = null,
  serialNumber,
  status = 'available',
  notes = null,
  metadata = {},
}) => {
  const trimmedSerial = String(serialNumber || '').trim();
  if (!trimmedSerial) {
    const err = new Error('serialNumber is required');
    err.statusCode = 400;
    throw err;
  }

  const normalizedStatus = RENTAL_UNIT_STATUSES.includes(status) ? status : 'available';

  return RentalUnit.create({
    tenantId,
    productId,
    branchId,
    serialNumber: trimmedSerial,
    status: normalizedStatus,
    notes,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  });
};

const updateRentalUnit = async (unit, payload = {}) => {
  const updates = {};

  if (payload.serialNumber !== undefined) {
    const trimmedSerial = String(payload.serialNumber || '').trim();
    if (!trimmedSerial) {
      const err = new Error('serialNumber cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    updates.serialNumber = trimmedSerial;
  }

  if (payload.status !== undefined) {
    if (!RENTAL_UNIT_STATUSES.includes(payload.status)) {
      const err = new Error(`Invalid status. Must be one of: ${RENTAL_UNIT_STATUSES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    updates.status = payload.status;
  }

  if (payload.branchId !== undefined) updates.branchId = payload.branchId || null;
  if (payload.notes !== undefined) updates.notes = payload.notes || null;
  if (payload.metadata !== undefined) {
    updates.metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  }

  await unit.update(updates);
  return unit;
};

const deleteRentalUnit = async (unit) => {
  const usageCount = await RentalItem.count({ where: { rentalUnitId: unit.id } });
  if (usageCount > 0) {
    await unit.update({ status: 'retired' });
    return { deleted: false, retired: true };
  }
  await unit.destroy();
  return { deleted: true, retired: false };
};

/**
 * Validate rentalUnitId assignments on line items.
 * @throws {Error} statusCode 400 when invalid
 */
const validateItemUnitAssignments = async ({
  tenantId,
  branchId,
  startDate,
  endDate,
  items = [],
  excludeRentalId = null,
  transaction = null,
}) => {
  const failures = [];

  for (const item of items) {
    if (!item.rentalUnitId) continue;

    const product = await loadProductForUnitTracking(item.productId, tenantId, { transaction });
    if (!productTracksSerialUnits(product)) {
      failures.push({
        productId: item.productId,
        rentalUnitId: item.rentalUnitId,
        reason: 'Product does not track serial units',
      });
      continue;
    }

    const unit = await RentalUnit.findOne({
      where: { id: item.rentalUnitId, tenantId, productId: item.productId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    if (!unit) {
      failures.push({
        productId: item.productId,
        rentalUnitId: item.rentalUnitId,
        reason: 'Rental unit not found for this product',
      });
      continue;
    }

    if (unit.status === 'retired' || unit.status === 'maintenance') {
      failures.push({
        productId: item.productId,
        rentalUnitId: item.rentalUnitId,
        serialNumber: unit.serialNumber,
        reason: `Unit is ${unit.status}`,
      });
      continue;
    }

    const bookedIds = await getBookedUnitIdsForRange({
      tenantId,
      productId: item.productId,
      branchId: branchId || item.branchId,
      startDate,
      endDate,
      excludeRentalId,
      transaction,
    });

    if (bookedIds.includes(unit.id)) {
      failures.push({
        productId: item.productId,
        rentalUnitId: item.rentalUnitId,
        serialNumber: unit.serialNumber,
        reason: 'Unit is already booked for overlapping dates',
      });
    }
  }

  if (failures.length) {
    const first = failures[0];
    const err = new Error(first.reason || 'Invalid unit assignment');
    err.statusCode = 400;
    err.code = 'INVALID_RENTAL_UNIT';
    err.details = failures;
    throw err;
  }
};

/**
 * Apply unit assignments from checkout payload or create-time items.
 * @param {Array<{ rentalItemId: string, rentalUnitId: string }>} assignments
 */
const applyUnitAssignments = async ({
  tenantId,
  rental,
  items = [],
  assignments = [],
  transaction = null,
  markAsRented = false,
}) => {
  const assignmentMap = new Map(
    assignments
      .filter((row) => row?.rentalItemId && row?.rentalUnitId)
      .map((row) => [row.rentalItemId, row.rentalUnitId])
  );

  for (const item of items) {
    const rentalUnitId = assignmentMap.get(item.id) || item.rentalUnitId || null;
    if (!rentalUnitId) continue;

    await validateItemUnitAssignments({
      tenantId,
      branchId: rental.branchId,
      startDate: rental.startDate,
      endDate: rental.endDate,
      items: [{ productId: item.productId, rentalUnitId, branchId: item.branchId }],
      excludeRentalId: rental.id,
      transaction,
    });

    if (item.rentalUnitId !== rentalUnitId) {
      await item.update({ rentalUnitId }, { transaction });
    }

    if (markAsRented) {
      await RentalUnit.update(
        { status: 'rented' },
        { where: { id: rentalUnitId, tenantId }, transaction }
      );
    }
  }
};

/**
 * Release units when a rental is returned or cancelled.
 */
const releaseRentalUnits = async ({ rentalId, transaction = null }) => {
  const items = await RentalItem.findAll({
    where: { rentalId, rentalUnitId: { [Op.ne]: null } },
    attributes: ['rentalUnitId'],
    transaction,
  });

  const unitIds = [...new Set(items.map((item) => item.rentalUnitId).filter(Boolean))];
  if (!unitIds.length) return;

  await RentalUnit.update(
    { status: 'available' },
    { where: { id: { [Op.in]: unitIds }, status: 'rented' }, transaction }
  );
};

module.exports = {
  RENTAL_UNIT_STATUSES,
  productTracksSerialUnits,
  loadProductForUnitTracking,
  listRentalUnits,
  getBookedUnitIdsForRange,
  getAvailableUnitsForDateRange,
  countOperationalUnits,
  createRentalUnit,
  updateRentalUnit,
  deleteRentalUnit,
  validateItemUnitAssignments,
  applyUnitAssignments,
  releaseRentalUnits,
};
