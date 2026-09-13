/**
 * Storefront helpers for rental vs sale product listings (P2-01).
 */

/**
 * @param {object|null|undefined} product
 * @returns {'sale'|'rent'|'both'}
 */
export const getListingMode = (product) => {
  const mode = String(product?.listingMode || '').trim().toLowerCase();
  if (mode === 'rent' || mode === 'both' || mode === 'sale') return mode;
  const isRentable = product?.isRentable === true;
  const isSalable = product?.isSalable !== false;
  if (isRentable && !isSalable) return 'rent';
  if (isRentable && isSalable) return 'both';
  return 'sale';
};

/** @param {object|null|undefined} product */
export const isRentOnlyListing = (product) => getListingMode(product) === 'rent';

/** @param {object|null|undefined} product */
export const isRentableListing = (product) => {
  const mode = getListingMode(product);
  return mode === 'rent' || mode === 'both';
};

/** @param {object|null|undefined} product */
export const isSalableListing = (product) => {
  const mode = getListingMode(product);
  return mode === 'sale' || mode === 'both';
};

/**
 * Primary price line for product cards and PDP headers.
 * @param {object|null|undefined} product
 * @returns {{ amount: number|null, suffix: string|null, label: string|null, secondaryAmount: number|null, secondarySuffix: string|null }}
 */
export const getProductPriceDisplay = (product) => {
  const mode = getListingMode(product);
  const rentalRate = Number.parseFloat(product?.rentalRatePerDay ?? 0);
  const salePrice = Number.parseFloat(product?.salePrice ?? product?.publicPrice ?? 0);

  if (mode === 'rent' && rentalRate > 0) {
    return {
      amount: rentalRate,
      suffix: '/day',
      label: 'Rental rate',
      secondaryAmount: null,
      secondarySuffix: null,
    };
  }

  if (mode === 'both' && rentalRate > 0) {
    return {
      amount: salePrice > 0 ? salePrice : rentalRate,
      suffix: salePrice > 0 ? null : '/day',
      label: salePrice > 0 ? 'Buy' : 'Rental rate',
      secondaryAmount: rentalRate,
      secondarySuffix: '/day',
    };
  }

  return {
    amount: salePrice > 0 ? salePrice : null,
    suffix: null,
    label: null,
    secondaryAmount: null,
    secondarySuffix: null,
  };
};

/**
 * Badge labels for rentable vs salable on product cards.
 * @param {object|null|undefined} product
 * @returns {string[]}
 */
export const getListingCommerceBadges = (product) => {
  const mode = getListingMode(product);
  if (mode === 'rent') return ['For rent'];
  if (mode === 'both') return ['For rent', 'For sale'];
  return ['For sale'];
};

/**
 * Filter purchase CTAs for rent-only listings (checkout remains sale-only in P2-01).
 * @param {string[]} actions
 * @param {object|null|undefined} product
 * @returns {string[]}
 */
export const filterProductCardActionsForListing = (actions, product) => {
  if (!isRentOnlyListing(product)) return actions;
  return actions.filter((action) => action !== 'add_to_cart' && action !== 'buy_now');
};
