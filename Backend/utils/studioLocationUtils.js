const { Op } = require('sequelize');
const { resolveBusinessType } = require('../config/businessTypes');
const { StudioLocation, UserStudioLocation } = require('../models');

const WORKSPACE_WIDE_ROLES = ['owner', 'admin', 'support'];

const isStudioTenant = (tenant) => resolveBusinessType(tenant?.businessType) === 'studio';

const hasWorkspaceWideStudioAccess = (tenantRole) =>
  WORKSPACE_WIDE_ROLES.includes(tenantRole);

/**
 * Ensure the workspace has a default studio location.
 * Creates one if missing; promotes the first existing location if none is marked default.
 * @param {string} tenantId
 * @param {string|object} [options]
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<import('../models/StudioLocation').default>}
 */
const ensureDefaultStudioLocation = async (tenantId, options = 'Main studio', transaction = null) => {
  const defaultName = typeof options === 'string' ? options : options?.name || 'Main studio';
  const metadata = typeof options === 'object' && options !== null ? options.metadata : {};
  const studioType = typeof options === 'object' && options !== null
    ? options.studioType || metadata?.studioType || null
    : null;
  const source = typeof options === 'object' && options !== null ? options.source : null;
  const opts = transaction ? { transaction } : {};

  const existingDefault = await StudioLocation.findOne({
    where: { tenantId, isDefault: true },
    ...opts,
  });
  if (existingDefault) {
    if (!existingDefault.studioType && studioType) {
      await existingDefault.update({ studioType }, opts);
    }
    return existingDefault;
  }

  const any = await StudioLocation.findOne({
    where: { tenantId },
    order: [['createdAt', 'ASC']],
    ...opts,
  });
  if (any) {
    await any.update({ isDefault: true, ...(!any.studioType && studioType ? { studioType } : {}) }, opts);
    return any;
  }

  return StudioLocation.create({
    tenantId,
    name: defaultName,
    studioType,
    isDefault: true,
    isActive: true,
    metadata: {
      ...metadata,
      ...(source ? { source } : {}),
    },
  }, opts);
};

/**
 * Clear isDefault on sibling studio locations when one is set default.
 * @param {string} tenantId
 * @param {string} studioLocationId
 */
const setAsOnlyDefaultStudioLocation = async (tenantId, studioLocationId) => {
  await StudioLocation.update(
    { isDefault: false },
    {
      where: {
        tenantId,
        id: { [Op.ne]: studioLocationId },
      },
    }
  );
  await StudioLocation.update({ isDefault: true }, { where: { tenantId, id: studioLocationId } });
};

/**
 * @param {string} userId
 * @param {string} tenantId
 * @param {string} tenantRole
 * @returns {Promise<string[]>}
 */
const getUserStudioLocationIds = async (userId, tenantId, tenantRole) => {
  if (hasWorkspaceWideStudioAccess(tenantRole)) {
    const rows = await StudioLocation.findAll({
      where: { tenantId, isActive: true },
      attributes: ['id'],
    });
    return rows.map((r) => r.id);
  }

  const assignments = await UserStudioLocation.findAll({
    where: { userId, tenantId },
    include: [
      {
        model: StudioLocation,
        as: 'studioLocation',
        where: { isActive: true },
        required: true,
        attributes: ['id'],
      },
    ],
  });
  return assignments.map((a) => a.studioLocationId);
};

/**
 * Merge studio location filter into a Sequelize where clause.
 * @param {object} req
 * @param {object} [where]
 */
const applyStudioLocationFilter = (req, where = {}) => {
  if (!req.studioLocationScoped) return where;

  if (req.studioLocationFilterId) {
    return { ...where, studioLocationId: req.studioLocationFilterId };
  }

  // Workspace-wide users viewing "all locations" should not exclude rows with null studioLocationId.
  if (req.canAccessAllStudioLocations) {
    return where;
  }

  if (req.allowedStudioLocationIds?.length) {
    return { ...where, studioLocationId: { [Op.in]: req.allowedStudioLocationIds } };
  }

  return where;
};

/**
 * Studio read filter: include legacy rows with null studioLocationId (pre multi-location).
 * @param {object} req
 * @param {object} [where]
 */
const { appendWhereOrGroup } = require('./sequelizeWhereUtils');

