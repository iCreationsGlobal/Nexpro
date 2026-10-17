const axios = require('axios');
const webpush = require('web-push');
const { StorefrontCustomer, User } = require('../models');
const {
  mergeNotificationPreferences,
  isNotificationChannelEnabled,
  normalizeNotificationCategory
} = require('./notificationPreferenceHelper');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;
const MAX_STORED_PUSH_DEVICES = 20;
const logPrefix = '[PushNotifications]';

const isExpoPushToken = (token) =>
  typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token);

/** Browser (web app / installed PWA) subscription stored with platform 'web'; token is its endpoint. */
const isWebPushDevice = (device) =>
  device?.platform === 'web' &&
  typeof device.subscription?.endpoint === 'string' &&
  device.subscription.endpoint === device.token &&
  typeof device.subscription?.keys?.p256dh === 'string' &&
  typeof device.subscription?.keys?.auth === 'string';

const WEB_PUSH_TTL_SECONDS = 24 * 60 * 60;
const WEB_PUSH_CONCURRENCY = 25;
/** Push services answer 404/410 when a browser subscription is gone for good. */
const EXPIRED_WEB_PUSH_STATUS = new Set([404, 410]);

/**
 * VAPID settings for web push (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT or
 * PLATFORM_EMAIL_FROM). Web push stays off until all are set; Expo pushes are unaffected.
 * @returns {{ publicKey: string, privateKey: string, subject: string } | null}
 */
const getWebPushConfig = () => {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const contact = (process.env.VAPID_SUBJECT || process.env.PLATFORM_EMAIL_FROM || '').trim();
  if (!publicKey || !privateKey || !contact) return null;
  const subject = /^(mailto:|https:\/\/)/.test(contact) ? contact : `mailto:${contact}`;
  return { publicKey, privateKey, subject };
};

const isWebPushConfigured = () => Boolean(getWebPushConfig());
const getWebPushPublicKey = () => getWebPushConfig()?.publicKey || null;

const getStoredPushDevices = (preferences) => {
  const devices = Array.isArray(preferences?.pushDevices) ? preferences.pushDevices : [];
  return devices.filter((device) => device && typeof device.token === 'string');
};

const shouldUseDeviceForTenant = (device, tenantId) =>
  !tenantId || !device.tenantId || device.tenantId === tenantId;

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const toExpoPriority = (priority) => (priority === 'high' ? 'high' : 'default');

const buildExpoMessage = ({ token, title, message, data = {}, priority = 'normal' }) => ({
  to: token,
  sound: 'default',
  title,
  body: message || '',
  priority: toExpoPriority(priority),
  data
});

async function removeInvalidUserPushTokens(invalidTokensByUserId) {
  const entries = Array.from(invalidTokensByUserId.entries()).filter(([, tokens]) => tokens.size > 0);
  if (entries.length === 0) return;

  await Promise.all(entries.map(async ([userId, invalidTokens]) => {
    const user = await User.scope(null).findByPk(userId, {
      attributes: ['id', 'notificationPreferences']
    });
    if (!user) return;

    const preferences = user.notificationPreferences && typeof user.notificationPreferences === 'object'
      ? { ...user.notificationPreferences }
      : {};
    const nextDevices = getStoredPushDevices(preferences)
      .filter((device) => !invalidTokens.has(device.token))
      .slice(0, MAX_STORED_PUSH_DEVICES);

    if (nextDevices.length !== getStoredPushDevices(preferences).length) {
      await user.update({
        notificationPreferences: {
          ...preferences,
          pushDevices: nextDevices
        }
      });
    }
  }));
}

const getStorefrontCustomerMetadata = (customer) => (
  customer?.metadata && typeof customer.metadata === 'object' && !Array.isArray(customer.metadata)
    ? { ...customer.metadata }
    : {}
);

const getStorefrontNotificationPreferences = (customer) => {
  const metadata = getStorefrontCustomerMetadata(customer);
  return metadata.notificationPreferences && typeof metadata.notificationPreferences === 'object'
    ? metadata.notificationPreferences
    : {};
};

const isStorefrontOrderUpdatesEnabled = (customer) => (
  getStorefrontNotificationPreferences(customer).orderUpdates !== false
);

async function removeInvalidStorefrontCustomerPushTokens(invalidTokensByCustomerId) {
  const entries = Array.from(invalidTokensByCustomerId.entries()).filter(([, tokens]) => tokens.size > 0);
  if (entries.length === 0) return;

  await Promise.all(entries.map(async ([customerId, invalidTokens]) => {
    const customer = await StorefrontCustomer.findByPk(customerId, {
      attributes: ['id', 'metadata']
    });
    if (!customer) return;

    const metadata = getStorefrontCustomerMetadata(customer);
    const nextDevices = getStoredPushDevices(metadata)
      .filter((device) => !invalidTokens.has(device.token))
      .slice(0, MAX_STORED_PUSH_DEVICES);

    if (nextDevices.length !== getStoredPushDevices(metadata).length) {
      await customer.update({
        metadata: {
          ...metadata,
          pushDevices: nextDevices
        }
      });
    }
  }));
}

