const { Tenant, Shop, StudioLocation, Pharmacy } = require('../models');
const { resolveBusinessType } = require('../config/businessTypes');
const { loadTenantOrganization } = require('./documentOrganizationUtils');
const { resolveSmsDisplayName } = require('./smsMessageUtils');

const BRANCH_MODEL_BY_TYPE = {
  shop: Shop,
  studio: StudioLocation,
  pharmacy: Pharmacy,
};

const BRANCH_ID_KEYS_BY_TYPE = {
  shop: 'shopId',
  studio: 'studioLocationId',
  pharmacy: 'pharmacyId',
};

const BRANCH_ATTRIBUTES = ['id', 'name', 'email', 'phone', 'address', 'city', 'state', 'country', 'postalCode', 'logoUrl'];

/**
 * Extract branch id hints from messaging context.
 * @param {object} context
 * @returns {{ shopId: string|null, studioLocationId: string|null, pharmacyId: string|null }}
 */
function extractBranchIdsFromContext(context = {}) {
  const customer = context.customer || {};
  const invoice = context.invoice || {};
  const quote = context.quote || {};
  const job = context.job || {};
  const product = context.product || {};

  return {
    shopId:
      context.shopId
      || context.shop?.id
      || invoice.shopId
      || quote.shopId
      || job.shopId
      || customer.shopId
      || product.shopId
      || null,
    studioLocationId:
      context.studioLocationId
      || context.studioLocation?.id
      || invoice.studioLocationId
      || quote.studioLocationId
      || job.studioLocationId
      || customer.studioLocationId
      || product.studioLocationId
      || null,
    pharmacyId:
      context.pharmacyId
      || context.pharmacy?.id
      || invoice.pharmacyId
      || quote.pharmacyId
      || job.pharmacyId
      || customer.pharmacyId
      || product.pharmacyId
      || context.branchId
      || null,
  };
}

/**
 * @param {string} tenantId
 * @param {'shop'|'studio'|'pharmacy'} businessType
 * @returns {Promise<number>}
 */
async function countTenantBranches(tenantId, businessType) {
  const model = BRANCH_MODEL_BY_TYPE[businessType];
  if (!model) return 0;
  return model.count({ where: { tenantId } });
}

/**
 * @param {string} tenantId
 * @param {'shop'|'studio'|'pharmacy'} businessType
 * @returns {Promise<object|null>}
 */
async function loadPrimaryBranch(tenantId, businessType) {
  const model = BRANCH_MODEL_BY_TYPE[businessType];
  if (!model) return null;

  if (businessType === 'shop' || businessType === 'studio') {
    const defaultBranch = await model.findOne({
      where: { tenantId, isDefault: true },
      attributes: BRANCH_ATTRIBUTES,
    });
    if (defaultBranch) return defaultBranch;
  }

  return model.findOne({
    where: { tenantId },
    attributes: BRANCH_ATTRIBUTES,
    order: [['createdAt', 'ASC']],
  });
}

/**
 * @param {string} tenantId
 * @param {'shop'|'studio'|'pharmacy'} businessType
 * @param {{ shopId?: string|null, studioLocationId?: string|null, pharmacyId?: string|null }} branchIds
 * @returns {Promise<{ shop: object|null, studioLocation: object|null, pharmacy: object|null }>}
 */
async function loadBranchesForContext(tenantId, businessType, branchIds) {
  const shop = branchIds.shopId
    ? await Shop.findByPk(branchIds.shopId, { attributes: BRANCH_ATTRIBUTES })
    : null;
  const studioLocation = branchIds.studioLocationId
    ? await StudioLocation.findByPk(branchIds.studioLocationId, { attributes: BRANCH_ATTRIBUTES })
    : null;
  const pharmacy = branchIds.pharmacyId
    ? await Pharmacy.findByPk(branchIds.pharmacyId, { attributes: BRANCH_ATTRIBUTES })
    : null;

  if (shop || studioLocation || pharmacy) {
    return { shop, studioLocation, pharmacy };
  }

  const branchIdKey = BRANCH_ID_KEYS_BY_TYPE[businessType];
  const explicitId = branchIds[branchIdKey];
  if (!explicitId) {
    return { shop: null, studioLocation: null, pharmacy: null };
  }

  const model = BRANCH_MODEL_BY_TYPE[businessType];
  const branch = await model.findOne({
    where: { tenantId, id: explicitId },
    attributes: BRANCH_ATTRIBUTES,
  });
  if (!branch) {
    return { shop: null, studioLocation: null, pharmacy: null };
  }

  if (businessType === 'shop') return { shop: branch, studioLocation: null, pharmacy: null };
  if (businessType === 'studio') return { shop: null, studioLocation: branch, pharmacy: null };
  return { shop: null, studioLocation: null, pharmacy: branch };
}

/**
 * Resolve customer-facing business and branch names for messaging context.
 * Single-branch tenants use workspace organization name; multi-branch tenants use the
 * specific branch when one is available in context.
 *
 * @param {string} tenantId
 * @param {object} [context]
 * @param {string} [context.branchId]
 * @param {string} [context.shopId]
 * @param {string} [context.studioLocationId]
 * @param {string} [context.pharmacyId]
 * @param {object} [context.job]
 * @param {object} [context.invoice]
 * @param {object} [context.quote]
 * @param {object} [context.customer]
 * @param {object} [context.product]
 * @returns {Promise<{ businessName: string, branchName: string }>}
 */
async function resolveBusinessNameForContext(tenantId, context = {}) {
  if (!tenantId) {
    return { businessName: 'Business', branchName: '' };
  }

  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'businessType'] });
  const businessType = resolveBusinessType(tenant?.businessType);
  const { organization: tenantOrg } = await loadTenantOrganization(tenantId);
  const tenantBusinessName = resolveSmsDisplayName(tenantOrg);
  const branchCount = await countTenantBranches(tenantId, businessType);

  if (branchCount <= 1) {
    return {
      businessName: tenantBusinessName,
      branchName: '',
    };
  }

  const branchIds = extractBranchIdsFromContext(context);
  const { shop, studioLocation, pharmacy } = await loadBranchesForContext(tenantId, businessType, branchIds);
  const resolvedBranch = shop || studioLocation || pharmacy;

  if (resolvedBranch) {
    const branchName = String(resolvedBranch.name || '').trim() || tenantBusinessName;
    return {
      businessName: branchName,
      branchName,
    };
  }

  const primaryBranch = await loadPrimaryBranch(tenantId, businessType);
  const fallbackBranchName = String(primaryBranch?.name || '').trim();
  if (fallbackBranchName) {
    return {
      businessName: fallbackBranchName,
      branchName: fallbackBranchName,
    };
  }

  return {
    businessName: tenantBusinessName,
    branchName: '',
  };
}

module.exports = {
  extractBranchIdsFromContext,
  countTenantBranches,
  loadPrimaryBranch,
  loadBranchesForContext,
  resolveBusinessNameForContext,
};