const applyStudioLocationReadFilter = (req, where = {}) => {
  if (!req.studioLocationScoped) return where;

  if (req.studioLocationFilterId) {
    return appendWhereOrGroup(where, [
      { studioLocationId: req.studioLocationFilterId },
      { studioLocationId: null },
    ]);
  }

  if (req.canAccessAllStudioLocations) {
    return where;
  }

  if (req.allowedStudioLocationIds?.length) {
    return appendWhereOrGroup(where, [
      { studioLocationId: { [Op.in]: req.allowedStudioLocationIds } },
      { studioLocationId: null },
    ]);
  }

  return where;
};

/**
 * SQL fragment for raw dashboard/report queries.
 * @param {object} req
 * @param {string} [tableAlias]
 * @returns {{ sql: string, replacements: object }}
 */
const getStudioLocationSqlFragment = (req, tableAlias = '') => {
  const col = tableAlias ? `${tableAlias}."studioLocationId"` : '"studioLocationId"';
  if (!req.studioLocationScoped) {
    return { sql: '', replacements: {} };
  }

  if (req.studioLocationFilterId) {
    return {
      sql: ` AND ${col} = :studioLocationFilterId`,
      replacements: { studioLocationFilterId: req.studioLocationFilterId },
    };
  }

  if (!req.canAccessAllStudioLocations && req.allowedStudioLocationIds?.length) {
    return {
      sql: ` AND ${col} IN (:allowedStudioLocationIds)`,
      replacements: { allowedStudioLocationIds: req.allowedStudioLocationIds },
    };
  }

  return { sql: '', replacements: {} };
};

/**
 * Studio location id to set on create/update.
 * @param {object} req
 * @returns {string|null}
 */
const getStudioLocationIdForWrite = (req) => {
  if (!req.studioLocationScoped) return null;
  const id = req.studioLocationFilterId || req.defaultStudioLocationId || null;
  if (!id) {
    const err = new Error('Studio location context is required');
    err.statusCode = 400;
    throw err;
  }
  return id;
};

/**
 * @param {object} req
 * @param {object} payload
 */
const attachStudioLocationToPayload = (req, payload = {}) => {
  const locationId = getStudioLocationIdForWrite(req);
  if (locationId) {
    return { ...payload, studioLocationId: locationId };
  }
  return payload;
};

/**
 * True when a new job needs the user to pick a branch first: the workspace has several
 * branches and the user is viewing "All branches". Saving to the default branch in that
 * case would put the job on the wrong branch.
 * @param {object} req
 * @returns {boolean}
 */
const requiresExplicitStudioLocation = (req) => Boolean(
  req?.studioLocationScoped
  && !req.studioLocationFilterId
  && (req.allowedStudioLocationIds?.length || 0) > 1
);

/**
 * Studio location for a job created from a quote: the explicitly selected branch, else the
 * quote's own branch, else the workspace default.
 * @param {object|null} req
 * @param {{ studioLocationId?: string|null }} quote
 * @returns {string|null}
 */
const resolveStudioLocationIdForJobFromQuote = (req, quote) => {
  if (req?.studioLocationFilterId) return req.studioLocationFilterId;
  if (quote?.studioLocationId) return quote.studioLocationId;
  return req ? attachStudioLocationToPayload(req, {}).studioLocationId || null : null;
};

/**
 * @param {string} userId
 * @param {string} tenantId
 * @param {string[]} studioLocationIds
 */
const setUserStudioLocations = async (userId, tenantId, studioLocationIds) => {
  const uniqueIds = [...new Set((studioLocationIds || []).filter(Boolean))];
  if (uniqueIds.length) {
    const valid = await StudioLocation.count({
      where: { tenantId, id: { [Op.in]: uniqueIds }, isActive: true },
    });
    if (valid !== uniqueIds.length) {
      const err = new Error('One or more studio locations are invalid');
      err.statusCode = 400;
      throw err;
    }
  }

  await UserStudioLocation.destroy({ where: { userId, tenantId } });
  if (!uniqueIds.length) return;

  await UserStudioLocation.bulkCreate(
    uniqueIds.map((studioLocationId) => ({ userId, tenantId, studioLocationId }))
  );
};

module.exports = {
  WORKSPACE_WIDE_ROLES,
  isStudioTenant,
  hasWorkspaceWideStudioAccess,
  ensureDefaultStudioLocation,
  setAsOnlyDefaultStudioLocation,
  getUserStudioLocationIds,
  applyStudioLocationFilter,
  applyStudioLocationReadFilter,
  getStudioLocationSqlFragment,
  getStudioLocationIdForWrite,
  requiresExplicitStudioLocation,
  attachStudioLocationToPayload,
  resolveStudioLocationIdForJobFromQuote,
  setUserStudioLocations,
};
