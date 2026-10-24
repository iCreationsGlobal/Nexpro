/**
 * Product import: check every row first (preview), then add the good ones (commit), and undo an import.
 *
 * Used by POST /api/products/import/preview, POST /api/products/import and
 * DELETE /api/products/import/:batchId. Rows come from a CSV/Excel file or, for Lynk, a JSON list
 * with the template's keys. Each import gets a batch id (product.metadata.importBatchId) so it can
 * be undone while nothing has happened to its products yet.
 */
const crypto = require('crypto');
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { sequelize } = require('../config/database');
const models = require('../models');
const { validateProductRow } = require('../utils/importParse');
const { applyStockChange, syncParentQuantityFromVariants } = require('../utils/productStockUtils');

const { Product, ProductCategory, ProductShopStock, ProductStockMovement, ProductVariant, Barcode } = models;

const PRODUCT_IMPORT_MAX_ROWS = 2000;

/** Records that mean a product is in use, so undoing its import keeps it (and why). */
const IN_USE = {
  SaleItem: 'Already sold',
  SaleReturnItem: 'On a sale return',
  SaleReturnExchangeItem: 'On a sale exchange',
  QuoteItem: 'On a quote',
  RentalItem: 'Used in a rental',
  RentalUnit: 'Has rental units',
  PreBookingItem: 'On a pre-booking',
  DamageReport: 'On a damage report',
  DealerProductPrice: 'Has dealer prices',
  OnlineProductListing: 'Listed in the online store',
  ProductVariant: 'Has variants added since the import',
  StockCountItem: 'In a stock count',
  StorefrontReview: 'Has store reviews',
  StorefrontWishlistItem: 'On a store wishlist',
  PartnerProgramService: 'Used in the partner programme',
};

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * A product's colours and sizes (variants), as Lynk sends them: `[{ attributes: { colour, size }, sku, barcode,
 * costPrice, sellingPrice, wholesalePrice, quantityOnHand }]`. Each becomes a ProductVariant named by its attributes
 * ("Red / XL"). Returns the cleaned list, or an error for a negative price or quantity.
 */
function cleanVariants(list) {
  if (!Array.isArray(list) || !list.length) return { variants: [] };
  const variants = [];
  for (const [i, raw] of list.slice(0, 200).entries()) {
    const v = raw && typeof raw === 'object' ? raw : {};
    const attributes = Object.fromEntries(Object.entries(v.attributes && typeof v.attributes === 'object' ? v.attributes : {})
      .map(([k, val]) => [clean(k).toLowerCase().slice(0, 30), clean(val).slice(0, 60)])
      .filter(([k, val]) => k && val)
      .slice(0, 4));
    const prices = { costPrice: money(v.costPrice), sellingPrice: money(v.sellingPrice), wholesalePrice: money(v.wholesalePrice) };
    const quantity = money(v.quantityOnHand ?? v.stock);
    if (Object.values(prices).some((p) => Number.isNaN(p) || p < 0) || Number.isNaN(quantity) || quantity < 0) {
      return { error: `Colour or size ${i + 1} has a price or quantity that isn't a number above 0` };
    }
    variants.push({
      name: Object.values(attributes).join(' / ') || `Option ${i + 1}`,
      attributes,
      sku: clean(v.sku) || null,
      barcode: clean(v.barcode) || null,
      ...prices,
      quantityOnHand: quantity ?? 0,
    });
  }
  return { variants };
}
const nameKey = (value) => clean(value).toLowerCase();

