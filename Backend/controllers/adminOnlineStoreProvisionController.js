const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Tenant,
  Shop,
  Product,
  OnlineStoreSettings,
  OnlineProductListing,
  Setting,
} = require('../models');
const { baseUploadDir, ensureDirExists } = require('../middleware/upload');
const { invalidatePublicStorefrontCache } = require('../middleware/cache');
const {
  normalizeTemplateId,
  getTemplateDefaultColors,
  getTemplateColorSlots,
  resolveStoreBrandColors,
  normalizeHexColor,
} = require('../config/storeTemplates');
const {
  resolveHeroSlidesForStore,
  MAX_HERO_SLIDES,
} = require('./onlineStoreHeroController');
const {
  listSampleCatalog,
  getSampleById,
} = require('../data/onlineStoreSampleCatalog');
const { buildSampleProductRentalFields } = require('../utils/storefrontRentalListingUtils');

const DEFAULT_PRIMARY_COLOR = '#166534';
const DEFAULT_CURRENCY = 'GHS';
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const HEX_SHORT_COLOR_PATTERN = /^#[0-9A-Fa-f]{3}$/;

const normalizeSlug = (value, fallback = 'store') => {
  const slug = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
};

const normalizePrimaryColor = (value, fallback = DEFAULT_PRIMARY_COLOR) => {
  const trimmed = String(value || '').trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  if (HEX_SHORT_COLOR_PATTERN.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/i) || [];
    if (r && g && b) return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
};

const normalizeOptionalBrandColor = (value) => {
  if (value == null || String(value).trim() === '') return null;
  return normalizeHexColor(value, null);
};

const normalizeMoney = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
};

const normalizeImages = (value) => {
  const images = Array.isArray(value) ? value : [];
  return [...new Set(images.map((image) => String(image || '').trim()).filter(Boolean))].slice(0, 5);
};

const normalizeStoreCurrency = (value, fallback = DEFAULT_CURRENCY) => {
  const code = String(value || fallback).trim().toUpperCase().slice(0, 8);
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
};

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isSampleMetadata = (metadata) => (
  Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.isSample === true)
);

const listingIsSample = (listing) => {
  const plain = typeof listing?.get === 'function' ? listing.get({ plain: true }) : listing;
  if (isSampleMetadata(plain?.metadata)) return true;
  return isSampleMetadata(plain?.product?.metadata);
};

