const { Op } = require('sequelize');
const { resolveBusinessType } = require('../config/businessTypes');
const { Shop, Tenant, Setting, UserShop } = require('../models');

const WORKSPACE_WIDE_ROLES = ['owner', 'admin', 'support'];
const SHOP_ACCESS_CACHE_TTL_MS = 30 * 1000;
const shopAccessCache = new Map();

const SHOP_SCOPED_BUSINESS_TYPES = ['shop', 'pharmacy', 'rental'];

const isShopScopedBusinessType = (businessType) =>
  SHOP_SCOPED_BUSINESS_TYPES.includes(resolveBusinessType(businessType));

/** Retail shop and rental workspaces share the Shop model as the default/main location. */
const isShopTenant = (tenant) => {
  const type = resolveBusinessType(tenant?.businessType);
  return type === 'shop' || type === 'rental';
};

const hasWorkspaceWideShopAccess = (tenantRole) =>
  WORKSPACE_WIDE_ROLES.includes(tenantRole);

const getCachedValue = (key) => {
  const entry = shopAccessCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    shopAccessCache.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedValue = (key, value) => {
  shopAccessCache.set(key, {
    value,
    expiresAt: Date.now() + SHOP_ACCESS_CACHE_TTL_MS,
  });
};

const invalidateShopAccessCache = (tenantId, userId = null) => {
  if (!tenantId) return;
  const tenantPrefix = `shop-access:${tenantId}:`;
  const userPrefix = userId ? `shop-access:${tenantId}:user:${userId}:` : null;
  for (const key of shopAccessCache.keys()) {
    if ((userPrefix && key.startsWith(userPrefix)) || (!userPrefix && key.startsWith(tenantPrefix))) {
      shopAccessCache.delete(key);
    }
  }
};

/**
 * Normalize organization / metadata address into shop columns.
 * @param {string|object|null} address
 */
const parseAddressFields = (address) => {
  if (!address) {
    return { address: null, city: null, state: null, country: 'Ghana', postalCode: null };
  }
  if (typeof address === 'string') {
    const trimmed = address.trim();
    return {
      address: trimmed || null,
      city: null,
      state: null,
      country: 'Ghana',
      postalCode: null,
    };
  }
  return {
    address: address.line1 || address.address || null,
    city: address.city || null,
    state: address.state || null,
    country: address.country || 'Ghana',
    postalCode: address.postalCode || null,
  };
};

/**
 * Build shop row fields from tenant + organization settings.
 * @param {string} tenantId
 * @param {object} [overrides]
 * @param {import('sequelize').Transaction} [transaction]
 */
const resolveShopSeedData = async (tenantId, overrides = {}, transaction = null) => {
  const opts = transaction ? { transaction } : {};
  const tenant = await Tenant.findByPk(tenantId, opts);
  if (!tenant) return null;

  const orgSetting = await Setting.findOne({
    where: { tenantId, key: 'organization' },
    ...opts,
  });
  const org = orgSetting?.value || {};
  const meta = tenant.metadata || {};
  const businessInfo = meta.businessInfo || {};

  const name =
    overrides.name ||
    org.name ||
    tenant.name ||
    businessInfo.companyName ||
    'Main shop';

  const addressSource =
    overrides.address !== undefined
      ? overrides.address
      : org.address || meta.address || businessInfo.address;

  const addrFields = parseAddressFields(addressSource);

  return {
    name: String(name).trim() || 'Main shop',
    address: addrFields.address,
    city: addrFields.city,
    state: addrFields.state,
    country: addrFields.country || 'Ghana',
    postalCode: addrFields.postalCode,
    phone: overrides.phone ?? org.phone ?? meta.phone ?? businessInfo.phone ?? null,
    email: overrides.email ?? org.email ?? meta.email ?? businessInfo.email ?? null,
    shopType: overrides.shopType ?? meta.shopType ?? meta.businessSubType ?? null,
    isDefault: true,
    isActive: true,
    metadata: {
      ...(overrides.metadata || {}),
      source: overrides.source || 'system',
    },
  };
};

/**
 * Ensure the workspace has exactly one default (main) shop.
 * Creates from org/tenant data if missing; promotes oldest shop if none marked default.
 * @param {string} tenantId
 * @param {object} [options] - Passed to resolveShopSeedData as overrides
 * @param {import('sequelize').Transaction} [transaction]
 */
const ensureDefaultShop = async (tenantId, options = {}, transaction = null) => {
  const opts = transaction ? { transaction } : {};
  const cacheKey = !transaction ? `shop-access:${tenantId}:default` : null;
  const cached = cacheKey ? getCachedValue(cacheKey) : null;
  if (cached) return cached;

  const existingDefault = await Shop.findOne({
    where: { tenantId, isDefault: true },
    ...opts,
  });
  if (existingDefault) {
    if (cacheKey) setCachedValue(cacheKey, existingDefault);
    return existingDefault;
  }

  const any = await Shop.findOne({
    where: { tenantId },
    order: [['createdAt', 'ASC']],
    ...opts,
  });
  if (any) {
    if (!any.isDefault) {
      await any.update({ isDefault: true }, opts);
    }
    if (cacheKey) setCachedValue(cacheKey, any);
    return any;
  }

  const payload = await resolveShopSeedData(tenantId, options, transaction);
  if (!payload) return null;

  const created = await Shop.create({ ...payload, tenantId }, opts);
  if (cacheKey) setCachedValue(cacheKey, created);
  return created;
};

/**
 * Refresh the default shop from current organization / tenant profile (e.g. after onboarding).
 * @param {string} tenantId
 * @param {object} [overrides]
 * @param {import('sequelize').Transaction} [transaction]
 */
const syncDefaultShopFromOrganization = async (tenantId, overrides = {}, transaction = null) => {
  const shop = await ensureDefaultShop(tenantId, overrides, transaction);
  if (!shop) return null;

  const data = await resolveShopSeedData(tenantId, overrides, transaction);
  if (!data) return shop;

  const opts = transaction ? { transaction } : {};
  await shop.update(
    {
      name: data.name,
      address: data.address,
      city: data.city,
      state: data.state,
      country: data.country,
      postalCode: data.postalCode,
      phone: data.phone,
      email: data.email,
      shopType: data.shopType,
    },
    opts
  );

  return shop;
};

/**
 * Clear isDefault on sibling shops when one is set default.
 * @param {string} tenantId
 * @param {string} shopId
 */
const setAsOnlyDefaultShop = async (tenantId, shopId) => {
  await Shop.update(
    { isDefault: false },
    {
      where: {
        tenantId,
        id: { [Op.ne]: shopId },
      },
    }
  );
  await Shop.update({ isDefault: true }, { where: { tenantId, id: shopId } });
  invalidateShopAccessCache(tenantId);
};

/**
 * @param {string} userId
 * @param {string} tenantId
 * @param {string} tenantRole
 * @returns {Promise<string[]>}
 */
const getUserShopIds = async (userId, tenantId, tenantRole) => {
  const cacheKey = `shop-access:${tenantId}:user:${userId}:role:${tenantRole || ''}:ids`;
  const cached = getCachedValue(cacheKey);
  if (cached) return [...cached];

  if (hasWorkspaceWideShopAccess(tenantRole)) {
    const rows = await Shop.findAll({
      where: { tenantId, isActive: true },
      attributes: ['id'],
    });
    const ids = rows.map((r) => r.id);
    setCachedValue(cacheKey, ids);
    return [...ids];
  }

  const assignmentRows = await UserShop.findAll({
    where: { userId, tenantId },
    attributes: ['shopId'],
    raw: true,
  });
  const assignedIds = assignmentRows
    .map((row) => row.shopId || row.shopid)
    .filter(Boolean);
  if (!assignedIds.length) {
    setCachedValue(cacheKey, []);
    return [];
  }

  const activeShops = await Shop.findAll({
    where: { tenantId, id: { [Op.in]: assignedIds }, isActive: true },
    attributes: ['id'],
  });
  const ids = activeShops.map((row) => row.id);
  setCachedValue(cacheKey, ids);
  return [...ids];
};

/**
 * @param {string} userId
 * @param {string} tenantId
 * @param {string[]} shopIds
 */
const setUserShops = async (userId, tenantId, shopIds) => {
  const uniqueIds = [...new Set((shopIds || []).filter(Boolean))];
  if (uniqueIds.length) {
    const valid = await Shop.count({
      where: { tenantId, id: { [Op.in]: uniqueIds }, isActive: true },
    });
    if (valid !== uniqueIds.length) {
      const err = new Error('One or more shops are invalid');
      err.statusCode = 400;
      throw err;
    }
  }

  await UserShop.destroy({ where: { userId, tenantId } });
  if (!uniqueIds.length) {
    invalidateShopAccessCache(tenantId, userId);
    return;
  }

  await UserShop.bulkCreate(
    uniqueIds.map((shopId) => ({ userId, tenantId, shopId }))
  );
  invalidateShopAccessCache(tenantId, userId);
};

/**
 * Merge shop filter into a Sequelize where clause.
 * @param {object} req
 * @param {object} [where]
 */
const applyShopFilter = (req, where = {}) => {
  if (!req.shopScoped) return where;

  if (req.shopFilterId) {
    return { ...where, shopId: req.shopFilterId };
  }

  if (req.allowedShopIds?.length) {
    return { ...where, shopId: { [Op.in]: req.allowedShopIds } };
  }

  return where;
};

/**
 * Shop read filter: include legacy rows with null shopId (created before multi-shop).
 * @param {object} req
 * @param {object} [where]
 */
const { appendWhereOrGroup } = require('./sequelizeWhereUtils');

const applyShopReadFilter = (req, where = {}) => {
  if (!req.shopScoped) return where;

  if (req.shopFilterId) {
    return appendWhereOrGroup(where, [{ shopId: req.shopFilterId }, { shopId: null }]);
  }

  if (req.allowedShopIds?.length) {
    return appendWhereOrGroup(where, [
      { shopId: { [Op.in]: req.allowedShopIds } },
      { shopId: null },
    ]);
  }

  return where;
};

/**
 * Shop id to set on create/update when scoped.
 * @param {object} req
 * @returns {string|null}
 */
const getShopIdForWrite = (req) => {
  if (!req.shopScoped) return null;
  const id = req.shopFilterId || req.defaultShopId || null;
  if (!id) {
    const err = new Error('Shop context is required');
    err.statusCode = 400;
    throw err;
  }
  return id;
};

/**
 * @param {object} req
 * @param {object} payload
 */
const attachShopToPayload = (req, payload = {}) => {
  const shopId = getShopIdForWrite(req);
  if (shopId) {
    return { ...payload, shopId };
  }
  return payload;
};

/**
 * Whether the current user may access a shop row or record tied to shopId.
 * @param {object} req
 * @param {string|null|undefined} shopId
 * @returns {boolean}
 */
const userCanAccessShopId = (req, shopId) => {
  if (!req.shopScoped || !shopId) return true;
  if (req.canAccessAllShops) return true;
  return (req.allowedShopIds || []).includes(shopId);
};

/**
 * Reject when a record belongs to a shop outside the user's assignments.
 * @param {object} req
 * @param {{ shopId?: string|null }|null} record
 * @throws {Error} statusCode 403
 */
const assertShopRecordAccess = (req, record) => {
  if (!req.shopScoped || !record) return;
  const shopId = record.shopId ?? null;
  if (!shopId) return;
  if (!userCanAccessShopId(req, shopId)) {
    const err = new Error('You do not have access to this shop');
    err.statusCode = 403;
    throw err;
  }
};

/**
 * Reject when a shop id (e.g. Shop primary key) is outside assignments.
 * @param {object} req
 * @param {string} shopId
 * @throws {Error} statusCode 403
 */
const assertShopIdAccess = (req, shopId) => {
  if (!req.shopScoped || !shopId) return;
  if (!userCanAccessShopId(req, shopId)) {
    const err = new Error('You do not have access to this shop');
    err.statusCode = 403;
    throw err;
  }
};

/**
 * Apply studio + shop scope filters (only one applies per request).
 * @param {object} req
 * @param {object} [where]
 */
const applyScopedFilters = (req, where = {}) => {
  const { applyStudioLocationFilter } = require('./studioLocationUtils');
  return applyShopFilter(req, applyStudioLocationFilter(req, where));
};

/**
 * Read scope: shop/studio filters include legacy rows with null branch ids.
 * @param {object} req
 * @param {object} [where]
 */
const applyScopedReadFilters = (req, where = {}) => {
  const { applyStudioLocationReadFilter } = require('./studioLocationUtils');
  return applyShopReadFilter(req, applyStudioLocationReadFilter(req, where));
};

/**
 * Attach studio location and/or shop on create payloads.
 * @param {object} req
 * @param {object} [payload]
 */
const attachScopedToPayload = (req, payload = {}) => {
  const { attachStudioLocationToPayload } = require('./studioLocationUtils');
  return attachShopToPayload(req, attachStudioLocationToPayload(req, payload));
};

/**
 * SQL fragment for raw queries (sales, customers stats, etc.)
 * @param {object} req
 * @param {string} [tableAlias] - e.g. 's' for sales s
 * @returns {{ sql: string, replacements: object }}
 */
const getShopSqlFragment = (req, tableAlias = '') => {
  const col = tableAlias ? `${tableAlias}."shopId"` : '"shopId"';
  if (!req.shopScoped) {
    return { sql: '', replacements: {} };
  }
  if (req.shopFilterId) {
    return {
      sql: ` AND ${col} = :shopFilterId`,
      replacements: { shopFilterId: req.shopFilterId },
    };
  }
  if (!req.canAccessAllShops && req.allowedShopIds?.length) {
    return {
      sql: ` AND ${col} IN (:allowedShopIds)`,
      replacements: { allowedShopIds: req.allowedShopIds },
    };
  }
  return { sql: '', replacements: {} };
};

/**
 * Shop read SQL fragment: include legacy tenant-level rows with null shopId.
 * @param {object} req
 * @param {string} [tableAlias]
 * @returns {{ sql: string, replacements: object }}
 */
const getShopReadSqlFragment = (req, tableAlias = '') => {
  const col = tableAlias ? `${tableAlias}."shopId"` : '"shopId"';
  if (!req.shopScoped) {
    return { sql: '', replacements: {} };
  }
  if (req.shopFilterId) {
    return {
      sql: ` AND (${col} = :shopFilterId OR ${col} IS NULL)`,
      replacements: { shopFilterId: req.shopFilterId },
    };
  }
  if (!req.canAccessAllShops && req.allowedShopIds?.length) {
    return {
      sql: ` AND (${col} IN (:allowedShopIds) OR ${col} IS NULL)`,
      replacements: { allowedShopIds: req.allowedShopIds },
    };
  }
  return { sql: '', replacements: {} };
};

module.exports = {
  WORKSPACE_WIDE_ROLES,
  SHOP_SCOPED_BUSINESS_TYPES,
  isShopScopedBusinessType,
  isShopTenant,
  hasWorkspaceWideShopAccess,
  parseAddressFields,
  resolveShopSeedData,
  ensureDefaultShop,
  invalidateShopAccessCache,
  syncDefaultShopFromOrganization,
  setAsOnlyDefaultShop,
  getUserShopIds,
  setUserShops,
  applyShopFilter,
  applyShopReadFilter,
  applyScopedFilters,
  applyScopedReadFilters,
  getShopIdForWrite,
  attachShopToPayload,
  attachScopedToPayload,
  getShopSqlFragment,
  getShopReadSqlFragment,
  userCanAccessShopId,
  assertShopRecordAccess,
  assertShopIdAccess,
};
