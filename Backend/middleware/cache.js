const NodeCache = require('node-cache');
const {
  REQUEST_HAS_HOT_PATH_TIMER_KEY,
  REQUEST_TIMING_LOGGED_KEY,
  logTimedOperation,
} = require('../utils/performanceLogger');

/** Index: tenantId -> Set of cache keys (for O(1) invalidation by tenant) */
const tenantKeysByTenant = new Map();
const tenantByCacheKey = new Map();

/**
 * Register a cache key under a tenant for targeted invalidation
 * @param {string} tenantId - Tenant ID
 * @param {string} key - Cache key
 */
const registerTenantKey = (tenantId, key) => {
  if (!tenantId || !key) return;
  let set = tenantKeysByTenant.get(tenantId);
  if (!set) {
    set = new Set();
    tenantKeysByTenant.set(tenantId, set);
  }
  set.add(key);
  tenantByCacheKey.set(key, tenantId);
};

const getCacheValue = (key) => cache.get(key);

const setCacheValue = (key, value, ttl, tenantId = null) => {
  cache.set(key, value, ttl);
  if (tenantId) registerTenantKey(tenantId, key);
  return value;
};

const deleteCacheValue = (key) => cache.del(key);

// Create cache instance with default TTL of 2 minutes
const cache = new NodeCache({
  stdTTL: 120, // 2 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false // Don't clone objects for better performance
});

// Expiration and explicit deletion must also release tenant-index entries.
cache.on('del', (key) => {
  const tenantId = tenantByCacheKey.get(key);
  if (!tenantId) return;
  const keys = tenantKeysByTenant.get(tenantId);
  keys?.delete(key);
  if (!keys?.size) tenantKeysByTenant.delete(tenantId);
  tenantByCacheKey.delete(key);
});
cache.on('flush', () => {
  tenantKeysByTenant.clear();
  tenantByCacheKey.clear();
});

/**
 * Generate cache key for dashboard data
 * @param {string} tenantId - Tenant ID
 * @param {string} endpoint - API endpoint (e.g., 'overview', 'revenue-by-month')
 * @param {object} params - Additional parameters (e.g., date filters)
 * @returns {string} Cache key
 */
const generateCacheKey = (tenantId, endpoint, params = {}, shopSegment = '') => {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  return `dashboard:${tenantId}:${endpoint}${shopSegment}${paramString ? `:${paramString}` : ''}`;
};

/**
 * Generate cache key for report data
 * @param {string} tenantId - Tenant ID
 * @param {string} reportType - Report type (e.g., 'revenue', 'expense')
 * @param {object} params - Query parameters
 * @returns {string} Cache key
 */
const generateReportCacheKey = (tenantId, reportType, params = {}) => {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  return `report:${tenantId}:${reportType}${paramString ? `:${paramString}` : ''}`;
};

/**
 * Cache key for notification summary (per user per tenant)
 * @param {object} req - Express request (must have tenantId, user.id set by auth/tenant middleware)
 * @returns {string} Cache key
 */
const generateNotificationSummaryKey = (req) => {
  const tenantId = req.tenantId || '';
  const userId = req.user?.id || '';
  const shopId = req.shopFilterId || 'all';
  const studioLocationId = req.studioLocationFilterId || 'all';
  return `notifications:summary:${tenantId}:${userId}:${shopId}:${studioLocationId}`;
};

const getOrganizationSettingsCacheKey = (tenantId) => `settings:${tenantId}:organization`;
const getNotificationChannelsCacheKey = (tenantId) => `settings:${tenantId}:notification-channels`;
const getAuthBootstrapCacheKey = (userId, tenantId) => `auth:bootstrap:${tenantId || 'none'}:${userId || 'anonymous'}`;

/**
 * Cache key for notification list (per user per tenant + pagination)
 */
const generateNotificationListKey = (req) => {
  const tenantId = req.tenantId || '';
  const userId = req.user?.id || '';
  const page = req.query?.page || 1;
  const limit = req.query?.limit || 10;
  const type = req.query?.type || '';
  const unread = req.query?.unread || '';
  return `notifications:list:${tenantId}:${userId}:${page}:${limit}:${type}:${unread}`;
};

/**
 * Shop segment for cache keys (must differ per active shop or lists bleed across shops).
 * @param {object} req - Express request (after shopContext middleware)
 * @returns {string}
 */
const getShopCacheSegment = (req) => {
  if (!req?.shopScoped) return '';
  if (req.shopFilterId) return `:shop:${req.shopFilterId}`;
  if (req.canAccessAllShops) return ':shop:default';
  return ':shop:assigned';
};