const serializeListingForAdmin = (listing) => {
  const plain = typeof listing.get === 'function' ? listing.get({ plain: true }) : { ...listing };
  const metadata = plain.metadata && typeof plain.metadata === 'object' ? plain.metadata : {};
  return {
    id: plain.id,
    productId: plain.productId,
    title: plain.title,
    slug: plain.slug,
    shortDescription: plain.shortDescription,
    description: plain.description,
    publicPrice: plain.publicPrice,
    compareAtPrice: plain.compareAtPrice,
    images: Array.isArray(plain.images) ? plain.images : [],
    status: plain.status,
    inventoryPolicy: plain.inventoryPolicy,
    sortOrder: plain.sortOrder,
    publishedAt: plain.publishedAt,
    metadata,
    isSample: listingIsSample(plain),
    sampleCatalogId: metadata.sampleCatalogId || plain.product?.metadata?.sampleCatalogId || null,
    createdByAdmin: metadata.createdByAdmin === true,
    quantityOnHand: plain.product?.quantityOnHand ?? null,
    trackStock: plain.product?.trackStock !== false,
    product: plain.product
      ? {
        id: plain.product.id,
        name: plain.product.name,
        sellingPrice: plain.product.sellingPrice,
        imageUrl: plain.product.imageUrl,
        quantityOnHand: plain.product.quantityOnHand,
        trackStock: plain.product.trackStock,
        rentalRatePerDay: plain.product.rentalRatePerDay ?? null,
        isRentable: plain.product.isRentable !== false,
        isSalable: plain.product.isSalable !== false,
        metadata: plain.product.metadata || {},
      }
      : null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const ensureStoreSlugAvailable = async ({ slug, tenantId, currentId = null }) => {
  const existing = await OnlineStoreSettings.findOne({
    where: {
      slug: { [Op.iLike]: slug },
      ...(currentId ? { id: { [Op.ne]: currentId } } : {}),
    },
    attributes: ['id', 'tenantId'],
  });
  if (existing && existing.tenantId !== tenantId) {
    throw httpError(400, 'Store URL is already taken');
  }
  if (existing && existing.tenantId === tenantId && currentId && existing.id !== currentId) {
    throw httpError(400, 'Store URL is already used by another store');
  }
};

const ensureListingSlugAvailable = async ({ slug, tenantId, currentId = null, transaction = null }) => {
  const existing = await OnlineProductListing.findOne({
    where: {
      tenantId,
      slug: { [Op.iLike]: slug },
      ...(currentId ? { id: { [Op.ne]: currentId } } : {}),
    },
    attributes: ['id'],
    transaction,
  });
  if (existing) {
    throw httpError(400, 'Product URL slug is already used in this store');
  }
};

const resolveTenantContext = async (tenantId) => {
  const tenant = await Tenant.scope('withOptionalColumns').findByPk(tenantId);
  if (!tenant) {
    throw httpError(404, 'Tenant not found');
  }

  const shop = await Shop.findOne({
    where: { tenantId },
    order: [['createdAt', 'ASC']],
  });

  const settings = await OnlineStoreSettings.findOne({
    where: { tenantId },
    order: [['createdAt', 'ASC']],
  });

  return { tenant, shop, settings };
};

const resolveLogoFallback = async (tenant) => {
  const organizationSetting = await Setting.findOne({
    where: { tenantId: tenant.id, key: 'organization' },
    attributes: ['value'],
  });
  const organization = organizationSetting?.value || {};
  const metadata = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  return (
    organization.logoUrl
    || metadata.logoUrl
    || metadata.logo
    || tenant.logoUrl
    || null
  );
};

const serializeSettingsForAdmin = async (settings, tenant) => {
  if (!settings) {
    return {
      id: null,
      tenantId: tenant.id,
      displayName: tenant.name || '',
      slug: '',
      description: null,
      logoUrl: await resolveLogoFallback(tenant),
      bannerImageUrl: null,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: null,
      tertiaryColor: null,
      templateId: 'classic',
      heroSlides: [],
      contactPhone: null,
      whatsappNumber: null,
      contactEmail: null,
      pickupEnabled: true,
      deliveryEnabled: false,
      deliveryFee: 0,
      currency: DEFAULT_CURRENCY,
      enabled: false,
      listedOnMarketplace: false,
      setupCompletedAt: null,
      metadata: {},
      brandColors: resolveStoreBrandColors('classic', { primaryColor: DEFAULT_PRIMARY_COLOR }),
    };
  }

  const plain = typeof settings.toJSON === 'function' ? settings.toJSON() : { ...settings };
  const templateId = normalizeTemplateId(plain.templateId);
  const primaryColor = normalizePrimaryColor(plain.primaryColor);
  const resolved = resolveStoreBrandColors(templateId, plain);
  const heroSlides = await resolveHeroSlidesForStore(plain.heroSlides, primaryColor);

  return {
    ...plain,
    templateId,
    primaryColor,
    secondaryColor: normalizeOptionalBrandColor(plain.secondaryColor),
    tertiaryColor: normalizeOptionalBrandColor(plain.tertiaryColor),
    logoUrl: plain.logoUrl || await resolveLogoFallback(tenant),
    heroSlides,
    brandColors: resolved,
  };
};

const assertListingPublishable = (listing) => {
  if (!listing.title || !String(listing.title).trim()) {
    throw httpError(400, 'Listing title is required before publishing');
  }
  if (Number.parseFloat(listing.publicPrice) <= 0) {
    throw httpError(400, 'Public selling price must be greater than zero before publishing');
  }
  const images = normalizeImages(listing.images);
  if (images.length < 1 || images.length > 5) {
    throw httpError(400, 'Published listings need 1 to 5 images');
  }
};

const findExistingSampleListing = async (tenantId, sampleCatalogId, transaction = null) => {
  const listings = await OnlineProductListing.findAll({
    where: { tenantId },
    include: [{ model: Product, as: 'product', required: false }],
    transaction,
  });
  return listings.find((listing) => {
    const meta = listing.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
    const productMeta = listing.product?.metadata && typeof listing.product.metadata === 'object'
      ? listing.product.metadata
      : {};
    return meta.sampleCatalogId === sampleCatalogId || productMeta.sampleCatalogId === sampleCatalogId;
  }) || null;
};

const uniqueListingSlug = async ({ tenantId, baseSlug, transaction = null }) => {
  let slug = normalizeSlug(baseSlug, 'product');
  let attempt = 0;
  while (attempt < 20) {
    const existing = await OnlineProductListing.findOne({
      where: { tenantId, slug: { [Op.iLike]: slug } },
      attributes: ['id'],
      transaction,
    });
    if (!existing) return slug;
    attempt += 1;
    slug = normalizeSlug(`${baseSlug}-${attempt}`, 'product');
  }
  return normalizeSlug(`${baseSlug}-${Date.now().toString(36)}`, 'product');
};

/**
 * GET /admin/online-store/sample-catalog
 */
exports.getSampleCatalog = async (req, res, next) => {
  try {
    const businessType = req.query.businessType || null;
    res.status(200).json({
      success: true,
      data: listSampleCatalog({ businessType }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/tenants/:id/online-store
 */
exports.getTenantOnlineStore = async (req, res, next) => {
  try {
    const tenantId = req.params.id;
    const { tenant, shop, settings } = await resolveTenantContext(tenantId);
    const listings = await OnlineProductListing.findAll({
      where: { tenantId },
      include: [{ model: Product, as: 'product', required: false }],
      order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
    });

    const serialized = listings.map(serializeListingForAdmin);
    const sampleListings = serialized.filter((item) => item.isSample);
    const clientListings = serialized.filter((item) => !item.isSample);

    res.status(200).json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          businessType: tenant.businessType,
          slug: tenant.slug,
        },
        shop: shop
          ? { id: shop.id, name: shop.name }
          : null,
        settings: await serializeSettingsForAdmin(settings, tenant),
        sampleListings,
        clientListings,
        sampleCatalog: listSampleCatalog({ businessType: tenant.businessType }),
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * PUT /admin/tenants/:id/online-store
 */
exports.upsertTenantOnlineStore = async (req, res, next) => {
  try {
    const tenantId = req.params.id;
    const { tenant, shop, settings: existing } = await resolveTenantContext(tenantId);

    const displayName = String(req.body.displayName || tenant.name || 'Online store').trim();
    const slug = normalizeSlug(req.body.slug || displayName);
    await ensureStoreSlugAvailable({ slug, tenantId, currentId: existing?.id || null });

    const incomingMetadata = req.body.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};
    const existingMetadata = existing?.metadata && typeof existing.metadata === 'object'
      ? existing.metadata
      : {};

    const templateId = normalizeTemplateId(
      req.body.templateId != null ? req.body.templateId : existing?.templateId
    );
    const templateDefaults = getTemplateDefaultColors(templateId);
    const slotKeys = new Set(getTemplateColorSlots(templateId).map((s) => s.key));

    const resolveIncomingColor = (key, bodyValue, existingValue) => {
      if (!slotKeys.has(key)) {
        return normalizeOptionalBrandColor(existingValue);
      }
      if (bodyValue !== undefined) {
        return normalizePrimaryColor(bodyValue, templateDefaults[key] || DEFAULT_PRIMARY_COLOR);
      }
      return normalizePrimaryColor(existingValue, templateDefaults[key] || DEFAULT_PRIMARY_COLOR);
    };

    const primaryColor = resolveIncomingColor(
      'primary',
      req.body.primaryColor,
      existing?.primaryColor
    );

    const defaultPaymentMethods = {
      mobileMoney: { enabled: false, configured: false },
      card: { enabled: false, configured: false },
      bankTransfer: { enabled: false, configured: false },
      payOnDelivery: { enabled: true, configured: true },
    };

    const payload = {
      tenantId,
      shopId: existing?.shopId || shop?.id || null,
      enabled: req.body.enabled === true || req.body.enabled === 'true',
      listedOnMarketplace: Object.prototype.hasOwnProperty.call(req.body, 'listedOnMarketplace')
        ? (req.body.listedOnMarketplace === true || req.body.listedOnMarketplace === 'true')
        : (existing?.listedOnMarketplace === true),
      slug,
      displayName,
      description: req.body.description != null ? (req.body.description || null) : (existing?.description || null),
      logoUrl: Object.prototype.hasOwnProperty.call(req.body, 'logoUrl')
        ? (req.body.logoUrl || null)
        : (existing?.logoUrl || await resolveLogoFallback(tenant) || null),
      bannerImageUrl: Object.prototype.hasOwnProperty.call(req.body, 'bannerImageUrl')
        ? (req.body.bannerImageUrl || null)
        : (existing?.bannerImageUrl || null),
      primaryColor,
      secondaryColor: resolveIncomingColor('secondary', req.body.secondaryColor, existing?.secondaryColor),
      tertiaryColor: resolveIncomingColor('tertiary', req.body.tertiaryColor, existing?.tertiaryColor),
      templateId,
      heroSlides: Object.prototype.hasOwnProperty.call(req.body, 'heroSlides')
        ? await resolveHeroSlidesForStore(
          Array.isArray(req.body.heroSlides) ? req.body.heroSlides.slice(0, MAX_HERO_SLIDES) : [],
          primaryColor
        )
        : (Array.isArray(existing?.heroSlides) ? existing.heroSlides : []),
      contactPhone: Object.prototype.hasOwnProperty.call(req.body, 'contactPhone')
        ? (req.body.contactPhone || null)
        : (existing?.contactPhone || null),
      whatsappNumber: Object.prototype.hasOwnProperty.call(req.body, 'whatsappNumber')
        ? (req.body.whatsappNumber || null)
        : (existing?.whatsappNumber || null),
      contactEmail: Object.prototype.hasOwnProperty.call(req.body, 'contactEmail')
        ? (req.body.contactEmail || null)
        : (existing?.contactEmail || null),
      pickupEnabled: Object.prototype.hasOwnProperty.call(req.body, 'pickupEnabled')
        ? req.body.pickupEnabled !== false && req.body.pickupEnabled !== 'false'
        : (existing?.pickupEnabled !== false),
      deliveryEnabled: Object.prototype.hasOwnProperty.call(req.body, 'deliveryEnabled')
        ? (req.body.deliveryEnabled === true || req.body.deliveryEnabled === 'true')
        : (existing?.deliveryEnabled === true),
      deliveryFee: Object.prototype.hasOwnProperty.call(req.body, 'deliveryFee')
        ? normalizeMoney(req.body.deliveryFee, 0)
        : normalizeMoney(existing?.deliveryFee, 0),
      currency: normalizeStoreCurrency(
        req.body.currency,
        existing?.currency || DEFAULT_CURRENCY
      ),
      metadata: {
        ...existingMetadata,
        ...incomingMetadata,
        paymentMethods: incomingMetadata.paymentMethods
          || existingMetadata.paymentMethods
          || defaultPaymentMethods,
        provisionedByAdmin: true,
        provisionedAt: existingMetadata.provisionedAt || new Date().toISOString(),
        provisionedByUserId: req.user?.id || existingMetadata.provisionedByUserId || null,
      },
    };

    if (req.body.setupCompletedAt || req.body.markSetupComplete || payload.enabled) {
      payload.setupCompletedAt = existing?.setupCompletedAt || new Date();
    }

    const settings = existing
      ? await existing.update(payload)
      : await OnlineStoreSettings.create(payload);

    invalidatePublicStorefrontCache(settings.slug || payload.slug);

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        settings: await serializeSettingsForAdmin(settings, tenant),
        tenant: {
          id: tenant.id,
          name: tenant.name,
          businessType: tenant.businessType,
        },
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * POST /admin/tenants/:id/online-store/sample-products
 * Body: { sampleIds: string[] }
 */
exports.seedTenantSampleProducts = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = req.params.id;
    const { tenant, shop, settings } = await resolveTenantContext(tenantId);
    if (!settings) {
      throw httpError(400, 'Create store settings before seeding sample products');
    }

    const sampleIds = Array.isArray(req.body.sampleIds) ? req.body.sampleIds : [];
    if (!sampleIds.length) {
      throw httpError(400, 'Select at least one sample product');
    }

    const created = [];
    const skipped = [];

    for (const rawId of sampleIds) {
      const sample = getSampleById(rawId, { businessType: tenant.businessType });
      if (!sample) {
        skipped.push({ sampleId: rawId, reason: 'not_found' });
        continue;
      }

      const existingListing = await findExistingSampleListing(tenantId, sample.id, transaction);
      if (existingListing) {
        skipped.push({ sampleId: sample.id, reason: 'already_seeded', listingId: existingListing.id });
        continue;
      }

      const images = normalizeImages(sample.images);
      const publicPrice = normalizeMoney(sample.publicPrice, 0);
      const compareAtPrice = sample.compareAtPrice == null
        ? null
        : normalizeMoney(sample.compareAtPrice, 0);
      const rentalFields = buildSampleProductRentalFields(sample, { businessType: tenant.businessType });
      const listingSlug = await uniqueListingSlug({
        tenantId,
        baseSlug: sample.slug || sample.title,
        transaction,
      });

      const product = await Product.create({
        tenantId,
        shopId: settings.shopId || shop?.id || null,
        name: sample.title,
        description: sample.shortDescription || null,
        sellingPrice: rentalFields.sellingPrice,
        costPrice: 0,
        quantityOnHand: 0,
        trackStock: false,
        isActive: true,
        isRentable: rentalFields.isRentable,
        isSalable: rentalFields.isSalable,
        rentalRatePerDay: rentalFields.rentalRatePerDay,
        imageUrl: images[0] || null,
        metadata: {
          isSample: true,
          sampleCatalogId: sample.id,
          createdByAdmin: true,
          ...rentalFields.metadata,
        },
      }, { transaction });

      const listingPublicPrice = rentalFields.isRentable && !rentalFields.isSalable
        ? (rentalFields.rentalRatePerDay || publicPrice)
        : publicPrice;

      const listingPayload = {
        tenantId,
        shopId: product.shopId,
        productId: product.id,
        status: 'published',
        title: sample.title,
        slug: listingSlug,
        shortDescription: sample.shortDescription || null,
        description: sample.shortDescription || null,
        publicPrice: listingPublicPrice,
        compareAtPrice,
        images,
        inventoryPolicy: 'continue',
        sortOrder: 0,
        publishedAt: new Date(),
        metadata: {
          isSample: true,
          sampleCatalogId: sample.id,
          createdByAdmin: true,
          source: 'admin_sample_seed',
        },
      };
      assertListingPublishable(listingPayload);
      const listing = await OnlineProductListing.create(listingPayload, { transaction });
      created.push(serializeListingForAdmin({
        ...listing.get({ plain: true }),
        product: product.get({ plain: true }),
      }));
    }

    await transaction.commit();
    invalidatePublicStorefrontCache(settings.slug);

    res.status(201).json({
      success: true,
      data: { created, skipped },
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * DELETE /admin/tenants/:id/online-store/sample-products
 */
exports.clearTenantSampleProducts = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = req.params.id;
    const { settings } = await resolveTenantContext(tenantId);

    const listings = await OnlineProductListing.findAll({
      where: { tenantId },
      include: [{ model: Product, as: 'product', required: false }],
      transaction,
    });
    const samples = listings.filter((listing) => listingIsSample(listing));
    const productIds = [...new Set(samples.map((listing) => listing.productId).filter(Boolean))];

    for (const listing of samples) {
      await listing.destroy({ transaction });
    }

    if (productIds.length) {
      const sampleProducts = await Product.findAll({
        where: { tenantId, id: { [Op.in]: productIds } },
        transaction,
      });
      for (const product of sampleProducts) {
        await product.destroy({ transaction });
      }
    }

    await transaction.commit();
    if (settings?.slug) {
      invalidatePublicStorefrontCache(settings.slug);
    }

    res.status(200).json({
      success: true,
      data: { removedListings: samples.length, removedProducts: productIds.length },
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * POST /admin/tenants/:id/online-store/products
 */
exports.createTenantStoreProduct = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = req.params.id;
    const { tenant, shop, settings } = await resolveTenantContext(tenantId);
    if (!settings) {
      throw httpError(400, 'Create store settings before adding products');
    }

    const title = String(req.body.title || req.body.name || '').trim();
    if (!title) {
      throw httpError(400, 'Product name is required');
    }

    const publicPrice = normalizeMoney(req.body.publicPrice ?? req.body.sellingPrice, 0);
    const compareAtPrice = req.body.compareAtPrice === undefined
      || req.body.compareAtPrice === null
      || req.body.compareAtPrice === ''
      ? null
      : normalizeMoney(req.body.compareAtPrice, 0);
    const images = normalizeImages(req.body.images);
    const shortDescription = req.body.shortDescription
      ? String(req.body.shortDescription).trim().slice(0, 280)
      : null;
    const description = req.body.description
      ? String(req.body.description).trim()
      : shortDescription;
    const trackStock = req.body.trackStock !== false && req.body.trackStock !== 'false';
    const quantityOnHand = normalizeMoney(req.body.quantityOnHand, trackStock ? 0 : 0);
    const isRentalTenant = tenant.businessType === 'rental';
    const sampleLikeBody = {
      publicPrice,
      isRentable: req.body.isRentable,
      isSalable: req.body.isSalable,
      rentalRatePerDay: req.body.rentalRatePerDay,
      rentalTerms: req.body.rentalTerms,
    };
    const rentalFields = buildSampleProductRentalFields(sampleLikeBody, { businessType: tenant.businessType });
    const listingPublicPrice = isRentalTenant && rentalFields.isRentable && !rentalFields.isSalable
      ? (rentalFields.rentalRatePerDay || publicPrice)
      : publicPrice;
    const listingSlug = await uniqueListingSlug({
      tenantId,
      baseSlug: req.body.slug || title,
      transaction,
    });

    const listingPayload = {
      tenantId,
      shopId: settings.shopId || shop?.id || null,
      status: 'published',
      title,
      slug: listingSlug,
      shortDescription,
      description,
      publicPrice: listingPublicPrice,
      compareAtPrice,
      images,
      inventoryPolicy: trackStock ? 'track' : 'continue',
      sortOrder: Number.isInteger(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0,
      publishedAt: new Date(),
      metadata: {
        isSample: false,
        createdByAdmin: true,
        source: 'admin_client_product',
        provisionedByUserId: req.user?.id || null,
      },
    };
    assertListingPublishable(listingPayload);

    const product = await Product.create({
      tenantId,
      shopId: listingPayload.shopId,
      name: title,
      description,
      sellingPrice: isRentalTenant ? rentalFields.sellingPrice : publicPrice,
      costPrice: normalizeMoney(req.body.costPrice, 0),
      quantityOnHand,
      trackStock,
      isActive: true,
      isRentable: isRentalTenant ? rentalFields.isRentable : undefined,
      isSalable: isRentalTenant ? rentalFields.isSalable : undefined,
      rentalRatePerDay: isRentalTenant ? rentalFields.rentalRatePerDay : undefined,
      imageUrl: images[0] || null,
      metadata: {
        isSample: false,
        createdByAdmin: true,
        ...(isRentalTenant ? rentalFields.metadata : {}),
      },
    }, { transaction });

    listingPayload.productId = product.id;
    const listing = await OnlineProductListing.create(listingPayload, { transaction });

    await transaction.commit();
    invalidatePublicStorefrontCache(settings.slug);

    res.status(201).json({
      success: true,
      data: serializeListingForAdmin({
        ...listing.get({ plain: true }),
        product: product.get({ plain: true }),
      }),
      tenant: { id: tenant.id, name: tenant.name },
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * PATCH /admin/tenants/:id/online-store/products/:listingId
 */
exports.updateTenantStoreProduct = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = req.params.id;
    const listingId = req.params.listingId;
    const { settings } = await resolveTenantContext(tenantId);

    const listing = await OnlineProductListing.findOne({
      where: { id: listingId, tenantId },
      include: [{ model: Product, as: 'product', required: false }],
      transaction,
    });
    if (!listing) {
      throw httpError(404, 'Listing not found');
    }
    if (listingIsSample(listing)) {
      throw httpError(400, 'Sample products cannot be edited here. Clear and re-seed samples instead.');
    }

    const title = Object.prototype.hasOwnProperty.call(req.body, 'title')
      || Object.prototype.hasOwnProperty.call(req.body, 'name')
      ? String(req.body.title || req.body.name || '').trim()
      : listing.title;
    if (!title) {
      throw httpError(400, 'Product name is required');
    }

    const nextSlug = Object.prototype.hasOwnProperty.call(req.body, 'slug')
      ? normalizeSlug(req.body.slug || title, 'product')
      : listing.slug;
    if (nextSlug !== listing.slug) {
      await ensureListingSlugAvailable({
        slug: nextSlug,
        tenantId,
        currentId: listing.id,
        transaction,
      });
    }

    const publicPrice = Object.prototype.hasOwnProperty.call(req.body, 'publicPrice')
      || Object.prototype.hasOwnProperty.call(req.body, 'sellingPrice')
      ? normalizeMoney(req.body.publicPrice ?? req.body.sellingPrice, 0)
      : normalizeMoney(listing.publicPrice, 0);

    const compareAtPrice = Object.prototype.hasOwnProperty.call(req.body, 'compareAtPrice')
      ? (
        req.body.compareAtPrice === null || req.body.compareAtPrice === ''
          ? null
          : normalizeMoney(req.body.compareAtPrice, 0)
      )
      : listing.compareAtPrice;

    const images = Object.prototype.hasOwnProperty.call(req.body, 'images')
      ? normalizeImages(req.body.images)
      : normalizeImages(listing.images);

    const shortDescription = Object.prototype.hasOwnProperty.call(req.body, 'shortDescription')
      ? (req.body.shortDescription ? String(req.body.shortDescription).trim().slice(0, 280) : null)
      : listing.shortDescription;

    const description = Object.prototype.hasOwnProperty.call(req.body, 'description')
      ? (req.body.description ? String(req.body.description).trim() : null)
      : listing.description;

    const existingMeta = listing.metadata && typeof listing.metadata === 'object' ? listing.metadata : {};
    const listingPayload = {
      title,
      slug: nextSlug,
      shortDescription,
      description,
      publicPrice,
      compareAtPrice,
      images,
      status: 'published',
      publishedAt: listing.publishedAt || new Date(),
      metadata: {
        ...existingMeta,
        isSample: false,
        createdByAdmin: true,
        updatedByAdminAt: new Date().toISOString(),
        updatedByUserId: req.user?.id || null,
      },
    };
    assertListingPublishable(listingPayload);

    await listing.update(listingPayload, { transaction });

    if (listing.product) {
      const productUpdates = {
        name: title,
        description: description || shortDescription,
        sellingPrice: publicPrice,
        imageUrl: images[0] || listing.product.imageUrl || null,
      };
      if (Object.prototype.hasOwnProperty.call(req.body, 'quantityOnHand')) {
        productUpdates.quantityOnHand = normalizeMoney(req.body.quantityOnHand, 0);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'trackStock')) {
        productUpdates.trackStock = req.body.trackStock !== false && req.body.trackStock !== 'false';
        await listing.update({
          inventoryPolicy: productUpdates.trackStock ? 'track' : 'continue',
        }, { transaction });
      }
      await listing.product.update(productUpdates, { transaction });
    }

    await listing.reload({
      include: [{ model: Product, as: 'product', required: false }],
      transaction,
    });

    await transaction.commit();
    if (settings?.slug) {
      invalidatePublicStorefrontCache(settings.slug);
    }

    res.status(200).json({
      success: true,
      data: serializeListingForAdmin(listing),
    });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * DELETE /admin/tenants/:id/online-store/products/:listingId
 */
exports.deleteTenantStoreProduct = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const tenantId = req.params.id;
    const listingId = req.params.listingId;
    const { settings } = await resolveTenantContext(tenantId);

    const listing = await OnlineProductListing.findOne({
      where: { id: listingId, tenantId },
      include: [{ model: Product, as: 'product', required: false }],
      transaction,
    });
    if (!listing) {
      throw httpError(404, 'Listing not found');
    }
    if (listingIsSample(listing)) {
      throw httpError(400, 'Use Clear samples to remove sample products');
    }

    const product = listing.product;
    const createdByAdmin = listing.metadata?.createdByAdmin === true
      || product?.metadata?.createdByAdmin === true;

    await listing.destroy({ transaction });

    if (product && createdByAdmin) {
      const otherListings = await OnlineProductListing.count({
        where: { productId: product.id, tenantId },
        transaction,
      });
      if (otherListings === 0) {
        await product.destroy({ transaction });
      }
    }

    await transaction.commit();
    if (settings?.slug) {
      invalidatePublicStorefrontCache(settings.slug);
    }

    res.status(200).json({ success: true, message: 'Product removed from store' });
  } catch (error) {
    await transaction.rollback();
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * POST /admin/tenants/:id/online-store/products/upload-images
 */
exports.uploadTenantStoreProductImages = async (req, res, next) => {
  try {
    const tenantId = req.params.id;
    await resolveTenantContext(tenantId);

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
      const subDir = path.join('store-listings', tenantId);
      const uploadPath = path.join(baseUploadDir, subDir);
      ensureDirExists(uploadPath);
      const ext = path.extname(file.originalname) || '.jpg';
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.[^.]+$/, '') || 'listing';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}${ext}`;
      fs.writeFileSync(path.join(uploadPath, filename), file.buffer);
      return `/uploads/store-listings/${tenantId}/${filename}`;
    });

    res.status(200).json({ success: true, data: { imageUrls } });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
