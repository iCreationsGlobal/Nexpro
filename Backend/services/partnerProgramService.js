const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  PartnerProgramSettings,
  PartnerProgramService,
  PartnershipApplication,
  Partnership,
  Marketer,
  Tenant,
  Product,
  PricingTemplate,
  OnlineServiceListing,
} = require('../models');
const {
  getSabitoPartnerCategoryLabel,
  getTenantBusinessSubtype,
  defaultSabitoPartnerCategoryId,
  findSabitoPartnerCategory,
  isAllowedSabitoPartnerCategory,
  resolvePublicCategoryFilterValues,
} = require('../config/sabitoPartnerCategories');

const money = (value) => Number((Number.parseFloat(value || 0) || 0).toFixed(2));

const MODERATION_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
const PUBLIC_LISTING_WHERE = {
  enabled: true,
  listed: true,
  moderationStatus: 'approved',
};
const LISTING_MATERIAL_FIELDS = [
  'displayName',
  'pitch',
  'logoUrl',
  'category',
  'location',
  'firstClientRatePercent',
  'returningClientRatePercent',
  'slug',
];

const valuesDiffer = (left, right, key) => {
  if (key === 'firstClientRatePercent' || key === 'returningClientRatePercent') {
    return money(left) !== money(right);
  }
  return String(left ?? '') !== String(right ?? '');
};

const listingFieldsChanged = (settings, updates) =>
  LISTING_MATERIAL_FIELDS.some(
    (key) => updates[key] !== undefined && valuesDiffer(updates[key], settings[key], key)
  );

/**
 * Tenant saves never approve a listing. Listing on / material listing edits go to pending review.
 */
const applyTenantModeration = (settings, updates, willEnable, willList) => {
  const current = MODERATION_STATUSES.includes(settings.moderationStatus)
    ? settings.moderationStatus
    : 'draft';
  delete updates.moderationStatus;
  delete updates.moderationNote;
  delete updates.moderatedAt;
  delete updates.moderatedBy;

  if (current === 'suspended') {
    return;
  }

  if (!willList || !willEnable) {
    if (current === 'draft' || !settings.moderationStatus) {
      updates.moderationStatus = 'draft';
    }
    return;
  }

  const materialChange = listingFieldsChanged(settings, updates);
  const turningOnList = updates.listed === true && !settings.listed;
  if (current === 'approved' && !materialChange && !turningOnList) {
    return;
  }
  if (current === 'approved' && turningOnList && !materialChange) {
    return;
  }

  updates.moderationStatus = 'pending';
  updates.moderationNote = null;
};

const pendApprovedListing = async (settings) => {
  if (settings?.enabled && settings?.listed && settings?.moderationStatus === 'approved') {
    await settings.update({
      moderationStatus: 'pending',
      moderationNote: null,
    });
  }
  return settings;
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `partner-${Date.now().toString(36)}`;

const generateReferralCode = () => {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SP-${raw}`;
};

const countActivePartnerships = async (tenantId, transaction) =>
  Partnership.count({
    where: { tenantId, status: 'active' },
    transaction,
  });

/**
 * Get or create partner program settings for a tenant.
 */
const getOrCreateSettings = async (tenantId, tenantName) => {
  let settings = await PartnerProgramSettings.findOne({ where: { tenantId } });
  if (settings) return settings;

  const tenant = await Tenant.findByPk(tenantId);
  const displayName = tenantName || tenant?.name || tenant?.companyName || 'Business';
  const subtype = getTenantBusinessSubtype(tenant);
  const category = defaultSabitoPartnerCategoryId(tenant?.businessType, subtype);

  const baseSlug = slugify(displayName);
  let slug = baseSlug;
  let attempt = 0;
  while (await PartnerProgramSettings.findOne({ where: { slug } })) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`.slice(0, 80);
  }

  settings = await PartnerProgramSettings.create({
    tenantId,
    enabled: false,
    listed: false,
    slug,
    displayName,
    category: category || null,
    firstClientRatePercent: 10,
    returningClientRatePercent: 5,
    attributionMonths: 12,
    maxMarketers: 10,
    moderationStatus: 'draft',
  });
  return settings;
};

const settingsInclude = [
  {
    model: PartnerProgramService,
    as: 'services',
    where: { isActive: true },
    required: false,
    include: [
      { model: Product, as: 'product', attributes: ['id', 'name'] },
      { model: PricingTemplate, as: 'pricingTemplate', attributes: ['id', 'name'] },
      { model: OnlineServiceListing, as: 'onlineServiceListing', attributes: ['id', 'title', 'slug'] },
    ],
  },
];

