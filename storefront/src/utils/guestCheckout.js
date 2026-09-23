/**
 * Guest (no-account) checkout keeps a per-order access token in the browser.
 * localStorage (not sessionStorage) because Paystack can return in a new tab on mobile.
 */
const PENDING_KEY = 'sabito_guest_checkout_pending';
const ORDERS_KEY = 'sabito_guest_orders';
const MAX_REMEMBERED_ORDERS = 20;

const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the order can still be found via Track Order.
  }
};

export const saveGuestCheckoutPending = ({ orderId, token }) => {
  if (!orderId || !token) return;
  writeJson(PENDING_KEY, { orderId, token });
};

export const readGuestCheckoutPending = () => readJson(PENDING_KEY, null);

export const clearGuestCheckoutPending = () => {
  try {
    window.localStorage?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
};

export const rememberGuestOrder = (orderId, token) => {
  if (!orderId || !token) return;
  const orders = readJson(ORDERS_KEY, {});
  const next = { ...orders, [orderId]: token };
  const ids = Object.keys(next);
  if (ids.length > MAX_REMEMBERED_ORDERS) {
    ids.slice(0, ids.length - MAX_REMEMBERED_ORDERS).forEach((id) => delete next[id]);
  }
  writeJson(ORDERS_KEY, next);
};

export const getGuestOrderToken = (orderId) => {
  if (!orderId) return null;
  return readJson(ORDERS_KEY, {})[orderId] || null;
};
