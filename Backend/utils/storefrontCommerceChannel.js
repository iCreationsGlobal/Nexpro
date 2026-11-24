/**
 * Commerce channel helpers for Online Store vs Sabito marketplace.
 * Keep sale.metadata.source = 'online_store' for legacy shopper-order queries;
 * use metadata.commerceChannel to fork settlement and merchant UIs.
 */

const SALE_SOURCE = 'online_store';

const COMMERCE_CHANNELS = Object.freeze({
  ONLINE_STORE: 'online_store',
  SABITO_MARKETPLACE: 'sabito_marketplace',
});

const PAYSTACK_ORDER_TYPES = Object.freeze({
  ONLINE_STORE: 'online_store_order',
  SABITO_MARKETPLACE: 'storefront_order',
});

/**
 * @param {unknown} value
 * @returns {'online_store'|'sabito_marketplace'}
 */
function normalizeCommerceChannel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (
    raw === COMMERCE_CHANNELS.SABITO_MARKETPLACE
    || raw === 'sabito'
    || raw === 'marketplace'
  ) {
    return COMMERCE_CHANNELS.SABITO_MARKETPLACE;
  }
  return COMMERCE_CHANNELS.ONLINE_STORE;
}

/**
 * Resolve channel from checkout body, headers, or request host.
 * @param {import('express').Request} req
 * @param {object} [body]
 * @returns {'online_store'|'sabito_marketplace'}
 */
function resolveCommerceChannelFromRequest(req, body = {}) {
  const fromBody = body.commerceChannel || body.channel || body.storefrontChannel;
  if (fromBody) return normalizeCommerceChannel(fromBody);

  const header = req?.headers?.['x-storefront-channel'] || req?.headers?.['x-commerce-channel'];
  if (header) return normalizeCommerceChannel(header);

  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').toLowerCase();
  const onlineStoreHost = String(process.env.ONLINE_STORE_URL || process.env.VITE_ONLINE_STORE_URL || 'store.absghana.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();
  const sabitoHost = String(
    process.env.STOREFRONT_URL || process.env.SABITO_STOREFRONT_URL || process.env.VITE_STOREFRONT_URL || ''
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase();

  if (onlineStoreHost && host.includes(onlineStoreHost.split(':')[0])) {
    return COMMERCE_CHANNELS.ONLINE_STORE;
  }
  if (sabitoHost && host.includes(sabitoHost.split(':')[0])) {
    return COMMERCE_CHANNELS.SABITO_MARKETPLACE;
  }

  // Default: ABS Online Store (direct-pay) when ambiguous
  return COMMERCE_CHANNELS.ONLINE_STORE;
}

/**
 * Whether the request itself says it is an Online Store checkout. The Sabito apps do not name a channel and
 * fall back to the Online Store above, so behavior meant only for Online Stores must use this instead.
 * @param {import('express').Request} req
 * @param {object} [body]
 * @returns {boolean}
 */
function isExplicitOnlineStoreRequest(req, body = {}) {
  const named = body.commerceChannel || body.channel || body.storefrontChannel
    || req?.headers?.['x-storefront-channel'] || req?.headers?.['x-commerce-channel'];
  return String(named || '').trim().toLowerCase() === COMMERCE_CHANNELS.ONLINE_STORE;
}

/**
 * @param {'online_store'|'sabito_marketplace'} channel
 * @returns {boolean}
 */
function usesTradeAssurance(channel) {
  return normalizeCommerceChannel(channel) === COMMERCE_CHANNELS.SABITO_MARKETPLACE;
}

/**
 * @param {'online_store'|'sabito_marketplace'} channel
 * @returns {string}
 */
function paystackOrderTypeForChannel(channel) {
  return usesTradeAssurance(channel)
    ? PAYSTACK_ORDER_TYPES.SABITO_MARKETPLACE
    : PAYSTACK_ORDER_TYPES.ONLINE_STORE;
}

/**
 * @param {object|null|undefined} metadata
 * @returns {'online_store'|'sabito_marketplace'}
 */
function getSaleCommerceChannel(metadata = {}) {
  if (metadata?.commerceChannel) {
    return normalizeCommerceChannel(metadata.commerceChannel);
  }
  // Legacy held marketplace payments
  if (metadata?.tradeAssurance?.marketplacePaymentId || metadata?.tradeAssurance?.paymentStatus === 'paid_held') {
    return COMMERCE_CHANNELS.SABITO_MARKETPLACE;
  }
  return COMMERCE_CHANNELS.ONLINE_STORE;
}

/**
 * Public base URL for Paystack callbacks / shopper emails by channel.
 * @param {'online_store'|'sabito_marketplace'} channel
 * @returns {string}
 */
function getStorefrontPublicBaseUrl(channel) {
  const sabito = (
    process.env.STOREFRONT_URL
    || process.env.SABITO_STOREFRONT_URL
    || process.env.FRONTEND_URL
    || 'http://localhost:5173'
  ).replace(/\/$/, '');

  const online = (
    process.env.ONLINE_STORE_URL
    || process.env.VITE_ONLINE_STORE_URL
    || sabito
  ).replace(/\/$/, '');

  return usesTradeAssurance(channel) ? sabito : online;
}

module.exports = {
  SALE_SOURCE,
  COMMERCE_CHANNELS,
  PAYSTACK_ORDER_TYPES,
  normalizeCommerceChannel,
  isExplicitOnlineStoreRequest,
  resolveCommerceChannelFromRequest,
  usesTradeAssurance,
  paystackOrderTypeForChannel,
  getSaleCommerceChannel,
  getStorefrontPublicBaseUrl,
};
