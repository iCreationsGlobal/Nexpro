const { Tenant, UserTenant } = require('../models');
const {
  cache,
  TENANT_MEMBERSHIP_TTL,
  getTenantMembershipCacheKey,
  getTenantDefaultCacheKey
} = require('./cache');
const { normalizeTenantInstanceForRequest } = require('../utils/tenantClassification');
const {
  resolveSupportSessionId,
  findActiveSupportSession,
  buildSupportTenantContext,
  isConfigurationSupportMode,
} = require('../utils/supportAccess');
const { enforceBillingAccess } = require('./billingEnforcement');
const { getWorkspaceManifest } = require('../services/tenantProvisioningService');

/**
 * Attach pre-provisioned workspace manifest fields for fast feature/branch resolution.
 * @param {import('express').Request} req
 */
const attachWorkspaceContext = (req) => {
  const manifest = getWorkspaceManifest(req.tenant);
  req.workspaceManifest = manifest || null;
  req.enabledFeatures = Array.isArray(manifest?.enabledFeatures) ? manifest.enabledFeatures : null;
  req.defaultBranchId = manifest?.defaultBranchId || null;
  req.workspaceKind = manifest?.kind || null;
};

const resolveTenantId = (req) => {
  const headerTenant =
    req.headers['x-tenant-id'] ||
    req.headers['x-tenant'] ||
    req.headers['tenant-id'];

  if (headerTenant) {
    return headerTenant;
  }

  if (req.query?.tenantId) {
    return req.query.tenantId;
  }

  if (req.body?.tenantId) {
    return req.body.tenantId;
  }

  return null;
};

const isDriverAllowedEndpoint = (req) => {
  const baseUrl = String(req.baseUrl || '');
  const path = String(req.path || '');
  const method = String(req.method || 'GET').toUpperCase();

  if (baseUrl === '/api/deliveries') return true;
  if (method === 'GET' && baseUrl === '/api/studio-locations' && path === '/access') return true;
  if (method === 'GET' && baseUrl === '/api/shops' && path === '/access') return true;
  if (method === 'GET' && baseUrl === '/api/settings' && path === '/organization') return true;
  if (baseUrl === '/api/settings' && (path === '/profile' || path === '/profile/avatar')) return true;
  return false;
};

const isSettingsWriteEndpoint = (req) => {
  const baseUrl = String(req.baseUrl || '');
  const method = String(req.method || 'GET').toUpperCase();
  return baseUrl === '/api/settings' && !['GET', 'HEAD', 'OPTIONS'].includes(method);
};

const tenantContext = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before tenant resolution'
      });
    }

    let tenantId = resolveTenantId(req);
    const supportSessionId = resolveSupportSessionId(req);

    if (supportSessionId && req.user?.isPlatformAdmin) {
      const supportSession = await findActiveSupportSession(
        supportSessionId,
        req.user.id,
        tenantId || undefined
      );

      if (!supportSession) {
        return res.status(403).json({
          success: false,
          message: 'Support access session is invalid or expired',
        });
      }

      const supportCtx = buildSupportTenantContext(supportSession);
      const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (supportCtx.supportAccessMode === 'read_only' && !isReadMethod) {
        return res.status(403).json({
          success: false,
          message: 'Support access is read-only. End support mode to make changes.',
        });
      }
      if (
        isConfigurationSupportMode(supportCtx.supportAccessMode) &&
        !isReadMethod &&
        !isSettingsWriteEndpoint(req)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Configuration support access only allows changes to workspace settings.',
        });
      }

      req.tenantId = supportCtx.tenantId;
      req.tenant = supportCtx.tenant;
      req.tenantRole = supportCtx.tenantRole;
      attachWorkspaceContext(req);
      req.isSupportAccess = true;
      req.supportAccessSession = supportCtx.supportAccessSession;
      req.supportAccessMode = supportCtx.supportAccessMode;

      res.locals.tenantId = supportCtx.tenantId;
      res.locals.tenant = supportCtx.tenant;
      res.locals.tenantRole = supportCtx.tenantRole;
      res.locals.isSupportAccess = true;
      res.locals.tenantAccessState = 'active';

      return next();
    }

    let membership;

    if (tenantId) {
      const cacheKey = getTenantMembershipCacheKey(req.user.id, tenantId);
      membership = cache.get(cacheKey);

      if (!membership) {
        membership = await UserTenant.findOne({
          where: {
            userId: req.user.id,
            tenantId
          },
          include: [
            {
              model: Tenant,
              as: 'tenant'
            }
          ]
        });

        if (membership) {
          cache.set(cacheKey, membership, TENANT_MEMBERSHIP_TTL);
        }
      }

      if (!membership || membership.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this tenant'
        });
      }
    } else {
      const cacheKey = getTenantDefaultCacheKey(req.user.id);
      membership = cache.get(cacheKey);

      if (!membership) {
        membership = await UserTenant.findOne({
          where: {
            userId: req.user.id,
            status: 'active'
          },
          include: [
            {
              model: Tenant,
              as: 'tenant'
            }
          ],
          order: [
            ['isDefault', 'DESC'],
            ['createdAt', 'ASC']
          ]
        });

        if (membership) {
          cache.set(cacheKey, membership, TENANT_MEMBERSHIP_TTL);
        }
      }

      if (!membership) {
        return res.status(400).json({
          success: false,
          message: 'No tenant context provided and user has no active tenant membership'
        });
      }

      tenantId = membership.tenantId;
    }

    req.tenantId = tenantId;
    req.tenantMembership = membership;
    req.tenantRole = membership.role;
    req.tenant = normalizeTenantInstanceForRequest(membership.tenant || (await membership.getTenant()));
    attachWorkspaceContext(req);

    if (req.tenant?.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Workspace access is suspended. Contact support.'
      });
    }

    const entitlements = req.tenant?.metadata?.entitlements || {};
    const accessState = entitlements?.accessState || (req.tenant?.status === 'paused' ? 'restricted' : 'active');
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

    if (accessState === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Workspace access is suspended. Contact support.'
      });
    }
    if (accessState === 'read_only' && !isReadMethod) {
      return res.status(403).json({
        success: false,
        message: 'Workspace is in read-only mode. Writes are disabled by platform admin.'
      });
    }
    if (accessState === 'restricted' && !isReadMethod) {
      return res.status(403).json({
        success: false,
        message: 'Workspace is temporarily restricted. Writes are disabled by platform admin.'
      });
    }

    res.locals.tenantId = tenantId;
    res.locals.tenant = req.tenant;
    res.locals.tenantRole = req.tenantRole;
    res.locals.tenantAccessState = accessState;

    if (req.tenantRole === 'driver' && !isDriverAllowedEndpoint(req)) {
      return res.status(403).json({
        success: false,
        message: 'Driver accounts can only access delivery workspace endpoints.',
      });
    }

    return enforceBillingAccess(req, res, next);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  tenantContext,
  attachWorkspaceContext,
};


