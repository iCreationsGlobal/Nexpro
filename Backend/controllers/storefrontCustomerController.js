const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const emailService = require('../services/emailService');
const { emailOtpCode, passwordReset: passwordResetEmailTemplate } = require('../services/emailTemplates');
const { notifyOnlineStoreOrderReceived } = require('../services/notificationService');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const {
  Customer,
  OnlineProductListing,
  OnlineStoreSettings,
  Product,
  ProductCategory,
  ProductVariant,
  Sale,
  SaleActivity,
  SaleItem,
  StorefrontCustomer,
  StorefrontWishlistItem,
  MarketplaceDispute,
  Tenant,
  Shop,
} = require('../models');
const {
  markReleaseEligibleForSale,
  openDisputeForSale,
  recordHeldPaymentForSale,
  recordDirectPaidPaymentForSale,
} = require('../services/tradeAssuranceService');
const { applyStockChange } = require('../utils/productStockUtils');
const {
  buildEligibilityResponse,
  createOrUpdateVerifiedReview,
  getOrderReviewActions,
  getPublicReviewSummary,
  parseConfirmationReviewPayload,
  updateOwnReview,
} = require('../services/storefrontReviewService');
const {
  COMMERCE_CHANNELS,
  resolveCommerceChannelFromRequest,
  usesTradeAssurance,
  paystackOrderTypeForChannel,
  getSaleCommerceChannel,
  getStorefrontPublicBaseUrl,
  PAYSTACK_ORDER_TYPES,
} = require('../utils/storefrontCommerceChannel');

const ONLINE_STORE_SOURCE = 'online_store';
const DEFAULT_CURRENCY = 'GHS';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REQUIRED_MESSAGE = 'Phone number is required.';
const STOREFRONT_AVATAR_UPLOAD_DIR = 'storefront-customers';
const STOREFRONT_AVATAR_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const PASSWORD_RESET_TTL_MINUTES = 60;
const DELIVERY_PROGRESS = {
  placed: 0,
  processing: 1,
  packed: 2,
  out_for_delivery: 3,
  delivered: 4,
};
const DELIVERY_TIMELINE_STEPS = [
  { key: 'placed', label: 'Order placed', description: 'Your order was received by the seller.' },
  { key: 'processing', label: 'Processing', description: 'The seller is preparing your items.' },
  { key: 'packed', label: 'Packed', description: 'Your order is packed and ready for dispatch.' },
  { key: 'out_for_delivery', label: 'Out for delivery', description: 'Your order is on the way.' },
  { key: 'delivered', label: 'Delivered', description: 'The seller marked this order delivered.' },
];
const TERMINAL_ORDER_STATES = {
  cancelled: {
    label: 'Cancelled',
    description: 'This order was cancelled by the seller.',
  },
  refunded: {
    label: 'Refunded',
    description: 'This order was refunded.',
  },
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const compact = (value, max = 255) => String(value || '').trim().slice(0, max);
const parseQuantity = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : null;
};
const money = (value) => Number((Number.parseFloat(value || 0) || 0).toFixed(2));

const signStorefrontToken = (customer) => jwt.sign(
  { id: customer.id, type: 'storefront_customer' },
  config.jwt.secret,
  { expiresIn: config.jwt.expire }
);

const toSafeShopper = (customer) => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone || null,
  avatarUrl: getShopperAvatarUrl(customer),
  emailVerifiedAt: customer.emailVerifiedAt || null,
  isEmailVerified: Boolean(customer.emailVerifiedAt && customer.isActive === true),
});

const shopperAuthResponse = (customer) => ({
  token: signStorefrontToken(customer),
  customer: toSafeShopper(customer),
});

const verificationPendingResponse = (customer, message) => ({
  success: true,
  message,
  data: {
    verificationRequired: true,
    email: customer.email,
    customer: toSafeShopper(customer),
  },
});

