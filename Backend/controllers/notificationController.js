const { Op } = require('sequelize');
const { Notification, User, Product, Tenant } = require('../models');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { applyShopFilter } = require('../utils/shopUtils');
const { getPagination } = require('../utils/paginationUtils');
const { invalidateNotificationsCache } = require('../middleware/cache');
const { startHotPathTimer } = require('../utils/performanceLogger');
const {
  dispatchExpoPushToUsers,
  getWebPushPublicKey,
  isWebPushConfigured
} = require('../services/pushNotificationService');

const STOCK_ALERT_TYPES = {
  OUT_OF_STOCK: 'out_of_stock',
  LOW_STOCK: 'low_stock'
};
const STOCK_ALERT_SYNC_TTL_MS = 5 * 60 * 1000;
const stockAlertSyncCache = new Map();

const dispatchStockAlertPush = async ({ req, alertType, title, message, priority, metadata }) => {
  try {
    await dispatchExpoPushToUsers({
      tenantId: req.tenantId,
      userIds: [req.user.id],
      title,
      message,
      type: 'inventory',
      priority,
      metadata: {
        ...metadata,
        alertType
      },
      link: '/products'
    });
  } catch (error) {
    console.error('[Notifications] Stock alert push failed', {
      userId: req.user?.id,
      alertType,
      error: error.message
    });
  }
};

const compact = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const getPushDevices = (user) => {
  const prefs = user?.notificationPreferences && typeof user.notificationPreferences === 'object'
    ? user.notificationPreferences
    : {};
  const devices = Array.isArray(prefs.pushDevices) ? prefs.pushDevices : [];
  return devices.filter((device) => device && typeof device.token === 'string');
};

const savePushDevices = async (userId, devices) => {
  const user = await User.scope(null).findByPk(userId, {
    attributes: ['id', 'notificationPreferences']
  });
  if (!user) return [];

  const preferences = user.notificationPreferences && typeof user.notificationPreferences === 'object'
    ? { ...user.notificationPreferences }
    : {};
  preferences.pushDevices = devices.slice(0, 20);
  await user.update({ notificationPreferences: preferences });
  return preferences.pushDevices;
};

function getStockAlertSyncKey(req) {
  return [
    req.tenantId,
    req.user?.id,
    req.shopFilterId || 'all',
    req.studioLocationFilterId || 'all',
  ].join(':');
}

/**
 * Filter notifications by branch metadata (scoped + workspace-wide with null scope).
 * @param {object} req
 * @param {object} [where]
 */
function applyNotificationScopeFilter(req, where = {}) {
  const scopeConditions = [];

  if (req.shopFilterId) {
    scopeConditions.push(
      sequelize.where(
        sequelize.fn('COALESCE', sequelize.literal(`"metadata"->>'shopId'`), ''),
        { [Op.in]: ['', req.shopFilterId] }
      )
    );
  }

  if (req.studioLocationFilterId) {
    scopeConditions.push(
      sequelize.where(
        sequelize.fn('COALESCE', sequelize.literal(`"metadata"->>'studioLocationId'`), ''),
        { [Op.in]: ['', req.studioLocationFilterId] }
      )
    );
  }

  if (!scopeConditions.length) return where;

  const existingAnd = where[Op.and]
    ? (Array.isArray(where[Op.and]) ? where[Op.and] : [where[Op.and]])
    : [];

  return {
    ...where,
    [Op.and]: [...existingAnd, ...scopeConditions],
  };
}

function buildNotificationScopeSql(req) {
  const fragments = [];
  const replacements = {};

  if (req.shopFilterId) {
    fragments.push(`COALESCE("metadata"->>'shopId', '') IN ('', :shopFilterId)`);
    replacements.shopFilterId = req.shopFilterId;
  }

  if (req.studioLocationFilterId) {
    fragments.push(`COALESCE("metadata"->>'studioLocationId', '') IN ('', :studioLocationFilterId)`);
    replacements.studioLocationFilterId = req.studioLocationFilterId;
  }

  return {
    sql: fragments.length ? ` AND ${fragments.join(' AND ')}` : '',
    replacements,
  };
}

