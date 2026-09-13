const { Tenant, Shop } = require('../models');
const { resolveBusinessType } = require('../config/businessTypes');
const { getTenantEffectiveEntitlements } = require('../utils/tenantEntitlements');
const { normalizeTenantClassification } = require('../utils/tenantClassification');
const { ensureDefaultShop } = require('../utils/shopUtils');
const { ensureRentalSettings } = require('./rentalSettingsService');
const { invalidateAuthBootstrapCache } = require('../middleware/cache');

const WORKSPACE_MANIFEST_VERSION = 1;

const RENTAL_UI = Object.freeze({
  primaryNav: ['dashboard', 'rentals', 'products', 'customers', 'deliveries', 'invoices', 'expenses', 'reports'],
  hideNav: ['quotes', 'jobs', 'prescriptions', 'pos'],
});

const RENTAL_MODULES = Object.freeze({
  rentals: true,
  shopsModule: true,
  products: true,
  deliveries: true,
  quotes: false,
  jobs: false,
  pos: false,
  prescriptions: false,
});

/**
 * @param {object|null|undefined} tenant
 * @returns {object|null}
 */
const getWorkspaceManifest = (tenant) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const manifest = metadata.workspaceManifest;
  return manifest && typeof manifest === 'object' ? manifest : null;
};

/**
 * True when onboarding completed and workspace manifest is locked.
 * @param {object|null|undefined} tenant
 * @returns {boolean}
 */
const isWorkspaceLocked = (tenant) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const manifest = getWorkspaceManifest(tenant);
  return Boolean(metadata.onboarding?.completedAt && manifest?.lockedAt);
};

/**
 * Build a rental workspace manifest snapshot from current tenant state.
 * @param {object} params
 * @param {object} params.tenant
 * @param {string[]|undefined} params.enabledFeatures
 * @param {object|undefined} params.effectiveFeatureFlags
 * @param {string|null|undefined} params.defaultBranchId
 * @param {object|undefined} params.rentalSettings
 * @param {string|null|undefined} params.subType
 * @param {object|undefined} params.provisioned
 * @returns {object}
 */
const buildRentalWorkspaceManifest = ({
  tenant,
  enabledFeatures = [],
  effectiveFeatureFlags = {},
  defaultBranchId = null,
  rentalSettings = {},
  subType = null,
  provisioned = {},
}) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const lockedAt = metadata.onboarding?.completedAt || new Date().toISOString();

  return {
    version: WORKSPACE_MANIFEST_VERSION,
    kind: 'rental',
    lockedAt,
    subType: subType || metadata.rentalType || metadata.businessSubType || null,
    defaultBranchId,
    enabledFeatures: [...new Set(enabledFeatures)].sort(),
    effectiveFeatureFlags: { ...effectiveFeatureFlags },
    modules: { ...RENTAL_MODULES },
    ui: { ...RENTAL_UI },
    settingsKeys: {
      rental: rentalSettings,
    },
    provisioned: {
      defaultShopId: defaultBranchId,
      rentalSettingsSeeded: true,
      categoriesSeeded: Boolean(provisioned.categoriesSeeded),
      automationsSeeded: Boolean(provisioned.automationsSeeded),
      ...provisioned,
    },
  };
};

/**
 * Resolve the default rental branch (shop) id for a tenant.
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
const resolveDefaultBranchId = async (tenantId) => {
  const defaultShop = await Shop.findOne({
    where: { tenantId, isDefault: true },
    attributes: ['id'],
  });
  if (defaultShop?.id) return defaultShop.id;

  const fallbackShop = await Shop.findOne({
    where: { tenantId },
    attributes: ['id'],
    order: [['createdAt', 'ASC']],
  });
  return fallbackShop?.id || null;
};

/**
 * Provision and lock a rental workspace manifest on the tenant.
 * Idempotent: safe to call after onboarding or for backfill.
 * @param {string} tenantId
 * @param {{ subType?: string|null, force?: boolean, provisioned?: object }} [options]
 * @returns {Promise<{ manifest: object, created: boolean }>}
 */
const provisionRentalWorkspace = async (tenantId, options = {}) => {
  const { subType = null, force = false, provisioned = {} } = options;

  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const resolvedType = resolveBusinessType(tenant.businessType);
  if (resolvedType !== 'rental') {
    throw new Error(`Tenant ${tenantId} is not a rental workspace (businessType=${tenant.businessType})`);
  }

  const existingManifest = getWorkspaceManifest(tenant);
  if (existingManifest && !force) {
    return { manifest: existingManifest, created: false };
  }

  await ensureDefaultShop(tenantId);
  const rentalSettings = await ensureRentalSettings(tenantId);
  const defaultBranchId = await resolveDefaultBranchId(tenantId);

  const tenantJson = normalizeTenantClassification(tenant);
  const entitlements = await getTenantEffectiveEntitlements(tenantJson, {
    logContext: `provisionRentalWorkspace:${tenantId}`,
  });

  const manifest = buildRentalWorkspaceManifest({
    tenant: tenantJson,
    enabledFeatures: entitlements.enabledFeatures || [],
    effectiveFeatureFlags: entitlements.effectiveFeatureFlags || {},
    defaultBranchId,
    rentalSettings,
    subType,
    provisioned,
  });

  const metadata = tenant.metadata && typeof tenant.metadata === 'object'
    ? { ...tenant.metadata }
    : {};
  metadata.workspaceManifest = manifest;
  tenant.metadata = metadata;
  await tenant.save();

  try {
    invalidateAuthBootstrapCache({ tenantId });
  } catch (cacheErr) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TenantProvisioning] bootstrap cache invalidation failed:', cacheErr?.message);
    }
  }

  return { manifest, created: !existingManifest || force };
};

/**
 * Rebuild manifest from current tenant + plan state (billing changes, admin).
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
const rebuildRentalWorkspaceManifest = async (tenantId) => {
  const { manifest } = await provisionRentalWorkspace(tenantId, { force: true });
  return manifest;
};

module.exports = {
  WORKSPACE_MANIFEST_VERSION,
  RENTAL_UI,
  RENTAL_MODULES,
  getWorkspaceManifest,
  isWorkspaceLocked,
  buildRentalWorkspaceManifest,
  resolveDefaultBranchId,
  provisionRentalWorkspace,
  rebuildRentalWorkspaceManifest,
};