const generateOtp = () => String(crypto.randomInt(100000, 1000000));
const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const maskEmailForLog = (email) => {
  const value = String(email || '').trim();
  const [local, domain] = value.split('@');
  if (!local || !domain) return value ? '***' : '(empty)';
  const maskedLocal = local.length <= 2 ? `${local[0] || ''}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const [domainName, ...domainRest] = domain.split('.');
  const maskedDomain =
    domainName && domainRest.length
      ? `${domainName[0] || ''}***.${domainRest.join('.')}`
      : '***';
  return `${maskedLocal}@${maskedDomain}`;
};
const shouldLogStorefrontVerificationOtp = () => (
  process.env.NODE_ENV !== 'production' ||
  process.env.STOREFRONT_LOG_VERIFICATION_OTP === 'true'
);
const logStorefrontVerificationOtp = ({ customer, code, expiresAt }) => {
  if (!shouldLogStorefrontVerificationOtp()) return false;

  console.warn('[StorefrontAuth][verification_otp_dev]', {
    source: 'storefront_customer_email_verification',
    email: maskEmailForLog(customer?.email),
    storefrontCustomerId: customer?.id,
    otp: code,
    expiresAt: expiresAt?.toISOString?.() || expiresAt,
    nodeEnv: process.env.NODE_ENV || 'development',
  });
  return true;
};
const getStorefrontBaseUrl = (channel = COMMERCE_CHANNELS.ONLINE_STORE) => (
  getStorefrontPublicBaseUrl(channel)
);

const makeStorefrontPaystackReference = (saleId) => (
  `SF-${String(saleId).replace(/-/g, '').slice(0, 12)}-${Date.now()}`.slice(0, 50)
);

const sendStorefrontPaystackInitializeFailure = (res, saleId, paystackErr) => {
  const paystackService = require('../services/paystackService');
  const fromProvider = paystackService.userFacingPaystackErrorMessage(paystackErr);
  console.error('[Storefront] initialize-paystack Paystack error:', {
    saleId,
    status: paystackErr?.response?.status,
    message: paystackErr?.message,
  });
  return res.status(502).json({
    success: false,
    message: fromProvider || 'Could not start Paystack checkout. Try again shortly.',
    errorCode: 'STOREFRONT_PAYSTACK_INIT_FAILED',
  });
};

const parsePaystackTransactionMetadata = (tx) => {
  const raw = tx?.metadata;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
};

const getStorefrontPaystackMetadata = (metadata = {}) => ({
  type: metadata.type || metadata.charge_type || null,
  saleId: metadata.saleId || metadata.sale_id || null,
  tenantId: metadata.tenantId || metadata.tenant_id || null,
  storefrontCustomerId: metadata.storefrontCustomerId || metadata.storefront_customer_id || null,
  storeSlug: metadata.storeSlug || metadata.store_slug || null,
});

const assertShopperAuthenticated = (shopper) => {
  if (!shopper) {
    const err = new Error('Sign in or create a shopper account to checkout.');
    err.statusCode = 401;
    err.errorCode = 'STOREFRONT_AUTH_REQUIRED';
    throw err;
  }
};

const buildCheckoutHttpError = (status, message, errorCode = null) => {
  const err = new Error(message);
  err.statusCode = status;
  if (errorCode) err.errorCode = errorCode;
  throw err;
};

const getMetadata = (customer) => (
  customer?.metadata && typeof customer.metadata === 'object' && !Array.isArray(customer.metadata)
    ? { ...customer.metadata }
    : {}
);

const getShopperAvatar = (customer) => {
  const metadata = getMetadata(customer);
  return metadata.avatar && typeof metadata.avatar === 'object' ? metadata.avatar : {};
};

const getShopperAvatarUrl = (customer) => {
  const avatar = getShopperAvatar(customer);
  const url = avatar?.url;
  return typeof url === 'string' && url.startsWith('/uploads/') ? url : null;
};

const sanitizeUploadName = (name = 'avatar') => String(name)
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-zA-Z0-9.\-_]/g, '_')
  .slice(0, 80) || 'avatar';

const avatarExtensionForMimeType = (mimeType = '') => ({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}[mimeType] || '');

const deleteAvatarFileIfLocal = async (avatar) => {
  const url = typeof avatar?.url === 'string' ? avatar.url : '';
  if (!url.startsWith(`/uploads/${STOREFRONT_AVATAR_UPLOAD_DIR}/`)) return;

  const relativePath = url.replace('/uploads/', '').split('/').join(path.sep);
  const absolutePath = path.join(baseUploadDir, relativePath);
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[Storefront Avatar] Failed to delete old avatar:', absolutePath, error);
    }
  }
};

const getUploadedAvatarFile = (req) => (
  req.file
  || req.files?.avatar?.[0]
  || req.files?.file?.[0]
  || null
);

const isAdminDisabledShopper = (customer) => {
  const metadata = getMetadata(customer);
  if (metadata.disabledByAdmin === true) return true;
  if (['disabled', 'suspended', 'deactivated'].includes(metadata.accountStatus)) return true;
  if (['admin', 'platform'].includes(metadata.deactivatedBy)) return true;
  if (metadata.deactivation && typeof metadata.deactivation === 'object') {
    if (metadata.deactivation.by === 'admin' || metadata.deactivation.by === 'platform') return true;
  }
  // Verified shoppers deactivated by support should stay blocked.
  return Boolean(customer.emailVerifiedAt);
};

const isLegacyPendingVerificationShopper = (customer) => (
  customer.isActive !== true
  && !customer.emailVerifiedAt
  && !isAdminDisabledShopper(customer)
);

const buildRegistrationSuccessPayload = (customer, sendResult) => ({
  success: true,
  message: sendResult?.success
    ? 'Account created. Verification code sent so you can verify your email from your account.'
    : 'Account created, but the verification code could not be sent. You can resend it from your account.',
  data: {
    ...shopperAuthResponse(customer),
    verificationRequired: true,
    verificationEmailSent: Boolean(sendResult?.success),
    verificationEmailError: sendResult?.success ? null : (sendResult?.error || 'Could not send verification code.'),
  },
});

const getSaleMetadata = (sale) => (
  sale?.metadata && typeof sale.metadata === 'object' && !Array.isArray(sale.metadata)
    ? { ...sale.metadata }
    : {}
);

const getDeliveryProgressKey = (plain, metadata = getSaleMetadata(plain)) => {
  if (metadata.confirmedReceivedAt) return 'delivered';
  if (plain?.deliveryStatus === 'delivered' || ['completed', 'delivered'].includes(plain?.orderStatus)) return 'delivered';
  if (plain?.deliveryStatus === 'out_for_delivery') return 'out_for_delivery';
  if (plain?.deliveryStatus === 'ready_for_delivery' || plain?.orderStatus === 'ready') return 'packed';
  if (['received', 'preparing', 'processing'].includes(plain?.orderStatus) || plain?.status === 'completed') return 'processing';
  return 'placed';
};

const isSellerMarkedDelivered = (plain) => (
  plain?.deliveryStatus === 'delivered' || ['completed', 'delivered'].includes(plain?.orderStatus)
);

const canConfirmReceived = (plain, metadata = getSaleMetadata(plain)) => (
  !metadata.confirmedReceivedAt
  && !['cancelled', 'refunded'].includes(plain?.status)
  && metadata.dispute?.status !== 'open'
  && isSellerMarkedDelivered(plain)
);

const getTerminalOrderState = (plain) => {
  if (plain?.orderStatus === 'cancelled' || plain?.status === 'cancelled') return 'cancelled';
  if (plain?.status === 'refunded') return 'refunded';
  return null;
};

const toDeliveryTracking = (plain, metadata = getSaleMetadata(plain)) => {
  const terminalState = getTerminalOrderState(plain);
  const deliveryTracking = metadata.deliveryTracking && typeof metadata.deliveryTracking === 'object'
    ? metadata.deliveryTracking
    : {};
  if (terminalState) {
    const terminalCopy = TERMINAL_ORDER_STATES[terminalState];
    const cancelledAt = metadata.cancellation?.cancelledAt
      || deliveryTracking.history?.find?.((item) => item.status === 'cancelled')?.at
      || plain.updatedAt
      || null;
    return {
      currentStatus: terminalState,
      currentLabel: terminalCopy.label,
      deliveryStatus: plain.deliveryStatus || null,
      orderStatus: plain.orderStatus || null,
      deliveredAt: null,
      canConfirmReceived: false,
      releaseEligibleAt: null,
      courier: deliveryTracking.courier || metadata.delivery?.courier || null,
      trackingNumber: deliveryTracking.trackingNumber || metadata.delivery?.trackingNumber || null,
      notes: metadata.cancellation?.reason || deliveryTracking.notes || metadata.delivery?.notes || null,
      timeline: [
        {
          ...DELIVERY_TIMELINE_STEPS[0],
          status: 'complete',
          completed: true,
          timestamp: plain.createdAt,
        },
        {
          key: terminalState,
          label: terminalCopy.label,
          description: terminalCopy.description,
          status: 'current',
          completed: true,
          timestamp: cancelledAt,
        },
      ],
    };
  }

  const progressKey = getDeliveryProgressKey(plain, metadata);
  const progressIndex = DELIVERY_PROGRESS[progressKey] ?? 0;
  const releaseEligibleAt = metadata.tradeAssurance?.payoutReleaseEligibleAt || null;

  return {
    currentStatus: progressKey,
    currentLabel: DELIVERY_TIMELINE_STEPS.find((step) => step.key === progressKey)?.label || 'Order placed',
    deliveryStatus: plain.deliveryStatus || null,
    orderStatus: plain.orderStatus || null,
    deliveredAt: plain.deliveredAt || deliveryTracking.deliveredAt || null,
    canConfirmReceived: canConfirmReceived(plain, metadata),
    releaseEligibleAt,
    courier: deliveryTracking.courier || metadata.delivery?.courier || null,
    trackingNumber: deliveryTracking.trackingNumber || metadata.delivery?.trackingNumber || null,
    notes: deliveryTracking.notes || metadata.delivery?.notes || null,
    timeline: DELIVERY_TIMELINE_STEPS.map((step, index) => ({
      ...step,
      status: index < progressIndex ? 'complete' : (index === progressIndex ? 'current' : 'pending'),
      completed: index <= progressIndex,
      timestamp: step.key === 'placed'
        ? plain.createdAt
        : (step.key === 'delivered' ? (plain.deliveredAt || deliveryTracking.deliveredAt || null) : null),
    })),
  };
};

const buildWishlistListingAvailability = (listing, variantsByProductId = new Map()) => {
  const plain = typeof listing?.get === 'function' ? listing.get({ plain: true }) : listing;
  const product = plain?.product || null;
  const selectedVariant = plain?.variant?.productId === product?.id ? plain.variant : null;
  const productVariants = variantsByProductId.get(product?.id) || [];
  let quantityOnHand = null;
  let source = 'product';

  if (selectedVariant) {
    quantityOnHand = parseQuantity(selectedVariant.quantityOnHand);
    source = 'variant';
  } else if (productVariants.length > 0 || product?.hasVariants) {
    quantityOnHand = productVariants.reduce((total, variant) => {
      const variantQuantity = parseQuantity(variant.quantityOnHand);
      return total + Math.max(variantQuantity || 0, 0);
    }, 0);
    source = 'variants';
  } else {
    quantityOnHand = parseQuantity(product?.quantityOnHand);
  }

  const available = quantityOnHand !== null && quantityOnHand > 0;
  return {
    ...plain,
    quantityOnHand,
    available,
    availability: {
      status: available ? 'in_stock' : 'out_of_stock',
      label: available ? 'Available' : 'Out of stock',
      message: available ? 'In stock' : 'Not available right now',
      quantityOnHand,
      source,
    },
  };
};

const wishlistListingIncludes = [
  {
    model: Product,
    as: 'product',
    attributes: ['id', 'name', 'quantityOnHand', 'unit', 'hasVariants', 'trackStock', 'imageUrl', 'categoryId', 'isActive'],
    required: true,
    include: [
      { model: ProductCategory, as: 'category', attributes: ['id', 'name'], required: false, where: { isActive: true } },
    ],
  },
  {
    model: ProductVariant,
    as: 'variant',
    attributes: ['id', 'productId', 'name', 'quantityOnHand', 'trackStock'],
    required: false,
  },
];

const wishlistItemInclude = [
  {
    model: OnlineProductListing,
    as: 'listing',
    required: true,
    include: wishlistListingIncludes,
  },
];

const getWishlistVariantMap = async (listings) => {
  const productIds = [
    ...new Set(
      listings
        .map((listing) => (typeof listing?.get === 'function' ? listing.get({ plain: true }) : listing))
        .map((listing) => listing?.product)
        .filter((product) => product?.hasVariants)
        .map((product) => product.id)
    ),
  ];

  const variants = productIds.length
    ? await ProductVariant.findAll({
      where: { productId: { [Op.in]: productIds }, isActive: true },
      attributes: ['id', 'productId', 'name', 'quantityOnHand', 'trackStock'],
    })
    : [];

  return variants.reduce((map, variant) => {
    const plain = variant.get({ plain: true });
    const current = map.get(plain.productId) || [];
    current.push(plain);
    map.set(plain.productId, current);
    return map;
  }, new Map());
};

const storefrontKeyForListing = (listing) => `${listing?.tenantId || ''}:${listing?.shopId || ''}`;

/**
 * Match Online Store settings to a listing the same way public storefront does:
 * tenant must match; a settings row with null shopId is tenant-wide and matches any listing shop.
 * Prefer an exact shopId match when both exist.
 * @param {{ tenantId?: string, shopId?: string|null }} store
 * @param {{ tenantId?: string, shopId?: string|null }} listing
 * @returns {boolean}
 */
const storeMatchesListingForWishlist = (store, listing) => {
  if (!store?.tenantId || store.tenantId !== listing?.tenantId) return false;
  return store.shopId ? store.shopId === listing.shopId : true;
};

/**
 * Resolve public store cards for wishlist listings.
 * Keyed by listing tenantId:shopId so callers can look up via storefrontKeyForListing(listing).
 * @param {Array<object>} listings
 * @returns {Promise<Map<string, object>>}
 */
const getWishlistStores = async (listings) => {
  const plainListings = listings
    .map((listing) => (typeof listing?.get === 'function' ? listing.get({ plain: true }) : listing))
    .filter((listing) => listing?.tenantId);
  const tenantIds = [...new Set(plainListings.map((listing) => listing.tenantId))];
  if (!tenantIds.length) return new Map();

  const stores = await OnlineStoreSettings.findAll({
    where: { tenantId: { [Op.in]: tenantIds } },
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'businessType', 'status'], required: true },
      { model: Shop, as: 'shop', attributes: ['id', 'name', 'shopType', 'city', 'country', 'logoUrl', 'isActive'], required: false },
    ],
  });

  const storeCards = stores.map((store) => {
    const plain = store.get({ plain: true });
    return {
      id: plain.id,
      tenantId: plain.tenantId,
      shopId: plain.shopId || null,
      slug: plain.slug,
      displayName: plain.displayName,
      logoUrl: plain.logoUrl || plain.shop?.logoUrl || null,
      currency: plain.currency || DEFAULT_CURRENCY,
      deliveryEnabled: plain.deliveryEnabled,
      pickupEnabled: plain.pickupEnabled,
      deliveryFee: Number.parseFloat(plain.deliveryFee || 0) || 0,
      enabled: plain.enabled === true && plain.tenant?.status === 'active' && plain.shop?.isActive !== false,
    };
  });

  return plainListings.reduce((map, listing) => {
    const key = storefrontKeyForListing(listing);
    if (map.has(key)) return map;

    const candidates = storeCards.filter((store) => storeMatchesListingForWishlist(store, listing));
    const exactShop = candidates.find((store) => store.shopId && store.shopId === listing.shopId);
    const tenantWide = candidates.find((store) => !store.shopId);
    const chosen = exactShop || tenantWide || candidates[0] || null;
    if (chosen) map.set(key, chosen);
    return map;
  }, new Map());
};

const toWishlistProduct = (wishlistItem, storesByListingKey, variantsByProductId) => {
  const plainItem = typeof wishlistItem?.get === 'function' ? wishlistItem.get({ plain: true }) : wishlistItem;
  const listing = buildWishlistListingAvailability(plainItem.listing, variantsByProductId);
  const product = listing.product || {};
  const store = storesByListingKey.get(storefrontKeyForListing(listing)) || null;
  const publicListingAvailable = listing.status === 'published' && store?.enabled === true;

  return {
    id: plainItem.id,
    listingId: listing.id,
    tenantId: plainItem.tenantId,
    shopId: plainItem.shopId || null,
    productId: plainItem.productId,
    productVariantId: plainItem.productVariantId || null,
    savedAt: plainItem.createdAt,
    product: {
      id: listing.id,
      listingId: listing.id,
      title: listing.title,
      slug: listing.slug,
      shortDescription: listing.shortDescription,
      publicPrice: listing.publicPrice,
      compareAtPrice: listing.compareAtPrice,
      images: listing.images,
      available: publicListingAvailable && listing.available,
      availability: publicListingAvailable ? listing.availability : {
        status: 'unavailable',
        label: 'Unavailable',
        message: 'This listing is not currently public.',
        quantityOnHand: listing.quantityOnHand,
        source: listing.availability?.source || 'listing',
      },
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      store,
      publishedAt: listing.publishedAt,
    },
  };
};

const getWishlistResponse = async (customerId) => {
  const wishlistItems = await StorefrontWishlistItem.findAll({
    where: { storefrontCustomerId: customerId },
    include: wishlistItemInclude,
    order: [['createdAt', 'DESC']],
  });
  const listings = wishlistItems.map((item) => item.listing).filter(Boolean);
  const [variantsByProductId, storesByListingKey] = await Promise.all([
    getWishlistVariantMap(listings),
    getWishlistStores(listings),
  ]);
  const items = wishlistItems.map((item) => toWishlistProduct(item, storesByListingKey, variantsByProductId));

  return {
    items,
    count: items.length,
    listingIds: items.map((item) => item.listingId),
  };
};

const saleMetadataJsonKey = (key) => sequelize.literal(`"Sale"."metadata"->>'${key}'`);

const shopperOrderWhere = (shopperId, extra = {}) => ({
  ...extra,
  [Op.and]: [
    ...(extra[Op.and] || []),
    sequelize.where(saleMetadataJsonKey('source'), ONLINE_STORE_SOURCE),
    sequelize.where(saleMetadataJsonKey('storefrontCustomerId'), shopperId),
  ],
});

const normalizeAddress = (payload = {}) => ({
  label: compact(payload.label || 'Delivery address', 80) || 'Delivery address',
  recipientName: compact(payload.recipientName || payload.name, 160),
  phone: compact(payload.phone, 40),
  line1: compact(payload.line1 || payload.addressLine1 || payload.address, 180),
  line2: compact(payload.line2 || payload.addressLine2, 180),
  city: compact(payload.city, 100),
  region: compact(payload.region || payload.state, 100),
  country: compact(payload.country || 'Ghana', 80) || 'Ghana',
  deliveryNotes: compact(payload.deliveryNotes || payload.notes, 500),
});

const validateAddress = (address) => {
  if (!address.recipientName || !address.phone || !address.line1 || !address.city) {
    return 'Recipient name, phone, address line, and city are required.';
  }
  return null;
};

const toPublicAddress = (address = {}, defaultDeliveryAddressId = null) => ({
  id: address.id,
  label: address.label || 'Delivery address',
  recipientName: address.recipientName || '',
  phone: address.phone || '',
  line1: address.line1 || '',
  line2: address.line2 || '',
  city: address.city || '',
  region: address.region || '',
  country: address.country || 'Ghana',
  deliveryNotes: address.deliveryNotes || '',
  isDefault: address.id === defaultDeliveryAddressId || address.isDefault === true,
  createdAt: address.createdAt || null,
  updatedAt: address.updatedAt || null,
});

const getAddressBook = (customer) => {
  const metadata = getMetadata(customer);
  const addresses = Array.isArray(metadata.savedDeliveryAddresses)
    ? metadata.savedDeliveryAddresses
    : [];
  const defaultDeliveryAddressId = metadata.defaultDeliveryAddressId || addresses.find((address) => address?.isDefault)?.id || null;

  return {
    metadata,
    defaultDeliveryAddressId,
    addresses: addresses
      .filter((address) => address && typeof address === 'object' && address.id)
      .map((address) => toPublicAddress(address, defaultDeliveryAddressId)),
  };
};

const saveAddressBook = async (customer, metadata, addresses, defaultDeliveryAddressId = null) => {
  metadata.savedDeliveryAddresses = addresses.map((address) => ({
    ...address,
    isDefault: address.id === defaultDeliveryAddressId,
  }));
  metadata.defaultDeliveryAddressId = defaultDeliveryAddressId || null;
  const updated = await customer.update({ metadata });
  return getAddressBook(updated);
};

const getStoreLabelsForOrders = async (orders) => {
  const pairs = orders
    .map((order) => {
      const plain = typeof order.get === 'function' ? order.get({ plain: true }) : order;
      const metadata = getSaleMetadata(plain);
      return metadata.storeSlug ? { tenantId: plain.tenantId, slug: metadata.storeSlug } : null;
    })
    .filter(Boolean);

  if (pairs.length === 0) return new Map();

  const stores = await OnlineStoreSettings.findAll({
    where: {
      slug: { [Op.in]: [...new Set(pairs.map((pair) => pair.slug))] },
      tenantId: { [Op.in]: [...new Set(pairs.map((pair) => pair.tenantId))] },
    },
    attributes: [
      'tenantId',
      'shopId',
      'slug',
      'displayName',
      'currency',
      'logoUrl',
      'contactPhone',
      'whatsappNumber',
    ],
  });

  return stores.reduce((map, store) => {
    const plain = store.get({ plain: true });
    map.set(`${plain.tenantId}:${plain.slug}`, plain);
    return map;
  }, new Map());
};

const toOrderSummary = (order, storeLabels = new Map()) => {
  const plain = typeof order.get === 'function' ? order.get({ plain: true }) : order;
  const metadata = getSaleMetadata(plain);
  const store = metadata.storeSlug ? storeLabels.get(`${plain.tenantId}:${metadata.storeSlug}`) : null;
  const fulfillmentMethod = metadata.fulfillmentMethod || (plain.deliveryRequired ? 'delivery' : 'pickup');
  const dispute = metadata.dispute && typeof metadata.dispute === 'object' ? metadata.dispute : null;
  const tradeAssurance = metadata.tradeAssurance && typeof metadata.tradeAssurance === 'object'
    ? metadata.tradeAssurance
    : {};
  const deliveryTracking = toDeliveryTracking(plain, metadata);

  return {
    id: plain.id,
    saleNumber: plain.saleNumber,
    status: plain.status,
    orderStatus: plain.orderStatus || null,
    deliveryStatus: plain.deliveryStatus || null,
    subtotal: Number(plain.subtotal || 0),
    deliveryFee: Number(plain.deliveryFee || 0),
    total: Number(plain.total || 0),
    amountPaid: Number(plain.amountPaid || 0),
    currency: store?.currency || metadata.currency || DEFAULT_CURRENCY,
    storeName: store?.displayName || plain.shop?.name || metadata.storeSlug || 'Sabito seller',
    storeSlug: metadata.storeSlug || null,
    storeWhatsappNumber: store?.whatsappNumber || null,
    storeContactPhone: store?.contactPhone || null,
    fulfillmentMethod,
    deliveryRequired: plain.deliveryRequired === true,
    deliveryAddress: metadata.deliveryAddress || null,
    deliveryTracking,
    deliveryTimeline: deliveryTracking.timeline,
    canConfirmReceived: deliveryTracking.canConfirmReceived,
    tradeAssurance: {
      paymentStatus: tradeAssurance.paymentStatus || null,
      marketplacePaymentId: tradeAssurance.marketplacePaymentId || null,
      grossAmount: Number(tradeAssurance.grossAmount || plain.total || 0),
      feeAmount: Number(tradeAssurance.feeAmount || 0),
      netAmount: Number(tradeAssurance.netAmount || 0),
      refundedAmount: Number(tradeAssurance.refundedAmount || 0),
      heldAt: tradeAssurance.heldAt || null,
      payoutHold: tradeAssurance.payoutHold === true,
      payoutReleaseEligible: tradeAssurance.payoutReleaseEligible === true,
      payoutReleaseEligibleAt: tradeAssurance.payoutReleaseEligibleAt || null,
      payoutReleasedAt: tradeAssurance.payoutReleasedAt || null,
      autoReleaseHours: tradeAssurance.autoReleaseHours || null,
    },
    confirmedReceivedAt: metadata.confirmedReceivedAt || null,
    dispute: dispute ? {
      id: dispute.id,
      status: dispute.status || 'open',
      reason: dispute.reason || 'issue',
      openedAt: dispute.openedAt || null,
    } : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const toOrderDetail = (order, storeLabels = new Map()) => {
  const plain = typeof order.get === 'function' ? order.get({ plain: true }) : order;
  return {
    ...toOrderSummary(plain, storeLabels),
    notes: plain.notes || '',
    items: (plain.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku || null,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      subtotal: Number(item.subtotal || 0),
      total: Number(item.total || 0),
      productId: item.productId || null,
      productVariantId: item.productVariantId || null,
      listingId: item.metadata?.onlineListingId || null,
      imageUrl: item.metadata?.imageUrl || item.product?.imageUrl || null,
    })),
  };
};

const orderDetailItemInclude = {
  model: SaleItem,
  as: 'items',
  required: false,
  include: [
    { model: Product, as: 'product', attributes: ['id', 'name', 'imageUrl'], required: false },
    { model: ProductVariant, as: 'variant', attributes: ['id', 'name', 'sku'], required: false },
  ],
};

const normalizeContactLookup = (value) => compact(value, 160).toLowerCase();

const contactDigits = (value) => String(value || '').replace(/\D/g, '');

const contactMatches = (providedContact, candidates = []) => {
  const normalized = normalizeContactLookup(providedContact);
  const providedDigits = contactDigits(normalized);
  if (!normalized) return false;

  return candidates.some((candidate) => {
    const candidateText = normalizeContactLookup(candidate);
    if (!candidateText) return false;
    if (candidateText === normalized) return true;

    const candidateDigits = contactDigits(candidateText);
    if (providedDigits.length < 7 || candidateDigits.length < 7) return false;
    if (providedDigits === candidateDigits) return true;

    // Accept local/international formatting differences without matching tiny fragments.
    return providedDigits.slice(-9) === candidateDigits.slice(-9);
  });
};

const getOrderContactCandidates = (plain, metadata = getSaleMetadata(plain)) => [
  metadata.storefrontCustomerEmail,
  metadata.storefrontCustomerPhone,
  metadata.deliveryAddress?.email,
  metadata.deliveryAddress?.phone,
  plain.customer?.email,
  plain.customer?.phone,
];

const toPublicTrackingOrder = (order, storeLabels = new Map()) => {
  const plain = typeof order.get === 'function' ? order.get({ plain: true }) : order;
  const summary = toOrderSummary(plain, storeLabels);
  const itemCount = (plain.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const deliveryAddress = summary.deliveryAddress || {};

  return {
    saleNumber: summary.saleNumber,
    status: summary.status,
    orderStatus: summary.orderStatus,
    deliveryStatus: summary.deliveryStatus,
    currentLabel: summary.deliveryTracking.currentLabel,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    storeName: summary.storeName,
    storeSlug: summary.storeSlug,
    fulfillmentMethod: summary.fulfillmentMethod,
    deliveryRequired: summary.deliveryRequired,
    currency: summary.currency,
    subtotal: summary.subtotal,
    deliveryFee: summary.deliveryFee,
    total: summary.total,
    itemCount,
    items: (plain.items || []).map((item) => ({
      name: item.name,
      quantity: Number(item.quantity || 0),
      total: Number(item.total || 0),
      imageUrl: item.metadata?.imageUrl || item.product?.imageUrl || null,
    })),
    deliverySummary: summary.deliveryRequired ? {
      label: deliveryAddress.label || 'Delivery address',
      recipientName: deliveryAddress.recipientName || null,
      city: deliveryAddress.city || null,
      region: deliveryAddress.region || null,
      country: deliveryAddress.country || null,
    } : null,
    deliveryTracking: summary.deliveryTracking,
    deliveryTimeline: summary.deliveryTimeline,
    support: {
      message: 'For changes or delivery questions, contact the store from the store page or your shopper account.',
      // Clients should prefer storeSlug + their surface prefix (/shop vs /stores).
      // storePath remains the marketplace default for backwards compatibility.
      storePath: summary.storeSlug ? `/stores/${encodeURIComponent(summary.storeSlug)}` : null,
    },
  };
};

const sendStorefrontVerificationOtp = async (customer, purpose = 'Use this code to activate your Sabito Store shopper account.') => {
  const code = generateOtp();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
  const otpHash = await bcrypt.hash(code, rounds);
  const metadata = getMetadata(customer);
  const previous = metadata.emailVerification && typeof metadata.emailVerification === 'object'
    ? metadata.emailVerification
    : {};
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  metadata.emailVerification = {
    otpHash,
    expiresAt: expiresAt.toISOString(),
    sentAt: new Date().toISOString(),
    attempts: 0,
    resendCount: Number(previous.resendCount || 0) + 1,
  };

  await customer.update({ metadata });
  const otpLogged = logStorefrontVerificationOtp({ customer, code, expiresAt });

  const { subject, html, text } = emailOtpCode({
    userName: customer.name || customer.email || 'there',
    code,
    purpose,
    minutesValid: OTP_TTL_MINUTES,
    company: { name: process.env.APP_NAME || 'Sabito Store' },
  });

  return emailService.sendPlatformMessage(customer.email, subject, html, text, [], {
    categories: ['transactional', 'storefront-signup'],
    context: {
      source: 'storefront_customer_email_verification',
      storefrontCustomerId: customer.id,
    },
  }).then((result) => ({ ...result, otpLogged }));
};

const sendStorefrontOtp = async ({ customer, metadataKey, purpose, source, categories = [] }) => {
  const code = generateOtp();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;
  const otpHash = await bcrypt.hash(code, rounds);
  const metadata = getMetadata(customer);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  metadata[metadataKey] = {
    otpHash,
    expiresAt: expiresAt.toISOString(),
    sentAt: new Date().toISOString(),
    attempts: 0,
  };

  await customer.update({ metadata });

  const { subject, html, text } = emailOtpCode({
    userName: customer.name || customer.email || 'there',
    code,
    purpose,
    minutesValid: OTP_TTL_MINUTES,
    company: { name: process.env.APP_NAME || 'Sabito Store' },
  });

  return emailService.sendPlatformMessage(customer.email, subject, html, text, [], {
    categories: ['transactional', ...categories],
    context: {
      source,
      storefrontCustomerId: customer.id,
    },
  });
};

const verifyMetadataOtp = async ({ customer, metadataKey, otp, missingMessage = 'Verification code is missing or expired. Request a new code.' }) => {
  const metadata = getMetadata(customer);
  const record = metadata[metadataKey] && typeof metadata[metadataKey] === 'object'
    ? metadata[metadataKey]
    : null;

  if (!record?.otpHash || !record?.expiresAt) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: missingMessage, errorCode: 'STOREFRONT_OTP_REQUIRED' },
    };
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    delete metadata[metadataKey];
    await customer.update({ metadata });
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Verification code expired. Request a new code.', errorCode: 'STOREFRONT_OTP_EXPIRED' },
    };
  }
  if (Number(record.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      body: { success: false, message: 'Too many verification attempts. Request a new code.', errorCode: 'STOREFRONT_OTP_LOCKED' },
    };
  }

  const isMatch = await bcrypt.compare(otp, record.otpHash);
  if (!isMatch) {
    metadata[metadataKey] = {
      ...record,
      attempts: Number(record.attempts || 0) + 1,
    };
    await customer.update({ metadata });
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Invalid verification code.', errorCode: 'STOREFRONT_OTP_INVALID' },
    };
  }

  delete metadata[metadataKey];
  return { ok: true, metadata };
};

const getNextSaleNumber = async (tenantId, transaction) => {
  const prefix = 'SALE';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numberPrefix = `${prefix}-${dateStr}-`;
  const lastSale = await Sale.findOne({
    where: {
      tenantId,
      saleNumber: { [Op.like]: `${numberPrefix}%` },
    },
    order: [['saleNumber', 'DESC']],
    attributes: ['saleNumber'],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const lastSeq = Number.parseInt(String(lastSale?.saleNumber || '').split('-').pop(), 10);
  const sequence = Number.isFinite(lastSeq) && lastSeq >= 0 ? lastSeq + 1 : 1;
  return `${numberPrefix}${String(sequence).padStart(4, '0')}`;
};

const rowUpdateLock = (transaction) => (transaction ? transaction.LOCK.UPDATE : undefined);

const listingIncludeForOrder = [
  { model: Product, as: 'product', required: true, where: { isActive: true } },
  { model: ProductVariant, as: 'variant', required: false, where: { isActive: true } },
];

/**
 * Locks product/variant stock rows separately so listing queries never use
 * FOR UPDATE across nullable outer joins (PostgreSQL rejects that pattern).
 */
const attachLockedStockToListings = async (listings, tenantId, transaction) => {
  const productIds = [...new Set(listings.map((listing) => listing.productId).filter(Boolean))];
  const variantIds = [...new Set(listings.map((listing) => listing.productVariantId).filter(Boolean))];

  const [products, variants] = await Promise.all([
    productIds.length
      ? Product.findAll({
        where: { id: { [Op.in]: productIds }, tenantId, isActive: true },
        transaction,
        lock: rowUpdateLock(transaction),
      })
      : [],
    variantIds.length
      ? ProductVariant.findAll({
        where: { id: { [Op.in]: variantIds }, isActive: true },
        transaction,
        lock: rowUpdateLock(transaction),
      })
      : [],
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  listings.forEach((listing) => {
    listing.product = productById.get(listing.productId) || null;
    if (listing.productVariantId) {
      listing.variant = variantById.get(listing.productVariantId) || null;
    } else {
      listing.variant = null;
    }
  });

  return listings;
};

const getListingAvailability = (listing) => {
  const product = listing.product;
  const variant = listing.variant;
  if (!product) return { available: false, quantityOnHand: 0, target: null, targetType: null };

  if (product.hasVariants && !variant) {
    return {
      available: false,
      quantityOnHand: 0,
      target: null,
      targetType: null,
      message: 'This product requires a variant selection before checkout.',
    };
  }

  if (variant) {
    const trackVariant = product.trackStock !== false && variant.trackStock !== false;
    return {
      available: !trackVariant || Number.parseFloat(variant.quantityOnHand || 0) > 0,
      quantityOnHand: Number.parseFloat(variant.quantityOnHand || 0),
      target: variant,
      targetType: 'variant',
      trackStock: trackVariant,
    };
  }

  const trackProduct = product.trackStock !== false;
  return {
    available: !trackProduct || Number.parseFloat(product.quantityOnHand || 0) > 0,
    quantityOnHand: Number.parseFloat(product.quantityOnHand || 0),
    target: product,
    targetType: 'product',
    trackStock: trackProduct,
  };
};

const resolveStoreForOrder = async (storeSlug, transaction) => {
  const store = await OnlineStoreSettings.findOne({
    where: { slug: { [Op.iLike]: storeSlug }, enabled: true },
    transaction,
    lock: rowUpdateLock(transaction),
  });
  if (!store) return null;

  await store.reload({
    transaction,
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'status', 'metadata'], required: true, where: { status: 'active' } },
      { model: Shop, as: 'shop', attributes: ['id', 'name', 'isActive'], required: false, where: { isActive: true } },
    ],
  });

  return store.tenant ? store : null;
};

const findOrCreateTenantCustomer = async ({ shopper, store, deliveryAddress, transaction }) => {
  const where = {
    tenantId: store.tenantId,
    ...(store.shopId ? { shopId: store.shopId } : {}),
    [Op.or]: [
      { email: shopper.email },
      ...(shopper.phone ? [{ phone: shopper.phone }] : []),
    ],
  };

  const existing = await Customer.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
  const addressText = compact(
    deliveryAddress?.address || [deliveryAddress?.line1, deliveryAddress?.line2].filter(Boolean).join(', '),
    1000
  );
  const city = compact(deliveryAddress?.city, 120);
  const country = compact(deliveryAddress?.country || 'Ghana', 120);

  if (existing) {
    const updates = {};
    if (!existing.email && shopper.email) updates.email = shopper.email;
    if (!existing.phone && shopper.phone) updates.phone = shopper.phone;
    if (!existing.name && shopper.name) updates.name = shopper.name;
    if (addressText && !existing.address) updates.address = addressText;
    if (city && !existing.city) updates.city = city;
    if (country && !existing.country) updates.country = country;
    return Object.keys(updates).length ? existing.update(updates, { transaction }) : existing;
  }

  return Customer.create({
    tenantId: store.tenantId,
    shopId: store.shopId || null,
    name: shopper.name,
    email: shopper.email,
    phone: shopper.phone || null,
    address: addressText || null,
    city: city || null,
    country: country || 'Ghana',
    sabitoSourceType: 'direct',
    notes: 'Created from Sabito Store shopper checkout.',
  }, { transaction });
};

exports.registerStorefrontCustomer = async (req, res, next) => {
  try {
    const name = compact(req.body?.name, 160);
    const email = normalizeEmail(req.body?.email);
    const phone = compact(req.body?.phone, 40);
    const password = String(req.body?.password || '');

    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: PHONE_REQUIRED_MESSAGE });
    }

    const existing = await StorefrontCustomer.findOne({ where: { email } });
    if (existing) {
      if (existing.isActive === true) {
        return res.status(409).json({ success: false, message: 'A shopper account with this email already exists.' });
      }
      if (!isLegacyPendingVerificationShopper(existing)) {
        return res.status(403).json({
          success: false,
          message: 'This shopper account is inactive. Contact support for help.',
          errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
        });
      }

      const metadata = getMetadata(existing);
      metadata.source = metadata.source || 'storefront_signup';
      metadata.reactivatedFromLegacyPendingAt = new Date().toISOString();
      delete metadata.emailVerification;

      await existing.update({
        name,
        phone: phone || null,
        password,
        isActive: true,
        emailVerifiedAt: null,
        metadata,
      });

      const sendResult = await sendStorefrontVerificationOtp(existing);
      return res.status(200).json(buildRegistrationSuccessPayload(existing, sendResult));
    }

    const customer = await StorefrontCustomer.create({
      name,
      email,
      phone: phone || null,
      password,
      isActive: true,
      emailVerifiedAt: null,
      metadata: { source: 'storefront_signup' },
    });

    const sendResult = await sendStorefrontVerificationOtp(customer);
    return res.status(201).json(buildRegistrationSuccessPayload(customer, sendResult));
  } catch (error) {
    next(error);
  }
};

exports.loginStorefrontCustomer = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer || !(await customer.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (customer.isActive !== true) {
      if (!isLegacyPendingVerificationShopper(customer)) {
        return res.status(401).json({
          success: false,
          message: 'Shopper account is inactive.',
          errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
        });
      }
      const metadata = getMetadata(customer);
      metadata.reactivatedFromLegacyPendingAt = new Date().toISOString();
      await customer.update({ isActive: true, metadata });
    }

    await customer.update({ lastLoginAt: new Date() });
    res.status(200).json({ success: true, data: shopperAuthResponse(customer) });
  } catch (error) {
    next(error);
  }
};

exports.googleAuthStorefrontCustomer = async (req, res, next) => {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return res.status(503).json({
        success: false,
        message: 'Google sign-in is not configured.',
      });
    }

    const { idToken, signUp = false } = req.body || {};
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID token is required.',
      });
    }

    const client = new OAuth2Client(googleClientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: googleClientId });
      payload = ticket.getPayload();
    } catch (verifyError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Google token.',
      });
    }

    const googleId = String(payload.sub || '').trim();
    const email = normalizeEmail(payload.email);
    const name = compact(payload.name || payload.email || 'Sabito shopper', 160);
    const picture = payload.picture || null;

    if (!googleId || !email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Google account must include a valid email address.',
      });
    }

    let customer = await StorefrontCustomer.findOne({
      where: {
        [Op.or]: [
          { googleId },
          { email },
        ],
      },
    });

    if (customer) {
      if (customer.googleId && customer.googleId !== googleId) {
        return res.status(409).json({
          success: false,
          message: 'This shopper email is already linked to a different Google account.',
        });
      }

      const metadata = getMetadata(customer);
      metadata.authProvider = metadata.authProvider || 'google';
      metadata.google = {
        ...(metadata.google && typeof metadata.google === 'object' ? metadata.google : {}),
        picture,
        emailVerified: payload.email_verified !== false,
        lastSignInAt: new Date().toISOString(),
      };
      delete metadata.emailVerification;
      delete metadata.loginOtp;

      await customer.update({
        googleId,
        isActive: true,
        emailVerifiedAt: customer.emailVerifiedAt || new Date(),
        lastLoginAt: new Date(),
        metadata,
      });

      return res.status(200).json({ success: true, data: shopperAuthResponse(customer) });
    }

    if (!signUp) {
      return res.status(404).json({
        success: false,
        code: 'GOOGLE_SHOPPER_NOT_FOUND',
        message: 'No shopper account found with this Google account. Sign up to create one.',
        email,
        name,
      });
    }

    const randomPassword = crypto.randomBytes(32).toString('hex');
    customer = await StorefrontCustomer.create({
      name,
      email,
      password: randomPassword,
      googleId,
      isActive: true,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      metadata: {
        source: 'storefront_google_oauth',
        authProvider: 'google',
        google: {
          picture,
          emailVerified: payload.email_verified !== false,
          createdAt: new Date().toISOString(),
        },
      },
    });

    return res.status(201).json({ success: true, data: shopperAuthResponse(customer) });
  } catch (error) {
    next(error);
  }
};

exports.requestStorefrontPasswordReset = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }

    const message = 'If a shopper account exists with that email, you will receive a password reset link shortly.';
    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer || customer.isActive !== true) {
      return res.status(200).json({ success: true, message });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const metadata = getMetadata(customer);
    metadata.passwordReset = {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString(),
      sentAt: new Date().toISOString(),
    };
    await customer.update({ metadata });

    const returnTo = String(req.body?.returnTo || '').trim();
    const resetParams = new URLSearchParams({ token });
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      resetParams.set('returnTo', returnTo);
    }
    const resetLink = `${getStorefrontBaseUrl()}/reset-password?${resetParams.toString()}`;
    const company = { name: process.env.APP_NAME || 'Sabito Store' };
    const { subject, html, text } = passwordResetEmailTemplate(customer, resetLink, company);
    setImmediate(async () => {
      try {
        await emailService.sendPlatformMessage(customer.email, subject, html, text, [], {
          categories: ['transactional', 'storefront-password-reset'],
          context: {
            source: 'storefront_customer_password_reset',
            storefrontCustomerId: customer.id,
          },
        });
      } catch (error) {
        console.error('[Storefront Auth] Password reset email failed:', error?.message || error);
      }
    });

    return res.status(200).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

exports.resetStorefrontPassword = async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || req.body?.password || '');
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const tokenHash = hashToken(token);
    const customer = await StorefrontCustomer.findOne({
      where: sequelize.where(sequelize.json('metadata.passwordReset.tokenHash'), tokenHash),
    });

    const resetRecord = customer ? getMetadata(customer).passwordReset : null;
    if (!customer || !resetRecord?.expiresAt) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new password reset.' });
    }
    if (new Date(resetRecord.expiresAt).getTime() < Date.now()) {
      const metadata = getMetadata(customer);
      delete metadata.passwordReset;
      await customer.update({ metadata });
      return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new password reset.' });
    }

    const metadata = getMetadata(customer);
    delete metadata.passwordReset;
    delete metadata.loginOtp;
    await customer.update({ password: newPassword, metadata });

    return res.status(200).json({
      success: true,
      message: 'Password has been reset. You can now sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

exports.sendStorefrontLoginOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }

    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer || customer.isActive !== true) {
      return res.status(200).json({
        success: true,
        message: 'If an active shopper account exists with that email, a sign-in code has been sent.',
      });
    }

    const sendResult = await sendStorefrontOtp({
      customer,
      metadataKey: 'loginOtp',
      purpose: 'Use this code to sign in to your Sabito Store shopper account.',
      source: 'storefront_customer_login_otp',
      categories: ['storefront-login-otp'],
    });
    if (!sendResult?.success) {
      const metadata = getMetadata(customer);
      delete metadata.loginOtp;
      await customer.update({ metadata });
      return res.status(503).json({
        success: false,
        message: sendResult?.error || 'Could not send sign-in code. Please try again later.',
        errorCode: 'STOREFRONT_LOGIN_OTP_SEND_FAILED',
      });
    }

    return res.status(200).json({ success: true, message: 'Sign-in code sent. Check your email.' });
  } catch (error) {
    next(error);
  }
};

exports.verifyStorefrontLoginOtp = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    if (!email || !EMAIL_REGEX.test(email) || otp.length !== 6) {
      return res.status(400).json({ success: false, message: 'Enter the email and 6-digit sign-in code.' });
    }

    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer || customer.isActive !== true) {
      return res.status(401).json({ success: false, message: 'Invalid or expired sign-in code.' });
    }

    const result = await verifyMetadataOtp({
      customer,
      metadataKey: 'loginOtp',
      otp,
      missingMessage: 'Sign-in code is missing or expired. Request a new code.',
    });
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    const loginUpdates = { lastLoginAt: new Date(), metadata: result.metadata };
    if (!customer.emailVerifiedAt) {
      loginUpdates.emailVerifiedAt = new Date();
    }
    await customer.update(loginUpdates);
    return res.status(200).json({ success: true, data: shopperAuthResponse(customer) });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontCustomerSession = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: { customer: toSafeShopper(req.storefrontCustomer) } });
  } catch (error) {
    next(error);
  }
};

exports.updateStorefrontCustomerProfile = async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.name !== undefined) {
      const name = compact(req.body.name, 160);
      if (name.length < 2) {
        return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
      }
      updates.name = name;
    }
    if (req.body?.phone !== undefined) {
      const phone = compact(req.body.phone, 40);
      if (!phone) {
        return res.status(400).json({ success: false, message: PHONE_REQUIRED_MESSAGE });
      }
      updates.phone = phone;
    } else {
      return res.status(400).json({ success: false, message: PHONE_REQUIRED_MESSAGE });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Provide a name or phone number to update.' });
    }

    const customer = await req.storefrontCustomer.update(updates);
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { customer: toSafeShopper(customer) },
    });
  } catch (error) {
    next(error);
  }
};

exports.uploadStorefrontCustomerAvatar = async (req, res, next) => {
  try {
    const file = getUploadedAvatarFile(req);
    if (!file) {
      return res.status(400).json({ success: false, message: 'Choose an avatar image to upload.' });
    }

    if (!STOREFRONT_AVATAR_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Avatar must be a JPG, PNG, WebP, or GIF image.' });
    }

    if (!file.buffer || !file.buffer.length) {
      return res.status(400).json({ success: false, message: 'Unable to process uploaded avatar.' });
    }

    const customer = req.storefrontCustomer;
    const metadata = getMetadata(customer);
    const previousAvatar = metadata.avatar && typeof metadata.avatar === 'object' ? metadata.avatar : null;
    const subDir = path.join(STOREFRONT_AVATAR_UPLOAD_DIR, customer.id);
    const uploadPath = path.join(baseUploadDir, subDir);
    ensureDirExists(uploadPath);

    const extension = avatarExtensionForMimeType(file.mimetype);
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sanitizeUploadName(file.originalname)}${extension}`;
    const relativeStoragePath = path.join(subDir, filename);
    await fs.promises.writeFile(path.join(uploadPath, filename), file.buffer);

    const avatar = {
      url: `/uploads/${relativeStoragePath.replace(/\\/g, '/')}`,
      storagePath: relativeStoragePath.replace(/\\/g, '/'),
      mimeType: file.mimetype,
      size: file.size || file.buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    const updatedCustomer = await customer.update({
      metadata: {
        ...metadata,
        avatar,
      },
    });
    await deleteAvatarFileIfLocal(previousAvatar);

    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully.',
      data: { customer: toSafeShopper(updatedCustomer) },
    });
  } catch (error) {
    next(error);
  }
};