async function syncStockAlertNotificationsThrottled(req) {
  if (!req.tenantId || !req.user?.id) return;

  const key = getStockAlertSyncKey(req);
  const now = Date.now();
  const cached = stockAlertSyncCache.get(key);

  if (cached?.inFlight) {
    return cached.inFlight;
  }

  if (cached?.lastSyncedAt && now - cached.lastSyncedAt < STOCK_ALERT_SYNC_TTL_MS) {
    return;
  }

  const inFlight = syncStockAlertNotifications(req)
    .then(() => {
      stockAlertSyncCache.set(key, { lastSyncedAt: Date.now(), inFlight: null });
    })
    .catch((error) => {
      stockAlertSyncCache.delete(key);
      throw error;
    });

  stockAlertSyncCache.set(key, { lastSyncedAt: cached?.lastSyncedAt || 0, inFlight });
  return inFlight;
}

function triggerStockAlertNotificationsSync(req) {
  syncStockAlertNotificationsThrottled(req).catch((error) => {
    console.error('[Notifications] Background stock alert sync failed', {
      userId: req.user?.id,
      tenantId: req.tenantId,
      error: error.message
    });
  });
}

async function syncStockAlertNotifications(req) {
  if (!req.tenantId || !req.user?.id) return;

  const tenant = req.tenant || await Tenant.findByPk(req.tenantId, {
    attributes: ['businessType']
  });
  const businessType = tenant?.businessType;
  if (businessType !== 'shop' && businessType !== 'pharmacy') return;

  const baseWhere = applyShopFilter(req, {
    tenantId: req.tenantId,
    isActive: true,
    trackStock: true
  });

  const [outOfStockCount, lowStockCount] = await Promise.all([
    Product.count({
      where: {
        ...baseWhere,
        quantityOnHand: { [Op.lte]: 0 }
      }
    }),
    Product.count({
      where: {
        ...baseWhere,
        quantityOnHand: { [Op.gt]: 0 },
        [Op.and]: [
          sequelize.where(sequelize.col('quantityOnHand'), Op.lte, sequelize.col('reorderLevel'))
        ]
      }
    })
  ]);

  const [outOfStockProductId, lowStockProductId] = await Promise.all([
    getSingleStockAlertProductId({
      alertType: STOCK_ALERT_TYPES.OUT_OF_STOCK,
      count: outOfStockCount,
      baseWhere
    }),
    getSingleStockAlertProductId({
      alertType: STOCK_ALERT_TYPES.LOW_STOCK,
      count: lowStockCount,
      baseWhere
    })
  ]);

  await Promise.all([
    upsertStockAlertNotification({
      req,
      alertType: STOCK_ALERT_TYPES.OUT_OF_STOCK,
      count: outOfStockCount,
      productId: outOfStockProductId,
      title: `${outOfStockCount} item${outOfStockCount === 1 ? '' : 's'} out of stock`,
      message: outOfStockCount === 1
        ? '1 product is out of stock and cannot be sold until restocked.'
        : `${outOfStockCount} products are out of stock and cannot be sold until restocked.`,
      priority: 'high'
    }),
    upsertStockAlertNotification({
      req,
      alertType: STOCK_ALERT_TYPES.LOW_STOCK,
      count: lowStockCount,
      productId: lowStockProductId,
      title: `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} low on stock`,
      message: lowStockCount === 1
        ? '1 product is below its reorder level. Restock soon to avoid missed sales.'
        : `${lowStockCount} products are below their reorder level. Restock soon to avoid missed sales.`,
      priority: 'normal'
    })
  ]);
}

async function getSingleStockAlertProductId({ alertType, count, baseWhere }) {
  if (count !== 1) return null;

  const stockWhere = alertType === STOCK_ALERT_TYPES.OUT_OF_STOCK
    ? {
        ...baseWhere,
        quantityOnHand: { [Op.lte]: 0 }
      }
    : {
        ...baseWhere,
        quantityOnHand: { [Op.gt]: 0 },
        [Op.and]: [
          sequelize.where(sequelize.col('quantityOnHand'), Op.lte, sequelize.col('reorderLevel'))
        ]
      };

  const product = await Product.findOne({
    where: stockWhere,
    attributes: ['id'],
    order: [['updatedAt', 'DESC'], ['createdAt', 'DESC']]
  });

  return product?.id || null;
}

