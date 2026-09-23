import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  CreditCard,
  Eye,
  Heart,
  Home,
  Loader2,
  LogOut,
  Mail,
  MailCheck,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Truck,
  User,
  UserRound,
  X,
} from 'lucide-react';

import { dashboardLink } from '../../config';
import { ABS_MARKETING_SITE_URL, ABS_ONLINE_STORE_PROMO_WHATSAPP_HREF, APP_NAME } from '../../constants';
import { useCart } from '../../context/CartContext';
import { useStorefrontAuth } from '../../context/StorefrontAuthContext';
import { useStorefrontMode } from '../../context/StorefrontModeContext';
import { useWishlist } from '../../context/WishlistContext';
import OnlineStorePageShell from '../../online-store/OnlineStorePageShell';
import { buildStoreHomePath, buildStoreProductPath, isOnlineStoreShopPrefix } from '../../online-store/storePaths';
import { buildProductsSearchPath } from '../../utils/marketplaceSearch';
import { getCustomerAvatarUrl, getCustomerInitials } from '../../utils/avatarUtils';
import { resolveImageUrl, resolveStoreBannerImageUrl } from '../../utils/fileUtils';
import { formatAmount, formatInteger } from '../../utils/formatNumber';
import { resolveVisibleProductCardActions } from '../../utils/productCardActions';
import {
  filterProductCardActionsForListing,
  getListingCommerceBadges,
  getProductPriceDisplay,
  isRentOnlyListing,
} from '../../utils/productListingDisplay';
import {
  buildStoreWhatsAppHref,
  resolveStoreWhatsAppPhone,
  whatsappPriceInquiryMessage,
  whatsappProductInterestMessage,
} from '../../utils/whatsapp';
import { showError, showSuccess } from '../../utils/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import sabitoStoreLogo from '../../../Sabitostore logo png.png';

export const unwrapData = (response) => response?.data?.data || response?.data || response;

