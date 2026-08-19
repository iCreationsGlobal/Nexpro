/**
 * Platform-admin hard delete of a tenant and all tenant-scoped data.
 * Soft status changes (pause/suspend) live on updateTenantStatus; this path destroys rows.
 */

const { sequelize } = require('../config/database');
const { Tenant } = require('../models');
const {
  PLATFORM_TENANT_SLUG,
  deleteTenantData,
  deleteOrphanUsersWithoutTenants,
} = require('../utils/deleteTenantData');
const { invalidateCache, invalidateAuthBootstrapCache } = require('../middleware/cache');

const CONFIRM_DELETE_LITERAL = 'DELETE';

/**
 * @param {number} statusCode
 * @param {string} message
 * @param {string} errorCode
 * @returns {Error}
 */
function httpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  error.code = errorCode;
  return error;
}

/**
 * Confirmation must be the exact tenant name, or the literal DELETE.
 * @param {{ name?: string }} tenant
 * @param {string} confirmName
 * @returns {boolean}
 */
function confirmMatchesTenant(tenant, confirmName) {
  const value = String(confirmName || '').trim();
  if (!value) return false;
  if (value === CONFIRM_DELETE_LITERAL) return true;
  return value === String(tenant?.name || '').trim();
}

/**
 * Permanently delete a tenant. Caller must be a platform admin (not tenant staff).
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.confirmName - Exact tenant name, or "DELETE"
 * @param {{ id?: string, isPlatformAdmin?: boolean, tenantId?: string }} params.actor
 * @returns {Promise<{ id: string, name: string, slug: string }>}
 * @example
 * await permanentlyDeleteTenant({
 *   tenantId: tenant.id,
 *   confirmName: tenant.name,
 *   actor: { id: req.user.id, isPlatformAdmin: true, tenantId: req.tenantId },
 * });
 */
async function permanentlyDeleteTenant({ tenantId, confirmName, actor = {} } = {}) {
  if (!actor?.isPlatformAdmin) {
    throw httpError(403, 'Platform administrator access required', 'FORBIDDEN');
  }

  const tenant = await Tenant.findByPk(tenantId, {
    attributes: ['id', 'name', 'slug'],
  });

  if (!tenant) {
    throw httpError(404, 'Tenant not found', 'RESOURCE_NOT_FOUND');
  }

  if (tenant.slug === PLATFORM_TENANT_SLUG) {
    throw httpError(400, 'The platform workspace cannot be deleted.', 'PLATFORM_TENANT_PROTECTED');
  }

  if (actor.tenantId && String(actor.tenantId) === String(tenant.id)) {
    throw httpError(
      400,
      'Cannot permanently delete the workspace you are currently using. Switch to another workspace first.',
      'CANNOT_DELETE_ACTIVE_WORKSPACE'
    );
  }

  if (!confirmMatchesTenant(tenant, confirmName)) {
    throw httpError(
      400,
      'Type the tenant name exactly (or DELETE) to confirm permanent deletion.',
      'CONFIRM_NAME_REQUIRED'
    );
  }

  await sequelize.transaction(async (tx) => {
    await deleteTenantData(tenant.id, tx);
    await deleteOrphanUsersWithoutTenants(tx);
  });

  try {
    invalidateCache(tenant.id, '*');
    invalidateAuthBootstrapCache({ tenantId: tenant.id });
  } catch (cacheErr) {
    console.warn('[Admin] Tenant delete cache invalidation failed:', cacheErr?.message || cacheErr);
  }

  console.log(
    '[Admin] Tenant permanently deleted tenantId=%s name=%s slug=%s by userId=%s at=%s',
    tenant.id,
    tenant.name,
    tenant.slug,
    actor.id || 'unknown',
    new Date().toISOString()
  );

  return { id: tenant.id, name: tenant.name, slug: tenant.slug };
}

module.exports = {
  CONFIRM_DELETE_LITERAL,
  confirmMatchesTenant,
  permanentlyDeleteTenant,
};
