const {
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  SaleReturnExchangeItem,
  SaleActivity,
  Product,
  ProductVariant,
  Customer,
  Shop,
  User,
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const { getPagination } = require('../utils/paginationUtils');
const { invalidateSaleListCache, invalidateAfterMutation } = require('../middleware/cache');
const {
  applyShopFilter,
  attachShopToPayload,
  assertShopRecordAccess,
} = require('../utils/shopUtils');
const { applyStockChange, getShopStockQuantity } = require('../utils/productStockUtils');

const RETURN_REASON_CODES = new Set([
  'customer_changed_mind',
  'wrong_item',
  'damaged',
  'defective',
  'expired',
  'other',
]);

const PAYMENT_METHODS = new Set(['cash', 'card', 'mobile_money', 'bank_transfer', 'other']);
const DISPOSITIONS = new Set(['restock', 'write_off']);

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const httpError = (statusCode, message, errorCode = null) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errorCode) err.errorCode = errorCode;
  return err;
};

const invalidateSaleCaches = (tenantId) => {
  invalidateSaleListCache(tenantId);
  invalidateAfterMutation(tenantId);
};

/**
 * Generate a unique return number for a tenant (RET-YYYYMMDD-XXXX).
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<string>}
 */
const generateReturnNumber = async (tenantId, transaction) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const prefix = `RET-${y}${m}${d}-`;

  const last = await SaleReturn.findOne({
    where: applyTenantFilter(tenantId, { returnNumber: { [Op.like]: `${prefix}%` } }),
    order: [['returnNumber', 'DESC']],
    attributes: ['returnNumber'],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  let seq = 1;
  if (last?.returnNumber) {
    const parsed = parseInt(String(last.returnNumber).split('-').pop(), 10);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

/**
 * Sum qty already returned per sale item for completed returns.
 * @param {string} saleId
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<Map<string, number>>}
 */
const getReturnedQtyBySaleItemId = async (saleId, tenantId, transaction) => {
  const rows = await SaleReturnItem.findAll({
    attributes: [
      'saleItemId',
      [sequelize.fn('SUM', sequelize.col('SaleReturnItem.qtyReturned')), 'qtyReturned'],
    ],
    include: [{
      model: SaleReturn,
      as: 'saleReturn',
      attributes: [],
      where: applyTenantFilter(tenantId, {
        originalSaleId: saleId,
        status: 'completed',
      }),
      required: true,
    }],
    group: ['SaleReturnItem.saleItemId'],
    raw: true,
    transaction,
  });

  const map = new Map();
  for (const row of rows) {
    map.set(row.saleItemId, parseFloat(row.qtyReturned) || 0);
  }
  return map;
};

/**
 * Build returnable line payload for a sale.
 * @param {object} sale - Sale with items
 * @param {Map<string, number>} returnedMap
 * @returns {{ lines: object[], fullyReturnable: boolean, anyReturnable: boolean, totalSaleQty: number, totalReturnedQty: number }}
 */
const buildReturnableLines = (sale, returnedMap) => {
  const lines = (sale.items || []).map((item) => {
    const soldQty = parseFloat(item.quantity) || 0;
    const alreadyReturned = returnedMap.get(item.id) || 0;
    const returnableQty = Math.max(0, roundMoney(soldQty - alreadyReturned));
    const unitAmount = soldQty > 0
      ? roundMoney((parseFloat(item.total) || 0) / soldQty)
      : roundMoney(item.unitPrice || 0);

    return {
      saleItemId: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      name: item.name,
      sku: item.sku,
      quantitySold: soldQty,
      quantityReturned: alreadyReturned,
      returnableQty,
      unitAmount,
      lineTotal: roundMoney(item.total),
      product: item.product || null,
      variant: item.variant || null,
    };
  });

  const totalSaleQty = lines.reduce((sum, l) => sum + l.quantitySold, 0);
  const totalReturnedQty = lines.reduce((sum, l) => sum + l.quantityReturned, 0);
  const anyReturnable = lines.some((l) => l.returnableQty > 0);
  const fullyReturnable = !anyReturnable && totalSaleQty > 0 && totalReturnedQty >= totalSaleQty;

  return { lines, fullyReturnable, anyReturnable, totalSaleQty, totalReturnedQty };
};

/**
 * Assert sale is eligible for a POS return.
 * @param {object} sale
 */
const assertSaleEligibleForReturn = (sale) => {
  if (!sale) {
    throw httpError(404, 'Sale not found');
  }
  if (sale.deletedAt) {
    throw httpError(400, 'Soft-deleted sales are not eligible for returns', 'SALE_SOFT_DELETED');
  }
  if (sale.status === 'cancelled') {
    throw httpError(400, 'Cancelled sales are not eligible for returns', 'SALE_CANCELLED');
  }
  if (sale.status === 'pending') {
    throw httpError(400, 'Pending sales must be paid before a return', 'SALE_PENDING');
  }
};

/**
 * Increment product/variant stock for restocked return lines.
 * @param {Array<{ productId?: string, productVariantId?: string, qtyReturned: number }>} items
 * @param {import('sequelize').Transaction} transaction
 * @param {{ tenantId?: string, shopId?: string|null, userId?: string|null, reference?: string|null }} [ctx]
 */
const restockReturnItems = async (items, transaction, ctx = {}) => {
  const { tenantId, shopId = null, userId = null, reference = null } = ctx;
  for (const item of items) {
    if (item.disposition !== 'restock') continue;
    const qty = parseFloat(item.qtyReturned) || 0;
    if (qty <= 0) continue;

    if (shopId && tenantId && item.productId) {
      await applyStockChange({
        tenantId,
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        shopId,
        delta: qty,
        type: 'return',
        reason: 'Sale return restock',
        reference,
        userId,
        metadata: { source: 'saleReturn' },
        transaction,
      });
      continue;
    }

    if (item.productVariantId) {
      const variant = await ProductVariant.findByPk(item.productVariantId, { transaction });
      const parent = item.productId
        ? await Product.findByPk(item.productId, { transaction })
        : (variant ? await Product.findByPk(variant.productId, { transaction }) : null);
      if (variant && parent?.trackStock !== false && variant.trackStock !== false) {
        const next = roundMoney((parseFloat(variant.quantityOnHand) || 0) + qty);
        await variant.update({ quantityOnHand: next }, { transaction });
      }
      continue;
    }

    if (item.productId) {
      const product = await Product.findByPk(item.productId, { transaction });
      if (product && product.trackStock !== false) {
        const next = roundMoney((parseFloat(product.quantityOnHand) || 0) + qty);
        await product.update({ quantityOnHand: next }, { transaction });
      }
    }
  }
};

/**
 * Decrement stock for exchange outgoing products. Throws if insufficient stock when tracked.
 * @param {Array<object>} exchangeItems
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} transaction
 * @param {{ shopId?: string|null, userId?: string|null, reference?: string|null }} [ctx]
 */
const decrementExchangeStock = async (exchangeItems, tenantId, transaction, ctx = {}) => {
  const { shopId = null, userId = null, reference = null } = ctx;
  for (const item of exchangeItems) {
    const qty = parseFloat(item.quantity) || 0;
    if (qty <= 0) continue;

    if (shopId && item.productId) {
      const onHand = await getShopStockQuantity({
        tenantId,
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        shopId,
        transaction,
      });
      if (onHand < qty) {
        throw httpError(
          400,
          `Insufficient stock for exchange item "${item.name || item.productId}" (have ${onHand}, need ${qty})`,
          'EXCHANGE_INSUFFICIENT_STOCK'
        );
      }
      await applyStockChange({
        tenantId,
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        shopId,
        delta: -qty,
        type: 'sale',
        reason: 'Sale return exchange',
        reference,
        userId,
        metadata: { source: 'saleReturnExchange' },
        transaction,
        allowNegative: false,
      });
      continue;
    }

    if (item.productVariantId) {
      const variant = await ProductVariant.findByPk(item.productVariantId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!variant) {
        throw httpError(400, `Exchange product variant not found: ${item.name || item.productVariantId}`);
      }
      const parent = await Product.findByPk(variant.productId, { transaction });
      if (!parent || String(parent.tenantId) !== String(tenantId)) {
        throw httpError(400, `Exchange product not found for variant ${item.productVariantId}`);
      }
      if (parent.trackStock !== false && variant.trackStock !== false) {
        const onHand = parseFloat(variant.quantityOnHand) || 0;
        if (onHand < qty) {
          throw httpError(
            400,
            `Insufficient stock for exchange item "${item.name || parent.name}" (have ${onHand}, need ${qty})`,
            'EXCHANGE_INSUFFICIENT_STOCK'
          );
        }
        await variant.update({ quantityOnHand: roundMoney(onHand - qty) }, { transaction });
      }
      continue;
    }

    if (item.productId) {
      const product = await Product.findByPk(item.productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product || String(product.tenantId) !== String(tenantId)) {
        throw httpError(400, `Exchange product not found: ${item.productId}`);
      }
      if (product.trackStock !== false) {
        const onHand = parseFloat(product.quantityOnHand) || 0;
        if (onHand < qty) {
          throw httpError(
            400,
            `Insufficient stock for exchange item "${item.name || product.name}" (have ${onHand}, need ${qty})`,
            'EXCHANGE_INSUFFICIENT_STOCK'
          );
        }
        await product.update({ quantityOnHand: roundMoney(onHand - qty) }, { transaction });
      }
    }
  }
};

/**
 * Update sale metadata.returnSummary and set status to refunded when fully returned.
 * @param {object} sale
 * @param {{ totalSaleQty: number, totalReturnedQty: number, hasExchange: boolean, hasRefund: boolean }} summary
 * @param {import('sequelize').Transaction} transaction
 */
const updateSaleReturnSummary = async (sale, summary, transaction) => {
  const fullyReturned = summary.totalSaleQty > 0
    && summary.totalReturnedQty >= summary.totalSaleQty - 0.0001;
  const prevMeta = sale.metadata && typeof sale.metadata === 'object' ? sale.metadata : {};
  const metadata = {
    ...prevMeta,
    returnSummary: {
      totalSaleQty: summary.totalSaleQty,
      totalReturnedQty: summary.totalReturnedQty,
      fullyReturned,
      hasExchange: summary.hasExchange,
      hasRefund: summary.hasRefund,
      updatedAt: new Date().toISOString(),
    },
  };

  const updates = { metadata };
  // Only flip completed/partially_paid → refunded when nothing remains returnable.
  // Marketplace Trade Assurance may also set refunded; POS returns share the same terminal status
  // once fully returned so reports (status = completed) continue to exclude them.
  if (fullyReturned && (sale.status === 'completed' || sale.status === 'partially_paid')) {
    updates.status = 'refunded';
  }

  await sale.update(updates, { transaction });
  return { fullyReturned, previousStatus: sale.status, newStatus: updates.status || sale.status };
};

/**
 * GET /api/sales/:id/returnable — remaining returnable qty per line.
 */
exports.getSaleReturnable = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [{
        model: SaleItem,
        as: 'items',
        separate: true,
        include: [
          { model: Product, as: 'product', required: false },
          { model: ProductVariant, as: 'variant', required: false },
        ],
      }],
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    let eligibility = { eligible: true, reason: null, code: null };
    try {
      assertSaleEligibleForReturn(sale);
    } catch (err) {
      eligibility = {
        eligible: false,
        reason: err.message,
        code: err.errorCode || null,
      };
    }

    const returnedMap = await getReturnedQtyBySaleItemId(sale.id, req.tenantId);
    const built = buildReturnableLines(sale, returnedMap);

    if (eligibility.eligible && !built.anyReturnable) {
      eligibility = {
        eligible: false,
        reason: 'No returnable quantity remaining on this sale',
        code: 'NOTHING_RETURNABLE',
      };
    }

    res.status(200).json({
      success: true,
      data: {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        status: sale.status,
        deletedAt: sale.deletedAt,
        total: roundMoney(sale.total),
        paymentMethod: sale.paymentMethod,
        eligibility,
        ...built,
        returnSummary: sale.metadata?.returnSummary || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/sales/:id/returns — create a refund or exchange (transactional).
 * Body: {
 *   type: 'refund'|'exchange',
 *   items: [{ saleItemId, qtyReturned, disposition, reasonCode }],
 *   exchangeItems?: [{ productId, productVariantId?, quantity, unitPrice }],
 *   refundAmount?, collectAmount?, refundMethod?, collectMethod?,
 *   reasonSummary?, notes?
 * }
 *
 * Money note: Phase 1 only *records* tender (cash/MoMo/card/bank). No Hubtel/Paystack/MTN reverse.
 */
exports.createSaleReturn = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const body = sanitizePayload(req.body || {});
    const type = body.type === 'exchange' ? 'exchange' : 'refund';
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const exchangeInput = Array.isArray(body.exchangeItems) ? body.exchangeItems : [];

    if (itemsInput.length === 0) {
      throw httpError(400, 'At least one return item is required');
    }

    if (type === 'exchange' && exchangeInput.length === 0) {
      throw httpError(400, 'Exchange requires at least one outgoing product');
    }

    const sale = await Sale.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [{ model: SaleItem, as: 'items' }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    assertSaleEligibleForReturn(sale);

    try {
      assertShopRecordAccess(req, sale);
    } catch (accessErr) {
      await transaction.rollback();
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const returnedMap = await getReturnedQtyBySaleItemId(sale.id, req.tenantId, transaction);
    const saleItemById = new Map((sale.items || []).map((i) => [i.id, i]));

    const preparedItems = [];
    let computedRefundFromLines = 0;

    for (const raw of itemsInput) {
      const saleItemId = raw.saleItemId;
      const saleItem = saleItemById.get(saleItemId);
      if (!saleItem) {
        throw httpError(400, `Sale item not found on this sale: ${saleItemId}`);
      }

      const qtyReturned = roundMoney(raw.qtyReturned);
      if (!(qtyReturned > 0)) {
        throw httpError(400, `Invalid qtyReturned for item ${saleItem.name}`);
      }

      const soldQty = parseFloat(saleItem.quantity) || 0;
      const alreadyReturned = returnedMap.get(saleItemId) || 0;
      const returnableQty = roundMoney(soldQty - alreadyReturned);
      if (qtyReturned > returnableQty + 0.0001) {
        throw httpError(
          400,
          `Cannot return ${qtyReturned} of "${saleItem.name}" — only ${returnableQty} returnable`,
          'OVER_RETURN'
        );
      }

      const disposition = DISPOSITIONS.has(raw.disposition) ? raw.disposition : 'restock';
      const reasonCode = raw.reasonCode && RETURN_REASON_CODES.has(raw.reasonCode)
        ? raw.reasonCode
        : (raw.reasonCode ? String(raw.reasonCode).slice(0, 64) : null);

      const unitAmount = soldQty > 0
        ? roundMoney((parseFloat(saleItem.total) || 0) / soldQty)
        : roundMoney(saleItem.unitPrice || 0);
      const lineRefundAmount = roundMoney(unitAmount * qtyReturned);
      computedRefundFromLines += lineRefundAmount;

      preparedItems.push({
        saleItemId,
        productId: saleItem.productId,
        productVariantId: saleItem.productVariantId,
        name: saleItem.name,
        sku: saleItem.sku,
        qtyReturned,
        unitAmount,
        lineRefundAmount,
        disposition,
        reasonCode,
      });

      returnedMap.set(saleItemId, alreadyReturned + qtyReturned);
    }

    const preparedExchange = [];
    let exchangeTotal = 0;
    for (const raw of exchangeInput) {
      const quantity = roundMoney(raw.quantity);
      const unitPrice = roundMoney(raw.unitPrice);
      if (!(quantity > 0)) {
        throw httpError(400, 'Exchange item quantity must be positive');
      }
      if (!raw.productId && !raw.productVariantId) {
        throw httpError(400, 'Exchange item requires productId or productVariantId');
      }

      let name = raw.name;
      let sku = raw.sku || null;
      let productId = raw.productId || null;
      let productVariantId = raw.productVariantId || null;

      if (productVariantId) {
        const variant = await ProductVariant.findByPk(productVariantId, { transaction });
        if (!variant) throw httpError(400, 'Exchange product variant not found');
        const product = await Product.findByPk(variant.productId, { transaction });
        if (!product || String(product.tenantId) !== String(req.tenantId)) {
          throw httpError(400, 'Exchange product not found');
        }
        productId = product.id;
        name = name || `${product.name}${variant.name ? ` (${variant.name})` : ''}`;
        sku = sku || variant.sku || product.sku || null;
      } else if (productId) {
        const product = await Product.findByPk(productId, { transaction });
        if (!product || String(product.tenantId) !== String(req.tenantId)) {
          throw httpError(400, 'Exchange product not found');
        }
        name = name || product.name;
        sku = sku || product.sku || null;
      }

      const lineTotal = roundMoney(quantity * unitPrice);
      exchangeTotal += lineTotal;
      preparedExchange.push({
        productId,
        productVariantId,
        name,
        sku,
        quantity,
        unitPrice,
        lineTotal,
      });
    }

    const netFromLines = roundMoney(computedRefundFromLines - exchangeTotal);
    let refundAmount = body.refundAmount != null
      ? roundMoney(body.refundAmount)
      : Math.max(0, netFromLines);
    let collectAmount = body.collectAmount != null
      ? roundMoney(body.collectAmount)
      : Math.max(0, -netFromLines);

    // Mutual exclusivity for v1 recording: prefer explicit body; otherwise net only one side.
    if (body.refundAmount == null && body.collectAmount == null) {
      if (netFromLines >= 0) {
        refundAmount = netFromLines;
        collectAmount = 0;
      } else {
        refundAmount = 0;
        collectAmount = roundMoney(-netFromLines);
      }
    }

    const refundMethod = refundAmount > 0
      ? (PAYMENT_METHODS.has(body.refundMethod) ? body.refundMethod : 'cash')
      : null;
    const collectMethod = collectAmount > 0
      ? (PAYMENT_METHODS.has(body.collectMethod) ? body.collectMethod : (body.refundMethod && PAYMENT_METHODS.has(body.refundMethod) ? body.refundMethod : 'cash'))
      : null;

    const stockCtx = {
      tenantId: req.tenantId,
      shopId: sale.shopId || null,
      userId: req.user?.id || null,
      reference: `sale:${sale.id}`,
    };
    await restockReturnItems(preparedItems, transaction, stockCtx);
    if (preparedExchange.length > 0) {
      await decrementExchangeStock(preparedExchange, req.tenantId, transaction, stockCtx);
    }

    const shopPayload = attachShopToPayload(req, { shopId: sale.shopId });
    const returnNumber = await generateReturnNumber(req.tenantId, transaction);

    const saleReturn = await SaleReturn.create({
      tenantId: req.tenantId,
      shopId: shopPayload.shopId ?? sale.shopId ?? null,
      originalSaleId: sale.id,
      returnNumber,
      type,
      status: 'completed',
      reasonSummary: body.reasonSummary ? String(body.reasonSummary).slice(0, 255) : null,
      refundAmount,
      collectAmount,
      refundMethod,
      collectMethod,
      createdBy: req.user?.id || null,
      notes: body.notes || null,
      metadata: {
        computedRefundFromLines: roundMoney(computedRefundFromLines),
        exchangeTotal: roundMoney(exchangeTotal),
        recordedTenderOnly: true,
      },
    }, { transaction });

    await SaleReturnItem.bulkCreate(
      preparedItems.map((item) => ({ ...item, saleReturnId: saleReturn.id })),
      { transaction }
    );

    if (preparedExchange.length > 0) {
      await SaleReturnExchangeItem.bulkCreate(
        preparedExchange.map((item) => ({ ...item, saleReturnId: saleReturn.id })),
        { transaction }
      );
    }

    const builtAfter = buildReturnableLines(sale, returnedMap);
    const priorSummary = sale.metadata?.returnSummary || {};
    const statusUpdate = await updateSaleReturnSummary(sale, {
      totalSaleQty: builtAfter.totalSaleQty,
      totalReturnedQty: builtAfter.totalReturnedQty,
      hasExchange: Boolean(priorSummary.hasExchange) || type === 'exchange',
      hasRefund: Boolean(priorSummary.hasRefund) || type === 'refund' || refundAmount > 0,
    }, transaction);

    const activitySubject = type === 'exchange'
      ? `Exchange ${returnNumber}`
      : `Refund ${returnNumber}`;
    const activityNotes = [
      body.reasonSummary,
      refundAmount > 0 ? `Refunded ${refundAmount} via ${refundMethod || 'n/a'}` : null,
      collectAmount > 0 ? `Collected ${collectAmount} via ${collectMethod || 'n/a'}` : null,
      statusUpdate.fullyReturned ? 'Sale fully returned' : 'Partial return',
    ].filter(Boolean).join('. ');

    await SaleActivity.create({
      tenantId: req.tenantId,
      saleId: sale.id,
      type: 'refund',
      subject: activitySubject,
      notes: activityNotes || null,
      createdBy: req.user?.id || null,
      metadata: {
        saleReturnId: saleReturn.id,
        returnNumber,
        returnType: type,
        refundAmount,
        collectAmount,
        fullyReturned: statusUpdate.fullyReturned,
        previousStatus: statusUpdate.previousStatus,
        newStatus: statusUpdate.newStatus,
      },
    }, { transaction });

    await transaction.commit();
    invalidateSaleCaches(req.tenantId);

    const full = await SaleReturn.findOne({
      where: applyTenantFilter(req.tenantId, { id: saleReturn.id }),
      include: [
        { model: SaleReturnItem, as: 'items' },
        { model: SaleReturnExchangeItem, as: 'exchangeItems' },
        {
          model: Sale,
          as: 'originalSale',
          attributes: ['id', 'saleNumber', 'status', 'total', 'metadata'],
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: full,
      message: type === 'exchange' ? 'Exchange recorded' : 'Refund recorded',
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.message,
        errorCode: error.errorCode || undefined,
      });
    }
    next(error);
  }
};

/**
 * GET /api/returns — paginated list for tenant/shop.
 */
exports.getReturns = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    let where = applyTenantFilter(req.tenantId, {});
    where = applyShopFilter(req, where);

    if (req.query.type === 'refund' || req.query.type === 'exchange') {
      where.type = req.query.type;
    }
    if (req.query.status === 'completed' || req.query.status === 'cancelled') {
      where.status = req.query.status;
    }
    if (req.query.saleId) {
      where.originalSaleId = req.query.saleId;
    }
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.or] = [
          { returnNumber: { [Op.iLike]: `%${q}%` } },
          { reasonSummary: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await SaleReturn.findAndCountAll({
      where,
      include: [
        {
          model: Sale,
          as: 'originalSale',
          attributes: ['id', 'saleNumber', 'status', 'total', 'customerId'],
          include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] }],
        },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/returns/:id — return detail.
 */
exports.getReturn = async (req, res, next) => {
  try {
    const saleReturn = await SaleReturn.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        {
          model: SaleReturnItem,
          as: 'items',
          include: [
            { model: Product, as: 'product', required: false },
            { model: ProductVariant, as: 'variant', required: false },
          ],
        },
        {
          model: SaleReturnExchangeItem,
          as: 'exchangeItems',
          include: [
            { model: Product, as: 'product', required: false },
            { model: ProductVariant, as: 'variant', required: false },
          ],
        },
        {
          model: Sale,
          as: 'originalSale',
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
            { model: SaleItem, as: 'items', separate: true },
          ],
        },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
      ],
    });

    if (!saleReturn) {
      return res.status(404).json({ success: false, message: 'Return not found' });
    }

    try {
      assertShopRecordAccess(req, saleReturn);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    res.status(200).json({
      success: true,
      data: saleReturn,
    });
  } catch (error) {
    next(error);
  }
};

// Exported for unit tests
exports._test = {
  buildReturnableLines,
  getReturnedQtyBySaleItemId,
  assertSaleEligibleForReturn,
  RETURN_REASON_CODES,
  roundMoney,
  httpError,
};
