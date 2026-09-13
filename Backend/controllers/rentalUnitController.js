const { Product } = require('../models');
const {
  listRentalUnits,
  createRentalUnit,
  updateRentalUnit,
  deleteRentalUnit,
  getAvailableUnitsForDateRange,
  productTracksSerialUnits,
  loadProductForUnitTracking,
} = require('../services/rentalUnitService');

const getTenantScope = (req) => req.tenantId || req.user?.tenantId || null;

const loadRentableProduct = async (req, productId) => {
  const tenantId = getTenantScope(req);
  const product = await Product.findOne({ where: { id: productId, tenantId } });
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }
  if (!product.isRentable) {
    const err = new Error('Product is not rentable');
    err.statusCode = 400;
    throw err;
  }
  return product;
};

const listProductRentalUnits = async (req, res, next) => {
  try {
    await loadRentableProduct(req, req.params.productId);
    const units = await listRentalUnits({
      tenantId: getTenantScope(req),
      productId: req.params.productId,
      branchId: req.query.branchId || null,
      status: req.query.status || null,
    });
    return res.status(200).json({ success: true, data: units });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const createProductRentalUnit = async (req, res, next) => {
  try {
    await loadRentableProduct(req, req.params.productId);
    const { serialNumber, branchId, status, notes, metadata } = req.body;

    const unit = await createRentalUnit({
      tenantId: getTenantScope(req),
      productId: req.params.productId,
      branchId: branchId || null,
      serialNumber,
      status,
      notes,
      metadata,
    });

    return res.status(201).json({ success: true, data: unit });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'A unit with this serial number already exists for this product' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const updateProductRentalUnit = async (req, res, next) => {
  try {
    await loadRentableProduct(req, req.params.productId);
    const { RentalUnit } = require('../models');
    const unit = await RentalUnit.findOne({
      where: {
        id: req.params.unitId,
        productId: req.params.productId,
        tenantId: getTenantScope(req),
      },
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Rental unit not found' });
    }

    await updateRentalUnit(unit, req.body);
    return res.status(200).json({ success: true, data: unit });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'A unit with this serial number already exists for this product' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

const deleteProductRentalUnit = async (req, res, next) => {
  try {
    await loadRentableProduct(req, req.params.productId);
    const { RentalUnit } = require('../models');
    const unit = await RentalUnit.findOne({
      where: {
        id: req.params.unitId,
        productId: req.params.productId,
        tenantId: getTenantScope(req),
      },
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Rental unit not found' });
    }

    const result = await deleteRentalUnit(unit);
    return res.status(200).json({
      success: true,
      message: result.retired ? 'Unit retired because it has rental history' : 'Unit deleted',
      data: { ...result, unit },
    });
  } catch (error) {
    return next(error);
  }
};

const getAvailableRentalUnits = async (req, res, next) => {
  try {
    const tenantId = getTenantScope(req);
    const { productId, branchId, startDate, endDate, excludeRentalId } = req.query;

    if (!productId || !branchId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'productId, branchId, startDate and endDate are required',
      });
    }

    const product = await loadProductForUnitTracking(productId, tenantId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const units = await getAvailableUnitsForDateRange({
      tenantId,
      productId,
      branchId,
      startDate,
      endDate,
      excludeRentalId: excludeRentalId || null,
    });

    return res.status(200).json({
      success: true,
      data: {
        productId,
        tracksSerialUnits: productTracksSerialUnits(product),
        units,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listProductRentalUnits,
  createProductRentalUnit,
  updateProductRentalUnit,
  deleteProductRentalUnit,
  getAvailableRentalUnits,
};
