const { StockCount, StockCountItem, Product, ProductVariant, Shop, User } = require('../models');
const { Op } = require('sequelize');
const { applyTenantFilter } = require('../utils/tenantUtils');
const {
  applyShopFilter,
  assertShopRecordAccess,
} = require('../utils/shopUtils');
const { getPagination } = require('../utils/paginationUtils');
const { sequelize } = require('../config/database');
const { applyStockChange } = require('../utils/productStockUtils');

/**
 * Generate unique count number
 */
const generateCountNumber = async (tenantId) => {
  const prefix = 'SC';
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  const count = await StockCount.count({
    where: {
      tenantId,
      createdAt: {
        [Op.gte]: new Date(today.setHours(0, 0, 0, 0))
      }
    }
  });
  
  const sequence = String(count + 1).padStart(3, '0');
  return `${prefix}-${dateStr}-${sequence}`;
};

/**
 * Get all stock counts
 * @route GET /api/stock-counts
 */
exports.getStockCounts = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    const { status, shopId, startDate, endDate } = req.query;

    let where = applyShopFilter(req, applyTenantFilter(tenantId, {}));

    if (status) where.status = status;
    if (startDate || endDate) {
      where.countDate = {};
      if (startDate) where.countDate[Op.gte] = new Date(startDate);
      if (endDate) where.countDate[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await StockCount.findAndCountAll({
      where,
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        { model: User, as: 'counter', attributes: ['id', 'name'] },
        { model: User, as: 'approver', attributes: ['id', 'name'] }
      ],
      order: [['countDate', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching stock counts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stock counts' });
  }
};

/**
 * Get single stock count with items
 * @route GET /api/stock-counts/:id
 */
exports.getStockCount = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const stockCount = await StockCount.findOne({
      where: applyShopFilter(req, applyTenantFilter(tenantId, { id })),
      include: [
        { model: Shop, as: 'shop' },
        { model: User, as: 'counter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] },
        {
          model: StockCountItem,
          as: 'items',
          include: [
            { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'quantityOnHand'] },
            { model: User, as: 'itemCounter', attributes: ['id', 'name'] }
          ]
        }
      ]
    });

    if (!stockCount) {
      return res.status(404).json({ success: false, error: 'Stock count not found' });
    }

    try {
      assertShopRecordAccess(req, stockCount);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    res.json({ success: true, data: stockCount });
  } catch (error) {
    console.error('Error fetching stock count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stock count' });
  }
};

/**
 * Create new stock count session
 * @route POST /api/stock-counts
 */
exports.createStockCount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const { countType = 'full', countDate = new Date(), notes, productIds = [] } = req.body;
    const resolvedShopId = req.shopFilterId || req.defaultShopId || null;
    if (!resolvedShopId && req.shopScoped) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Select a shop before starting a stock count',
      });
    }

    const countNumber = await generateCountNumber(tenantId);

    let productWhere = applyShopFilter(req, applyTenantFilter(tenantId, { isActive: true }));
    if (productIds.length > 0) productWhere.id = { [Op.in]: productIds };

    const products = await Product.findAll({
      where: productWhere,
      transaction
    });

    const stockCount = await StockCount.create({
      tenantId,
      shopId: resolvedShopId,
      countNumber,
      countDate: new Date(countDate),
      status: 'in_progress',
      countType,
      totalProducts: products.length,
      countedBy: userId,
      notes
    }, { transaction });

    // Create count items for each product
    const countItems = products.map(product => ({
      stockCountId: stockCount.id,
      tenantId,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productBarcode: product.barcode,
      unitCost: product.costPrice,
      systemQuantity: product.quantityOnHand,
      varianceType: 'uncounted'
    }));

    await StockCountItem.bulkCreate(countItems, { transaction });

    await transaction.commit();

    // Fetch with relations
    const created = await StockCount.findByPk(stockCount.id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: StockCountItem, as: 'items' }
      ]
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating stock count:', error);
    res.status(500).json({ success: false, error: 'Failed to create stock count' });
  }
};

/**
 * Update stock count item (record count)
 * @route PUT /api/stock-counts/:id/items/:itemId
 */
