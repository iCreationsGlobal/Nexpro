const { Tenant } = require('../models');
const { canAccessFeature } = require('../config/features');
const { getTenantEffectiveEntitlements } = require('./tenantEntitlements');
const { normalizeTenantInstanceForRequest } = require('./tenantClassification');

/**
 * Resolve whether a storefront tenant has an effective plan/business-type feature.
 * @param {string} tenantId
 * @param {string} featureKey
 * @returns {Promise<boolean>}
 */
const tenantHasEffectiveFeature = async (tenantId, featureKey) => {
  if (!tenantId || !featureKey) return false;

  const tenant = normalizeTenantInstanceForRequest(await Tenant.findByPk(tenantId));
  if (!tenant) return false;

  const entitlements = await getTenantEffectiveEntitlements(tenant);
  return canAccessFeature(entitlements.enabledFeatures, featureKey);
};

module.exports = {
  tenantHasEffectiveFeature,
};