exports.removeStorefrontCustomerAvatar = async (req, res, next) => {
  try {
    const customer = req.storefrontCustomer;
    const metadata = getMetadata(customer);
    const previousAvatar = metadata.avatar && typeof metadata.avatar === 'object' ? metadata.avatar : null;
    const { avatar, ...nextMetadata } = metadata;

    const updatedCustomer = await customer.update({ metadata: nextMetadata });
    await deleteAvatarFileIfLocal(previousAvatar);

    return res.status(200).json({
      success: true,
      message: 'Avatar removed successfully.',
      data: { customer: toSafeShopper(updatedCustomer) },
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyStorefrontCustomerEmail = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || req.body?.code || '').replace(/\D/g, '').slice(0, 6);

    if (!email || !EMAIL_REGEX.test(email) || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Enter the email and 6-digit verification code.',
      });
    }

    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Shopper account not found.' });
    }
    if (customer.isActive !== true) {
      if (!isLegacyPendingVerificationShopper(customer)) {
        return res.status(403).json({
          success: false,
          message: 'This shopper account is inactive. Contact support for help.',
          errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
        });
      }
      const metadata = getMetadata(customer);
      metadata.reactivatedFromLegacyPendingAt = new Date().toISOString();
      await customer.update({ isActive: true, metadata });
    }
    if (customer.emailVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
        errorCode: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    const metadata = getMetadata(customer);
    const verification = metadata.emailVerification && typeof metadata.emailVerification === 'object'
      ? metadata.emailVerification
      : null;
    if (!verification?.otpHash || !verification?.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is missing or expired. Request a new code.',
        errorCode: 'STOREFRONT_OTP_REQUIRED',
      });
    }
    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      delete metadata.emailVerification;
      await customer.update({ metadata });
      return res.status(400).json({
        success: false,
        message: 'Verification code expired. Request a new code.',
        errorCode: 'STOREFRONT_OTP_EXPIRED',
      });
    }
    if (Number(verification.attempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: 'Too many verification attempts. Request a new code.',
        errorCode: 'STOREFRONT_OTP_LOCKED',
      });
    }

    const isMatch = await bcrypt.compare(otp, verification.otpHash);
    if (!isMatch) {
      metadata.emailVerification = {
        ...verification,
        attempts: Number(verification.attempts || 0) + 1,
      };
      await customer.update({ metadata });
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code.',
        errorCode: 'STOREFRONT_OTP_INVALID',
      });
    }

    delete metadata.emailVerification;
    await customer.update({
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      metadata,
    });

    res.status(200).json({ success: true, data: shopperAuthResponse(customer) });
  } catch (error) {
    next(error);
  }
};