exports.updateCountItem = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const { id, itemId } = req.params;
    const { countedQuantity, notes } = req.body;

    const stockCount = await StockCount.findOne({
      where: applyShopFilter(req, applyTenantFilter(tenantId, { id, status: 'in_progress' })),
    });

    if (!stockCount) {
      return res.status(404).json({ 
        success: false, 
        error: 'Stock count not found or not in progress' 
      });
    }

    try {
      assertShopRecordAccess(req, stockCount);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const item = await StockCountItem.findOne({
      where: { id: itemId, stockCountId: id }
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Calculate variance
    const counted = parseFloat(countedQuantity);
    const system = parseFloat(item.systemQuantity);
    const variance = counted - system;
    const varianceValue = variance * parseFloat(item.unitCost);
    
    let varianceType = 'match';
    if (variance < 0) varianceType = 'shrinkage';
    else if (variance > 0) varianceType = 'overage';

    await item.update({
      countedQuantity: counted,
      varianceQuantity: variance,
      varianceValue: varianceValue,
      varianceType,
      countedAt: new Date(),
      countedBy: userId,
      adjustmentNotes: notes
    });

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Error updating count item:', error);
    res.status(500).json({ success: false, error: 'Failed to update count item' });
  }
};

/**
 * Complete stock count and calculate summary
 * @route POST /api/stock-counts/:id/complete
 */
exports.completeStockCount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const stockCount = await StockCount.findOne({
      where: applyShopFilter(req, applyTenantFilter(tenantId, { id, status: 'in_progress' })),
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!stockCount) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        error: 'Stock count not found or not in progress' 
      });
    }

    try {
      assertShopRecordAccess(req, stockCount);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    // Calculate summary from items
    const items = await StockCountItem.findAll({
      where: { stockCountId: id },
      transaction
    });

    const countedProducts = items.filter(i => i.countedQuantity !== null).length;
    const matchedProducts = items.filter(i => i.varianceType === 'match').length;
    const varianceProducts = items.filter(i => i.varianceType !== 'match' && i.varianceType !== 'uncounted').length;
    
    const totalShrinkageValue = items
      .filter(i => i.varianceType === 'shrinkage')
      .reduce((sum, i) => sum + Math.abs(parseFloat(i.varianceValue || 0)), 0);
    
    const totalOverageValue = items
      .filter(i => i.varianceType === 'overage')
      .reduce((sum, i) => sum + parseFloat(i.varianceValue || 0), 0);

    const totalVarianceValue = items
      .reduce((sum, i) => sum + Math.abs(parseFloat(i.varianceValue || 0)), 0);

    await stockCount.update({
      status: 'completed',
      countedProducts,
      matchedProducts,
      varianceProducts,
      totalVarianceValue,
      totalShrinkageValue,
      totalOverageValue
    }, { transaction });

    await transaction.commit();

    const completed = await StockCount.findByPk(id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: StockCountItem, as: 'items' }
      ]
    });

    res.json({ success: true, data: completed });
  } catch (error) {
    await transaction.rollback();
    console.error('Error completing stock count:', error);
    res.status(500).json({ success: false, error: 'Failed to complete stock count' });
  }
};

/**
 * Approve stock count and apply adjustments
 * @route POST /api/stock-counts/:id/approve
 */
exports.approveStockCount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const { id } = req.params;
    const { applyAdjustments = true } = req.body;

    const stockCount = await StockCount.findOne({
      where: { id, tenantId, status: 'completed' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!stockCount) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        error: 'Stock count not found or not completed' 
      });
    }

    // Apply inventory adjustments if requested
    if (applyAdjustments) {
      const items = await StockCountItem.findAll({
        where: { 
          stockCountId: id,
          varianceType: { [Op.in]: ['shrinkage', 'overage'] }
        },
        transaction
      });

      for (const item of items) {
        const product = await Product.findByPk(item.productId, { transaction });
        const shopId = stockCount.shopId || product?.shopId || null;
        if (shopId && product) {
          await applyStockChange({
            tenantId,
            productId: item.productId,
            shopId,
            setTo: parseFloat(item.countedQuantity) || 0,
            type: 'count_adjustment',
            reason: `Stock count ${stockCount.countNumber || id}`,
            reference: `stock_count:${id}`,
            userId,
            metadata: {
              source: 'approveStockCount',
              varianceType: item.varianceType,
              systemQuantity: item.systemQuantity,
            },
            transaction,
          });
        } else {
          await Product.update(
            { quantityOnHand: item.countedQuantity },
            { where: { id: item.productId }, transaction }
          );
        }

        await item.update({ adjustmentApplied: true }, { transaction });
      }
    }

    await stockCount.update({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date()
    }, { transaction });

    await transaction.commit();

    const approved = await StockCount.findByPk(id, {
      include: [
        { model: Shop, as: 'shop' },
        { model: User, as: 'approver' }
      ]
    });

    res.json({ success: true, data: approved });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving stock count:', error);
    res.status(500).json({ success: false, error: 'Failed to approve stock count' });
  }
};

