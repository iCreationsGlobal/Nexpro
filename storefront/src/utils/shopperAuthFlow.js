export const getShopperAuthMode = (pathname, queryMode) => {
  if (pathname === '/verify-email' || queryMode === 'verify') return 'verify';
  if (pathname === '/signup' || queryMode === 'signup') return 'signup';
  return 'login';
};

export const buildShopperAuthPath = (mode, search = '') => {
  const params = new URLSearchParams(search);
  params.delete('mode');
  params.delete('reason');
  const path = mode === 'verify' ? '/verify-email' : mode === 'signup' ? '/signup' : '/login';
  return params.size ? `${path}?${params}` : path;
};

export const isExistingShopperAccountError = (error) => (
  error?.response?.data?.errorCode === 'STOREFRONT_ACCOUNT_EXISTS'
  // Keep the storefront usable while the backend deployment rolls out.
  || (error?.response?.status === 409
    && /shopper account with this email already exists/i.test(error?.response?.data?.message || ''))
);
