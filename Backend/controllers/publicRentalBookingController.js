const { Op } = require('sequelize');
const {
  OnlineStoreSettings,
  OnlineProductListing,
  Product,
  Customer,
  PreBooking,
  PreBookingItem,
} = require('../models');
const {
  assertItemsAvailable,
  calculateRentalTotals,
  checkRentalAvailability,
} = require('../services/rentalAvailabilityService');
const {
  resolveListingCommerceMode,
  resolveRentalRatePerDay,
} = require('../utils/storefrontRentalListingUtils');
const { ensureDefaultShop } = require('../utils/shopUtils');
const rentalNotificationService = require('../services/rentalNotificationService');
const { tenantHasEffectiveFeature } = require('../utils/storeTenantEntitlements');
const { getRentalSettings } = require('../services/rentalSettingsService');

const normalizeSlug = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'store'
);

const compact = (value, maxLen = 500) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const normalizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
};

const rejectAvailabilityError = (res, error) => res.status(error.statusCode || 400).json({
  success: false,
  message: error.message,
  errorCode: error.code || 'INSUFFICIENT_RENTAL_STOCK',
  details: error.details || [],
});

const listingIsSampleProduct = (listing) => {
  const metadata = listing?.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
  if (metadata.isSample === true) return true;
  const productMeta = listing?.product?.metadata && typeof listing.product.metadata === 'object'
    ? listing.product.metadata
    : {};
  return productMeta.isSample === true;
};

/**
 * Find or create a tenant customer record for a guest storefront rental request.
 * @param {object} params
 * @returns {Promise<object>}
 */
const findOrCreateGuestCustomer = async ({ tenantId, shopId, name, phone, email }) => {
  const contactFilters = [];
  if (phone) contactFilters.push({ phone });
  if (email) contactFilters.push({ email });
  if (!contactFilters.length) {
    const err = new Error('Phone number is required');
    err.statusCode = 400;
    throw err;
  }

  const where = {
    tenantId,
    ...(shopId ? { shopId } : {}),
    [Op.or]: contactFilters,
  };

  const existing = await Customer.findOne({ where });
  if (existing) {
    const updates = {};
    if (name && !existing.name) updates.name = name;
    if (email && !existing.email) updates.email = email;
    if (phone && !existing.phone) updates.phone = phone;
    return Object.keys(updates).length ? existing.update(updates) : existing;
  }

  return Customer.create({
    tenantId,
    shopId: shopId || null,
    name,
    email,
    phone,
    sabitoSourceType: 'direct',
    notes: 'Created from public storefront rental booking request.',
    metadata: { source: 'public_storefront' },
  });
};

const resolveStoreBranchId = async (store) => {
  if (store.shopId) return store.shopId;
  const defaultShop = await ensureDefaultShop(store.tenantId, {
    name: store.displayName || 'Main location',
  });
  return defaultShop?.id || null;
};

const assertStoreRentalsEnabled = async (store, res) => {
  const rentalsEnabled = await tenantHasEffectiveFeature(store.tenantId, 'rentals');
  if (!rentalsEnabled) {
    res.status(403).json({
      success: false,
      message: 'Rental booking is not enabled for this store',
      errorCode: 'RENTALS_NOT_ENABLED',
    });
    return false;
  }
  return true;
};

const resolvePublishedListingProduct = async ({ store, listingId, productId }) => {
  if (listingId) {
    const listing = await OnlineProductListing.findOne({
      where: {
        id: listingId,
        tenantId: store.tenantId,
        status: 'published',
        ...(store.shopId ? { shopId: store.shopId } : {}),
      },
      include: [{
        model: Product,
        as: 'product',
        required: true,
        where: { isActive: true },
      }],
    });
    if (!listing) return null;
    return { listing, product: listing.product };
  }

  const product = await Product.findOne({
    where: { id: productId, tenantId: store.tenantId, isActive: true },
  });
  if (!product) return null;

  const listing = await OnlineProductListing.findOne({
    where: {
      productId: product.id,
      tenantId: store.tenantId,
      status: 'published',
      ...(store.shopId ? { shopId: store.shopId } : {}),
    },
  });
  if (!listing) return null;

  return { listing, product };
};

/**
 * Public storefront rental availability check (no auth).
 * Uses the same availability logic as staff-side checks.
 */