/**
 * Push devices of users who allow push for this category, for the given tenant, de-duplicated.
 * @param {{ userIds: string[], tenantId?: string, category?: string, accept: (device: object) => boolean }} args
 * @returns {Promise<Array<{ userId: string, device: object }>>}
 */
async function collectUserPushDevices({ userIds, tenantId, category, accept }) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueUserIds.length === 0) return [];

  const users = await User.scope(null).findAll({
    where: { id: uniqueUserIds },
    attributes: ['id', 'notificationPreferences']
  });

  const seenTokens = new Set();
  const devices = [];
  for (const user of users) {
    const preferences = mergeNotificationPreferences(user.notificationPreferences);
    const gatedCategory = normalizeNotificationCategory(category);
    if (
      gatedCategory &&
      !isNotificationChannelEnabled(preferences, gatedCategory, 'push')
    ) {
      continue;
    }

    for (const device of getStoredPushDevices(user.notificationPreferences)) {
      if (!shouldUseDeviceForTenant(device, tenantId) || !accept(device)) {
        continue;
      }
      if (seenTokens.has(device.token)) {
        continue;
      }
      seenTokens.add(device.token);
      devices.push({ userId: user.id, device });
    }
  }

  return devices;
}

async function getPushTargetsForUsers({ userIds, tenantId, category }) {
  const devices = await collectUserPushDevices({
    userIds,
    tenantId,
    category,
    accept: (device) => isExpoPushToken(device.token),
  });
  return devices.map(({ userId, device }) => ({ userId, token: device.token }));
}

async function getWebPushTargetsForUsers({ userIds, tenantId, category }) {
  const devices = await collectUserPushDevices({ userIds, tenantId, category, accept: isWebPushDevice });
  return devices.map(({ userId, device }) => ({
    ownerId: userId,
    token: device.token,
    subscription: device.subscription,
  }));
}

async function getPushTargetsForStorefrontCustomers({ storefrontCustomerIds }) {
  const uniqueCustomerIds = [...new Set((storefrontCustomerIds || []).filter(Boolean))];
  if (uniqueCustomerIds.length === 0) return [];

  const customers = await StorefrontCustomer.findAll({
    where: { id: uniqueCustomerIds },
    attributes: ['id', 'metadata']
  });

  const seenTokens = new Set();
  const targets = [];
  for (const customer of customers) {
    if (!isStorefrontOrderUpdatesEnabled(customer)) {
      continue;
    }

    const metadata = getStorefrontCustomerMetadata(customer);
    for (const device of getStoredPushDevices(metadata)) {
      if (!isExpoPushToken(device.token)) {
        continue;
      }
      if (seenTokens.has(device.token)) {
        continue;
      }
      seenTokens.add(device.token);
      targets.push({ ownerId: customer.id, token: device.token });
    }
  }

  return targets;
}

