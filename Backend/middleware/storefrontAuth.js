const jwt = require('jsonwebtoken');
const { StorefrontCustomer } = require('../models');
const config = require('../config/config');

const requireStorefrontCustomer = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Sign in or create a shopper account to checkout.',
        errorCode: 'STOREFRONT_AUTH_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Your shopper session has expired. Please sign in again.',
        errorCode: 'STOREFRONT_AUTH_INVALID',
      });
    }

    if (decoded.type !== 'storefront_customer' || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Use a shopper account to checkout.',
        errorCode: 'STOREFRONT_AUTH_REQUIRED',
      });
    }

    const customer = await StorefrontCustomer.findByPk(decoded.id);
    if (!customer || customer.isActive !== true) {
      return res.status(401).json({
        success: false,
        message: 'Shopper account not found or inactive.',
        errorCode: 'STOREFRONT_AUTH_INVALID',
      });
    }

    req.storefrontCustomer = customer;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Like requireStorefrontCustomer, but lets requests without a token through as guests
 * (req.storefrontCustomer stays unset). A token that is present but invalid still fails,
 * so a signed-in shopper is never silently downgraded to a guest.
 */
const optionalStorefrontCustomer = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  return requireStorefrontCustomer(req, res, next);
};

module.exports = { requireStorefrontCustomer, optionalStorefrontCustomer };
