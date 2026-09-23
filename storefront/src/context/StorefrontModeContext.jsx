import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * @typedef {'marketplace' | 'online-store' | 'templates'} StorefrontMode
 *
 * - marketplace: Sabito multi-store discovery
 * - online-store: single-merchant Online Store (custom domain, /shop/:slug, live shop chrome)
 * - templates: gallery / preview host (no live marketplace chrome)
 */

/** sessionStorage key — keeps Online Store chrome on /cart, /checkout, /account, etc. */
export const ONLINE_STORE_SESSION_KEY = 'sabito_online_store_session';

const StorefrontModeContext = createContext({
  mode: /** @type {StorefrontMode} */ ('marketplace'),
  isSingleStoreMode: false,
  isTemplatesMode: false,
  isMarketplaceMode: true,
  isCustomDomain: false,
  isAbsOnlineStoreHost: false,
  storeSlug: null,
  /** @type {'shop' | 'stores' | null} */
  pathPrefix: null,
});

/**
 * True when the path is the ABS Online Store live shop URL (not the gallery).
 * `/shop/:slug` — single merchant. Legacy `/template/:slug` also counts.
 * `/templates` — gallery (separate).
 * @param {string} pathname
 */
export const isOnlineStoreShopPath = (pathname = '') => {
  const path = String(pathname || '');
  return (
    path === '/shop'
    || path.startsWith('/shop/')
    || path === '/template'
    || path.startsWith('/template/')
  );
};

/** @deprecated Use isOnlineStoreShopPath */
export const isOnlineStoreTemplatePath = isOnlineStoreShopPath;

/**
 * True when the path is the visual template gallery / preview surface.
 * @param {string} pathname
 */
export const isTemplatesGalleryPath = (pathname = '') => {
  const path = String(pathname || '');
  return path === '/templates' || path.startsWith('/templates/');
};

/**
 * Shared-host commerce / account routes that leave `/shop/:slug` but must keep Online Store chrome.
 * @param {string} pathname
 */
export const isStorefrontCommercePath = (pathname = '') => {
  const path = String(pathname || '');
  return (
    path === '/cart'
    || path.startsWith('/cart/')
    || path === '/checkout'
    || path.startsWith('/checkout/')
    || path === '/account'
    || path.startsWith('/account/')
    || path === '/track-order'
    || path.startsWith('/track-order/')
    || path === '/login'
    || path === '/signup'
    || path === '/verify-email'
    || path === '/forgot-password'
    || path === '/reset-password'
  );
};

/**
 * Marketplace discovery (or marketplace store pages) — clears Online Store session.
 * On the ABS Online Store host (`store.absghana.com`), bare `/shop` is not a Sabito
 * products alias, so it does not clear the Online Store session.
 * @param {string} pathname
 * @param {{ isAbsOnlineStoreHost?: boolean }} [opts]
 */
export const isMarketplaceDiscoveryPath = (pathname = '', opts = {}) => {
  const path = String(pathname || '');
  // ABS Online Store host never runs Sabito marketplace discovery routes.
  if (opts.isAbsOnlineStoreHost) return false;
  if (path === '/' || path === '/marketplace') return true;
  if (path === '/stores' || path.startsWith('/stores/')) return true;
  if (path === '/products' || path.startsWith('/products/')) return true;
  if (path === '/services' || path.startsWith('/services/')) return true;
  if (path === '/studios' || path.startsWith('/studios/')) return true;
  if (path === '/deals' || path === '/new-arrivals' || path === '/foods') return true;
  if (path === '/about-contact' || path === '/about' || path === '/contact') return true;
  // Bare /shop is a marketplace products alias on Sabito
  if (path === '/shop') return true;
  return false;
};

/**
 * @param {unknown} value
 * @returns {string|undefined}
 */
const optionalTrimmedString = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || undefined;
};

/**
 * @param {unknown} value
 * @returns {string|undefined}
 */
const optionalHexColor = (value) => {
  const trimmed = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/i) || [];
    if (r && g && b) return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return undefined;
};

/**
 * @typedef {{
 *   slug: string,
 *   pathPrefix: 'shop' | 'stores',
 *   displayName?: string,
 *   templateId?: string,
 *   primaryColor?: string,
 *   secondaryColor?: string,
 *   tertiaryColor?: string,
 * }} OnlineStoreSession
 */

/**
 * @returns {OnlineStoreSession | null}
 */
export const readOnlineStoreSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ONLINE_STORE_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const slug = parsed?.slug ? String(parsed.slug).trim() : '';
    if (!slug) return null;
    /** @type {OnlineStoreSession} */
    const session = {
      slug,
      pathPrefix: parsed?.pathPrefix === 'stores' ? 'stores' : 'shop',
    };
    const displayName = optionalTrimmedString(parsed?.displayName);
    const templateId = optionalTrimmedString(parsed?.templateId);
    const primaryColor = optionalHexColor(parsed?.primaryColor);
    const secondaryColor = optionalHexColor(parsed?.secondaryColor);
    const tertiaryColor = optionalHexColor(parsed?.tertiaryColor);
    if (displayName) session.displayName = displayName;
    if (templateId) session.templateId = templateId;
    if (primaryColor) session.primaryColor = primaryColor;
    if (secondaryColor) session.secondaryColor = secondaryColor;
    if (tertiaryColor) session.tertiaryColor = tertiaryColor;
    return session;
  } catch {
    return null;
  }
};