/** What an import may change on a product already in ABS (when the owner chose "update"): its prices and count. */
const UPDATABLE = ['sellingPrice', 'costPrice', 'wholesalePrice', 'quantityOnHand'];
const PRICE_KEYS = ['sellingPrice', 'costPrice', 'wholesalePrice'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The prices and count a row gives (only those it has, never a default), as numbers. */
function givenUpdates(source) {
  const out = {};
  for (const key of UPDATABLE) {
    const value = key === 'quantityOnHand' ? source?.quantityOnHand ?? source?.stock : source?.[key];
    if (value === undefined || value === null || value === '') continue;
    const n = money(value);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

const pick = (fields, keys) => Object.fromEntries(keys.filter((key) => fields?.[key] !== undefined).map((key) => [key, fields[key]]));

/** A colour and size the same way whatever the spelling ("Color: RED" is "colour=red"). */
const attributeKey = (attributes) => Object.entries(attributes && typeof attributes === 'object' ? attributes : {})
  .map(([k, v]) => [clean(k).toLowerCase().replace(/^color$/, 'colour'), clean(v).toLowerCase()])
  .filter(([k, v]) => k && v)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('|');

/**
 * Rows that update a product already in ABS: the product must still be there (and in the import's shop), and each
 * colour or size must be one of its own (by SKU, then colour and size, then name). Marks the ones that can't be
 * updated; the rest get what to change (`entry.update`).
 */
async function resolveUpdates({ tenantId, shopId, entries }) {
  if (!entries.length) return;
  const ids = [...new Set(entries.map((entry) => entry.update.productId).filter((id) => UUID_RE.test(id)))];
  const targets = ids.length
    ? await Product.findAll({
        where: { tenantId, id: { [Op.in]: ids } },
        attributes: ['id', 'name', 'shopId', 'hasVariants'],
        include: [{ model: ProductVariant, as: 'variants', attributes: ['id', 'name', 'sku', 'attributes'], required: false }],
      })
    : [];
  const byId = new Map(targets.map((product) => [product.id, product]));
  const seen = new Set();
  for (const entry of entries) {
    const target = byId.get(entry.update.productId);
    if (!target) {
      Object.assign(entry, { status: 'error', reason: 'Not found in your products any more' });
      continue;
    }
    if (shopId && target.shopId && target.shopId !== shopId) {
      Object.assign(entry, { status: 'skip', reason: `"${target.name}" is in another shop` });
      continue;
    }
    if (seen.has(target.id)) {
      Object.assign(entry, { status: 'skip', reason: `"${target.name}" is updated by an earlier row` });
      continue;
    }
    seen.add(target.id);
    const raw = Array.isArray(entry.update.choices) ? entry.update.choices.slice(0, 200) : [];
    const { variants: choices, error } = cleanVariants(raw);
    if (error) {
      Object.assign(entry, { status: 'error', reason: error });
      continue;
    }
    const variants = [];
    if (choices.length && !target.hasVariants) entry.warnings.push('Its colours and sizes are left as they are: it has none in ABS');
    if (choices.length && target.hasVariants) {
      const own = target.variants || [];
      choices.forEach((choice, i) => {
        const key = attributeKey(choice.attributes);
        const match = (choice.sku && own.find((v) => v.sku && v.sku === choice.sku))
          || (key && own.find((v) => attributeKey(v.attributes) === key))
          || own.find((v) => nameKey(v.name) === nameKey(choice.name));
        if (!match) {
          entry.warnings.push(`${choice.name} isn't one of its colours or sizes in ABS, so it's left out`);
          return;
        }
        const fields = givenUpdates(raw[i]);
        if (Object.keys(fields).length) variants.push({ id: match.id, name: match.name, fields });
      });
    }
    const fields = { ...entry.update.fields };
    // With colours and sizes the stock is theirs, so the product's own count isn't set.
    if (target.hasVariants) delete fields.quantityOnHand;
    if (!Object.keys(fields).length && !variants.length) {
      Object.assign(entry, { status: 'skip', reason: 'Nothing to update: no price or quantity given' });
      continue;
    }
    entry.update = { productId: target.id, name: target.name, fields, variants };
  }
}

/** One template row (see IMPORT_COLUMNS.products) as Product fields; categoryName is resolved later. */
function toProductRecord(m) {
  return {
    name: clean(m.name),
    sku: clean(m.sku) || null,
    barcode: clean(m.barcode) || null,
    description: m.description || null,
    categoryName: clean(m.categoryName) || null,
    costPrice: Number(m.costPrice) || 0,
    sellingPrice: Number(m.sellingPrice) || 0,
    quantityOnHand: Number(m.quantityOnHand) || 0,
    reorderLevel: Number(m.reorderLevel) || 0,
    reorderQuantity: Number(m.reorderQuantity ?? m.reorderLevel) || 0,
    unit: clean(m.unit) || 'pcs',
    isActive: m.isActive !== false,
    wholesalePrice: m.wholesalePrice ?? null,
    brand: m.brand || null,
    supplier: m.supplier || null,
    trackStock: m.trackStock !== false,
    expiryDate: m.expiryDate || null,
    batchNumber: m.batchNumber || null,
    isRentable: m.isRentable === true,
    isSalable: m.isSalable !== false,
    rentalRatePerDay: m.rentalRatePerDay ?? null,
    metadata: m.productCode ? { productCode: m.productCode } : {},
  };
}

/** Two rows are the same product when their names match and no SKU or barcode tells them apart. */
const sameProduct = (a, b) =>
  !(a.sku && b.sku && a.sku !== b.sku) && !(a.barcode && b.barcode && a.barcode !== b.barcode);

/**
 * Check rows without writing anything.
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string|null} [args.shopId] - Shop the products go into (names are compared within it)
 * @param {Array<{ row: number, data: object }>} args.rows - Template rows (see importParse.mapRowToEntity)
 * @param {boolean} [args.createCategories=true] - Create categories that don't exist yet
 * @param {(record: object) => object} [args.prepare] - Applies product rules; throws to reject the row
 * @returns {Promise<{
 *   summary: { total: number, add: number, skip: number, error: number },
 *   rows: Array<{ row: number, name: string, status: 'add'|'skip'|'error', reason?: string, warnings?: string[] }>,
 *   newCategories: string[],
 *   toAdd: Array<{ row: number, record: object }>,
 *   categoryIds: Record<string, string>,
 * }>} `toAdd` and `categoryIds` are for commitProductImport, not for clients.
 */
async function planProductImport({ tenantId, shopId = null, rows, createCategories = true, prepare }) {
  const results = [];
  const bySku = new Map();
  const byBarcode = new Map();
  const byName = new Map();

  for (const { row, data, variants: rawVariants, update } of rows) {
    const entry = { row, name: clean(data?.name), status: 'add', warnings: [] };
    results.push(entry);
    const valid = validateProductRow({ ...data, name: entry.name });
    if (!valid.valid) {
      Object.assign(entry, { status: 'error', reason: valid.error });
      continue;
    }
    let record = { ...toProductRecord(data), ...(shopId ? { shopId } : {}) };
    // An update changes only prices and stock, so the rules for adding a product don't apply to it.
    if (prepare && !update?.id) {
      try {
        record = prepare(record);
      } catch (err) {
        Object.assign(entry, { status: 'error', reason: err.message });
        continue;
      }
    }
    const earlier =
      (record.sku && bySku.get(record.sku) && { what: 'SKU', row: bySku.get(record.sku) })
      || (record.barcode && byBarcode.get(record.barcode) && { what: 'barcode', row: byBarcode.get(record.barcode) })
      || ((byName.get(nameKey(record.name)) || []).find((other) => sameProduct(other, record)) && {
        what: 'name',
        row: (byName.get(nameKey(record.name)) || []).find((other) => sameProduct(other, record)).row,
      });
    if (earlier) {
      Object.assign(entry, { status: 'skip', reason: `Same ${earlier.what} as row ${earlier.row}` });
      continue;
    }
    // Already in ABS, and the owner chose to update it (Lynk's imports): checked against that product below.
    if (update?.id) {
      Object.assign(entry, { status: 'update', update: { productId: String(update.id), fields: givenUpdates(data), choices: rawVariants } });
      if (record.sku) bySku.set(record.sku, row);
      if (record.barcode) byBarcode.set(record.barcode, row);
      byName.set(nameKey(record.name), [...(byName.get(nameKey(record.name)) || []), { row, sku: record.sku, barcode: record.barcode }]);
      continue;
    }
    // Colours and sizes: their own codes must be new too, in the file and in ABS.
    const { variants, error } = cleanVariants(rawVariants);
    if (error) {
      Object.assign(entry, { status: 'error', reason: error });
      continue;
    }
    const variantClash = variants
      .map((v) => (v.sku && bySku.get(v.sku) && `SKU ${v.sku}`) || (v.barcode && byBarcode.get(v.barcode) && `barcode ${v.barcode}`))
      .find(Boolean)
      || variants.map((v) => v.sku).find((sku, i, all) => sku && (sku === record.sku || all.indexOf(sku) !== i));
    if (variantClash) {
      Object.assign(entry, { status: 'skip', reason: `A colour or size uses the same ${variantClash.startsWith('SKU') || variantClash.startsWith('barcode') ? variantClash : `SKU ${variantClash}`} as another product in the file` });
      continue;
    }
    if (record.sku) bySku.set(record.sku, row);
    if (record.barcode) byBarcode.set(record.barcode, row);
    variants.forEach((v) => { if (v.sku) bySku.set(v.sku, row); if (v.barcode) byBarcode.set(v.barcode, row); });
    byName.set(nameKey(record.name), [...(byName.get(nameKey(record.name)) || []), { row, sku: record.sku, barcode: record.barcode }]);
    entry.record = variants.length ? { ...record, variants } : record;
  }

  const pending = () => results.filter((entry) => entry.status === 'add');
  const skip = (entry, reason) => Object.assign(entry, { status: 'skip', reason });
  await resolveUpdates({ tenantId, shopId, entries: results.filter((entry) => entry.status === 'update') });

  // Already in ABS: SKU and barcode across the business, names within the shop the products go into.
  const variantsOf = (entry) => entry.record.variants || [];
  const skus = pending().flatMap((entry) => [entry.record.sku, ...variantsOf(entry).map((v) => v.sku)]).filter(Boolean);
  const barcodes = pending().flatMap((entry) => [entry.record.barcode, ...variantsOf(entry).map((v) => v.barcode)]).filter(Boolean);
  const names = [...new Set(pending().map((entry) => nameKey(entry.record.name)))];
  const [skuOwners, barcodeOwners, barcodeAliases, sameNamed, variantOwners] = await Promise.all([
    skus.length
      ? Product.findAll({ where: { tenantId, sku: { [Op.in]: skus } }, attributes: ['name', 'sku'], raw: true })
      : [],
    barcodes.length
      ? Product.findAll({ where: { tenantId, barcode: { [Op.in]: barcodes } }, attributes: ['name', 'barcode'], raw: true })
      : [],
    barcodes.length
      ? Barcode.findAll({ where: { tenantId, barcode: { [Op.in]: barcodes } }, attributes: ['barcode'], raw: true })
      : [],
    names.length
      ? Product.findAll({
          where: {
            tenantId,
            [Op.and]: [
              sqlWhere(fn('lower', fn('trim', col('name'))), { [Op.in]: names }),
              ...(shopId ? [{ [Op.or]: [{ shopId }, { shopId: null }] }] : []),
            ],
          },
          attributes: ['name', 'sku', 'barcode'],
          raw: true,
        })
      : [],
    // Codes already on another product's colours and sizes.
    skus.length || barcodes.length
      ? ProductVariant.findAll({
          where: { [Op.or]: [...(skus.length ? [{ sku: { [Op.in]: skus } }] : []), ...(barcodes.length ? [{ barcode: { [Op.in]: barcodes } }] : [])] },
          include: [{ model: Product, as: 'product', where: { tenantId }, attributes: ['name'] }],
          attributes: ['sku', 'barcode'],
        })
      : [],
  ]);
  const variantSku = new Map();
  const variantBarcode = new Map();
  for (const v of variantOwners) {
    const owner = v.product?.name ?? 'another product';
    if (v.sku) variantSku.set(v.sku, owner);
    if (v.barcode) variantBarcode.set(v.barcode, owner);
  }
  const skuOwner = new Map(skuOwners.map((product) => [product.sku, product.name]));
  const barcodeOwner = new Map(barcodeOwners.map((product) => [product.barcode, product.name]));
  const aliasBarcodes = new Set(barcodeAliases.map((alias) => alias.barcode));
  for (const entry of pending()) {
    const { sku, barcode, name } = entry.record;
    const usedVariantCode = [sku, ...variantsOf(entry).map((v) => v.sku)].filter(Boolean).find((code) => variantSku.has(code) || (code !== sku && skuOwner.has(code)));
    const usedVariantBarcode = [barcode, ...variantsOf(entry).map((v) => v.barcode)].filter(Boolean).find((code) => variantBarcode.has(code) || (code !== barcode && (barcodeOwner.has(code) || aliasBarcodes.has(code))));
    if (usedVariantCode) {
      skip(entry, `SKU ${usedVariantCode} is already used by "${variantSku.get(usedVariantCode) ?? skuOwner.get(usedVariantCode)}"`);
    } else if (usedVariantBarcode) {
      skip(entry, `Barcode ${usedVariantBarcode} is already used by "${variantBarcode.get(usedVariantBarcode) ?? barcodeOwner.get(usedVariantBarcode) ?? 'another product'}"`);
    } else if (sku && skuOwner.has(sku)) {
      skip(entry, `SKU ${sku} is already used by "${skuOwner.get(sku)}"`);
    } else if (barcode && (barcodeOwner.has(barcode) || aliasBarcodes.has(barcode))) {
      skip(entry, barcodeOwner.has(barcode)
        ? `Barcode ${barcode} is already used by "${barcodeOwner.get(barcode)}"`
        : `Barcode ${barcode} is already used by another product`);
    } else if (sameNamed.some((product) => nameKey(product.name) === nameKey(name) && sameProduct(product, entry.record))) {
      skip(entry, `"${name}" is already in your products`);
    }
  }

  // Categories: match by name ignoring case; create the missing ones, or add without a category.
  const categoryIds = {};
  // Lower-cased name → the first spelling in the file (that spelling names a new category).
  const spelling = new Map();
  pending().forEach(({ record }) => {
    if (record.categoryName && !spelling.has(nameKey(record.categoryName))) spelling.set(nameKey(record.categoryName), record.categoryName);
  });
  const wanted = [...spelling.entries()];
  if (wanted.length) {
    const existing = await ProductCategory.findAll({
      where: { tenantId, [Op.and]: [sqlWhere(fn('lower', fn('trim', col('name'))), { [Op.in]: wanted.map(([key]) => key) })] },
      attributes: ['id', 'name'],
      raw: true,
    });
    existing.forEach((category) => { categoryIds[nameKey(category.name)] = category.id; });
  }
  const newCategories = wanted.filter(([key]) => !categoryIds[key]).map(([, label]) => label);
  if (!createCategories) {
    for (const entry of pending()) {
      const category = entry.record.categoryName;
      if (category && !categoryIds[nameKey(category)]) entry.warnings.push(`Category "${category}" not found; added without a category`);
    }
  }

  const toAdd = pending().map((entry) => ({ row: entry.row, record: entry.record }));
  const toUpdate = results.filter((entry) => entry.status === 'update').map((entry) => ({ row: entry.row, ...entry.update }));
  const count = (status) => results.filter((entry) => entry.status === status).length;
  return {
    summary: { total: results.length, add: count('add'), update: count('update'), skip: count('skip'), error: count('error') },
    rows: results.map(({ record, update, warnings, ...entry }) => ({ ...entry, ...(warnings.length ? { warnings } : {}) })),
    newCategories: createCategories ? newCategories : [],
    toAdd,
    toUpdate,
    categoryIds,
  };
}

const CATEGORY_BUSINESS_TYPES = ['shop', 'studio', 'pharmacy'];
const CATEGORY_STUDIO_TYPES = ['printing_press', 'mechanic', 'barber', 'salon'];

/** Business type fields for a new category, as createProductCategory sets them (only values the columns allow). */
function categoryDefaults(tenant) {
  const { resolveBusinessType } = require('../config/businessTypes');
  const type = tenant ? resolveBusinessType(tenant.businessType) : null;
  const businessType = CATEGORY_BUSINESS_TYPES.includes(type) ? type : null;
  const studioType = businessType === 'studio' && CATEGORY_STUDIO_TYPES.includes(tenant?.metadata?.studioType)
    ? tenant.metadata.studioType
    : null;
  const shopType = businessType === 'shop' ? tenant?.metadata?.shopType || null : null;
  return { businessType, studioType, shopType };
}

const failureReason = (err) =>
  err?.name === 'SequelizeUniqueConstraintError'
    ? 'Already in your products (same SKU or barcode)'
    : err?.message || 'Could not add this product';

/**
 * One product already in ABS, updated by an import: its prices, and its stock (or its colours' and sizes') set to the
 * new count with a ledger entry. What it was is kept on the product (metadata.lastImportUpdate) for Undo.
 * @returns {Promise<'updated'|'unchanged'|'already'>} 'already' when this import updated it before (sent twice)
 */
async function applyImportUpdate({ tenantId, productId, fields, variants = [], stockShopId, userId, batchId, at, via, transaction }) {
  const product = await Product.findOne({ where: { id: productId, tenantId }, transaction, lock: true });
  if (!product) throw new Error('Not found in your products any more');
  if (product.metadata?.lastImportUpdate?.batchId === batchId) return 'already';
  const shopId = stockShopId || product.shopId || null;
  const change = { batchId, at, ...(via ? { via } : {}), before: {}, after: {}, stock: [], variants: [] };
  const changedPrices = (record, wanted, into) => {
    for (const [key, value] of Object.entries(pick(wanted, PRICE_KEYS))) {
      const current = record[key] == null ? null : Number(record[key]);
      if (current === value) continue;
      into.before[key] = current;
      into.after[key] = value;
    }
    return Object.keys(into.after).length > 0;
  };
  const setStock = async (productVariantId, quantity) => {
    if (!shopId) return;
    const result = await applyStockChange({
      tenantId,
      productId,
      productVariantId,
      shopId,
      setTo: quantity,
      type: 'import',
      reason: via === 'lynk' ? 'Stock count from Lynk AI import' : 'Stock count from import',
      userId,
      metadata: { source: via || 'import', importBatchId: batchId },
      transaction,
    });
    if (!result.skipped && result.quantityDelta) {
      change.stock.push({ variantId: productVariantId, shopId, before: result.previousQuantity, after: result.newQuantity, movementId: result.movement?.id ?? null });
    }
  };

  if (changedPrices(product, fields, change)) await product.update(change.after, { transaction });
  if (fields.quantityOnHand !== undefined && !product.hasVariants) await setStock(null, fields.quantityOnHand);
  for (const v of variants) {
    const variant = await ProductVariant.findOne({ where: { id: v.id, productId }, transaction, lock: true });
    if (!variant) continue;
    const entry = { id: variant.id, before: {}, after: {} };
    if (changedPrices(variant, v.fields, entry)) {
      await variant.update(entry.after, { transaction });
      change.variants.push(entry);
    }
    if (v.fields.quantityOnHand !== undefined) await setStock(variant.id, v.fields.quantityOnHand);
  }
  if (!Object.keys(change.after).length && !change.stock.length && !change.variants.length) return 'unchanged';
  await product.update({ metadata: { ...(product.metadata || {}), lastImportUpdate: change } }, { transaction });
  return 'updated';
}

/**
 * Add a checked import: new categories, then each product (with its opening stock) in its own
 * savepoint, so one failure doesn't undo the rest.
 * @param {object} args
 * @param {object} args.plan - From planProductImport
 * @param {string} args.tenantId
 * @param {object} [args.tenant] - For new categories' business type
 * @param {string|null} [args.userId]
 * @param {string|null} [args.openingShopId] - Shop for opening stock when a row has none
 * @param {string|null} [args.batchId] - Lynk's imports give their own, so the same import twice adds nothing twice
 * @param {'lynk'|null} [args.via] - Where the import came from, kept on its products and stock entries
 * @returns {Promise<{ batchId: string, added: Array<{ row: number, id: string, name: string }>, updated: Array<{ row: number, id: string, name: string }>, failed: Array<{ row: number, name: string, reason: string }>, newCategories: string[] }>}
 */
async function commitProductImport({ plan, tenantId, tenant = null, userId = null, openingShopId = null, batchId: givenBatchId = null, via = null }) {
  const batchId = givenBatchId || crypto.randomUUID();
  const importedAt = new Date().toISOString();
  const openingReason = via === 'lynk' ? 'Opening stock from Lynk AI import' : 'Opening stock from import';
  const stockSource = via || 'import';
  const added = [];
  const updated = [];
  const failed = [];
  const createdCategories = [];
  const categoryIds = { ...plan.categoryIds };

  await sequelize.transaction(async (outer) => {
    for (const name of plan.newCategories) {
      try {
        const category = await sequelize.transaction({ transaction: outer }, (t) =>
          ProductCategory.create({ ...categoryDefaults(tenant), name, tenantId, metadata: { importBatchId: batchId } }, { transaction: t }));
        categoryIds[nameKey(name)] = category.id;
        createdCategories.push(name);
      } catch {
        const existing = await ProductCategory.findOne({ where: { tenantId, name }, attributes: ['id'], transaction: outer });
        if (existing) categoryIds[nameKey(name)] = existing.id;
      }
    }

    for (const { row, record } of plan.toAdd) {
      const { categoryName, variants = [], ...fields } = record;
      const stockShopId = fields.shopId || openingShopId;
      // With colours and sizes, the stock is theirs (the product's total follows them).
      const openingQty = variants.length ? 0 : Number(fields.quantityOnHand) || 0;
      const recordOpening = Boolean(stockShopId && openingQty > 0 && fields.trackStock !== false);
      try {
        const product = await sequelize.transaction({ transaction: outer }, async (t) => {
          const created = await Product.create({
            ...fields,
            categoryId: categoryName ? categoryIds[nameKey(categoryName)] || null : null,
            // Opening stock goes on the shop's stock with a ledger entry, as when adding one product.
            quantityOnHand: recordOpening ? 0 : openingQty,
            metadata: { ...(fields.metadata || {}), importBatchId: batchId, importedAt, ...(via ? { importedVia: via } : {}) },
            ...(variants.length ? { hasVariants: true } : {}),
            tenantId,
          }, { transaction: t });
          for (const v of variants) {
            const qty = Number(v.quantityOnHand) || 0;
            const opening = Boolean(stockShopId && qty > 0 && fields.trackStock !== false);
            const variant = await ProductVariant.create({
              ...v,
              quantityOnHand: opening ? 0 : qty,
              productId: created.id,
              metadata: { importBatchId: batchId, importedAt },
            }, { transaction: t });
            if (opening) {
              await applyStockChange({
                tenantId,
                productId: created.id,
                productVariantId: variant.id,
                shopId: stockShopId,
                setTo: qty,
                type: 'opening',
                reason: openingReason,
                userId,
                metadata: { source: stockSource, importBatchId: batchId },
                transaction: t,
              });
            }
          }
          if (variants.length) await syncParentQuantityFromVariants(created.id, t);
          if (recordOpening) {
            await applyStockChange({
              tenantId,
              productId: created.id,
              shopId: stockShopId,
              setTo: openingQty,
              type: 'opening',
              reason: openingReason,
              userId,
              metadata: { source: stockSource, importBatchId: batchId },
              transaction: t,
            });
          }
          return created;
        });
        added.push({ row, id: product.id, name: product.name });
      } catch (err) {
        failed.push({ row, name: fields.name, reason: failureReason(err) });
      }
    }

    // Products already in ABS that the owner chose to update (Lynk's imports).
    for (const { row, productId, name, fields, variants } of plan.toUpdate || []) {
      try {
        const done = await sequelize.transaction({ transaction: outer }, (t) => applyImportUpdate({
          tenantId, productId, fields, variants, stockShopId: openingShopId, userId, batchId, at: importedAt, via, transaction: t,
        }));
        if (done !== 'already') updated.push({ row, id: productId, name });
      } catch (err) {
        failed.push({ row, name, reason: err?.message || 'Could not update this product' });
      }
    }
  });

  return { batchId, added, updated, failed, newCategories: createdCategories };
}

/**
 * Undo an import's updates: each product's prices and stock go back to what they were, unless they changed again
 * after the import (then the new value stays, and says so).
 * @returns {Promise<{ found: number, restored: Array<{ id: string, name: string }>, kept: Array<{ id: string, name: string, reason: string }> }>}
 */
async function undoImportUpdates({ tenantId, batchId, canAccess, userId }) {
  const products = await Product.findAll({
    where: { tenantId, metadata: { lastImportUpdate: { batchId } } },
    attributes: ['id', 'name', 'shopId', 'metadata'],
    raw: true,
  });
  const updated = products.filter((product) => product.metadata?.lastImportUpdate?.batchId === batchId);
  const restored = [];
  const kept = [];
  for (const product of updated) {
    if (!canAccess(product)) {
      kept.push({ id: product.id, name: product.name, reason: 'In a shop you cannot manage' });
      continue;
    }
    const change = product.metadata.lastImportUpdate;
    const notes = new Set();
    await sequelize.transaction(async (transaction) => {
      const putBack = async (record, entry) => {
        const values = {};
        for (const [key, value] of Object.entries(entry.after || {})) {
          if (record[key] != null && Number(record[key]) === Number(value)) values[key] = entry.before?.[key] ?? null;
          else notes.add('Its price changed after the import, so the new price stays');
        }
        if (Object.keys(values).length) await record.update(values, { transaction });
      };
      const locked = await Product.findOne({ where: { id: product.id, tenantId }, transaction, lock: true });
      if (!locked) return;
      await putBack(locked, change);
      for (const entry of change.variants || []) {
        const variant = await ProductVariant.findOne({ where: { id: entry.id, productId: product.id }, transaction, lock: true });
        if (variant) await putBack(variant, entry);
      }
      for (const stock of change.stock || []) {
        const since = await ProductStockMovement.count({
          where: {
            productId: product.id,
            productVariantId: stock.variantId || null,
            shopId: stock.shopId,
            createdAt: { [Op.gt]: new Date(change.at) },
            ...(stock.movementId ? { id: { [Op.ne]: stock.movementId } } : {}),
          },
          transaction,
        });
        if (since) {
          notes.add('Its stock changed after the import, so the new count stays');
          continue;
        }
        await applyStockChange({
          tenantId,
          productId: product.id,
          productVariantId: stock.variantId || null,
          shopId: stock.shopId,
          setTo: stock.before,
          type: 'adjustment',
          reason: 'Import undone',
          userId,
          metadata: { source: 'import_undo', importBatchId: batchId },
          transaction,
        });
      }
      const { lastImportUpdate, ...rest } = locked.metadata || {};
      await locked.update({ metadata: rest }, { transaction });
    });
    restored.push({ id: product.id, name: product.name });
    if (notes.size) kept.push({ id: product.id, name: product.name, reason: [...notes].join('; ') });
  }
  return { found: updated.length, restored, kept };
}

/**
 * Undo an import: remove its products that nothing has used yet (no sales, quotes, rentals, variants,
 * store listings, or stock changes after the opening stock), and the categories it created that are
 * left empty; put back the prices and stock of products it updated. Products in use are kept and listed
 * with the reason.
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.batchId
 * @param {(product: { id: string, shopId: string|null }) => boolean} [args.canAccess] - Shop access check
 * @param {string|null} [args.userId] - Who undid it (on the stock entries that put counts back)
 * @returns {Promise<{ found: number, removed: Array<{ id: string, name: string }>, restored: Array<{ id: string, name: string }>, kept: Array<{ id: string, name: string, reason: string }> }>}
 */
async function undoProductImport({ tenantId, batchId, canAccess = () => true, userId = null }) {
  const updates = await undoImportUpdates({ tenantId, batchId, canAccess, userId });
  const products = await Product.findAll({
    where: { tenantId, metadata: { importBatchId: batchId } },
    attributes: ['id', 'name', 'shopId'],
    raw: true,
  });
  if (products.length === 0) return { found: updates.found, removed: [], restored: updates.restored, kept: updates.kept };

  const ids = products.map((product) => product.id);
  const keptReason = new Map();
  products.filter((product) => !canAccess(product)).forEach((product) => keptReason.set(product.id, 'In a shop you cannot manage'));

  for (const [modelName, reason] of Object.entries(IN_USE)) {
    const Model = models[modelName];
    if (!Model?.rawAttributes?.productId) continue;
    const used = await Model.findAll({
      // Colours and sizes this import made aren't "in use": they go with the product. Ones added since have no
      // importBatchId, and NOT (NULL = batchId) matches nothing in SQL, so they're asked for by "other or none".
      where: {
        productId: { [Op.in]: ids },
        ...(modelName === 'ProductVariant'
          ? { [Op.or]: [{ metadata: { importBatchId: { [Op.ne]: batchId } } }, { metadata: { importBatchId: null } }] }
          : {}),
      },
      attributes: ['productId'],
      group: ['productId'],
      raw: true,
    });
    used.forEach(({ productId }) => { if (!keptReason.has(productId)) keptReason.set(productId, reason); });
  }
  const movements = await ProductStockMovement.findAll({
    where: { productId: { [Op.in]: ids } },
    attributes: ['productId', 'type', 'metadata'],
    raw: true,
  });
  movements
    .filter((movement) => !(movement.type === 'opening' && movement.metadata?.importBatchId === batchId))
    .forEach(({ productId }) => { if (!keptReason.has(productId)) keptReason.set(productId, 'Stock has changed since the import'); });

  const removable = ids.filter((id) => !keptReason.has(id));
  if (removable.length) {
    await sequelize.transaction(async (transaction) => {
      const where = { productId: { [Op.in]: removable } };
      await ProductStockMovement.destroy({ where, transaction });
      await ProductShopStock.destroy({ where, transaction });
      await Barcode.destroy({ where, transaction });
      if (ProductVariant?.destroy) await ProductVariant.destroy({ where, transaction });
      await Product.destroy({ where: { tenantId, id: { [Op.in]: removable } }, transaction });

      const categories = await ProductCategory.findAll({
        where: { tenantId, metadata: { importBatchId: batchId } },
        attributes: ['id'],
        raw: true,
        transaction,
      });
      for (const { id } of categories) {
        const stillUsed = await Product.count({ where: { tenantId, categoryId: id }, transaction });
        if (!stillUsed) await ProductCategory.destroy({ where: { tenantId, id }, transaction });
      }
    });
  }

  const nameOf = new Map(products.map((product) => [product.id, product.name]));
  return {
    found: products.length + updates.found,
    removed: removable.map((id) => ({ id, name: nameOf.get(id) })),
    restored: updates.restored,
    kept: [...[...keptReason.entries()].map(([id, reason]) => ({ id, name: nameOf.get(id), reason })), ...updates.kept],
  };
}

/** The products an import added or updated (by its batch id). */
async function productsInBatch({ tenantId, batchId }) {
  return Product.findAll({
    where: { tenantId, [Op.or]: [{ metadata: { importBatchId: batchId } }, { metadata: { lastImportUpdate: { batchId } } }] },
    attributes: ['id', 'name'],
    raw: true,
  });
}

module.exports = {
  productsInBatch,
  cleanVariants,
  PRODUCT_IMPORT_MAX_ROWS,
  toProductRecord,
  planProductImport,
  commitProductImport,
  undoProductImport,
};
