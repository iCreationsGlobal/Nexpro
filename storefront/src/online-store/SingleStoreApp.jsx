import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

import ComingSoonPage from '../pages/ComingSoonPage';
import CustomDomainPendingPage from '../pages/CustomDomainPendingPage';
import ConnectionHealthBanner from '../components/storefront/ConnectionHealthBanner';
import GoogleSignInHost from '../components/storefront/GoogleSignInHost';
import RouteFallback from '../components/storefront/RouteFallback';
import ShopperAuthModal from '../components/storefront/ShopperAuthModal';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';

const CartPage = lazy(() => import('../pages/CartPage'));
const CheckoutPage = lazy(() => import('../pages/CheckoutPage'));
const CheckoutPaystackCallbackPage = lazy(() => import('../pages/CheckoutPaystackCallbackPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
const OrderSuccessPage = lazy(() => import('../pages/OrderSuccessPage'));
const PublicStoreHome = lazy(() => import('../pages/PublicStoreHome'));
const PublicStoreProduct = lazy(() => import('../pages/PublicStoreProduct'));
const PublicStudioService = lazy(() => import('../pages/PublicStudioService'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'));
const ShopperAccountDashboard = lazy(() => import('../pages/ShopperAccountDashboard'));
const ShopperAddressesPage = lazy(() => import('../pages/ShopperAddressesPage'));
const ShopperOrderDetailPage = lazy(() => import('../pages/ShopperOrderDetailPage'));
const ShopperOrdersPage = lazy(() => import('../pages/ShopperOrdersPage'));
const ShopperProfilePage = lazy(() => import('../pages/ShopperProfilePage'));
const ShopperWishlistPage = lazy(() => import('../pages/ShopperWishlistPage'));
const StorefrontAuthPage = lazy(() => import('../pages/StorefrontAuthPage'));
const TemplatesGallery = lazy(() => import('../pages/TemplatesGallery'));
const TemplatePreview = lazy(() => import('../pages/TemplatePreview'));
const TrackOrderPage = lazy(() => import('../pages/TrackOrderPage'));

const withRouteSuspense = (element) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

export const CheckoutRoute = () => {
  const location = useLocation();
  const { isAuthenticated, isLoading, openShopperAuthModal } = useStorefrontAuth();
  const { isSingleStoreMode } = useStorefrontMode();
  const returnTo = `${location.pathname}${location.search || ''}`;

  useEffect(() => {
    // Online Store allows guest checkout; only the Sabito marketplace requires an account.
    if (isLoading || isAuthenticated || isSingleStoreMode) return;
    openShopperAuthModal({
      mode: 'signup',
      intent: {
        action: 'checkout',
        returnTo,
      },
    });
  }, [isAuthenticated, isLoading, isSingleStoreMode, openShopperAuthModal, returnTo]);

  if (isLoading) {
    return <ComingSoonPage type="auth-loading" />;
  }

  if (!isAuthenticated && !isSingleStoreMode) {
    return <ComingSoonPage type="checkout-auth-required" />;
  }

  return withRouteSuspense(<CheckoutPage />);
};

export const RequireShopperAuth = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useStorefrontAuth();

  if (isLoading) {
    return <ComingSoonPage type="auth-loading" />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace state={{ returnTo }} />;
  }

  return children;
};

/** Shopper + commerce routes shared by Online Store surfaces (no marketplace discovery). */
export const singleStoreCommerceRouteElements = [
  <Route key="track-order" path="/track-order" element={withRouteSuspense(<TrackOrderPage />)} />,
  <Route key="cart" path="/cart" element={withRouteSuspense(<CartPage />)} />,
  <Route key="checkout" path="/checkout" element={<CheckoutRoute />} />,
  <Route key="checkout-paystack" path="/checkout/paystack-callback" element={withRouteSuspense(<CheckoutPaystackCallbackPage />)} />,
  <Route key="checkout-success" path="/checkout/success/:id" element={withRouteSuspense(<OrderSuccessPage />)} />,
  <Route key="login" path="/login" element={withRouteSuspense(<StorefrontAuthPage />)} />,
  <Route key="signup" path="/signup" element={withRouteSuspense(<StorefrontAuthPage />)} />,
  <Route key="verify-email" path="/verify-email" element={withRouteSuspense(<StorefrontAuthPage />)} />,
  <Route key="forgot-password" path="/forgot-password" element={withRouteSuspense(<ForgotPasswordPage />)} />,
  <Route key="reset-password" path="/reset-password" element={withRouteSuspense(<ResetPasswordPage />)} />,
  <Route key="account" path="/account" element={<RequireShopperAuth>{withRouteSuspense(<ShopperAccountDashboard />)}</RequireShopperAuth>} />,
  <Route key="account-orders" path="/account/orders" element={<RequireShopperAuth>{withRouteSuspense(<ShopperOrdersPage />)}</RequireShopperAuth>} />,
  <Route key="account-order" path="/account/orders/:id" element={<RequireShopperAuth>{withRouteSuspense(<ShopperOrderDetailPage />)}</RequireShopperAuth>} />,
  <Route key="account-wishlist" path="/account/wishlist" element={<RequireShopperAuth>{withRouteSuspense(<ShopperWishlistPage />)}</RequireShopperAuth>} />,
  <Route key="account-addresses" path="/account/addresses" element={<RequireShopperAuth>{withRouteSuspense(<ShopperAddressesPage />)}</RequireShopperAuth>} />,
  <Route key="account-profile" path="/account/profile" element={<RequireShopperAuth>{withRouteSuspense(<ShopperProfilePage />)}</RequireShopperAuth>} />,
];

/** Live store page routes under a path prefix (`stores` marketplace or `shop` Online Store). */
export const storePageRouteElements = (prefix) => [
  <Route key={`${prefix}-home`} path={`/${prefix}/:storeSlug`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-products`} path={`/${prefix}/:storeSlug/products`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-services`} path={`/${prefix}/:storeSlug/services`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-categories`} path={`/${prefix}/:storeSlug/categories`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-about`} path={`/${prefix}/:storeSlug/about`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-reviews`} path={`/${prefix}/:storeSlug/reviews`} element={withRouteSuspense(<PublicStoreHome />)} />,
  <Route key={`${prefix}-product`} path={`/${prefix}/:storeSlug/products/:productSlug`} element={withRouteSuspense(<PublicStoreProduct />)} />,
  <Route key={`${prefix}-service`} path={`/${prefix}/:storeSlug/services/:serviceSlug`} element={withRouteSuspense(<PublicStudioService />)} />,
];

export const templatesGalleryRouteElements = [
  <Route key="templates" path="/templates" element={withRouteSuspense(<TemplatesGallery />)} />,
  <Route key="templates-preview" path="/templates/:templateId/preview" element={withRouteSuspense(<TemplatePreview />)} />,
  <Route key="templates-preview-tenant" path="/templates/:templateId/preview-tenant" element={withRouteSuspense(<TemplatePreview />)} />,
];

/**
 * Template gallery host only — never mounts marketplace discovery routes.
 */
export function TemplatesHostApp() {
  useEffect(() => {
    document.title = 'ABS Online Store — Templates';
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<TemplatesGallery />} />
        {templatesGalleryRouteElements}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

const OnlineStoreHostLanding = lazy(() => import('../pages/OnlineStoreHostLanding'));

/** Legacy `/template/:slug` → `/shop/:slug` (bookmarks / old emails). */
const NavigateTemplateToShop = () => {
  const rest = window.location.pathname.replace(/^\/template(?=\/|$)/, '/shop');
  return <Navigate to={`${rest}${window.location.search}${window.location.hash}`} replace />;
};

/**
 * Custom domain: strip Sabito `/stores/:slug` or shared `/shop/:slug` → root-relative paths.
 * e.g. `/stores/aseda-store/products/foo` → `/products/foo`
 */
const RedirectPrefixedStoreToRoot = () => {
  const location = useLocation();
  const rewritten = location.pathname.replace(/^\/(?:stores|shop)\/[^/]+/, '') || '/';
  return <Navigate to={`${rewritten}${location.search}${location.hash}`} replace />;
};

/**
 * Shared ABS Online Store host (`store.absghana.com`) — path-based `/shop/:slug` only.
 * Never mounts Sabito marketplace discovery (home, /stores directory, /products, …).
 */
export function AbsOnlineStoreHostApp() {
  useEffect(() => {
    document.title = 'ABS Online Store';
  }, []);

  return (
    <GoogleSignInHost>
      <ConnectionHealthBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<OnlineStoreHostLanding />} />
          <Route path="/shop" element={<OnlineStoreHostLanding />} />
          {storePageRouteElements('shop')}
          <Route path="/template" element={<Navigate to="/" replace />} />
          <Route path="/template/*" element={<NavigateTemplateToShop />} />
          {templatesGalleryRouteElements}
          {singleStoreCommerceRouteElements}
          {/* Marketplace discovery aliases — keep shoppers off Sabito chrome on this host */}
          <Route path="/marketplace" element={<Navigate to="/" replace />} />
          <Route path="/stores" element={<Navigate to="/" replace />} />
          <Route path="/stores/*" element={<Navigate to="/" replace />} />
          <Route path="/products" element={<Navigate to="/" replace />} />
          <Route path="/products/*" element={<Navigate to="/" replace />} />
          <Route path="/services" element={<Navigate to="/" replace />} />
          <Route path="/services/*" element={<Navigate to="/" replace />} />
          <Route path="/studios" element={<Navigate to="/" replace />} />
          <Route path="/studios/*" element={<Navigate to="/" replace />} />
          <Route path="/deals" element={<Navigate to="/" replace />} />
          <Route path="/new-arrivals" element={<Navigate to="/" replace />} />
          <Route path="/foods" element={<Navigate to="/" replace />} />
          <Route path="/about-contact" element={<Navigate to="/" replace />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="/contact" element={<Navigate to="/" replace />} />
          <Route path="/store" element={<Navigate to="/" replace />} />
          <Route path="/store/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ShopperAuthModal />
    </GoogleSignInHost>
  );
}

/**
 * Custom-domain Online Store: one merchant at owned-host root paths (`/`, `/products`, …).
 * Never exposes Sabito marketplace `/stores/:slug` URLs. Slug comes from mode context.
 * @param {{ slug: string, launched: boolean, displayName?: string|null }} props
 */
export function CustomDomainStoreApp({ slug, launched, displayName }) {
  useEffect(() => {
    document.title = displayName ? `${displayName} — Online Store` : 'Online Store';
  }, [displayName]);

  if (!launched || !slug) {
    return <CustomDomainPendingPage displayName={displayName} />;
  }

  return (
    <GoogleSignInHost>
      <ConnectionHealthBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/products" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/services" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/categories" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/about" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/about-contact" element={<Navigate to="/about" replace />} />
          <Route path="/contact" element={<Navigate to="/about" replace />} />
          <Route path="/reviews" element={withRouteSuspense(<PublicStoreHome />)} />
          <Route path="/products/:productSlug" element={withRouteSuspense(<PublicStoreProduct />)} />
          <Route path="/services/:serviceSlug" element={withRouteSuspense(<PublicStudioService />)} />
          {/* Legacy bookmarks / shared-host links → clean owned-domain paths */}
          <Route path="/stores" element={<Navigate to="/" replace />} />
          <Route path="/stores/:storeSlug" element={<RedirectPrefixedStoreToRoot />} />
          <Route path="/stores/:storeSlug/*" element={<RedirectPrefixedStoreToRoot />} />
          <Route path="/shop" element={<Navigate to="/" replace />} />
          <Route path="/shop/:storeSlug" element={<RedirectPrefixedStoreToRoot />} />
          <Route path="/shop/:storeSlug/*" element={<RedirectPrefixedStoreToRoot />} />
          <Route path="/template" element={<Navigate to="/" replace />} />
          <Route path="/template/*" element={<Navigate to="/" replace />} />
          {singleStoreCommerceRouteElements}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ShopperAuthModal />
    </GoogleSignInHost>
  );
}
