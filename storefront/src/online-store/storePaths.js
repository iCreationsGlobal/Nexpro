import { searchStoreListings } from './storeSearch.js';

/**
 * Path helpers for single-merchant Online Store surfaces.
 * Keeps shoppers inside the store (never marketplace /products or /stores directory).
 */

/**
 * Detect whether the current path uses the /shop/:slug Online Store prefix
 * (or legacy /template/:slug).
 * @param {string} [pathname]
 * @returns {boolean}
 */
export const isOnlineStoreShopPrefix = (pathname = '') => {
  const path = String(pathname || '');
  return (
    path === '/shop'
    || path.startsWith('/shop/')
    || path === '/template'
    || path.startsWith('/template/')
  );
};

/** @deprecated Use isOnlineStoreShopPrefix */
export const isTemplateStorePrefix = isOnlineStoreShopPrefix;

/**
 * Base path for a single store home.
 * Custom-domain owned hosts use `/` (no Sabito `/stores/:slug` or shared `/shop/:slug`).
 * @param {string} storeSlug
 * @param {{ pathname?: string, prefix?: 'stores' | 'shop' | 'template' | 'root', isCustomDomain?: boolean }} [opts]
 * @returns {string}
 */
export const buildStoreHomePath = (storeSlug, {
  pathname = '',
  prefix,
  isCustomDomain = false,
} = {}) => {
  if (isCustomDomain || prefix === 'root') return '/';
  const useShop = (
    prefix === 'shop'
    || prefix === 'template'
    || (prefix == null && isOnlineStoreShopPrefix(pathname))
  );
  const base = useShop ? 'shop' : 'stores';
  if (!storeSlug) return `/${base}`;
  return `/${base}/${encodeURIComponent(storeSlug)}`;
};

/**
 * Online Store home from mode context (custom domain → `/`, else `/shop|/stores/:slug`).
 * @param {{
 *   storeSlug?: string|null,
 *   pathPrefix?: 'shop'|'stores'|null,
 *   isCustomDomain?: boolean,
 *   pathname?: string,
 * }} [opts]
 * @returns {string}
 */
export const resolveSingleStoreHomePath = ({
  storeSlug = null,
  pathPrefix = null,
  isCustomDomain = false,
  pathname = '',
} = {}) => {
  if (isCustomDomain) return '/';
  if (!storeSlug) return '/';
  return buildStoreHomePath(storeSlug, {
    pathname,
    ...(pathPrefix ? { prefix: pathPrefix } : {}),
  });
};

/**
 * In-store product catalog path with optional search/category filters.
 * @param {string} storeSlug
 * @param {{ search?: string, category?: string, pathname?: string, prefix?: 'stores' | 'shop' | 'template' | 'root', isCustomDomain?: boolean, isServiceStore?: boolean }} [opts]
 * @returns {string}
 */
export const buildStoreCatalogPath = (storeSlug, {
  search = '',
  category = '',
  pathname = '',
  prefix,
  isCustomDomain = false,
  isServiceStore = false,
} = {}) => {
  const home = buildStoreHomePath(storeSlug, { pathname, prefix, isCustomDomain });
  const segment = isServiceStore ? 'services' : 'products';
  const params = new URLSearchParams();
  const trimmedSearch = String(search || '').trim();
  if (trimmedSearch) params.set('search', trimmedSearch);
  if (category && category !== 'all') params.set('category', category);
  const query = params.toString();
  // Custom domain home is `/` — avoid `//products`
  const base = home === '/' ? `/${segment}` : `${home}/${segment}`;
  return query ? `${base}?${query}` : base;
};

/**
 * Product detail path within the current Online Store / marketplace store prefix.
 * @param {string} storeSlug
 * @param {string} productSlug
 * @param {{ pathname?: string, prefix?: 'stores' | 'shop' | 'template' | 'root', isCustomDomain?: boolean }} [opts]
 * @returns {string}
 */
export const buildStoreProductPath = (storeSlug, productSlug, {
  pathname = '',
  prefix,
  isCustomDomain = false,
} = {}) => {
  const home = buildStoreHomePath(storeSlug, { pathname, prefix, isCustomDomain });
  if (!productSlug) return home;
  if (home === '/') return `/products/${encodeURIComponent(productSlug)}`;
  return `${home}/products/${encodeURIComponent(productSlug)}`;
};

/**
 * Filter listings by search + category query params (client-side for single-store catalog).
 * @param {object[]} items
 * @param {{ search?: string, category?: string }} filters
 * @returns {object[]} With a search, best match first.
 */
export const filterStoreListings = (items, { search = '', category = '' } = {}) => {
  const list = Array.isArray(items) ? items : [];
  const cat = String(category || '').trim().toLowerCase();
  const inCategory = cat && cat !== 'all'
    ? list.filter((item) => (
      String(item?.category?.name || item?.categoryName || item?.category || '').trim().toLowerCase() === cat
    ))
    : list;
  return searchStoreListings(inCategory, search);
};