async function upsertStockAlertNotification({ req, alertType, count, productId, title, message, priority }) {
  const where = {
    tenantId: req.tenantId,
    userId: req.user.id,
    type: 'inventory',
    metadata: {
      [Op.contains]: {
        source: 'stock_alert',
        alertType,
        shopId: req.shopFilterId || null
      }
    }
  };

  const existing = await Notification.findOne({ where, order: [['createdAt', 'DESC']] });

  if (count <= 0) {
    if (existing && !existing.isRead) {
      await existing.update({ isRead: true, readAt: new Date(), expiresAt: new Date() });
      invalidateNotificationsCache(req.tenantId, req.user.id);
    }
    return;
  }

  const metadata = {
    source: 'stock_alert',
    alertType,
    count,
    shopId: req.shopFilterId || null,
    ...(productId ? { productId } : {})
  };

  if (!existing) {
    await Notification.create({
      tenantId: req.tenantId,
      userId: req.user.id,
      title,
      message,
      type: 'inventory',
      priority,
      metadata,
      channels: ['in_app', 'push'],
      icon: 'package',
      link: '/products'
    });
    invalidateNotificationsCache(req.tenantId, req.user.id);
    await dispatchStockAlertPush({ req, alertType, title, message, priority, metadata });
    return;
  }

  const previousCount = Number(existing.metadata?.count || 0);
  if (previousCount !== count || existing.title !== title || existing.message !== message) {
    await existing.update({
      title,
      message,
      priority,
      metadata,
      channels: ['in_app', 'push'],
      isRead: false,
      readAt: null,
      expiresAt: null
    });
    invalidateNotificationsCache(req.tenantId, req.user.id);
    await dispatchStockAlertPush({ req, alertType, title, message, priority, metadata });
  }
}

exports.getNotifications = async (req, res, next) => {
  const finishTiming = startHotPathTimer('notifications.list', req);
  try {
    await syncStockAlertNotificationsThrottled(req);

    const { page, limit, offset } = getPagination(req);
    const type = req.query.type;
    const unreadOnly = req.query.unread === 'true';

    const where = applyNotificationScopeFilter(req, applyTenantFilter(req.tenantId, {
      userId: req.user.id
    }));

    if (type) {
      where.type = type;
    }
    if (unreadOnly) {
      where.isRead = false;
    }

    const { count, rows } = await Notification.findAndCountAll({
      where,
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'message', 'type', 'priority', 'metadata', 'link', 'isRead', 'readAt', 'createdAt', 'triggeredBy'],
      include: [
        {
          model: User,
          as: 'actor',
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ]
    });

    if (config.nodeEnv === 'development') console.log('[Notifications] getNotifications', {
      userId: req.user.id,
      page,
      limit,
      unreadOnly,
      type,
      returned: rows.length,
      total: count
    });

    finishTiming({ page, limit, count, returned: rows.length, unreadOnly, type: type || null });
    res.status(200).json({
      success: true,
      count,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      },
      data: rows
    });
  } catch (error) {
    finishTiming({ error: error?.message || 'unknown' });
    next(error);
  }
};

/**
 * Browser push subscription (PushSubscription.toJSON()) reduced to what web push needs.
 * @param {unknown} raw
 * @returns {{ endpoint: string, keys: { p256dh: string, auth: string } } | null}
 */
const normalizeWebPushSubscription = (raw) => {
  const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint.trim() : '';
  const p256dh = typeof raw?.keys?.p256dh === 'string' ? raw.keys.p256dh.trim() : '';
  const auth = typeof raw?.keys?.auth === 'string' ? raw.keys.auth.trim() : '';
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048) return null;
  if (!/^[A-Za-z0-9_-]{20,200}={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}={0,2}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
};

// @desc    Whether this server sends web push, and the public key browsers subscribe with
// @route   GET /api/notifications/push/web-config
exports.getWebPushConfig = async (req, res) => {
  const enabled = isWebPushConfigured();
  res.status(200).json({
    success: true,
    data: { enabled, publicKey: enabled ? getWebPushPublicKey() : null },
  });
};

