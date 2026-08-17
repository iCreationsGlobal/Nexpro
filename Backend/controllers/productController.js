const fs = require('fs');
const path = require('path');
const { Product, ProductVariant, ProductStockMovement, Shop, ProductCategory, Barcode, SaleItem, Sale, Customer, User } = require('../models');
const { Op } = require('sequelize');
const { applyTenantFilter, sanitizePayload } = require('../utils/tenantUtils');
const { getPagination } = require('../utils/paginationUtils');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const { invalidateProductListCache } = require('../middleware/cache');
const {
  applyShopReadFilter,
  attachShopToPayload,
  assertShopRecordAccess,
  userCanAccessShopId,
} = require('../utils/shopUtils');
const { resolveCatalogProductCode } = require('../utils/documentLineItemUtils');
const {
  applyEffectiveProductQuantity,
  syncParentQuantityFromVariants,
  parseQuantity,
  recordProductStockMovement,
  resolveStockMovementType,
  applyStockChange,
  attachShopStockToProducts,
  shopCatalogVisibilityLiteral,
} = require('../utils/productStockUtils');

const PRODUCT_STAFF_SENSITIVE_FIELDS = [
  'costPrice',
  'supplier',
  'vendor',
  'stockValue',
  'inventoryValue',
  'totalValue',
  'totalCost',
  'costValue',
];

/**
 * Normalize optional wholesalePrice on create/update payloads.
 * Empty string / undefined → null; invalid or negative → 400-style Error.
 * @param {object} payload
 * @returns {object} payload
 */
const normalizeWholesalePrice = (payload) => {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'wholesalePrice')) {
    return payload;
  }
  const raw = payload.wholesalePrice;
  if (raw === '' || raw === null || raw === undefined) {
    payload.wholesalePrice = null;
    return payload;
  }
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (Number.isNaN(n) || n < 0) {
    const err = new Error('wholesalePrice must be a non-negative number');
    err.statusCode = 400;
    throw err;
  }
  payload.wholesalePrice = n;
  return payload;
};

const canViewProductSensitiveFields = (req) => {
  const role = req.tenantRole || req.user?.role || null;
  return role !== 'staff';
};

const stripSensitiveProductFields = (record, req) => {
  if (canViewProductSensitiveFields(req) || !record) return record;

  const product = typeof record.get === 'function'
    ? record.get({ plain: true })
    : { ...record };

  PRODUCT_STAFF_SENSITIVE_FIELDS.forEach((field) => {
    delete product[field];
  });

  if (Array.isArray(product.variants)) {
    product.variants = product.variants.map((variant) => {
      const safeVariant = typeof variant?.get === 'function'
        ? variant.get({ plain: true })
        : { ...(variant || {}) };
      PRODUCT_STAFF_SENSITIVE_FIELDS.forEach((field) => {
        delete safeVariant[field];
      });
      return safeVariant;
    });
  }

  if (product.selectedVariant) {
    PRODUCT_STAFF_SENSITIVE_FIELDS.forEach((field) => {
      delete product.selectedVariant[field];
    });
  }

  return applyEffectiveProductQuantity(product);
};

const stripSensitiveProductListFields = (records, req) => {
  if (canViewProductSensitiveFields(req) || !Array.isArray(records)) return records;
  return records.map((record) => stripSensitiveProductFields(record, req));
};

const PRODUCT_LIST_BARCODE_ATTRIBUTES = ['barcode', 'isActive'];

/** Whitelisted product list sort keys → Sequelize order clauses (always include id tie-breaker). */
const PRODUCT_LIST_SORT_ORDERS = {
  name_asc: [['name', 'ASC'], ['id', 'ASC']],
  created_desc: [['createdAt', 'DESC'], ['id', 'DESC']],
  updated_desc: [['updatedAt', 'DESC'], ['id', 'DESC']],
  stock_desc: [['quantityOnHand', 'DESC'], ['id', 'DESC']],
  stock_asc: [['quantityOnHand', 'ASC'], ['id', 'ASC']],
  price_asc: [['sellingPrice', 'ASC'], ['id', 'ASC']],
  price_desc: [['sellingPrice', 'DESC'], ['id', 'DESC']],
};

const DEFAULT_PRODUCT_LIST_SORT = 'name_asc';

/**
 * Resolve list sort from `sort` / `sortBy` query. Unknown values fall back to name_asc.
 * @param {string|undefined|null} rawSort
 * @returns {{ sort: string, order: Array }}
 */
const resolveProductListSort = (rawSort) => {
  const key = typeof rawSort === 'string' ? rawSort.trim() : '';
  if (key && PRODUCT_LIST_SORT_ORDERS[key]) {
    return { sort: key, order: PRODUCT_LIST_SORT_ORDERS[key] };
  }
  return {
    sort: DEFAULT_PRODUCT_LIST_SORT,
    order: PRODUCT_LIST_SORT_ORDERS[DEFAULT_PRODUCT_LIST_SORT],
  };
};

const formatProductForList = (record, req) => {
  const stripped = stripSensitiveProductFields(record, req);
  const plain = typeof stripped?.get === 'function'
    ? stripped.get({ plain: true })
    : (stripped && typeof stripped === 'object' ? { ...stripped } : stripped);

  if (!plain || typeof plain !== 'object') return plain;

  plain.productCode = resolveCatalogProductCode(plain) || null;

  if (plain.metadata && typeof plain.metadata === 'object') {
    delete plain.metadata;
  }

  // Oversized data-URL images OOM React Native Product grids (same class of crash as Profile avatars).
  if (
    typeof plain.imageUrl === 'string' &&
    plain.imageUrl.startsWith('data:') &&
    plain.imageUrl.length > 200_000
  ) {
    plain.imageUrl = null;
  }

  return plain;
};

const formatProductListResponse = (records, req) => {
  if (!Array.isArray(records)) return records;
  return records.map((record) => formatProductForList(record, req));
};

/**
 * Scope product queries to a shop using shared-catalog visibility
 * (home shopId, null shopId, or product_shop_stocks row).
 * @param {object} req
 * @param {object} where
 * @param {string|null|undefined} shopIdQuery
 * @returns {{ where: object, effectiveShopId: string|null }}
 */
const applyProductShopScope = (req, where, shopIdQuery) => {
  const effectiveShopId = shopIdQuery || (req.shopScoped ? req.shopFilterId : null) || null;

  if (effectiveShopId) {
    const next = { ...where };
    next[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : where[Op.and] ? [where[Op.and]] : []),
      shopCatalogVisibilityLiteral(effectiveShopId),
    ];
    return { where: next, effectiveShopId };
  }

  if (req.shopScoped) {
    return { where: applyShopReadFilter(req, where), effectiveShopId: null };
  }

  return { where, effectiveShopId: null };
};

