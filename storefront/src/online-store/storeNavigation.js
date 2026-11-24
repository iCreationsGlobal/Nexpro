import { isOnlineStoreShopPath, isStorefrontCommercePath } from '../context/StorefrontModeContext';

/** Same list as Backend/config/businessTypes.js (LEGACY_TO_STUDIO). */
const SERVICE_BUSINESS_TYPES = new Set(['studio', 'printing_press', 'mechanic', 'barber', 'salon']);

/** Checkout and sign-in keep the shopper on one task, so they have no bottom bar. */
const PATHS_WITHOUT_TAB_BAR = new Set([
  '/checkout',
  '/checkout/paystack-callback',
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]);

const trimPath = (pathname) => String(pathname || '').replace(/\/+$/, '') || '/';

const underHome = (homePath, segment) => (homePath === '/' ? `/${segment}` : `${homePath}/${segment}`);

/** `storeMode` is only on the store home payload; the other store payloads carry the business type. */
export const isServiceStore = (store) => Boolean(
  store?.storeMode === 'studio'
  || store?.studioLocationId
  || SERVICE_BUSINESS_TYPES.has(store?.businessType),
);

/**
 * The store's own pages, in menu order.
 * @param {{ homePath: string, serviceStore?: boolean, homeLabel?: string }} opts
 */
export const getStorePages = ({ homePath, serviceStore = false, homeLabel = 'Home' }) => [
  { key: 'home', label: homeLabel, to: homePath },
  {
    key: 'catalog',
    label: serviceStore ? 'All Services' : 'All Products',
    to: underHome(homePath, serviceStore ? 'services' : 'products'),
  },
  { key: 'categories', label: 'Categories', to: underHome(homePath, 'categories') },
  { key: 'about', label: 'About Us', to: underHome(homePath, 'about') },
  { key: 'reviews', label: 'Reviews', to: underHome(homePath, 'reviews') },
];

/**
 * Which store page or tab a path belongs to; '' when it is none of them (e.g. order tracking).
 * @param {string} pathname
 */
export const getActiveStorePage = (pathname) => {
  const path = trimPath(pathname);
  if (path === '/cart') return 'cart';
  if (path === '/account' || path.startsWith('/account/')) return 'account';
  const page = path.replace(/^\/(?:shop|stores|template)\/[^/]+/, '') || '/';
  if (page === '/') return 'home';
  const segment = page.split('/')[1];
  if (segment === 'products' || segment === 'services') return 'catalog';
  return ['categories', 'about', 'reviews'].includes(segment) ? segment : '';
};

/**
 * Whether an Online Store path shows the bottom bar (on phones and tablets).
 * @param {string} pathname
 * @param {{ isCustomDomain?: boolean }} [opts]
 */
export const hasStoreTabBar = (pathname, { isCustomDomain = false } = {}) => {
  const path = trimPath(pathname);
  if (PATHS_WITHOUT_TAB_BAR.has(path)) return false;
  if (isCustomDomain) return true;
  // `/` and `/shop` on the shared host are not a shop.
  return isStorefrontCommercePath(path) || (isOnlineStoreShopPath(path) && path.split('/').length > 2);
};