exports.registerPushToken = async (req, res, next) => {
  try {
    const platform = compact(req.body?.platform, 20).toLowerCase();
    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Platform must be ios, android or web.' });
    }
    // Web: the browser subscription is the "token" (stored with its keys; endpoint identifies it).
    const subscription = platform === 'web' ? normalizeWebPushSubscription(req.body?.subscription) : null;
    if (platform === 'web' && !subscription) {
      return res.status(400).json({ success: false, message: 'A valid web push subscription is required.' });
    }
    const token = platform === 'web' ? subscription.endpoint : compact(req.body?.token, 512);
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required.' });
    }

    const user = await User.scope(null).findByPk(req.user.id, {
      attributes: ['id', 'notificationPreferences']
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const devices = getPushDevices(user).filter((device) => device.token !== token);
    devices.unshift({
      token,
      platform,
      ...(subscription ? { subscription } : {}),
      deviceName: compact(req.body?.deviceName, 120) || null,
      tenantId: req.tenantId || null,
      updatedAt: new Date().toISOString(),
    });
    const saved = await savePushDevices(req.user.id, devices);

    res.status(200).json({
      success: true,
      message: 'Push token registered.',
      data: { deviceCount: saved.length },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Stop push to one device (web: the subscription endpoint; mobile: the Expo token)
// @route   POST /api/notifications/push/unregister
exports.unregisterPushToken = async (req, res, next) => {
  try {
    const token = compact(req.body?.token, 2048);
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required.' });
    }
    const user = await User.scope(null).findByPk(req.user.id, {
      attributes: ['id', 'notificationPreferences']
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const devices = getPushDevices(user);
    const remaining = devices.filter((device) => device.token !== token);
    if (remaining.length !== devices.length) {
      await savePushDevices(req.user.id, remaining);
    }
    res.status(200).json({ success: true, data: { deviceCount: remaining.length } });
  } catch (error) {
    next(error);
  }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: applyTenantFilter(req.tenantId, {
        id: req.params.id,
        userId: req.user.id
      })
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (!notification.isRead) {
      await notification.update({
        isRead: true,
        readAt: new Date()
      });
      invalidateNotificationsCache(req.tenantId, req.user.id);

      if (config.nodeEnv === 'development') console.log('[Notifications] markNotificationRead', {
        notificationId: notification.id,
        userId: req.user.id
      });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

exports.markAllNotificationsRead = async (req, res, next) => {
  try {
    const [updated] = await Notification.update(
      { isRead: true, readAt: new Date() },
      {
        where: applyTenantFilter(req.tenantId, {
          userId: req.user.id,
          isRead: false
        })
      }
    );
    invalidateNotificationsCache(req.tenantId, req.user.id);

    if (config.nodeEnv === 'development') console.log('[Notifications] markAllNotificationsRead', {
      userId: req.user.id,
      updated
    });

    res.status(200).json({
      success: true,
      message: `${updated} notifications marked as read`
    });
  } catch (error) {
    next(error);
  }
};

exports.getNotificationSummary = async (req, res, next) => {
  const finishTiming = startHotPathTimer('notifications.summary', req);
  try {
    triggerStockAlertNotificationsSync(req);

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const scope = buildNotificationScopeSql(req);

    const [summaryRow] = await sequelize.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "isRead" = false)::int AS unread,
         COUNT(*) FILTER (WHERE "createdAt" >= :cutoff)::int AS recent
       FROM notifications
       WHERE "tenantId" = :tenantId AND "userId" = :userId${scope.sql}`,
      {
        replacements: {
          tenantId: req.tenantId,
          userId: req.user.id,
          cutoff: fortyEightHoursAgo,
          ...scope.replacements,
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const summary = summaryRow || { total: 0, unread: 0, recent: 0 };

    finishTiming({ unread: summary.unread ?? 0, recent: summary.recent ?? 0 });
    res.status(200).json({
      success: true,
      data: {
        total: summary.total ?? 0,
        unread: summary.unread ?? 0,
        recent: summary.recent ?? 0
      }
    });
  } catch (error) {
    finishTiming({ error: error?.message || 'unknown' });
    next(error);
  }
};