const stripStaffProductWritePayload = (payload, req) => {
  if (canViewProductSensitiveFields(req) || !payload) return payload;
  PRODUCT_STAFF_SENSITIVE_FIELDS.forEach((field) => {
    delete payload[field];
  });
  return payload;
};

const normalizeBarcodeCandidates = (...sources) => {
  const candidates = [];
  const seen = new Set();

  const add = (value) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (value === undefined || value === null) return;
    String(value)
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .forEach((candidate) => {
        if (!seen.has(candidate)) {
          seen.add(candidate);
          candidates.push(candidate);
        }
      });
  };

  sources.forEach(add);
  return candidates;
};

const extractProductAliasBarcodes = (payload = {}) => {
  const hasAliasPayload =
    Object.prototype.hasOwnProperty.call(payload, 'barcodeAliases') ||
    Object.prototype.hasOwnProperty.call(payload, 'alternateBarcode');
  const aliases = normalizeBarcodeCandidates(payload.barcodeAliases, payload.alternateBarcode);
  delete payload.barcodeAliases;
  delete payload.alternateBarcode;
  return { hasAliasPayload, aliases };
};

const syncProductAliasBarcodes = async ({ product, tenantId, aliases, transaction }) => {
  const primaryBarcode = product.barcode ? String(product.barcode).trim() : '';
  const aliasBarcodes = normalizeBarcodeCandidates(aliases).filter((barcode) => barcode !== primaryBarcode);

  if (aliasBarcodes.length > 0) {
    const conflictingProduct = await Product.findOne({
      where: applyTenantFilter(tenantId, {
        id: { [Op.ne]: product.id },
        [Op.or]: [
          { barcode: { [Op.in]: aliasBarcodes } },
          { sku: { [Op.in]: aliasBarcodes } }
        ]
      }),
      transaction
    });
    if (conflictingProduct) {
      const error = new Error('Product code is already used by another product');
      error.statusCode = 400;
      throw error;
    }

    const conflictingAlias = await Barcode.findOne({
      where: {
        tenantId,
        barcode: { [Op.in]: aliasBarcodes },
        [Op.or]: [
          { productId: { [Op.ne]: product.id } },
          { productId: null },
          { productVariantId: { [Op.ne]: null } }
        ]
      },
      transaction
    });
    if (conflictingAlias) {
      const error = new Error('Product code is already used by another product or variant');
      error.statusCode = 400;
      throw error;
    }
  }

  const productAliasWhere = {
    tenantId,
    productId: product.id,
    productVariantId: null
  };
  if (aliasBarcodes.length === 0) {
    await Barcode.destroy({ where: productAliasWhere, transaction });
    return;
  }

  await Barcode.destroy({
    where: {
      ...productAliasWhere,
      barcode: { [Op.notIn]: aliasBarcodes }
    },
    transaction
  });

  for (const barcode of aliasBarcodes) {
    const [record, created] = await Barcode.findOrCreate({
      where: { tenantId, barcode },
      defaults: {
        tenantId,
        productId: product.id,
        productVariantId: null,
        barcode,
        barcodeType: 'other',
        isActive: true,
        metadata: { source: 'product_form', role: 'alternate' }
      },
      transaction
    });

    if (!created) {
      await record.update({
        productId: product.id,
        productVariantId: null,
        isActive: true,
        metadata: {
          ...(record.metadata || {}),
          source: 'product_form',
          role: 'alternate'
        }
      }, { transaction });
    }
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const search = req.query.search || '';
    const shopId = req.query.shopId;
    const categoryId = req.query.categoryId;
    const isActive = req.query.isActive;
    const includeVariants = req.query.includeVariants === 'true' || req.query.forPOS === 'true';
    const { order } = resolveProductListSort(req.query.sort || req.query.sortBy);

    let where = applyTenantFilter(req.tenantId, {});
    const scoped = applyProductShopScope(req, where, shopId);
    where = scoped.where;
    const effectiveShopId = scoped.effectiveShopId;
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    }
    if (search) {
      const searchPattern = `%${search}%`;
      const searchOrConditions = [
        { name: { [Op.iLike]: searchPattern } },
        { sku: { [Op.iLike]: searchPattern } },
        { barcode: { [Op.iLike]: searchPattern } },
        { brand: { [Op.iLike]: searchPattern } },
        Product.sequelize.where(
          Product.sequelize.cast(Product.sequelize.literal(`"Product"."metadata"->>'productCode'`), 'text'),
          { [Op.iLike]: searchPattern },
        ),
      ];

      const aliasMatches = await Barcode.findAll({
        where: {
          tenantId: req.tenantId,
          productId: { [Op.ne]: null },
          barcode: { [Op.iLike]: searchPattern },
        },
        attributes: ['productId'],
        raw: true,
      });
      const aliasProductIds = [...new Set(aliasMatches.map((row) => row.productId).filter(Boolean))];
      if (aliasProductIds.length > 0) {
        searchOrConditions.push({ id: { [Op.in]: aliasProductIds } });
      }

      const searchCondition = { [Op.or]: searchOrConditions };

      where[Op.and] = Array.isArray(where[Op.and])
        ? [...where[Op.and]]
        : (where[Op.and] ? [where[Op.and]] : []);

      if (where[Op.or]) {
        where[Op.and].push({ [Op.or]: where[Op.or] });
        delete where[Op.or];
      }

      where[Op.and].push(searchCondition);
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      limit,
      offset,
      attributes: {
        exclude: ['metadata'],
        include: [
          [Product.sequelize.literal(`"Product"."metadata"->>'productCode'`), 'productCode'],
          [Product.sequelize.literal(`(
            SELECT COALESCE(SUM(pv."quantityOnHand"), 0)
            FROM product_variants pv
            WHERE pv."productId" = "Product"."id"
              AND pv."isActive" = true
          )`), 'totalVariantStock'],
        ],
      },
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        {
          model: Barcode,
          as: 'barcodes',
          required: false,
          attributes: PRODUCT_LIST_BARCODE_ATTRIBUTES,
        },
        ...(includeVariants ? [{
          model: ProductVariant,
          as: 'variants',
          required: false,
          where: { isActive: true },
          attributes: ['id', 'productId', 'name', 'sku', 'barcode', 'sellingPrice', 'wholesalePrice', 'quantityOnHand', 'attributes', 'isActive', 'trackStock']
        }] : [])
      ],
      distinct: true,
      order,
    });

    let listData = formatProductListResponse(rows, req);
    if (effectiveShopId) {
      listData = await attachShopStockToProducts(listData, {
        tenantId: req.tenantId,
        shopId: effectiveShopId,
      });
      listData = listData.map((p) => applyEffectiveProductQuantity(p));
    }

    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data: listData
    });
  } catch (error) {
    next(error);
  }
};

