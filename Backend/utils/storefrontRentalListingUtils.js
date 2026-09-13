/**
 * Public Online Store rental listing helpers (P2-01).
 * Maps Product rental fields onto storefront product payloads.
 */

const normalizeMoney = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
};

const compactTerms = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

/**
 * Resolve rentable / salable flags and listing mode for a storefront product.
 * @param {object|null|undefined} product
 * @returns {{ isRentable: boolean, isSalable: boolean, listingMode: 'sale'|'rent'|'both' }}
 */
const resolveListingCommerceMode = (product) => {
  if (!product) {
    return { isRentable: false, isSalable: true, listingMode: 'sale' };
  }
  const isRentable = product.isRentable !== false;
  const isSalable = product.isSalable !== false;
  let listingMode = 'sale';
  if (isRentable && !isSalable) listingMode = 'rent';
  else if (isRentable && isSalable) listingMode = 'both';
  return { isRentable, isSalable, listingMode };
};

/**
 * Resolve per-day rental rate from product or listing price fields.
 * @param {object|null|undefined} product
 * @param {object|null|undefined} listing
 * @returns {number|null}
 */
const resolveRentalRatePerDay = (product, listing = null) => {
  const fromProduct = product?.rentalRatePerDay;
  if (fromProduct != null && Number.parseFloat(fromProduct) > 0) {
    return normalizeMoney(fromProduct, 0);
  }
  const listingMeta = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  if (listingMeta.rentalRatePerDay != null && Number.parseFloat(listingMeta.rentalRatePerDay) > 0) {
    return normalizeMoney(listingMeta.rentalRatePerDay, 0);
  }
  const { listingMode } = resolveListingCommerceMode(product);
  if (listingMode === 'rent' && listing?.publicPrice != null && Number.parseFloat(listing.publicPrice) > 0) {
    return normalizeMoney(listing.publicPrice, 0);
  }
  return null;
};

/**
 * Resolve rental terms text for a listing (product metadata first, then listing metadata).
 * @param {object|null|undefined} product
 * @param {object|null|undefined} listing
 * @param {string|null|undefined} storeRentalTerms
 * @returns {string|null}
 */
const resolveRentalTerms = (product, listing = null, storeRentalTerms = null) => {
  const productMeta = product?.metadata && typeof product.metadata === 'object' ? product.metadata : {};
  const listingMeta = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  return compactTerms(productMeta.rentalTerms)
    || compactTerms(listingMeta.rentalTerms)
    || compactTerms(storeRentalTerms)
    || null;
};

/**
 * Build rental fields for public storefront product payloads.
 * @param {object|null|undefined} product
 * @param {object|null|undefined} listing
 * @param {{ storeRentalTerms?: string|null }} [options]
 * @returns {object}
 */
const buildPublicRentalListingFields = (product, listing = null, { storeRentalTerms = null } = {}) => {
  const { isRentable, isSalable, listingMode } = resolveListingCommerceMode(product);
  const rentalRatePerDay = isRentable ? resolveRentalRatePerDay(product, listing) : null;
  const rentalTerms = isRentable
    ? resolveRentalTerms(product, listing, storeRentalTerms)
    : null;

  return {
    isRentable,
    isSalable,
    listingMode,
    rentalRatePerDay,
    rentalTerms,
  };
};

/**
 * Human-readable org-level rental policy bullets for store pages.
 * @param {object} settings
 * @returns {string[]}
 */
const buildPublicRentalPolicySummary = (settings = {}) => {
  const bullets = [];
  if (settings.defaultDepositPercent != null && Number(settings.defaultDepositPercent) > 0) {
    bullets.push(`Security deposit: ${Number(settings.defaultDepositPercent)}% of rental total`);
  } else if (settings.defaultDepositAmount != null && Number(settings.defaultDepositAmount) > 0) {
    bullets.push('Security deposit required at pickup');
  }
  if (settings.lateChargeRatePercent != null && Number(settings.lateChargeRatePercent) > 0) {
    const graceValue = Number(settings.gracePeriodValue ?? 0);
    const graceUnit = settings.gracePeriodUnit === 'days' ? 'days' : 'hours';
    const graceLabel = graceValue > 0
      ? ` after ${graceValue} ${graceUnit} grace period`
      : '';
    bullets.push(`Late return fee: ${Number(settings.lateChargeRatePercent)}% of daily rate per day${graceLabel}`);
  }
  if (settings.dayBillingMode === 'overnight') {
    bullets.push('A rental day is overnight (return the next day)');
  } else if (settings.dayBillingMode === 'end_of_day') {
    bullets.push('A rental day is calendar end of day (same-day return = 1 day)');
  }
  if (settings.requireIdVerification) {
    bullets.push('Valid ID required for rental pickup');
  }
  if (settings.preBookingExpiryDays != null && Number(settings.preBookingExpiryDays) > 0) {
    bullets.push(`Booking requests expire after ${Number(settings.preBookingExpiryDays)} days if unpaid`);
  }
  return bullets;
};

/**
 * Resolve listing publicPrice when syncing from inventory product.
 * @param {object} body
 * @param {object|null|undefined} product
 * @returns {number}
 */
const resolveListingPublicPriceFromProduct = (body, product = null) => {
  if (body.publicPrice !== undefined && body.publicPrice !== null && body.publicPrice !== '') {
    return normalizeMoney(body.publicPrice, 0);
  }
  const { isRentable, isSalable, listingMode } = resolveListingCommerceMode(product);
  if (isRentable && listingMode === 'rent') {
    const rentalRate = resolveRentalRatePerDay(product);
    if (rentalRate > 0) return rentalRate;
  }
  if (isRentable && isSalable && product?.rentalRatePerDay != null && Number.parseFloat(product.rentalRatePerDay) > 0) {
    return normalizeMoney(product.rentalRatePerDay, 0);
  }
  return normalizeMoney(product?.sellingPrice, 0);
};

/**
 * Build product create payload fields for admin/store sample seeding.
 * @param {object} sample
 * @param {{ businessType?: string|null }} [options]
 * @returns {{ isRentable: boolean, isSalable: boolean, rentalRatePerDay: number|null, sellingPrice: number, metadata: object }}
 */
const buildSampleProductRentalFields = (sample, { businessType = null } = {}) => {
  const isRentalTenant = businessType === 'rental';
  const publicPrice = normalizeMoney(sample.publicPrice, 0);
  const isRentable = sample.isRentable != null ? sample.isRentable !== false : isRentalTenant;
  const isSalable = sample.isSalable != null ? sample.isSalable !== false : !isRentalTenant;
  const rentalRatePerDay = isRentable
    ? normalizeMoney(sample.rentalRatePerDay ?? publicPrice, 0)
    : null;
  const sellingPrice = isSalable ? publicPrice : 0;
  const metadata = {
    ...(sample.rentalTerms ? { rentalTerms: compactTerms(sample.rentalTerms) } : {}),
  };
  return {
    isRentable,
    isSalable,
    rentalRatePerDay,
    sellingPrice,
    metadata,
  };
};

module.exports = {
  normalizeMoney,
  resolveListingCommerceMode,
  resolveRentalRatePerDay,
  resolveRentalTerms,
  buildPublicRentalListingFields,
  buildPublicRentalPolicySummary,
  resolveListingPublicPriceFromProduct,
  buildSampleProductRentalFields,
};