exports.resendStorefrontCustomerVerification = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }

    const customer = await StorefrontCustomer.findOne({ where: { email } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Shopper account not found.' });
    }
    if (customer.isActive !== true) {
      if (!isLegacyPendingVerificationShopper(customer)) {
        return res.status(403).json({
          success: false,
          message: 'This shopper account is inactive. Contact support for help.',
          errorCode: 'STOREFRONT_ACCOUNT_INACTIVE',
        });
      }
      const metadata = getMetadata(customer);
      metadata.reactivatedFromLegacyPendingAt = new Date().toISOString();
      await customer.update({ isActive: true, metadata });
    }
    if (customer.emailVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
        errorCode: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    const sendResult = await sendStorefrontVerificationOtp(customer);
    if (!sendResult?.success) {
      if (sendResult?.otpLogged && process.env.NODE_ENV !== 'production') {
        const response = verificationPendingResponse(
          customer,
          'Verification code generated. Email delivery failed, but the code was logged in backend logs for local development.'
        );
        return res.status(200).json({
          ...response,
          data: {
            ...response.data,
            verificationEmailSent: false,
            verificationEmailError: sendResult?.error || 'Could not send verification code.',
          },
        });
      }

      return res.status(503).json({
        success: false,
        message: sendResult?.error || 'Could not send verification code. Please try again later.',
        errorCode: 'STOREFRONT_VERIFICATION_SEND_FAILED',
      });
    }

    res.status(200).json(verificationPendingResponse(
      customer,
      'Verification code sent. Check your email to activate your shopper account.'
    ));
  } catch (error) {
    next(error);
  }
};

