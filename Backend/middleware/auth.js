const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config/config');
const { cache, AUTH_USER_TTL, getAuthUserCacheKey } = require('./cache');

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      if (decoded.partnerId || !decoded.id) throw new Error('Invalid application session');
      const cacheKey = getAuthUserCacheKey(decoded.id);
      let user = cache.get(cacheKey);
      if (!user) {
        user = await User.findByPk(decoded.id);
        if (user) {
          cache.set(cacheKey, user, AUTH_USER_TTL);
        }
      }
      req.user = user;

      if (!req.user || !req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve effective role for authorization: tenant role takes precedence when
 * it denotes admin/owner, otherwise User.role is used. Ensures tenant-level
 * "owner" and "admin" are respected on the API.
 */
/**
 * Effective workspace role for authorize().
 * Prefer tenant membership role when present so API access matches workspace invites
 * (owner/admin → admin; manager/staff use membership, not a stale users.role).
 */
const getEffectiveRole = (req) => {
  if (req.isSupportAccess) {
    return 'admin';
  }
  const tenantRole = req.tenantRole || null;
  if (tenantRole && ['owner', 'admin'].includes(tenantRole)) {
    return 'admin';
  }
  if (tenantRole && ['manager', 'staff', 'driver'].includes(tenantRole)) {
    return tenantRole;
  }
  return req.user?.role || null;
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const effectiveRole = getEffectiveRole(req);
    if (!effectiveRole || !roles.includes(effectiveRole)) {
      return res.status(403).json({
        success: false,
        message: `User role '${effectiveRole || req.user?.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

const requirePlatformAdmin = (req, res, next) => {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Platform administrator access required'
    });
  }
  next();
};

module.exports = { protect, authorize, requirePlatformAdmin, getEffectiveRole };