/**
 * Get reconciliation summary/report
 * @route GET /api/stock-counts/reconciliation-report
 */
exports.getReconciliationReport = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    const where = applyShopFilter(req, applyTenantFilter(tenantId, {
      status: { [Op.in]: ['completed', 'approved'] },
    }));
    if (startDate || endDate) {
      where.countDate = {};
      if (startDate) where.countDate[Op.gte] = new Date(startDate);
      if (endDate) where.countDate[Op.lte] = new Date(endDate);
    }

    // Get stock counts in period
    const stockCounts = await StockCount.findAll({
      where,
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'] }],
      order: [['countDate', 'DESC']]
    });

    // Calculate totals
    const totals = stockCounts.reduce((acc, sc) => ({
      totalCounts: acc.totalCounts + 1,
      totalProducts: acc.totalProducts + sc.totalProducts,
      totalVarianceValue: acc.totalVarianceValue + parseFloat(sc.totalVarianceValue || 0),
      totalShrinkageValue: acc.totalShrinkageValue + parseFloat(sc.totalShrinkageValue || 0),
      totalOverageValue: acc.totalOverageValue + parseFloat(sc.totalOverageValue || 0),
      varianceProducts: acc.varianceProducts + sc.varianceProducts
    }), {
      totalCounts: 0,
      totalProducts: 0,
      totalVarianceValue: 0,
      totalShrinkageValue: 0,
      totalOverageValue: 0,
      varianceProducts: 0
    });

    // Get top shrinkage products
    const topShrinkageProducts = await StockCountItem.findAll({
      where: {
        tenantId,
        varianceType: 'shrinkage',
        stockCountId: { [Op.in]: stockCounts.map(sc => sc.id) }
      },
      attributes: [
        'productId',
        'productName',
        'productSku',
        [sequelize.fn('SUM', sequelize.col('varianceQuantity')), 'totalVariance'],
        [sequelize.fn('SUM', sequelize.col('varianceValue')), 'totalValue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'occurrences']
      ],
      group: ['productId', 'productName', 'productSku'],
      order: [[sequelize.fn('SUM', sequelize.col('varianceValue')), 'ASC']],
      limit: 10,
      raw: true
    });

    res.json({
      success: true,
      data: {
        summary: totals,
        counts: stockCounts,
        topShrinkageProducts: topShrinkageProducts.map(p => ({
          ...p,
          totalVariance: Math.abs(parseFloat(p.totalVariance)),
          totalValue: Math.abs(parseFloat(p.totalValue))
        }))
      }
    });
  } catch (error) {
    console.error('Error generating reconciliation report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
};

/**
 * Delete stock count (only drafts/cancelled)
 * @route DELETE /api/stock-counts/:id
 */
exports.deleteStockCount = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const stockCount = await StockCount.findOne({
      where: applyShopFilter(req, applyTenantFilter(tenantId, {
        id,
        status: { [Op.in]: ['draft', 'cancelled'] },
      })),
      transaction
    });

    if (!stockCount) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        error: 'Stock count not found or cannot be deleted' 
      });
    }

    try {
      assertShopRecordAccess(req, stockCount);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    await StockCountItem.destroy({ where: { stockCountId: id }, transaction });
    await stockCount.destroy({ transaction });

    await transaction.commit();

    res.json({ success: true, message: 'Stock count deleted' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting stock count:', error);
    res.status(500).json({ success: false, error: 'Failed to delete stock count' });
  }
};
