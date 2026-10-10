/** Platform admin accounts that always receive full Control Center access. */
const BOOTSTRAP_SUPERADMIN_EMAILS = new Set([
  'info@absghana.com',
  'superadmin@nexpro.com',
  ...(process.env.NODE_ENV === 'production' ? [] : ['admin@gmail.com']),
]);

/**
 * Super-admin access is granted by email alone, so these addresses are reserved: no flow other than
 * a super admin acting directly may move an account onto one of them.
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
const isBootstrapPlatformSuperAdminEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.length > 0 && BOOTSTRAP_SUPERADMIN_EMAILS.has(normalized);
};

/**
 * @param {{ email?: string } | null | undefined} user
 * @returns {boolean}
 */
const isBootstrapPlatformSuperAdmin = (user) => isBootstrapPlatformSuperAdminEmail(user?.email);

module.exports = {
  BOOTSTRAP_SUPERADMIN_EMAILS,
  isBootstrapPlatformSuperAdmin,
  isBootstrapPlatformSuperAdminEmail,
};