async function dispatchExpoPushToTargets({
  targets,
  tenantId,
  title,
  message,
  type = 'info',
  priority = 'normal',
  metadata = {},
  link = null,
  removeInvalidTokens
}) {
  if (!title || !Array.isArray(targets) || targets.length === 0) {
    return { sent: 0, attempted: 0, invalidTokens: 0 };
  }

  const invalidTokensByOwnerId = new Map();
  let sent = 0;

  for (const targetChunk of chunk(targets, EXPO_PUSH_CHUNK_SIZE)) {
    const messages = targetChunk.map((target) => buildExpoMessage({
      token: target.token,
      title,
      message,
      priority,
      data: {
        type,
        tenantId,
        link,
        orderId: metadata?.orderId || metadata?.saleId,
        saleId: metadata?.saleId,
        metadata
      }
    }));

    try {
      const response = await axios.post(EXPO_PUSH_URL, messages, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      const receipts = Array.isArray(response.data?.data) ? response.data.data : [];
      receipts.forEach((receipt, index) => {
        const target = targetChunk[index];
        if (!target) return;
        if (receipt?.status === 'ok') {
          sent += 1;
          return;
        }
        if (receipt?.details?.error === 'DeviceNotRegistered') {
          const tokens = invalidTokensByOwnerId.get(target.ownerId) || new Set();
          tokens.add(target.token);
          invalidTokensByOwnerId.set(target.ownerId, tokens);
        }
      });
    } catch (error) {
      console.error(`${logPrefix} Expo push request failed`, {
        attempted: targetChunk.length,
        error: error.message
      });
    }
  }

  await removeInvalidTokens(invalidTokensByOwnerId);

  return {
    sent,
    attempted: targets.length,
    invalidTokens: Array.from(invalidTokensByOwnerId.values()).reduce(
      (total, tokens) => total + tokens.size,
      0
    )
  };
}

/**
 * Send to browser subscriptions (web app on phones/tablets/desktops, installed or not).
 * Expired subscriptions are removed; nothing is sent until VAPID keys are configured.
 */
async function dispatchWebPushToTargets({
  targets,
  tenantId,
  title,
  message,
  type = 'info',
  priority = 'normal',
  metadata = {},
  link = null,
  removeInvalidTokens
}) {
  const config = getWebPushConfig();
  if (!config || !title || !Array.isArray(targets) || targets.length === 0) {
    return { sent: 0, attempted: 0, invalidTokens: 0 };
  }

  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (error) {
    console.error(`${logPrefix} Web push VAPID settings are invalid`, { error: error.message });
    return { sent: 0, attempted: 0, invalidTokens: 0 };
  }

  const payload = JSON.stringify({
    title,
    body: message || '',
    // In-app path opened when the notification is tapped (the service worker only opens same-site paths).
    url: typeof link === 'string' && link.startsWith('/') ? link : '/dashboard',
    tag: metadata?.saleId || metadata?.orderId || type,
    data: {
      type,
      tenantId,
      orderId: metadata?.orderId || metadata?.saleId,
      saleId: metadata?.saleId,
    },
  });
  const options = { TTL: WEB_PUSH_TTL_SECONDS, urgency: priority === 'high' ? 'high' : 'normal' };

  const invalidTokensByOwnerId = new Map();
  let sent = 0;
  for (const targetChunk of chunk(targets, WEB_PUSH_CONCURRENCY)) {
    const results = await Promise.allSettled(
      targetChunk.map((target) => webpush.sendNotification(target.subscription, payload, options))
    );
    results.forEach((result, index) => {
      const target = targetChunk[index];
      if (result.status === 'fulfilled') {
        sent += 1;
        return;
      }
      if (EXPIRED_WEB_PUSH_STATUS.has(result.reason?.statusCode)) {
        const tokens = invalidTokensByOwnerId.get(target.ownerId) || new Set();
        tokens.add(target.token);
        invalidTokensByOwnerId.set(target.ownerId, tokens);
        return;
      }
      console.error(`${logPrefix} Web push failed`, {
        statusCode: result.reason?.statusCode,
        error: result.reason?.message,
      });
    });
  }

  await removeInvalidTokens(invalidTokensByOwnerId);

  return {
    sent,
    attempted: targets.length,
    invalidTokens: Array.from(invalidTokensByOwnerId.values()).reduce(
      (total, tokens) => total + tokens.size,
      0
    )
  };
}

async function dispatchExpoPushToUsers({
  tenantId,
  userIds,
  title,
  message,
  type = 'info',
  priority = 'normal',
  metadata = {},
  link = null
}) {
  if (!title || !Array.isArray(userIds) || userIds.length === 0) {
    return { sent: 0, attempted: 0, invalidTokens: 0 };
  }

  const targets = (await getPushTargetsForUsers({ userIds, tenantId, category: type }))
    .map((target) => ({ ownerId: target.userId, token: target.token }));
  const expo = await dispatchExpoPushToTargets({
    targets,
    tenantId,
    title,
    message,
    type,
    priority,
    metadata,
    link,
    removeInvalidTokens: removeInvalidUserPushTokens
  });

  // The same notification reaches the web app (browsers / installed PWA) when web push is set up.
  if (!isWebPushConfigured()) return expo;
  const web = await dispatchWebPushToTargets({
    targets: await getWebPushTargetsForUsers({ userIds, tenantId, category: type }),
    tenantId,
    title,
    message,
    type,
    priority,
    metadata,
    link,
    removeInvalidTokens: removeInvalidUserPushTokens
  });
  return {
    sent: expo.sent + web.sent,
    attempted: expo.attempted + web.attempted,
    invalidTokens: expo.invalidTokens + web.invalidTokens
  };
}

async function dispatchExpoPushToStorefrontCustomers({
  tenantId,
  storefrontCustomerIds,
  title,
  message,
  type = 'order_update',
  priority = 'normal',
  metadata = {},
  link = null
}) {
  if (!title || !Array.isArray(storefrontCustomerIds) || storefrontCustomerIds.length === 0) {
    return { sent: 0, attempted: 0, invalidTokens: 0 };
  }

  const targets = await getPushTargetsForStorefrontCustomers({ storefrontCustomerIds });
  return dispatchExpoPushToTargets({
    targets,
    tenantId,
    title,
    message,
    type,
    priority,
    metadata,
    link,
    removeInvalidTokens: removeInvalidStorefrontCustomerPushTokens
  });
}

module.exports = {
  dispatchExpoPushToUsers,
  dispatchExpoPushToStorefrontCustomers,
  getPushTargetsForStorefrontCustomers,
  getPushTargetsForUsers,
  getWebPushTargetsForUsers,
  getWebPushPublicKey,
  isExpoPushToken,
  isWebPushConfigured,
  isWebPushDevice
};