// Exported for unit tests
exports._resolveProductListSort = resolveProductListSort;

// @desc    Get product catalog statistics
// @route   GET /api/products/stats
// @access  Private
exports.getProductStats = async (req, res, next) => {
  try {
    const shopId = req.query.shopId;

    let where = applyTenantFilter(req.tenantId, {});
    const scoped = applyProductShopScope(req, where, shopId);
    where = scoped.where;

    const trackingWhere = {
      ...where,
      trackStock: { [Op.ne]: false },
    };

    const includeSensitiveValues = canViewProductSensitiveFields(req);
    const [total, lowStock, outOfStock, valueRows] = await Promise.all([
      Product.count({ where }),
      Product.count({
        where: {
          ...trackingWhere,
          quantityOnHand: { [Op.gt]: 0 },
          [Op.and]: [
            Product.sequelize.where(
              Product.sequelize.col('quantityOnHand'),
              Op.lte,
              Product.sequelize.col('reorderLevel')
            ),
          ],
        },
      }),
      Product.count({
        where: {
          ...trackingWhere,
          quantityOnHand: { [Op.lte]: 0 },
        },
      }),
      includeSensitiveValues
        ? Product.findAll({
            where,
            attributes: ['costPrice', 'quantityOnHand'],
            raw: true,
          })
        : Promise.resolve([]),
    ]);

    const totalValue = includeSensitiveValues
      ? valueRows.reduce((sum, product) => {
          return sum + (parseFloat(product.costPrice || 0) * parseFloat(product.quantityOnHand || 0));
        }, 0)
      : undefined;

    res.status(200).json({
      success: true,
      data: {
        total,
        lowStock,
        outOfStock,
        ...(includeSensitiveValues ? { totalValue } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        { model: ProductVariant, as: 'variants' },
        { model: Barcode, as: 'barcodes' }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    try {
      assertShopRecordAccess(req, product);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    let data = stripSensitiveProductFields(product, req);
    const effectiveShopId = req.query.shopId || req.shopFilterId || product.shopId || null;
    if (effectiveShopId) {
      const [withShopQty] = await attachShopStockToProducts(
        [typeof data?.get === 'function' ? data.get({ plain: true }) : data],
        { tenantId: req.tenantId, shopId: effectiveShopId }
      );
      data = applyEffectiveProductQuantity(withShopQty || data);
    } else {
      data = applyEffectiveProductQuantity(
        typeof data?.get === 'function' ? data.get({ plain: true }) : data
      );
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sales + stock movement history for a product
// @route   GET /api/products/:id/sales
// @access  Private
exports.getProductSales = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      attributes: ['id', 'name']
    });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { page, limit, offset } = getPagination(req, { defaultPageSize: 20 });
    // Fetch a window large enough to merge sales + stock movements, then paginate in memory.
    const fetchLimit = Math.min(Math.max(limit * 3, 50), 200);

    const [saleItems, stockMovements] = await Promise.all([
      SaleItem.findAll({
        where: { productId: req.params.id },
        limit: fetchLimit,
        include: [
          {
            model: Sale,
            as: 'sale',
            required: true,
            attributes: ['id', 'saleNumber', 'createdAt', 'status', 'total', 'soldBy'],
            where: applyTenantFilter(req.tenantId),
            include: [
              { model: Customer, as: 'customer', attributes: ['id', 'name'], required: false },
              { model: User, as: 'seller', attributes: ['id', 'name'], required: false }
            ]
          }
        ],
        order: [[{ model: Sale, as: 'sale' }, 'createdAt', 'DESC']]
      }),
      ProductStockMovement.findAll({
        where: applyTenantFilter(req.tenantId, { productId: req.params.id }),
        limit: fetchLimit,
        include: [
          { model: User, as: 'createdByUser', attributes: ['id', 'name'], required: false },
          { model: ProductVariant, as: 'variant', attributes: ['id', 'name'], required: false },
        ],
        order: [['occurredAt', 'DESC']],
      }),
    ]);

    const saleLedgerRefs = new Set();
    for (const row of stockMovements) {
      const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
      if ((plain.type === 'sale' || plain.type === 'sale_void') && plain.reference) {
        saleLedgerRefs.add(String(plain.reference));
      }
    }

    const saleRows = saleItems
      .filter((item) => {
        const plain = typeof item.get === 'function' ? item.get({ plain: true }) : item;
        const saleId = plain.sale?.id;
        if (saleId && saleLedgerRefs.has(`sale:${saleId}`)) return false;
        return true;
      })
      .map((item) => {
      const plain = typeof item.get === 'function' ? item.get({ plain: true }) : item;
      const qty = parseQuantity(plain.quantity);
      return {
        // Keep legacy SaleItem fields for older clients
        ...plain,
        id: plain.id,
        kind: 'sale',
        movementType: 'sale',
        quantityChange: -Math.abs(qty),
        quantity: qty,
        quantityAfter: null,
        occurredAt: plain.sale?.createdAt || plain.createdAt,
        label: plain.sale?.saleNumber ? `Sale ${plain.sale.saleNumber}` : 'Sale',
        reason: null,
        variantName: null,
        actorName: plain.sale?.seller?.name || null,
        total: plain.total,
        sale: plain.sale,
      };
    });

    const movementRows = stockMovements.map((row) => {
      const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
      const delta = parseQuantity(plain.quantityDelta);
      const typeLabels = {
        receive: 'Receive stock',
        adjustment: 'Stock adjustment',
        transfer_in: 'Transfer in',
        transfer_out: 'Transfer out',
        return: 'Return / restock',
        sale: 'Sale',
        sale_void: 'Sale cancelled / void',
        count_adjustment: 'Stock count adjustment',
        opening: 'Opening stock',
        import: 'Import',
        damage: 'Damage / write-off',
      };
      return {
        id: plain.id,
        kind: 'stock_movement',
        movementType: plain.type,
        quantityChange: delta,
        quantity: Math.abs(delta),
        quantityAfter: parseQuantity(plain.newQuantity),
        previousQuantity: parseQuantity(plain.previousQuantity),
        occurredAt: plain.occurredAt || plain.createdAt,
        label: typeLabels[plain.type] || 'Stock movement',
        reason: plain.reason || null,
        variantName: plain.variant?.name || null,
        actorName: plain.createdByUser?.name || null,
        total: null,
        sale: null,
        reference: plain.reference || null,
        metadata: plain.metadata || {},
      };
    });

    const merged = [...saleRows, ...movementRows].sort((a, b) => {
      const aTime = new Date(a.occurredAt || 0).getTime();
      const bTime = new Date(b.occurredAt || 0).getTime();
      return bTime - aTime;
    });

    const count = merged.length;
    const data = merged.slice(offset, offset + limit);

    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit) || 1
      },
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Adjust product or variant stock and log a movement
 * @route   POST /api/products/:id/adjust-stock
 * @access  Private
 */
exports.adjustProductStock = async (req, res, next) => {
  const transaction = await Product.sequelize.transaction();
  let transactionFinished = false;
  try {
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      transaction,
    });

    if (!product) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    try {
      assertShopRecordAccess(req, product);
    } catch (accessErr) {
      await transaction.rollback();
      transactionFinished = true;
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const {
      quantity,
      mode = 'delta',
      reason = '',
      type,
      variantId = null,
      shopId: bodyShopId = null,
    } = req.body || {};

    const qtyInput = parseQuantity(quantity);
    if (quantity === undefined || quantity === null || quantity === '') {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(400).json({
        success: false,
        message: 'quantity is required',
      });
    }

    const shopId = bodyShopId || product.shopId || req.shopFilterId || req.defaultShopId || null;
    if (!shopId) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(400).json({
        success: false,
        message: 'shopId is required to adjust stock',
      });
    }
    if (!userCanAccessShopId(req, shopId)) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(403).json({ success: false, message: 'You do not have access to this shop' });
    }

    let targetVariant = null;
    if (variantId) {
      targetVariant = await ProductVariant.findOne({
        where: { id: variantId, productId: product.id },
        transaction,
      });
      if (!targetVariant) {
        await transaction.rollback();
        transactionFinished = true;
        return res.status(404).json({
          success: false,
          message: 'Variant not found for this product',
        });
      }
    } else if (product.hasVariants) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(400).json({
        success: false,
        message: 'This product has variants. Provide variantId to adjust stock.',
      });
    }

    const movementType = resolveStockMovementType({
      type,
      reason,
      quantityDelta: mode === 'set' ? null : qtyInput,
    });

    const result = await applyStockChange({
      tenantId: req.tenantId,
      productId: product.id,
      productVariantId: targetVariant?.id || null,
      shopId,
      ...(mode === 'set' ? { setTo: Math.max(0, qtyInput) } : { delta: qtyInput }),
      type: movementType,
      reason: reason || null,
      userId: req.user?.id || null,
      metadata: { mode, source: 'adjustProductStock' },
      transaction,
    });

    const movement = result.movement || null;
    const previousQuantity = result.previousQuantity;
    const newQuantity = result.newQuantity;

    await transaction.commit();
    transactionFinished = true;
    invalidateProductListCache(req.tenantId);

    const refreshed = await Product.findOne({
      where: { id: product.id },
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        { model: ProductVariant, as: 'variants' },
        { model: Barcode, as: 'barcodes' },
      ],
    });

    let responseProduct = stripSensitiveProductFields(refreshed, req);
    const [withShopQty] = await attachShopStockToProducts(
      [typeof responseProduct?.get === 'function' ? responseProduct.get({ plain: true }) : responseProduct],
      { tenantId: req.tenantId, shopId }
    );
    responseProduct = applyEffectiveProductQuantity(withShopQty || responseProduct);

    res.status(200).json({
      success: true,
      data: responseProduct,
      movement: movement
        ? (typeof movement.get === 'function' ? movement.get({ plain: true }) : movement)
        : null,
      stock: {
        shopId,
        previousQuantity,
        newQuantity,
        quantityDelta: result.quantityDelta,
      },
    });
  } catch (error) {
    if (!transactionFinished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private
exports.uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

    if (isServerless) {
      // Serverless (Vercel/Lambda): no writable filesystem; store as base64 in DB
      const mime = req.file.mimetype || 'image/jpeg';
      const base64 = req.file.buffer.toString('base64');
      const imageUrl = `data:${mime};base64,${base64}`;
      return res.status(200).json({ success: true, imageUrl });
    }

    // Node.js with disk: write to uploads/products/<tenantId>/
    const tenantId = req.tenantId;
    const subDir = path.join('products', tenantId);
    const uploadPath = path.join(baseUploadDir, subDir);
    ensureDirExists(uploadPath);
    const ext = path.extname(req.file.originalname) || '.jpg';
    const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.[^.]+$/, '') || 'image';
    const filename = `${Date.now()}-${sanitized}${ext}`;
    const filePath = path.join(uploadPath, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    const imageUrl = `/uploads/products/${tenantId}/${filename}`;
    res.status(200).json({ success: true, imageUrl });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Private
exports.getProductCategories = async (req, res, next) => {
  const tenantId = req.tenantId;
  const tenant = req.tenant;
  const { resolveBusinessType } = require('../config/businessTypes');
  const businessType = resolveBusinessType(tenant?.businessType);
  const studioType = tenant?.metadata?.studioType || null;
  const shopType = tenant?.metadata?.shopType || null;

  try {
    console.log('[getProductCategories] tenantId=%s businessType=%s studioType=%s shopType=%s (product_categories)', tenantId || 'missing', businessType, studioType || 'none', shopType || 'none');
    if (!tenantId) {
      console.warn('[getProductCategories] No tenantId on request – categories may be empty');
    }

    // Base filter: tenant + active
    const baseWhere = {
      ...applyTenantFilter(tenantId, {}),
      isActive: true
    };

    let categories;

    try {
      // Try full query with businessType/studioType/shopType (requires migration to have run)
      const whereConditions = [
        { ...baseWhere, businessType: null },
        { ...baseWhere, businessType: businessType, studioType: null, shopType: null }
      ];
      if (businessType === 'studio' && studioType) {
        whereConditions.push({
          ...baseWhere,
          businessType: 'studio',
          studioType: studioType,
          shopType: null
        });
      }
      if (businessType === 'shop' && shopType) {
        whereConditions.push({
          ...baseWhere,
          businessType: 'shop',
          shopType: shopType,
          studioType: null
        });
      }
      categories = await ProductCategory.findAll({
        where: { [Op.or]: whereConditions },
        order: [['name', 'ASC']]
      });
    } catch (columnError) {
      console.warn('[getProductCategories] businessType/studioType query failed (columns may not exist), falling back to tenant-only:', columnError?.message);
      categories = await ProductCategory.findAll({
        where: baseWhere,
        order: [['name', 'ASC']],
        attributes: ['id', 'tenantId', 'name', 'description', 'isActive', 'metadata', 'createdAt', 'updatedAt']
      });
    }

    console.log('[getProductCategories] tenantId=%s count=%d', tenantId || 'missing', categories.length);
    if (categories.length === 0) {
      console.log('[getProductCategories] No product_categories for this tenant – run seed-default-product-categories migration');
    }
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error('[getProductCategories] Error loading categories:', {
      tenantId,
      message: error?.message,
      name: error?.name,
      stack: error?.stack
    });
    next(error);
  }
};

// @desc    Create product category
// @route   POST /api/products/categories
// @access  Private
exports.createProductCategory = async (req, res, next) => {
  try {
    const { name, description, metadata, businessType, studioType, shopType } = sanitizePayload(req.body || {});
    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    
    const tenant = req.tenant;
    const { resolveBusinessType } = require('../config/businessTypes');
    
    // Check for duplicate category name within tenant
    const existingCategory = await ProductCategory.findOne({
      where: { tenantId: req.tenantId, name: name.trim() }
    });
    if (existingCategory) {
      return res.status(400).json({ 
        success: false, 
        message: `Category "${name}" already exists` 
      });
    }
    
    // If businessType/studioType/shopType not provided, use tenant's values
    const finalBusinessType = businessType || (tenant ? resolveBusinessType(tenant.businessType) : null);
    const finalStudioType = studioType || (tenant?.metadata?.studioType || null);
    const finalShopType = shopType ?? (tenant?.metadata?.shopType || null);
    
    // Validate: studioType only makes sense if businessType is 'studio'
    if (finalStudioType && finalBusinessType !== 'studio') {
      return res.status(400).json({ 
        success: false, 
        message: 'studioType can only be set when businessType is "studio"' 
      });
    }
    // Validate: shopType only makes sense if businessType is 'shop'
    if (finalShopType && finalBusinessType !== 'shop') {
      return res.status(400).json({ 
        success: false, 
        message: 'shopType can only be set when businessType is "shop"' 
      });
    }
    
    const category = await ProductCategory.create({
      name: name.trim(),
      description: description || null,
      metadata: metadata || {},
      businessType: finalBusinessType,
      studioType: finalStudioType,
      shopType: finalShopType,
      tenantId: req.tenantId
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product category
// @route   DELETE /api/products/categories/:id
// @access  Private
exports.deleteProductCategory = async (req, res, next) => {
  try {
    const category = await ProductCategory.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const productCount = await Product.count({
      where: { tenantId: req.tenantId, categoryId: category.id }
    });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${productCount} product(s) use this category. Reassign or remove the category from those products first.`
      });
    }

    await category.destroy();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private
exports.createProduct = async (req, res, next) => {
  const transaction = await Product.sequelize.transaction();
  let transactionFinished = false;
  try {
    const payload = sanitizePayload(
      attachShopToPayload(req, req.body)
    );
    stripStaffProductWritePayload(payload, req);
    try {
      normalizeWholesalePrice(payload);
    } catch (validationErr) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }
    const { hasAliasPayload, aliases } = extractProductAliasBarcodes(payload);
    const openingQty = parseQuantity(payload.quantityOnHand);
    const openingShopId = payload.shopId || req.shopFilterId || req.defaultShopId || null;
    const shouldRecordOpening = Boolean(
      openingShopId
      && openingQty > 0
      && payload.hasVariants !== true
      && payload.trackStock !== false
    );

    const product = await Product.create({
      ...payload,
      // Defer qty onto shop stock + opening ledger when we can record it cleanly
      quantityOnHand: shouldRecordOpening ? 0 : (payload.quantityOnHand ?? 0),
      tenantId: req.tenantId
    }, { transaction });

    if (hasAliasPayload) {
      await syncProductAliasBarcodes({
        product,
        tenantId: req.tenantId,
        aliases,
        transaction
      });
      await product.reload({
        include: [
          { model: Shop, as: 'shop', attributes: ['id', 'name'] },
          { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
          { model: Barcode, as: 'barcodes' }
        ],
        transaction
      });
    }

    if (shouldRecordOpening) {
      await applyStockChange({
        tenantId: req.tenantId,
        productId: product.id,
        shopId: openingShopId,
        setTo: openingQty,
        type: 'opening',
        reason: 'Opening stock on product create',
        userId: req.user?.id || null,
        metadata: { source: 'createProduct' },
        transaction,
      });
      await product.reload({ transaction });
    }

    await transaction.commit();
    transactionFinished = true;

    invalidateProductListCache(req.tenantId);
    // Product cost is reflected in COGS on sale — do not auto-create Expense rows
    // (that double-counted profit as sales − expenses − COGS).
    res.status(201).json({
      success: true,
      data: stripSensitiveProductFields(product, req)
    });
  } catch (error) {
    if (!transactionFinished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
exports.updateProduct = async (req, res, next) => {
  const transaction = await Product.sequelize.transaction();
  let transactionFinished = false;
  try {
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id }),
      transaction
    });

    if (!product) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    try {
      assertShopRecordAccess(req, product);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const payload = sanitizePayload(req.body);
    stripStaffProductWritePayload(payload, req);
    try {
      normalizeWholesalePrice(payload);
    } catch (validationErr) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }
    const { hasAliasPayload, aliases } = extractProductAliasBarcodes(payload);
    if (payload.shopId && !userCanAccessShopId(req, payload.shopId)) {
      await transaction.rollback();
      transactionFinished = true;
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this shop',
      });
    }
    const oldQuantity = parseQuantity(product.quantityOnHand);
    const hasQtyPayload = Object.prototype.hasOwnProperty.call(payload, 'quantityOnHand');
    const newQuantity = hasQtyPayload
      ? parseQuantity(payload.quantityOnHand)
      : oldQuantity;
    const reorderLevel = parseFloat(product.reorderLevel || 0);
    const stockShopId = payload.shopId || product.shopId || req.shopFilterId || req.defaultShopId || null;

    const updatePayload = { ...payload };
    if (hasQtyPayload && !product.hasVariants && stockShopId) {
      delete updatePayload.quantityOnHand;
    }

    await product.update(updatePayload, { transaction });
    if (hasAliasPayload) {
      await syncProductAliasBarcodes({
        product,
        tenantId: req.tenantId,
        aliases,
        transaction
      });
    }

    const quantityDelta = newQuantity - oldQuantity;
    if (hasQtyPayload && quantityDelta !== 0 && !product.hasVariants) {
      const metaReason = payload.metadata?.lastStockAdjustment?.reason
        || payload.metadata?.stockAdjustmentReason
        || null;
      if (stockShopId) {
        await applyStockChange({
          tenantId: req.tenantId,
          productId: product.id,
          shopId: stockShopId,
          setTo: newQuantity,
          type: resolveStockMovementType({
            reason: metaReason,
            quantityDelta,
          }),
          reason: metaReason,
          userId: req.user?.id || null,
          metadata: {
            source: 'updateProduct',
            ...(payload.metadata?.lastStockAdjustment || {}),
          },
          transaction,
        });
      } else {
        await product.update({ quantityOnHand: newQuantity }, { transaction });
        await recordProductStockMovement({
          tenantId: req.tenantId,
          productId: product.id,
          shopId: null,
          type: resolveStockMovementType({
            reason: metaReason,
            quantityDelta,
          }),
          quantityDelta,
          previousQuantity: oldQuantity,
          newQuantity,
          reason: metaReason,
          createdBy: req.user?.id || null,
          metadata: {
            source: 'updateProduct',
            ...(payload.metadata?.lastStockAdjustment || {}),
          },
          transaction,
        });
      }
    }

    invalidateProductListCache(req.tenantId);

    await product.reload({
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'] },
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        { model: Barcode, as: 'barcodes' }
      ],
      transaction
    });

    await transaction.commit();
    transactionFinished = true;

    // Defer low stock alert so response is sent immediately
    if (reorderLevel > 0 && newQuantity <= reorderLevel && newQuantity < oldQuantity) {
      const productForAlert = product;
      const tenantIdForAlert = req.tenantId;
      setImmediate(() => {
        (async () => {
          try {
            const whatsappService = require('../services/whatsappService');
            const whatsappTemplates = require('../services/whatsappTemplates');
            const { Tenant, UserTenant } = require('../models');

            const tenant = await Tenant.findByPk(tenantIdForAlert);
            const config = await whatsappService.getConfig(tenantIdForAlert);

            if (config && tenant) {
              const {
                shouldUseAutomationInsteadOfBuiltIn,
                TEMPLATE_KEYS,
              } = require('../services/customerNotificationBridgeService');
              const skipBuiltInWa = await shouldUseAutomationInsteadOfBuiltIn(
                tenantIdForAlert,
                TEMPLATE_KEYS.LOW_STOCK_ON_CHANGE
              ) || await shouldUseAutomationInsteadOfBuiltIn(
                tenantIdForAlert,
                TEMPLATE_KEYS.OUT_OF_STOCK_ALERT
              ) || await shouldUseAutomationInsteadOfBuiltIn(
                tenantIdForAlert,
                TEMPLATE_KEYS.LOW_STOCK_ALERT
              );

              if (!skipBuiltInWa) {
                const adminUsers = await UserTenant.findAll({
                  where: {
                    tenantId: tenantIdForAlert,
                    role: { [Op.in]: ['admin', 'manager', 'owner'] }
                  },
                  include: [{ model: require('../models').User, as: 'user', attributes: ['id', 'name', 'email'] }]
                });

                for (const adminUser of adminUsers) {
                  if (adminUser.user && adminUser.user.phone) {
                    const phoneNumber = whatsappService.validatePhoneNumber(adminUser.user.phone);
                    if (phoneNumber) {
                      const parameters = whatsappTemplates.prepareLowStockAlert(productForAlert);
                      await whatsappService.sendMessage(
                        tenantIdForAlert,
                        phoneNumber,
                        'low_stock_alert',
                        parameters
                      ).catch(error => {
                        console.error('[Product] WhatsApp low stock alert failed:', error);
                      });
                    }
                  }
                }
              }
            }
            try {
              const taskAutomationService = require('../services/taskAutomationService');
              await taskAutomationService.createLowStockTask({
                item: {
                  id: productForAlert.id,
                  name: productForAlert.name,
                  quantityOnHand: Number(newQuantity) || 0,
                  reorderLevel: Number(reorderLevel) || 0
                },
                tenantId: tenantIdForAlert,
                triggeredBy: req.user?.id || null
              });
            } catch (taskErr) {
              console.error('[Product] Low stock task automation failed:', taskErr?.message);
            }
            try {
              const { runStockChangeAutomations } = require('../services/automationEngineService');
              await runStockChangeAutomations({
                tenantId: tenantIdForAlert,
                product: { ...productForAlert.toJSON?.() || productForAlert, quantityOnHand: Number(newQuantity) || 0, reorderLevel: Number(reorderLevel) || 0 },
                stockEvent: 'auto',
                actorUserId: req.user?.id || null,
              });
            } catch (automationErr) {
              console.error('[Product] Stock change automations failed:', automationErr?.message);
            }
          } catch (error) {
            console.error('[Product] WhatsApp low stock alert error:', error);
          }
        })();
      });
    }

    res.status(200).json({
      success: true,
      data: stripSensitiveProductFields(product, req)
    });
  } catch (error) {
    if (!transactionFinished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    try {
      assertShopRecordAccess(req, product);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    await product.destroy();
    invalidateProductListCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product by barcode
// @route   GET /api/products/barcode/:barcode
// @access  Private
exports.getProductByBarcode = async (req, res, next) => {
  try {
    const { barcode } = req.params;
    const barcodeCandidates = normalizeBarcodeCandidates(
      barcode,
      req.query.candidate,
      req.query.candidates
    );

    if (barcodeCandidates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Barcode is required'
      });
    }

    const productCodeMatchConditions = barcodeCandidates.map((code) => (
      Product.sequelize.literal(
        `TRIM("Product"."metadata"->>'productCode') = ${Product.sequelize.escape(String(code))}`,
      )
    ));

    let productWhere = applyTenantFilter(req.tenantId, {
      [Op.or]: [
        { barcode: { [Op.in]: barcodeCandidates } },
        { sku: { [Op.in]: barcodeCandidates } },
        ...productCodeMatchConditions,
      ],
    });

    if (req.shopScoped) {
      productWhere = applyShopReadFilter(req, productWhere);
    }
    
    const product = await Product.findOne({
      where: productWhere,
      include: [{
        model: ProductVariant,
        as: 'variants',
        required: false,
        where: { isActive: true },
        attributes: ['id', 'productId', 'name', 'sku', 'barcode', 'sellingPrice', 'wholesalePrice', 'quantityOnHand', 'attributes', 'isActive', 'trackStock']
      }]
    });

    if (!product) {
      const variant = await ProductVariant.findOne({
        where: {
          isActive: true,
          [Op.or]: [
            { barcode: { [Op.in]: barcodeCandidates } },
            { sku: { [Op.in]: barcodeCandidates } }
          ]
        },
        include: [{
          model: Product,
          as: 'product',
          where: req.shopScoped
            ? applyShopReadFilter(req, applyTenantFilter(req.tenantId, {}))
            : applyTenantFilter(req.tenantId, {}),
          required: true,
          include: [{
            model: ProductVariant,
            as: 'variants',
            required: false,
            where: { isActive: true },
            attributes: ['id', 'productId', 'name', 'sku', 'barcode', 'sellingPrice', 'wholesalePrice', 'quantityOnHand', 'attributes', 'isActive', 'trackStock']
          }]
        }]
      });

      if (variant?.product) {
        const data = variant.product.get({ plain: true });
        data.selectedVariant = variant.get({ plain: true });
        return res.status(200).json({
          success: true,
          data: stripSensitiveProductFields(data, req)
        });
      }

      // Try finding by barcode in Barcode table
      const barcodeRecord = await Barcode.findOne({
        where: { barcode: { [Op.in]: barcodeCandidates }, tenantId: req.tenantId, isActive: true },
        include: [
          {
            model: Product,
            as: 'product',
            ...(req.shopScoped ? { where: applyShopReadFilter(req, {}) } : {}),
            include: [{
              model: ProductVariant,
              as: 'variants',
              required: false,
              where: { isActive: true },
              attributes: ['id', 'productId', 'name', 'sku', 'barcode', 'sellingPrice', 'wholesalePrice', 'quantityOnHand', 'attributes', 'isActive', 'trackStock']
            }]
          },
          {
            model: ProductVariant,
            as: 'productVariant',
            include: [{
              model: Product,
              as: 'product',
              where: req.shopScoped
                ? applyShopReadFilter(req, applyTenantFilter(req.tenantId, {}))
                : applyTenantFilter(req.tenantId, {}),
              required: false,
              include: [{
                model: ProductVariant,
                as: 'variants',
                required: false,
                where: { isActive: true },
                attributes: ['id', 'productId', 'name', 'sku', 'barcode', 'sellingPrice', 'wholesalePrice', 'quantityOnHand', 'attributes', 'isActive', 'trackStock']
              }]
            }]
          }
        ]
      });

      if (barcodeRecord && barcodeRecord.product) {
        const data = barcodeRecord.product.get({ plain: true });
        if (barcodeRecord.productVariant) {
          data.selectedVariant = barcodeRecord.productVariant.get({ plain: true });
        }
        return res.status(200).json({
          success: true,
          data: stripSensitiveProductFields(data, req)
        });
      }

      if (barcodeRecord?.productVariant?.product) {
        const data = barcodeRecord.productVariant.product.get({ plain: true });
        data.selectedVariant = barcodeRecord.productVariant.get({ plain: true });
        return res.status(200).json({
          success: true,
          data: stripSensitiveProductFields(data, req)
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: stripSensitiveProductFields(product, req)
    });
  } catch (error) {
    next(error);
  }
};

// =============================================
// PRODUCT VARIANT OPERATIONS
// =============================================

// @desc    Get variants for a product
// @route   GET /api/products/:id/variants
// @access  Private
exports.getProductVariants = async (req, res, next) => {
  try {
    // First verify the product exists and belongs to tenant
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const variants = await ProductVariant.findAll({
      where: { productId: req.params.id },
      order: [['createdAt', 'ASC']]
    });

    res.status(200).json({
      success: true,
      count: variants.length,
      data: stripSensitiveProductListFields(variants, req)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create product variant
// @route   POST /api/products/:id/variants
// @access  Private
exports.createProductVariant = async (req, res, next) => {
  try {
    // First verify the product exists and belongs to tenant
    const product = await Product.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.id })
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const payload = sanitizePayload(req.body);
    stripStaffProductWritePayload(payload, req);
    try {
      normalizeWholesalePrice(payload);
    } catch (validationErr) {
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }

    // Create the variant
    const variant = await ProductVariant.create({
      ...payload,
      productId: product.id
    });

    // Update product to indicate it has variants
    if (!product.hasVariants) {
      await product.update({ hasVariants: true });
    }
    await syncParentQuantityFromVariants(product.id);

    res.status(201).json({
      success: true,
      data: stripSensitiveProductFields(variant, req)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product variant
// @route   PUT /api/products/variants/:variantId
// @access  Private
exports.updateProductVariant = async (req, res, next) => {
  try {
    const variant = await ProductVariant.findByPk(req.params.variantId, {
      include: [{ model: Product, as: 'product' }]
    });

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Variant not found'
      });
    }

    // Verify the variant's product belongs to the tenant
    if (variant.product.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this variant'
      });
    }

    try {
      assertShopRecordAccess(req, variant.product);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const payload = sanitizePayload(req.body);
    stripStaffProductWritePayload(payload, req);
    try {
      normalizeWholesalePrice(payload);
    } catch (validationErr) {
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }
    const previousQuantity = parseQuantity(variant.quantityOnHand);
    const hasQtyPayload = Object.prototype.hasOwnProperty.call(payload, 'quantityOnHand');
    const newQuantity = hasQtyPayload
      ? parseQuantity(payload.quantityOnHand)
      : previousQuantity;

    await variant.update(payload);
    await syncParentQuantityFromVariants(variant.productId);
    invalidateProductListCache(req.tenantId);

    const quantityDelta = newQuantity - previousQuantity;
    if (hasQtyPayload && quantityDelta !== 0) {
      await recordProductStockMovement({
        tenantId: req.tenantId,
        productId: variant.productId,
        productVariantId: variant.id,
        shopId: variant.product?.shopId || null,
        type: resolveStockMovementType({
          reason: payload.reason || payload.metadata?.reason,
          quantityDelta,
        }),
        quantityDelta,
        previousQuantity,
        newQuantity,
        reason: payload.reason || payload.metadata?.reason || null,
        createdBy: req.user?.id || null,
        metadata: { source: 'updateProductVariant' },
      });
    }

    res.status(200).json({
      success: true,
      data: stripSensitiveProductFields(variant, req)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product variant
// @route   DELETE /api/products/variants/:variantId
// @access  Private
exports.deleteProductVariant = async (req, res, next) => {
  try {
    const variant = await ProductVariant.findByPk(req.params.variantId, {
      include: [{ model: Product, as: 'product' }]
    });

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Variant not found'
      });
    }

    // Verify the variant's product belongs to the tenant
    if (variant.product.tenantId !== req.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this variant'
      });
    }

    try {
      assertShopRecordAccess(req, variant.product);
    } catch (accessErr) {
      if (accessErr.statusCode === 403) {
        return res.status(403).json({ success: false, message: accessErr.message });
      }
      throw accessErr;
    }

    const productId = variant.productId;
    await variant.destroy();

    // Check if product still has variants
    const remainingVariants = await ProductVariant.count({
      where: { productId }
    });

    if (remainingVariants === 0) {
      await Product.update(
        { hasVariants: false },
        { where: { id: productId } }
      );
    } else {
      await syncParentQuantityFromVariants(productId);
    }

    invalidateProductListCache(req.tenantId);

    res.status(200).json({
      success: true,
      message: 'Variant deleted successfully'
    });
  } catch (error) {
    if (error?.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'This variant cannot be deleted because it is still linked to other records.',
      });
    }
    next(error);
  }
};

// @desc    Bulk create products
// @route   POST /api/products/bulk
// @access  Private (admin, manager)
exports.bulkCreateProducts = async (req, res, next) => {
  try {
    const { products } = req.body;
    const { bulkCreate } = require('../utils/bulkOperations');

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of products'
      });
    }

    const result = await bulkCreate(Product, products, {
      tenantId: req.tenantId,
      userId: req.user?.id,
      continueOnError: true,
      maxBatchSize: 100,
    });

    invalidateProductListCache(req.tenantId);
    res.status(result.success ? 201 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update products
// @route   PUT /api/products/bulk
// @access  Private (admin, manager)
exports.bulkUpdateProducts = async (req, res, next) => {
  try {
    const { products } = req.body;
    const { bulkUpdate } = require('../utils/bulkOperations');

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of product updates'
      });
    }

    const result = await bulkUpdate(Product, products, {
      tenantId: req.tenantId,
      userId: req.user?.id,
      continueOnError: true,
      maxBatchSize: 100,
    });

    invalidateProductListCache(req.tenantId);
    res.status(result.success ? 200 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk delete products
// @route   DELETE /api/products/bulk
// @access  Private (admin only)
exports.bulkDeleteProducts = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const { bulkDelete } = require('../utils/bulkOperations');

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of product IDs'
      });
    }

    const result = await bulkDelete(Product, ids, {
      tenantId: req.tenantId,
      continueOnError: true,
      maxBatchSize: 100,
    });

    invalidateProductListCache(req.tenantId);
    res.status(result.success ? 200 : 207).json({
      success: result.success,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export products to CSV/Excel
// @route   GET /api/products/export
// @access  Private (admin, manager)
exports.exportProducts = async (req, res, next) => {
  try {
    const { format = 'csv', categoryId, isActive } = req.query;
    const { sendCSV, sendExcel, COLUMN_DEFINITIONS } = require('../utils/dataExport');

    const where = applyTenantFilter(req.tenantId, {});
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const products = await Product.findAll({
      where,
      include: [
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] }
      ],
      order: [['name', 'ASC']],
      raw: true,
      nest: true
    });

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products to export'
      });
    }

    const filename = `products_${new Date().toISOString().split('T')[0]}`;
    const columns = COLUMN_DEFINITIONS.products;

    if (format === 'excel') {
      await sendExcel(res, products, `${filename}.xlsx`, {
        columns,
        sheetName: 'Products',
        title: 'Product Inventory'
      });
    } else {
      sendCSV(res, products, `${filename}.csv`, columns);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get CSV template for product bulk import
// @route   GET /api/products/import/template
// @access  Private (admin, manager)
exports.getProductImportTemplate = (req, res) => {
  const { getTemplateCSV } = require('../utils/importParse');
  const csv = getTemplateCSV('products');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products_import_template.csv"');
  res.send(csv);
};

// @desc    Bulk import products from CSV/Excel (no images)
// @route   POST /api/products/import
// @access  Private (admin, manager)
exports.importProducts = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const { parseImportFile } = require('../utils/importParse');
    const { bulkCreate } = require('../utils/bulkOperations');
    const mime = req.file.mimetype || '';
    const ext = (req.file.originalname || '').toLowerCase().slice(-5);
    const { mapped, errors: parseErrors } = await parseImportFile(
      req.file.buffer,
      mime || ext,
      'products'
    );

    if (parseErrors.length > 0 && mapped.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file or rows',
        errors: parseErrors,
      });
    }

    const categoryNames = [...new Set(mapped.map((m) => m.categoryName).filter(Boolean))];
    const categories =
      categoryNames.length > 0
        ? await ProductCategory.findAll({
            where: applyTenantFilter(req.tenantId, { name: { [Op.in]: categoryNames } }),
            attributes: ['id', 'name'],
            raw: true,
          })
        : [];
    const categoryByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

    const products = mapped.map((m) => {
      const rec = {
        name: m.name,
        sku: m.sku || null,
        barcode: m.barcode || null,
        description: m.description || null,
        categoryId: m.categoryName ? categoryByName[m.categoryName] || null : null,
        costPrice: Number(m.costPrice) || 0,
        sellingPrice: Number(m.sellingPrice) || 0,
        quantityOnHand: Number(m.quantityOnHand) ?? 0,
        reorderLevel: Number(m.reorderLevel) ?? 0,
        reorderQuantity: Number(m.reorderLevel) ?? 0,
        unit: (m.unit && String(m.unit).trim()) || 'pcs',
        isActive: m.isActive !== false,
      };
      return sanitizePayload(attachShopToPayload(req, rec));
    });

    const result = await bulkCreate(Product, products, {
      tenantId: req.tenantId,
      userId: req.user?.id,
      continueOnError: true,
      maxBatchSize: 100,
    });

    invalidateProductListCache(req.tenantId);
    const allErrors = [
      ...parseErrors.map((e) => ({ row: e.row, message: e.message })),
      ...result.errors.map((e) => ({ row: e.index + 2, message: e.error })),
    ];
    res.status(result.success ? 201 : 207).json({
      success: result.success,
      successCount: result.successCount,
      errorCount: allErrors.length,
      totalProcessed: mapped.length,
      created: result.created,
      errors: allErrors.length ? allErrors : result.errors,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update product stock
// @route   PUT /api/products/bulk/stock
// @access  Private (admin, manager, staff)
exports.bulkUpdateStock = async (req, res, next) => {
  const transaction = await require('../config/database').sequelize.transaction();
  
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of stock updates'
      });
    }

    if (items.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum batch size is 100 items'
      });
    }

    const updated = [];
    const errors = [];

    for (const item of items) {
      try {
        const { productId, adjustment: adjustmentRaw, type = 'adjustment' } = item;
        
        const product = await Product.findOne({
          where: applyTenantFilter(req.tenantId, { id: productId }),
          transaction
        });

        if (!product) {
          errors.push({ productId, error: 'Product not found' });
          continue;
        }

        const oldQuantity = parseFloat(product.quantityOnHand) || 0;
        const adjustment = parseFloat(adjustmentRaw);
        const shopId = item.shopId || product.shopId || req.shopFilterId || req.defaultShopId || null;
        if (!shopId) {
          errors.push({ productId, error: 'shopId is required for stock update' });
          continue;
        }

        const result = await applyStockChange({
          tenantId: req.tenantId,
          productId: product.id,
          shopId,
          delta: adjustment,
          type: type === 'receive' ? 'receive' : 'adjustment',
          reason: item.reason || null,
          userId: req.user?.id || null,
          metadata: { source: 'bulkUpdateStock', type },
          transaction,
        });

        updated.push({
          productId,
          oldQuantity: result.previousQuantity ?? oldQuantity,
          newQuantity: result.newQuantity,
          adjustment,
          shopId,
        });
      } catch (error) {
        errors.push({ productId: item.productId, error: error.message });
      }
    }

    await transaction.commit();

    res.status(errors.length === 0 ? 200 : 207).json({
      success: errors.length === 0,
      totalProcessed: items.length,
      successCount: updated.length,
      errorCount: errors.length,
      updated,
      errors
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
