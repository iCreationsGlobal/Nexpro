const { Tenant } = require('../models');
const { authenticateDeviceKey } = require('../services/watchDeviceService');
const { getTenantFeatures } = require('./featureAccess');

/**
 * Authenticate an ABS Watch agent by its device key (`Authorization: Bearer <deviceId>.<secret>`)
 * and scope the request to that device's workspace + shop. Same gates as a signed-in user:
 * the workspace must exist, not be suspended, and include Watch.
 */
const requireWatchDevice = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const key = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-watch-device-key'];
    const device = key ? await authenticateDeviceKey(key) : null;
    if (!device) {
      return res.status(401).json({
        success: false,
        error: 'This Watch device is not paired or was removed. Pair it again from ABS Watch.',
        errorCode: 'WATCH_DEVICE_UNAUTHORIZED',
      });
    }

    const tenant = await Tenant.findByPk(device.tenantId, { attributes: ['id', 'status'] });
    if (!tenant) {
      return res.status(401).json({ success: false, error: 'Workspace not found', errorCode: 'WATCH_DEVICE_UNAUTHORIZED' });
    }
    if (tenant.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'This workspace is suspended', errorCode: 'WORKSPACE_SUSPENDED' });
    }
    const features = await getTenantFeatures(device.tenantId);
    if (!Array.isArray(features) || !features.includes('watch')) {
      return res.status(403).json({
        success: false,
        error: 'ABS Watch is not included in this workspace',
        errorCode: 'FEATURE_NOT_AVAILABLE',
        featureRequired: 'watch',
      });
    }

    req.watchDevice = device;
    req.tenantId = device.tenantId;
    req.shopId = device.shopId || null;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireWatchDevice };
