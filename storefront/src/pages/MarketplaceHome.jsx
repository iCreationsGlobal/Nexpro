import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Heart,
  Home,
  Loader2,
  Mail,
  MapPin,
  Menu,
  Package,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';

import { dashboardLink } from '../config';
import { useCart } from '../context/CartContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import {
  BuyerLayoutFrame,
  ServiceCard,
  StorefrontMobileMenu,
  StudioCard,
  marketplaceNavItems,
} from '../components/storefront/StorefrontLayout';
import storeService from '../services/storeService';
import { getCategoryImageUrl, mergeWithDefaultCategories } from '../utils/categoryImages';
import { buildProductsSearchPath } from '../utils/marketplaceSearch';
import { APP_NAME } from '../constants';
import { getCustomerAvatarUrl, getCustomerInitials } from '../utils/avatarUtils';
import { resolveImageUrl, resolveStoreBannerImageUrl } from '../utils/fileUtils';
import { formatAmount, formatInteger } from '../utils/formatNumber';
import { showError, showSuccess } from '../utils/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import sabitoStoreLogo from '../../Sabitostore logo png.png';

const SABITO_DELIVERY_HERO_IMAGE = '/sabito-delivery-hero.png';

const unwrapData = (response) => response?.data?.data || response?.data || response;

const getDiscountPercent = (product) => {
  const compareAt = Number.parseFloat(product?.compareAtPrice || 0);
  const price = Number.parseFloat(product?.publicPrice || 0);
  return compareAt > price && price > 0 ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
};

const serviceHighlights = [
  { label: 'Trade Assurance', description: 'Protected marketplace orders', icon: ShieldCheck },
  { label: 'Verified Shops', description: 'Launched Sabito storefronts', icon: CheckCircle2 },
  { label: 'Secure Payments', description: 'Trusted checkout options', icon: CreditCard },
  { label: 'Delivery Tracking', description: 'Follow order progress', icon: Truck },
  { label: 'Buyer Protection', description: 'Store-managed support', icon: RotateCcw },
];

const fallbackHero = {
  eyebrow: APP_NAME,
  title: 'One Marketplace. Many Stores. Endless Choices.',
  description: `Discover trusted products from launched ${APP_NAME} businesses, compare choices, and shop from one customer-friendly marketplace.`,
};

const navItems = marketplaceNavItems.map((item) => ({
  ...item,
  active: item.to === '/',
}));

const categoryStyles = [
  'from-emerald-50 to-lime-100 text-emerald-900',
  'from-orange-50 to-amber-100 text-orange-900',
  'from-sky-50 to-cyan-100 text-sky-900',
  'from-rose-50 to-pink-100 text-rose-900',
  'from-violet-50 to-purple-100 text-violet-900',
  'from-teal-50 to-emerald-100 text-teal-900',
];

const getProductUrl = (product) => {
  const storeSlug = product?.store?.slug;
  const productSlug = product?.slug || product?.id;
  return storeSlug && productSlug ? `/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}` : '#products';
};

const getReviewMeta = (item, placeholderLabel = 'New') => {
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

const getProductAvailability = (product) => {
  const status = product?.availability?.status;
  const available = product?.available ?? status === 'in_stock';
  return {
    available: Boolean(available),
    label: product?.availability?.label || (available ? 'Available' : 'Out of stock'),
  };
};

const getPublishedTime = (product) => {
  const timestamp = product?.publishedAt ? new Date(product.publishedAt).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const SliderArrow = ({ direction, onClick, disabled, label, variant = 'light' }) => {
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  const tone = variant === 'dark'
    ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:text-white/35'
    : 'border-slate-200 bg-white text-slate-700 hover:border-green-300 hover:text-green-800 disabled:text-slate-300';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed ${tone}`}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};

const ActionLink = ({ to, icon: Icon, label, badge, disabled = false, onClick }) => {
  const content = (
    <span className="group flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-green-800">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white">
        <Icon className="h-4.5 w-4.5" />
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-green-950">
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

const StoreLogo = ({ store: storeItem }) => {
  const logoUrl = resolveImageUrl(storeItem?.logoUrl);
  if (logoUrl) {
    return <img src={logoUrl} alt={storeItem.displayName} className="h-full w-full object-contain p-1.5" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-100 to-amber-100">
      <Store className="h-7 w-7 text-green-800" />
    </div>
  );
};

const ProductImage = ({ product }) => {
  const imageUrl = resolveImageUrl(product?.images?.[0]);
  if (imageUrl) {
    return <img src={imageUrl} alt={product.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-green-50 to-amber-50 text-slate-500">
      <Package className="mb-2 h-10 w-10 text-green-700" />
      <span className="text-xs font-medium">Product image</span>
    </div>
  );
};

const CategoryCard = ({ category: item, index, onSelect }) => {
  const imageUrl = getCategoryImageUrl(item);
  const style = categoryStyles[index % categoryStyles.length];
  const hasCount = Number.parseInt(item.count || 0, 10) > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.name)}
      className="group min-w-[168px] rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50/40 sm:rounded-3xl"
    >
      <div className={`flex aspect-[1.2] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${style}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Package className="h-10 w-10 transition-transform group-hover:scale-110" />
        )}
      </div>
      <span className="mt-4 block truncate text-sm font-bold text-slate-950">{item.name}</span>
      <span className="mt-1 block text-xs text-slate-500">
        {hasCount ? `${formatInteger(item.count)} products` : 'Explore category'}
      </span>
    </button>
  );
};

const StoreCard = ({ store: storeItem }) => {
  const review = getReviewMeta(storeItem, 'New shop');
  const fulfillment = [
    storeItem.deliveryEnabled ? 'Delivery' : null,
    storeItem.pickupEnabled ? 'Pickup' : null,
  ].filter(Boolean);
  const location = [storeItem.city, storeItem.country].filter(Boolean).join(', ');
  const productCount = Number.parseInt(storeItem.productCount || 0, 10);
  const bannerUrl = resolveStoreBannerImageUrl(storeItem);

  return (
    <Link
      to={`/stores/${encodeURIComponent(storeItem.slug)}`}
      className="group mx-auto flex h-full w-full max-w-[400px] justify-self-center flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50/30 sm:rounded-3xl"
    >
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-green-900 via-green-800 to-amber-300/80 p-4">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

const ProductCard = ({ product }) => {
  const { addItem } = useCart();
  const compareAt = Number.parseFloat(product?.compareAtPrice || 0);
  const price = Number.parseFloat(product?.publicPrice || 0);
  const discount = getDiscountPercent(product);
  const currency = product?.store?.currency;
  const productUrl = getProductUrl(product);
  const review = getReviewMeta(product, 'New');
  const availability = getProductAvailability(product);
  const isSample = product?.isSample === true;

  const handleAddToCart = useCallback(() => {
    if (isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    const result = addItem({ product, quantity: 1 });
    if (!result.ok) {
      showError(result.reason === 'sample_product'
        ? 'Sample products cannot be purchased.'
        : 'This product could not be added to your cart.');
      return;
    }
    showSuccess(result.replacedStore
      ? 'Cart updated for this seller. Previous seller items were removed.'
      : 'Added to cart.');
  }, [addItem, isSample, product]);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-green-300 sm:rounded-3xl">
      <Link to={productUrl} className="relative block aspect-square overflow-hidden border-b border-slate-100 bg-slate-50">
        <ProductImage product={product} />
        {discount > 0 ? (
          <Badge className="absolute left-3 top-3 border-0 bg-rose-500 text-white hover:bg-rose-500">-{discount}%</Badge>
        ) : null}
        {isSample ? (
          <Badge className={`absolute left-3 border-0 bg-slate-800 text-white hover:bg-slate-800 ${discount > 0 ? 'top-11' : 'top-3'}`}>
            Sample
          </Badge>
        ) : null}
        <span
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-600"
          aria-hidden="true"
        >
          <Heart className="h-4 w-4" />
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-green-700">{product?.category?.name || 'Featured'}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
            review.hasRealReviews ? 'text-amber-600' : 'text-slate-500'
          }`}
          >
            <Star className={`h-3.5 w-3.5 ${review.hasRealReviews ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
            {review.label}
          </span>
        </div>
        <Link to={productUrl} className="mt-3 line-clamp-2 min-h-[2.75rem] font-bold leading-snug text-slate-950 hover:text-green-800">
          {product.title}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">{product?.store?.displayName || `${APP_NAME} seller`}</p>
        {isSample ? (
          <p className="mt-1 text-xs font-medium text-slate-500">Demo product — not for sale</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            {availability.label}
          </Badge>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            {review.detail}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-extrabold text-green-800">{formatAmount(price, currency)}</span>
          {compareAt > price ? <span className="text-sm text-slate-400 line-through">{formatAmount(compareAt, currency)}</span> : null}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Button type="button" variant="outline" className="h-10 min-w-0 rounded-full border-green-200 px-2 text-xs font-bold text-green-800 hover:bg-green-50 sm:px-3 sm:text-sm" asChild>
            <Link to={productUrl}>
              <span className="truncate">View</span>
            </Link>
          </Button>
          {isSample ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-0 rounded-full border-slate-200 px-2 text-xs font-bold text-slate-500 sm:px-3 sm:text-sm"
              disabled
            >
              Sample
            </Button>
          ) : (
            <Button
              type="button"
              className="h-10 min-w-0 rounded-full bg-green-700 px-2 text-xs font-bold text-white hover:bg-green-800 sm:px-3 sm:text-sm"
              disabled={!availability.available}
              onClick={handleAddToCart}
            >
              <ShoppingCart className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
              <span className="truncate">{availability.available ? 'Add' : 'Out of stock'}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ eyebrow, title, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-green-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">{title}</h2>
    </div>
    {action}
  </div>
);

const HorizontalCarousel = ({ children, className = '', controlsLabel = 'carousel' }) => {
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({ canScrollPrevious: false, canScrollNext: false, hasOverflow: false });

  const updateScrollState = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    const hasOverflow = node.scrollWidth > node.clientWidth + 2;
    setScrollState({
      canScrollPrevious: hasOverflow && node.scrollLeft > 2,
      canScrollNext: hasOverflow && node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
      hasOverflow,
    });
  }, []);

  const scrollByPage = useCallback((direction) => {
    const node = scrollRef.current;
    if (!node) return;
    const amount = Math.max(node.clientWidth * 0.82, 260);
    node.scrollBy({ left: direction === 'next' ? amount : -amount, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    updateScrollState();
    node.addEventListener('scroll', updateScrollState, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    resizeObserver?.observe(node);

    return () => {
      node.removeEventListener('scroll', updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [children, updateScrollState]);

  return (
    <div className="mt-8">
      {scrollState.hasOverflow ? (
        <div className="mb-4 flex justify-end gap-2">
          <SliderArrow
            direction="previous"
            onClick={() => scrollByPage('previous')}
            disabled={!scrollState.canScrollPrevious}
            label={`Previous ${controlsLabel}`}
          />
          <SliderArrow
            direction="next"
            onClick={() => scrollByPage('next')}
            disabled={!scrollState.canScrollNext}
            label={`Next ${controlsLabel}`}
          />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className={`flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

const MarketplaceHome = () => {
  const navigate = useNavigate();
  const { cartSummary } = useCart();
  const { customer, isAuthenticated, openShopperAuthModal } = useStorefrontAuth();
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState('all');
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const customerAvatarUrl = useMemo(() => getCustomerAvatarUrl(customer), [customer]);
  const customerInitials = useMemo(() => getCustomerInitials(customer), [customer]);

  const homeQuery = useQuery({
    queryKey: ['marketplace', 'home'],
    queryFn: () => storeService.getMarketplaceHome(),
    retry: false,
  });

  const home = useMemo(() => unwrapData(homeQuery.data) || {}, [homeQuery.data]);
  const hasApiCategories = Array.isArray(home.categories) && home.categories.length > 0;
  const categories = useMemo(() => (
    mergeWithDefaultCategories(hasApiCategories ? home.categories : [])
  ), [hasApiCategories, home.categories]);
  const popularStores = useMemo(() => Array.isArray(home.popularStores) ? home.popularStores : [], [home.popularStores]);
  const popularStudios = useMemo(() => Array.isArray(home.popularStudios) ? home.popularStudios : [], [home.popularStudios]);
  const featuredServices = useMemo(() => Array.isArray(home.featuredServices) ? home.featuredServices : [], [home.featuredServices]);
  const featuredProducts = useMemo(() => (
    Array.isArray(home.featuredProducts) ? home.featuredProducts : []
  ), [home.featuredProducts]);
  const discountedProducts = useMemo(() => (
    featuredProducts.filter((product) => getDiscountPercent(product) > 0)
  ), [featuredProducts]);
  const newArrivalProducts = useMemo(() => (
    featuredProducts
      .filter((product) => getPublishedTime(product) > 0)
      .sort((first, second) => getPublishedTime(second) - getPublishedTime(first))
      .slice(0, 8)
  ), [featuredProducts]);
  const marketplaceSpotlight = useMemo(() => {
    if (discountedProducts.length) {
      return {
        eyebrow: 'Marketplace Deals',
        title: 'Live offers from Sabito sellers',
        description: '',
        products: discountedProducts,
        tone: 'deal',
      };
    }
    if (newArrivalProducts.length) {
      return {
        eyebrow: 'New Arrivals',
        title: 'Freshly published products',
        description: 'New arrivals are sorted from live product publish dates.',
        products: newArrivalProducts,
        tone: 'new',
      };
    }
    return {
      eyebrow: 'Deals and New Arrivals',
      title: 'Fresh marketplace picks are coming',
      description: 'This section will fill automatically when stores publish discounted products or dated product launches.',
      products: [],
      tone: 'empty',
    };
  }, [discountedProducts, newArrivalProducts]);
  const bestDiscount = useMemo(() => (
    discountedProducts.reduce((highest, product) => Math.max(highest, getDiscountPercent(product)), 0)
  ), [discountedProducts]);

  const handleSearch = useCallback((event) => {
    event.preventDefault();
    navigate(buildProductsSearchPath({ search: searchText, category }));
  }, [category, navigate, searchText]);

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    setCategory('all');
  }, []);

  const handleCategoryClick = useCallback((name) => {
    navigate(buildProductsSearchPath({ category: name }));
  }, [navigate]);

  const handleNewsletterSubmit = useCallback((event) => {
    event.preventDefault();
  }, []);

  const handleAccountClick = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'home',
        returnTo: '/',
      },
    });
  }, [openShopperAuthModal]);

  const hero = home.hero || {};
  const heroSlides = useMemo(() => [
    {
      eyebrow: hero.eyebrow || fallbackHero.eyebrow,
      title: hero.title || fallbackHero.title,
      description: hero.description || fallbackHero.description,
      primaryLabel: 'Shop Now',
      primaryHref: '/products',
      secondaryLabel: 'Explore Stores',
      secondaryHref: '/stores',
      cardTitle: 'Daily marketplace picks',
      cardDescription: 'Fresh finds from Sabito sellers',
      highlightPrefix: bestDiscount > 0 ? 'Save up to' : 'Browse',
      highlightValue: bestDiscount > 0 ? `${bestDiscount}%` : 'Fresh',
      highlightText: bestDiscount > 0 ? 'on selected deals' : 'product picks',
      icon: ShoppingBag,
      imageSrc: SABITO_DELIVERY_HERO_IMAGE,
      imageAlt: 'Sabito Store delivery rider bringing marketplace orders to customers',
    },
    {
      eyebrow: APP_NAME,
      title: 'Your Money Is Protected. Until You Receive Your Order.',
      description: 'Pay securely through Sabito. Funds are only released to the seller after delivery confirmation.',
      primaryLabel: 'Start Shopping',
      primaryHref: '/products',
      secondaryLabel: 'How It Works',
      secondaryHref: '/about-contact',
      cardTitle: 'Trade Assurance',
      cardDescription: 'We hold your payment safely until you confirm your order is perfect.',
      highlightPrefix: 'Shop With Confidence',
      highlightValue: 'Secure',
      highlightText: "payments. Verified stores. You're in safe hands.",
      icon: ShieldCheck,
    },
    {
      eyebrow: bestDiscount > 0 ? 'Marketplace Deals' : 'New Arrivals',
      title: bestDiscount > 0 ? 'Real offers from Sabito sellers.' : 'Fresh product picks as stores publish.',
      description: bestDiscount > 0
        ? 'Discounted products are highlighted from live storefront listings, so customers can move quickly on current offers.'
        : 'Featured products update from published storefront listings without filling the marketplace with fake items.',
      primaryLabel: bestDiscount > 0 ? 'View Deals' : 'View Products',
      primaryHref: discountedProducts.length ? '/deals' : newArrivalProducts.length ? '/new-arrivals' : '/products',
      secondaryLabel: 'Open a Store',
      secondaryHref: dashboardLink('/signup'),
      cardTitle: bestDiscount > 0 ? 'Selected deals' : 'Product discovery',
      cardDescription: bestDiscount > 0 ? 'Discounted live listings' : 'API-backed product picks',
      highlightPrefix: bestDiscount > 0 ? 'Save up to' : 'Featured',
      highlightValue: bestDiscount > 0 ? `${bestDiscount}%` : featuredProducts.length ? formatInteger(featuredProducts.length) : 'Soon',
      highlightText: bestDiscount > 0 ? 'on selected products' : 'product picks',
      icon: Sparkles,
    },
  ], [bestDiscount, discountedProducts.length, featuredProducts.length, hero.description, hero.eyebrow, hero.title, newArrivalProducts.length]);

  useEffect(() => {
    if (activeHeroSlide >= heroSlides.length) setActiveHeroSlide(0);
  }, [activeHeroSlide, heroSlides.length]);

  const showPreviousHeroSlide = useCallback(() => {
    setActiveHeroSlide((current) => (current === 0 ? heroSlides.length - 1 : current - 1));
  }, [heroSlides.length]);

  const showNextHeroSlide = useCallback(() => {
    setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
  }, [heroSlides.length]);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((current) => !current);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const activeHero = heroSlides[activeHeroSlide] || heroSlides[0];
  const ActiveHeroIcon = activeHero.icon;
  const marketplaceStats = useMemo(() => [
    { label: 'Stores', value: popularStores.length ? formatInteger(popularStores.length) : 'Launching', icon: Store },
    { label: 'Products', value: featuredProducts.length ? formatInteger(featuredProducts.length) : 'Coming soon', icon: Package },
    { label: 'Categories', value: hasApiCategories ? formatInteger(categories.length) : 'Curated', icon: Home },
  ], [categories.length, featuredProducts.length, hasApiCategories, popularStores.length]);
  const isLoading = homeQuery.isLoading;

  return (
    <div className="min-h-screen bg-[#f4f7f2] text-slate-900">
      <div className="hidden bg-green-950 text-white sm:block">
      <div className="flex w-full flex-col gap-2 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="inline-flex items-center gap-2 font-medium">
            <Truck className="h-3.5 w-3.5 text-amber-300" />
            Free delivery on eligible marketplace orders
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-green-50/85">
            <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> +233 000 000 000</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> support@sabitostore.com</span>
            <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-white">
              <MapPin className="h-3.5 w-3.5" /> Deliver to Ghana <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <header className="w-full border-b border-slate-200 bg-white">
        <div className="flex w-full flex-col gap-4 px-3 py-5 sm:px-4 lg:flex-row lg:items-center">
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
                className="inline-flex h-11 min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 transition-colors hover:bg-green-50 hover:text-green-800"
                aria-label={mobileMenuOpen ? 'Close storefront menu' : 'Open storefront menu'}
                aria-controls="storefront-mobile-menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="h-5 w-5" />
                <span>Menu</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex flex-1 flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_190px_auto] md:gap-1 md:overflow-hidden md:rounded-full md:border md:border-slate-200 md:bg-slate-50 md:p-1.5">
            <div className="relative flex min-w-0 items-center rounded-full border border-slate-200 bg-white md:contents md:border-0 md:bg-transparent">
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search for products, stores, brands..."
                className="h-11 min-h-11 min-w-0 flex-1 border-0 bg-transparent px-4 pr-24 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:col-start-1 md:row-start-1 md:h-12 md:min-h-12 md:px-5"
              />
              {searchText ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-11 top-1/2 h-8 min-h-8 w-8 -translate-y-1/2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              <Button type="submit" size="icon" className="absolute right-1 top-1/2 h-9 min-h-9 w-9 -translate-y-1/2 shrink-0 rounded-full bg-green-700 text-white hover:bg-green-800 md:static md:col-start-3 md:row-start-1 md:ml-1 md:h-12 md:min-h-12 md:w-12 md:translate-y-0" aria-label="Search">
                <Search className="h-5 w-5" />
              </Button>
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10 min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-none focus:ring-0 focus:ring-offset-0 md:col-start-2 md:row-start-1 md:h-12 md:min-h-12 md:border-0 md:px-5 md:text-base">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item.id || item.name} value={item.name}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </form>

          <div className="hidden w-full flex-wrap items-center justify-between gap-1 md:flex sm:w-auto sm:justify-start">
            <ActionLink to="/track-order" icon={Truck} label="Track Order" />
            <ActionLink icon={Heart} label="Wishlist" badge="0" disabled />
            <ActionLink
              to="/cart"
              icon={ShoppingCart}
              label="Cart"
              badge={cartSummary.itemCount ? String(cartSummary.itemCount) : null}
            />
            {isAuthenticated ? (
              <Link
                to="/account"
                className="ml-1 inline-flex max-w-full items-center gap-2 rounded-full bg-green-700 px-3 py-3 text-sm font-bold text-white hover:bg-green-800 sm:px-4"
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-green-200 bg-green-50 text-xs font-black text-green-800">
                  {customerAvatarUrl ? (
                    <img src={customerAvatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
                  ) : customerInitials}
                </span>
                <span className="max-w-[7rem] truncate sm:max-w-[10rem]">{customer?.name ? `Hi, ${customer.name.split(' ')[0]}` : 'Account'}</span>
              </Link>
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

        <nav className="hidden border-t border-slate-100 md:block" aria-label="Marketplace menu">
          <div className="flex w-full items-center justify-center gap-2 overflow-x-auto px-3 py-3 text-sm font-semibold text-slate-600 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={`inline-flex min-h-10 shrink-0 items-center border-b-2 px-4 transition-colors hover:text-green-800 ${
                  item.active ? 'border-green-700 text-green-800' : 'border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        {mobileMenuOpen ? (
          <StorefrontMobileMenu activePath="/" onClose={closeMobileMenu} />
        ) : null}
      </header>

      <main id="home" className="py-4 sm:py-6">
        <BuyerLayoutFrame className="w-full px-3 sm:px-4" contentClassName="overflow-hidden">
        <section className="relative isolate h-[760px] overflow-hidden bg-green-950 text-white sm:h-[700px] md:h-[660px] lg:h-[540px] xl:h-[520px]">
          <div className="relative grid h-full w-full content-center gap-6 px-4 py-6 sm:px-6 md:py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1fr)] lg:items-center lg:px-10 xl:px-14">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_78%_18%,rgba(250,204,21,0.22),transparent_30%),radial-gradient(circle_at_86%_88%,rgba(34,197,94,0.25),transparent_34%)]" />
            <div className="relative z-20">
              <Badge className="mb-5 border border-white/15 bg-white/10 text-white hover:bg-white/10">{activeHero.eyebrow}</Badge>
              <h1 className="line-clamp-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                {activeHero.title}
              </h1>
              <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-7 text-green-50/80 sm:text-base md:text-lg md:leading-8">
                {activeHero.description}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="rounded-full bg-amber-400 px-7 font-extrabold text-green-950 hover:bg-amber-300" asChild>
                  {activeHero.primaryHref.startsWith('http') || activeHero.primaryHref.startsWith('/') === false ? (
                    <a href={activeHero.primaryHref}>{activeHero.primaryLabel}</a>
                  ) : (
                    <Link to={activeHero.primaryHref}>{activeHero.primaryLabel}</Link>
                  )}
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-white/30 bg-white/10 px-7 font-extrabold text-white hover:bg-white hover:text-green-950" asChild>
                  {activeHero.secondaryHref.startsWith('http') || activeHero.secondaryHref.startsWith('/') === false ? (
                    <a href={activeHero.secondaryHref}>{activeHero.secondaryLabel}</a>
                  ) : (
                    <Link to={activeHero.secondaryHref}>{activeHero.secondaryLabel}</Link>
                  )}
                </Button>
              </div>
              <div className="mt-6 flex items-center gap-4">
                <SliderArrow direction="previous" onClick={showPreviousHeroSlide} label="Previous promotion" variant="dark" />
                <SliderArrow direction="next" onClick={showNextHeroSlide} label="Next promotion" variant="dark" />
                <div className="flex items-center gap-2">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.eyebrow}
                      type="button"
                      onClick={() => setActiveHeroSlide(index)}
                      className={`h-2 rounded-full transition-all ${index === activeHeroSlide ? 'w-8 bg-amber-400' : 'w-2 bg-white/35 hover:bg-white/60'}`}
                      aria-label={`Show ${slide.eyebrow} slide`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={activeHero.imageSrc ? 'pointer-events-none absolute inset-y-0 right-0 z-0 w-full overflow-hidden lg:left-1/2 lg:w-auto' : 'relative z-10 min-h-[240px] sm:min-h-[280px] lg:min-h-[330px]'}>
              {activeHero.imageSrc ? (
                <>
                  <img
                    src={activeHero.imageSrc}
                    alt={activeHero.imageAlt}
                    className="absolute inset-0 h-full w-full object-cover object-center lg:object-right"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-green-950 via-green-950/90 to-green-950/10 lg:from-green-950 lg:via-green-950/70 lg:to-transparent" />
                  <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-green-950/45 to-transparent" />
                </>
              ) : (
                <div className="relative ml-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur sm:gap-4 sm:rounded-[2rem] sm:p-5">
                  <div className="absolute right-8 top-4 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl" />
                  <div className="absolute bottom-6 left-2 h-56 w-56 rounded-full bg-green-400/20 blur-3xl" />
                  <div className="grid grid-cols-[1fr_0.8fr] gap-3 sm:gap-4">
                    <div className="rounded-2xl bg-white p-4 text-green-950 sm:rounded-[1.5rem] sm:p-5">
                      <div className="flex h-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-green-100 sm:h-24">
                        <ActiveHeroIcon className="h-10 w-10 text-green-800 sm:h-12 sm:w-12" />
                      </div>
                      <p className="mt-4 text-sm font-bold">{activeHero.cardTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">{activeHero.cardDescription}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-400 p-4 text-green-950 sm:rounded-[1.5rem] sm:p-5">
                      <p className="text-xs font-bold uppercase tracking-wide">{activeHero.highlightPrefix}</p>
                      <p className="mt-2 text-3xl font-black sm:text-5xl">{activeHero.highlightValue}</p>
                      <p className="mt-2 text-sm font-semibold">{activeHero.highlightText}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {marketplaceStats.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 p-3 sm:p-4">
                          <Icon className="h-5 w-5 text-amber-300" />
                          <p className="mt-2 text-base font-black leading-tight sm:mt-3 sm:text-2xl">{item.value}</p>
                          <p className="text-xs text-green-50/75">{item.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="relative z-20 w-full px-4">
          <section className="-mt-5 mx-auto max-w-[1440px] rounded-2xl border border-slate-200 bg-white px-3 py-5 sm:rounded-[1.75rem] sm:px-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {serviceHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-800">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-950">{item.label}</span>
                      <span className="block text-xs text-slate-500">{item.description}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="categories" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
          <SectionHeader
            eyebrow="Top Categories"
            title={`Browse what ${APP_NAME} sellers offer`}
            action={<Link to="/products" className="text-sm font-bold text-green-800 hover:text-green-900">View all categories</Link>}
          />
          <HorizontalCarousel controlsLabel="categories">
            {categories.map((item, index) => (
              <CategoryCard key={item.id || item.name} category={item} index={index} onSelect={handleCategoryClick} />
            ))}
          </HorizontalCarousel>
        </section>

          <section id="stores" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
          <SectionHeader
            eyebrow="Popular Stores"
            title="Shop from trusted storefronts"
            action={<Link to="/stores" className="text-sm font-bold text-green-800 hover:text-green-900">View all stores</Link>}
          />
          {isLoading ? (
            <div className="mt-10 flex min-h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : popularStores.length ? (
            <HorizontalCarousel controlsLabel="stores">
              {popularStores.map((storeItem) => (
                <div key={storeItem.id || storeItem.slug} className="min-w-[82vw] sm:min-w-[280px] md:min-w-[360px] xl:min-w-[400px]">
                  <StoreCard store={storeItem} />
                </div>
              ))}
            </HorizontalCarousel>
          ) : (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 sm:rounded-3xl">
              No launched stores with published products yet.
            </div>
          )}
        </section>

          <section id="studios" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
          <SectionHeader
            eyebrow="Popular Studios"
            title="Book services from trusted studios"
            action={<Link to="/studios" className="text-sm font-bold text-green-800 hover:text-green-900">View all studios</Link>}
          />
          {isLoading ? (
            <div className="mt-10 flex min-h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : popularStudios.length ? (
            <HorizontalCarousel controlsLabel="studios">
              {popularStudios.map((studioItem) => (
                <div key={studioItem.id || studioItem.slug} className="min-w-[82vw] sm:min-w-[280px] md:min-w-[360px] xl:min-w-[400px]">
                  <StudioCard studio={studioItem} />
                </div>
              ))}
            </HorizontalCarousel>
          ) : (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 sm:rounded-3xl">
              No launched studios with published services yet.
            </div>
          )}
        </section>

          {featuredServices.length ? (
            <section id="services" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
              <SectionHeader
                eyebrow="Featured Services"
                title="Request quotes and book studio services"
                action={<Link to="/services" className="text-sm font-bold text-green-800 hover:text-green-900">View all services</Link>}
              />
              <HorizontalCarousel controlsLabel="services">
                {featuredServices.map((service) => (
                  <div key={service.id} className="min-w-0 flex-1 shrink-0 basis-full sm:max-w-[290px] sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)] xl:basis-[calc((100%-3rem)/4)]">
                    <ServiceCard service={service} />
                  </div>
                ))}
              </HorizontalCarousel>
            </section>
          ) : null}

          <section
            id="deals"
            className={`mt-6 rounded-2xl border p-5 sm:rounded-[2rem] md:p-8 ${
              marketplaceSpotlight.tone === 'deal'
                ? 'border-amber-200 bg-amber-50'
                : marketplaceSpotlight.tone === 'new'
                  ? 'border-green-200 bg-green-50'
                  : 'border-slate-200 bg-white'
            }`}
          >
            <SectionHeader
              eyebrow={marketplaceSpotlight.eyebrow}
              title={marketplaceSpotlight.title}
              action={<p className="max-w-sm text-sm text-slate-500">{marketplaceSpotlight.description}</p>}
            />
            {marketplaceSpotlight.products.length ? (
              <HorizontalCarousel controlsLabel={marketplaceSpotlight.tone === 'deal' ? 'deals' : 'new arrivals'}>
                {marketplaceSpotlight.products.map((product) => (
                  <div key={product.id} className="min-w-0 flex-1 shrink-0 basis-full sm:max-w-[290px] sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)] xl:basis-[calc((100%-3rem)/4)]">
                    <ProductCard product={product} />
                  </div>
                ))}
              </HorizontalCarousel>
            ) : (
              <div className="mt-8 grid gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:rounded-3xl">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-green-800">
                  <Sparkles className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-black text-slate-950">No live deals yet</p>
                  <p className="mt-1 text-sm text-slate-500">Discounts and new arrivals will appear here from API-backed product data.</p>
                </div>
                <Button variant="outline" className="rounded-full border-green-200 text-green-800 hover:bg-green-50" asChild>
                  <Link to="/products">Browse products</Link>
                </Button>
              </div>
            )}
          </section>

          <section id="products" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
          <SectionHeader
            eyebrow="Featured Products"
            title="Curated picks from live storefronts"
          />
          {isLoading ? (
            <div className="mt-10 flex min-h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : featuredProducts.length ? (
            <HorizontalCarousel controlsLabel="products">
              {featuredProducts.map((product) => (
                  <div key={product.id} className="min-w-0 flex-1 shrink-0 basis-full sm:max-w-[290px] sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)] xl:basis-[calc((100%-3rem)/4)]">
                  <ProductCard product={product} />
                </div>
              ))}
            </HorizontalCarousel>
          ) : (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 sm:rounded-3xl">
              Featured products will appear as launched stores publish their catalogs.
            </div>
          )}
        </section>

          <section id="about" className="mt-6 overflow-hidden rounded-2xl border border-green-900/10 bg-green-900 text-white sm:rounded-[2rem]">
          <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[360px_minmax(0,1fr)_auto] lg:items-center">
            <div className="relative min-h-56 rounded-2xl bg-white/10 p-5 sm:rounded-[1.75rem]">
              <div className="absolute left-8 top-8 h-28 w-28 rounded-full bg-amber-300/40" />
              <div className="absolute bottom-8 right-10 h-24 w-24 rounded-full bg-green-300/30" />
              <div className="relative mx-auto mt-5 max-w-56 rounded-2xl bg-white p-4 text-green-950 sm:rounded-[1.5rem]">
                <Store className="h-9 w-9 text-green-800" />
                <p className="mt-4 text-lg font-black">Open your Sabito store</p>
                <p className="mt-1 text-xs text-slate-500">Launch a public catalog from the dashboard.</p>
                <div className="mt-4 grid gap-2 text-xs font-bold text-green-800">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Branded storefront</span>
                  <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Product publishing</span>
                  <span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Customer discovery</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">For Businesses</p>
              <h2 className="mt-3 text-3xl font-black md:text-5xl">Are you a business?</h2>
              <p className="mt-4 max-w-2xl leading-7 text-green-50/80">Launch a {APP_NAME} storefront, reach new customers, and manage your public catalog from the ABS Dashboard.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Launch quickly', icon: Zap },
                  { label: 'Publish products', icon: Package },
                  { label: 'Reach buyers', icon: CheckCircle2 },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <span key={item.label} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">
                      <Icon className="h-4 w-4 text-amber-300" /> {item.label}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3">
              <Button size="lg" className="rounded-full bg-amber-400 px-8 font-black text-green-950 hover:bg-amber-300" asChild>
                <a href={dashboardLink('/signup')}>Open Your Store</a>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-white/25 bg-white/10 px-8 font-black text-white hover:bg-white hover:text-green-950" asChild>
                <a href={dashboardLink('/store/setup')}>Manage Store</a>
              </Button>
            </div>
          </div>
          </section>
        </div>
        </BuyerLayoutFrame>
      </main>

      <footer id="contact" className="mt-6 border-t border-green-900 bg-green-950 text-white">
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
    </div>
  );
};

export default MarketplaceHome;