/**
 * Studio segment for cache keys (must differ per active studio location or lists bleed across studios).
 * @param {object} req - Express request (after studioLocationContext middleware)
 * @returns {string}
 */
const getStudioLocationCacheSegment = (req) => {
  if (!req?.studioLocationScoped) return '';
  if (req.studioLocationFilterId) return `:studio:${req.studioLocationFilterId}`;
  if (req.canAccessAllStudioLocations) return ':studio:all';
  return ':studio:assigned';
};

const getWorkspaceScopeCacheSegment = (req) =>
  `${getShopCacheSegment(req)}${getStudioLocationCacheSegment(req)}`;

/**
 * Cache key for product list (per tenant + shop + query)
 * @param {object} req - Express request
 * @returns {string} Cache key
 */
const generateProductListKey = (req) => {
  const tenantId = req.tenantId || '';
  const role = req.tenantRole || req.user?.role || '';
  const params = Object.keys(req.query || {})
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  return `products:list:${tenantId}:role:${role}${getWorkspaceScopeCacheSegment(req)}:${params}`;
};

/** Generic list cache key (prefix e.g. customers, sales, invoices) */
const generateListKey = (prefix) => (req) => {
  const tenantId = req.tenantId || '';
  const params = Object.keys(req.query || {})
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  return `${prefix}:list:${tenantId}${getWorkspaceScopeCacheSegment(req)}:${params}`;
};

const generateCustomerListKey = generateListKey('customers');
const generateSaleListKey = generateListKey('sales');
const generateExpenseStatsKey = (req) => {
  const tenantId = req.tenantId || '';
  const params = Object.keys(req.query || {})
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  return `expenses:stats:${tenantId}${getWorkspaceScopeCacheSegment(req)}:${params}`;
};
const generatePublicCacheKey = (prefix = 'public') => (req) => {
  const params = Object.keys(req.query || {})
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  return `${prefix}:${req.baseUrl || ''}${req.path || ''}${params ? `:${params}` : ''}`;
};
const generateInvoiceListKey = (req) => {
  const key = generateListKey('invoices')(req);
  logCacheDebug('Invoice list key generated', {
    key,
    tenantId: req.tenantId || '',
    shopScoped: !!req.shopScoped,
    shopFilterId: req.shopFilterId || null,
    studioLocationScoped: !!req.studioLocationScoped,
    studioLocationFilterId: req.studioLocationFilterId || null,
    query: {
      page: req.query?.page || null,
      limit: req.query?.limit || null,
      status: req.query?.status || null,
      sourceType: req.query?.sourceType || null,
      hasSearch: !!req.query?.search,
      shopId: req.query?.shopId || null,
      studioLocationId: req.query?.studioLocationId || null,
    },
  });
  return key;
};

const generateInvoiceStatsKey = (req) => {
  const tenantId = req.tenantId || '';
  const role = req.tenantRole || req.user?.role || '';
  return `invoices:stats:${tenantId}:role:${role}${getWorkspaceScopeCacheSegment(req)}`;
};

