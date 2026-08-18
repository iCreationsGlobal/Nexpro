const { Op } = require('sequelize');
const {
  Product,
  ProductVariant,
  ProductStockMovement,
  ProductShopStock,
} = require('../models');
const { sequelize } = require('../config/database');

const parseQuantity = (value) => {
  const qty = Number.parseFloat(value);
  return Number.isFinite(qty) ? qty : 0;
};

const MOVEMENT_TYPES = new Set([
  'receive',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'return',
  'sale',
  'sale_void',
  'count_adjustment',
  'opening',
  'import',
  'damage',
]);

/**
 * Infer movement type from explicit type, reason text, or quantity delta.
 * @param {{ type?: string, reason?: string, quantityDelta?: number }} opts
 * @returns {string}
 */
const resolveStockMovementType = ({ type, reason, quantityDelta } = {}) => {
  if (type && MOVEMENT_TYPES.has(String(type))) {
    return String(type);
  }
  const reasonText = String(reason || '').toLowerCase();
  if (reasonText.includes('receive') || reasonText.includes('restock')) {
    return 'receive';
  }
  if (reasonText.includes('transfer in') || reasonText.includes('transfer_in')) {
    return 'transfer_in';
  }
  if (reasonText.includes('transfer out') || reasonText.includes('transfer_out')) {
    return 'transfer_out';
  }
  if (reasonText.includes('return')) {
    return 'return';
  }
  if (reasonText.includes('damage') || reasonText.includes('spoil')) {
    return 'damage';
  }
  if (reasonText.includes('opening')) {
    return 'opening';
  }
  if (reasonText.includes('import')) {
    return 'import';
  }
  if (reasonText.includes('count')) {
    return 'count_adjustment';
  }
  if (reasonText.includes('void') || reasonText.includes('cancel')) {
    return 'sale_void';
  }
  if (reasonText.includes('sale')) {
    return 'sale';
  }
  if (parseQuantity(quantityDelta) > 0 && reasonText.includes('stock')) {
    return 'receive';
  }
  return 'adjustment';
};

/**
 * Persist a product (or variant) stock movement row.
 * Prefer applyStockChange for balance + ledger writes.
 * @param {object} params
 * @returns {Promise<object|null>}
 */