exports.listStorefrontWishlist = async (req, res, next) => {
  try {
    const wishlist = await getWishlistResponse(req.storefrontCustomer.id);
    return res.status(200).json({
      success: true,
      data: wishlist,
    });
  } catch (error) {
    next(error);
  }
};

exports.addStorefrontWishlistItem = async (req, res, next) => {
  try {
    const listingId = compact(req.body?.listingId || req.body?.id, 80);
    if (!listingId) {
      return res.status(400).json({ success: false, message: 'Listing ID is required.' });
    }

    const listing = await OnlineProductListing.findOne({
      where: { id: listingId, status: 'published' },
      include: wishlistListingIncludes,
    });

    if (!listing || listing.product?.isActive === false) {
      return res.status(404).json({ success: false, message: 'This product is not available to save.' });
    }

    const stores = await getWishlistStores([listing]);
    const store = stores.get(storefrontKeyForListing(listing));
    if (!store?.enabled) {
      return res.status(404).json({ success: false, message: 'This store is not available right now.' });
    }

    let item;
    try {
      [item] = await StorefrontWishlistItem.findOrCreate({
        where: {
          storefrontCustomerId: req.storefrontCustomer.id,
          listingId: listing.id,
        },
        defaults: {
          storefrontCustomerId: req.storefrontCustomer.id,
          tenantId: listing.tenantId,
          shopId: listing.shopId || null,
          listingId: listing.id,
          productId: listing.productId,
          productVariantId: listing.productVariantId || null,
          metadata: {
            savedFrom: 'storefront',
          },
        },
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      item = await StorefrontWishlistItem.findOne({
        where: {
          storefrontCustomerId: req.storefrontCustomer.id,
          listingId: listing.id,
        },
      });
    }

    const hydratedItem = await StorefrontWishlistItem.findOne({
      where: { id: item.id },
      include: wishlistItemInclude,
    });
    const variantMap = await getWishlistVariantMap([listing]);

    return res.status(201).json({
      success: true,
      message: 'Saved to wishlist.',
      data: {
        item: toWishlistProduct(hydratedItem, stores, variantMap),
        ...(await getWishlistResponse(req.storefrontCustomer.id)),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.removeStorefrontWishlistItem = async (req, res, next) => {
  try {
    const listingId = compact(req.params?.listingId || req.body?.listingId, 80);
    if (!listingId) {
      return res.status(400).json({ success: false, message: 'Listing ID is required.' });
    }

    await StorefrontWishlistItem.destroy({
      where: {
        storefrontCustomerId: req.storefrontCustomer.id,
        listingId,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Removed from wishlist.',
      data: await getWishlistResponse(req.storefrontCustomer.id),
    });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontWishlistStatus = async (req, res, next) => {
  try {
    const listingId = compact(req.params?.listingId || req.query?.listingId, 80);
    if (!listingId) {
      return res.status(400).json({ success: false, message: 'Listing ID is required.' });
    }

    const item = await StorefrontWishlistItem.findOne({
      where: {
        storefrontCustomerId: req.storefrontCustomer.id,
        listingId,
      },
      include: wishlistItemInclude,
    });

    if (!item) {
      return res.status(200).json({
        success: true,
        data: { saved: false, item: null },
      });
    }

    const listing = item.listing;
    const [variantsByProductId, storesByListingKey] = await Promise.all([
      getWishlistVariantMap([listing]),
      getWishlistStores([listing]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        saved: true,
        item: toWishlistProduct(item, storesByListingKey, variantsByProductId),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleStorefrontWishlistItem = async (req, res, next) => {
  try {
    const listingId = compact(req.body?.listingId || req.body?.id, 80);
    if (!listingId) {
      return res.status(400).json({ success: false, message: 'Listing ID is required.' });
    }

    const removed = await StorefrontWishlistItem.destroy({
      where: {
        storefrontCustomerId: req.storefrontCustomer.id,
        listingId,
      },
    });

    if (removed > 0) {
      return res.status(200).json({
        success: true,
        message: 'Removed from wishlist.',
        data: {
          saved: false,
          ...(await getWishlistResponse(req.storefrontCustomer.id)),
        },
      });
    }

    req.body.listingId = listingId;
    return exports.addStorefrontWishlistItem(req, res, next);
  } catch (error) {
    next(error);
  }
};

const buildStorefrontCheckoutDraft = async ({ shopper, body, transaction = null }) => {
  assertShopperAuthenticated(shopper);

  const storeSlug = compact(body?.storeSlug, 80).toLowerCase();
  const requestedItems = Array.isArray(body?.items) ? body.items : [];
  if (!storeSlug || requestedItems.length === 0) {
    buildCheckoutHttpError(400, 'Store and at least one cart item are required.');
  }

  const store = await resolveStoreForOrder(storeSlug, transaction);
  if (!store) {
    buildCheckoutHttpError(404, 'Store not found or not launched.');
  }

  const requestedByListing = requestedItems.reduce((map, item) => {
    const listingId = compact(item.listingId || item.id, 80);
    const quantity = parseQuantity(item.quantity);
    if (!listingId || !quantity) return map;
    const existing = map.get(listingId) || { listingId, quantity: 0 };
    existing.quantity = Math.min(existing.quantity + quantity, 100);
    map.set(listingId, existing);
    return map;
  }, new Map());
  const normalizedItems = [...requestedByListing.values()];
  if (normalizedItems.length === 0) {
    buildCheckoutHttpError(400, 'At least one valid cart item quantity is required.');
  }
  const listingIds = normalizedItems.map((item) => item.listingId);
  const listings = await attachLockedStockToListings(
    await OnlineProductListing.findAll({
      where: {
        id: { [Op.in]: listingIds },
        tenantId: store.tenantId,
        status: 'published',
        ...(store.shopId ? { shopId: store.shopId } : {}),
      },
      include: listingIncludeForOrder,
      transaction,
    }),
    store.tenantId,
    transaction,
  );
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));

  const saleItems = [];
  for (const requested of normalizedItems) {
    const listingId = requested.listingId;
    const quantity = requested.quantity;
    const listing = listingById.get(listingId);
    if (!listing || !quantity) {
      buildCheckoutHttpError(400, 'One or more cart items are no longer available.');
    }

    const listingMeta = listing.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
    const productMeta = listing.product?.metadata && typeof listing.product.metadata === 'object'
      ? listing.product.metadata
      : {};
    if (listingMeta.isSample === true || productMeta.isSample === true) {
      buildCheckoutHttpError(400, 'Sample products cannot be purchased.');
    }

    const availability = getListingAvailability(listing);
    const allowOversell = listing.inventoryPolicy === 'continue';
    if ((!availability.available || availability.quantityOnHand < quantity) && !allowOversell) {
      const err = new Error(availability.message || `${listing.title} does not have enough stock for checkout.`);
      err.statusCode = 409;
      throw err;
    }

    const unitPrice = money(listing.publicPrice);
    const listingImages = Array.isArray(listing.images) ? listing.images : [];
    saleItems.push({
      listing,
      quantity,
      productId: listing.productId,
      productVariantId: listing.productVariantId || null,
      name: listing.title,
      sku: listing.variant?.sku || listing.product?.sku || null,
      imageUrl: listingImages[0] || listing.product?.imageUrl || null,
      unitPrice,
      subtotal: money(unitPrice * quantity),
      total: money(unitPrice * quantity),
      availability,
    });
  }

  const fulfillmentMethod = compact(body?.fulfillmentMethod || 'pickup', 30);
  const deliveryRequired = fulfillmentMethod === 'delivery';
  if (deliveryRequired && store.deliveryEnabled !== true) {
    buildCheckoutHttpError(400, 'Delivery is not available for this store.');
  }
  if (!deliveryRequired && store.pickupEnabled === false) {
    buildCheckoutHttpError(400, 'Pickup is not available for this store.');
  }

  const rawDeliveryAddress = body?.deliveryAddress && typeof body.deliveryAddress === 'object'
    ? body.deliveryAddress
    : {};
  const deliveryAddress = deliveryRequired ? normalizeAddress(rawDeliveryAddress) : {};
  if (deliveryRequired) {
    const validationError = validateAddress(deliveryAddress);
    if (validationError) {
      buildCheckoutHttpError(400, validationError);
    }
  }

  const subtotal = money(saleItems.reduce((sum, item) => sum + item.subtotal, 0));
  const storeMetadata = store.metadata && typeof store.metadata === 'object' ? store.metadata : {};
  const freeDeliveryThreshold = storeMetadata.freeDeliveryThreshold != null
    ? money(storeMetadata.freeDeliveryThreshold)
    : null;
  let deliveryFee = deliveryRequired ? money(store.deliveryFee) : 0;
  let deliveryFeeWaived = false;
  if (deliveryRequired && freeDeliveryThreshold != null && subtotal >= freeDeliveryThreshold) {
    deliveryFee = 0;
    deliveryFeeWaived = true;
  }
  const total = money(subtotal + deliveryFee);

  return {
    store,
    saleItems,
    fulfillmentMethod: deliveryRequired ? 'delivery' : 'pickup',
    deliveryRequired,
    deliveryAddress,
    subtotal,
    deliveryFee,
    deliveryFeeWaived,
    freeDeliveryThreshold,
    total,
    notes: compact(body?.notes, 1000) || null,
  };
};

const createPendingStorefrontSaleFromCheckout = async ({ shopper, body, transaction, commerceChannel }) => {
  const draft = await buildStorefrontCheckoutDraft({ shopper, body, transaction });
  const {
    store,
    saleItems,
    deliveryRequired,
    deliveryAddress,
    subtotal,
    deliveryFee,
    total,
    fulfillmentMethod,
    notes,
  } = draft;

  const channel = usesTradeAssurance(commerceChannel)
    ? COMMERCE_CHANNELS.SABITO_MARKETPLACE
    : COMMERCE_CHANNELS.ONLINE_STORE;

  const tenantCustomer = await findOrCreateTenantCustomer({
    shopper,
    store,
    deliveryAddress,
    transaction,
  });
  const saleNumber = await getNextSaleNumber(store.tenantId, transaction);

  const sale = await Sale.create({
    tenantId: store.tenantId,
    shopId: store.shopId || null,
    customerId: tenantCustomer.id,
    saleNumber,
    subtotal,
    discount: 0,
    tax: 0,
    total,
    paymentMethod: 'other',
    amountPaid: 0,
    change: 0,
    status: 'pending',
    orderStatus: 'received',
    deliveryRequired,
    deliveryFee,
    notes,
    metadata: {
      source: ONLINE_STORE_SOURCE,
      commerceChannel: channel,
      storefrontCustomerId: shopper.id,
      storefrontCustomerEmail: shopper.email,
      storefrontCustomerEmailVerified: Boolean(shopper.emailVerifiedAt),
      storeSlug: store.slug,
      fulfillmentMethod,
      deliveryAddress: deliveryRequired ? deliveryAddress : null,
      deliveryTracking: {
        status: 'received',
        history: [{
          status: 'received',
          at: new Date().toISOString(),
          source: 'storefront_checkout',
        }],
      },
      ...(channel === COMMERCE_CHANNELS.SABITO_MARKETPLACE
        ? { tradeAssurance: { paymentStatus: 'awaiting_payment' } }
        : { directPayment: { paymentStatus: 'awaiting_payment' }, tradeAssurance: { paymentStatus: 'awaiting_payment' } }),
    },
  }, { transaction });

  await SaleItem.bulkCreate(saleItems.map((item) => ({
    saleId: sale.id,
    productId: item.productId,
    productVariantId: item.productVariantId,
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: 0,
    tax: 0,
    subtotal: item.subtotal,
    total: item.total,
    metadata: {
      onlineListingId: item.listing.id,
      imageUrl: item.imageUrl,
      source: ONLINE_STORE_SOURCE,
      commerceChannel: channel,
    },
  })), { transaction });

  for (const item of saleItems) {
    if (!item.availability.trackStock) continue;
    const shopId = store.shopId || item.listing?.shopId || item.availability?.product?.shopId || null;
    if (shopId && store.tenantId && item.productId) {
      await applyStockChange({
        tenantId: store.tenantId,
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        shopId,
        delta: -item.quantity,
        type: 'sale',
        reason: sale.saleNumber ? `Storefront sale ${sale.saleNumber}` : 'Storefront sale',
        reference: `sale:${sale.id}`,
        metadata: { source: 'storefrontCheckout' },
        transaction,
      });
      continue;
    }
    const nextQuantity = Math.max(0, item.availability.quantityOnHand - item.quantity);
    await item.availability.target.update({ quantityOnHand: nextQuantity }, { transaction });
  }

  await SaleActivity.create({
    saleId: sale.id,
    tenantId: store.tenantId,
    type: 'note',
    subject: 'Online order created',
    notes: `Online order ${sale.saleNumber} created by authenticated shopper ${shopper.email}`,
    createdBy: null,
    metadata: {
      source: ONLINE_STORE_SOURCE,
      commerceChannel: channel,
      storefrontCustomerId: shopper.id,
    },
  }, { transaction });

  return { sale, store, shopper, subtotal, deliveryFee, total, commerceChannel: channel };
};

const toInitializedOrderPayload = (sale, store, totals) => ({
  id: sale.id,
  saleNumber: sale.saleNumber,
  status: sale.status,
  orderStatus: sale.orderStatus,
  subtotal: totals.subtotal,
  deliveryFee: totals.deliveryFee,
  total: totals.total,
  currency: store.currency || DEFAULT_CURRENCY,
  paymentStatus: 'awaiting_payment',
  storeSlug: store?.slug || null,
  storeName: store?.displayName || null,
  storeWhatsappNumber: store?.whatsappNumber || null,
  storeContactPhone: store?.contactPhone || null,
});

exports.createStorefrontOrder = async (req, res, next) => {
  try {
    return res.status(402).json({
      success: false,
      message: 'Payment is required before placing an order. Start Paystack checkout instead.',
      errorCode: 'STOREFRONT_PAYMENT_REQUIRED',
    });
  } catch (error) {
    next(error);
  }
};

exports.initializeStorefrontOrderPaystack = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const shopper = req.storefrontCustomer;
    const commerceChannel = resolveCommerceChannelFromRequest(req, req.body || {});
    const checkout = await createPendingStorefrontSaleFromCheckout({
      shopper,
      body: req.body,
      transaction,
      commerceChannel,
    });
    const { sale, store, subtotal, deliveryFee, total } = checkout;
    const channel = checkout.commerceChannel;

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        message: 'Online payment is not configured.',
        errorCode: 'PAYSTACK_NOT_CONFIGURED',
      });
    }

    const callbackUrl = `${getStorefrontBaseUrl(channel)}/checkout/paystack-callback?paystack=1`;
    let paystackReference = makeStorefrontPaystackReference(sale.id);
    const amountPesewas = Math.round(total * 100);
    const metadata = {
      type: paystackOrderTypeForChannel(channel),
      commerceChannel: channel,
      saleId: sale.id,
      tenantId: store.tenantId,
      storefrontCustomerId: shopper.id,
      storeSlug: store.slug,
    };

    const saleMetadata = getSaleMetadata(sale);
    const awaitingPayment = {
      paymentStatus: 'awaiting_payment',
      paystackReference,
    };
    if (usesTradeAssurance(channel)) {
      saleMetadata.tradeAssurance = {
        ...(saleMetadata.tradeAssurance || {}),
        ...awaitingPayment,
      };
    } else {
      saleMetadata.directPayment = {
        ...(saleMetadata.directPayment || {}),
        ...awaitingPayment,
      };
      saleMetadata.tradeAssurance = {
        ...(saleMetadata.tradeAssurance || {}),
        ...awaitingPayment,
      };
    }
    await sale.update({ metadata: saleMetadata }, { transaction });

    const buildInit = (reference, channels) => paystackService.initializeTransaction({
      email: shopper.email,
      amount: amountPesewas,
      currency: store.currency || DEFAULT_CURRENCY,
      callback_url: callbackUrl,
      reference,
      metadata,
      channels,
    });

    let result;
    try {
      result = await buildInit(paystackReference, ['card', 'mobile_money']);
    } catch (paystackErr) {
      if (paystackErr?.response?.status === 403) {
        paystackReference = makeStorefrontPaystackReference(sale.id);
        if (usesTradeAssurance(channel)) {
          saleMetadata.tradeAssurance.paystackReference = paystackReference;
        } else {
          saleMetadata.directPayment.paystackReference = paystackReference;
          saleMetadata.tradeAssurance.paystackReference = paystackReference;
        }
        await sale.update({ metadata: saleMetadata }, { transaction });
        try {
          result = await buildInit(paystackReference, ['card']);
        } catch (retryErr) {
          await transaction.rollback();
          return sendStorefrontPaystackInitializeFailure(res, sale.id, retryErr);
        }
      } else {
        await transaction.rollback();
        return sendStorefrontPaystackInitializeFailure(res, sale.id, paystackErr);
      }
    }

    if (!result?.status || !result?.data?.authorization_url) {
      await transaction.rollback();
      return res.status(502).json({
        success: false,
        message: result?.message || 'Failed to initialize payment.',
        errorCode: 'STOREFRONT_PAYSTACK_INIT_FAILED',
      });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        authorization_url: result.data.authorization_url,
        reference: result.data.reference || paystackReference,
        access_code: result.data.access_code,
        order: {
          ...toInitializedOrderPayload(sale, store, { subtotal, deliveryFee, total }),
          commerceChannel: channel,
        },
        verification: {
          isEmailVerified: Boolean(shopper.emailVerifiedAt),
          warning: shopper.emailVerifiedAt ? null : 'Email verification is pending for this shopper account.',
        },
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode || undefined,
      });
    }
    return next(error);
  }
};

exports.verifyStorefrontOrderPaystack = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const shopper = req.storefrontCustomer;
    if (!shopper) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: 'Sign in or create a shopper account to checkout.',
        errorCode: 'STOREFRONT_AUTH_REQUIRED',
      });
    }

    const reference = compact(
      req.body?.reference || req.query?.reference || req.query?.trxref,
      160,
    );
    if (!reference) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing Paystack reference. After payment, the URL usually includes reference= or trxref=.',
        errorCode: 'STOREFRONT_PAYSTACK_REFERENCE_REQUIRED',
      });
    }

    const paystackService = require('../services/paystackService');
    if (!paystackService.secretKey) {
      await transaction.rollback();
      return res.status(503).json({
        success: false,
        message: 'Online payment is not configured.',
        errorCode: 'PAYSTACK_NOT_CONFIGURED',
      });
    }

    let verifyResult;
    try {
      verifyResult = await paystackService.verifyTransaction(reference);
    } catch (paystackErr) {
      await transaction.rollback();
      const fromProvider = paystackService.userFacingPaystackErrorMessage(paystackErr);
      return res.status(502).json({
        success: false,
        message: fromProvider || 'Could not reach Paystack to verify this payment. Try again shortly.',
        errorCode: 'STOREFRONT_PAYSTACK_VERIFY_FAILED',
      });
    }

    if (!verifyResult?.status || !verifyResult?.data) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: verifyResult?.message || 'Paystack could not verify this reference.',
        errorCode: 'STOREFRONT_PAYSTACK_VERIFY_FAILED',
      });
    }

    const tx = verifyResult.data;
    if (tx.status !== 'success') {
      await transaction.rollback();
      return res.status(402).json({
        success: false,
        message: tx.gateway_response || 'Payment was not completed. Try again or use a different method.',
        errorCode: 'STOREFRONT_PAYSTACK_NOT_SUCCESS',
        data: { paystackStatus: tx.status },
      });
    }

    const txMetadata = getStorefrontPaystackMetadata(parsePaystackTransactionMetadata(tx));
    const orderType = String(txMetadata.type || '').toLowerCase();
    const isStorefrontPaystackOrder = (
      orderType === PAYSTACK_ORDER_TYPES.SABITO_MARKETPLACE
      || orderType === PAYSTACK_ORDER_TYPES.ONLINE_STORE
      || orderType === 'storefront_order'
      || orderType === 'online_store_order'
    );
    if (!isStorefrontPaystackOrder || !txMetadata.saleId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This Paystack receipt does not match a storefront order.',
        errorCode: 'STOREFRONT_PAYSTACK_REFERENCE_MISMATCH',
      });
    }

    if (String(txMetadata.storefrontCustomerId) !== String(shopper.id)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'This payment does not belong to your shopper account.',
        errorCode: 'STOREFRONT_PAYSTACK_CUSTOMER_MISMATCH',
      });
    }

    const sale = await Sale.findOne({
      where: shopperOrderWhere(shopper.id, { id: txMetadata.saleId }),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Order not found for this payment.',
        errorCode: 'STOREFRONT_ORDER_NOT_FOUND',
      });
    }

    const store = await OnlineStoreSettings.findOne({
      where: {
        tenantId: sale.tenantId,
        slug: txMetadata.storeSlug || getSaleMetadata(sale).storeSlug || '',
      },
      transaction,
    });

    const saleMetadata = getSaleMetadata(sale);
    const channel = getSaleCommerceChannel({
      ...saleMetadata,
      commerceChannel: txMetadata.commerceChannel || saleMetadata.commerceChannel || (
        orderType === PAYSTACK_ORDER_TYPES.SABITO_MARKETPLACE || orderType === 'storefront_order'
          ? COMMERCE_CHANNELS.SABITO_MARKETPLACE
          : COMMERCE_CHANNELS.ONLINE_STORE
      ),
    });
    const holdTradeAssurance = usesTradeAssurance(channel);
    const tradeAssurance = saleMetadata.tradeAssurance || {};
    const directPayment = saleMetadata.directPayment || {};
    const expectedReference = tradeAssurance.paystackReference || directPayment.paystackReference;
    const paystackReference = tx.reference || reference;
    if (expectedReference && expectedReference !== reference && expectedReference !== paystackReference) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This Paystack receipt does not match this order.',
        errorCode: 'STOREFRONT_PAYSTACK_REFERENCE_MISMATCH',
      });
    }

    const expectedPesewas = Math.round(Number(sale.total) * 100);
    if (Number(tx.amount) !== expectedPesewas) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payment amount does not match order total.',
        errorCode: 'STOREFRONT_PAYSTACK_AMOUNT_MISMATCH',
      });
    }

    const paidStatuses = new Set(['paid_held', 'paid', 'paid_direct']);
    const currentPaymentStatus = tradeAssurance.paymentStatus || directPayment.paymentStatus;
    if (paidStatuses.has(currentPaymentStatus) || sale.status === 'completed') {
      await transaction.commit();
      notifyOnlineStoreOrderReceived({ sale, shopper, store }).catch((notifyError) => {
        console.error('[Storefront] Failed to backfill seller notification for online order', notifyError.message);
      });
      return res.status(200).json({
        success: true,
        data: {
          alreadyPaid: true,
          order: {
            id: sale.id,
            saleNumber: sale.saleNumber,
            status: sale.status,
            orderStatus: sale.orderStatus,
            subtotal: Number(sale.subtotal || 0),
            deliveryFee: Number(sale.deliveryFee || 0),
            total: Number(sale.total || 0),
            currency: store?.currency || DEFAULT_CURRENCY,
            paymentStatus: holdTradeAssurance ? 'paid_held' : 'paid',
            commerceChannel: channel,
            storeSlug: store?.slug || txMetadata.storeSlug || getSaleMetadata(sale).storeSlug || null,
            storeName: store?.displayName || null,
            storeWhatsappNumber: store?.whatsappNumber || null,
            storeContactPhone: store?.contactPhone || null,
          },
        },
      });
    }

    if (currentPaymentStatus !== 'awaiting_payment' || sale.status !== 'pending') {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'This order is not awaiting payment.',
        errorCode: 'STOREFRONT_ORDER_NOT_AWAITING_PAYMENT',
      });
    }

    if (holdTradeAssurance) {
      await recordHeldPaymentForSale({
        sale,
        store: store || { currency: DEFAULT_CURRENCY, slug: txMetadata.storeSlug },
        shopper,
        transaction,
        provider: 'paystack',
        providerReference: reference,
      });
    } else {
      await recordDirectPaidPaymentForSale({
        sale,
        store: store || { currency: DEFAULT_CURRENCY, slug: txMetadata.storeSlug },
        shopper,
        transaction,
        provider: 'paystack',
        providerReference: reference,
      });
    }

    await SaleActivity.create({
      saleId: sale.id,
      tenantId: sale.tenantId,
      type: 'payment',
      subject: 'Online order payment confirmed',
      notes: `Paystack payment ${reference} confirmed for order ${sale.saleNumber}`,
      createdBy: null,
      metadata: {
        source: ONLINE_STORE_SOURCE,
        commerceChannel: channel,
        storefrontCustomerId: shopper.id,
        paystackReference: reference,
      },
    }, { transaction });

    await transaction.commit();

    notifyOnlineStoreOrderReceived({ sale, shopper, store }).catch((notifyError) => {
      console.error('[Storefront] Failed to notify seller about online order', notifyError.message);
    });

    return res.status(200).json({
      success: true,
      data: {
        order: {
          id: sale.id,
          saleNumber: sale.saleNumber,
          status: 'completed',
          orderStatus: sale.orderStatus,
          subtotal: Number(sale.subtotal || 0),
          deliveryFee: Number(sale.deliveryFee || 0),
          total: Number(sale.total || 0),
          currency: store?.currency || DEFAULT_CURRENCY,
          paymentStatus: holdTradeAssurance ? 'paid_held' : 'paid',
          commerceChannel: channel,
          storeSlug: store?.slug || txMetadata.storeSlug || getSaleMetadata(sale).storeSlug || null,
          storeName: store?.displayName || null,
          storeWhatsappNumber: store?.whatsappNumber || null,
          storeContactPhone: store?.contactPhone || null,
        },
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    return next(error);
  }
};

exports.listStorefrontCustomerOrders = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 20, 1), 50);
    const offset = (page - 1) * limit;
    const where = shopperOrderWhere(req.storefrontCustomer.id);

    const { count, rows } = await Sale.findAndCountAll({
      where,
      include: [
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    const storeLabels = await getStoreLabelsForOrders(rows);

    return res.status(200).json({
      success: true,
      count,
      page,
      totalPages: Math.ceil(count / limit) || 1,
      data: {
        orders: rows.map((order) => toOrderSummary(order, storeLabels)),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontCustomerOrder = async (req, res, next) => {
  try {
    const order = await Sale.findOne({
      where: shopperOrderWhere(req.storefrontCustomer.id, { id: req.params.id }),
      include: [
        orderDetailItemInclude,
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
      ],
      order: [[{ model: SaleItem, as: 'items' }, 'createdAt', 'ASC']],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const storeLabels = await getStoreLabelsForOrders([order]);
    const orderDetail = toOrderDetail(order, storeLabels);
    orderDetail.reviewActions = await getOrderReviewActions(order);
    return res.status(200).json({
      success: true,
      data: {
        order: orderDetail,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.trackStorefrontOrder = async (req, res, next) => {
  try {
    const reference = compact(req.query?.reference || req.query?.orderReference, 80).toUpperCase();
    const contact = compact(req.query?.contact || req.query?.email || req.query?.phone, 160);

    if (!reference || !contact) {
      return res.status(400).json({
        success: false,
        message: 'Enter your order reference and the email or phone used at checkout.',
        errorCode: 'TRACKING_REFERENCE_AND_CONTACT_REQUIRED',
      });
    }

    const order = await Sale.findOne({
      where: {
        saleNumber: reference,
        [Op.and]: [sequelize.where(saleMetadataJsonKey('source'), ONLINE_STORE_SOURCE)],
      },
      include: [
        { model: SaleItem, as: 'items', required: false },
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
        { model: Customer, as: 'customer', attributes: ['id', 'email', 'phone'], required: false },
      ],
      order: [[{ model: SaleItem, as: 'items' }, 'createdAt', 'ASC']],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'We could not find an online order with that reference.',
        errorCode: 'STOREFRONT_ORDER_NOT_FOUND',
      });
    }

    const plain = order.get({ plain: true });
    const metadata = getSaleMetadata(plain);
    if (!contactMatches(contact, getOrderContactCandidates(plain, metadata))) {
      return res.status(403).json({
        success: false,
        message: 'The email or phone does not match this order. Check the checkout contact and try again.',
        errorCode: 'STOREFRONT_ORDER_CONTACT_MISMATCH',
      });
    }

    const storeLabels = await getStoreLabelsForOrders([plain]);
    return res.status(200).json({
      success: true,
      data: {
        order: toPublicTrackingOrder(plain, storeLabels),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmStorefrontOrderReceived = async (req, res, next) => {
  try {
    parseConfirmationReviewPayload(req.body || {});
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message,
      errorCode: error.code || 'INVALID_CONFIRMATION_PAYLOAD',
    });
  }

  const transaction = await sequelize.transaction();
  try {
    const order = await Sale.findOne({
      where: shopperOrderWhere(req.storefrontCustomer.id, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (['cancelled', 'refunded'].includes(order.status)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Cancelled or refunded orders cannot be confirmed received.' });
    }

    const metadata = getSaleMetadata(order);
    if (metadata.dispute?.status === 'open') {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'Resolve the open dispute before confirming this order.' });
    }
    if (!isSellerMarkedDelivered(order)) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'The seller must mark this order delivered before you can confirm receipt.',
        errorCode: 'ORDER_NOT_DELIVERED',
      });
    }

    const confirmedAt = metadata.confirmedReceivedAt || new Date().toISOString();
    metadata.confirmedReceivedAt = confirmedAt;
    metadata.storefrontActions = {
      ...(metadata.storefrontActions || {}),
      confirmReceived: {
        at: confirmedAt,
        byStorefrontCustomerId: req.storefrontCustomer.id,
      },
    };
    if (usesTradeAssurance(getSaleCommerceChannel(metadata))) {
      metadata.tradeAssurance = {
        ...(metadata.tradeAssurance || {}),
        buyerConfirmedAt: confirmedAt,
        payoutReleaseEligible: true,
      };
    }

    await order.update({
      orderStatus: order.orderStatus === 'cancelled' ? order.orderStatus : 'delivered',
      deliveryStatus: order.deliveryRequired ? 'delivered' : order.deliveryStatus,
      deliveredAt: order.deliveredAt || new Date(confirmedAt),
      metadata,
    }, { transaction });

    if (usesTradeAssurance(getSaleCommerceChannel(metadata))) {
      await markReleaseEligibleForSale({
        sale: order,
        confirmedAt,
        transaction,
      });
    }

    await SaleActivity.create({
      saleId: order.id,
      tenantId: order.tenantId,
      type: 'note',
      subject: 'Shopper confirmed order received',
      notes: `Shopper ${req.storefrontCustomer.email} confirmed receipt for online order ${order.saleNumber}.`,
      createdBy: null,
      metadata: {
        source: ONLINE_STORE_SOURCE,
        storefrontCustomerId: req.storefrontCustomer.id,
        action: 'confirm_received',
      },
    }, { transaction });

    await transaction.commit();

    const refreshed = await Sale.findOne({
      where: { id: order.id },
      include: [
        orderDetailItemInclude,
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
      ],
    });
    const storeLabels = await getStoreLabelsForOrders([refreshed]);
    const orderDetail = toOrderDetail(refreshed, storeLabels);
    orderDetail.reviewActions = await getOrderReviewActions(refreshed);

    return res.status(200).json({
      success: true,
      message: 'Order marked as received.',
      data: {
        order: orderDetail,
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.listPublicProductReviews = async (req, res, next) => {
  try {
    const listingId = compact(req.params?.listingId, 80);
    const listing = await OnlineProductListing.findOne({
      where: { id: listingId, status: 'published' },
      attributes: ['id', 'tenantId', 'shopId', 'title'],
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Product listing not found.' });
    }
    const summary = await getPublicReviewSummary({
      reviewType: 'product',
      tenantId: listing.tenantId,
      shopId: listing.shopId || null,
      listingId: listing.id,
      limit: Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 20, 1), 50),
    });
    return res.status(200).json({
      success: true,
      data: {
        summary,
        reviews: summary.reviews,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listPublicStoreReviews = async (req, res, next) => {
  try {
    const store = await OnlineStoreSettings.findOne({
      where: { slug: { [Op.iLike]: compact(req.params?.storeSlug, 80).toLowerCase() }, enabled: true },
      attributes: ['id', 'tenantId', 'shopId', 'slug', 'displayName'],
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found.' });
    }
    const summary = await getPublicReviewSummary({
      reviewType: 'store',
      tenantId: store.tenantId,
      shopId: store.shopId || null,
      limit: Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 20, 1), 50),
    });
    return res.status(200).json({
      success: true,
      data: {
        summary,
        reviews: summary.reviews,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getProductReviewEligibility = async (req, res, next) => {
  try {
    const listingId = compact(req.params?.listingId, 80);
    const saleId = compact(req.query?.saleId, 80) || null;
    console.info('[storefront-reviews] product eligibility request', {
      customerId: req.storefrontCustomer.id,
      listingId,
      saleId,
    });
    const data = await buildEligibilityResponse({
      reviewType: 'product',
      customerId: req.storefrontCustomer.id,
      listingId,
      saleId,
    });
    console.info('[storefront-reviews] product eligibility response', {
      customerId: req.storefrontCustomer.id,
      listingId,
      saleId: data.saleId || saleId,
      saleItemId: data.saleItemId || null,
      eligible: data.eligible === true,
      reason: data.reason || null,
      hasExistingReview: Boolean(data.existingReview),
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[storefront-reviews] product eligibility failed', {
      customerId: req.storefrontCustomer?.id || null,
      listingId: compact(req.params?.listingId, 80),
      saleId: compact(req.query?.saleId, 80) || null,
      message: error.message,
    });
    next(error);
  }
};

exports.getStoreReviewEligibility = async (req, res, next) => {
  try {
    const data = await buildEligibilityResponse({
      reviewType: 'store',
      customerId: req.storefrontCustomer.id,
      storeSlug: compact(req.params?.storeSlug, 80),
      saleId: compact(req.query?.saleId, 80) || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.createOrUpdateProductReview = async (req, res, next) => {
  try {
    const listingId = compact(req.params?.listingId, 80);
    console.info('[storefront-reviews] product review submit request', {
      customerId: req.storefrontCustomer.id,
      listingId,
      saleId: compact(req.body?.saleId, 80) || null,
      rating: req.body?.rating,
      hasTitle: Boolean(req.body?.title),
      hasComment: Boolean(req.body?.comment),
    });
    const result = await createOrUpdateVerifiedReview({
      reviewType: 'product',
      customerId: req.storefrontCustomer.id,
      listingId,
      payload: req.body || {},
    });
    console.info('[storefront-reviews] product review submit response', {
      customerId: req.storefrontCustomer.id,
      listingId,
      reviewId: result.review?.id || null,
      created: result.created === true,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? 'Product review published.' : 'Product review updated.',
      data: result,
    });
  } catch (error) {
    console.error('[storefront-reviews] product review submit failed', {
      customerId: req.storefrontCustomer?.id || null,
      listingId: compact(req.params?.listingId, 80),
      saleId: compact(req.body?.saleId, 80) || null,
      status: error.status || null,
      code: error.code || null,
      message: error.message,
    });
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message, errorCode: error.code || 'REVIEW_ERROR' });
    }
    next(error);
  }
};

exports.createOrUpdateStoreReview = async (req, res, next) => {
  try {
    const result = await createOrUpdateVerifiedReview({
      reviewType: 'store',
      customerId: req.storefrontCustomer.id,
      storeSlug: compact(req.params?.storeSlug, 80),
      payload: req.body || {},
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? 'Store review published.' : 'Store review updated.',
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message, errorCode: error.code || 'REVIEW_ERROR' });
    }
    next(error);
  }
};

exports.updateStorefrontReview = async (req, res, next) => {
  try {
    const result = await updateOwnReview({
      customerId: req.storefrontCustomer.id,
      reviewId: compact(req.params?.id, 80),
      payload: req.body || {},
    });
    return res.status(200).json({
      success: true,
      message: 'Review updated.',
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message, errorCode: 'REVIEW_ERROR' });
    }
    next(error);
  }
};

exports.openStorefrontOrderDispute = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const reason = compact(req.body?.reason || 'issue', 80) || 'issue';
    const message = compact(req.body?.message || req.body?.details, 1000);
    if (!message || message.length < 10) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Describe the issue in at least 10 characters.' });
    }

    const order = await Sale.findOne({
      where: shopperOrderWhere(req.storefrontCustomer.id, { id: req.params.id }),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const metadata = getSaleMetadata(order);
    if (!usesTradeAssurance(getSaleCommerceChannel(metadata))) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Trade Assurance disputes are only available for Sabito marketplace orders. Contact the seller for Online Store support.',
        errorCode: 'ONLINE_STORE_DISPUTE_NOT_SUPPORTED',
      });
    }
    if (metadata.dispute?.status === 'open') {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'This order already has an open issue.' });
    }

    const openedAt = new Date().toISOString();
    metadata.dispute = {
      id: crypto.randomUUID(),
      status: 'open',
      reason,
      message,
      openedAt,
      openedByStorefrontCustomerId: req.storefrontCustomer.id,
      openedByEmail: req.storefrontCustomer.email,
    };
    metadata.storefrontActions = {
      ...(metadata.storefrontActions || {}),
      openDispute: {
        at: openedAt,
        reason,
        byStorefrontCustomerId: req.storefrontCustomer.id,
      },
    };
    metadata.tradeAssurance = {
      ...(metadata.tradeAssurance || {}),
      disputeOpenedAt: openedAt,
      payoutHold: true,
    };

    await order.update({ metadata }, { transaction });
    await openDisputeForSale({
      sale: order,
      dispute: metadata.dispute,
      transaction,
    });
    await SaleActivity.create({
      saleId: order.id,
      tenantId: order.tenantId,
      type: 'note',
      subject: 'Shopper opened an order issue',
      notes: `${reason}: ${message}`,
      createdBy: null,
      metadata: {
        source: ONLINE_STORE_SOURCE,
        storefrontCustomerId: req.storefrontCustomer.id,
        action: 'open_dispute',
        disputeId: metadata.dispute.id,
      },
    }, { transaction });

    await transaction.commit();

    const refreshed = await Sale.findOne({
      where: { id: order.id },
      include: [
        orderDetailItemInclude,
        { model: Shop, as: 'shop', attributes: ['id', 'name'], required: false },
      ],
    });
    const storeLabels = await getStoreLabelsForOrders([refreshed]);

    return res.status(201).json({
      success: true,
      message: 'Issue reported. The seller can review it from the order activity.',
      data: { order: toOrderDetail(refreshed, storeLabels) },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.contactStorefrontOrderSeller = async (req, res, next) => {
  try {
    const order = await Sale.findOne({
      where: shopperOrderWhere(req.storefrontCustomer.id, { id: req.params.id }),
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name'], required: false }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const message = compact(req.body?.message || '', 1000);
    await SaleActivity.create({
      saleId: order.id,
      tenantId: order.tenantId,
      type: 'note',
      subject: 'Shopper requested seller support',
      notes: message || `Shopper ${req.storefrontCustomer.email} requested help with online order ${order.saleNumber}.`,
      createdBy: null,
      metadata: {
        source: ONLINE_STORE_SOURCE,
        storefrontCustomerId: req.storefrontCustomer.id,
        action: 'contact_seller',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Your message was added to the order for seller review.',
      data: {
        support: {
          orderId: order.id,
          saleNumber: order.saleNumber,
          storeName: order.shop?.name || getSaleMetadata(order).storeSlug || 'seller',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listStorefrontDeliveryAddresses = async (req, res, next) => {
  try {
    const { addresses, defaultDeliveryAddressId } = getAddressBook(req.storefrontCustomer);
    return res.status(200).json({
      success: true,
      data: { addresses, defaultDeliveryAddressId },
    });
  } catch (error) {
    next(error);
  }
};

exports.createStorefrontDeliveryAddress = async (req, res, next) => {
  try {
    const { metadata, addresses, defaultDeliveryAddressId } = getAddressBook(req.storefrontCustomer);
    if (addresses.length >= 10) {
      return res.status(400).json({ success: false, message: 'You can save up to 10 delivery addresses.' });
    }

    const address = normalizeAddress(req.body);
    const validationError = validateAddress(address);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const now = new Date().toISOString();
    const nextAddress = {
      id: crypto.randomUUID(),
      ...address,
      createdAt: now,
      updatedAt: now,
    };
    const nextDefaultId = req.body?.isDefault === true || addresses.length === 0
      ? nextAddress.id
      : defaultDeliveryAddressId;
    const saved = await saveAddressBook(req.storefrontCustomer, metadata, [...addresses, nextAddress], nextDefaultId);

    return res.status(201).json({
      success: true,
      message: 'Delivery address saved.',
      data: {
        address: saved.addresses.find((item) => item.id === nextAddress.id),
        addresses: saved.addresses,
        defaultDeliveryAddressId: saved.defaultDeliveryAddressId,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateStorefrontDeliveryAddress = async (req, res, next) => {
  try {
    const { metadata, addresses, defaultDeliveryAddressId } = getAddressBook(req.storefrontCustomer);
    const index = addresses.findIndex((address) => address.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Delivery address not found.' });
    }

    const normalized = normalizeAddress({ ...addresses[index], ...req.body });
    const validationError = validateAddress(normalized);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const nextAddresses = [...addresses];
    nextAddresses[index] = {
      ...addresses[index],
      ...normalized,
      updatedAt: new Date().toISOString(),
    };
    const nextDefaultId = req.body?.isDefault === true ? req.params.id : defaultDeliveryAddressId;
    const saved = await saveAddressBook(req.storefrontCustomer, metadata, nextAddresses, nextDefaultId);

    return res.status(200).json({
      success: true,
      message: 'Delivery address updated.',
      data: {
        address: saved.addresses.find((item) => item.id === req.params.id),
        addresses: saved.addresses,
        defaultDeliveryAddressId: saved.defaultDeliveryAddressId,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteStorefrontDeliveryAddress = async (req, res, next) => {
  try {
    const { metadata, addresses, defaultDeliveryAddressId } = getAddressBook(req.storefrontCustomer);
    const nextAddresses = addresses.filter((address) => address.id !== req.params.id);
    if (nextAddresses.length === addresses.length) {
      return res.status(404).json({ success: false, message: 'Delivery address not found.' });
    }

    const nextDefaultId = defaultDeliveryAddressId === req.params.id
      ? nextAddresses[0]?.id || null
      : defaultDeliveryAddressId;
    const saved = await saveAddressBook(req.storefrontCustomer, metadata, nextAddresses, nextDefaultId);

    return res.status(200).json({
      success: true,
      message: 'Delivery address deleted.',
      data: {
        addresses: saved.addresses,
        defaultDeliveryAddressId: saved.defaultDeliveryAddressId,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.setDefaultStorefrontDeliveryAddress = async (req, res, next) => {
  try {
    const { metadata, addresses } = getAddressBook(req.storefrontCustomer);
    const address = addresses.find((item) => item.id === req.params.id);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Delivery address not found.' });
    }

    const saved = await saveAddressBook(req.storefrontCustomer, metadata, addresses, req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Default delivery address updated.',
      data: {
        address: saved.addresses.find((item) => item.id === req.params.id),
        addresses: saved.addresses,
        defaultDeliveryAddressId: saved.defaultDeliveryAddressId,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.previewStorefrontCheckout = async (req, res, next) => {
  try {
    const draft = await buildStorefrontCheckoutDraft({
      shopper: req.storefrontCustomer,
      body: req.body,
    });

    return res.status(200).json({
      success: true,
      data: {
        store: {
          slug: draft.store.slug,
          displayName: draft.store.displayName,
          currency: draft.store.currency || DEFAULT_CURRENCY,
          deliveryEnabled: draft.store.deliveryEnabled === true,
          pickupEnabled: draft.store.pickupEnabled !== false,
          deliveryFee: Number(draft.store.deliveryFee || 0),
        },
        items: draft.saleItems.map((item) => ({
          listingId: item.listing.id,
          title: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          available: item.availability?.available !== false,
          imageUrl: item.imageUrl || null,
        })),
        subtotal: draft.subtotal,
        deliveryFee: draft.deliveryFee,
        deliveryFeeWaived: draft.deliveryFeeWaived === true,
        freeDeliveryThreshold: draft.freeDeliveryThreshold,
        total: draft.total,
        currency: draft.store.currency || DEFAULT_CURRENCY,
        fulfillmentMethod: draft.fulfillmentMethod,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode || undefined,
      });
    }
    return next(error);
  }
};

const getPushDevices = (customer) => {
  const metadata = getMetadata(customer);
  const devices = Array.isArray(metadata.pushDevices) ? metadata.pushDevices : [];
  return devices.filter((device) => device && typeof device.token === 'string');
};

const savePushDevices = async (customer, devices) => {
  const metadata = getMetadata(customer);
  metadata.pushDevices = devices.slice(0, 20);
  await customer.update({ metadata });
  return metadata.pushDevices;
};

const getNotificationPreferences = (customer) => {
  const metadata = getMetadata(customer);
  const prefs = metadata.notificationPreferences && typeof metadata.notificationPreferences === 'object'
    ? metadata.notificationPreferences
    : {};
  return {
    orderUpdates: prefs.orderUpdates !== false,
    promotions: prefs.promotions === true,
  };
};

exports.registerStorefrontPushToken = async (req, res, next) => {
  try {
    const token = compact(req.body?.token, 512);
    const platform = compact(req.body?.platform, 20).toLowerCase();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required.' });
    }
    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Platform must be ios or android.' });
    }

    const devices = getPushDevices(req.storefrontCustomer).filter((device) => device.token !== token);
    devices.unshift({
      token,
      platform,
      deviceName: compact(req.body?.deviceName, 120) || null,
      updatedAt: new Date().toISOString(),
    });
    const saved = await savePushDevices(req.storefrontCustomer, devices);

    return res.status(200).json({
      success: true,
      message: 'Push token registered.',
      data: { deviceCount: saved.length },
    });
  } catch (error) {
    next(error);
  }
};

exports.unregisterStorefrontPushToken = async (req, res, next) => {
  try {
    const token = compact(req.body?.token, 512);
    if (!token) {
      return res.status(400).json({ success: false, message: 'Push token is required.' });
    }
    const devices = getPushDevices(req.storefrontCustomer).filter((device) => device.token !== token);
    await savePushDevices(req.storefrontCustomer, devices);
    return res.status(200).json({ success: true, message: 'Push token removed.' });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontNotificationPreferences = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: getNotificationPreferences(req.storefrontCustomer),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateStorefrontNotificationPreferences = async (req, res, next) => {
  try {
    const metadata = getMetadata(req.storefrontCustomer);
    const current = getNotificationPreferences(req.storefrontCustomer);
    metadata.notificationPreferences = {
      orderUpdates: req.body?.orderUpdates !== undefined ? req.body.orderUpdates === true : current.orderUpdates,
      promotions: req.body?.promotions !== undefined ? req.body.promotions === true : current.promotions,
    };
    await req.storefrontCustomer.update({ metadata });
    return res.status(200).json({
      success: true,
      data: metadata.notificationPreferences,
    });
  } catch (error) {
    next(error);
  }
};

const toDisputeSummary = (dispute, sale) => ({
  id: dispute.id,
  status: dispute.status,
  reason: dispute.reason,
  message: dispute.message,
  openedAt: dispute.openedAt,
  resolvedAt: dispute.resolvedAt,
  saleId: dispute.saleId,
  saleNumber: sale?.saleNumber || null,
  orderTotal: sale ? Number(sale.total || 0) : null,
});

exports.listStorefrontCustomerDisputes = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = (page - 1) * limit;

    const { rows, count } = await MarketplaceDispute.findAndCountAll({
      where: { storefrontCustomerId: req.storefrontCustomer.id },
      order: [['openedAt', 'DESC']],
      limit,
      offset,
      include: [{
        model: Sale,
        as: 'sale',
        attributes: ['id', 'saleNumber', 'total', 'status'],
        required: false,
      }],
    });

    return res.status(200).json({
      success: true,
      count,
      pagination: { page, limit, totalPages: Math.ceil(count / limit) || 0 },
      data: rows.map((row) => {
        const plain = row.get({ plain: true });
        return toDisputeSummary(plain, plain.sale);
      }),
    });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontCustomerDispute = async (req, res, next) => {
  try {
    const dispute = await MarketplaceDispute.findOne({
      where: {
        id: req.params.id,
        storefrontCustomerId: req.storefrontCustomer.id,
      },
      include: [{
        model: Sale,
        as: 'sale',
        attributes: ['id', 'saleNumber', 'total', 'status', 'metadata'],
        required: false,
      }],
    });

    if (!dispute) {
      return res.status(404).json({ success: false, message: 'Dispute not found.' });
    }

    const plain = dispute.get({ plain: true });
    return res.status(200).json({
      success: true,
      data: {
        ...toDisputeSummary(plain, plain.sale),
        resolutionNotes: plain.resolutionNotes || null,
        order: plain.sale ? toOrderSummary(plain.sale) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