const toPublicListing = async (settings, activeCount) => {
  const slotsLeft = Math.max(0, Number(settings.maxMarketers || 0) - Number(activeCount || 0));
  const first = money(settings.firstClientRatePercent);
  const returning = money(settings.returningClientRatePercent);
  const serviceRates = (settings.services || [])
    .map((s) => money(s.firstClientRatePercent ?? first))
    .filter((n) => Number.isFinite(n));
  const commissionFrom = serviceRates.length ? Math.min(...serviceRates, first) : first;

  return {
    id: settings.id,
    tenantId: settings.tenantId,
    slug: settings.slug,
    name: settings.displayName,
    category: getSabitoPartnerCategoryLabel(settings.category),
    location: settings.location || 'Ghana',
    pitch: settings.pitch || '',
    description: settings.pitch || '',
    logoUrl: settings.logoUrl || null,
    imageUrl: settings.logoUrl || null,
    commissionFrom,
    firstClientRatePercent: first,
    returningClientRatePercent: returning,
    attributionMonths: settings.attributionMonths,
    maxMarketers: settings.maxMarketers,
    activePartners: activeCount,
    slotsLeft,
    applicationsOpen: slotsLeft > 0,
    payoutNotes: settings.payoutNotes || null,
    services: (settings.services || []).map((s) => ({
      id: s.id,
      label: s.label,
      firstClientRatePercent: s.firstClientRatePercent != null ? money(s.firstClientRatePercent) : first,
      returningClientRatePercent:
        s.returningClientRatePercent != null ? money(s.returningClientRatePercent) : returning,
    })),
  };
};

