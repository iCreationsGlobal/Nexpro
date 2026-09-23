import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  Menu,
  MessageCircle,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  User,
  X,
} from 'lucide-react';

import storeService from '../services/storeService';
import { useCart } from '../context/CartContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { persistOnlineStoreBrand, useStorefrontMode } from '../context/StorefrontModeContext';
import { useWishlist } from '../context/WishlistContext';
import { buildProductsSearchPath } from '../utils/marketplaceSearch';
import {
  buildStoreCatalogPath,
  resolveSingleStoreHomePath,
} from '../online-store/storePaths';
import { showSuccess } from '../utils/toast';
import {
  ActionLink,
  ProductImage,
  StoreLogo,
  StoreScopedFooter,
  getDiscountPercent,
} from '../components/storefront/StorefrontLayout';
import {
  ReviewList,
  ReviewSummaryLine,
  VerifiedReviewForm,
} from '../components/storefront/VerifiedReviewSection';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount } from '../utils/formatNumber';
import { showError } from '../utils/toast';
import {
  buildStoreWhatsAppHref,
  resolveStoreWhatsAppPhone,
  whatsappPriceInquiryMessage,
  whatsappProductInterestMessage,
} from '../utils/whatsapp';
import { resolveVisibleProductCardActions } from '../utils/productCardActions';
import {
  filterProductCardActionsForListing,
  getListingCommerceBadges,
  getProductPriceDisplay,
  isRentableListing,
  isRentOnlyListing,
} from '../utils/productListingDisplay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TemplateThemeProvider, { getTemplateTheme, resolveStoreBrandColors } from '../templates/TemplateThemeProvider';

const unwrapData = (response) => response?.data?.data || response?.data || response;

const getRentalDayCount = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

const getTodayDateInputValue = () => new Date().toISOString().slice(0, 10);

const validateRentalBookingForm = (values) => {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Your name is required';
  if (!values.phone.trim()) errors.phone = 'Phone number is required';
  if (!values.startDate) errors.startDate = 'Start date is required';
  if (!values.endDate) errors.endDate = 'End date is required';
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after start date';
  }
  if (values.startDate && values.startDate < getTodayDateInputValue()) {
    errors.startDate = 'Start date cannot be in the past';
  }
  const quantity = Number.parseInt(values.quantity, 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    errors.quantity = 'Quantity must be at least 1';
  }
  return errors;
};