const toCacheTimingLabel = (cacheKey, req) => {
  const parts = String(cacheKey || '').split(':').filter(Boolean);
  const cleanPath = (value) => String(value || '')
    .replace(/^\/api\/?/, '')
    .replace(/^\//, '')
    .replace(/[/?#&=:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');

  if (parts[0] === 'settings' && parts[2]) {
    return `settings.${cleanPath(parts[2]) || 'request'}`;
  }
  if (parts[0] && parts[1] && !parts[1].startsWith('/')) {
    return `${parts[0]}.${cleanPath(parts[1]) || 'request'}`;
  }

  const requestPath = cleanPath(`${req?.baseUrl || ''}${req?.path || ''}`);
  return requestPath ? `cache.${requestPath}` : 'cache.request';
};

const getElapsedMs = (start) => Number((process.hrtime.bigint() - start) / 1000000n);

const attachCacheTimingContext = (req, { cacheKey, cacheLabel, cacheHit }) => {
  req.__cacheKey = cacheKey;
  req.__cacheLabel = cacheLabel;
  req.__cacheHit = cacheHit;
};

/**
 * Middleware to cache GET requests
 * @param {number} ttl - Time to live in seconds (default: 120)
 * @param {function} keyGenerator - Optional function to generate custom cache key
 * @param {{ browserMaxAge?: number }} [options] - When browserMaxAge > 0, set public
 *   Cache-Control / s-maxage for CDN/browser (public read-only routes). Default no-store
 *   keeps authenticated ABS APIs uncached by intermediaries.
 */
const cacheMiddleware = (ttl = 120, keyGenerator = null, options = {}) => {
  const browserMaxAge = Number(options?.browserMaxAge);
  const allowBrowserCache = Number.isFinite(browserMaxAge) && browserMaxAge > 0;

  return async (req, res, next) => {
    const start = process.hrtime.bigint();
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : generateCacheKey(req.tenantId, req.path, req.query);
    const cacheLabel = toCacheTimingLabel(cacheKey, req);
    attachCacheTimingContext(req, { cacheKey, cacheLabel, cacheHit: false });

    // Avoid doing full controller work only for Express to return 304 afterward.
    // Authenticated ABS APIs stay no-store; public marketplace may allow short CDN/browser TTL.
    if (allowBrowserCache) {
      res.set(
        'Cache-Control',
        `public, max-age=${Math.floor(browserMaxAge)}, s-maxage=${Math.floor(browserMaxAge)}`
      );
    } else {
      res.set('Cache-Control', 'no-store');
    }
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];

    // Try to get from cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      attachCacheTimingContext(req, { cacheKey, cacheLabel, cacheHit: true });
      logCacheDebug('Cache HIT', { key: cacheKey, path: req.path });
      if (!req.__hasCrudTiming) {
        logTimedOperation(cacheLabel, {
          req,
          durationMs: getElapsedMs(start),
          statusCode: 200,
          event: 'cache_hit',
          details: {
            cacheHit: true,
            cacheKey,
          },
          skipIfRequestLogged: true,
        });
      }
      return res.status(200).json(cachedData);
    }

    logCacheDebug('Cache MISS', { key: cacheKey, path: req.path });
    res.once('finish', () => {
      if (
        req.__hasCrudTiming ||
        req[REQUEST_HAS_HOT_PATH_TIMER_KEY] ||
        req[REQUEST_TIMING_LOGGED_KEY]
      ) {
        return;
      }

      logTimedOperation(cacheLabel, {
        req,
        durationMs: getElapsedMs(start),
        statusCode: res.statusCode,
        event: 'timed_operation',
        details: {
          cacheHit: false,
          cacheKey,
          cacheStored: req.__cacheStored === true,
          cacheTtlSeconds: ttl,
        },
        skipIfRequestLogged: true,
      });
    });

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function (data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data.success !== false) {
        cache.set(cacheKey, data, ttl);
        if (req.tenantId) registerTenantKey(req.tenantId, cacheKey);
        req.__cacheStored = true;
        logCacheDebug('Cache SET', { key: cacheKey, path: req.path, ttl });
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalidate cache for a specific tenant
 * Uses tenant key index when available for O(k) where k = keys for tenant, not all keys
 * @param {string} tenantId - Tenant ID
 * @param {string} pattern - Pattern to match (e.g., 'dashboard:*' or 'report:*')
 */
const invalidateCache = (tenantId, pattern = '*') => {
  const regex = new RegExp(
    pattern.replace('*', '.*').replace(':', '\\:')
  );
  const tenantPattern = `:${tenantId}:`;
  const candidateKeys = tenantKeysByTenant.get(tenantId);
  const keysToCheck = candidateKeys ? Array.from(candidateKeys) : cache.keys();
  let invalidatedCount = 0;

  keysToCheck.forEach(key => {
    const matches = candidateKeys
      ? regex.test(key)
      : key.includes(tenantPattern) && regex.test(key);
    if (matches) {
      cache.del(key);
      if (candidateKeys) candidateKeys.delete(key);
      invalidatedCount++;
    }
  });

  logCacheDebug('Cache INVALIDATED', { tenantId, pattern, count: invalidatedCount });
  return invalidatedCount;
};

/**
 * Invalidate all dashboard cache for a tenant
 * @param {string} tenantId - Tenant ID
 */
const invalidateDashboardCache = (tenantId) => {
  return invalidateCache(tenantId, 'dashboard:*');
};

/**
 * Invalidate all report cache for a tenant
 * @param {string} tenantId - Tenant ID
 */
const invalidateReportCache = (tenantId) => {
  return invalidateCache(tenantId, 'report:*');
};

/**
 * Invalidate notification list and summary cache for a tenant/user (call after mark-read)
 */
const invalidateNotificationsCache = (tenantId, userId) => {
  if (!tenantId || !userId) return 0;
  const listPrefix = `notifications:list:${tenantId}:${userId}`;
  const summaryKey = `notifications:summary:${tenantId}:${userId}`;
  const candidateKeys = tenantKeysByTenant.get(tenantId);
  const keysToCheck = candidateKeys ? Array.from(candidateKeys) : cache.keys();
  let count = 0;
  keysToCheck.forEach((key) => {
    if (key.startsWith(listPrefix) || key === summaryKey) {
      cache.del(key);
      if (candidateKeys) candidateKeys.delete(key);
      count++;
    }
  });
  if (count > 0 && process.env.NODE_ENV === 'development') {
    console.log(`[Cache] Invalidated ${count} notification keys for tenant ${tenantId} user ${userId}`);
  }
  return count;
};

/**
 * Invalidate product list cache for a tenant (call after product create/update/delete)
 * @param {string} tenantId - Tenant ID
 */
const invalidateProductListCache = (tenantId) => {
  return invalidateCache(tenantId, 'products:list:.*');
};

const invalidateCustomerListCache = (tenantId) => {
  return invalidateCache(tenantId, 'customers:list:.*');
};

const invalidateSaleListCache = (tenantId) => {
  const salesCount = invalidateCache(tenantId, 'sales:list:.*');
  const dashboardCount = invalidateDashboardCache(tenantId);
  return salesCount + dashboardCount;
};

const invalidateInvoiceListCache = (tenantId) => {
  const listCount = invalidateCache(tenantId, 'invoices:list:.*');
  const statsCount = invalidateCache(tenantId, 'invoices:stats:.*');
  const count = listCount + statsCount;
  logCacheDebug('Invoice list invalidation', { tenantId, count, listCount, statsCount });
  return count;
};

const invalidateExpenseStatsCache = (tenantId) => {
  return invalidateCache(tenantId, 'expenses:stats:.*');
};

/** TTL for cached tenant row + resolved plan entitlements (checked on every /api request). */
const TENANT_ENTITLEMENTS_TTL = 60;

const getTenantRowCacheKey = (tenantId) => `tenant:row:${tenantId}`;
const getEntitlementsCacheKey = (tenantId) => `entitlements:${tenantId}`;

/**
 * Invalidate cached tenant row + entitlements for one tenant (call after plan/status changes).
 * @param {string} tenantId - Tenant ID
 */
const invalidateEntitlementsCache = (tenantId) => {
  if (!tenantId) return 0;
  let count = 0;
  if (cache.del(getTenantRowCacheKey(tenantId))) count++;
  if (cache.del(getEntitlementsCacheKey(tenantId))) count++;
  return count;
};

/**
 * Invalidate cached entitlements for every tenant (call after an admin-wide change that isn't
 * scoped to one tenant, e.g. editing the Feature Table matrix shared by a subscription plan).
 */
const invalidateAllEntitlementsCache = () => {
  let count = 0;
  cache.keys().forEach((key) => {
    if (key.startsWith('entitlements:')) {
      cache.del(key);
      count++;
    }
  });
  return count;
};

/**
 * Invalidate all cache for a tenant
 * @param {string} tenantId - Tenant ID
 */
const invalidateAllCache = (tenantId) => {
  return invalidateCache(tenantId, '*');
};

/**
 * Drop public Online Store / marketplace GET caches for a store slug (and related paths).
 * Public keys are not tenant-scoped, so tenant invalidate helpers cannot clear them.
 * @param {string|null|undefined} slug
 * @returns {number} Number of keys removed
 */
const invalidatePublicStorefrontCache = (slug) => {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return 0;
  const keys = cache.keys();
  let count = 0;
  keys.forEach((key) => {
    if (
      key.includes(`/store/${normalized}`)
      || key.includes(`/marketplace/stores/${normalized}`)
    ) {
      cache.del(key);
      count += 1;
    }
  });
  if (count) {
    logCacheDebug('Public storefront cache INVALIDATED', { slug: normalized, count });
  }
  return count;
};

/** TTL in seconds for auth user cache (short-lived to reduce DB hits per request) */
const AUTH_USER_TTL = 90;

/** TTL for tenant membership cache (align with auth) */
const TENANT_MEMBERSHIP_TTL = 90;

/**
 * Cache key for auth user by ID (used by auth middleware)
 * @param {string} userId - User ID
 * @returns {string}
 */
const getAuthUserCacheKey = (userId) => `auth:user:${userId}`;

/**
 * Cache key for tenant membership (userId + tenantId)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {string}
 */
const getTenantMembershipCacheKey = (userId, tenantId) =>
  `tenant:membership:${userId}:${tenantId}`;

/**
 * Cache key for default tenant (when no x-tenant-id header)
 * @param {string} userId - User ID
 * @returns {string}
 */
const getTenantDefaultCacheKey = (userId) => `tenant:default:${userId}`;

/**
 * Invalidate cached tenant membership (call on role change, membership deactivation)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 */
const invalidateTenantMembershipCache = (userId, tenantId) => {
  if (!userId || !tenantId) return;
  cache.del(getTenantMembershipCacheKey(userId, tenantId));
  logCacheDebug('Cache INVALIDATED (tenant membership)', { userId, tenantId });
};

/**
 * Invalidate cached default tenant (call when default membership changes)
 * @param {string} userId - User ID
 */
const invalidateTenantDefaultCache = (userId) => {
  if (!userId) return;
  cache.del(getTenantDefaultCacheKey(userId));
  logCacheDebug('Cache INVALIDATED (tenant default)', { userId });
};

/**
 * Invalidate cached user (call after password change, role change, or deactivation)
 * @param {string} userId - User ID
 */
const invalidateUserCache = (userId) => {
  if (!userId) return;
  cache.del(getAuthUserCacheKey(userId));
  invalidateAuthBootstrapCache({ userId });
  logCacheDebug('Cache INVALIDATED (user)', { userId });
};

const invalidateAuthBootstrapCache = ({ tenantId = null, userId = null } = {}) => {
  const tenantKeySet = tenantId ? tenantKeysByTenant.get(tenantId) : null;
  const keysToCheck = tenantKeySet
    ? Array.from(tenantKeySet)
    : cache.keys();
  let count = 0;

  keysToCheck.forEach((key) => {
    const matchesTenant = !tenantId || Boolean(tenantKeySet) || key.startsWith(`auth:bootstrap:${tenantId}:`);
    const matchesUser = !userId || key.endsWith(`:${userId}`);
    if (key.startsWith('auth:bootstrap:') && matchesTenant && matchesUser) {
      cache.del(key);
      if (tenantKeySet) {
        tenantKeySet.delete(key);
      }
      count++;
    }
  });

  logCacheDebug('Cache INVALIDATED (auth bootstrap)', { tenantId, userId, count });
  return count;
};

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
const getCacheStats = () => {
  return cache.getStats();
};

/**
 * Clear all cache
 */
const clearAllCache = () => {
  cache.flushAll();
  tenantKeysByTenant.clear();
  logCacheDebug('Cache CLEARED', {});
};

/**
 * Debug logging for cache operations
 */
const logCacheDebug = (operation, data) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Cache] ${operation}`, data);
  }
};

/**
 * Helper function to invalidate cache after mutations
 * Call this after create/update/delete operations that affect dashboard/reports
 * @param {string} tenantId - Tenant ID
 */
const invalidateAfterMutation = (tenantId) => {
  if (!tenantId) return;
  invalidateDashboardCache(tenantId);
  invalidateReportCache(tenantId);
  // Dashboard overview also uses an in-memory Map inside dashboardController (separate from node-cache)
  try {
    const { invalidateTenantCache } = require('../controllers/dashboardController');
    invalidateTenantCache(tenantId);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Cache] invalidateTenantCache:', err?.message);
    }
  }
};

module.exports = {
  cache,
  AUTH_USER_TTL,
  TENANT_MEMBERSHIP_TTL,
  getCacheValue,
  setCacheValue,
  deleteCacheValue,
  getAuthUserCacheKey,
  getTenantMembershipCacheKey,
  getTenantDefaultCacheKey,
  getAuthBootstrapCacheKey,
  getOrganizationSettingsCacheKey,
  getNotificationChannelsCacheKey,
  TENANT_ENTITLEMENTS_TTL,
  getTenantRowCacheKey,
  getEntitlementsCacheKey,
  invalidateEntitlementsCache,
  invalidateAllEntitlementsCache,
  invalidateUserCache,
  invalidateAuthBootstrapCache,
  invalidateTenantMembershipCache,
  invalidateTenantDefaultCache,
  cacheMiddleware,
  generateCacheKey,
  generateReportCacheKey,
  generateNotificationSummaryKey,
  generateNotificationListKey,
  generateProductListKey,
  generateCustomerListKey,
  generateSaleListKey,
  generateExpenseStatsKey,
  generatePublicCacheKey,
  generateInvoiceListKey,
  generateInvoiceStatsKey,
  getShopCacheSegment,
  invalidateCache,
  invalidateDashboardCache,
  invalidateReportCache,
  invalidateNotificationsCache,
  invalidateProductListCache,
  invalidateCustomerListCache,
  invalidateSaleListCache,
  invalidateInvoiceListCache,
  invalidateExpenseStatsCache,
  invalidateAllCache,
  invalidateAfterMutation,
  invalidatePublicStorefrontCache,
  getCacheStats,
  clearAllCache
};
