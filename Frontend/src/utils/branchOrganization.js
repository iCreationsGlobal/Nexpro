/**
 * Merge shop/studio branch fields over tenant organization settings for print/receipt UI.
 * @param {object|null} branch - Shop or studio location row
 * @param {object} tenantOrganization - Workspace organization settings
 * @returns {object}
 */
export const mergeBranchOrganization = (branch, tenantOrganization = {}) => {
  if (!branch) return tenantOrganization;

  // Shop.country defaults to 'Ghana' even when no other address field was ever filled in for
  // that branch, so checking `branch.country` alone would treat every branch as having a full
  // address and clobber the tenant's real address with just "Ghana". Only line1/city/state/
  // postalCode indicate the branch actually has its own address on file.
  const hasBranchAddress =
    branch.address ||
    branch.city ||
    branch.state ||
    branch.postalCode;

  const tenantAddress = tenantOrganization.address || {};
  const address = hasBranchAddress
    ? {
        line1: branch.address || tenantAddress.line1 || '',
        line2: tenantAddress.line2 || '',
        city: branch.city || tenantAddress.city || '',
        state: branch.state || tenantAddress.state || '',
        postalCode: branch.postalCode || tenantAddress.postalCode || '',
        country: branch.country || tenantAddress.country || '',
      }
    : tenantOrganization.address;

  return {
    ...tenantOrganization,
    name: branch.name || tenantOrganization.name,
    email: branch.email || tenantOrganization.email,
    phone: branch.phone || tenantOrganization.phone,
    logoUrl: branch.logoUrl || tenantOrganization.logoUrl,
    address,
  };
};