const StoreScopedHeader = ({
  store,
  product,
  onSearch,
  homeTo,
  subtitle = '',
  ownedShop = false,
  navItems = null,
  activePage = '',
}) => {
  const [searchText, setSearchText] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { cartSummary } = useCart();
  const { isAuthenticated, openShopperAuthModal } = useStorefrontAuth();
  const cartCount = cartSummary.itemCount ? String(cartSummary.itemCount) : null;
  const showPageNav = ownedShop && Array.isArray(navItems) && navItems.length > 0;

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    onSearch(searchText.trim());
  }, [onSearch, searchText]);

  const handleSignIn = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'store',
        returnTo: `${window.location.pathname}${window.location.search || ''}`,
      },
    });
  }, [openShopperAuthModal]);

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

  const storeHome = homeTo || `/stores/${encodeURIComponent(store.slug)}`;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3 lg:contents">
          <Link to={storeHome} className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <StoreLogo store={store} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black text-slate-950 sm:text-xl">{store.displayName}</span>
              {subtitle ? (
                <span className="block truncate text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--store-accent,#166534)]">{subtitle}</span>
              ) : null}
            </span>
          </Link>
          {showPageNav ? (
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-slate-50 lg:hidden"
              aria-label={mobileMenuOpen ? 'Close store menu' : 'Open store menu'}
              aria-controls="store-product-mobile-menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-1">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={`Search ${store.displayName}`}
            className="h-11 min-h-11 border-0 bg-transparent px-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button type="submit" size="icon" className="h-11 min-h-11 w-11 shrink-0 rounded-full bg-[var(--store-accent,#166534)] hover:bg-[var(--store-accent-hover,#14532d)]" aria-label={`Search ${store.displayName}`}>
            <Search className="h-5 w-5" />
          </Button>
        </form>

        {showPageNav ? (
          <nav className="hidden shrink-0 items-center gap-4 xl:gap-5 lg:flex" aria-label="Store pages">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={`whitespace-nowrap text-sm font-semibold transition-colors ${
                  activePage === item.key ? 'text-[color:var(--store-accent,#166534)]' : 'text-slate-600 hover:text-[color:var(--store-accent,#166534)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex shrink-0 gap-2">
          <ActionLink to="/cart" icon={ShoppingCart} label="Cart" badge={cartCount} />
          {isAuthenticated ? (
            <Button className="rounded-full bg-[var(--store-accent,#166534)] hover:bg-[var(--store-accent-hover,#14532d)]" asChild>
              <Link to="/account">
                <User className="mr-2 h-4 w-4" />
                Account
              </Link>
            </Button>
          ) : (
            <Button type="button" className="rounded-full bg-[var(--store-accent,#166534)] hover:bg-[var(--store-accent-hover,#14532d)]" onClick={handleSignIn}>
              <User className="mr-2 h-4 w-4" />
              Sign in
            </Button>
          )}
          {!showPageNav ? (
            <Button variant="outline" className="hidden rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] text-[color:var(--store-accent,#166534)] hover:bg-[var(--store-accent-soft,#f0fdf4)] sm:inline-flex" asChild>
              <Link to={storeHome}>{ownedShop ? 'Home' : 'Store Home'}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {showPageNav && mobileMenuOpen ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white lg:hidden" id="store-product-mobile-menu">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-4 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <Link to={storeHome} className="flex min-w-0 items-center gap-3" onClick={closeMobileMenu}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <StoreLogo store={store} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-slate-950">{store.displayName}</span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--store-accent,#166534)]">Menu</span>
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
                to={item.to}
                onClick={closeMobileMenu}
                className={`flex min-h-11 items-center rounded-2xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                  activePage === item.key
                    ? 'border-[color:var(--store-accent,#166534)] bg-[var(--store-accent,#166534)] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] hover:bg-[var(--store-accent-soft,#f0fdf4)] hover:text-[color:var(--store-accent,#166534)]'
                }`}
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

const getAvailability = (product) => {
  const status = product?.availability?.status;
  const available = product?.available ?? status === 'in_stock';
  return {
    available: Boolean(available),
    label: product?.availability?.label || (available ? 'Available' : 'Out of stock'),
    message: product?.availability?.message || (available ? 'In stock' : 'Not available right now'),
  };
};

const PublicStoreProduct = () => {
  const { storeSlug: routeStoreSlug, productSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const { isAuthenticated, openShopperAuthModal, customer: storefrontCustomer } = useStorefrontAuth();
  const {
    mode,
    isSingleStoreMode,
    isMarketplaceMode,
    pathPrefix,
    isCustomDomain,
    storeSlug: modeSlug,
  } = useStorefrontMode();
  const { isWishlisted, pendingListingIds, toggleWishlist } = useWishlist();
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [bookingFormErrors, setBookingFormErrors] = useState({});
  const [rentalAvailability, setRentalAvailability] = useState(null);
  const [rentalAvailabilityLoading, setRentalAvailabilityLoading] = useState(false);
  const [rentalAvailabilityError, setRentalAvailabilityError] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    name: '',
    phone: '',
    email: '',
    startDate: '',
    endDate: '',
    quantity: '1',
    notes: '',
  });
  const reviewSaleId = searchParams.get('saleId') || '';
  const storeSlug = routeStoreSlug || modeSlug;
  const storeBasePath = resolveSingleStoreHomePath({
    storeSlug,
    pathPrefix,
    isCustomDomain,
    pathname: location.pathname,
  });
  const isOwnedShop = isSingleStoreMode || !isMarketplaceMode;
  const storeSubtitle = mode === 'marketplace' ? 'Official Store' : '';

  const handleSearch = useCallback((search) => {
    if (isSingleStoreMode || !isMarketplaceMode) {
      navigate(buildStoreCatalogPath(storeSlug, {
        search,
        pathname: location.pathname,
        ...(pathPrefix ? { prefix: pathPrefix } : {}),
        isCustomDomain,
      }));
      return;
    }
    navigate(buildProductsSearchPath({ search, storeSlug }));
  }, [
    isCustomDomain,
    isMarketplaceMode,
    isSingleStoreMode,
    location.pathname,
    navigate,
    pathPrefix,
    storeSlug,
  ]);

  const storeQuery = useQuery({
    queryKey: ['public-store', storeSlug],
    queryFn: () => storeService.getPublicStore(storeSlug),
    enabled: Boolean(storeSlug),
    retry: false,
  });

  const productsQuery = useQuery({
    queryKey: ['public-store-products', storeSlug],
    queryFn: () => storeService.getPublicStoreProducts(storeSlug),
    enabled: Boolean(storeSlug),
    retry: false,
  });

  const store = useMemo(() => unwrapData(storeQuery.data), [storeQuery.data]);

  useEffect(() => {
    // Custom domains use root paths — do not persist a Sabito `/stores` or shared `/shop` prefix.
    if (!isSingleStoreMode || !store?.slug || isCustomDomain) return;
    persistOnlineStoreBrand(store, {
      pathPrefix: pathPrefix === 'stores' ? 'stores' : 'shop',
    });
  }, [isCustomDomain, isSingleStoreMode, pathPrefix, store]);

  const products = useMemo(() => {
    const response = productsQuery.data || {};
    return Array.isArray(response.data) ? response.data : [];
  }, [productsQuery.data]);
  const currency = productsQuery.data?.currency || store?.currency;
  const product = useMemo(
    () => products.find((item) => item.slug === productSlug || item.id === productSlug),
    [productSlug, products],
  );
  const availability = useMemo(() => getAvailability(product), [product]);
  const discount = getDiscountPercent(product);
  const saved = isWishlisted(product?.listingId || product?.id);
  const wishlistPending = pendingListingIds.includes(product?.listingId || product?.id);
  const galleryImages = useMemo(() => {
    const images = Array.isArray(product?.images) ? product.images : [];
    return [...new Set(images.map((image) => resolveImageUrl(image)).filter(Boolean))];
  }, [product?.images]);
  const coverImage = galleryImages[0] || null;
  const [selectedImage, setSelectedImage] = useState(null);
  const activeImage = selectedImage || coverImage;
  const hasMultipleImages = galleryImages.length > 1;

  const productReviewsQuery = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: () => storeService.getProductReviews(product.id),
    enabled: Boolean(product?.id),
    retry: false,
  });

  const productReviewEligibilityQuery = useQuery({
    queryKey: ['product-review-eligibility', product?.id, reviewSaleId, isAuthenticated],
    queryFn: () => {
      const params = {
        ...(reviewSaleId ? { saleId: reviewSaleId } : {}),
      };
      console.info('[reviews] fetching product review eligibility', {
        listingId: product.id,
        productSlug,
        storeSlug,
        saleId: reviewSaleId || null,
      });
      return storeService.getProductReviewEligibility(product.id, params);
    },
    enabled: Boolean(product?.id && isAuthenticated),
    retry: false,
  });

  const reviewPayload = useMemo(() => unwrapData(productReviewsQuery.data) || {}, [productReviewsQuery.data]);
  const reviewSummary = reviewPayload.summary || product?.reviewSummary || {
    rating: product?.rating || null,
    reviewsCount: product?.reviewsCount || 0,
    reviews: [],
  };
  const productReviews = useMemo(() => (
    Array.isArray(reviewPayload.reviews) ? reviewPayload.reviews : (reviewSummary.reviews || [])
  ), [reviewPayload.reviews, reviewSummary.reviews]);
  const reviewEligibility = useMemo(() => unwrapData(productReviewEligibilityQuery.data) || null, [productReviewEligibilityQuery.data]);

  useEffect(() => {
    setSelectedImage(coverImage);
  }, [coverImage]);

  useEffect(() => {
    if (!product?.id || window.location.hash !== '#reviews') return;
    window.requestAnimationFrame(() => {
      document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [product?.id, reviewEligibility?.eligible]);

  useEffect(() => {
    if (!product?.id || !isAuthenticated || productReviewEligibilityQuery.isLoading) return;
    console.info('[reviews] product review eligibility result', {
      listingId: product.id,
      saleId: reviewEligibility?.saleId || reviewSaleId || null,
      saleItemId: reviewEligibility?.saleItemId || null,
      eligible: reviewEligibility?.eligible === true,
      reason: reviewEligibility?.reason || null,
      hasExistingReview: Boolean(reviewEligibility?.existingReview),
    });
  }, [
    isAuthenticated,
    product?.id,
    productReviewEligibilityQuery.isLoading,
    reviewEligibility,
    reviewSaleId,
  ]);

  const handleGalleryStep = useCallback((direction) => {
    if (!hasMultipleImages) {
      return;
    }

    setSelectedImage((currentImage) => {
      const foundIndex = galleryImages.findIndex((imageUrl) => imageUrl === (currentImage || coverImage));
      const currentIndex = foundIndex >= 0 ? foundIndex : 0;
      const nextIndex = (currentIndex + direction + galleryImages.length) % galleryImages.length;
      return galleryImages[nextIndex];
    });
  }, [coverImage, galleryImages, hasMultipleImages]);

  const handlePurchaseIntent = useCallback(() => {
    if (product?.isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    addItem({ product, store, storeSlug, quantity: 1 });
    openShopperAuthModal({
      mode: 'signup',
      intent: {
        action: 'checkout',
        productId: product?.id,
        productSlug: product?.slug || productSlug,
        returnTo: `${storeBasePath}/products/${encodeURIComponent(productSlug)}`,
        storeSlug,
      },
    });
  }, [addItem, openShopperAuthModal, product, productSlug, store, storeBasePath, storeSlug]);

  const handleAddToCart = useCallback(() => {
    if (product?.isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    const result = addItem({ product, store, storeSlug, quantity: 1 });
    if (result.ok) {
      if (result.replacedStore) {
        showSuccess(isOwnedShop ? 'Cart updated.' : 'Cart updated for this seller. Previous seller items were removed.');
      } else {
        showSuccess('Added to cart.');
      }
    } else if (result.reason === 'sample_product') {
      showError('Sample products cannot be purchased.');
    }
  }, [addItem, isOwnedShop, product, store, storeSlug]);

  const handleWishlistClick = useCallback(() => {
    toggleWishlist(product);
  }, [product, toggleWishlist]);

  const handleReviewAuth = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'review',
        returnTo: `${storeBasePath}/products/${encodeURIComponent(productSlug)}`,
      },
    });
  }, [openShopperAuthModal, productSlug, storeBasePath]);

  const handleSubmitReview = useCallback(async (payload) => {
    if (!product?.id) return;
    setReviewSubmitting(true);
    try {
      console.info('[reviews] submitting product review', {
        listingId: product.id,
        saleId: payload?.saleId || reviewEligibility?.saleId || reviewSaleId || null,
        rating: payload?.rating,
        hasTitle: Boolean(payload?.title),
        hasComment: Boolean(payload?.comment),
      });
      await storeService.submitProductReview(product.id, payload);
      console.info('[reviews] product review submit success', {
        listingId: product.id,
        saleId: payload?.saleId || reviewEligibility?.saleId || reviewSaleId || null,
      });
      showSuccess('Product review saved.');
      await Promise.all([
        productReviewsQuery.refetch(),
        productReviewEligibilityQuery.refetch(),
        productsQuery.refetch(),
      ]);
    } catch (error) {
      console.error('[reviews] product review submit failed', {
        listingId: product.id,
        saleId: payload?.saleId || reviewEligibility?.saleId || reviewSaleId || null,
        status: error?.response?.status,
        errorCode: error?.response?.data?.errorCode,
        message: error?.response?.data?.message || error?.message,
      });
      showError(error, 'Could not save your review.');
    } finally {
      setReviewSubmitting(false);
    }
  }, [product?.id, productReviewEligibilityQuery, productReviewsQuery, productsQuery, reviewEligibility?.saleId, reviewSaleId]);

  const handleCheckoutClick = useCallback(() => {
    if (product?.isSample) {
      showError('Sample products cannot be purchased.');
      return;
    }
    const result = addItem({ product, store, storeSlug, quantity: 1 });
    if (result.ok) {
      navigate('/checkout');
    } else if (result.reason === 'sample_product') {
      showError('Sample products cannot be purchased.');
    }
  }, [addItem, navigate, product, store, storeSlug]);

  const cardActions = useMemo(
    () => filterProductCardActionsForListing(
      resolveVisibleProductCardActions(
        store?.productCardActions,
        store,
        { resolvePhone: resolveStoreWhatsAppPhone },
      ).filter((action) => {
        if (action === 'view') return false;
        if (product?.isSample && (action === 'add_to_cart' || action === 'buy_now')) return false;
        return true;
      }),
      product,
    ),
    [product, store],
  );
  const softenPrice = cardActions.includes('contact_for_price')
    || (store?.productCardActions || []).includes('contact_for_price');
  const commerceBadges = useMemo(() => getListingCommerceBadges(product), [product]);
  const priceDisplay = useMemo(() => getProductPriceDisplay(product), [product]);
  const rentOnly = isRentOnlyListing(product);
  const showRentalBooking = isRentableListing(product) && !product?.isSample;
  const rentalPolicySummary = useMemo(
    () => (Array.isArray(store?.rentalPolicySummary) ? store.rentalPolicySummary : []),
    [store?.rentalPolicySummary],
  );

  useEffect(() => {
    if (!showRentalBooking) return;
    setBookingForm((current) => ({
      ...current,
      name: current.name || storefrontCustomer?.name || '',
      phone: current.phone || storefrontCustomer?.phone || '',
      email: current.email || storefrontCustomer?.email || '',
    }));
  }, [showRentalBooking, storefrontCustomer?.email, storefrontCustomer?.name, storefrontCustomer?.phone]);

  const updateBookingField = useCallback((field, value) => {
    setBookingForm((current) => ({ ...current, [field]: value }));
    setBookingFormErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const rentalDayCount = useMemo(
    () => getRentalDayCount(bookingForm.startDate, bookingForm.endDate),
    [bookingForm.endDate, bookingForm.startDate],
  );

  const rentalEstimatedTotal = useMemo(() => {
    if (rentalAvailability?.estimatedTotal != null) {
      return rentalAvailability.estimatedTotal;
    }
    const rate = Number.parseFloat(product?.rentalRatePerDay ?? 0);
    const quantity = Number.parseInt(bookingForm.quantity, 10) || 0;
    if (!rate || !quantity || !rentalDayCount) return null;
    return Number((rate * quantity * rentalDayCount).toFixed(2));
  }, [bookingForm.quantity, product?.rentalRatePerDay, rentalAvailability?.estimatedTotal, rentalDayCount]);

  const rentalCanFulfill = useMemo(() => {
    if (rentalAvailabilityLoading) return null;
    if (rentalAvailability?.canFulfill != null) return rentalAvailability.canFulfill;
    return null;
  }, [rentalAvailability?.canFulfill, rentalAvailabilityLoading]);

  useEffect(() => {
    if (!showRentalBooking || !product?.id || !storeSlug || bookingSubmitted) {
      setRentalAvailability(null);
      setRentalAvailabilityError(null);
      return undefined;
    }

    const dateErrors = validateRentalBookingForm({
      name: 'placeholder',
      phone: 'placeholder',
      startDate: bookingForm.startDate,
      endDate: bookingForm.endDate,
      quantity: bookingForm.quantity,
    });
    if (dateErrors.startDate || dateErrors.endDate || dateErrors.quantity) {
      setRentalAvailability(null);
      setRentalAvailabilityError(null);
      setRentalAvailabilityLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRentalAvailabilityLoading(true);
      setRentalAvailabilityError(null);
      try {
        const response = await storeService.getRentalAvailability(storeSlug, {
          listingId: product.id,
          startDate: bookingForm.startDate,
          endDate: bookingForm.endDate,
          quantity: Number.parseInt(bookingForm.quantity, 10) || 1,
        });
        if (cancelled) return;
        setRentalAvailability(unwrapData(response));
      } catch (error) {
        if (cancelled) return;
        setRentalAvailability(null);
        setRentalAvailabilityError(
          error?.response?.data?.message || 'Could not check availability for these dates.',
        );
      } finally {
        if (!cancelled) {
          setRentalAvailabilityLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bookingForm.endDate,
    bookingForm.quantity,
    bookingForm.startDate,
    bookingSubmitted,
    product?.id,
    showRentalBooking,
    storeSlug,
  ]);

  const handleSubmitRentalBooking = useCallback(async (event) => {
    event.preventDefault();
    const values = {
      name: bookingForm.name.trim(),
      phone: bookingForm.phone.trim(),
      email: bookingForm.email.trim(),
      startDate: bookingForm.startDate,
      endDate: bookingForm.endDate,
      quantity: bookingForm.quantity,
    };
    const errors = validateRentalBookingForm(values);
    if (Object.keys(errors).length) {
      setBookingFormErrors(errors);
      return;
    }

    setBookingSubmitting(true);
    try {
      await storeService.submitRentalBookingRequest(storeSlug, {
        listingId: product?.id,
        name: values.name,
        phone: values.phone,
        email: values.email || undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        quantity: Number.parseInt(values.quantity, 10) || 1,
        notes: bookingForm.notes.trim() || undefined,
      });
      setBookingSubmitted(true);
      showSuccess('Booking request sent. The store will contact you to confirm.');
    } catch (error) {
      showError(error, 'Could not send your booking request.');
    } finally {
      setBookingSubmitting(false);
    }
  }, [bookingForm, product?.id, storeSlug]);

  const whatsappHref = useMemo(() => {
    const message = whatsappProductInterestMessage(product, store?.displayName, {
      available: availability.available,
    });
    return buildStoreWhatsAppHref(store, message);
  }, [availability.available, product, store]);

  const whatsappPriceHref = useMemo(() => (
    buildStoreWhatsAppHref(
      store,
      whatsappPriceInquiryMessage(product, store?.displayName),
    )
  ), [product, store]);

  if (storeQuery.isLoading || productsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f2]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!store || !product) {
    return (
      <div className="min-h-screen bg-[#f4f7f2] text-slate-900">
        <main className="w-full px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <Alert variant="destructive" className="mt-6">
              <Package className="h-4 w-4" />
              <AlertDescription>This product is not available right now.</AlertDescription>
            </Alert>
            <Button className="mt-4 rounded-full bg-[var(--store-accent,#166534)] hover:bg-[var(--store-accent-hover,#14532d)]" asChild>
              <Link to={storeSlug ? storeBasePath : (isMarketplaceMode ? '/stores' : '/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to store
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const isServiceStore = store.storeMode === 'studio';
  const catalogPath = isServiceStore
    ? (storeBasePath === '/' ? '/services' : `${storeBasePath}/services`)
    : (storeBasePath === '/' ? '/products' : `${storeBasePath}/products`);
  const ownedNavItems = isOwnedShop ? [
    { key: 'home', label: 'Home', to: storeBasePath },
    { key: 'catalog', label: isServiceStore ? 'All Services' : 'All Products', to: catalogPath },
    { key: 'categories', label: 'Categories', to: storeBasePath === '/' ? '/categories' : `${storeBasePath}/categories` },
    { key: 'about', label: 'About Us', to: storeBasePath === '/' ? '/about' : `${storeBasePath}/about` },
    { key: 'reviews', label: 'Reviews', to: storeBasePath === '/' ? '/reviews' : `${storeBasePath}/reviews` },
  ] : null;
  const brandColors = resolveStoreBrandColors(store?.templateId, store || {});
  const theme = getTemplateTheme(store?.templateId);
  const accent = brandColors.primary || theme.accent;

  return (
    <TemplateThemeProvider
      templateId={store?.templateId}
      primaryColor={brandColors.primary}
      secondaryColor={brandColors.secondary}
      tertiaryColor={brandColors.tertiary}
    >
    <div className="min-h-screen bg-[#f4f7f2] text-slate-900">
      <StoreScopedHeader
        store={store}
        product={product}
        onSearch={handleSearch}
        homeTo={storeBasePath}
        subtitle={storeSubtitle}
        ownedShop={isOwnedShop}
        navItems={ownedNavItems}
      />

      <main className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link to={storeBasePath} className="hover:text-[color:var(--store-accent,#166534)]">{store.displayName}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-slate-800">{product.title}</span>
        </div>

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-[2rem]">
          <Link to={storeBasePath} className="flex min-w-0 items-center gap-3 text-slate-900">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-[var(--store-accent-soft,#f0fdf4)]">
              {resolveImageUrl(store.logoUrl) ? (
                <img src={resolveImageUrl(store.logoUrl)} alt={store.displayName} className="h-full w-full object-contain" />
              ) : (
                <Store className="h-5 w-5 text-[color:var(--store-accent,#166534)]" />
              )}
            </div>
            <div className="min-w-0">
              {!isOwnedShop ? (
                <p className="text-sm font-semibold text-slate-500">Sold by</p>
              ) : null}
              <h1 className="truncate text-xl font-black text-slate-950">{store.displayName}</h1>
            </div>
          </Link>
          {!isOwnedShop ? (
            <Badge variant="outline" className="border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] bg-[var(--store-accent-soft,#f0fdf4)] text-[color:var(--store-accent,#166534)]">Published product</Badge>
          ) : null}
        </div>

        <div key={product.id} className="sf-page-enter overflow-hidden rounded-2xl border border-slate-200 bg-white sm:rounded-[2rem]">
          <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-8">
            <div className="space-y-3">
              <div className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:rounded-3xl">
                {activeImage ? (
                  <img
                    src={activeImage}
                    alt={product.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <ProductImage product={product} />
                )}
                {discount > 0 ? (
                  <Badge className="absolute left-4 top-4 border-0 bg-rose-500 text-white hover:bg-rose-500">-{discount}%</Badge>
                ) : null}
                {hasMultipleImages ? (
                  <>
                    <button
                      type="button"
                      className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-800 backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--store-accent,#166534)] focus:ring-offset-2 focus:ring-offset-white sm:h-11 sm:w-11"
                      onClick={() => handleGalleryStep(-1)}
                      aria-label="View previous product image"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-800 backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--store-accent,#166534)] focus:ring-offset-2 focus:ring-offset-white sm:h-11 sm:w-11"
                      onClick={() => handleGalleryStep(1)}
                      aria-label="View next product image"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </div>

              {hasMultipleImages ? (
                <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {galleryImages.map((imageUrl, index) => {
                    const isSelected = imageUrl === activeImage;
                    return (
                      <button
                        key={imageUrl}
                        type="button"
                        className={`h-20 min-w-20 flex-none overflow-hidden rounded-2xl border bg-slate-50 transition sm:h-32 sm:min-w-32 ${
                          isSelected ? 'border-[color:var(--store-accent,#166534)] ring-2 ring-[color:color-mix(in_srgb,var(--store-accent,#166534)_20%,white)]' : 'border-slate-200 hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_45%,white)]'
                        }`}
                        onClick={() => setSelectedImage(imageUrl)}
                        aria-current={isSelected ? 'true' : undefined}
                        aria-label={`View product image ${index + 1}`}
                      >
                        <img
                          src={imageUrl}
                          alt={`${product.title} thumbnail ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col justify-center space-y-5">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge
                    className={availability.available
                      ? 'border-0 bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent,#166534)]'
                      : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50'}
                    variant={availability.available ? 'default' : 'outline'}
                  >
                    {availability.label}
                  </Badge>
                  {product.isSample ? (
                    <Badge className="border-0 bg-slate-800 text-white hover:bg-slate-800">
                      Sample
                    </Badge>
                  ) : null}
                  {commerceBadges.map((badge) => (
                    <Badge
                      key={badge}
                      variant="outline"
                      className="border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] bg-[var(--store-accent-soft,#f0fdf4)] text-[color:var(--store-accent,#166534)]"
                    >
                      {badge}
                    </Badge>
                  ))}
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl md:text-4xl">{product.title}</h2>
                <div className="mt-3">
                  <ReviewSummaryLine summary={reviewSummary} />
                </div>
                {product.isSample ? (
                  <p className="mt-2 text-sm font-medium text-slate-500">Demo product — not for sale</p>
                ) : null}
                {product.shortDescription ? (
                  <p className="mt-3 text-base leading-7 text-slate-500">{product.shortDescription}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-baseline gap-2">
                {softenPrice ? (
                  <span className="text-2xl font-black text-slate-700 sm:text-3xl">Contact for price</span>
                ) : priceDisplay.amount != null ? (
                  <>
                    <span className="text-2xl font-black text-[color:var(--store-accent,#166534)] sm:text-3xl">
                      {formatAmount(priceDisplay.amount, currency)}
                      {priceDisplay.suffix ? (
                        <span className="ml-1 text-lg font-bold text-slate-500">{priceDisplay.suffix}</span>
                      ) : null}
                    </span>
                    {priceDisplay.secondaryAmount != null && priceDisplay.secondaryAmount > 0 ? (
                      <span className="text-base font-semibold text-slate-600">
                        or {formatAmount(priceDisplay.secondaryAmount, currency)}{priceDisplay.secondarySuffix} to rent
                      </span>
                    ) : null}
                    {!rentOnly && Number(product.compareAtPrice || 0) > 0 ? (
                      <span className="text-sm text-slate-400 line-through">{formatAmount(product.compareAtPrice, currency)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-2xl font-black text-slate-700 sm:text-3xl">Price on request</span>
                )}
              </div>

              {showRentalBooking ? (
                <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] bg-[var(--store-accent-soft,#f0fdf4)] px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">Request a rental</p>
                  {bookingSubmitted ? (
                    <Alert className="mt-3 border-[color:color-mix(in_srgb,var(--store-accent,#166534)_30%,white)] bg-white">
                      <AlertDescription className="text-sm leading-6 text-slate-900">
                        Your booking request has been sent. {store.displayName} will review availability and contact you to confirm — no payment is taken online yet.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <form onSubmit={handleSubmitRentalBooking} className="mt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-slate-900">
                          Start date
                          <Input
                            type="date"
                            min={getTodayDateInputValue()}
                            value={bookingForm.startDate}
                            onChange={(event) => updateBookingField('startDate', event.target.value)}
                            className="mt-1 bg-white"
                          />
                          {bookingFormErrors.startDate ? (
                            <p className="mt-1 text-sm text-red-600">{bookingFormErrors.startDate}</p>
                          ) : null}
                        </label>
                        <label className="block text-sm font-medium text-slate-900">
                          End date
                          <Input
                            type="date"
                            min={bookingForm.startDate || getTodayDateInputValue()}
                            value={bookingForm.endDate}
                            onChange={(event) => updateBookingField('endDate', event.target.value)}
                            className="mt-1 bg-white"
                          />
                          {bookingFormErrors.endDate ? (
                            <p className="mt-1 text-sm text-red-600">{bookingFormErrors.endDate}</p>
                          ) : null}
                        </label>
                      </div>
                      <label className="block text-sm font-medium text-slate-900">
                        Quantity
                        <Input
                          type="number"
                          min={1}
                          value={bookingForm.quantity}
                          onChange={(event) => updateBookingField('quantity', event.target.value)}
                          className="mt-1 bg-white"
                        />
                        {bookingFormErrors.quantity ? (
                          <p className="mt-1 text-sm text-red-600">{bookingFormErrors.quantity}</p>
                        ) : null}
                      </label>
                      {rentalAvailabilityLoading ? (
                        <p className="flex items-center gap-2 text-sm text-[color:var(--store-accent-hover,#14532d)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking availability…
                        </p>
                      ) : null}
                      {!rentalAvailabilityLoading && rentalAvailabilityError ? (
                        <Alert variant="destructive" className="border-red-200 bg-white">
                          <AlertDescription className="text-sm">{rentalAvailabilityError}</AlertDescription>
                        </Alert>
                      ) : null}
                      {!rentalAvailabilityLoading && rentalAvailability && !rentalAvailabilityError ? (
                        <p className={`text-sm font-semibold ${rentalCanFulfill === false ? 'text-red-700' : 'text-[color:var(--store-accent-hover,#14532d)]'}`}>
                          {rentalCanFulfill === false
                            ? `Only ${rentalAvailability.availableQty} available for these dates — reduce quantity or change dates`
                            : `${rentalAvailability.availableQty} available for these dates`}
                        </p>
                      ) : null}
                      {rentalEstimatedTotal != null ? (
                        <p className="text-sm font-semibold text-[color:var(--store-accent-hover,#14532d)]">
                          Estimated total: {formatAmount(rentalEstimatedTotal, currency)}
                          {rentalDayCount ? ` (${rentalDayCount} day${rentalDayCount === 1 ? '' : 's'})` : ''}
                        </p>
                      ) : null}
                      <label className="block text-sm font-medium text-slate-900">
                        Your name
                        <Input
                          value={bookingForm.name}
                          onChange={(event) => updateBookingField('name', event.target.value)}
                          className="mt-1 bg-white"
                        />
                        {bookingFormErrors.name ? (
                          <p className="mt-1 text-sm text-red-600">{bookingFormErrors.name}</p>
                        ) : null}
                      </label>
                      <label className="block text-sm font-medium text-slate-900">
                        Phone
                        <Input
                          value={bookingForm.phone}
                          onChange={(event) => updateBookingField('phone', event.target.value)}
                          className="mt-1 bg-white"
                        />
                        {bookingFormErrors.phone ? (
                          <p className="mt-1 text-sm text-red-600">{bookingFormErrors.phone}</p>
                        ) : null}
                      </label>
                      <label className="block text-sm font-medium text-slate-900">
                        Email (optional)
                        <Input
                          type="email"
                          value={bookingForm.email}
                          onChange={(event) => updateBookingField('email', event.target.value)}
                          className="mt-1 bg-white"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-900">
                        Notes (optional)
                        <textarea
                          rows={3}
                          value={bookingForm.notes}
                          onChange={(event) => updateBookingField('notes', event.target.value)}
                          className="mt-1 min-h-[88px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </label>
                      <Button
                        type="submit"
                        className="w-full rounded-full bg-[var(--store-accent,#166534)] hover:bg-[var(--store-accent-hover,#14532d)] sm:w-auto"
                        disabled={
                          bookingSubmitting
                          || !availability.available
                          || rentalAvailabilityLoading
                          || rentalCanFulfill === false
                          || Boolean(rentalAvailabilityError)
                        }
                      >
                        {bookingSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Request booking
                      </Button>
                    </form>
                  )}
                </div>
              ) : null}

              {product.rentalTerms ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rental terms</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{product.rentalTerms}</p>
                </div>
              ) : null}

              {!product.rentalTerms && rentalPolicySummary.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rental policy</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                    {rentalPolicySummary.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {availability.message}
              </p>

              <div className="grid gap-3 sm:flex sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:var(--store-accent,#166534)] hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_45%,white)] hover:bg-[var(--store-accent-soft,#16653422)] hover:text-[color:var(--store-accent,#166534)] sm:w-auto"
                  onClick={handleWishlistClick}
                  disabled={wishlistPending}
                >
                  <Heart className={`mr-2 h-4 w-4 ${saved ? 'fill-current text-rose-600' : ''}`} />
                  {saved ? 'Saved to wishlist' : 'Save to wishlist'}
                </Button>
                {cardActions.map((actionId, index) => {
                  const isPrimary = index === cardActions.length - 1;
                  const outlineClass = 'w-full rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:var(--store-accent,#166534)] hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_45%,white)] hover:bg-[var(--store-accent-soft,#16653422)] hover:text-[color:var(--store-accent,#166534)] sm:w-auto';
                  // hover:bg-* (not opacity) so twMerge drops Button's hover:bg-primary/90 (Sabito green)
                  const primaryClass = 'w-full rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] sm:w-auto';
                  const className = isPrimary ? primaryClass : outlineClass;
                  const variant = isPrimary ? 'default' : 'outline';

                  if (actionId === 'add_to_cart') {
                    return (
                      <Button
                        key={actionId}
                        type="button"
                        variant={variant}
                        className={className}
                        disabled={!availability.available}
                        onClick={handleAddToCart}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Add to cart
                      </Button>
                    );
                  }

                  if (actionId === 'buy_now') {
                    return (
                      <Button
                        key={actionId}
                        type="button"
                        variant={variant}
                        className={className}
                        onClick={isAuthenticated ? handleCheckoutClick : handlePurchaseIntent}
                        disabled={!availability.available}
                      >
                        <ShoppingBag className="mr-2 h-4 w-4" />
                        {isAuthenticated ? 'Continue to checkout' : 'Buy Now'}
                      </Button>
                    );
                  }

                  if (actionId === 'contact_for_price' && whatsappPriceHref) {
                    return (
                      <Button key={actionId} type="button" variant={variant} className={className} asChild>
                        <a href={whatsappPriceHref} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Contact for price
                        </a>
                      </Button>
                    );
                  }

                  if (actionId === 'whatsapp' && whatsappHref) {
                    return (
                      <Button key={actionId} type="button" variant={variant} className={className} asChild>
                        <a href={whatsappHref} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-2 h-4 w-4" />
                          {availability.available ? 'WhatsApp' : 'Ask about restock'}
                        </a>
                      </Button>
                    );
                  }

                  return null;
                })}
              </div>

              {product.description ? (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="font-black text-slate-950">Product details</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{product.description}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <section id="reviews" className="mt-8 grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:rounded-[2rem] md:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-[color:var(--store-accent,#166534)]">Product reviews</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {isOwnedShop ? 'Reviews' : 'Verified shopper feedback'}
              </h2>
            </div>
            <ReviewSummaryLine summary={reviewSummary} />
          </div>
          <VerifiedReviewForm
            eligibility={reviewEligibility}
            isAuthenticated={isAuthenticated}
            isEligibilityLoading={productReviewEligibilityQuery.isLoading}
            isSubmitting={reviewSubmitting}
            onRequireAuth={handleReviewAuth}
            onSubmit={handleSubmitReview}
            targetLabel={product.title}
          />
          <ReviewList
            reviews={productReviews}
            emptyText={isOwnedShop ? 'No reviews yet.' : 'No verified product reviews yet.'}
          />
        </section>
      </main>
      <StoreScopedFooter
        store={store}
        contactHref={whatsappHref}
        singleStoreMode={isSingleStoreMode || !isMarketplaceMode}
        storeBasePath={storeBasePath}
        subtitle={storeSubtitle}
        accentColor={accent}
      />
    </div>
    </TemplateThemeProvider>
  );
};

export default PublicStoreProduct;