/**
 * Persist Online Store session. Branding fields merge with the existing same-slug
 * session so slug-only writes (path navigation) do not wipe cached accent colors.
 *
 * @param {{
 *   slug: string,
 *   pathPrefix?: 'shop' | 'stores',
 *   displayName?: string|null,
 *   templateId?: string|null,
 *   primaryColor?: string|null,
 *   secondaryColor?: string|null,
 *   tertiaryColor?: string|null,
 * } | null} session
 */
export const writeOnlineStoreSession = (session) => {
  if (typeof window === 'undefined') return;
  if (!session?.slug) {
    window.sessionStorage.removeItem(ONLINE_STORE_SESSION_KEY);
    return;
  }
  const slug = String(session.slug).trim();
  if (!slug) {
    window.sessionStorage.removeItem(ONLINE_STORE_SESSION_KEY);
    return;
  }

  const existing = readOnlineStoreSession();
  const sameSlug = existing?.slug === slug;
  const pathPrefix = session.pathPrefix === 'stores'
    || (session.pathPrefix == null && sameSlug && existing?.pathPrefix === 'stores')
    ? 'stores'
    : 'shop';

  /**
   * @template T
   * @param {T|null|undefined} next
   * @param {T|undefined} prev
   * @param {(value: unknown) => T|undefined} normalize
   */
  const pick = (next, prev, normalize) => {
    if (next != null && next !== '') {
      const normalized = normalize(next);
      if (normalized != null) return normalized;
    }
    return sameSlug ? prev : undefined;
  };

  /** @type {OnlineStoreSession} */
  const nextSession = { slug, pathPrefix };
  const displayName = pick(session.displayName, existing?.displayName, optionalTrimmedString);
  const templateId = pick(session.templateId, existing?.templateId, optionalTrimmedString);
  const primaryColor = pick(session.primaryColor, existing?.primaryColor, optionalHexColor);
  const secondaryColor = pick(session.secondaryColor, existing?.secondaryColor, optionalHexColor);
  const tertiaryColor = pick(session.tertiaryColor, existing?.tertiaryColor, optionalHexColor);
  if (displayName) nextSession.displayName = displayName;
  if (templateId) nextSession.templateId = templateId;
  if (primaryColor) nextSession.primaryColor = primaryColor;
  if (secondaryColor) nextSession.secondaryColor = secondaryColor;
  if (tertiaryColor) nextSession.tertiaryColor = tertiaryColor;

  window.sessionStorage.setItem(ONLINE_STORE_SESSION_KEY, JSON.stringify(nextSession));
};

/**
 * Cache merchant brand from a loaded public store payload (online-store mode only).
 * @param {object|null|undefined} store
 * @param {{ pathPrefix?: 'shop'|'stores' }} [opts]
 */
/** Browser tab + mobile address bar follow the store, never Sabito branding. */
export const applyOnlineStoreDocumentBrand = ({ displayName, primaryColor } = {}) => {
  if (typeof document === 'undefined') return;
  const name = optionalTrimmedString(displayName);
  document.title = name || 'Online Store';
  const color = optionalHexColor(primaryColor);
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
};

export const persistOnlineStoreBrand = (store, opts = {}) => {
  const slug = optionalTrimmedString(store?.slug);
  if (!slug) return;
  applyOnlineStoreDocumentBrand(store);
  writeOnlineStoreSession({
    slug,
    pathPrefix: opts.pathPrefix === 'stores' ? 'stores' : 'shop',
    displayName: store?.displayName,
    templateId: store?.templateId,
    primaryColor: store?.primaryColor,
    secondaryColor: store?.secondaryColor,
    tertiaryColor: store?.tertiaryColor,
  });
};

/**
 * Resolve storefront product surface from host flags + current path.
 * @param {{
 *   isTemplatesHost?: boolean,
 *   isCustomDomain?: boolean,
 *   isAbsOnlineStoreHost?: boolean,
 *   customDomainSlug?: string|null,
 *   pathname?: string,
 *   onlineStoreSession?: {slug: string, pathPrefix?: 'shop'|'stores'}|null,
 * }} opts
 * @returns {{ mode: StorefrontMode, storeSlug: string|null, pathPrefix: 'shop'|'stores'|null }}
 */