exports.getPublicRentalAvailability = async (req, res, next) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const store = await OnlineStoreSettings.findOne({
      where: { slug, enabled: true },
      attributes: ['id', 'tenantId', 'shopId', 'slug', 'displayName'],
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found or not launched' });
    }
    if (!(await assertStoreRentalsEnabled(store, res))) return;

    const listingId = compact(req.query.listingId || req.query.productListingId, 80);
    const productId = compact(req.query.productId, 80);
    const startDate = compact(req.query.startDate, 20);
    const endDate = compact(req.query.endDate, 20);
    const quantityRaw = req.query.quantity;
    const quantity = quantityRaw == null || quantityRaw === ''
      ? null
      : Math.max(1, Math.min(999, Number.parseInt(quantityRaw, 10) || 1));

    if (!listingId && !productId) {
      return res.status(400).json({ success: false, message: 'listingId or productId is required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'End date must be on or after start date' });
    }

    const resolved = await resolvePublishedListingProduct({
      store,
      listingId,
      productId,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'Product listing not found' });
    }

    const { listing, product } = resolved;

    if (listingIsSampleProduct(listing)) {
      return res.status(400).json({ success: false, message: 'Sample products cannot be booked' });
    }

    const { isRentable } = resolveListingCommerceMode(product);
    if (!isRentable) {
      return res.status(400).json({ success: false, message: 'This product is not available for rental' });
    }

    const branchId = await resolveStoreBranchId(store);
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'Store location is not configured' });
    }

    const availability = await checkRentalAvailability({
      tenantId: store.tenantId,
      productId: product.id,
      branchId,
      startDate,
      endDate,
    });

    const requestedRatePerDay = resolveRentalRatePerDay(product, listing) || 0;
    const effectiveQty = quantity ?? 1;
    const canFulfill = availability.isRentable
      && !availability.notFound
      && availability.availableQty >= effectiveQty;

    const data = {
      listingId: listing.id,
      productId: product.id,
      startDate,
      endDate,
      availableQty: availability.availableQty,
      totalQty: availability.totalQty,
      isRentable: availability.isRentable,
      overlaps: availability.overlaps,
      canFulfill,
    };

    if (quantity != null) {
      data.requestedQty = quantity;
    }

    if (requestedRatePerDay > 0) {
      const rentalSettings = await getRentalSettings(store.tenantId);
      const summary = calculateRentalTotals(
        [{ quantity: effectiveQty, rentalRatePerDay: requestedRatePerDay }],
        startDate,
        endDate,
        { dayBillingMode: rentalSettings.dayBillingMode },
      );
      data.rentalRatePerDay = requestedRatePerDay;
      data.days = summary.days;
      data.estimatedTotal = summary.total;
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * Public storefront rental booking request (no auth).
 * Creates a pending PreBooking for staff review — no payment in v1.
 */
exports.submitPublicRentalBookingRequest = async (req, res, next) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const store = await OnlineStoreSettings.findOne({
      where: { slug, enabled: true },
      attributes: ['id', 'tenantId', 'shopId', 'slug', 'displayName'],
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found or not launched' });
    }
    if (!(await assertStoreRentalsEnabled(store, res))) return;

    const listingId = compact(req.body.listingId || req.body.productListingId, 80);
    const name = compact(req.body.name, 160);
    const phone = compact(req.body.phone, 40);
    const email = normalizeEmail(req.body.email);
    const startDate = compact(req.body.startDate, 20);
    const endDate = compact(req.body.endDate, 20);
    const quantity = Math.max(1, Math.min(999, Number.parseInt(req.body.quantity, 10) || 1));
    const notes = compact(req.body.notes || req.body.message, 2000) || null;

    if (!listingId) {
      return res.status(400).json({ success: false, message: 'listingId is required' });
    }
    if (!name) {
      return res.status(400).json({ success: false, message: 'Your name is required' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'End date must be on or after start date' });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) {
      return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
    }

    const resolved = await resolvePublishedListingProduct({
      store,
      listingId,
      productId: null,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'Product listing not found' });
    }

    const { listing, product } = resolved;

    if (listingIsSampleProduct(listing)) {
      return res.status(400).json({ success: false, message: 'Sample products cannot be booked' });
    }
    const { isRentable } = resolveListingCommerceMode(product);
    if (!isRentable) {
      return res.status(400).json({ success: false, message: 'This product is not available for rental' });
    }

    const branchId = await resolveStoreBranchId(store);
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'Store location is not configured' });
    }

    const requestedRatePerDay = resolveRentalRatePerDay(product, listing) || 0;

    await assertItemsAvailable({
      tenantId: store.tenantId,
      branchId,
      startDate,
      endDate,
      items: [{ productId: product.id, quantity }],
    });

    const customer = await findOrCreateGuestCustomer({
      tenantId: store.tenantId,
      shopId: store.shopId,
      name,
      phone,
      email,
    });

    const preBooking = await PreBooking.create({
      tenantId: store.tenantId,
      customerId: customer.id,
      branchId,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      notes,
      status: 'pending',
      createdBy: null,
      metadata: {
        source: 'public_storefront',
        storeSlug: store.slug,
        listingId: listing.id,
        listingTitle: listing.title,
        requestedBy: { name, phone, email },
      },
    });

    await PreBookingItem.create({
      preBookingId: preBooking.id,
      productId: product.id,
      branchId,
      quantity,
      requestedRatePerDay,
    });

    const freshPreBooking = await PreBooking.findByPk(preBooking.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: PreBookingItem, as: 'items', include: [{ model: Product, as: 'product' }] },
      ],
    });

    rentalNotificationService.notifyPreBookingCreated({ preBooking: freshPreBooking })
      .catch((notifyError) => {
        console.error('[public-rental] Pre-booking notification failed:', notifyError?.message || notifyError);
      });

    const rentalSettings = await getRentalSettings(store.tenantId);
    const summary = calculateRentalTotals(
      [{ quantity, rentalRatePerDay: requestedRatePerDay }],
      startDate,
      endDate,
      { dayBillingMode: rentalSettings.dayBillingMode },
    );

    return res.status(201).json({
      success: true,
      data: {
        preBookingId: preBooking.id,
        estimatedTotal: summary.total,
        days: summary.days,
        message: 'Your booking request has been sent. The store will review availability and contact you to confirm.',
      },
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return rejectAvailabilityError(res, error);
    }
    return next(error);
  }
};
