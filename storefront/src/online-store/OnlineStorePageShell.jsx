import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Store, User } from 'lucide-react';

import { useCart } from '../context/CartContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import {
  persistOnlineStoreBrand,
  readOnlineStoreSession,
  useStorefrontMode,
  writeOnlineStoreSession,
} from '../context/StorefrontModeContext';
import storeService from '../services/storeService';
import TemplateThemeProvider, { resolveStoreBrandColors } from '../templates/TemplateThemeProvider';
import { brandAccent } from './brandAccent';
import { resolveSingleStoreHomePath } from './storePaths';
import { Button } from '@/components/ui/button';

const unwrapData = (response) => response?.data?.data || response?.data || response;

/**
 * Synchronous brand seed for first paint (session → cart), before public store fetch.
 * @param {string|null} storeSlug
 * @param {object|null|undefined} cartStore
 */
const readCachedStoreBrand = (storeSlug, cartStore) => {
  const session = readOnlineStoreSession();
  const sessionMatches = Boolean(
    session?.slug && (!storeSlug || session.slug === storeSlug),
  );
  const cartMatches = Boolean(
    cartStore?.slug && (!storeSlug || cartStore.slug === storeSlug),
  );

  if (!sessionMatches && !cartMatches) return null;

  return {
    slug: (sessionMatches ? session.slug : null) || cartStore?.slug || storeSlug,
    displayName: (sessionMatches ? session.displayName : null)
      || cartStore?.displayName
      || undefined,
    templateId: (sessionMatches ? session.templateId : null)
      || cartStore?.templateId
      || undefined,
    primaryColor: (sessionMatches ? session.primaryColor : null)
      || cartStore?.primaryColor
      || undefined,
    secondaryColor: (sessionMatches ? session.secondaryColor : null)
      || cartStore?.secondaryColor
      || undefined,
    tertiaryColor: (sessionMatches ? session.tertiaryColor : null)
      || cartStore?.tertiaryColor
      || undefined,
  };
};

/**
 * Minimal chrome for cart / checkout / account on Online Store surfaces.
 * Loads merchant branding once and wraps the whole shell in TemplateThemeProvider
 * so --store-accent / --primary drive every CTA under this chrome.
 *
 * Seeds --store-accent from session/cart cache on first paint to avoid classic-green FOUC,
 * then refreshes from GET /public/store/:slug.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   title?: string,
 *   description?: string,
 * }} props
 */
export default function OnlineStorePageShell({ children, title, description }) {
  const navigate = useNavigate();
  const { cartSummary } = useCart();
  const { isAuthenticated } = useStorefrontAuth();
  const {
    isSingleStoreMode,
    storeSlug: modeSlug,
    pathPrefix,
    isCustomDomain,
  } = useStorefrontMode();

  const storeSlug = cartSummary?.store?.slug || modeSlug || readOnlineStoreSession()?.slug || null;
  const resolvedPathPrefix = pathPrefix === 'stores' ? 'stores' : 'shop';

  // Keep commerce routes in Online Store mode when cart knows the shop but session drifted.
  useEffect(() => {
    if (!isSingleStoreMode || !storeSlug) return;
    const session = readOnlineStoreSession();
    if (session?.slug === storeSlug) return;
    writeOnlineStoreSession({
      slug: storeSlug,
      pathPrefix: resolvedPathPrefix,
    });
  }, [isSingleStoreMode, resolvedPathPrefix, storeSlug]);

  const homePath = resolveSingleStoreHomePath({
    storeSlug,
    pathPrefix,
    isCustomDomain,
  });
  const cartCount = cartSummary?.itemCount ? String(cartSummary.itemCount) : null;

  const publicStoreQuery = useQuery({
    queryKey: ['public-store', storeSlug],
    queryFn: () => storeService.getPublicStore(storeSlug),
    enabled: Boolean(isSingleStoreMode && storeSlug),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const publicStore = useMemo(() => {
    const payload = unwrapData(publicStoreQuery.data);
    return payload?.store || payload || null;
  }, [publicStoreQuery.data]);

  const cachedBrand = useMemo(
    () => readCachedStoreBrand(storeSlug, cartSummary?.store),
    [cartSummary?.store, storeSlug],
  );

  // Prefer live API brand; fall back to session/cart so first paint is already correct.
  const brandSource = useMemo(
    () => publicStore || cachedBrand || {},
    [cachedBrand, publicStore],
  );
  const brandTemplateId = publicStore?.templateId || cachedBrand?.templateId;
  const knownPrimary = Boolean(
    publicStore?.primaryColor || cachedBrand?.primaryColor || cartSummary?.store?.primaryColor,
  );
  const brandColors = useMemo(() => {
    // No cached/fetched primary yet: use neutral slate so classic #166534 does not flash.
    if (!knownPrimary && !publicStore) {
      return { primary: '#64748b', secondary: '#94a3b8' };
    }
    return resolveStoreBrandColors(brandTemplateId, brandSource);
  }, [brandSource, brandTemplateId, knownPrimary, publicStore]);

  useEffect(() => {
    if (!isSingleStoreMode || !publicStore?.slug) return;
    persistOnlineStoreBrand(publicStore, { pathPrefix: resolvedPathPrefix });
  }, [isSingleStoreMode, publicStore, resolvedPathPrefix]);

  const storeName = publicStore?.displayName
    || cachedBrand?.displayName
    || cartSummary?.store?.displayName
    || 'Shop';

  /** Full /login under this shell (store footer) — not the Sabito auth modal. */
  const handleSignIn = () => {
    const returnTo = `${window.location.pathname}${window.location.search || ''}`;
    const params = new URLSearchParams();
    if (returnTo && returnTo !== '/') params.set('returnTo', returnTo);
    const query = params.toString();
    navigate(query ? `/login?${query}` : '/login');
  };

  const content = (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link to={homePath} className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 ${brandAccent.softIcon}`}
            >
              <Store className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{storeName}</span>
            </span>
          </Link>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className={brandAccent.outlineBtn}
              asChild
            >
              <Link to="/cart">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Cart{cartCount ? ` (${cartCount})` : ''}
              </Link>
            </Button>
            {isAuthenticated ? (
              <Button className={brandAccent.primaryBtn} asChild>
                <Link to="/account">
                  <User className="mr-2 h-4 w-4" />
                  Account
                </Link>
              </Button>
            ) : (
              <Button type="button" className={brandAccent.primaryBtn} onClick={handleSignIn}>
                <User className="mr-2 h-4 w-4" />
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="sf-page-enter mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-4 sm:py-8">
        {(title || description) ? (
          <div className="mb-6">
            {title ? <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1> : null}
            {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
          </div>
        ) : null}
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-3 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p>&copy; {new Date().getFullYear()} {storeName}</p>
          <Link to={homePath} className={brandAccent.link}>
            Back to shop
          </Link>
        </div>
      </footer>
    </div>
  );

  if (!isSingleStoreMode) {
    return content;
  }

  return (
    <TemplateThemeProvider
      templateId={brandTemplateId}
      primaryColor={brandColors.primary}
      secondaryColor={brandColors.secondary}
      tertiaryColor={brandColors.tertiary}
    >
      {content}
    </TemplateThemeProvider>
  );
}