export const resolveStorefrontMode = ({
  isTemplatesHost = false,
  isCustomDomain = false,
  isAbsOnlineStoreHost = false,
  customDomainSlug = null,
  pathname = '',
  onlineStoreSession = null,
} = {}) => {
  const path = String(pathname || '');

  if (isTemplatesHost || isTemplatesGalleryPath(path)) {
    return { mode: 'templates', storeSlug: null, pathPrefix: null };
  }

  // Owned custom domain: root paths (`/`, `/products`, …) — never Sabito `/stores/:slug`.
  if (isCustomDomain && customDomainSlug) {
    return { mode: 'online-store', storeSlug: customDomainSlug, pathPrefix: null };
  }

  if (isOnlineStoreShopPath(path)) {
    const parts = path.split('/').filter(Boolean);
    // /shop|:template/:storeSlug/...
    const slug = (parts[0] === 'shop' || parts[0] === 'template') ? (parts[1] || null) : null;
    return { mode: 'online-store', storeSlug: slug, pathPrefix: 'shop' };
  }

  // /cart, /checkout, /account, … after browsing /shop/:slug
  if (isStorefrontCommercePath(path)) {
    const session = onlineStoreSession || readOnlineStoreSession();
    if (session?.slug) {
      return {
        mode: 'online-store',
        storeSlug: session.slug,
        pathPrefix: session.pathPrefix === 'stores' ? 'stores' : 'shop',
      };
    }
    // On ABS Online Store host, prefer Online Store chrome over Sabito marketplace
    // when a shopper hits commerce routes without a session yet.
    if (isAbsOnlineStoreHost) {
      return { mode: 'online-store', storeSlug: null, pathPrefix: 'shop' };
    }
  }

  // Shared ABS Online Store host (`store.absghana.com`): never Sabito marketplace mode.
  if (isAbsOnlineStoreHost) {
    const session = onlineStoreSession || readOnlineStoreSession();
    return {
      mode: 'online-store',
      storeSlug: session?.slug || null,
      pathPrefix: 'shop',
    };
  }

  return { mode: 'marketplace', storeSlug: null, pathPrefix: null };
};

/**
 * Provider for Sabito marketplace vs ABS Online Store vs templates gallery.
 * Must sit inside a Router so pathname is available.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   isTemplatesHost?: boolean,
 *   isCustomDomain?: boolean,
 *   isAbsOnlineStoreHost?: boolean,
 *   customDomainSlug?: string|null,
 *   forceMode?: StorefrontMode|null,
 * }} props
 */
export function StorefrontModeProvider({
  children,
  isTemplatesHost = false,
  isCustomDomain = false,
  isAbsOnlineStoreHost = false,
  customDomainSlug = null,
  forceMode = null,
}) {
  const location = useLocation();

  // Persist / clear Online Store session so commerce routes keep single-shop chrome.
  useEffect(() => {
    if (isTemplatesHost || isCustomDomain || forceMode === 'templates') return;

    const path = location.pathname;
    if (isOnlineStoreShopPath(path)) {
      const parts = path.split('/').filter(Boolean);
      const slug = (parts[0] === 'shop' || parts[0] === 'template') ? (parts[1] || null) : null;
      if (slug) writeOnlineStoreSession({ slug, pathPrefix: 'shop' });
      return;
    }

    if (isMarketplaceDiscoveryPath(path, { isAbsOnlineStoreHost })) {
      writeOnlineStoreSession(null);
    }
  }, [forceMode, isAbsOnlineStoreHost, isCustomDomain, isTemplatesHost, location.pathname]);

  const value = useMemo(() => {
    const resolved = forceMode
      ? {
        mode: forceMode,
        storeSlug: customDomainSlug || (forceMode === 'online-store' ? readOnlineStoreSession()?.slug : null),
        pathPrefix: forceMode === 'online-store'
          ? (isCustomDomain ? null : 'shop')
          : null,
      }
      : resolveStorefrontMode({
        isTemplatesHost,
        isCustomDomain,
        isAbsOnlineStoreHost,
        customDomainSlug,
        pathname: location.pathname,
      });

    const mode = resolved.mode;
    return {
      mode,
      storeSlug: resolved.storeSlug,
      pathPrefix: resolved.pathPrefix,
      isCustomDomain: Boolean(isCustomDomain),
      isAbsOnlineStoreHost: Boolean(isAbsOnlineStoreHost),
      isSingleStoreMode: mode === 'online-store',
      isTemplatesMode: mode === 'templates',
      isMarketplaceMode: mode === 'marketplace',
    };
  }, [
    customDomainSlug,
    forceMode,
    isAbsOnlineStoreHost,
    isCustomDomain,
    isTemplatesHost,
    location.pathname,
  ]);

  useEffect(() => {
    if (!value.isSingleStoreMode) return;
    const session = readOnlineStoreSession();
    applyOnlineStoreDocumentBrand(session?.slug === value.storeSlug ? session : {});
  }, [value.isSingleStoreMode, value.storeSlug]);

  return (
    <StorefrontModeContext.Provider value={value}>
      {children}
    </StorefrontModeContext.Provider>
  );
}

export const useStorefrontMode = () => useContext(StorefrontModeContext);

export default StorefrontModeContext;
