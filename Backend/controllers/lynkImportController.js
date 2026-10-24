/**
 * Bring in products with Lynk AI (services/lynkImport.js): the owner's button in Products starts it; Lynk's signed
 * messages check the rows with ABS's own rules and add the finished products, exactly as ABS's own import does
 * (one batch per Lynk import, so it's added once and Undo works).
 */
const { fn, col, Op } = require('sequelize');
const { Product, ProductCategory, Shop, Tenant } = require('../models');
const { invalidateProductListCache } = require('../middleware/cache');
const { userCanAccessShopId } = require('../utils/shopUtils');
const { planProductImport, commitProductImport, productsInBatch } = require('../services/productImportService');
const { startImport, verifyLynkSignature, rowsFromLynk, batchIdFor, lynkConfigured } = require('../services/lynkImport');

// @desc    Start bringing in products with Lynk AI: Lynk's screen address, to open inside ABS
// @route   POST /api/products/import/lynk
// @access  Private (admin, manager)
exports.startLynkImport = async (req, res, next) => {
  try {
    if (!lynkConfigured()) return res.status(503).json({ success: false, message: 'Bringing in products with Lynk AI isn\'t set up yet.' });
    const tenantId = req.tenantId;
    const [tenant, categories, unitRows, shops, existing] = await Promise.all([
      req.tenant || Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'businessType'] }),
      ProductCategory.findAll({ where: { tenantId }, attributes: ['name'], raw: true }),
      Product.findAll({ where: { tenantId, unit: { [Op.ne]: null } }, attributes: [[fn('DISTINCT', col('unit')), 'unit']], raw: true }),
      Shop.findAll({ where: { tenantId, isActive: true }, attributes: ['id', 'name'], raw: true }),
      Product.findAll({ where: { tenantId }, attributes: ['id', 'name', 'sku', 'barcode'], limit: 50000, raw: true }),
    ]);
    const lynk = await startImport({
      tenant,
      user: req.user,
      categories: categories.map((c) => c.name).filter(Boolean),
      units: [...new Set(['pcs', ...unitRows.map((u) => u.unit).filter(Boolean)])],
      shops: shops.filter((s) => userCanAccessShopId(req, s.id)),
      existing,
    });
    res.status(201).json({ success: true, importId: lynk.id, screenUrl: lynk.screen_url });
  } catch (error) {
    if (error.statusCode === 402 || error.statusCode === 502) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

// @desc    Whether a Lynk import's products are in ABS yet (they arrive by Lynk's message), and its batch for Undo
// @route   GET /api/products/import/lynk/:importId
// @access  Private (admin, manager)
exports.lynkImportStatus = async (req, res, next) => {
  try {
    const batchId = batchIdFor(req.params.importId);
    const products = await productsInBatch({ tenantId: req.tenantId, batchId });
    res.status(200).json({ success: true, saved: products.length > 0, addedCount: products.length, batchId });
  } catch (error) {
    next(error);
  }
};

/** The business and shop a signed Lynk message is about; null when it isn't from Lynk or isn't ABS's. */
async function fromLynk(req, res) {
  if (!verifyLynkSignature(req.rawBody, req.headers['x-lynk-signature'])) {
    res.status(401).json({ success: false, message: 'Not signed by Lynk' });
    return null;
  }
  const tenant = await Tenant.findByPk(String(req.body?.user?.id || ''), { attributes: ['id', 'name', 'businessType'] }).catch(() => null);
  if (!tenant) {
    res.status(404).json({ success: false, message: 'Unknown business' });
    return null;
  }
  const shopId = req.body?.shop_id ? String(req.body.shop_id) : null;
  const shop = shopId ? await Shop.findOne({ where: { id: shopId, tenantId: tenant.id }, attributes: ['id'] }).catch(() => null) : null;
  // The rules for adding one product, as for this business (no signed-in user: Lynk acts for its owner or manager).
  const asTenant = { tenantId: tenant.id, tenant, user: null, body: {} };
  const { _prepareImportRecord } = require('./productController');
  const plan = await planProductImport({
    tenantId: tenant.id,
    shopId: shop?.id || null,
    rows: rowsFromLynk(req.body?.products),
    createCategories: true,
    prepare: (record) => _prepareImportRecord(record, asTenant),
  });
  return { tenant, shop, plan };
}

// @desc    Lynk asks ABS to check the rows (ABS's own preview): codes already used, products already there…
// @route   POST /api/webhooks/lynk/import-check
// @access  Lynk (signed)
exports.lynkImportCheck = async (req, res, next) => {
  try {
    const found = await fromLynk(req, res);
    if (!found) return;
    res.status(200).json({
      results: found.plan.rows.map((r) => ({ row: String(r.row), status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.warnings?.length ? { warnings: r.warnings } : {}) })),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    The finished products from Lynk: added like ABS's own import, once per Lynk import
// @route   POST /api/webhooks/lynk/import-finished
// @access  Lynk (signed)
exports.lynkImportFinished = async (req, res, next) => {
  try {
    const importId = req.body?.import_id;
    if (!importId) return res.status(400).json({ success: false, message: 'import_id is missing' });
    const found = await fromLynk(req, res);
    if (!found) return;
    const batchId = batchIdFor(importId);
    // Sent again (a retry): it's already in.
    const already = await productsInBatch({ tenantId: found.tenant.id, batchId });
    if (already.length) return res.status(200).json({ success: true, already: true, addedCount: already.length });
    if (!found.plan.toAdd.length) return res.status(200).json({ success: true, addedCount: 0, skipped: found.plan.rows.filter((r) => r.status !== 'add') });
    const result = await commitProductImport({ plan: found.plan, tenantId: found.tenant.id, tenant: found.tenant, userId: null, openingShopId: found.shop?.id || null, batchId });
    invalidateProductListCache(found.tenant.id);
    res.status(200).json({ success: true, batchId, addedCount: result.added.length, failed: result.failed, newCategories: result.newCategories });
  } catch (error) {
    next(error);
  }
};