export const extractList = (value) => {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

export const getDiscountPercent = (product) => {
  const compareAt = Number.parseFloat(product?.compareAtPrice || 0);
  const price = Number.parseFloat(product?.publicPrice || 0);
  return compareAt > price && price > 0 ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
};

export const getPublishedTime = (product) => {
  const timestamp = product?.publishedAt ? new Date(product.publishedAt).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const getProductUrl = (product, { pathname = '', prefix, isCustomDomain = false } = {}) => {
  const storeSlug = product?.store?.slug || product?.storeSlug;
  const productSlug = product?.slug || product?.id;
  if (!storeSlug || !productSlug) return '/products';
  if (isCustomDomain) {
    return buildStoreProductPath(storeSlug, productSlug, { isCustomDomain: true });
  }
  const useShopPrefix = (
    prefix === 'shop'
    || prefix === 'template'
    || isOnlineStoreShopPrefix(pathname)
  );
  if (useShopPrefix) {
    return buildStoreProductPath(storeSlug, productSlug, {
      pathname,
      ...(prefix ? { prefix } : {}),
    });
  }
  return `/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}`;
};

export const getServiceUrl = (service) => {
  const studioSlug = service?.studio?.slug;
  const serviceSlug = service?.slug || service?.id;
  return studioSlug && serviceSlug
    ? `/studios/${encodeURIComponent(studioSlug)}/services/${encodeURIComponent(serviceSlug)}`
    : '/services';
};

export const getStoreServiceUrl = (storeSlug, service, { pathname = '', isCustomDomain = false } = {}) => {
  const serviceSlug = service?.slug || service?.id;
  if (!storeSlug || !serviceSlug) return getServiceUrl(service);
  if (isCustomDomain) {
    return `/services/${encodeURIComponent(serviceSlug)}`;
  }
  const prefix = isOnlineStoreShopPrefix(pathname) ? 'shop' : 'stores';
  return `/${prefix}/${encodeURIComponent(storeSlug)}/services/${encodeURIComponent(serviceSlug)}`;
};

const formatServicePrice = (service) => {
  if (service?.priceType === 'quote_only') return 'Quote on request';
  const price = Number.parseFloat(service?.startingPrice || 0);
  if (!price) return 'Price on request';
  const currency = service?.studio?.currency;
  return service?.priceType === 'fixed' ? formatAmount(price, currency) : `From ${formatAmount(price, currency)}`;
};

export const getReviewMeta = (item, placeholderLabel = 'New') => {
  const rating = Number.parseFloat(item?.rating || 0);
  const reviewsCount = Number.parseInt(item?.reviewsCount ?? item?.reviewCount ?? 0, 10);
  if (rating > 0 && reviewsCount > 0) {
    return {
      label: rating.toFixed(1),
      detail: `${formatInteger(reviewsCount)} reviews`,
      hasRealReviews: true,
    };
  }
  return {
    label: placeholderLabel,
    detail: 'No reviews yet',
    hasRealReviews: false,
  };
};

export const getAvailabilityLabel = (product) => {
  if (product?.availability?.label) return product.availability.label;
  if (typeof product?.available === 'boolean') return product.available ? 'Available' : 'Out of stock';
  return 'Check availability';
};

export const getProductAvailability = (product) => {
  const status = product?.availability?.status;
  const available = product?.available ?? status === 'in_stock';
  return {
    available: Boolean(available),
    label: product?.availability?.label || (available ? 'Available' : 'Out of stock'),
  };
};

export const marketplaceNavItems = [
  { label: 'Home', to: '/' },
  { label: 'Stores', to: '/stores' },
  { label: 'Services', to: '/services' },
  { label: 'Foods', to: '/foods' },
  { label: 'Products', to: '/products' },
  { label: 'Deals', to: '/deals' },
  { label: 'New Arrivals', to: '/new-arrivals' },
  { label: 'About & Contact', to: '/about-contact' },
];

const navItems = marketplaceNavItems;

export const buyerNavItems = [
  { label: 'My account', to: '/account', icon: Home },
  { label: 'My orders', to: '/account/orders', icon: Package },
  { label: 'Delivery addresses', to: '/account/addresses', icon: MapPin },
  { label: 'Profile', to: '/account/profile', icon: UserRound },
  { label: 'Wishlist', to: '/account/wishlist', icon: Heart, countKey: 'wishlist' },
  { label: 'Cart', to: '/cart', icon: ShoppingCart, countKey: 'cart' },
  { label: 'Checkout', to: '/checkout', icon: CreditCard },
  { label: 'Track order', to: '/track-order', icon: Truck },
];

const MobileMenuLink = ({ to, href, icon: Icon, label, active = false, badge, onNavigate }) => {
  const className = `flex min-h-11 items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${
    active
      ? 'border-green-700 bg-green-700 text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-green-200 hover:bg-green-50 hover:text-green-800'
  }`;
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${
          active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
        }`}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className={className} onClick={onNavigate}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to} className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
};

export const StorefrontMobileMenu = ({ activePath = '/', onClose }) => {
  const navigate = useNavigate();
  const { cartSummary } = useCart();
  const { customer, isAuthenticated, logout, openShopperAuthModal } = useStorefrontAuth();
  const { count: wishlistCount } = useWishlist();
  const customerAvatarUrl = useMemo(() => getCustomerAvatarUrl(customer), [customer]);
  const customerInitials = useMemo(() => getCustomerInitials(customer), [customer]);
  const cartCount = cartSummary.itemCount ? String(cartSummary.itemCount) : null;
  const wishlistBadge = wishlistCount ? String(wishlistCount) : null;

  const closeMenu = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSignIn = useCallback(() => {
    closeMenu();
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'home',
        returnTo: '/',
      },
    });
  }, [closeMenu, openShopperAuthModal]);

  const handleWishlistClick = useCallback(() => {
    if (isAuthenticated) {
      closeMenu();
      return;
    }

    closeMenu();
    openShopperAuthModal({
      mode: 'signup',
      intent: {
        action: 'wishlist',
        returnTo: '/account/wishlist',
      },
    });
  }, [closeMenu, isAuthenticated, openShopperAuthModal]);

  const handleLogout = useCallback(() => {
    closeMenu();
    logout();
    navigate('/login');
  }, [closeMenu, logout, navigate]);

  const accountLinks = isAuthenticated
    ? [
      { label: 'My account', to: '/account', icon: Home },
      { label: 'My orders', to: '/account/orders', icon: Package },
      { label: 'Wishlist', to: '/account/wishlist', icon: Heart, badge: wishlistBadge },
      { label: 'Delivery addresses', to: '/account/addresses', icon: MapPin },
      { label: 'Profile', to: '/account/profile', icon: UserRound },
    ]
    : [];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-white md:hidden" id="storefront-mobile-menu">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-4 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3" onClick={closeMenu}>
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-green-100 bg-white p-1">
              <img src={sabitoStoreLogo} alt="Sabito Store logo" className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xl font-extrabold tracking-tight text-green-950">{APP_NAME}</span>
              <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">Marketplace</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={closeMenu}
            className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-green-50 hover:text-green-800"
            aria-label="Close storefront menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="grid min-h-[calc(100vh-5rem)] content-start gap-4 px-3 py-4 sm:px-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:rounded-3xl">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-green-200 bg-white text-sm font-black text-green-800">
              {customerAvatarUrl ? (
                <img src={customerAvatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
              ) : customerInitials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{customer?.name || 'Guest shopper'}</p>
              <p className="truncate text-xs text-slate-500">{customer?.email || 'Sign in to manage purchases'}</p>
            </div>
          </div>
        </div>

        <nav className="grid gap-2" aria-label="Mobile marketplace menu">
          {navItems.map((item) => (
            <MobileMenuLink
              key={item.to}
              to={item.to}
              label={item.label}
              active={activePath === item.to}
              onNavigate={closeMenu}
            />
          ))}
        </nav>

        <div className="grid gap-2">
          <p className="px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Quick actions</p>
          <MobileMenuLink to="/track-order" icon={Truck} label="Track order" onNavigate={closeMenu} />
          <MobileMenuLink to="/cart" icon={ShoppingCart} label="Cart" badge={cartCount} onNavigate={closeMenu} />
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={handleWishlistClick}
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-bold text-slate-700 transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-800"
            >
              <Heart className="h-4 w-4 shrink-0" />
              Wishlist
            </button>
          ) : null}
          {isAuthenticated ? (
            accountLinks.map((item) => (
              <MobileMenuLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                badge={item.badge}
                active={activePath === item.to}
                onNavigate={closeMenu}
              />
            ))
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 text-sm font-black text-white transition-colors hover:bg-green-800"
            >
              <User className="h-4 w-4" />
              Sign in/Register
            </button>
          )}
        </div>

        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:rounded-3xl">
          <p className="text-sm font-black text-slate-950">Become a seller</p>
          <p className="text-sm leading-6 text-slate-600">Open a Sabito storefront and manage products from the ABS Dashboard.</p>
          <MobileMenuLink href={dashboardLink('/signup')} icon={Store} label="Open your store" onNavigate={closeMenu} />
        </div>

        {isAuthenticated ? (
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-left text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        ) : null}
      </div>
    </div>
  );
};

export const ActionLink = ({ to, icon: Icon, label, badge, disabled = false, onClick }) => {
  const content = (
    <span className="group flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-[color:var(--store-accent,#166534)]">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white">
        <Icon className="h-4.5 w-4.5" />
        {badge ? (
          // key re-mounts the badge when the count changes so the bump replays.
          <span key={badge} className="sf-bump absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="hidden xl:inline">{label}</span>
    </span>
  );

  if (disabled) return <button type="button" disabled className="opacity-80">{content}</button>;
  if (onClick) return <button type="button" onClick={onClick}>{content}</button>;
  return <Link to={to}>{content}</Link>;
};

export const StoreLogo = ({ store: storeItem, fit = 'contain', className = '' }) => {
  const logoUrl = resolveImageUrl(storeItem?.logoUrl);
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={storeItem.displayName}
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}${className ? ` ${className}` : ''}`}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-100 to-amber-100">
      <Store className="h-7 w-7 text-green-800" />
    </div>
  );
};

export const ProductImage = ({ product, loading = 'lazy' }) => {
  const imageUrl = resolveImageUrl(product?.images?.[0]);
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={product?.title || 'Product'}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-green-50 to-amber-50 text-slate-500">
      <Package className="mb-2 h-10 w-10 text-green-700" />
      <span className="text-xs font-medium">Product image</span>
    </div>
  );
};

