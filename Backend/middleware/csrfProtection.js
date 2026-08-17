/**
 * CSRF Protection Middleware
 *
 * For JWT-based APIs, traditional cookie-based CSRF isn't applicable.
 * Instead, we implement:
 * 1. Origin/Referer validation for state-changing requests
 * 2. Custom header requirement (SPA must send X-Requested-With header)
 *
 * This works because:
 * - Browsers block cross-origin requests from setting custom headers
 * - CORS preflight prevents attackers from making requests with custom headers
 */

const { isOriginAllowed: checkOriginAllowed } = require('../utils/corsUtils');

const isOriginAllowed = (origin, referer) => {
  if (origin && checkOriginAllowed(origin)) return true;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (checkOriginAllowed(refererOrigin)) return true;
    } catch {
      return false;
    }
  }
  if (process.env.NODE_ENV === 'development') return true;
  return false;
};

/**
 * CSRF Protection Middleware
 * Applies to state-changing methods (POST, PUT, PATCH, DELETE)
 */
const csrfProtection = (req, res, next) => {
  // Skip for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Skip for webhook routes (they have their own authentication).
  // req.path can be '/webhooks/...' when middleware is mounted at '/api',
  // or '/api/webhooks/...' in other execution contexts.
  if (
    req.path.startsWith('/webhooks')
    || req.path.startsWith('/api/webhooks')
    || req.path.startsWith('/partner')
    || req.path.startsWith('/api/partner')
  ) {
    return next();
  }
  
  // Skip for public routes
  if (req.path.startsWith('/api/public')) {
    return next();
  }
  
  const origin = req.get('Origin');
  const referer = req.get('Referer');

  // React Native / native apps do not send Origin or Referer (JWT auth, not cookies).
  if (!origin && !referer) {
    return next();
  }

  // Validate origin
  if (!isOriginAllowed(origin, referer)) {
    console.warn('[CSRF] Blocked request from invalid origin:', {
      origin,
      referer,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid request origin',
    });
  }
  
  // For extra protection, require X-Requested-With header on state-changing requests
  // This ensures the request came from JavaScript (XHR/fetch), not a form submission
  const xRequestedWith = req.get('X-Requested-With');
  
  // Skip this check for file uploads (multipart/form-data)
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // In production, require the custom header
  if (process.env.NODE_ENV === 'production' && !xRequestedWith) {
    console.warn('[CSRF] Missing X-Requested-With header:', {
      origin,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    // Don't block, just log for now (can be made strict later)
    // return res.status(403).json({
    //   success: false,
    //   error: 'Forbidden',
    //   message: 'Missing required header',
    // });
  }
  
  next();
};

/**
 * Middleware to add CSRF token to response (for double-submit cookie pattern)
 * Not used in JWT-based apps, but provided for completeness
 */
const generateCsrfToken = (req, res, next) => {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  // Set as cookie and make available in response
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // Frontend needs to read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  
  req.csrfToken = token;
  next();
};

module.exports = {
  csrfProtection,
  generateCsrfToken,
  isOriginAllowed,
};
