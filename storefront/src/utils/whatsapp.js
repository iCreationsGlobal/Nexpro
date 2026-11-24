/**
 * Shared WhatsApp (wa.me) helpers for Online Store click-to-chat CTAs.
 */

/**
 * Strip a phone value to digits only for wa.me links.
 * @param {unknown} value
 * @returns {string}
 */
export const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');

/**
 * Prefer store WhatsApp number, fall back to contact phone.
 * @param {{ whatsappNumber?: string|null, contactPhone?: string|null }|null|undefined} store
 * @returns {string}
 */
export const resolveStoreWhatsAppPhone = (store) => (
  normalizePhone(store?.whatsappNumber || store?.contactPhone)
);

/**
 * Build a prefilled wa.me href. Returns '' when no phone is available.
 * @param {string} phoneDigits
 * @param {string} message
 * @returns {string}
 */
export const buildWhatsAppHref = (phoneDigits, message) => {
  const phone = normalizePhone(phoneDigits);
  if (!phone) return '';
  const text = String(message || '').trim();
  if (!text) return `https://wa.me/${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

/**
 * Build a store click-to-chat href from store contact fields.
 * @param {{ whatsappNumber?: string|null, contactPhone?: string|null, displayName?: string|null }|null|undefined} store
 * @param {string} message
 * @returns {string}
 */
export const buildStoreWhatsAppHref = (store, message) => (
  buildWhatsAppHref(resolveStoreWhatsAppPhone(store), message)
);

/**
 * Prefill: general store contact.
 * @param {string} [storeName]
 * @returns {string}
 */
export const whatsappContactMessage = (storeName) => (
  `Hi, I would like to contact ${storeName || 'your store'}.`
);

/**
 * General "Contact us" link: WhatsApp, else email, else ''.
 * @param {{ whatsappNumber?: string|null, contactPhone?: string|null, contactEmail?: string|null, displayName?: string|null }|null|undefined} store
 * @returns {string}
 */
export const buildStoreContactHref = (store) => {
  const whatsappHref = buildStoreWhatsAppHref(store, whatsappContactMessage(store?.displayName));
  if (whatsappHref) return whatsappHref;
  const email = String(store?.contactEmail || '').trim();
  return email ? `mailto:${email}` : '';
};

/**
 * Prefill: product interest (matches product page patterns).
 * @param {{ title?: string }|null|undefined} product
 * @param {string} [storeName]
 * @param {{ available?: boolean }} [options]
 * @returns {string}
 */
export const whatsappProductInterestMessage = (product, storeName, { available = true } = {}) => {
  const interest = available ? 'interested in' : 'asking about restocking';
  return `Hi, I am ${interest} ${product?.title || 'a product'} from ${storeName || 'your store'}.`;
};

/**
 * Prefill: price inquiry ("Contact for price").
 * @param {{ title?: string }|null|undefined} product
 * @param {string} [storeName]
 * @returns {string}
 */
export const whatsappPriceInquiryMessage = (product, storeName) => (
  `Hi, I would like to know the price of ${product?.title || 'a product'} from ${storeName || 'your store'}.`
);

/**
 * Prefill: cart / delivery question.
 * @param {string} [storeName]
 * @returns {string}
 */
export const whatsappCartMessage = (storeName) => (
  `Hi, I have a question about delivery/order from ${storeName || 'your store'}.`
);

/**
 * Prefill: checkout question.
 * @param {string} [storeName]
 * @returns {string}
 */
export const whatsappCheckoutMessage = (storeName) => (
  `Hi, I have a question about my order/delivery at ${storeName || 'your store'}.`
);

/**
 * Prefill: placed order follow-up.
 * @param {string} [orderNumber]
 * @param {string} [storeName]
 * @returns {string}
 */
export const whatsappOrderMessage = (orderNumber, storeName) => {
  const orderLabel = orderNumber ? `I ordered ${orderNumber}` : 'I placed an order';
  return `Hi, ${orderLabel} from ${storeName || 'your store'}.`;
};
