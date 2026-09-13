/** Platform admin accounts that always receive full Control Center access. */
const BOOTSTRAP_SUPERADMIN_EMAILS = new Set([
  'info@absghana.com',
  'superadmin@nexpro.com',
  ...(process.env.NODE_ENV === 'production' ? [] : ['admin@gmail.com']),
]);

/**
 * @param {{ email?: string } | null | undefined} user
 * @returns {boolean}
 */
const isBootstrapPlatformSuperAdmin = (user) => {
  const email = String(user?.email || '').trim().toLowerCase();
  return email.length > 0 && BOOTSTRAP_SUPERADMIN_EMAILS.has(email);
};

module.exports = {
  BOOTSTRAP_SUPERADMIN_EMAILS,
  isBootstrapPlatformSuperAdmin,
};
