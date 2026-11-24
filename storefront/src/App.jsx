import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import ConnectionHealthBanner from './components/storefront/ConnectionHealthBanner';
import GoogleSignInHost from './components/storefront/GoogleSignInHost';
import RouteFallback from './components/storefront/RouteFallback';
import ShopperAuthModal from './components/storefront/ShopperAuthModal';
import { StorefrontModeProvider } from './context/StorefrontModeContext';
import { useStorefrontBackgroundPrefetch } from './hooks/useStorefrontBackgroundPrefetch';
import { useCustomDomainStore } from './hooks/useCustomDomainStore';
import {
  AbsOnlineStoreHostApp,
  CheckoutRoute,
  CustomDomainStoreApp,
  OnlineStoreChrome,
  RequireShopperAuth,
  singleStoreCommerceRouteElements,
  storePageRouteElements,
  TemplatesHostApp,
  templatesGalleryRouteElements,
} from './online-store/SingleStoreApp';
import CustomDomainPendingPage from './pages/CustomDomainPendingPage';

const MarketplaceHome = lazy(() => import('./pages/MarketplaceHome'));
const MarketplaceProductsPage = lazy(() => import('./pages/MarketplaceProductsPage'));
const MarketplaceStoresPage = lazy(() => import('./pages/MarketplaceStoresPage'));
const MarketplaceStudiosPage = lazy(() => import('./pages/MarketplaceStudiosPage'));
const MarketplaceServicesPage = lazy(() => import('./pages/MarketplaceServicesPage'));
const PublicStudioHome = lazy(() => import('./pages/PublicStudioHome'));
const PublicStudioService = lazy(() => import('./pages/PublicStudioService'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

const NavigateToStore = () => {
  const storeSlug = window.location.pathname.split('/')[2] || '';
  return <Navigate to={`/stores/${encodeURIComponent(storeSlug)}`} replace />;
};

const NavigateToProduct = () => {
  const [, , storeSlug, , productSlug] = window.location.pathname.split('/');
  return (
    <Navigate
      to={`/stores/${encodeURIComponent(storeSlug || '')}/products/${encodeURIComponent(productSlug || '')}`}
      replace
    />
  );
};

/** Legacy `/template/:slug` → `/shop/:slug` (bookmarks / old emails). */
const NavigateTemplateToShop = () => {
  const rest = window.location.pathname.replace(/^\/template(?=\/|$)/, '/shop');
  return <Navigate to={`${rest}${window.location.search}${window.location.hash}`} replace />;
};

/**
 * Sabito marketplace shared host (`sabitostore.com`) + path-based Online Store `/shop/:slug`.
 * ABS Online Store host (`store.absghana.com`) uses AbsOnlineStoreHostApp instead.
 */
function MarketplaceHostApp() {
  useStorefrontBackgroundPrefetch();

  return (
    <GoogleSignInHost>
      <ConnectionHealthBanner />
      <OnlineStoreChrome>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MarketplaceHome />} />
            <Route path="/stores" element={<MarketplaceStoresPage />} />
            <Route path="/studios" element={<MarketplaceStudiosPage />} />
            <Route path="/services" element={<MarketplaceServicesPage />} />
            <Route path="/foods" element={<MarketplaceProductsPage mode="foods" />} />
            <Route path="/studios/:studioSlug" element={<PublicStudioHome />} />
            <Route path="/studios/:studioSlug/services/:serviceSlug" element={<PublicStudioService />} />
            {storePageRouteElements('stores')}
            <Route path="/products" element={<MarketplaceProductsPage mode="products" />} />
            {/* Bare /shop: Sabito products alias */}
            <Route path="/shop" element={<Navigate to="/products" replace />} />
            {storePageRouteElements('shop')}
            <Route path="/deals" element={<MarketplaceProductsPage mode="deals" />} />
            <Route path="/new-arrivals" element={<MarketplaceProductsPage mode="arrivals" />} />
            <Route path="/about-contact" element={<AboutPage />} />
            <Route path="/about" element={<Navigate to="/about-contact" replace />} />
            <Route path="/contact" element={<Navigate to="/about-contact" replace />} />
            {singleStoreCommerceRouteElements}
            <Route path="/marketplace" element={<Navigate to="/" replace />} />
            <Route path="/store" element={<Navigate to="/" replace />} />
            <Route path="/store/:storeSlug" element={<NavigateToStore />} />
            <Route path="/store/:storeSlug/products/:productSlug" element={<NavigateToProduct />} />
            <Route path="/template" element={<Navigate to="/" replace />} />
            <Route path="/template/*" element={<NavigateTemplateToShop />} />
            {templatesGalleryRouteElements}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </OnlineStoreChrome>
      <ShopperAuthModal />
    </GoogleSignInHost>
  );
}

function App() {
  const customDomain = useCustomDomainStore();

  if (customDomain.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
      </div>
    );
  }

  if (customDomain.isTemplatesHost) {
    return (
      <BrowserRouter future={ROUTER_FUTURE}>
        <StorefrontModeProvider isTemplatesHost forceMode="templates">
          <TemplatesHostApp />
        </StorefrontModeProvider>
      </BrowserRouter>
    );
  }

  if (customDomain.matched) {
    return (
      <BrowserRouter future={ROUTER_FUTURE}>
        <StorefrontModeProvider
          isCustomDomain
          customDomainSlug={customDomain.slug}
          forceMode="online-store"
        >
          <CustomDomainStoreApp
            slug={customDomain.slug}
            launched={customDomain.launched}
            displayName={customDomain.displayName}
          />
        </StorefrontModeProvider>
      </BrowserRouter>
    );
  }

  // Unknown host that is not a platform domain, but resolve-domain failed (CORS/network).
  // Do not fall through to Sabito marketplace — that was the www.gapconnects.com bug.
  if (customDomain.resolveFailed) {
    return <CustomDomainPendingPage variant="unavailable" />;
  }

  // API answered matched:false — domain is not connected (or tenant inactive).
  // Still not Sabito marketplace chrome on a merchant-looking host.
  if (customDomain.unmatched) {
    return <CustomDomainPendingPage variant="unmatched" />;
  }

  if (customDomain.isAbsOnlineStoreHost) {
    return (
      <BrowserRouter future={ROUTER_FUTURE}>
        <StorefrontModeProvider isAbsOnlineStoreHost>
          <AbsOnlineStoreHostApp />
        </StorefrontModeProvider>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter future={ROUTER_FUTURE}>
      <StorefrontModeProvider>
        <MarketplaceHostApp />
      </StorefrontModeProvider>
    </BrowserRouter>
  );
}

export { CheckoutRoute, RequireShopperAuth };
export default App;
