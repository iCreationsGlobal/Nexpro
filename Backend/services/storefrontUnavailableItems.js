const { notifyOnlineStoreItemsUnavailable } = require('./notificationService');

/** An alert must not hold up the shopper; after this long they are told to contact the store instead. */
const ALERT_TIMEOUT_MS = 5000;

/**
 * Whether stock cannot cover an order line. Products that do not track stock never run short.
 * @param {{ available: boolean, quantityOnHand?: number, trackStock?: boolean }} availability
 * @param {number} quantity
 */
const isShortOfStock = (availability, quantity) => (
  !availability.available || (availability.trackStock !== false && availability.quantityOnHand < quantity)
);

/**
 * Thrown when an Online Store order cannot be filled. The caller rolls back, then tells the store.
 * @param {object} store
 * @param {Array<{ listingId: string, title: string, requested: number, left: number }>} items
 */
const buildItemsUnavailableError = (store, items) => {
  const error = new Error(unavailableItemsMessage(items, false));
  error.statusCode = 409;
  error.errorCode = 'STOREFRONT_ITEMS_UNAVAILABLE';
  error.unavailable = { store, items };
  return error;
};

/** What the shopper reads. */
const unavailableItemsMessage = (items, storeWasTold) => {
  const after = storeWasTold ? "We've told the store." : 'Please contact the store.';
  if (items.length > 1) {
    const names = items.map(({ title, left }) => (left > 0 ? `${title} (only ${left} left)` : title)).join(', ');
    return `These items aren't available right now: ${names}. ${after}`;
  }
  const [{ title, left }] = items;
  return left > 0
    ? `Only ${left} of ${title} ${left === 1 ? 'is' : 'are'} available right now. ${after}`
    : `${title} isn't available right now. ${after}`;
};

/**
 * Tell the store someone tried to buy what it does not have.
 * @returns {Promise<boolean>} whether the store has been told
 */
const tellStore = async ({ store, items, shopper, phone }) => {
  let timer;
  try {
    return await Promise.race([
      notifyOnlineStoreItemsUnavailable({ store, items, shopper, phone }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), ALERT_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    console.error('[Storefront] Failed to tell the store about unavailable items', error.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { buildItemsUnavailableError, isShortOfStock, tellStore, unavailableItemsMessage };