export const StorefrontHeader = ({
  activePath = '/',
  compact = false,
  onSearch,
  searchPlaceholder = 'Search for products, stores, brands...',
  defaultCategory = 'all',
  defaultStoreSlug = '',
  showSearchFilterButton = false,
  onSearchFilterClick,
  searchFiltersOpen = false,
  searchFiltersContent = null,
}) => {
  const navigate = useNavigate();
  const { cartSummary } = useCart();
  const { customer, isAuthenticated, logout, openShopperAuthModal } = useStorefrontAuth();
  const { count: wishlistCount } = useWishlist();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(() => searchParams.get('search') || '');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const customerAvatarUrl = useMemo(() => getCustomerAvatarUrl(customer), [customer]);
  const customerInitials = useMemo(() => getCustomerInitials(customer), [customer]);

  useEffect(() => {
    if (onSearch) return;
    setSearchText(searchParams.get('search') || '');
  }, [onSearch, searchParams]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    const search = searchText.trim();
    if (onSearch) {
      onSearch(search);
      return;
    }
    navigate(buildProductsSearchPath({
      search,
      category: searchParams.get('category') || defaultCategory,
      storeSlug: searchParams.get('storeSlug') || defaultStoreSlug,
    }));
  }, [defaultCategory, defaultStoreSlug, navigate, onSearch, searchParams, searchText]);

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    if (onSearch) {
      onSearch('');
      return;
    }

    navigate(buildProductsSearchPath({
      category: defaultCategory,
      storeSlug: searchParams.get('storeSlug') || defaultStoreSlug,
    }));
  }, [defaultCategory, defaultStoreSlug, navigate, onSearch, searchParams]);

  const handleAccountClick = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'home',
        returnTo: '/',
      },
    });
  }, [openShopperAuthModal]);

  const handleWishlistClick = useCallback(() => {
    openShopperAuthModal({
      mode: 'signup',
      intent: {
        action: 'wishlist',
        returnTo: '/account/wishlist',
      },
    });
  }, [openShopperAuthModal]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((current) => !current);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <>
      {!compact ? (
        <div className="hidden bg-green-950 text-white sm:block">
        <div className="flex w-full flex-col gap-2 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 font-medium">
            <Truck className="h-3.5 w-3.5 text-amber-300" />
            Free delivery on eligible marketplace orders
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-green-50/85">
            <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> +233 000 000 000</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> support@sabitostore.com</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Deliver to Ghana</span>
          </div>
        </div>
      </div>
      ) : null}

      <header className="relative z-50 w-full border-b border-slate-200 bg-white">
        <div className={`flex w-full flex-col gap-4 px-3 sm:px-4 ${compact ? 'py-3' : 'py-5'} lg:flex-row lg:items-center`}>
          <div className="flex w-full items-center justify-between gap-3 lg:w-auto">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-green-100 bg-white p-1">
                <img src={sabitoStoreLogo} alt="Sabito Store logo" className="h-full w-full object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xl font-extrabold tracking-tight text-green-950 sm:text-2xl">{APP_NAME}</span>
                <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">Marketplace</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1 md:hidden">
              <ActionLink
                to="/cart"
                icon={ShoppingCart}
                label="Cart"
                badge={cartSummary.itemCount ? String(cartSummary.itemCount) : null}
              />
              <button
                type="button"
                onClick={toggleMobileMenu}
                className="inline-flex h-11 min-h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-green-50 hover:text-green-800"
                aria-label={mobileMenuOpen ? 'Close storefront menu' : 'Open storefront menu'}
                aria-controls="storefront-mobile-menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {!compact ? (
            <div className="flex flex-1 flex-col gap-3">
              <form onSubmit={handleSubmit} className="flex md:grid md:grid-cols-[minmax(0,1fr)_auto] md:gap-1 md:overflow-hidden md:rounded-full md:border md:border-slate-200 md:bg-slate-50 md:p-1.5">
                <div className="relative flex min-w-0 flex-1 items-center rounded-full border border-slate-200 bg-white md:contents md:border-0 md:bg-transparent">
                  {showSearchFilterButton ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute left-1 top-1/2 h-10 min-h-10 w-10 -translate-y-1/2 rounded-full bg-transparent text-slate-500 hover:bg-transparent hover:text-green-800 md:hidden"
                      onClick={onSearchFilterClick}
                      aria-label="Open filters"
                    >
                      <SlidersHorizontal className="h-5 w-5" />
                    </Button>
                  ) : null}
                  <Input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={searchPlaceholder}
                    className={`h-12 min-h-12 min-w-0 flex-1 border-0 bg-transparent px-4 pr-24 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-5 md:pr-5 ${showSearchFilterButton ? 'pl-12' : ''}`}
                  />
                  {searchText ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-12 top-1/2 h-9 min-h-9 w-9 -translate-y-1/2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
                      onClick={handleClearSearch}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button type="submit" size="icon" className="absolute right-1 top-1/2 h-10 min-h-10 w-10 -translate-y-1/2 rounded-full bg-green-700 text-white hover:bg-green-800 md:static md:ml-1 md:h-12 md:min-h-12 md:w-12 md:translate-y-0" aria-label="Search">
                    <Search className="h-5 w-5" />
                  </Button>
                </div>
              </form>
              {searchFiltersOpen && searchFiltersContent ? (
                <div className="md:hidden">
                  {searchFiltersContent}
                </div>
              ) : null}
            </div>
          ) : <div className="hidden flex-1 lg:block" />}

          <div className="hidden w-full flex-wrap items-center justify-between gap-1 md:flex sm:w-auto sm:justify-start">
            {compact ? (
              <Button
                asChild
                variant="outline"
                className="mr-1 h-11 rounded-full border-green-200 px-4 text-sm font-bold text-green-800 hover:bg-green-50"
              >
                <Link to="/stores" className="inline-flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Back to stores
                </Link>
              </Button>
            ) : null}
            {!compact ? <ActionLink to="/track-order" icon={Truck} label="Track Order" /> : null}
            {!compact ? (
              <ActionLink
                to="/account/wishlist"
                icon={Heart}
                label="Wishlist"
                badge={wishlistCount ? String(wishlistCount) : null}
                onClick={isAuthenticated ? undefined : handleWishlistClick}
              />
            ) : null}
            <ActionLink
              to="/cart"
              icon={ShoppingCart}
              label="Cart"
              badge={cartSummary.itemCount ? String(cartSummary.itemCount) : null}
            />
            {isAuthenticated ? (
              <div className="group relative ml-1 max-w-full">
                <Link
                  to="/account"
                  className="inline-flex max-w-full items-center gap-2 rounded-full bg-green-700 px-3 py-3 text-sm font-bold text-white hover:bg-green-800 sm:px-4"
                >
                  <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-green-200 bg-green-50 text-xs font-black text-green-800">
                    {customerAvatarUrl ? (
                      <img src={customerAvatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
                    ) : customerInitials}
                  </span>
                  <span className="max-w-[7rem] truncate sm:max-w-[10rem]">{customer?.name ? `Hi, ${customer.name.split(' ')[0]}` : 'Account'}</span>
                  <ChevronDown className="h-4 w-4" />
                </Link>
                <div className="invisible absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 sm:rounded-3xl">
                  <div className="mb-1 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-green-200 bg-green-50 text-sm font-black text-green-800">
                      {customerAvatarUrl ? (
                        <img src={customerAvatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
                      ) : customerInitials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{customer?.name || 'Shopper'}</p>
                      <p className="truncate text-xs text-slate-500">{customer?.email}</p>
                    </div>
                  </div>
                  {[
                    { label: 'Dashboard', to: '/account' },
                    { label: 'My orders', to: '/account/orders' },
                    { label: 'Wishlist', to: '/account/wishlist' },
                    { label: 'Delivery addresses', to: '/account/addresses' },
                    { label: 'Profile', to: '/account/profile' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="block rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-green-50 hover:text-green-800"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAccountClick}
                className="ml-1 inline-flex items-center gap-2 rounded-full bg-green-700 px-3 py-3 text-sm font-bold text-white hover:bg-green-800 sm:px-4"
              >
                <User className="h-4 w-4" />
                <span className="hidden min-[380px]:inline">Sign in/Register</span>
                <span className="min-[380px]:hidden">Sign in</span>
              </button>
            )}
          </div>
        </div>

        {!compact ? (
          <nav className="hidden border-t border-slate-100 md:block" aria-label="Marketplace menu">
          <div className="flex w-full items-center justify-center gap-2 overflow-x-auto px-3 py-3 text-sm font-semibold text-slate-600 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={`inline-flex min-h-10 shrink-0 items-center border-b-2 px-4 transition-colors hover:text-green-800 ${
                  activePath === item.to ? 'border-green-700 text-green-800' : 'border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        ) : null}
        {mobileMenuOpen ? (
          <StorefrontMobileMenu activePath={activePath} onClose={closeMobileMenu} />
        ) : null}
      </header>
    </>
  );
};

export const StorefrontFooter = () => {
  const handleNewsletterSubmit = useCallback((event) => {
    event.preventDefault();
  }, []);

  return (
    <footer className="mt-6 border-t border-green-900 bg-green-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
        <div>
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white p-1">
              <img src={sabitoStoreLogo} alt="Sabito Store logo" className="h-full w-full object-contain" />
            </span>
            <span className="text-xl font-black">{APP_NAME}</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-green-50/75">A customer marketplace for discovering products from launched Sabito storefronts.</p>
          <div className="mt-5 flex gap-2">
            {['f', 'x', 'ig', 'in'].map((item) => (
              <span key={item} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-xs font-black uppercase text-green-50/80">{item}</span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-black">Customer Service</h3>
          <div className="mt-4 grid gap-2 text-sm text-green-50/70">
            <Link to="/track-order">Track Order</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/deals">Deals</Link>
            <Link to="/checkout">Checkout</Link>
            <Link to="/about-contact">About & Contact</Link>
          </div>
        </div>

        <div>
          <h3 className="font-black">About</h3>
          <div className="mt-4 grid gap-2 text-sm text-green-50/70">
            <Link to="/">Marketplace</Link>
            <Link to="/stores">Stores</Link>
            <Link to="/studios">Studios</Link>
            <Link to="/services">Services</Link>
            <Link to="/foods">Foods</Link>
            <Link to="/products">Products</Link>
            <Link to="/about-contact">About & Contact</Link>
          </div>
        </div>

        <div>
          <h3 className="font-black">Business</h3>
          <div className="mt-4 grid gap-2 text-sm text-green-50/70">
            <a href={dashboardLink('/signup')}>Open Your Store</a>
            <a href={dashboardLink('/login')}>Seller Login</a>
            <a href={dashboardLink('/store/setup')}>Store Setup</a>
            <Link to="/about-contact">Why Sell Here</Link>
          </div>
        </div>

        <div>
          <h3 className="font-black">Newsletter</h3>
          <p className="mt-4 text-sm leading-6 text-green-50/70">Get marketplace updates and new store announcements. Newsletter delivery is coming soon.</p>
          <form onSubmit={handleNewsletterSubmit} className="mt-4 flex overflow-hidden rounded-full border border-white/15 bg-white/10 p-1">
            <Input type="email" placeholder="Email address" className="h-10 min-h-10 border-0 bg-transparent text-white placeholder:text-green-50/55 focus-visible:ring-0 focus-visible:ring-offset-0" />
            <Button type="submit" className="h-10 min-h-10 rounded-full bg-amber-400 px-4 text-green-950 hover:bg-amber-300">
              Join
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {['MoMo', 'Card', 'Bank', 'COD'].map((item) => (
              <span key={item} className="rounded-full border border-white/15 px-3 py-1 text-green-50/75">{item}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-green-50/60 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. Customer marketplace for Sabito sellers.</p>
          <div className="flex flex-wrap gap-4">
            <span>Social links pending</span>
            <span>Payment options pending checkout launch</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export const StoreScopedFooter = ({
  store,
  isServiceStore = false,
  contactHref = '',
  singleStoreMode = false,
  storeBasePath: storeBasePathProp,
  subtitle,
  /** Optional brand primary override (falls back to store.primaryColor / --store-accent). */
  accentColor,
}) => {
  const { isCustomDomain } = useStorefrontMode();
  const storeSlug = store?.slug || '';
  const storeBasePath = storeBasePathProp
    || (isCustomDomain
      ? '/'
      : (storeSlug ? `/stores/${encodeURIComponent(storeSlug)}` : '/stores'));
  const catalogPath = isServiceStore
    ? (storeBasePath === '/' ? '/services' : `${storeBasePath}/services`)
    : (storeBasePath === '/' ? '/products' : `${storeBasePath}/products`);
  const categoriesPath = storeBasePath === '/' ? '/categories' : `${storeBasePath}/categories`;
  const aboutPath = storeBasePath === '/' ? '/about' : `${storeBasePath}/about`;
  const reviewsPath = storeBasePath === '/' ? '/reviews' : `${storeBasePath}/reviews`;
  const listingCount = isServiceStore ? store?.stats?.serviceCount : store?.stats?.productCount;
  const year = new Date().getFullYear();
  const brandSubtitle = subtitle !== undefined
    ? subtitle
    : (singleStoreMode ? '' : 'Official Store');
  const showAbsPromo = Boolean(singleStoreMode && store?.showAbsPromo);
  const storeName = store?.displayName || 'Store';
  /** Owned / single-shop only — marketplace Sabito store pages keep platform green. */
  const useBrandTheme = Boolean(singleStoreMode);
  const brandPrimary = String(accentColor || store?.primaryColor || '').trim();
  const brandStyle = useBrandTheme
    ? {
      ...(brandPrimary
        ? {
          '--store-accent': brandPrimary,
          '--store-accent-soft': `${brandPrimary}22`,
          '--store-accent-hover': `color-mix(in srgb, ${brandPrimary} 85%, black)`,
        }
        : {}),
      backgroundColor: 'color-mix(in srgb, var(--store-accent, #166534) 42%, #0b1220 58%)',
      borderColor: 'color-mix(in srgb, var(--store-accent, #166534) 55%, #0b1220 45%)',
    }
    : undefined;
  const mutedText = useBrandTheme ? 'text-white/70' : 'text-green-50/70';
  const mutedTextSoft = useBrandTheme ? 'text-white/60' : 'text-green-50/60';
  const mutedTextFaint = useBrandTheme ? 'text-white/75' : 'text-green-50/75';
  const subtitleTone = useBrandTheme ? 'text-white/70' : 'text-green-100/70';
  const chipClass = `rounded-full border border-white/15 px-3 py-1 ${mutedTextFaint}`;
  const linkColClass = `mt-4 grid gap-2 text-sm ${mutedText}`;

  return (
    <footer
      className={useBrandTheme
        ? 'mt-6 w-full border-t text-white'
        : 'mt-6 w-full border-t border-green-900 bg-green-950 text-white'}
      style={brandStyle}
    >
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-12 md:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
        <div>
          <Link to={storeBasePath} className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white">
              <StoreLogo store={store} fit="cover" className="scale-110" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xl font-black">{storeName}</span>
              {brandSubtitle ? (
                <span className={`block truncate text-xs font-semibold uppercase tracking-[0.16em] ${subtitleTone}`}>{brandSubtitle}</span>
              ) : null}
            </span>
          </Link>
          <p className={`mt-4 max-w-sm line-clamp-3 text-sm leading-6 ${mutedTextFaint}`}>
            {store?.description || (singleStoreMode
              ? `Browse our ${isServiceStore ? 'services' : 'products'}.`
              : `Browse ${isServiceStore ? 'services' : 'products'} directly from this store.`)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {!singleStoreMode ? (
              <span className={chipClass}>Verified Store</span>
            ) : null}
            <span className={chipClass}>
              {formatInteger(listingCount || 0)} {isServiceStore ? 'services' : 'products'}
            </span>
          </div>
        </div>

        <div>
          <h3 className="font-black">Store</h3>
          <div className={linkColClass}>
            <Link to={storeBasePath}>{singleStoreMode ? 'Home' : 'Store Home'}</Link>
            <Link to={catalogPath}>{isServiceStore ? 'All Services' : 'All Products'}</Link>
            <Link to={categoriesPath}>Categories</Link>
            <Link to={aboutPath}>About Us</Link>
            <Link to={reviewsPath}>Reviews</Link>
          </div>
        </div>

        <div>
          <h3 className="font-black">{singleStoreMode ? 'Your account' : 'Customer Service'}</h3>
          <div className={linkColClass}>
            <Link to="/cart">Cart</Link>
            <Link to="/track-order">Track Order</Link>
            <Link to="/account/orders">My Orders</Link>
            <Link to="/account/wishlist">Wishlist</Link>
            <Link to="/account">Account</Link>
          </div>
        </div>

        <div>
          <h3 className="font-black">Contact</h3>
          <div className={linkColClass}>
            {store?.contactPhone ? <a href={`tel:${store.contactPhone}`}>{store.contactPhone}</a> : null}
            {store?.contactEmail ? <a href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a> : null}
            {contactHref ? (
              <a href={contactHref} target="_blank" rel="noreferrer">
                {singleStoreMode ? 'Contact us' : 'Contact Store'}
              </a>
            ) : null}
            {!store?.contactPhone && !store?.contactEmail && !contactHref ? <span>Contact details not published</span> : null}
          </div>
        </div>

        <div>
          <h3 className="font-black">Checkout</h3>
          <p className={`mt-4 text-sm leading-6 ${mutedText}`}>
            {isServiceStore
              ? 'Request quotes, book services, and manage your service conversations from your account.'
              : 'Shop securely, review your cart, and track store-managed orders from your account.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {['MoMo', 'Card', 'Bank', 'COD'].map((item) => (
              <span key={item} className={chipClass}>{item}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className={`mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-5 text-xs ${mutedTextSoft} sm:flex-row sm:items-center sm:justify-between`}>
          {singleStoreMode ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>&copy; {year} {storeName}.</span>
              <a
                href={ABS_MARKETING_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={useBrandTheme
                  ? 'transition-opacity hover:opacity-100'
                  : 'text-green-50/45 transition-colors hover:text-green-50/75'}
                style={useBrandTheme
                  ? { color: 'color-mix(in srgb, var(--store-accent, #166534) 55%, white)' }
                  : undefined}
              >
                Powered by ABS
              </a>
            </p>
          ) : (
            <p>&copy; {year} {storeName}. Storefront powered by {APP_NAME}.</p>
          )}
          <div className="flex flex-wrap gap-4">
            <span>{store?.deliveryEnabled ? 'Delivery available' : 'Store-managed fulfillment'}</span>
            <span>Secure checkout options</span>
          </div>
        </div>
      </div>
      {showAbsPromo ? (
        <div
          className={useBrandTheme ? 'border-t border-white/10' : 'border-t border-white/10 bg-green-900/80'}
          style={useBrandTheme
            ? { backgroundColor: 'color-mix(in srgb, var(--store-accent, #166534) 32%, #0b1220 68%)' }
            : undefined}
        >
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Free websites for SMEs</p>
              <p className={`mt-0.5 text-xs leading-5 ${mutedText}`}>
                Launch an online store with ABS — get free websites now.
              </p>
            </div>
            <a
              href={ABS_ONLINE_STORE_PROMO_WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className={useBrandTheme
                ? 'inline-flex shrink-0 items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:opacity-90'
                : 'inline-flex shrink-0 items-center justify-center rounded-md border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-green-950 transition-colors hover:bg-green-50'}
              style={useBrandTheme
                ? { backgroundColor: 'var(--store-accent, #166534)' }
                : undefined}
            >
              Get free websites now
            </a>
          </div>
        </div>
      ) : null}
    </footer>
  );
};

export const SectionHeader = ({ eyebrow, title, description, action, variant = 'default' }) => {
  const isInverse = variant === 'inverse';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className={`text-sm font-bold uppercase tracking-[0.18em] ${isInverse ? 'text-amber-300' : 'text-green-700'}`}>{eyebrow}</p>
        <h1 className={`mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl ${isInverse ? 'text-white' : 'text-slate-950'}`}>{title}</h1>
        {description ? (
          <p className={`mt-3 max-w-2xl text-sm leading-6 md:text-base ${isInverse ? 'text-white' : 'text-slate-500'}`}>{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </div>
  );
};

export const StoreCard = ({ store: storeItem }) => {
  const review = getReviewMeta(storeItem, 'New shop');
  const fulfillment = [
    storeItem?.deliveryEnabled ? 'Delivery' : null,
    storeItem?.pickupEnabled ? 'Pickup' : null,
  ].filter(Boolean);
  const location = [storeItem?.city, storeItem?.country].filter(Boolean).join(', ');
  const productCount = Number.parseInt(storeItem?.productCount || 0, 10);
  const bannerUrl = resolveStoreBannerImageUrl(storeItem);

  return (
    <Link
      to={`/stores/${encodeURIComponent(storeItem.slug)}`}
      className="group mx-auto flex h-full w-full max-w-[400px] justify-self-center flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50/30 sm:rounded-3xl"
    >
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-green-900 via-green-800 to-amber-300/80 p-4">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {bannerUrl ? <div className="absolute inset-0 bg-black/15" /> : null}
        <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white">
            <StoreLogo store={storeItem} />
          </div>
          <Badge className="border-0 bg-white/95 text-[11px] font-bold text-green-900 hover:bg-white">
            {productCount > 0 ? `${formatInteger(productCount)} products` : 'Catalog launching'}
          </Badge>
        </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-green-100 bg-green-50 text-[11px] capitalize text-green-800">
            {storeItem.category || 'Online store'}
          </Badge>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
            review.hasRealReviews ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
          >
            <Star className={`h-3.5 w-3.5 ${review.hasRealReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            {review.label}
          </span>
        </div>
        <h3 className="mt-3 truncate text-lg font-black text-slate-950">{storeItem.displayName}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-500">
          {storeItem.description || `Browse products from this ${APP_NAME} seller.`}
        </p>
        <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-slate-400" />
            {review.detail}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-green-700" />
            {fulfillment.length ? fulfillment.join(' and ') : 'Store fulfillment'}
          </span>
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-green-700" />
              {location}
            </span>
          ) : null}
        </div>
        <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-black text-green-800">
          Visit store <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
};

export const ProductCard = ({ product }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { addItem } = useCart();
  const { isWishlisted, pendingListingIds, toggleWishlist } = useWishlist();
  const {
    isSingleStoreMode,
    isMarketplaceMode,
    isCustomDomain,
    storeSlug: modeSlug,
  } = useStorefrontMode();
  const isOwnedShop = isSingleStoreMode || !isMarketplaceMode;
  const resolvedStoreSlug = params.storeSlug || modeSlug || product?.storeSlug || product?.store?.slug;
  const compareAt = Number.parseFloat(product?.compareAtPrice || 0);
  const price = Number.parseFloat(product?.publicPrice || 0);
  const discount = getDiscountPercent(product);
  const currency = product?.store?.currency;
  const productWithStore = product?.store?.slug || product?.storeSlug
    ? product
    : {
      ...product,
      storeSlug: resolvedStoreSlug,
      store: {
        ...(product?.store || {}),
        slug: resolvedStoreSlug,
      },
    };
  const storeForActions = productWithStore?.store || {};
  const productUrl = getProductUrl(productWithStore, {
    pathname: location.pathname,
    isCustomDomain,
  });
  const review = getReviewMeta(product, 'New');
  const availability = getProductAvailability(product);
  const listingId = product?.listingId || product?.id;
  const saved = isWishlisted(listingId);
  const wishlistPending = pendingListingIds.includes(listingId);
  const cardActions = useMemo(
    () => filterProductCardActionsForListing(
      resolveVisibleProductCardActions(
        storeForActions.productCardActions,
        storeForActions,
        { resolvePhone: resolveStoreWhatsAppPhone },
      ),
      product,
    ),
    [product, storeForActions],
  );
  const softenPrice = cardActions.includes('contact_for_price');
  const isSample = product?.isSample === true;
  const commerceBadges = useMemo(() => getListingCommerceBadges(product), [product]);
  const priceDisplay = useMemo(() => getProductPriceDisplay(product), [product]);
  const rentOnly = isRentOnlyListing(product);

  const handleAddToCart = useCallback(() => {
    if (isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    const result = addItem({ product: productWithStore, quantity: 1 });
    if (!result.ok) {
      showError(result.reason === 'sample_product'
        ? 'Sample products cannot be purchased.'
        : 'This product could not be added to your cart.');
      return;
    }
    if (result.replacedStore) {
      showSuccess(isOwnedShop ? 'Cart updated.' : 'Cart updated for this seller. Previous seller items were removed.');
    } else {
      showSuccess('Added to cart.');
    }
  }, [addItem, isOwnedShop, isSample, productWithStore]);

  const handleBuyNow = useCallback(() => {
    if (isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    const result = addItem({ product: productWithStore, quantity: 1 });
    if (!result.ok) {
      showError(result.reason === 'sample_product'
        ? 'Sample products cannot be purchased.'
        : 'This product could not be added to your cart.');
      return;
    }
    navigate('/checkout');
  }, [addItem, isSample, navigate, productWithStore]);

  const handleWishlistClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleWishlist(productWithStore);
  }, [productWithStore, toggleWishlist]);

  const whatsappInterestHref = useMemo(() => (
    buildStoreWhatsAppHref(
      storeForActions,
      whatsappProductInterestMessage(product, storeForActions.displayName, {
        available: availability.available,
      }),
    )
  ), [availability.available, product, storeForActions]);

  const whatsappPriceHref = useMemo(() => (
    buildStoreWhatsAppHref(
      storeForActions,
      whatsappPriceInquiryMessage(product, storeForActions.displayName),
    )
  ), [product, storeForActions]);

  const outlineClassName = 'h-10 min-w-0 rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] px-2 text-xs font-bold text-[color:var(--store-accent,#166534)] hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_45%,white)] hover:bg-[var(--store-accent-soft,#16653422)] hover:text-[color:var(--store-accent,#166534)] sm:px-3 sm:text-sm';
  // hover:bg-* (not opacity) so twMerge drops Button's hover:bg-primary/90 (Sabito green)
  const primaryClassName = 'h-10 min-w-0 rounded-full bg-[var(--store-accent,#166534)] px-2 text-xs font-bold text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] sm:px-3 sm:text-sm';

  const renderAction = (actionId, isPrimary) => {
    const className = isPrimary ? primaryClassName : outlineClassName;
    const variant = isPrimary ? 'default' : 'outline';

    if (actionId === 'view') {
      return (
        <Button key={actionId} type="button" variant={variant} className={className} asChild>
          <Link to={productUrl}>
            <Eye className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
            <span className="truncate">View</span>
          </Link>
        </Button>
      );
    }

    if (actionId === 'add_to_cart') {
      if (isSample) return null;
      return (
        <Button
          key={actionId}
          type="button"
          variant={variant}
          className={className}
          disabled={!availability.available}
          onClick={handleAddToCart}
        >
          <ShoppingCart className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
          <span className="truncate">{availability.available ? 'Add' : 'Out of stock'}</span>
        </Button>
      );
    }

    if (actionId === 'buy_now') {
      if (isSample) return null;
      return (
        <Button
          key={actionId}
          type="button"
          variant={variant}
          className={className}
          disabled={!availability.available}
          onClick={handleBuyNow}
        >
          <ShoppingBag className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
          <span className="truncate">Buy now</span>
        </Button>
      );
    }

    if (actionId === 'contact_for_price' && whatsappPriceHref) {
      return (
        <Button key={actionId} type="button" variant={variant} className={className} asChild>
          <a href={whatsappPriceHref} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
            <span className="truncate">Price</span>
          </a>
        </Button>
      );
    }

    if (actionId === 'whatsapp' && whatsappInterestHref) {
      return (
        <Button key={actionId} type="button" variant={variant} className={className} asChild>
          <a href={whatsappInterestHref} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
            <span className="truncate">WhatsApp</span>
          </a>
        </Button>
      );
    }

    return null;
  };

  return (
    <div className="sf-reveal sf-card group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] sm:rounded-3xl">
      <div className="relative aspect-square overflow-hidden border-b border-slate-100 bg-slate-50">
        <Link to={productUrl} className="block h-full w-full">
          <ProductImage product={product} />
        </Link>
        {discount > 0 ? (
          <Badge className="absolute left-3 top-3 border-0 bg-rose-500 text-white hover:bg-rose-500">-{discount}%</Badge>
        ) : null}
        {isSample ? (
          <Badge className={`absolute left-3 border-0 bg-slate-800 text-white hover:bg-slate-800 ${discount > 0 ? 'top-11' : 'top-3'}`}>
            Sample
          </Badge>
        ) : null}
        <button
          type="button"
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            saved
              ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
              : 'border-white/80 bg-white/90 text-slate-600 hover:bg-[var(--store-accent-soft,#16653422)] hover:text-[color:var(--store-accent,#166534)]'
          }`}
          onClick={handleWishlistClick}
          disabled={wishlistPending}
          aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
          aria-pressed={saved}
        >
          <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">
            {product?.category?.name || 'Featured'}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
            review.hasRealReviews ? 'text-amber-600' : 'text-slate-500'
          }`}
          >
            <Star className={`h-3.5 w-3.5 ${review.hasRealReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            {review.label}
          </span>
        </div>
        <Link
          to={productUrl}
          className="mt-3 line-clamp-2 min-h-[2.75rem] font-bold leading-snug text-slate-950 hover:text-[color:var(--store-accent,#166534)]"
        >
          {product.title}
        </Link>
        {isSample ? (
          <p className="mt-1 text-xs font-medium text-slate-500">Demo product — not for sale</p>
        ) : null}
        {!isOwnedShop ? (
          <p className="mt-1 truncate text-xs text-slate-500">{product?.store?.displayName || `${APP_NAME} seller`}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            {availability.label}
          </Badge>
          {commerceBadges.map((badge) => (
            <Badge
              key={badge}
              variant="outline"
              className="border-[color:color-mix(in_srgb,var(--store-accent,#166534)_25%,#e2e8f0)] bg-[var(--store-accent-soft,#16653422)] text-[11px] text-[color:var(--store-accent,#166534)]"
            >
              {badge}
            </Badge>
          ))}
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            {review.detail}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-2">
          {softenPrice ? (
            <span className="text-lg font-extrabold text-slate-700">Contact for price</span>
          ) : priceDisplay.amount != null ? (
            <>
              <span className="text-lg font-extrabold text-[color:var(--store-accent,#166534)]">
                {formatAmount(priceDisplay.amount, currency)}
                {priceDisplay.suffix ? (
                  <span className="ml-1 text-sm font-bold text-slate-500">{priceDisplay.suffix}</span>
                ) : null}
              </span>
              {priceDisplay.secondaryAmount != null && priceDisplay.secondaryAmount > 0 ? (
                <span className="text-sm font-semibold text-slate-600">
                  or {formatAmount(priceDisplay.secondaryAmount, currency)}{priceDisplay.secondarySuffix}
                  <span className="font-normal text-slate-500"> to rent</span>
                </span>
              ) : null}
              {!rentOnly && compareAt > price ? (
                <span className="text-sm text-slate-400 line-through">{formatAmount(compareAt, currency)}</span>
              ) : null}
            </>
          ) : (
            <span className="text-lg font-extrabold text-slate-700">Price on request</span>
          )}
        </div>
        <div className={`mt-auto grid gap-2 pt-4 ${cardActions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {cardActions.map((actionId, index) => renderAction(actionId, index === cardActions.length - 1))}
        </div>
      </div>
    </div>
  );
};

export const LoadingState = ({ label = 'Loading store data...' }) => (
  <div className="flex min-h-60 items-center justify-center rounded-2xl border border-slate-200 bg-white sm:rounded-[2rem]">
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </span>
  </div>
);

export const EmptyState = ({ title, description, icon: Icon = Sparkles, action }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:rounded-[2rem]">
    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-800">
      <Icon className="h-8 w-8" />
    </span>
    <h2 className="mt-5 text-2xl font-black text-slate-950">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    {action ? <div className="mt-6">{action}</div> : null}
  </div>
);

export const BuyerSidebar = () => {
  const location = useLocation();
  const { cartSummary } = useCart();
  const { customer, isAuthenticated, openShopperAuthModal } = useStorefrontAuth();
  const { isSingleStoreMode } = useStorefrontMode();
  const { count: wishlistCount } = useWishlist();
  const customerAvatarUrl = useMemo(() => getCustomerAvatarUrl(customer), [customer]);
  const customerInitials = useMemo(() => getCustomerInitials(customer), [customer]);
  const emailVerified = customer?.isEmailVerified === true || Boolean(customer?.emailVerifiedAt);

  const badgeCounts = useMemo(() => ({
    cart: cartSummary.itemCount,
    wishlist: wishlistCount,
  }), [cartSummary.itemCount, wishlistCount]);

  const handleSignIn = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'checkout',
        returnTo: `${location.pathname}${location.search || ''}`,
      },
    });
  }, [location.pathname, location.search, openShopperAuthModal]);

  return (
    <aside className="hidden min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 sm:rounded-[2rem] sm:p-4 lg:sticky lg:top-6 lg:flex lg:h-fit lg:max-h-[calc(100vh-3rem)] lg:w-[260px] lg:self-start lg:overflow-y-auto">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:rounded-3xl sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-green-200 bg-white text-sm font-black text-green-800 sm:h-14 sm:w-14 sm:text-base">
            {customerAvatarUrl ? (
              <img src={customerAvatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
            ) : customerInitials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{customer?.name || 'Guest shopper'}</p>
            <p className="truncate text-xs text-slate-500">{customer?.email || 'Sign in to manage purchases'}</p>
          </div>
        </div>
        {isAuthenticated ? (
          <>
            <p className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
              emailVerified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
            >
              <MailCheck className="h-3.5 w-3.5" />
              {emailVerified ? 'Email verified' : 'Verification pending'}
            </p>
          </>
        ) : (
          <button
            type="button"
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-green-700 px-4 text-sm font-black text-white transition-colors hover:bg-green-800"
            onClick={handleSignIn}
          >
            {isSingleStoreMode ? 'Sign in' : 'Sign in/Register'}
          </button>
        )}
      </div>
      <nav className="-mx-1 mt-3 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mt-4 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden" aria-label="Buyer menu">
        {buyerNavItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to || (item.to !== '/account' && location.pathname.startsWith(item.to));
          const count = item.countKey ? badgeCounts[item.countKey] : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`inline-flex min-h-11 max-w-[72vw] shrink-0 snap-start items-center gap-2 rounded-2xl px-3 text-sm font-bold transition-colors sm:gap-3 sm:px-4 lg:max-w-none ${
                active ? 'bg-green-700 text-white' : 'text-slate-700 hover:bg-green-50 hover:text-green-800'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {count ? (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${
                  active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:rounded-3xl lg:mt-auto lg:block">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-200 bg-white text-green-800">
          <Store className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-black text-slate-950">Become a seller</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Open a Sabito storefront and manage products from the ABS Dashboard.
        </p>
        <a
          href={dashboardLink('/signup')}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 text-sm font-black text-white transition-colors hover:bg-green-800"
        >
          Open your store
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
};

export const BuyerLayoutFrame = ({
  children,
  title,
  description,
  className = '',
  contentClassName = '',
}) => {
  const { isAuthenticated } = useStorefrontAuth();

  if (!isAuthenticated) {
    return (
      <div className={`mx-auto w-full max-w-[2440px] ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`grid w-full min-w-0 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] ${className}`}>
      <BuyerSidebar title={title} description={description} />
      <section className={`mx-auto min-w-0 w-full max-w-[2440px] ${contentClassName}`}>
        {children}
      </section>
    </div>
  );
};

export const PageShell = ({
  activePath,
  appMode = false,
  showBuyerSidebar = true,
  hideHeader = false,
  headerProps = {},
  buyerTitle,
  buyerDescription,
  children,
}) => {
  const { isSingleStoreMode, isTemplatesMode } = useStorefrontMode();
  const mainClassName = showBuyerSidebar
    ? 'w-full px-3 py-6 sm:px-4 sm:py-8'
    : 'mx-auto max-w-[2440px] px-3 py-6 sm:px-4 sm:py-8';

  if (isSingleStoreMode || isTemplatesMode) {
    return (
      <OnlineStorePageShell title={buyerTitle} description={buyerDescription}>
        {children}
      </OnlineStorePageShell>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f2] text-slate-900">
      {hideHeader ? null : <StorefrontHeader activePath={activePath} compact={appMode} {...headerProps} />}
      <main className={mainClassName}>
        {showBuyerSidebar ? (
          <BuyerLayoutFrame title={buyerTitle} description={buyerDescription}>
            {children}
          </BuyerLayoutFrame>
        ) : children}
      </main>
      {appMode ? null : <StorefrontFooter />}
    </div>
  );
};

export const StudioCard = ({ studio: studioItem }) => {
  const review = getReviewMeta(studioItem, 'New studio');
  const serviceCount = Number.parseInt(studioItem?.serviceCount || 0, 10);
  const bannerUrl = resolveStoreBannerImageUrl(studioItem);
  const location = [studioItem?.city, studioItem?.country].filter(Boolean).join(', ');

  return (
    <Link
      to={`/studios/${encodeURIComponent(studioItem.slug)}`}
      className="group mx-auto flex h-full w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50/30 sm:rounded-3xl"
    >
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-green-900 via-green-800 to-amber-300/80 p-4">
        {bannerUrl ? <img src={bannerUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {bannerUrl ? <div className="absolute inset-0 bg-black/15" /> : null}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white">
            <StoreLogo store={studioItem} />
          </div>
          <Badge className="border-0 bg-white/95 text-[11px] font-bold text-green-900 hover:bg-white">
            {serviceCount > 0 ? `${formatInteger(serviceCount)} services` : 'Services launching'}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-green-100 bg-green-50 text-[11px] capitalize text-green-800">
            {studioItem.category || 'Studio services'}
          </Badge>
        </div>
        <h3 className="mt-3 truncate text-lg font-black text-slate-950">{studioItem.displayName}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-500">
          {studioItem.description || `Browse services from this ${APP_NAME} studio.`}
        </p>
        <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Star className={`h-3.5 w-3.5 ${review.hasRealReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            {review.detail}
          </span>
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-green-700" />
              {location}
            </span>
          ) : null}
        </div>
        <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-black text-green-800">
          View studio <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
};

export const ServiceCard = ({ service, serviceUrl: serviceUrlOverride }) => {
  const review = getReviewMeta(service, 'New');
  const serviceUrl = serviceUrlOverride || getServiceUrl(service);
  const image = service?.images?.[0];

  return (
    <Link
      to={serviceUrl}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-green-300 sm:rounded-3xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-100 bg-slate-50">
        {image ? (
          <img src={resolveImageUrl(image)} alt={service.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Service preview</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-green-700">{service?.category || 'Service'}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${review.hasRealReviews ? 'text-amber-600' : 'text-slate-500'}`}>
            <Star className={`h-3.5 w-3.5 ${review.hasRealReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            {review.label}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-[2.75rem] font-bold leading-snug text-slate-950 group-hover:text-green-800">
          {service.title}
        </h3>
        <p className="mt-1 truncate text-xs text-slate-500">{service?.studio?.displayName || `${APP_NAME} studio`}</p>
        <div className="mt-4 text-lg font-extrabold text-green-800">{formatServicePrice(service)}</div>
        <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-black text-green-800">
          {service?.ctaType === 'book_service' ? 'Book service' : 'Request quote'}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
};

export const Breadcrumbs = ({ items }) => {
  const { isSingleStoreMode, storeSlug, pathPrefix, isCustomDomain } = useStorefrontMode();
  const homeTo = isSingleStoreMode
    ? (isCustomDomain
      ? '/'
      : (storeSlug
        ? buildStoreHomePath(storeSlug, { ...(pathPrefix ? { prefix: pathPrefix } : {}) })
        : '/'))
    : '/';
  const homeLabel = isSingleStoreMode ? 'Shop' : 'Home';

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
      <Link to={homeTo} className="inline-flex items-center gap-1 hover:text-green-800">
        <Home className="h-4 w-4" />
        {homeLabel}
      </Link>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <ArrowRight className="h-3.5 w-3.5" />
          {item.to ? <Link to={item.to} className="hover:text-green-800">{item.label}</Link> : <span className="font-semibold text-slate-800">{item.label}</span>}
        </span>
      ))}
    </div>
  );
};
