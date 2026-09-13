export const BOOTSTRAP_SUPERADMIN_EMAILS = new Set([
  'superadmin@gmail.com',
  'superadmin@nexpro.com',
  ...(import.meta.env.DEV ? ['admin@gmail.com'] : []),
]);

export const isBootstrapPlatformSuperAdmin = (user) => {
  const email = String(user?.email || '').trim().toLowerCase();
  return email.length > 0 && BOOTSTRAP_SUPERADMIN_EMAILS.has(email);
};
