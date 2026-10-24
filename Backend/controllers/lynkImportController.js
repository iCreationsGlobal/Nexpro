/**
 * Bring in products with Lynk AI (services/lynkImport.js): the owner's button in Products starts it; Lynk's signed
 * messages check the rows with ABS's own rules and add the finished products, exactly as ABS's own import does
 * (one batch per Lynk import, so it's added once and Undo works). Each import is kept in lynk_imports: ABS takes
 * products only for imports it started, once each, and never again after Undo.
 */
const { fn, col, Op } = require('sequelize');
const { Product, ProductCategory, Shop, Tenant, LynkImport } = require('../models');
const { invalidateProductListCache } = require('../middleware/cache');
const { userCanAccessShopId } = require('../utils/shopUtils');
const { planProductImport, commitProductImport } = require('../services/productImportService');
const { startImport, verifyLynkSignature, rowsFromLynk, batchIdFor, lynkConfigured } = require('../services/lynkImport');

/** What the owner's window needs to know about an import (GET …/lynk/:importId). */
const statusOf = (row) => ({
  finished: row.status !== 'started',
  undone: row.status === 'undone',
  batchId: row.batchId,
  addedCount: row.addedCount,
  updatedCount: row.updatedCount,
  leftOut: row.result?.leftOut ?? [],
  skipped: row.result?.skipped ?? [],
  failed: row.result?.failed ?? [],
});

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
    await LynkImport.create({ tenantId, importId: String(lynk.id), startedBy: req.user?.id || null, batchId: batchIdFor(lynk.id) });
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
    const row = await LynkImport.findOne({ where: { tenantId: req.tenantId, importId: String(req.params.importId || '') } });
    if (!row) return res.status(404).json({ success: false, message: 'Import not found' });
    res.status(200).json({ success: true, ...statusOf(row) });
  } catch (error) {
    next(error);
  }
};

/** The shop stock goes into when Lynk doesn't say: the business's default shop, or its only one. */
async function defaultShopId(tenantId) {
  const shops = await Shop.findAll({ where: { tenantId, isActive: true }, attributes: ['id', 'isDefault'], raw: true });
  return (shops.find((s) => s.isDefault) || (shops.length === 1 ? shops[0] : null))?.id || null;
}

/**
 * The import, business and shop a signed Lynk message is about, with ABS's check of its rows; null (and the reply
 * sent) when it isn't from Lynk or isn't an import this business started.
 */
async function fromLynk(req, res) {
  if (!verifyLynkSignature(req.rawBody, req.headers['x-lynk-signature'])) {
    res.status(401).json({ success: false, message: 'Not signed by Lynk' });
    return null;
  }
  const importId = req.body?.import_id ? String(req.body.import_id) : '';
  const tenantId = String(req.body?.user?.id || '');
  const record = importId ? await LynkImport.findOne({ where: { importId } }) : null;
  if (!record || record.tenantId !== tenantId) {
    res.status(404).json({ success: false, message: 'Unknown import' });
    return null;
  }
  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'businessType'] }).catch(() => null);
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
    prepare: (r) => _prepareImportRecord(r, asTenant),
  });
  return { record, tenant, shop, plan };
}

// @desc    Lynk asks ABS to check the rows (ABS's own preview): codes already used, products already there…
// @route   POST /api/webhooks/lynk/import-check
// @access  Lynk (signed)
exports.lynkImportCheck = async (req, res, next) => {
  try {
    const found = await fromLynk(req, res);
    if (!found) return;
    res.status(200).json({
      // Lynk knows "add", "skip" and "error": a product the owner chose to update can go in, so it's "add".
      results: found.plan.rows.map((r) => ({
        row: String(r.row),
        status: r.status === 'update' ? 'add' : r.status,
        ...(r.reason ? { reason: r.reason } : {}),
        ...(r.warnings?.length ? { warnings: r.warnings } : {}),
      })),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    The finished products from Lynk: added (and updated) like ABS's own import, once per Lynk import
// @route   POST /api/webhooks/lynk/import-finished
// @access  Lynk (signed)
exports.lynkImportFinished = async (req, res, next) => {
  try {
    const found = await fromLynk(req, res);
    if (!found) return;
    const { record, tenant, shop, plan } = found;
    // Claim it, so a message sent twice at once adds nothing twice; after Undo it's never added again.
    const [claimed] = await LynkImport.update({ status: 'saving' }, { where: { id: record.id, status: 'started' } });
    if (!claimed) {
      const now = await LynkImport.findByPk(record.id);
      return res.status(200).json({ success: true, already: true, ...statusOf(now || record) });
    }
    try {
      const skipped = plan.rows.filter((r) => r.status === 'skip' || r.status === 'error').map((r) => ({ row: r.row, name: r.name, reason: r.reason }));
      const result = plan.toAdd.length || plan.toUpdate.length
        ? await commitProductImport({
            plan,
            tenantId: tenant.id,
            tenant,
            userId: record.startedBy,
            openingShopId: shop?.id || await defaultShopId(tenant.id),
            batchId: record.batchId,
            via: 'lynk',
          })
        : { added: [], updated: [], failed: [], newCategories: [] };
      const leftOut = (Array.isArray(req.body?.left_out) ? req.body.left_out : []).slice(0, 500)
        .map((l) => ({ name: l?.name ? String(l.name).slice(0, 200) : null, reason: String(l?.why || 'Left out').slice(0, 300) }));
      await record.update({
        status: 'finished',
        finishedAt: new Date(),
        addedCount: result.added.length,
        updatedCount: result.updated.length,
        result: { leftOut, skipped, failed: result.failed, newCategories: result.newCategories },
      });
      if (result.added.length || result.updated.length) invalidateProductListCache(tenant.id);
      res.status(200).json({ success: true, batchId: record.batchId, addedCount: result.added.length, updatedCount: result.updated.length, failed: result.failed, newCategories: result.newCategories });
    } catch (error) {
      // Let Lynk's next try go ahead.
      await LynkImport.update({ status: 'started' }, { where: { id: record.id, status: 'saving' } }).catch(() => {});
      throw error;
    }
  } catch (error) {
    next(error);
  }
};
