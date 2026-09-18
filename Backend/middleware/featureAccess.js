const { canAccessFeature, canAccessRoute, getFeatureByKey } = require('../config/features');
const { Tenant } = require('../models');
const { getTenantEffectiveEntitlements, resolveTenantAccessState } = require('../utils/tenantEntitlements');
const { normalizeTenantInstanceForRequest } = require('../utils/tenantClassification');
const {
  getCacheValue,
  setCacheValue,
  getTenantRowCacheKey,
  getEntitlementsCacheKey,
  TENANT_ENTITLEMENTS_TTL,
} = require('./cache');

/**
 * Fetch + normalize the tenant row, cached briefly — this runs on every /api request
 * (checkRouteAccess, requireFeature, requireAnyFeature) so an uncached DB round trip here
 * is paid by every single call in the app, not just the ones that actually need it.
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
const getCachedTenant = async (tenantId) => {
  const cacheKey = getTenantRowCacheKey(tenantId);
  const cached = getCacheValue(cacheKey);
  if (cached !== undefined) return cached;
  const tenant = normalizeTenantInstanceForRequest(await Tenant.findByPk(tenantId));
  setCacheValue(cacheKey, tenant || null, TENANT_ENTITLEMENTS_TTL, tenantId);
  return tenant;
};

/**
 * Resolve effective entitlements, cached briefly per tenant — avoids an uncached
 * SubscriptionPlan lookup on every request (entitlements rarely change second-to-second).
 * @param {object} tenant
 * @returns {Promise<object>}
 */
const getCachedEntitlements = async (tenant) => {
  const cacheKey = getEntitlementsCacheKey(tenant.id);
  const cached = getCacheValue(cacheKey);
  if (cached !== undefined) return cached;
  const entitlements = await getTenantEffectiveEntitlements(tenant);
  setCacheValue(cacheKey, entitlements, TENANT_ENTITLEMENTS_TTL, tenant.id);
  return entitlements;
};

/**
 * Middleware to check if tenant's plan includes a specific feature
 */
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      if (Array.isArray(req.enabledFeatures)) {
        if (req.enabledFeatures.includes(featureKey)) {
          return next();
        }
        const tenant = req.tenant || null;
        return res.status(403).json({
          success: false,
          message: `This feature (${featureKey}) is not included in your current workspace`,
          featureRequired: featureKey,
          currentPlan: tenant?.plan,
          businessType: tenant?.businessType,
          upgradeRequired: true,
        });
      }

      const tenantId = req.headers['x-tenant-id'] || req.user?.activeTenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required'
        });
      }

      // Get tenant and their plan
      const tenant = await getCachedTenant(tenantId);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const entitlements = await getCachedEntitlements(tenant);
      const planFeatures = entitlements.enabledFeatures;

      // Check if feature is available
      if (!canAccessFeature(planFeatures, featureKey)) {
        const feature = getFeatureByKey(featureKey);
        const businessTypeMessage = tenant.businessType 
          ? ` or not available for ${tenant.businessType} business type`
          : '';
        return res.status(403).json({
          success: false,
          message: `This feature (${feature?.name || featureKey}) is not included in your current plan${businessTypeMessage}`,
          featureRequired: featureKey,
          currentPlan: tenant.plan,
          businessType: tenant.businessType,
          upgradeRequired: true
        });
      }

      // Feature is available, proceed
      next();
    } catch (error) {
      console.error('Feature access check failed:', error);
      next(error);
    }
  };
};

/**
 * Tenant must have at least one of the listed effective features.
 */
const requireAnyFeature = (featureKeys) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.headers['x-tenant-id'] || req.user?.activeTenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required'
        });
      }

      const tenant = await getCachedTenant(tenantId);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const entitlements = await getCachedEntitlements(tenant);
      const planFeatures = entitlements.enabledFeatures;

      const allowed = Array.isArray(featureKeys) && featureKeys.some((k) => canAccessFeature(planFeatures, k));
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'This action is not included in your current plan for this workspace.',
          featureRequired: featureKeys,
          upgradeRequired: true
        });
      }

      next();
    } catch (error) {
      console.error('requireAnyFeature check failed:', error);
      next(error);
    }
  };
};

/**
 * Middleware to check route-based access
 */
const checkRouteAccess = async (req, res, next) => {
  try {
    const publicUrl = req.originalUrl || req.url || req.path || '';
    if (publicUrl.includes('/api/public/') || (req.path && req.path.startsWith('/public/'))) {
      return next();
    }

    const tenantId = req.headers['x-tenant-id'] || req.user?.activeTenantId;
    
    // Skip for platform admins
    if (req.user?.isPlatformAdmin) {
      return next();
    }

    if (!tenantId) {
      return next();
    }

    const tenant = await getCachedTenant(tenantId);
    if (!tenant) {
      return next();
    }

    const accessState = resolveTenantAccessState(tenant);
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if ((accessState === 'read_only' || accessState === 'restricted') && !isReadMethod) {
      return res.status(403).json({
        success: false,
        message: 'Workspace is restricted by platform admin.'
      });
    }
    if (accessState === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Workspace is suspended by platform admin.'
      });
    }

    const entitlements = await getCachedEntitlements(tenant);
    const planFeatures = entitlements.enabledFeatures;

    // Check if route is accessible
    const route = req.path;
    if (!canAccessRoute(planFeatures, route)) {
      return res.status(403).json({
        success: false,
        message: 'This feature is not included in your current plan',
        currentPlan: tenant.plan,
        upgradeRequired: true
      });
    }

    // Attach plan features to request for later use
    req.tenantFeatures = planFeatures;
    req.tenantPlan = tenant.plan;
    
    next();
  } catch (error) {
    console.error('Route access check failed:', error);
    next(error);
  }
};

/**
 * Helper to get tenant features for response
 */
const getTenantFeatures = async (tenantId) => {
  const tenant = await getCachedTenant(tenantId);
  if (!tenant) return [];
  const entitlements = await getCachedEntitlements(tenant);
  return entitlements.enabledFeatures;
};

/**
 * Middleware to check seat limits before user creation
 */
const checkSeatLimit = async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.user?.activeTenantId;

    // Skip for platform admins
    if (req.user?.isPlatformAdmin) {
      return next();
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    const { validateSeatLimit } = require('../utils/seatLimitHelper');
    
    // Validate seat limit
    const validation = await validateSeatLimit(tenantId, false);
    
    if (!validation.valid) {
      return res.status(403).json({
        success: false,
        message: validation.error.message,
        code: 'SEAT_LIMIT_EXCEEDED',
        details: validation.error.details,
        upgradeRequired: true
      });
    }

    // Attach usage info to request
    req.seatUsage = validation.usage;
    next();
  } catch (error) {
    console.error('Seat limit check failed:', error);
    next(error);
  }
};

module.exports = {
  requireFeature,
  requireAnyFeature,
  checkRouteAccess,
  getTenantFeatures,
  checkSeatLimit
};

