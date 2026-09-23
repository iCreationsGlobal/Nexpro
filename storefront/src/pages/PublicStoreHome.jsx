import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Loader2,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Scissors,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  User,
  X,
} from 'lucide-react';

import storeService from '../services/storeService';
import { useCart } from '../context/CartContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { persistOnlineStoreBrand, useStorefrontMode } from '../context/StorefrontModeContext';
import { getCategoryImageUrl } from '../utils/categoryImages';
import { buildProductsSearchPath, buildServicesSearchPath } from '../utils/marketplaceSearch';
import {
  buildStoreCatalogPath,
  buildStoreProductPath,
  filterStoreListings,
  resolveSingleStoreHomePath,
} from '../online-store/storePaths';
import {
  ActionLink,
  getStoreServiceUrl,
  getDiscountPercent,
  ProductCard,
  ProductImage,
  ServiceCard,
  StoreScopedFooter,
  StoreLogo,
  unwrapData,
} from '../components/storefront/StorefrontLayout';
import {
  ReviewList,
  ReviewSummaryLine,
  VerifiedReviewForm,
} from '../components/storefront/VerifiedReviewSection';
import { resolveStoreBannerImageUrl } from '../utils/fileUtils';
import {
  buildStoreWhatsAppHref,
  normalizePhone,
  whatsappContactMessage,
} from '../utils/whatsapp';
import StoreHeroCarousel from '../components/storefront/StoreHeroCarousel';
import StoreTestimonialsSection from '../components/storefront/StoreTestimonialsSection';
import { formatAmount, formatInteger } from '../utils/formatNumber';
import { showError, showSuccess } from '../utils/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import TemplateThemeProvider, { getTemplateTheme, resolveStoreBrandColors } from '../templates/TemplateThemeProvider';
import { SAMPLE_PRODUCTS } from '../templates/sampleCatalog';

const STORE_SUBTITLE = {
  marketplace: 'Official Store',
  'online-store': '',
  templates: '',
};

const cleanContactValue = (value) => String(value || '').trim();

const buildContactHref = (store) => {
  const whatsappHref = buildStoreWhatsAppHref(store, whatsappContactMessage(store?.displayName));
  if (whatsappHref) return whatsappHref;
  const email = cleanContactValue(store?.contactEmail);
  if (email) return `mailto:${email}`;
  return '';
};

const buildPublicContactDetails = (store) => {
  const phone = cleanContactValue(store?.contactPhone);
  const whatsapp = cleanContactValue(store?.whatsappNumber);
  const email = cleanContactValue(store?.contactEmail);
  const phoneDigits = normalizePhone(phone);
  const whatsappDigits = normalizePhone(whatsapp);

  return {
    phone: phone ? { label: phone, href: phoneDigits ? `tel:${phoneDigits}` : '' } : null,
    whatsapp: whatsapp && whatsappDigits && whatsappDigits !== phoneDigits
      ? {
        label: whatsapp,
        href: buildStoreWhatsAppHref(
          { whatsappNumber: whatsapp },
          whatsappContactMessage(store?.displayName),
        ),
      }
      : null,
    email: email ? { label: email, href: `mailto:${email}` } : null,
  };
};

const getProductUrl = (storeSlug, product, pathname = '', isCustomDomain = false) => {
  const productSlug = product?.slug || product?.id;
  if (!storeSlug || !productSlug) return '/products';
  return buildStoreProductPath(storeSlug, productSlug, { pathname, isCustomDomain });
};