const listPublicPartners = async ({ category, search, limit = 50 } = {}) => {
  const where = { ...PUBLIC_LISTING_WHERE };
  const categoryValues = resolvePublicCategoryFilterValues(category);
  if (categoryValues?.length) {
    where.category = { [Op.in]: categoryValues };
  }
  if (search) {
    where[Op.or] = [
      { displayName: { [Op.iLike]: `%${search}%` } },
      { pitch: { [Op.iLike]: `%${search}%` } },
      { location: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const rows = await PartnerProgramSettings.findAll({
    where,
    include: settingsInclude,
    order: [['displayName', 'ASC']],
    limit: Math.min(Number(limit) || 50, 100),
  });

  const results = [];
  for (const settings of rows) {
    const activeCount = await countActivePartnerships(settings.tenantId);
    results.push(await toPublicListing(settings, activeCount));
  }
  return results;
};

const getPublicPartnerBySlug = async (slug) => {
  const settings = await PartnerProgramSettings.findOne({
    where: { slug: String(slug || '').toLowerCase(), ...PUBLIC_LISTING_WHERE },
    include: settingsInclude,
  });
  if (!settings) return null;
  const activeCount = await countActivePartnerships(settings.tenantId);
  return toPublicListing(settings, activeCount);
};

const updateSettings = async (tenantId, payload = {}) => {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = await getOrCreateSettings(tenantId, tenant?.name || tenant?.companyName || 'Business');

  const updates = {};
  if (payload.enabled !== undefined) updates.enabled = Boolean(payload.enabled);
  if (payload.listed !== undefined) updates.listed = Boolean(payload.listed);
  if (payload.displayName != null) updates.displayName = String(payload.displayName).trim().slice(0, 160);
  if (payload.pitch !== undefined) updates.pitch = payload.pitch ? String(payload.pitch).trim() : null;
  if (payload.logoUrl !== undefined) updates.logoUrl = payload.logoUrl || null;
  if (payload.category !== undefined) {
    const raw = payload.category ? String(payload.category).trim().slice(0, 80) : null;
    if (raw) {
      const subtype = getTenantBusinessSubtype(tenant);
      if (
        !isAllowedSabitoPartnerCategory(tenant?.businessType, raw, {
          currentCategory: settings.category,
          subtype,
        })
      ) {
        const err = new Error('Select a category that matches this workspace type.');
        err.statusCode = 400;
        err.errorCode = 'INVALID_PARTNER_CATEGORY';
        throw err;
      }
      const found = findSabitoPartnerCategory(raw);
      updates.category = found ? found.id : raw;
    } else {
      updates.category = null;
    }
  }
  if (payload.location !== undefined) updates.location = payload.location ? String(payload.location).trim().slice(0, 160) : null;
  if (payload.firstClientRatePercent !== undefined) {
    updates.firstClientRatePercent = money(payload.firstClientRatePercent);
  }
  if (payload.returningClientRatePercent !== undefined) {
    updates.returningClientRatePercent = money(payload.returningClientRatePercent);
  }
  if (payload.attributionMonths !== undefined) {
    updates.attributionMonths = Math.max(1, Math.min(60, parseInt(payload.attributionMonths, 10) || 12));
  }
  if (payload.maxMarketers !== undefined) {
    updates.maxMarketers = Math.max(1, Math.min(500, parseInt(payload.maxMarketers, 10) || 10));
  }
  if (payload.payoutNotes !== undefined) {
    updates.payoutNotes = payload.payoutNotes ? String(payload.payoutNotes).trim() : null;
  }
  if (payload.slug) {
    const nextSlug = slugify(payload.slug);
    const clash = await PartnerProgramSettings.findOne({
      where: { slug: nextSlug, tenantId: { [Op.ne]: tenantId } },
    });
    if (!clash) updates.slug = nextSlug;
  }

  const willList = updates.listed !== undefined ? updates.listed : settings.listed;
  const willEnable = updates.enabled !== undefined ? updates.enabled : settings.enabled;
  if (willEnable && willList) {
    const nextCategory = updates.category !== undefined ? updates.category : settings.category;
    if (!nextCategory) {
      const err = new Error('Category is required when listing on Sabito.');
      err.statusCode = 400;
      err.errorCode = 'PARTNER_CATEGORY_REQUIRED';
      throw err;
    }
  }
  if (willEnable && willList && !settings.setupCompletedAt) {
    updates.setupCompletedAt = new Date();
  }

  applyTenantModeration(settings, updates, willEnable, willList);

  await settings.update(updates);
  return PartnerProgramSettings.findByPk(settings.id, { include: settingsInclude });
};

const replaceServices = async (tenantId, services = []) => {
  const settings = await getOrCreateSettings(tenantId);
  await PartnerProgramService.destroy({ where: { partnerProgramSettingsId: settings.id } });

  const created = [];
  for (const item of services) {
    if (!item?.label) continue;
    created.push(
      await PartnerProgramService.create({
        tenantId,
        partnerProgramSettingsId: settings.id,
        productId: item.productId || null,
        pricingTemplateId: item.pricingTemplateId || null,
        onlineServiceListingId: item.onlineServiceListingId || null,
        label: String(item.label).trim().slice(0, 160),
        firstClientRatePercent:
          item.firstClientRatePercent != null ? money(item.firstClientRatePercent) : null,
        returningClientRatePercent:
          item.returningClientRatePercent != null ? money(item.returningClientRatePercent) : null,
        isActive: item.isActive !== false,
      })
    );
  }
  await pendApprovedListing(settings);
  return created;
};

const applyToPartner = async ({ marketerId, tenantId, pitch }) => {
  const settings = await PartnerProgramSettings.findOne({
    where: { tenantId, ...PUBLIC_LISTING_WHERE },
  });
  if (!settings) {
    const err = new Error('This business is not accepting partner applications.');
    err.statusCode = 404;
    throw err;
  }

  const activeCount = await countActivePartnerships(tenantId);
  if (activeCount >= settings.maxMarketers) {
    const err = new Error('Applications are full for this business.');
    err.statusCode = 409;
    err.errorCode = 'PARTNER_SLOTS_FULL';
    throw err;
  }

  const existingPartnership = await Partnership.findOne({
    where: { tenantId, marketerId, status: 'active' },
  });
  if (existingPartnership) {
    const err = new Error('You are already an active partner with this business.');
    err.statusCode = 409;
    throw err;
  }

  const existingApp = await PartnershipApplication.findOne({ where: { tenantId, marketerId } });
  if (existingApp) {
    if (existingApp.status === 'pending') {
      return existingApp;
    }
    if (existingApp.status === 'declined') {
      await existingApp.update({
        status: 'pending',
        pitch: pitch ? String(pitch).trim() : existingApp.pitch,
        decisionNote: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      return existingApp;
    }
  }

  return PartnershipApplication.create({
    tenantId,
    marketerId,
    status: 'pending',
    pitch: pitch ? String(pitch).trim() : null,
  });
};

const approveApplication = async ({ tenantId, applicationId, reviewedBy }) => {
  const application = await PartnershipApplication.findOne({
    where: { id: applicationId, tenantId },
    include: [{ model: Marketer, as: 'marketer' }],
  });
  if (!application) {
    const err = new Error('Application not found');
    err.statusCode = 404;
    throw err;
  }
  if (application.status === 'approved') {
    const existing = await Partnership.findOne({
      where: { tenantId, marketerId: application.marketerId },
    });
    return { application, partnership: existing };
  }

  const settings = await getOrCreateSettings(tenantId);
  const activeCount = await countActivePartnerships(tenantId);
  if (activeCount >= settings.maxMarketers) {
    const err = new Error('Marketer slots are full. Raise max marketers or revoke a partner first.');
    err.statusCode = 409;
    err.errorCode = 'PARTNER_SLOTS_FULL';
    throw err;
  }

  let referralCode = generateReferralCode();
  while (await Partnership.findOne({ where: { referralCode } })) {
    referralCode = generateReferralCode();
  }

  const partnership = await Partnership.create({
    tenantId,
    marketerId: application.marketerId,
    applicationId: application.id,
    referralCode,
    status: 'active',
    firstClientRatePercent: money(settings.firstClientRatePercent),
    returningClientRatePercent: money(settings.returningClientRatePercent),
    attributionMonths: settings.attributionMonths,
    activatedAt: new Date(),
  });

  await application.update({
    status: 'approved',
    reviewedAt: new Date(),
    reviewedBy: reviewedBy || null,
  });

  return { application, partnership };
};

const declineApplication = async ({ tenantId, applicationId, reviewedBy, decisionNote }) => {
  const application = await PartnershipApplication.findOne({
    where: { id: applicationId, tenantId },
  });
  if (!application) {
    const err = new Error('Application not found');
    err.statusCode = 404;
    throw err;
  }
  await application.update({
    status: 'declined',
    decisionNote: decisionNote ? String(decisionNote).trim() : null,
    reviewedAt: new Date(),
    reviewedBy: reviewedBy || null,
  });
  return application;
};

const findPartnershipByReferralCode = async (code, tenantId = null) => {
  const where = {
    referralCode: String(code || '').trim().toUpperCase(),
    status: 'active',
  };
  if (tenantId) where.tenantId = tenantId;
  return Partnership.findOne({ where });
};

const moderateListing = async ({ settingsId, action, note, moderatedBy }) => {
  const settings = await PartnerProgramSettings.findByPk(settingsId);
  if (!settings) {
    const err = new Error('Business listing not found.');
    err.statusCode = 404;
    err.errorCode = 'LISTING_NOT_FOUND';
    throw err;
  }

  const now = new Date();
  const trimmedNote = note ? String(note).trim() : null;

  if (action === 'approve') {
    await settings.update({
      moderationStatus: 'approved',
      moderationNote: trimmedNote,
      moderatedAt: now,
      moderatedBy: moderatedBy || null,
    });
  } else if (action === 'reject') {
    await settings.update({
      moderationStatus: 'rejected',
      moderationNote: trimmedNote,
      moderatedAt: now,
      moderatedBy: moderatedBy || null,
    });
  } else if (action === 'suspend') {
    await settings.update({
      moderationStatus: 'suspended',
      moderationNote: trimmedNote,
      moderatedAt: now,
      moderatedBy: moderatedBy || null,
    });
  } else if (action === 'unsuspend') {
    const nextStatus = settings.enabled && settings.listed ? 'approved' : 'draft';
    await settings.update({
      moderationStatus: nextStatus,
      moderationNote: trimmedNote,
      moderatedAt: now,
      moderatedBy: moderatedBy || null,
    });
  } else {
    const err = new Error('Unknown moderation action.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_MODERATION_ACTION';
    throw err;
  }

  return PartnerProgramSettings.findByPk(settings.id, { include: settingsInclude });
};

module.exports = {
  money,
  getOrCreateSettings,
  listPublicPartners,
  getPublicPartnerBySlug,
  updateSettings,
  replaceServices,
  applyToPartner,
  approveApplication,
  declineApplication,
  countActivePartnerships,
  findPartnershipByReferralCode,
  moderateListing,
  pendApprovedListing,
  PUBLIC_LISTING_WHERE,
  MODERATION_STATUSES,
  settingsInclude,
  toPublicListing,
};
