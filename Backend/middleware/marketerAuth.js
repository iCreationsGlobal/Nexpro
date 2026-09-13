const jwt = require('jsonwebtoken');
const { Marketer } = require('../models');
const config = require('../config/config');

const requireMarketer = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Sign in as a marketer to continue.',
        errorCode: 'MARKETER_AUTH_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please sign in again.',
        errorCode: 'MARKETER_AUTH_INVALID',
      });
    }

    if (decoded.type !== 'sabito_marketer' || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Use a Sabito marketer account.',
        errorCode: 'MARKETER_AUTH_REQUIRED',
      });
    }

    const marketer = await Marketer.findByPk(decoded.id);
    if (!marketer || marketer.isActive !== true) {
      return res.status(401).json({
        success: false,
        message: 'Marketer account not found or inactive.',
        errorCode: 'MARKETER_AUTH_INVALID',
      });
    }

    if ((decoded.version || 0) !== (marketer.metadata?.authVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Please sign in again.', errorCode: 'MARKETER_AUTH_INVALID' });
    }
    req.marketer = marketer;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireMarketer };
