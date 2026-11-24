const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  OnlineServiceListing,
  OnlineStoreSettings,
  PricingTemplate,
  Lead,
  Job,
  Tenant,
  StudioLocation,
} = require('../models');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const { resolveBusinessType } = require('../config/businessTypes');
const { applyTenantFilter } = require('../utils/tenantUtils');
const { getPagination } = require('../utils/paginationUtils');
const { applyShopReadFilter } = require('../utils/shopUtils');
const {
  applyStudioLocationReadFilter,
  attachStudioLocationToPayload,
} = require('../utils/studioLocationUtils');
const {
  attachServiceReviewSummaries,
  attachStoreReviewSummaries,
  getPublicReviewSummary,
  createOrUpdateServiceReview,
  getServiceReviewEligibility,
  listPublicServiceReviews,
} = require('../services/storefrontReviewService');
const { createListingSearch } = require('../utils/listingSearch');
const { startHotPathTimer } = require('../utils/performanceLogger');
const { findMarketplaceStorePage } = require('../services/marketplaceStoreSearch');

const LISTING_STATUSES = new Set(['draft', 'published', 'hidden']);
const CTA_TYPES = new Set(['request_quote', 'book_service', 'fixed_price']);
const PRICE_TYPES = new Set(['starting_from', 'fixed', 'quote_only']);
const STUDIO_TENANT_TYPES = new Set(['printing_press', 'mechanic', 'barber', 'salon', 'studio']);
const DEFAULT_PRIMARY_COLOR = '#166534';
const DEFAULT_CURRENCY = 'GHS';

const compact = (value, max = 255) => String(value || '').trim().slice(0, max);

const getStorefrontBaseUrl = () => (
  process.env.STOREFRONT_URL ||
  process.env.SABITO_STOREFRONT_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:5173'
).replace(/\/$/, '');

const makeServicePaystackReference = (jobId) => (
  `SS-${String(jobId).replace(/-/g, '').slice(0, 12)}-${Date.now()}`.slice(0, 50)
);

const sendServicePaystackFailure = (res, paystackErr, fallbackMessage, errorCode) => {
  const paystackService = require('../services/paystackService');
  const fromProvider = paystackService.userFacingPaystackErrorMessage(paystackErr);
  return res.status(502).json({
    success: false,
    message: fromProvider || fallbackMessage,
    errorCode,
  });
};

const getPaystackMetadata = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
};

const generateMarketplaceJobNumber = async (tenantId, transaction = null) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const pattern = `JOB-${year}${month}-%`;
  const [row] = await sequelize.query(
    `SELECT MAX(CAST(SPLIT_PART("jobNumber", '-', 3) AS INTEGER)) AS max_sequence
     FROM jobs
     WHERE "tenantId" = :tenantId
       AND "jobNumber" LIKE :pattern
       AND SPLIT_PART("jobNumber", '-', 3) ~ '^[0-9]+$'`,
    {
      replacements: { tenantId, pattern },
      type: sequelize.QueryTypes.SELECT,
      transaction,
    },
  );
  const nextSequence = Math.max(Number.parseInt(row?.max_sequence || 0, 10) || 0, 0) + 1;
  return `JOB-${year}${month}-${String(nextSequence).padStart(4, '0')}`;
};

const normalizeSlug = (value, fallback = 'service') => {
  const slug = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

const normalizeMoney = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
};

const normalizeImages = (value) => {
  const images = Array.isArray(value) ? value : [];
  return [...new Set(images.map((image) => String(image || '').trim()).filter(Boolean))].slice(0, 5);
};

const marketplaceLimit = (value, fallback = 12, max = 48) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const marketplacePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const publicStoreWhere = (extra = {}) => ({
  enabled: true,
  ...extra,
});

const marketplaceListedStoreWhere = (extra = {}) => publicStoreWhere({
  listedOnMarketplace: true,
  ...extra,
});

const serviceWhereForRequest = (req, extra = {}) => {
  let where = applyTenantFilter(req.tenantId, extra);
  if (req.studioLocationScoped) {
    where = applyStudioLocationReadFilter(req, where);
  } else if (req.shopScoped) {
    where = applyShopReadFilter(req, where);
  } else if (req.query?.studioLocationId) {
    where.studioLocationId = req.query.studioLocationId;
  }
  return where;
};

const storeSettingsWhereForRequest = (req, extra = {}) => {
  let where = applyTenantFilter(req.tenantId, extra);
  if (req.studioLocationScoped) {
    where = applyStudioLocationReadFilter(req, where);
  } else if (req.shopScoped) {
    where = applyShopReadFilter(req, where);
  }
  return where;
};

const publicStudioInclude = [
  {
    model: Tenant,
    as: 'tenant',
    attributes: ['id', 'name', 'businessType', 'status'],
    required: true,
    where: {
      status: 'active',
      businessType: { [Op.in]: [...STUDIO_TENANT_TYPES] },
    },
  },
  {
    model: StudioLocation,
    as: 'studioLocation',
    attributes: ['id', 'name', 'city', 'country', 'logoUrl', 'isActive'],
    required: false,
    where: { isActive: true },
  },
];

const resolvePublicBannerImageUrl = (plain = {}) => {
  const metadata = plain.metadata && typeof plain.metadata === 'object' ? plain.metadata : {};
  return plain.bannerImageUrl
    || metadata.bannerImageUrl
    || metadata.bannerUrl
    || metadata.heroImageUrl
    || metadata.coverImageUrl
    || null;
};

const getStudioCategoryLabel = (store) => {
  const plain = typeof store?.get === 'function' ? store.get({ plain: true }) : store;
  const metadata = plain?.metadata && typeof plain.metadata === 'object' ? plain.metadata : {};
  if (metadata.category || metadata.storeCategory || metadata.industry) {
    return metadata.category || metadata.storeCategory || metadata.industry;
  }
  return plain?.tenant?.businessType
    ? plain.tenant.businessType.replace(/_/g, ' ')
    : 'Studio services';
};

const toPublicStudioCard = (store, { serviceCount = 0 } = {}) => {
  const plain = typeof store.get === 'function' ? store.get({ plain: true }) : store;
  return {
    id: plain.id,
    slug: plain.slug,
    displayName: plain.displayName,
    description: plain.description,
    logoUrl: plain.logoUrl || plain.studioLocation?.logoUrl || null,
    bannerImageUrl: resolvePublicBannerImageUrl(plain),
    primaryColor: plain.primaryColor || DEFAULT_PRIMARY_COLOR,
    currency: plain.currency || DEFAULT_CURRENCY,
    category: getStudioCategoryLabel(plain),
    city: plain.studioLocation?.city || null,
    country: plain.studioLocation?.country || null,
    pickupEnabled: plain.pickupEnabled,
    deliveryEnabled: plain.deliveryEnabled,
    serviceCount,
    businessType: plain.tenant?.businessType || 'studio',
    rating: plain.rating || plain.reviewSummary?.rating || null,
    reviewsCount: plain.reviewsCount || plain.reviewSummary?.reviewsCount || 0,
  };
};

const studioMatchesListing = (store, listing) => {
  const storePlain = typeof store.get === 'function' ? store.get({ plain: true }) : store;
  const listingPlain = typeof listing.get === 'function' ? listing.get({ plain: true }) : listing;
  if (storePlain.tenantId !== listingPlain.tenantId) return false;
  if (storePlain.studioLocationId) {
    return storePlain.studioLocationId === listingPlain.studioLocationId;
  }
  return !listingPlain.studioLocationId || listingPlain.studioLocationId === null;
};

/** Rank marketplace services for a search. */
const searchMarketplaceServices = createListingSearch((listing) => ({
  name: listing.title,
  category: listing.category,
  description: listing.shortDescription,
}));

const buildStudioListingWhere = (stores) => {
  if (!stores.length) return null;
  return {
    status: 'published',
    [Op.or]: stores.map((store) => ({
      tenantId: store.tenantId,
      ...(store.studioLocationId ? { studioLocationId: store.studioLocationId } : {}),
    })),
  };
};

const getStudioServiceCounts = async (stores) => {
  const where = buildStudioListingWhere(stores);
  if (!where) return new Map();
  const rows = await OnlineServiceListing.findAll({
    where,
    attributes: ['tenantId', 'studioLocationId'],
    raw: true,
  });
  return rows.reduce((map, row) => {
    const key = `${row.tenantId}:${row.studioLocationId || ''}`;
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
};

const serviceListingPayloadFromBody = (body, template = null) => {
  const title = String(body.title || template?.name || '').trim();
  const slug = normalizeSlug(body.slug || title, 'service');
  const status = LISTING_STATUSES.has(body.status) ? body.status : 'draft';
  const priceType = PRICE_TYPES.has(body.priceType) ? body.priceType : 'starting_from';
  const ctaType = CTA_TYPES.has(body.ctaType) ? body.ctaType : 'request_quote';
  const startingPrice = priceType === 'quote_only'
    ? null
    : normalizeMoney(body.startingPrice, normalizeMoney(template?.basePrice ?? template?.pricePerUnit, 0));

  return {
    title,
    slug,
    status,
    shortDescription: body.shortDescription || template?.description?.slice(0, 280) || null,
    description: body.description || template?.description || null,
    category: body.category || template?.category || null,
    ctaType,
    priceType,
    startingPrice,
    compareAtPrice: body.compareAtPrice === undefined || body.compareAtPrice === null || body.compareAtPrice === ''
      ? null
      : normalizeMoney(body.compareAtPrice, 0),
    durationMinutes: Number.isInteger(Number(body.durationMinutes)) ? Number(body.durationMinutes) : null,
    turnaroundLabel: body.turnaroundLabel || null,
    images: normalizeImages(body.images),
    pickupEnabled: body.pickupEnabled !== false,
    deliveryEnabled: body.deliveryEnabled === true || body.deliveryEnabled === 'true',
    sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    publishedAt: status === 'published' ? new Date() : null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };
};

const assertServiceListingPublishable = (listing) => {
  if (!listing.title || !String(listing.title).trim()) {
    const error = new Error('Service title is required before publishing');
    error.statusCode = 400;
    throw error;
  }
  if (listing.priceType !== 'quote_only' && Number.parseFloat(listing.startingPrice || 0) <= 0) {
    const error = new Error('Starting price must be greater than zero before publishing fixed-price services');
    error.statusCode = 400;
    throw error;
  }
  const images = normalizeImages(listing.images);
  if (images.length < 1 || images.length > 5) {
    const error = new Error('Published services need 1 to 5 images');
    error.statusCode = 400;
    throw error;
  }
};

const serviceSupportsOnlinePayment = (plain) => (
  plain
  && plain.priceType !== 'quote_only'
  && Number.parseFloat(plain.startingPrice || 0) > 0
  && ['book_service', 'fixed_price'].includes(plain.ctaType)
);

const toMarketplaceService = (listing, stores) => {
  const plain = typeof listing.get === 'function' ? listing.get({ plain: true }) : listing;
  const store = stores.find((candidate) => studioMatchesListing(candidate, plain));
  const studioCard = store ? toPublicStudioCard(store) : null;
  return {
    id: plain.id,
    title: plain.title,
    slug: plain.slug,
    shortDescription: plain.shortDescription,
    description: plain.description,
    category: plain.category,
    ctaType: plain.ctaType,
    priceType: plain.priceType,
    startingPrice: plain.startingPrice,
    compareAtPrice: plain.compareAtPrice,
    durationMinutes: plain.durationMinutes,
    turnaroundLabel: plain.turnaroundLabel,
    images: plain.images,
    pickupEnabled: plain.pickupEnabled,
    deliveryEnabled: plain.deliveryEnabled,
    studio: studioCard,
    currency: studioCard?.currency || DEFAULT_CURRENCY,
    canBookOnline: serviceSupportsOnlinePayment(plain),
    canRequestQuote: plain.ctaType === 'request_quote' || plain.priceType === 'quote_only',
    rating: plain.rating || plain.reviewSummary?.rating || null,
    reviewsCount: plain.reviewsCount || plain.reviewSummary?.reviewsCount || 0,
    reviewSummary: plain.reviewSummary || null,
    publishedAt: plain.publishedAt,
  };
};

const getServiceCategoriesFromListings = (listings = []) => {
  const counts = listings.reduce((map, listing) => {
    const category = listing.category || listing.get?.({ plain: true })?.category;
    if (!category) return map;
    map.set(category, (map.get(category) || 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const toPublicStudioHomeProfile = (store, { serviceCount = 0, categories = [], reviewSummary = null } = {}) => {
  const card = toPublicStudioCard(store, { serviceCount });
  return {
    ...card,
    contactPhone: store.contactPhone || null,
    whatsappNumber: store.whatsappNumber || null,
    contactEmail: store.contactEmail || null,
    deliveryFee: store.deliveryFee || 0,
    categories,
    reviewSummary,
    storeType: 'studio',
  };
};

const defaultCtaForBusinessType = (businessType) => (
  ['barber', 'salon'].includes(businessType) ? 'book_service' : 'request_quote'
);

exports.getServiceListings = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, pricingTemplateId } = req.query;
    const where = serviceWhereForRequest(req);
    if (status && LISTING_STATUSES.has(status)) where.status = status;
    if (pricingTemplateId) where.pricingTemplateId = pricingTemplateId;
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        { category: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await OnlineServiceListing.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        { model: PricingTemplate, as: 'pricingTemplate', attributes: ['id', 'name', 'category'], required: false },
        { model: StudioLocation, as: 'studioLocation', attributes: ['id', 'name'], required: false },
      ],
      order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count,
      pagination: { page, limit, totalPages: Math.ceil(count / limit) },
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

exports.createServiceListing = async (req, res, next) => {
  try {
    const payload = {
      ...serviceListingPayloadFromBody(req.body),
      tenantId: req.tenantId,
      pricingTemplateId: req.body.pricingTemplateId || null,
    };
    attachStudioLocationToPayload(req, payload);
    if (payload.status === 'published') assertServiceListingPublishable(payload);

    const listing = await OnlineServiceListing.create(payload);
    res.status(201).json({ success: true, data: listing });
  } catch (error) {
    next(error);
  }
};

exports.updateServiceListing = async (req, res, next) => {
  try {
    const listing = await OnlineServiceListing.findOne({
      where: serviceWhereForRequest(req, { id: req.params.id }),
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Service listing not found' });
    }

    const payload = serviceListingPayloadFromBody({ ...listing.get({ plain: true }), ...req.body });
    if (payload.status === 'published') assertServiceListingPublishable(payload);
    if (payload.status !== 'published') payload.publishedAt = null;
    if (listing.status === 'published' && payload.status === 'published' && listing.publishedAt) {
      payload.publishedAt = listing.publishedAt;
    }

    const updated = await listing.update(payload);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

exports.deleteServiceListing = async (req, res, next) => {
  try {
    const listing = await OnlineServiceListing.findOne({
      where: serviceWhereForRequest(req, { id: req.params.id }),
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Service listing not found' });
    }
    await listing.destroy();
    res.status(200).json({ success: true, message: 'Service listing deleted' });
  } catch (error) {
    next(error);
  }
};

exports.publishServiceListing = async (req, res, next) => {
  try {
    const listing = await OnlineServiceListing.findOne({
      where: serviceWhereForRequest(req, { id: req.params.id }),
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Service listing not found' });
    }
    assertServiceListingPublishable(listing);
    const updated = await listing.update({
      status: 'published',
      publishedAt: listing.publishedAt || new Date(),
    });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

exports.unpublishServiceListing = async (req, res, next) => {
  try {
    const listing = await OnlineServiceListing.findOne({
      where: serviceWhereForRequest(req, { id: req.params.id }),
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Service listing not found' });
    }
    const updated = await listing.update({ status: 'hidden', publishedAt: null });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

exports.importServiceListingFromPricingTemplate = async (req, res, next) => {
  try {
    const template = await PricingTemplate.findOne({
      where: applyTenantFilter(req.tenantId, { id: req.params.templateId, isActive: true }),
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Pricing template not found' });
    }

    const businessType = req.tenant?.businessType || 'studio';
    const payload = {
      ...serviceListingPayloadFromBody({
        ...req.body,
        title: req.body.title || template.name,
        category: req.body.category || template.category,
        description: req.body.description || template.description,
        startingPrice: req.body.startingPrice ?? template.basePrice ?? template.pricePerUnit ?? 0,
        ctaType: req.body.ctaType || defaultCtaForBusinessType(businessType),
        priceType: req.body.priceType || 'starting_from',
      }, template),
      tenantId: req.tenantId,
      pricingTemplateId: template.id,
      metadata: {
        ...(req.body.metadata || {}),
        importedFromPricingTemplate: true,
        pricingMethod: template.pricingMethod,
      },
    };
    attachStudioLocationToPayload(req, payload);
    if (payload.status === 'published') assertServiceListingPublishable(payload);

    const listing = await OnlineServiceListing.create(payload);
    res.status(201).json({ success: true, data: listing });
  } catch (error) {
    next(error);
  }
};

exports.uploadServiceListingImages = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    if (files.length > 5) {
      return res.status(400).json({ success: false, message: 'Upload up to 5 images' });
    }

    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const imageUrls = files.map((file) => {
      if (isServerless) {
        const mime = file.mimetype || 'image/jpeg';
        return `data:${mime};base64,${file.buffer.toString('base64')}`;
      }
      const tenantId = req.tenantId;
      const subDir = path.join('service-listings', tenantId);
      const uploadPath = path.join(baseUploadDir, subDir);
      ensureDirExists(uploadPath);
      const ext = path.extname(file.originalname) || '.jpg';
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.[^.]+$/, '') || 'service';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}${ext}`;
      fs.writeFileSync(path.join(uploadPath, filename), file.buffer);
      return `/uploads/service-listings/${tenantId}/${filename}`;
    });

    res.status(200).json({ success: true, data: { imageUrls } });
  } catch (error) {
    next(error);
  }
};

exports.getMarketplaceStudios = async (req, res, next) => {
  try {
    const page = marketplacePage(req.query.page);
    const limit = marketplaceLimit(req.query.limit, 12, 48);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const where = marketplaceListedStoreWhere();

    const { count, rows } = await findMarketplaceStorePage({ search, limit, offset }, {
      where,
      attributes: [
        'id', 'tenantId', 'studioLocationId', 'slug', 'displayName', 'description',
        'logoUrl', 'bannerImageUrl', 'primaryColor', 'currency', 'pickupEnabled', 'deliveryEnabled', 'metadata',
      ],
      include: publicStudioInclude,
      order: [['createdAt', 'DESC']],
    });

    const serviceCounts = await getStudioServiceCounts(rows);
    const studiosWithReviews = await attachStoreReviewSummaries(rows);
    const data = studiosWithReviews.map((store) => {
      const key = `${store.tenantId}:${store.studioLocationId || ''}`;
      return toPublicStudioCard(store, { serviceCount: serviceCounts.get(key) || 0 });
    });

    res.status(200).json({
      success: true,
      count,
      pagination: { page, limit, totalPages: Math.ceil(count / limit) },
      data,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMarketplaceServices = async (req, res, next) => {
  try {
    const page = marketplacePage(req.query.page);
    const limit = marketplaceLimit(req.query.limit, 12, 48);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const studioSlug = String(req.query.studioSlug || '').trim();
    const storeWhere = marketplaceListedStoreWhere(studioSlug ? { slug: { [Op.iLike]: normalizeSlug(studioSlug) } } : {});
    const stores = await OnlineStoreSettings.findAll({
      where: storeWhere,
      attributes: [
        'id', 'tenantId', 'studioLocationId', 'slug', 'displayName', 'description',
        'logoUrl', 'bannerImageUrl', 'primaryColor', 'currency', 'pickupEnabled', 'deliveryEnabled', 'metadata',
      ],
      include: publicStudioInclude,
      limit: 200,
    });
    const where = buildStudioListingWhere(stores);

    if (!where) {
      return res.status(200).json({
        success: true,
        count: 0,
        pagination: { page, limit, totalPages: 0 },
        data: [],
      });
    }

    if (category) where.category = { [Op.iLike]: category };

    const rows = await OnlineServiceListing.findAll({
      where,
      attributes: [
        'id', 'tenantId', 'studioLocationId', 'title', 'slug', 'shortDescription', 'description',
        'category', 'ctaType', 'priceType', 'startingPrice', 'compareAtPrice', 'durationMinutes',
        'turnaroundLabel', 'images', 'pickupEnabled', 'deliveryEnabled', 'sortOrder', 'publishedAt',
      ],
      order: [['sortOrder', 'ASC'], ['publishedAt', 'DESC']],
    });

    const listings = search ? searchMarketplaceServices(rows, search) : rows;
    const count = listings.length;
    const pageRows = listings.slice(offset, offset + limit);
    const studiosWithReviews = await attachStoreReviewSummaries(stores);
    const services = pageRows.map((listing) => toMarketplaceService(listing, studiosWithReviews));
    const data = await attachServiceReviewSummaries(services);

    res.status(200).json({
      success: true,
      count,
      pagination: { page, limit, totalPages: Math.ceil(count / limit) },
      data,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMarketplaceServiceCategories = async (req, res, next) => {
  try {
    const stores = await OnlineStoreSettings.findAll({
      where: marketplaceListedStoreWhere(),
      attributes: ['id', 'tenantId', 'studioLocationId'],
      include: publicStudioInclude,
      limit: 200,
    });
    const where = buildStudioListingWhere(stores);
    if (!where) {
      return res.status(200).json({ success: true, data: [] });
    }
    const listings = await OnlineServiceListing.findAll({
      where,
      attributes: ['category'],
      raw: true,
    });
    const categories = getServiceCategoriesFromListings(listings);
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

exports.getMarketplaceStudioHome = async (req, res, next) => {
  const finishTiming = startHotPathTimer('marketplace.studio_home', req);
  try {
    const store = await OnlineStoreSettings.findOne({
      where: publicStoreWhere({ slug: { [Op.iLike]: normalizeSlug(req.params.slug) } }),
      attributes: [
        'id', 'tenantId', 'studioLocationId', 'slug', 'displayName', 'description',
        'logoUrl', 'bannerImageUrl', 'primaryColor', 'contactPhone', 'whatsappNumber',
        'contactEmail', 'pickupEnabled', 'deliveryEnabled', 'deliveryFee', 'currency', 'metadata',
      ],
      include: publicStudioInclude,
    });

    if (!store) {
      return res.status(404).json({ success: false, message: 'Studio not found or not launched' });
    }

    const listingWhere = buildStudioListingWhere([store]);
    const listings = listingWhere
      ? await OnlineServiceListing.findAll({
        where: listingWhere,
        order: [['sortOrder', 'ASC'], ['publishedAt', 'DESC']],
        limit: 80,
      })
      : [];

    const reviewSummary = await getPublicReviewSummary({
      reviewType: 'store',
      tenantId: store.tenantId,
      studioLocationId: store.studioLocationId || null,
      limit: 20,
    });
    const services = await attachServiceReviewSummaries(
      listings.map((listing) => toMarketplaceService(listing, [store]))
    );
    const categories = getServiceCategoriesFromListings(listings);
    const metadata = store.metadata && typeof store.metadata === 'object' ? store.metadata : {};

    finishTiming({
      slug: store.slug,
      services: services.length,
      categories: categories.length,
    });
    res.status(200).json({
      success: true,
      data: {
        studio: toPublicStudioHomeProfile(store, {
          serviceCount: services.length,
          categories,
          reviewSummary,
        }),
        categories,
        featuredServices: services.slice(0, 8),
        services,
        promotionalBanner: metadata.promoBanner || metadata.promotionalBanner || null,
        reviews: reviewSummary.reviews,
      },
    });
  } catch (error) {
    finishTiming({ error: error?.message || 'unknown' });
    next(error);
  }
};

exports.getPublicStudioService = async (req, res, next) => {
  try {
    const store = await OnlineStoreSettings.findOne({
      where: publicStoreWhere({ slug: { [Op.iLike]: normalizeSlug(req.params.slug) } }),
      include: publicStudioInclude,
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Studio not found or not launched' });
    }

    const listing = await OnlineServiceListing.findOne({
      where: {
        tenantId: store.tenantId,
        slug: { [Op.iLike]: normalizeSlug(req.params.serviceSlug) },
        status: 'published',
        ...(store.studioLocationId ? { studioLocationId: store.studioLocationId } : {}),
      },
    });
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const [service] = await attachServiceReviewSummaries([toMarketplaceService(listing, [store])]);
    res.status(200).json({
      success: true,
      data: {
        studio: toPublicStudioCard(store),
        service,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.submitServiceRequest = async (req, res, next) => {
  try {
    const store = await OnlineStoreSettings.findOne({
      where: publicStoreWhere({ slug: { [Op.iLike]: normalizeSlug(req.body.studioSlug || req.params.studioSlug) } }),
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'businessType'] }],
    });
    if (!store) {
      return res.status(404).json({ success: false, message: 'Studio not found or not launched' });
    }

    const serviceListing = req.body.serviceListingId
      ? await OnlineServiceListing.findOne({
        where: {
          id: req.body.serviceListingId,
          tenantId: store.tenantId,
          status: 'published',
        },
      })
      : null;

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const message = String(req.body.message || req.body.notes || '').trim();

    if (!name) {
      return res.status(400).json({ success: false, message: 'Your name is required' });
    }
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone is required' });
    }

    const shopper = req.storefrontCustomer || null;
    const leadMetadata = {
      source: 'marketplace',
      channel: 'sabito_studio_store',
      studioSlug: store.slug,
      serviceListingId: serviceListing?.id || null,
      serviceTitle: serviceListing?.title || req.body.serviceTitle || null,
      serviceSlug: serviceListing?.slug || req.body.serviceSlug || null,
      preferredDate: req.body.preferredDate || null,
      preferredTime: req.body.preferredTime || null,
      storefrontCustomerId: shopper?.id || null,
      requestMessage: message || null,
      requestPayload: {
        quantity: req.body.quantity || null,
        options: req.body.options || null,
        attachments: req.body.attachments || null,
      },
    };

    const lead = await Lead.create({
      tenantId: store.tenantId,
      studioLocationId: store.studioLocationId || serviceListing?.studioLocationId || null,
      name: shopper?.name || name,
      email: shopper?.email || email || null,
      phone: shopper?.phone || phone || null,
      source: 'marketplace',
      status: 'new',
      priority: 'medium',
      notes: message || `Marketplace service request${serviceListing ? `: ${serviceListing.title}` : ''}`,
      metadata: leadMetadata,
      tags: ['marketplace', 'service_request'],
    });

    res.status(201).json({
      success: true,
      data: {
        leadId: lead.id,
        message: 'Your request has been sent. The studio will contact you with a quote or next steps.',
      },
    });
  } catch (error) {
    next(error);
  }
};

const resolvePublicStudioAndService = async ({ studioSlug, serviceListingId, serviceSlug, transaction = null }) => {
  const store = await OnlineStoreSettings.findOne({
    where: publicStoreWhere({ slug: { [Op.iLike]: normalizeSlug(studioSlug) } }),
    include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'businessType'] }],
    transaction,
  });
  if (!store) return { store: null, serviceListing: null };

  const serviceWhere = {
    tenantId: store.tenantId,
    status: 'published',
    ...(store.studioLocationId ? { studioLocationId: store.studioLocationId } : {}),
  };
  if (serviceListingId) {
    serviceWhere.id = serviceListingId;
  } else {
    serviceWhere.slug = { [Op.iLike]: normalizeSlug(serviceSlug) };
  }

  const serviceListing = await OnlineServiceListing.findOne({
    where: serviceWhere,
    transaction,
  });
  return { store, serviceListing };
};

const toStorefrontServiceBooking = (job) => {
  const plain = typeof job.get === 'function' ? job.get({ plain: true }) : job;
  const leadMetadata = plain.adminLead?.metadata && typeof plain.adminLead.metadata === 'object'
    ? plain.adminLead.metadata
    : {};
  const jobMetadata = plain.metadata && typeof plain.metadata === 'object' ? plain.metadata : {};
  const metadata = { ...leadMetadata, ...jobMetadata };
  const payment = metadata.paystack || {};
  const appointment = metadata.appointment || {
    preferredDate: metadata.preferredDate || null,
    preferredTime: metadata.preferredTime || null,
    appointmentAt: metadata.appointmentAt || null,
  };
  return {
    id: plain.id,
    jobId: plain.id,
    jobNumber: plain.jobNumber,
    title: plain.title,
    description: plain.description,
    status: plain.status,
    paymentStatus: metadata.paymentStatus || payment.status || null,
    total: Number.parseFloat(plain.finalPrice || plain.quotedPrice || payment.amount || 0),
    currency: payment.currency || DEFAULT_CURRENCY,
    studioSlug: metadata.studioSlug || null,
    serviceListingId: metadata.serviceListingId || null,
    serviceSlug: metadata.serviceSlug || null,
    serviceTitle: metadata.serviceTitle || plain.title,
    preferredDate: appointment.preferredDate || null,
    preferredTime: appointment.preferredTime || null,
    appointmentAt: appointment.appointmentAt || plain.startDate || null,
    trackingToken: plain.viewToken || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const serviceBookingLeadInclude = (shopperId) => ({
  model: Lead,
  as: 'adminLead',
  required: true,
  attributes: ['id', 'metadata', 'status'],
  where: {
    [Op.and]: [
      sequelize.where(
        sequelize.literal('"adminLead"."metadata"->>\'storefrontCustomerId\''),
        String(shopperId || ''),
      ),
      sequelize.where(
        sequelize.literal('"adminLead"."metadata"->>\'requestType\''),
        'paid_service_booking',
      ),
    ],
  },
});

const serviceBookingCustomerWhere = () => ({
  adminLeadId: { [Op.ne]: null },
});

exports.listStorefrontServiceBookings = async (req, res, next) => {
  try {
    const shopper = req.storefrontCustomer;
    const { page, limit, offset } = getPagination(req);
    const { count, rows } = await Job.findAndCountAll({
      where: serviceBookingCustomerWhere(),
      include: [serviceBookingLeadInclude(shopper.id)],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    res.status(200).json({
      success: true,
      data: { bookings: rows.map(toStorefrontServiceBooking) },
      count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    next(error);
  }
};

exports.getStorefrontServiceBooking = async (req, res, next) => {
  try {
    const shopper = req.storefrontCustomer;
    const booking = await Job.findOne({
      where: {
        id: req.params.id,
        ...serviceBookingCustomerWhere(),
      },
      include: [serviceBookingLeadInclude(shopper.id)],
    });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Service booking not found.' });
    }
    res.status(200).json({ success: true, data: toStorefrontServiceBooking(booking) });
  } catch (error) {
    next(error);
  }
};

const buildAppointmentDate = (dateValue, timeValue) => {
  const date = compact(dateValue, 20);
  const time = compact(timeValue, 20);
  if (!date) return null;
  const isoLike = time ? `${date}T${time}` : date;
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serviceCanCheckout = (serviceListing) => serviceSupportsOnlinePayment(serviceListing);

exports.initializeServiceBookingPaystack = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const shopper = req.storefrontCustomer;
    if (!shopper) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: 'Sign in or create a shopper account to book this service.',
        errorCode: 'STOREFRONT_AUTH_REQUIRED',
      });
    }

    const studioSlug = req.body.studioSlug || req.params.studioSlug;
    const { store, serviceListing } = await resolvePublicStudioAndService({
      studioSlug,
      serviceListingId: compact(req.body.serviceListingId, 80),
      serviceSlug: req.body.serviceSlug,
      transaction,
    });

    if (!store) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Studio not found or not launched.' });
    }
    if (!serviceListing) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }
    if (!serviceCanCheckout(serviceListing)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This service requires a quote before payment.',
        errorCode: 'SERVICE_QUOTE_REQUIRED',
      });
    }

    const appointmentAt = buildAppointmentDate(req.body.preferredDate, req.body.preferredTime);
    if (serviceListing.ctaType === 'book_service' && !appointmentAt) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Choose an appointment date and time.',
        errorCode: 'SERVICE_APPOINTMENT_REQUIRED',
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

    const amount = normalizeMoney(req.body.amount, Number.parseFloat(serviceListing.startingPrice || 0));
    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This service does not have a payable price configured.',
        errorCode: 'SERVICE_PRICE_REQUIRED',
      });
    }

    const message = compact(req.body.message || req.body.notes, 1000);
    const lead = await Lead.create({
      tenantId: store.tenantId,
      studioLocationId: store.studioLocationId || serviceListing.studioLocationId || null,
      name: shopper.name || compact(req.body.name, 160) || shopper.email,
      email: shopper.email || compact(req.body.email, 255) || null,
      phone: shopper.phone || compact(req.body.phone, 60) || null,
      source: 'marketplace',
      status: 'qualified',
      priority: 'medium',
      notes: message || `Paid service booking: ${serviceListing.title}`,
      metadata: {
        source: 'marketplace',
        channel: 'sabito_studio_store',
        requestType: 'paid_service_booking',
        studioSlug: store.slug,
        serviceListingId: serviceListing.id,
        serviceTitle: serviceListing.title,
        serviceSlug: serviceListing.slug,
        preferredDate: req.body.preferredDate || null,
        preferredTime: req.body.preferredTime || null,
        appointmentAt: appointmentAt ? appointmentAt.toISOString() : null,
        storefrontCustomerId: shopper.id,
        requestMessage: message || null,
      },
      tags: ['marketplace', 'service_booking', 'paystack'],
    }, { transaction });

    const jobNumber = await generateMarketplaceJobNumber(store.tenantId, transaction);
    const job = await Job.create({
      tenantId: store.tenantId,
      studioLocationId: store.studioLocationId || serviceListing.studioLocationId || null,
      jobNumber,
      title: serviceListing.title,
      description: message || serviceListing.shortDescription || serviceListing.description || null,
      status: 'new',
      priority: 'medium',
      jobType: serviceListing.category || 'marketplace_service',
      quantity: 1,
      quotedPrice: amount,
      finalPrice: amount,
      orderDate: new Date(),
      startDate: appointmentAt,
      dueDate: appointmentAt,
      adminLeadId: lead.id,
      notes: message || null,
      metadata: {
        source: 'marketplace_service',
        paymentStatus: 'awaiting_payment',
        storefrontCustomerId: shopper.id,
        storefrontCustomerEmail: shopper.email,
        studioSlug: store.slug,
        serviceListingId: serviceListing.id,
        serviceSlug: serviceListing.slug,
        serviceTitle: serviceListing.title,
        appointment: {
          preferredDate: req.body.preferredDate || null,
          preferredTime: req.body.preferredTime || null,
          appointmentAt: appointmentAt ? appointmentAt.toISOString() : null,
        },
      },
    }, { transaction });

    await lead.update({ convertedJobId: job.id }, { transaction });

    const paystackReference = makeServicePaystackReference(job.id);
    const amountPesewas = Math.round(amount * 100);
    const jobMetadata = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
    jobMetadata.paymentStatus = 'awaiting_payment';
    jobMetadata.paystack = {
      reference: paystackReference,
      amount,
      currency: store.currency || DEFAULT_CURRENCY,
    };
    await job.update({ metadata: jobMetadata }, { transaction });

    const callbackUrl = `${getStorefrontBaseUrl()}/studios/${encodeURIComponent(store.slug)}/services/${encodeURIComponent(serviceListing.slug)}?servicePaystack=1`;
    const metadata = {
      type: 'storefront_service_booking',
      jobId: job.id,
      leadId: lead.id,
      tenantId: store.tenantId,
      storefrontCustomerId: shopper.id,
      studioSlug: store.slug,
      serviceListingId: serviceListing.id,
      expectedAmount: amountPesewas,
    };

    let result;
    try {
      result = await paystackService.initializeTransaction({
        email: shopper.email,
        amount: amountPesewas,
        currency: store.currency || DEFAULT_CURRENCY,
        callback_url: callbackUrl,
        reference: paystackReference,
        metadata,
        channels: ['card', 'mobile_money'],
      });
    } catch (paystackErr) {
      await transaction.rollback();
      return sendServicePaystackFailure(
        res,
        paystackErr,
        'Failed to initialize service payment.',
        'SERVICE_PAYSTACK_INIT_FAILED',
      );
    }

    if (!result?.status || !result?.data?.authorization_url) {
      await transaction.rollback();
      return res.status(502).json({
        success: false,
        message: result?.message || 'Failed to initialize payment.',
        errorCode: 'SERVICE_PAYSTACK_INIT_FAILED',
      });
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        authorization_url: result.data.authorization_url,
        reference: result.data.reference || paystackReference,
        access_code: result.data.access_code,
        booking: {
          jobId: job.id,
          jobNumber: job.jobNumber,
          leadId: lead.id,
          trackingToken: job.viewToken,
          status: job.status,
          paymentStatus: 'awaiting_payment',
          total: amount,
          currency: store.currency || DEFAULT_CURRENCY,
          appointmentAt: appointmentAt ? appointmentAt.toISOString() : null,
        },
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.verifyServiceBookingPaystack = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const shopper = req.storefrontCustomer;
    const reference = compact(req.body?.reference || req.query?.reference || req.query?.trxref, 160);
    if (!shopper) {
      await transaction.rollback();
      return res.status(401).json({ success: false, message: 'Sign in to verify this booking.' });
    }
    if (!reference) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing Paystack reference.',
        errorCode: 'SERVICE_PAYSTACK_REFERENCE_REQUIRED',
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
      return sendServicePaystackFailure(
        res,
        paystackErr,
        'Could not reach Paystack to verify this service payment.',
        'SERVICE_PAYSTACK_VERIFY_FAILED',
      );
    }

    if (!verifyResult?.status || !verifyResult?.data) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: verifyResult?.message || 'Paystack could not verify this reference.',
        errorCode: 'SERVICE_PAYSTACK_VERIFY_FAILED',
      });
    }

    const tx = verifyResult.data;
    if (tx.status !== 'success') {
      await transaction.rollback();
      return res.status(402).json({
        success: false,
        message: tx.gateway_response || 'Payment was not completed.',
        errorCode: 'SERVICE_PAYSTACK_NOT_SUCCESS',
        data: { paystackStatus: tx.status },
      });
    }

    const metadata = getPaystackMetadata(tx.metadata);
    if (String(metadata.type || '').toLowerCase() !== 'storefront_service_booking' || !metadata.jobId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This Paystack receipt does not match a service booking.',
        errorCode: 'SERVICE_PAYSTACK_REFERENCE_MISMATCH',
      });
    }

    if (String(metadata.storefrontCustomerId) !== String(shopper.id)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'This payment does not belong to your shopper account.',
        errorCode: 'SERVICE_PAYSTACK_CUSTOMER_MISMATCH',
      });
    }

    const job = await Job.findOne({
      where: { id: metadata.jobId, tenantId: metadata.tenantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!job) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service booking not found for this payment.',
        errorCode: 'SERVICE_BOOKING_NOT_FOUND',
      });
    }

    const jobMetadata = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
    const expectedReference = jobMetadata.paystack?.reference;
    if (expectedReference && expectedReference !== reference && expectedReference !== tx.reference) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'This Paystack receipt does not match this service booking.',
        errorCode: 'SERVICE_PAYSTACK_REFERENCE_MISMATCH',
      });
    }
    if (metadata.expectedAmount && Number(tx.amount || 0) < Number(metadata.expectedAmount)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'The paid amount is less than expected for this service.',
        errorCode: 'SERVICE_PAYSTACK_AMOUNT_MISMATCH',
      });
    }

    const paidAt = tx.paid_at || tx.paidAt || new Date().toISOString();
    jobMetadata.paymentStatus = 'paid';
    jobMetadata.paystack = {
      ...(jobMetadata.paystack || {}),
      reference: tx.reference || reference,
      amount: Number(tx.amount || 0) / 100,
      currency: tx.currency || jobMetadata.paystack?.currency || DEFAULT_CURRENCY,
      status: tx.status,
      channel: tx.channel || null,
      paidAt,
    };
    jobMetadata.tradeAssurance = {
      status: 'service_paid',
      releaseTrigger: 'job_completion',
      paidAt,
    };

    await job.update({ metadata: jobMetadata }, { transaction });
    if (metadata.leadId) {
      await Lead.update(
        {
          status: 'converted',
          metadata: sequelize.literal(`COALESCE(metadata, '{}'::jsonb) || '${JSON.stringify({
            paymentStatus: 'paid',
            paidAt,
            paystackReference: tx.reference || reference,
          }).replace(/'/g, "''")}'::jsonb`),
        },
        { where: { id: metadata.leadId, tenantId: metadata.tenantId }, transaction },
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        booking: {
          jobId: job.id,
          jobNumber: job.jobNumber,
          trackingToken: job.viewToken,
          status: job.status,
          paymentStatus: 'paid',
          amountPaid: Number(tx.amount || 0) / 100,
          currency: tx.currency || jobMetadata.paystack.currency || DEFAULT_CURRENCY,
          paidAt,
        },
      },
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.listPublicServiceReviewsHandler = async (req, res, next) => {
  try {
    const data = await listPublicServiceReviews(req.params.listingId, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getServiceReviewEligibilityHandler = async (req, res, next) => {
  try {
    const data = await getServiceReviewEligibility(req.storefrontCustomer.id, req.params.listingId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.createOrUpdateServiceReviewHandler = async (req, res, next) => {
  try {
    const data = await createOrUpdateServiceReview(req.storefrontCustomer, req.params.listingId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getMarketplaceServicesHome = async (req, res, next) => {
  const finishTiming = startHotPathTimer('marketplace.services_home', req);
  try {
    const homeData = await exports.getStudioMarketplaceHomeData();
    const stores = await OnlineStoreSettings.findAll({
      where: marketplaceListedStoreWhere(),
      attributes: [
        'id', 'tenantId', 'studioLocationId', 'slug', 'displayName', 'description',
        'logoUrl', 'bannerImageUrl', 'primaryColor', 'currency', 'pickupEnabled', 'deliveryEnabled', 'metadata',
      ],
      include: publicStudioInclude,
      order: [['createdAt', 'DESC']],
      limit: 48,
    });
    const listingWhere = buildStudioListingWhere(stores);
    const listingRows = listingWhere
      ? await OnlineServiceListing.findAll({
        where: listingWhere,
        order: [['sortOrder', 'ASC'], ['publishedAt', 'DESC']],
        limit: 80,
      })
      : [];
    const studiosWithReviews = await attachStoreReviewSummaries(stores);
    const services = await attachServiceReviewSummaries(
      listingRows.map((listing) => toMarketplaceService(listing, studiosWithReviews))
    );
    const bookableServices = services.filter((service) => service.canBookOnline).slice(0, 8);
    const quoteServices = services.filter((service) => service.canRequestQuote).slice(0, 8);

    finishTiming({
      stores: stores.length,
      services: services.length,
      featuredServices: homeData.featuredServices.length,
    });
    res.status(200).json({
      success: true,
      data: {
        hero: {
          eyebrow: 'Sabito Store Services',
          title: 'Book trusted local services',
          description: 'Find studios, compare starting prices, request quotes, or pay online when booking is enabled.',
        },
        categories: homeData.categories,
        featuredServices: homeData.featuredServices,
        popularStudios: homeData.popularStudios,
        bookableServices,
        quoteServices,
        hasProviders: homeData.popularStudios.length > 0 || services.length > 0,
      },
    });
  } catch (error) {
    finishTiming({ error: error?.message || 'unknown' });
    next(error);
  }
};

exports.getStudioMarketplaceHomeData = async () => {
  const stores = await OnlineStoreSettings.findAll({
    where: marketplaceListedStoreWhere(),
    attributes: [
      'id', 'tenantId', 'studioLocationId', 'slug', 'displayName', 'description',
      'logoUrl', 'bannerImageUrl', 'primaryColor', 'currency', 'pickupEnabled', 'deliveryEnabled', 'metadata',
    ],
    include: publicStudioInclude,
    order: [['createdAt', 'DESC']],
    limit: 24,
  });
  const serviceCounts = await getStudioServiceCounts(stores);
  const studiosWithReviews = await attachStoreReviewSummaries(stores);
  const popularStudios = studiosWithReviews.map((store) => {
    const key = `${store.tenantId}:${store.studioLocationId || ''}`;
    return toPublicStudioCard(store, { serviceCount: serviceCounts.get(key) || 0 });
  }).filter((studio) => studio.serviceCount > 0).slice(0, 6);

  const listingWhere = buildStudioListingWhere(stores);
  const featuredRows = listingWhere
    ? await OnlineServiceListing.findAll({
      where: listingWhere,
      order: [['sortOrder', 'ASC'], ['publishedAt', 'DESC']],
      limit: 16,
    })
    : [];
  const featuredServices = await attachServiceReviewSummaries(
    featuredRows.map((listing) => toMarketplaceService(listing, studiosWithReviews))
  );

  const categories = await exports.getMarketplaceServiceCategoriesData();

  return {
    popularStudios,
    featuredServices: featuredServices.slice(0, 8),
    categories: categories.slice(0, 8),
  };
};

exports.getMarketplaceServiceCategoriesData = async () => {
  const stores = await OnlineStoreSettings.findAll({
    where: marketplaceListedStoreWhere(),
    attributes: ['id', 'tenantId', 'studioLocationId'],
    include: publicStudioInclude,
    limit: 200,
  });
  const where = buildStudioListingWhere(stores);
  if (!where) return [];
  const listings = await OnlineServiceListing.findAll({
    where,
    attributes: ['category'],
    raw: true,
  });
  return getServiceCategoriesFromListings(listings);
};

exports.countPublishedServiceListings = async (tenantId, studioLocationId = null) => {
  const where = { tenantId, status: 'published' };
  if (studioLocationId) where.studioLocationId = studioLocationId;
  return OnlineServiceListing.count({ where });
};

exports.isStudioTenant = (businessType) => {
  const resolved = resolveBusinessType(businessType);
  return resolved === 'studio' || STUDIO_TENANT_TYPES.has(businessType);
};

exports.serviceListingPayloadFromBody = serviceListingPayloadFromBody;
exports.assertServiceListingPublishable = assertServiceListingPublishable;