const uniqueById = (...lists) => {
  const seen = new Set();
  return lists.flat().filter((item) => {
    const key = item?.id || item?.slug;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveStorePage = (pathname = '') => {
  if (pathname.endsWith('/categories')) return 'categories';
  if (pathname.endsWith('/about')) return 'about';
  if (pathname.endsWith('/reviews')) return 'reviews';
  if (pathname.endsWith('/products')) return 'catalog';
  if (pathname.endsWith('/services')) return 'catalog';
  return 'home';
};

const StoreScopedHeader = ({
  store,
  onSearch,
  theme,
  accent,
  previewMode = false,
  subtitle = '',
  homeTo: homeToProp,
  navItems = null,
  activePage = 'home',
}) => {
  const [searchText, setSearchText] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { cartSummary } = useCart();
  const { isAuthenticated, openShopperAuthModal } = useStorefrontAuth();
  const cartCount = cartSummary.itemCount ? String(cartSummary.itemCount) : null;
  const showPageNav = Array.isArray(navItems) && navItems.length > 0;

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (previewMode) return;
    onSearch(searchText.trim());
  }, [onSearch, previewMode, searchText]);

  const handleSignIn = useCallback(() => {
    if (previewMode) return;
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'store',
        returnTo: `${window.location.pathname}${window.location.search || ''}`,
      },
    });
  }, [openShopperAuthModal, previewMode]);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((current) => !current);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const homeTo = previewMode
    ? '#'
    : (homeToProp || (store?.slug ? `/stores/${encodeURIComponent(store.slug)}` : '/'));

  const desktopNavLinkClass = (key) => (
    `whitespace-nowrap text-sm font-semibold transition-colors ${
      activePage === key
        ? ''
        : 'opacity-70 hover:opacity-100'
    }`
  );

  const mobileNavLinkClass = (key) => (
    `flex min-h-11 items-center rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${
      activePage === key
        ? 'border-transparent text-white'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    }`
  );

  return (
    <header className={`sticky top-0 z-50 ${theme.headerClass}`}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:contents">
          <Link to={homeTo} className="flex min-w-0 items-center gap-3" onClick={previewMode ? (e) => e.preventDefault() : undefined}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <StoreLogo store={store} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black sm:text-xl">{store.displayName}</span>
              {subtitle ? (
                <span className="block truncate text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
                  {subtitle}
                </span>
              ) : null}
            </span>
          </Link>
          {showPageNav ? (
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-slate-50 lg:hidden"
              aria-label={mobileMenuOpen ? 'Close store menu' : 'Open store menu'}
              aria-controls="store-scoped-mobile-menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-50/80 p-1">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={`Search ${store.displayName}`}
            readOnly={previewMode}
            className="h-11 min-h-11 border-0 bg-transparent px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 min-h-11 w-11 shrink-0 rounded-full hover:opacity-90"
            style={{ backgroundColor: accent }}
            aria-label={`Search ${store.displayName}`}
          >
            <Search className="h-5 w-5" />
          </Button>
        </form>

        {showPageNav ? (
          <nav className="hidden shrink-0 items-center gap-4 xl:gap-5 lg:flex" aria-label="Store pages">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={previewMode ? '#' : item.to}
                className={desktopNavLinkClass(item.key)}
                style={activePage === item.key ? { color: accent } : undefined}
                onClick={previewMode ? (e) => e.preventDefault() : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex shrink-0 gap-2">
          {previewMode ? (
            <Button type="button" variant="outline" className="rounded-full">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Cart
            </Button>
          ) : (
            <ActionLink to="/cart" icon={ShoppingCart} label="Cart" badge={cartCount} />
          )}
          {previewMode ? (
            <Button type="button" className="rounded-full hover:opacity-90" style={{ backgroundColor: accent }}>
              <User className="mr-2 h-4 w-4" />
              Sign in
            </Button>
          ) : isAuthenticated ? (
            <Button className="rounded-full hover:opacity-90" style={{ backgroundColor: accent }} asChild>
              <Link to="/account">
                <User className="mr-2 h-4 w-4" />
                Account
              </Link>
            </Button>
          ) : (
            <Button type="button" className="rounded-full hover:opacity-90" style={{ backgroundColor: accent }} onClick={handleSignIn}>
              <User className="mr-2 h-4 w-4" />
              Sign in
            </Button>
          )}
        </div>
      </div>

      {showPageNav && mobileMenuOpen ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white lg:hidden" id="store-scoped-mobile-menu">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-4 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                to={homeTo}
                className="flex min-w-0 items-center gap-3"
                onClick={(event) => {
                  if (previewMode) event.preventDefault();
                  closeMobileMenu();
                }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <StoreLogo store={store} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black">{store.displayName}</span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
                    Menu
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-slate-50"
                aria-label="Close store menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <nav className="grid gap-2 px-3 py-4 sm:px-4" aria-label="Store pages">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={previewMode ? '#' : item.to}
                className={mobileNavLinkClass(item.key)}
                style={activePage === item.key ? { backgroundColor: accent, borderColor: accent } : undefined}
                onClick={(event) => {
                  if (previewMode) event.preventDefault();
                  closeMobileMenu();
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
};

const ProductSection = ({ storeName, title, description, products, emptyText, sectionId = 'products', theme, accent }) => (
  <section id={sectionId} className="space-y-5">
    <div className="sf-reveal flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {storeName ? (
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>{storeName}</p>
        ) : null}
        <h2 className={`${storeName ? 'mt-1' : ''} font-semibold ${theme?.dense ? 'text-xl' : 'text-2xl'}`}>{title}</h2>
        {description ? <p className="mt-1 text-sm opacity-70">{description}</p> : null}
      </div>
    </div>
    {products.length ? (
      <div className={`sf-stagger ${theme?.gridClass || 'grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]'}`}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-border bg-background p-8 text-center text-muted-foreground">
        {emptyText}
      </div>
    )}
  </section>
);

const ServiceSection = ({
  storeName,
  storeSlug,
  title,
  description,
  services,
  emptyText,
  sectionId = 'services',
  serviceBasePathname = '',
  isCustomDomain = false,
  accent,
}) => (
  <section id={sectionId} className="space-y-5">
    <div className="sf-reveal flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {storeName ? (
          <p
            className={`text-sm font-semibold uppercase tracking-wide ${accent ? '' : 'text-green-800'}`}
            style={accent ? { color: accent } : undefined}
          >
            {storeName}
          </p>
        ) : null}
        <h2 className={`${storeName ? 'mt-1' : ''} text-2xl font-semibold`}>{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
    {services.length ? (
      <div className="sf-stagger grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            serviceUrl={getStoreServiceUrl(storeSlug, service, {
              pathname: serviceBasePathname,
              isCustomDomain,
            })}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-border bg-background p-8 text-center text-muted-foreground">
        {emptyText}
      </div>
    )}
  </section>
);

// Brand-colored promo banner, darkened slightly so white text stays readable on light brands.
const promoBannerStyle = {
  backgroundColor: 'color-mix(in srgb, var(--store-accent, #166534) 85%, black)',
  borderColor: 'color-mix(in srgb, var(--store-accent, #166534) 40%, white)',
};

/**
 * Featured promo: shows the promoted product's photo and name.
 * Falls back to the promo text only when no product is attached.
 */
const PromoBanner = ({ promo, storeSlug, pathname, isCustomDomain, ctaLabel = 'Shop offer' }) => {
  const product = promo.product || null;
  const productUrl = product ? getProductUrl(storeSlug, product, pathname, isCustomDomain) : null;
  const discount = getDiscountPercent(product);
  const description = product
    ? ''
    : (promo.description || 'Explore current featured products from this store.');

  return (
    <section className="sf-reveal overflow-hidden rounded-2xl border p-4 text-white sm:rounded-3xl sm:p-6 md:p-8" style={promoBannerStyle}>
      <div className={`grid items-center gap-5 md:gap-8 ${product ? 'sm:grid-cols-[160px_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto]'}`}>
        {product ? (
          <Link
            to={productUrl}
            className="group relative block aspect-square overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/20 ring-1 ring-white/30"
            aria-label={product.title}
          >
            <ProductImage product={product} loading="eager" />
            {discount > 0 ? (
              <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold text-white">-{discount}%</span>
            ) : null}
          </Link>
        ) : null}

        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">Featured Promo</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{promo.title || 'Featured offer'}</h2>
          {product ? (
            <Link to={productUrl} className="mt-3 block text-xl font-bold text-white hover:underline sm:text-2xl">
              {product.title}
            </Link>
          ) : null}
          {description ? (
            <p className="mt-2 line-clamp-3 max-w-2xl text-white/80">{description}</p>
          ) : null}
        </div>

        {product ? (
          <Button
            className="w-full bg-white text-[color:var(--store-accent,#166534)] hover:bg-white/90 sm:col-span-2 md:col-span-1 md:w-auto"
            asChild
          >
            <Link to={productUrl}>{ctaLabel}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
};

const PublicStoreHome = ({
  previewStore = null,
  previewProducts = null,
  previewMode = false,
} = {}) => {
  const { storeSlug: routeSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, openShopperAuthModal } = useStorefrontAuth();
  const { mode, isSingleStoreMode, isMarketplaceMode, pathPrefix, isCustomDomain, storeSlug: modeSlug } = useStorefrontMode();
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const storeSlug = previewMode && previewStore?.slug
    ? previewStore.slug
    : (routeSlug || modeSlug);
  const storeSubtitle = STORE_SUBTITLE[mode] || '';
  const isOwnedShop = isSingleStoreMode || !isMarketplaceMode;
  const catalogSearch = searchParams.get('search') || '';
  const catalogCategory = searchParams.get('category') || '';
  const isPreviewRequest = searchParams.get('preview') === '1';

  const storeQuery = useQuery({
    queryKey: ['marketplace-store-home', storeSlug, isPreviewRequest ? 'preview' : 'live'],
    queryFn: () => storeService.getMarketplaceStoreHome(
      storeSlug,
      isPreviewRequest ? { preview: '1' } : {}
    ),
    enabled: Boolean(storeSlug) && !previewMode,
    retry: false,
  });

  const data = useMemo(() => {
    if (previewMode && previewStore) {
      const products = Array.isArray(previewProducts) && previewProducts.length
        ? previewProducts
        : SAMPLE_PRODUCTS;
      return {
        store: previewStore,
        featuredProducts: products.slice(0, 4),
        secondaryProducts: products.slice(4),
        products,
        categories: [],
        serviceCategories: [],
        featuredServices: [],
        secondaryServices: [],
        services: [],
        reviews: [],
        promotionalBanner: null,
      };
    }
    return unwrapData(storeQuery.data) || {};
  }, [previewMode, previewProducts, previewStore, storeQuery.data]);
  const store = data.store || null;

  useEffect(() => {
    // Custom domains use root paths — do not persist a Sabito `/stores` or shared `/shop` prefix.
    if (previewMode || !isSingleStoreMode || !store?.slug || isCustomDomain) return;
    persistOnlineStoreBrand(store, {
      pathPrefix: pathPrefix === 'stores' ? 'stores' : 'shop',
    });
  }, [isCustomDomain, isSingleStoreMode, pathPrefix, previewMode, store]);

  const theme = useMemo(() => getTemplateTheme(store?.templateId), [store?.templateId]);
  const brandColors = useMemo(
    () => resolveStoreBrandColors(store?.templateId, store || {}),
    [store],
  );
  const accent = brandColors.primary || theme.accent;
  const secondary = brandColors.secondary || theme.secondary || accent;
  const isServiceStore = store?.storeMode === 'studio';
  const productCategories = useMemo(() => (Array.isArray(data.categories) ? data.categories : []), [data.categories]);
  const serviceCategories = useMemo(() => (Array.isArray(data.serviceCategories) ? data.serviceCategories : []), [data.serviceCategories]);
  const categories = isServiceStore ? serviceCategories : productCategories;
  const featuredProducts = useMemo(() => Array.isArray(data.featuredProducts) ? data.featuredProducts : [], [data.featuredProducts]);
  const secondaryProducts = useMemo(() => Array.isArray(data.secondaryProducts) ? data.secondaryProducts : [], [data.secondaryProducts]);
  const productSections = useMemo(() => {
    if (!Array.isArray(data.productSections)) return [];
    return data.productSections.filter((section) => (
      section && Array.isArray(section.products) && section.products.length > 0
    ));
  }, [data.productSections]);
  const featuredServices = useMemo(() => Array.isArray(data.featuredServices) ? data.featuredServices : [], [data.featuredServices]);
  const secondaryServices = useMemo(() => Array.isArray(data.secondaryServices) ? data.secondaryServices : [], [data.secondaryServices]);
  const allProducts = useMemo(() => (
    Array.isArray(data.products) ? data.products : uniqueById(featuredProducts, secondaryProducts)
  ), [data.products, featuredProducts, secondaryProducts]);
  const allServices = useMemo(() => (
    Array.isArray(data.services) ? data.services : uniqueById(featuredServices, secondaryServices)
  ), [data.services, featuredServices, secondaryServices]);
  const reviews = useMemo(() => Array.isArray(data.reviews) ? data.reviews : [], [data.reviews]);
  const stats = store?.stats || {};
  const currency = store?.currency;
  // Marketplace store pages keep the discovery banner; Online Store single-shop does not.
  const showBannerHero = isMarketplaceMode;
  const bannerUrl = showBannerHero ? resolveStoreBannerImageUrl(store) : '';
  const heroSlides = useMemo(
    () => (isSingleStoreMode || !isMarketplaceMode) && Array.isArray(store?.heroSlides) ? store.heroSlides : [],
    [isMarketplaceMode, isSingleStoreMode, store?.heroSlides]
  );
  const contactHref = useMemo(() => buildContactHref(store), [store]);
  const publicContactDetails = useMemo(() => buildPublicContactDetails(store), [store]);
  const hasPublicContactDetails = Boolean(
    publicContactDetails.phone || publicContactDetails.whatsapp || publicContactDetails.email
  );
  const promo = data.promotionalBanner || store?.promo || null;
  const activePage = resolveStorePage(location.pathname);
  const storeBasePath = resolveSingleStoreHomePath({
    storeSlug,
    pathPrefix,
    isCustomDomain,
    pathname: location.pathname,
  });
  const pathOpts = useMemo(() => ({
    pathname: location.pathname,
    ...(pathPrefix ? { prefix: pathPrefix } : {}),
    isCustomDomain,
  }), [isCustomDomain, location.pathname, pathPrefix]);

  const storeReviewsQuery = useQuery({
    queryKey: ['store-reviews', storeSlug],
    queryFn: () => storeService.getStoreReviews(storeSlug),
    enabled: Boolean(storeSlug && store) && !previewMode,
    retry: false,
  });

  const storeReviewEligibilityQuery = useQuery({
    queryKey: ['store-review-eligibility', storeSlug, isAuthenticated],
    queryFn: () => storeService.getStoreReviewEligibility(storeSlug),
    enabled: Boolean(storeSlug && store && isAuthenticated) && !previewMode,
    retry: false,
  });

  const storeReviewPayload = useMemo(() => unwrapData(storeReviewsQuery.data) || {}, [storeReviewsQuery.data]);
  const storeReviewSummary = storeReviewPayload.summary || {
    rating: stats.rating || null,
    reviewsCount: stats.reviewsCount || 0,
    reviews,
  };
  const storeReviewList = useMemo(() => (
    Array.isArray(storeReviewPayload.reviews) ? storeReviewPayload.reviews : reviews
  ), [storeReviewPayload.reviews, reviews]);
  const storeReviewEligibility = useMemo(() => unwrapData(storeReviewEligibilityQuery.data) || null, [storeReviewEligibilityQuery.data]);

  const trustBadges = useMemo(() => ([
    ...(stats.positiveReviewsPercent ? [{
      label: `${stats.positiveReviewsPercent}% positive reviews`,
      icon: Star,
    }] : []),
    ...(store?.deliveryEnabled ? [{
      label: 'Delivery available',
      icon: Truck,
    }] : []),
    { label: 'Secure payments', icon: ShieldCheck },
  ]), [stats.positiveReviewsPercent, store?.deliveryEnabled]);

  const handleSearch = useCallback((search) => {
    if (isSingleStoreMode || !isMarketplaceMode) {
      navigate(buildStoreCatalogPath(storeSlug, {
        search,
        ...pathOpts,
        isServiceStore,
      }));
      return;
    }
    if (isServiceStore) {
      navigate(buildServicesSearchPath({ search, studioSlug: storeSlug }));
      return;
    }
    navigate(buildProductsSearchPath({ search, storeSlug }));
  }, [isMarketplaceMode, isServiceStore, isSingleStoreMode, navigate, pathOpts, storeSlug]);

  const handleFollowStore = useCallback(() => {
    showSuccess('Following stores is coming soon.');
  }, []);

  const handleReviewAuth = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'review',
        returnTo: storeBasePath,
      },
    });
  }, [openShopperAuthModal, storeBasePath]);

  const handleSubmitStoreReview = useCallback(async (payload) => {
    setReviewSubmitting(true);
    try {
      await storeService.submitStoreReview(storeSlug, payload);
      showSuccess('Store review saved.');
      await Promise.all([
        storeReviewsQuery.refetch(),
        storeReviewEligibilityQuery.refetch(),
        storeQuery.refetch(),
      ]);
    } catch (error) {
      showError(error, 'Could not save your store review.');
    } finally {
      setReviewSubmitting(false);
    }
  }, [storeQuery, storeReviewEligibilityQuery, storeReviewsQuery, storeSlug]);

  /** Compact trust strip for owned Online Store — badge chips near footer, not post-hero. */
  const ownedTrustItems = useMemo(() => ([
    store?.deliveryEnabled ? { label: 'Delivery available', icon: Truck } : null,
    { label: 'Secure payments', icon: ShieldCheck },
    contactHref ? { label: 'Contact us', icon: MessageCircle, href: contactHref } : null,
  ].filter(Boolean)), [store?.deliveryEnabled, contactHref]);

  if (!previewMode && storeQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-[#f4f7f2] text-slate-900">
        <main className="w-full px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <Alert variant="destructive">
              <Store className="h-4 w-4" />
              <AlertDescription>This store is not available right now.</AlertDescription>
            </Alert>
            {!isSingleStoreMode ? (
              <Button className="mt-4 bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent-hover,#14532d)]" asChild>
                <Link to="/stores">Back to stores</Link>
              </Button>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  const catalogPath = isServiceStore
    ? (storeBasePath === '/' ? '/services' : `${storeBasePath}/services`)
    : (storeBasePath === '/' ? '/products' : `${storeBasePath}/products`);
  const navItems = [
    { key: 'home', label: isOwnedShop ? 'Home' : 'Store Home', to: storeBasePath },
    { key: 'catalog', label: isServiceStore ? 'All Services' : 'All Products', to: catalogPath },
    { key: 'categories', label: 'Categories', to: storeBasePath === '/' ? '/categories' : `${storeBasePath}/categories` },
    { key: 'about', label: 'About Us', to: storeBasePath === '/' ? '/about' : `${storeBasePath}/about` },
    { key: 'reviews', label: 'Reviews', to: storeBasePath === '/' ? '/reviews' : `${storeBasePath}/reviews` },
  ];
  const storeCatalogRaw = isServiceStore ? allServices : allProducts;
  const storeCatalog = (isSingleStoreMode || catalogSearch || catalogCategory)
    ? filterStoreListings(storeCatalogRaw, { search: catalogSearch, category: catalogCategory })
    : storeCatalogRaw;
  const navLinkClass = (key) => (
    `whitespace-nowrap border-b-2 px-1 py-2 transition-colors ${
      activePage === key
        ? 'border-[color:var(--store-accent,#166534)] text-[color:var(--store-accent,#166534)]'
        : 'border-transparent text-slate-700 hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] hover:text-[color:var(--store-accent,#166534)]'
    }`
  );
  const categoryLinkFor = (category) => (
    isSingleStoreMode || !isMarketplaceMode
      ? buildStoreCatalogPath(storeSlug, {
        category: category.name,
        ...pathOpts,
        isServiceStore,
      })
      : (isServiceStore
        ? buildServicesSearchPath({ category: category.name, studioSlug: storeSlug })
        : buildProductsSearchPath({ category: category.name, storeSlug }))
  );

  const categoriesCard = (!isOwnedShop || categories.length > 0) ? (
    <Card id="categories" className="sf-reveal border border-border">
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold">{isServiceStore ? 'Browse by Category' : 'Shop by Category'}</h2>
        <div className="mt-4 grid gap-2">
          {categories.length ? categories.map((category) => {
            const imageUrl = getCategoryImageUrl(category);
            return (
              <Link
                key={category.id || category.name}
                to={categoryLinkFor(category)}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] hover:bg-[var(--store-accent-soft,#f0fdf4)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_20%,white)] bg-[var(--store-accent-soft,#f0fdf4)] text-[color:var(--store-accent,#166534)]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      isServiceStore ? <Scissors className="h-4 w-4" /> : <Package className="h-4 w-4" />
                    )}
                  </span>
                  <span className="truncate">{category.name}</span>
                </span>
                <Badge variant="outline" className="shrink-0">{formatInteger(category.count || 0)}</Badge>
              </Link>
            );
          }) : (
            <p className="text-sm text-muted-foreground">
              {isOwnedShop
                ? (isServiceStore ? 'No categories yet.' : 'No categories yet.')
                : (isServiceStore
                  ? 'Categories appear when services are categorized.'
                  : 'Categories appear when products are categorized.')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  ) : null;

  const aboutCard = (
    <Card id="about" className="sf-reveal border border-border">
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold">{isOwnedShop ? 'About us' : 'About Store'}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {store.description || (
            isOwnedShop
              ? (isServiceStore
                ? `Welcome to ${store.displayName}. Browse our services.`
                : `Welcome to ${store.displayName}. Browse our products.`)
              : (isServiceStore
                ? `${store.displayName} has launched a public service catalog.`
                : `${store.displayName} has launched a public product catalog.`)
          )}
        </p>
        <div className="mt-4 grid gap-2 text-sm">
          {!isOwnedShop ? (
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[color:var(--store-accent,#166534)]" /> Published store</span>
          ) : null}
          {isServiceStore ? (
            <span className="inline-flex items-center gap-2">
              <Scissors className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              {formatInteger(stats.serviceCount || 0)} services
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Package className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              {formatInteger(stats.productCount || 0)} products
            </span>
          )}
          {publicContactDetails.phone ? (
            <a className="inline-flex min-w-0 items-center gap-2 text-[color:var(--store-accent,#166534)] hover:text-[color:var(--store-accent-hover,#14532d)]" href={publicContactDetails.phone.href || undefined}>
              <Phone className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              <span className="truncate">{publicContactDetails.phone.label}</span>
            </a>
          ) : null}
          {publicContactDetails.whatsapp ? (
            <a className="inline-flex min-w-0 items-center gap-2 text-[color:var(--store-accent,#166534)] hover:text-[color:var(--store-accent-hover,#14532d)]" href={publicContactDetails.whatsapp.href} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              <span className="truncate">WhatsApp: {publicContactDetails.whatsapp.label}</span>
            </a>
          ) : null}
          {publicContactDetails.email ? (
            <a className="inline-flex min-w-0 items-center gap-2 text-[color:var(--store-accent,#166534)] hover:text-[color:var(--store-accent-hover,#14532d)]" href={publicContactDetails.email.href}>
              <Mail className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              <span className="truncate">{publicContactDetails.email.label}</span>
            </a>
          ) : null}
          {!hasPublicContactDetails ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
              Contact details not published
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  const deliveryCard = (store.freeDeliveryThreshold || store.deliveryEnabled) ? (
    <Card
      className="sf-reveal border"
      style={{
        borderColor: 'color-mix(in srgb, var(--store-accent, #166534) 28%, #e5e7eb)',
        backgroundColor: 'var(--store-accent-soft, #f0fdf4)',
      }}
    >
      <CardContent className="p-5">
        <Truck className="h-6 w-6 text-[color:var(--store-accent,#166534)]" />
        <h2 className="mt-3 text-lg font-semibold text-slate-950">Delivery Options</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {store.freeDeliveryThreshold
            ? `Free delivery from ${formatAmount(store.freeDeliveryThreshold, currency)}.`
            : (isOwnedShop
              ? 'We deliver where we can fulfill your order.'
              : 'Delivery is available where the store can fulfill orders.')}
        </p>
      </CardContent>
    </Card>
  ) : null;

  const trustSection = (
    <section className="border-y border-border bg-muted/20">
      <div className="sf-stagger grid w-full gap-3 px-3 py-6 sm:px-4 md:grid-cols-4">
        {[
          isServiceStore
            ? { title: 'Professional Services', description: isOwnedShop ? 'Services we offer' : `Offered by ${store.displayName}`, icon: Scissors }
            : { title: 'Genuine Products', description: isOwnedShop ? 'Quality products from us' : `Published by ${store.displayName}`, icon: ShieldCheck },
          isServiceStore
            ? { title: 'Request Quotes', description: 'Get pricing before you book', icon: MessageCircle }
            : { title: 'Fast Delivery', description: store.deliveryEnabled ? (isOwnedShop ? 'Delivery available' : 'Delivery available from this store') : (isOwnedShop ? 'We handle fulfillment' : 'Fulfillment managed by the store'), icon: Truck },
          { title: 'Secure Payments', description: 'Protected checkout options', icon: CreditCard },
          isServiceStore
            ? { title: 'Trusted Support', description: isOwnedShop ? 'We’re here after you book' : 'Store-managed service follow-up', icon: RotateCcw }
            : { title: 'Easy Returns', description: isOwnedShop ? 'We’re here to help' : 'Store-managed support', icon: RotateCcw },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="sf-reveal rounded-2xl border border-border bg-background p-4">
              <Icon className="h-6 w-6 text-[color:var(--store-accent,#166534)]" />
              <p className="mt-3 font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );

  const ownedTrustStrip = ownedTrustItems.length > 0 ? (
    <section
      className="border-t bg-white"
      aria-label="Store assurances"
      style={{ borderColor: `color-mix(in srgb, ${accent} 18%, #e5e7eb)` }}
    >
      <div className="flex w-full flex-wrap items-center justify-center gap-2.5 px-3 py-5 sm:gap-3 sm:px-4">
        {ownedTrustItems.map((item) => {
          const Icon = item.icon;
          const chipStyle = {
            borderColor: `color-mix(in srgb, ${accent} 28%, #e5e7eb)`,
            backgroundColor: 'var(--store-accent-soft, #f8fafc)',
          };
          const content = (
            <>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white"
                style={{ borderColor: `color-mix(in srgb, ${accent} 22%, #e5e7eb)` }}
              >
                <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-slate-800">
                {item.label}
              </span>
            </>
          );
          const chipClassName =
            'inline-flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition-opacity hover:opacity-90';
          if (item.href) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={chipClassName}
                style={chipStyle}
              >
                {content}
              </a>
            );
          }
          return (
            <span key={item.label} className={chipClassName} style={chipStyle}>
              {content}
            </span>
          );
        })}
      </div>
    </section>
  ) : null;

  const ownedAboutSection = (
    <section id="about" className="w-full border-t border-border px-3 py-10 sm:px-4 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>About</p>
          <h2 className="mt-1 text-2xl font-semibold">About us</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 opacity-80">
            {store.description || (
              isServiceStore
                ? 'Browse our services and get in touch when you are ready.'
                : 'Browse our products and get in touch when you are ready.'
            )}
          </p>
          <div className="mt-6 grid gap-3 text-sm">
            {publicContactDetails.phone ? (
              <a className="inline-flex min-w-0 items-center gap-2 hover:opacity-80" href={publicContactDetails.phone.href || undefined} style={{ color: accent }}>
                <Phone className="h-4 w-4 shrink-0" />
                <span className="truncate">{publicContactDetails.phone.label}</span>
              </a>
            ) : null}
            {publicContactDetails.whatsapp ? (
              <a className="inline-flex min-w-0 items-center gap-2 hover:opacity-80" href={publicContactDetails.whatsapp.href} target="_blank" rel="noreferrer" style={{ color: accent }}>
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="truncate">WhatsApp: {publicContactDetails.whatsapp.label}</span>
              </a>
            ) : null}
            {publicContactDetails.email ? (
              <a className="inline-flex min-w-0 items-center gap-2 hover:opacity-80" href={publicContactDetails.email.href} style={{ color: accent }}>
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">{publicContactDetails.email.label}</span>
              </a>
            ) : null}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-background p-5">
            <p className="text-sm font-semibold">At a glance</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {isServiceStore ? (
                <span className="inline-flex items-center gap-2">
                  <Scissors className="h-4 w-4" style={{ color: accent }} />
                  {formatInteger(stats.serviceCount || 0)} services
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Package className="h-4 w-4" style={{ color: accent }} />
                  {formatInteger(stats.productCount || 0)} products
                </span>
              )}
              {store.category ? (
                <p className="pt-1">{store.category}</p>
              ) : null}
            </div>
          </div>
          {deliveryCard}
        </div>
      </div>
    </section>
  );

  const ownedCategoryStrip = categories.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {categories.slice(0, 8).map((category) => (
        <Link
          key={category.id || category.name}
          to={categoryLinkFor(category)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] hover:bg-[var(--store-accent-soft,#f0fdf4)]"
        >
          <span className="truncate max-w-[10rem]">{category.name}</span>
          <Badge variant="outline" className="shrink-0">{formatInteger(category.count || 0)}</Badge>
        </Link>
      ))}
      {categories.length > 8 ? (
        <Link
          to={storeBasePath === '/' ? '/categories' : `${storeBasePath}/categories`}
          className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] hover:bg-[var(--store-accent-soft,#f0fdf4)]"
          style={{ color: accent }}
        >
          All categories
        </Link>
      ) : null}
    </div>
  ) : null;

  const ownedProductBlocks = isServiceStore ? (
    <>
      <ServiceSection
        storeSlug={storeSlug}
        title="Featured"
        services={featuredServices}
        emptyText="No featured services yet."
        serviceBasePathname={location.pathname}
        isCustomDomain={isCustomDomain}
        accent={accent}
      />
      {secondaryServices.length > 0 ? (
        <ServiceSection
          storeSlug={storeSlug}
          sectionId="more-services"
          title="More Services"
          services={secondaryServices}
          emptyText="No additional services are available right now."
          serviceBasePathname={location.pathname}
          isCustomDomain={isCustomDomain}
          accent={accent}
        />
      ) : null}
    </>
  ) : productSections.length > 0 ? (
    <>
      {productSections.map((section) => (
        <ProductSection
          key={section.id || section.slug}
          title={section.title}
          description={section.description || undefined}
          products={section.products}
          emptyText=""
          sectionId={`section-${section.slug || section.id}`}
          theme={theme}
          accent={accent}
        />
      ))}
    </>
  ) : (
    <>
      <ProductSection
        title="Featured"
        products={featuredProducts}
        emptyText="No featured products yet."
        theme={theme}
        accent={accent}
      />
      {secondaryProducts.length > 0 ? (
        <ProductSection
          title={data.secondaryProductsLabel || 'New Arrivals'}
          products={secondaryProducts}
          emptyText="No additional products are available right now."
          theme={theme}
          accent={accent}
        />
      ) : null}
    </>
  );

  const ownedHomeContent = (
    <>
      <section className="w-full space-y-10 px-3 py-8 sm:px-4 sm:py-10">
        {promo ? (
          <PromoBanner
            promo={promo}
            storeSlug={storeSlug}
            pathname={location.pathname}
            isCustomDomain={isCustomDomain}
            ctaLabel="Shop offer"
          />
        ) : null}

        {ownedProductBlocks}

        {ownedCategoryStrip}
      </section>

      <StoreTestimonialsSection
        testimonials={store?.testimonials}
        accent={accent}
      />

      {ownedAboutSection}
      {ownedTrustStrip}
    </>
  );

  const marketplaceHomeContent = (
    <>
      <section className="grid w-full gap-6 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5">
          {categoriesCard}
          {aboutCard}
          {deliveryCard}
        </aside>

        <div className="space-y-10">
          {promo ? (
            <PromoBanner
              promo={promo}
              storeSlug={storeSlug}
              pathname={location.pathname}
              isCustomDomain={isCustomDomain}
                ctaLabel="View deal"
            />
          ) : null}

          {isServiceStore ? (
            <>
              <ServiceSection
                storeName={store.displayName}
                storeSlug={storeSlug}
                title="Featured Services"
                description="Services published by this store and sorted by storefront priority."
                services={featuredServices}
                emptyText="This store has not published featured services yet."
                serviceBasePathname={location.pathname}
                isCustomDomain={isCustomDomain}
              />
              <ServiceSection
                storeName={store.displayName}
                storeSlug={storeSlug}
                sectionId="more-services"
                title="More Services"
                description="Latest services published by this store."
                services={secondaryServices}
                emptyText="No additional services are available right now."
                serviceBasePathname={location.pathname}
                isCustomDomain={isCustomDomain}
              />
            </>
          ) : productSections.length > 0 ? (
            <>
              {productSections.map((section) => (
                <ProductSection
                  key={section.id || section.slug}
                  storeName={store.displayName}
                  title={section.title}
                  description={section.description || undefined}
                  products={section.products}
                  emptyText=""
                  sectionId={`section-${section.slug || section.id}`}
                  theme={theme}
                  accent={accent}
                />
              ))}
            </>
          ) : (
            <>
              <ProductSection
                storeName={store.displayName}
                title="Featured Products"
                description="Products published by this store and sorted by storefront priority."
                products={featuredProducts}
                emptyText="This store has not published featured products yet."
                theme={theme}
                accent={accent}
              />
              <ProductSection
                storeName={store.displayName}
                title={data.secondaryProductsLabel || 'New Arrivals'}
                description={
                  data.secondaryProductsLabel === 'Best Selling Products'
                    ? 'Ranked from recorded sales for this store.'
                    : 'Latest products published by this store.'
                }
                products={secondaryProducts}
                emptyText="No additional products are available right now."
                theme={theme}
                accent={accent}
              />
            </>
          )}
        </div>
      </section>
      {trustSection}
    </>
  );

  const homeContent = isOwnedShop ? ownedHomeContent : marketplaceHomeContent;

  const reviewsSection = (
    <section id="reviews" className="w-full px-3 py-10 sm:px-4 sm:py-12">
      <div className="sf-reveal grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-3xl md:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">Customer Reviews</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {isOwnedShop ? 'Reviews' : 'Verified store feedback'}
            </h2>
          </div>
          <ReviewSummaryLine summary={storeReviewSummary} />
        </div>
        <VerifiedReviewForm
          eligibility={storeReviewEligibility}
          isAuthenticated={isAuthenticated}
          isEligibilityLoading={storeReviewEligibilityQuery.isLoading}
          isSubmitting={reviewSubmitting}
          onRequireAuth={handleReviewAuth}
          onSubmit={handleSubmitStoreReview}
          targetLabel={store.displayName}
        />
        <ReviewList
          reviews={storeReviewList}
          emptyText={isOwnedShop ? 'No reviews yet.' : 'No verified store reviews yet.'}
        />
      </div>
    </section>
  );

  const catalogSection = isServiceStore ? (
    <section className="w-full px-3 py-8 sm:px-4 sm:py-10">
      <ServiceSection
        storeName={store.displayName}
        storeSlug={storeSlug}
        title={catalogSearch || catalogCategory ? 'Matching services' : 'All Services'}
        description={
          catalogSearch
            ? `Results for “${catalogSearch}”.`
            : (isOwnedShop
              ? (isServiceStore ? 'Browse all our services.' : 'Browse all our products.')
              : (isServiceStore
                ? 'Browse every published service from this store.'
                : 'Browse every published product from this store.'))
        }
        services={storeCatalog}
        emptyText={catalogSearch || catalogCategory ? 'No services match this search.' : (isOwnedShop ? 'No services yet.' : 'This store has not published services yet.')}
        serviceBasePathname={location.pathname}
        isCustomDomain={isCustomDomain}
      />
    </section>
  ) : (
    <section className="w-full px-3 py-8 sm:px-4 sm:py-10">
      <ProductSection
        storeName={store.displayName}
        title={catalogSearch || catalogCategory ? 'Matching products' : 'All Products'}
        description={
          catalogSearch
            ? `Results for “${catalogSearch}”.`
            : (isOwnedShop
              ? 'Browse all our products.'
              : 'Browse every published product from this store.')
        }
        products={storeCatalog}
        emptyText={catalogSearch || catalogCategory ? 'No products match this search.' : (isOwnedShop ? 'No products yet.' : 'This store has not published products yet.')}
        theme={theme}
        accent={accent}
      />
    </section>
  );

  const categoriesPage = (
    <section className="w-full px-3 py-8 sm:px-4 sm:py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-3xl md:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">{store.displayName}</p>
        <h2 className="mt-1 text-2xl font-semibold">Categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isOwnedShop
            ? (isServiceStore ? 'Browse our service categories.' : 'Browse our product categories.')
            : (isServiceStore ? 'Browse service categories from this store.' : 'Browse product categories from this store.')}
        </p>
        <div className="sf-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.length ? categories.map((category) => {
            const imageUrl = getCategoryImageUrl(category);
            return (
              <Link
                key={category.id || category.name}
                to={categoryLinkFor(category)}
                className="sf-reveal sf-card flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] hover:bg-[var(--store-accent-soft,#f0fdf4)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_20%,white)] bg-white text-[color:var(--store-accent,#166534)]">
                    {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : (
                      isServiceStore ? <Scissors className="h-5 w-5" /> : <Package className="h-5 w-5" />
                    )}
                  </span>
                  <span className="truncate font-semibold text-slate-950">{category.name}</span>
                </span>
                <Badge variant="outline" className="shrink-0">{formatInteger(category.count || 0)}</Badge>
              </Link>
            );
          }) : (
            <p className="text-sm text-muted-foreground">
              {isServiceStore ? 'No service categories are published yet.' : 'No product categories are published yet.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );

  const aboutPage = (
    <section className="grid w-full gap-6 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      {aboutCard}
      <aside className="space-y-5">
        {categoriesCard}
        {deliveryCard}
      </aside>
    </section>
  );

  const pageContent = activePage === 'catalog'
    ? catalogSection
    : activePage === 'categories'
      ? categoriesPage
      : activePage === 'about'
        ? aboutPage
        : activePage === 'reviews'
          ? reviewsSection
          : homeContent;

  const listingLabel = isServiceStore
    ? `${formatInteger(stats.serviceCount || 0)} services`
    : `${formatInteger(stats.productCount || 0)} products`;

  const fullHeroSection = (
    <section className="relative z-0 border-b border-border">
      {!showBannerHero && heroSlides.length > 0 ? (
        <StoreHeroCarousel
          slides={heroSlides}
          storeName={store.displayName}
          accent={accent}
          animation={store?.heroAnimation}
        />
      ) : null}
      {/* Owned Online Store: skip post-hero branding/tagline/trust — products follow immediately. */}
      {isOwnedShop ? null : (
      <div className="w-full px-3 py-6 sm:px-4 sm:py-8">
        <div className={`overflow-hidden ${theme.heroClass}`}>
          {showBannerHero ? (
            <div className="relative h-48 overflow-hidden border-b border-border/60 sm:h-64 md:h-72">
              {bannerUrl ? (
                <img
                  src={bannerUrl}
                  alt={`${store.displayName} banner`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
                />
              )}
              {theme.heroOverlay ? <div className="absolute inset-0 bg-slate-950/40" /> : null}
            </div>
          ) : null}

          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-8">
            <div className="flex flex-col gap-5 sm:flex-row">
              <div
                className={`relative z-10 flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white sm:rounded-3xl ${
                  showBannerHero ? '-mt-16' : ''
                }`}
              >
                <StoreLogo store={store} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className={`min-w-0 font-bold tracking-tight sm:text-3xl md:text-4xl ${theme.id === 'bold' ? 'text-3xl' : 'text-2xl'}`}>
                    {store.displayName}
                  </h1>
                  <Badge className="text-white hover:opacity-90" style={{ backgroundColor: accent }}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Verified Store
                  </Badge>
                </div>
                <p className={`mt-3 max-w-3xl text-base leading-7 ${theme.id === 'bold' ? 'text-white/80' : 'opacity-70'}`}>
                  {store.description || (
                    isServiceStore
                      ? `Browse published services from ${store.displayName}.`
                      : `Browse published products from ${store.displayName}.`
                  )}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {trustBadges.map((badge) => {
                    const Icon = badge.icon;
                    return (
                      <Badge key={badge.label} variant="outline" className="gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ color: secondary, borderColor: secondary }}>
                        <Icon className="h-3.5 w-3.5" />
                        {badge.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:flex sm:flex-row sm:flex-wrap lg:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" style={{ borderColor: secondary, color: secondary }} onClick={handleFollowStore} disabled={previewMode}>Follow Store</Button>
              <Button type="button" className="w-full hover:opacity-90 sm:w-auto" style={{ backgroundColor: accent }} disabled={!contactHref || previewMode} asChild={Boolean(contactHref) && !previewMode}>
                {contactHref && !previewMode ? (
                  <a href={contactHref} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Contact Store
                  </a>
                ) : (
                  <span>
                    <MessageCircle className="mr-2 inline h-4 w-4" />
                    Contact Store
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}
    </section>
  );

  /** Owned shop home: carousel only when slides exist; otherwise skip straight to products. */
  const ownedHeroSection = heroSlides.length > 0 ? (
    <section className="relative z-0 border-b border-border">
      <StoreHeroCarousel
        slides={heroSlides}
        storeName={store.displayName}
        accent={accent}
        animation={store?.heroAnimation}
      />
    </section>
  ) : null;

  const compactSummarySection = (
    <section className="border-b border-border bg-white">
      <div className="flex w-full flex-col gap-4 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white sm:h-16 sm:w-16">
            <StoreLogo store={store} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold sm:text-xl">{store.displayName}</h1>
              {!isOwnedShop ? (
                <Badge className="text-white hover:opacity-90" style={{ backgroundColor: accent }}>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Verified
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-1 text-sm opacity-70">
              {store.category || listingLabel}
              {store.category ? ` · ${listingLabel}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isOwnedShop ? (
            <Button type="button" variant="outline" size="sm" className="rounded-full" style={{ borderColor: secondary, color: secondary }} onClick={handleFollowStore} disabled={previewMode}>Follow</Button>
          ) : null}
          <Button type="button" size="sm" className="rounded-full hover:opacity-90" style={{ backgroundColor: accent }} disabled={!contactHref || previewMode} asChild={Boolean(contactHref) && !previewMode}>
            {contactHref && !previewMode ? (
              <a href={contactHref} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                {isOwnedShop ? 'Contact us' : 'Contact'}
              </a>
            ) : (
              <span>{isOwnedShop ? 'Contact us' : 'Contact'}</span>
            )}
          </Button>
        </div>
      </div>
    </section>
  );

  return (
    <TemplateThemeProvider
      templateId={store.templateId}
      primaryColor={brandColors.primary}
      secondaryColor={brandColors.secondary}
      tertiaryColor={brandColors.tertiary}
    >
    <div className="min-h-screen">
      <StoreScopedHeader
        store={store}
        onSearch={handleSearch}
        theme={theme}
        accent={accent}
        previewMode={previewMode}
        subtitle={storeSubtitle}
        homeTo={storeBasePath}
        navItems={isOwnedShop ? navItems : null}
        activePage={activePage}
      />

      <main>
        {!previewMode && isMarketplaceMode ? (
        <div className="mx-auto w-full max-w-[1440px] px-3 pt-5 sm:px-4 sm:pt-6">
        <section className="bg-muted/20">
          <div className="flex w-full items-center justify-between gap-4 px-3 py-3 text-sm text-muted-foreground sm:px-4">
            <div className="min-w-0">
              <Link to="/stores" className="hover:text-green-800">Stores</Link>
              <ChevronRight className="mx-2 inline h-4 w-4" />
              <span className="font-medium text-foreground">{store.displayName}</span>
            </div>
            <Link to="/" className="shrink-0 font-semibold text-green-800 hover:text-green-900">
              Sabito
            </Link>
          </div>
        </section>
        </div>
        ) : null}

        {!isOwnedShop ? (
        <nav className="sticky top-[73px] z-40 border-b border-border bg-background/95 backdrop-blur sm:top-[81px]">
          <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3 overflow-x-auto px-6 py-3 text-sm font-medium sm:gap-5 sm:px-8">
            {navItems.map((item) => (
              <Link key={item.key} to={item.to} className={navLinkClass(item.key)}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        ) : null}

        <div className={`mx-auto w-full max-w-[1440px] px-3 pb-5 sm:px-4 sm:pb-6 ${
          isOwnedShop && activePage === 'home' && heroSlides.length > 0
            ? ''
            : 'pt-5 sm:pt-6'
        }`}>
        {activePage === 'home'
          ? (isOwnedShop ? ownedHeroSection : fullHeroSection)
          : compactSummarySection}

        {/* key replays the entrance when switching Home / Products / Categories / About / Reviews */}
        <div key={activePage} className="sf-page-enter">
          {pageContent}
        </div>

        </div>
      </main>
      <StoreScopedFooter
        store={previewMode
          ? { ...store, showAbsPromo: store?.showAbsPromo !== false }
          : store}
        isServiceStore={isServiceStore}
        contactHref={contactHref}
        singleStoreMode={previewMode || isSingleStoreMode || !isMarketplaceMode}
        storeBasePath={storeBasePath}
        subtitle={storeSubtitle}
        accentColor={accent}
      />
    </div>
    </TemplateThemeProvider>
  );
};

export default PublicStoreHome;