const recordProductStockMovement = async ({
  tenantId,
  productId,
  productVariantId = null,
  shopId = null,
  type,
  quantityDelta,
  previousQuantity,
  newQuantity,
  reason = null,
  reference = null,
  createdBy = null,
  metadata = {},
  transaction,
} = {}) => {
  if (!tenantId || !productId) return null;

  const delta = parseQuantity(quantityDelta);
  if (delta === 0) return null;

  const movementType = resolveStockMovementType({ type, reason, quantityDelta: delta });

  return ProductStockMovement.create({
    tenantId,
    productId,
    productVariantId: productVariantId || null,
    shopId: shopId || null,
    type: movementType,
    quantityDelta: delta,
    previousQuantity: parseQuantity(previousQuantity),
    newQuantity: parseQuantity(newQuantity),
    reason: reason || null,
    reference: reference || null,
    createdBy: createdBy || null,
    occurredAt: new Date(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  }, { transaction });
};

const sumActiveVariantQuantity = (variants = []) => {
  if (!Array.isArray(variants)) return 0;
  return variants.reduce((total, variant) => {
    if (variant?.isActive === false) return total;
    return total + Math.max(parseQuantity(variant?.quantityOnHand), 0);
  }, 0);
};

const getEffectiveProductQuantityOnHand = (product) => {
  if (!product) return 0;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variantSum = sumActiveVariantQuantity(variants);
  const hasTotalVariantStock = product.totalVariantStock != null && product.totalVariantStock !== '';
  const totalVariantStock = hasTotalVariantStock
    ? Math.max(parseQuantity(product.totalVariantStock), 0)
    : null;
  const parentQty = parseQuantity(product.quantityOnHand);
  const isVariantProduct = Boolean(product.hasVariants) || variants.length > 0;

  if (!isVariantProduct) return parentQty;
  if (variantSum > 0) return variantSum;
  if (totalVariantStock != null) return totalVariantStock;
  return parentQty;
};

const applyEffectiveProductQuantity = (product) => {
  if (!product || typeof product !== 'object') return product;

  const plain = typeof product.get === 'function'
    ? product.get({ plain: true })
    : { ...product };

  const isVariantProduct = Boolean(plain.hasVariants)
    || (Array.isArray(plain.variants) && plain.variants.length > 0);

  if (isVariantProduct) {
    plain.quantityOnHand = getEffectiveProductQuantityOnHand(plain);
  }
  return plain;
};

const syncParentQuantityFromVariants = async (productId, transaction) => {
  const product = await Product.findByPk(productId, { transaction });
  if (!product?.hasVariants) return product;

  const total = await ProductVariant.sum('quantityOnHand', {
    where: { productId, isActive: true },
    transaction,
  });

  const quantityOnHand = Math.max(parseQuantity(total), 0);
  await product.update({ quantityOnHand }, { transaction });
  return product;
};

/**
 * Whether denormalized product/variant.quantityOnHand should mirror this shop balance.
 * @param {{ shopId?: string|null }} product
 * @param {string} shopId
 * @returns {boolean}
 */
const shouldSyncDenormalizedQuantity = (product, shopId) => {
  if (!shopId) return false;
  if (!product?.shopId) return true;
  return String(product.shopId) === String(shopId);
};

/**
 * Resolve displayed/used qty when overlaying a per-shop stock row onto catalog qty.
 * Shop qty wins when it is > 0. A 0 row at the home shop (or null home) is treated
 * as a stale placeholder and falls back to catalog qty. Non-home shops keep 0.
 * @param {number|string|null|undefined} shopQty
 * @param {number|string|null|undefined} catalogQty
 * @param {boolean} isHomeShop
 * @returns {number}
 */
const resolveShopOverlayQuantity = (shopQty, catalogQty, isHomeShop) => {
  if (shopQty == null) return parseQuantity(catalogQty);
  const shop = parseQuantity(shopQty);
  const catalog = parseQuantity(catalogQty);
  if (shop > 0) return shop;
  if (isHomeShop && catalog > 0) return catalog;
  return shop;
};

/**
 * Lock or create the per-shop stock balance row.
 * @param {object} params
 * @returns {Promise<{ row: object, previousQuantity: number, created: boolean }>}
 */
const lockOrCreateShopStock = async ({
  tenantId,
  productId,
  productVariantId = null,
  shopId,
  fallbackQuantity = 0,
  transaction,
}) => {
  if (!tenantId || !productId || !shopId) {
    const err = new Error('tenantId, productId, and shopId are required for shop stock');
    err.statusCode = 400;
    throw err;
  }

  const variantKey = productVariantId || null;
  const where = {
    tenantId,
    productId,
    shopId,
    productVariantId: variantKey,
  };

  let row = await ProductShopStock.findOne({
    where,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (row) {
    return {
      row,
      previousQuantity: parseQuantity(row.quantityOnHand),
      created: false,
    };
  }

  try {
    row = await ProductShopStock.create({
      tenantId,
      productId,
      productVariantId: variantKey,
      shopId,
      quantityOnHand: parseQuantity(fallbackQuantity),
    }, { transaction });
  } catch (createErr) {
    // Concurrent insert — re-lock existing row
    row = await ProductShopStock.findOne({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw createErr;
    return {
      row,
      previousQuantity: parseQuantity(row.quantityOnHand),
      created: false,
    };
  }

  // Reload with lock for subsequent update
  row = await ProductShopStock.findByPk(row.id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  return {
    row,
    previousQuantity: parseQuantity(row.quantityOnHand),
    created: true,
  };
};

/**
 * Read shop-scoped quantity with fallback to denormalized product/variant qty.
 * @param {object} params
 * @returns {Promise<number>}
 */
const getShopStockQuantity = async ({
  tenantId,
  productId,
  productVariantId = null,
  shopId = null,
  product = null,
  variant = null,
  transaction = null,
} = {}) => {
  if (shopId && tenantId && productId) {
    const row = await ProductShopStock.findOne({
      where: {
        tenantId,
        productId,
        shopId,
        productVariantId: productVariantId || null,
      },
      transaction,
    });
    if (row) {
      const shopQty = parseQuantity(row.quantityOnHand);
      if (shopQty > 0) return shopQty;

      let p = product;
      if (!p) {
        p = await Product.findByPk(productId, { transaction });
      }

      let catalogQty;
      if (productVariantId || variant) {
        const v = variant || await ProductVariant.findByPk(productVariantId, { transaction });
        catalogQty = parseQuantity(v?.quantityOnHand);
      } else {
        catalogQty = parseQuantity(p?.quantityOnHand);
      }

      const isHomeShop = p ? shouldSyncDenormalizedQuantity(p, shopId) : true;
      return resolveShopOverlayQuantity(shopQty, catalogQty, isHomeShop);
    }
  }

  if (productVariantId || variant) {
    const v = variant || await ProductVariant.findByPk(productVariantId, { transaction });
    return parseQuantity(v?.quantityOnHand);
  }

  const p = product || await Product.findByPk(productId, { transaction });
  return parseQuantity(p?.quantityOnHand);
};

/**
 * Atomic stock change: shop balance + denormalized cache + ledger movement.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.productId
 * @param {string|null} [params.productVariantId]
 * @param {string} params.shopId
 * @param {number} [params.delta] - Relative change (mutually exclusive with setTo)
 * @param {number} [params.setTo] - Absolute quantity
 * @param {string} [params.type]
 * @param {string} [params.reason]
 * @param {string} [params.reference]
 * @param {string} [params.userId]
 * @param {object} [params.metadata]
 * @param {import('sequelize').Transaction} params.transaction
 * @param {boolean} [params.allowNegative=false]
 * @param {boolean} [params.skipIfNotTracked=true] - No-op when trackStock is false
 * @returns {Promise<{ skipped: boolean, previousQuantity?: number, newQuantity?: number, quantityDelta?: number, movement?: object|null, shopStock?: object }>}
 */
const applyStockChange = async ({
  tenantId,
  productId,
  productVariantId = null,
  shopId,
  delta,
  setTo,
  type,
  reason = null,
  reference = null,
  userId = null,
  metadata = {},
  transaction,
  allowNegative = false,
  skipIfNotTracked = true,
} = {}) => {
  if (!transaction) {
    const err = new Error('applyStockChange requires a Sequelize transaction');
    err.statusCode = 500;
    throw err;
  }
  if (!tenantId || !productId) {
    const err = new Error('tenantId and productId are required');
    err.statusCode = 400;
    throw err;
  }
  if (!shopId) {
    const err = new Error('shopId is required for stock changes');
    err.statusCode = 400;
    throw err;
  }
  if (delta === undefined && setTo === undefined) {
    const err = new Error('Either delta or setTo is required');
    err.statusCode = 400;
    throw err;
  }

  const product = await Product.findOne({
    where: { id: productId, tenantId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!product) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }

  let variant = null;
  if (productVariantId) {
    variant = await ProductVariant.findOne({
      where: { id: productVariantId, productId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!variant) {
      const err = new Error('Product variant not found');
      err.statusCode = 404;
      throw err;
    }
  }

  const tracksStock = product.trackStock !== false
    && (!variant || variant.trackStock !== false);

  if (!tracksStock && skipIfNotTracked) {
    return { skipped: true, reason: 'trackStock disabled' };
  }

  const denormalizedFallback = variant
    ? parseQuantity(variant.quantityOnHand)
    : parseQuantity(product.quantityOnHand);

  const { row, previousQuantity: lockedPrevious, created } = await lockOrCreateShopStock({
    tenantId,
    productId,
    productVariantId: productVariantId || null,
    shopId,
    fallbackQuantity: denormalizedFallback,
    transaction,
  });

  let previousQuantity = lockedPrevious;
  const canHealStaleZero = !created
    && setTo === undefined
    && previousQuantity === 0
    && denormalizedFallback > 0
    && shouldSyncDenormalizedQuantity(product, shopId);
  if (canHealStaleZero) {
    previousQuantity = denormalizedFallback;
  }

  let newQuantity;
  if (setTo !== undefined) {
    newQuantity = parseQuantity(setTo);
  } else {
    newQuantity = previousQuantity + parseQuantity(delta);
  }

  if (!allowNegative) {
    newQuantity = Math.max(0, newQuantity);
  }

  const quantityDelta = newQuantity - previousQuantity;
  if (quantityDelta === 0) {
    return {
      skipped: false,
      previousQuantity,
      newQuantity,
      quantityDelta: 0,
      movement: null,
      shopStock: row,
      product,
      variant,
    };
  }

  await row.update({ quantityOnHand: newQuantity }, { transaction });

  if (shouldSyncDenormalizedQuantity(product, shopId)) {
    if (variant) {
      await variant.update({ quantityOnHand: newQuantity }, { transaction });
      await syncParentQuantityFromVariants(productId, transaction);
    } else if (!product.hasVariants) {
      await product.update({ quantityOnHand: newQuantity }, { transaction });
    }
  }

  const movementType = resolveStockMovementType({
    type,
    reason,
    quantityDelta,
  });

  const movement = await recordProductStockMovement({
    tenantId,
    productId,
    productVariantId: productVariantId || null,
    shopId,
    type: movementType,
    quantityDelta,
    previousQuantity,
    newQuantity,
    reason,
    reference,
    createdBy: userId || null,
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      source: metadata?.source || 'applyStockChange',
    },
    transaction,
  });

  return {
    skipped: false,
    previousQuantity,
    newQuantity,
    quantityDelta,
    movement,
    shopStock: row,
    product,
    variant,
  };
};

/**
 * Apply many stock deltas in one transaction (e.g. sale lines).
 * @param {object} params
 * @param {Array<{ productId: string, productVariantId?: string|null, delta: number }>} params.items
 * @returns {Promise<object[]>}
 */
const applyStockChanges = async ({
  tenantId,
  shopId,
  items = [],
  type,
  reason = null,
  reference = null,
  userId = null,
  metadata = {},
  transaction,
  allowNegative = false,
} = {}) => {
  const results = [];
  for (const item of items) {
    const qty = parseQuantity(item.delta ?? item.quantity);
    if (!item.productId || qty === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const result = await applyStockChange({
      tenantId,
      productId: item.productId,
      productVariantId: item.productVariantId || null,
      shopId,
      delta: qty,
      type,
      reason: item.reason || reason,
      reference: item.reference || reference,
      userId,
      metadata: { ...metadata, ...(item.metadata || {}) },
      transaction,
      allowNegative,
    });
    results.push(result);
  }
  return results;
};

/**
 * Overlay shop-scoped quantities onto product plain objects.
 * @param {object[]} products
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
const attachShopStockToProducts = async (products, {
  tenantId,
  shopId,
  transaction = null,
} = {}) => {
  if (!Array.isArray(products) || products.length === 0 || !tenantId || !shopId) {
    return products;
  }

  const productIds = products.map((p) => p.id).filter(Boolean);
  if (productIds.length === 0) return products;

  const rows = await ProductShopStock.findAll({
    where: {
      tenantId,
      shopId,
      productId: { [Op.in]: productIds },
    },
    transaction,
  });

  const productQty = new Map();
  const variantQty = new Map();
  for (const row of rows) {
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    if (plain.productVariantId) {
      variantQty.set(plain.productVariantId, parseQuantity(plain.quantityOnHand));
    } else {
      productQty.set(plain.productId, parseQuantity(plain.quantityOnHand));
    }
  }

  return products.map((product) => {
    const plain = typeof product.get === 'function'
      ? product.get({ plain: true })
      : { ...product };

    const isHomeShop = shouldSyncDenormalizedQuantity(plain, shopId);

    if (productQty.has(plain.id) && !plain.hasVariants) {
      plain.quantityOnHand = resolveShopOverlayQuantity(
        productQty.get(plain.id),
        plain.quantityOnHand,
        isHomeShop
      );
    }

    // POS and getProduct always include variants. Simple products come back as
    // `variants: []`. Summing that empty list was wiping parent qty to 0, so
    // Products (no variants) showed 87 while POS/details showed Out of Stock.
    const loadedVariants = Array.isArray(plain.variants) ? plain.variants : null;
    if (loadedVariants && loadedVariants.length > 0) {
      plain.variants = loadedVariants.map((variant) => {
        const v = { ...variant };
        if (variantQty.has(v.id)) {
          v.quantityOnHand = resolveShopOverlayQuantity(
            variantQty.get(v.id),
            v.quantityOnHand,
            isHomeShop
          );
        }
        return v;
      });
      plain.quantityOnHand = sumActiveVariantQuantity(plain.variants);
    }

    plain.shopStockShopId = shopId;
    return plain;
  });
};

/**
 * Sequelize literal: product is visible at shop via home shopId, null shopId, or shop stock row.
 * @param {string} shopId
 * @returns {object}
 */
const shopCatalogVisibilityLiteral = (shopId) => {
  const escaped = String(shopId).replace(/'/g, "''");
  return sequelize.literal(`(
    "Product"."shopId" = '${escaped}'
    OR "Product"."shopId" IS NULL
    OR EXISTS (
      SELECT 1 FROM product_shop_stocks pss
      WHERE pss."productId" = "Product"."id"
        AND pss."tenantId" = "Product"."tenantId"
        AND pss."shopId" = '${escaped}'
    )
  )`);
};

module.exports = {
  parseQuantity,
  sumActiveVariantQuantity,
  getEffectiveProductQuantityOnHand,
  applyEffectiveProductQuantity,
  syncParentQuantityFromVariants,
  resolveStockMovementType,
  recordProductStockMovement,
  MOVEMENT_TYPES,
  shouldSyncDenormalizedQuantity,
  resolveShopOverlayQuantity,
  lockOrCreateShopStock,
  getShopStockQuantity,
  applyStockChange,
  applyStockChanges,
  attachShopStockToProducts,
  shopCatalogVisibilityLiteral,
};
