import api, { ApiResponse } from '@/services/api';

const buildQuery = (params: Record<string, string | number | undefined | null> = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export type MarketplaceCategory = { id?: string; name: string; count?: number };

export type MarketplaceProduct = {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string | null;
  publicPrice: number | string;
  compareAtPrice?: number | string | null;
  images?: string[];
  available?: boolean;
  onSale?: boolean;
  discountPercent?: number | null;
  availability?: { quantityOnHand?: number; message?: string };
  category?: { id: string; name: string } | null;
  store?: {
    slug: string;
    displayName: string;
    currency?: string;
    logoUrl?: string | null;
    deliveryEnabled?: boolean;
    pickupEnabled?: boolean;
    deliveryFee?: number;
    shopType?: string | null;
    freeDeliveryThreshold?: number | null;
  } | null;
  rating?: number | null;
  reviewsCount?: number;
  publishedAt?: string | null;
};

export type MarketplaceStore = {
  slug: string;
  displayName: string;
  description?: string;
  logoUrl?: string | null;
  bannerImageUrl?: string | null;
  currency?: string;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  deliveryFee?: number;
  shopType?: string | null;
  cuisineTags?: string[];
  avgPrepMinutes?: number | null;
  isOpenNow?: boolean | null;
  freeDeliveryThreshold?: number | null;
  rating?: number | null;
  reviewsCount?: number;
  productCount?: number;
  category?: string;
};

export type MarketplaceStudio = {
  id?: string;
  slug: string;
  displayName: string;
  description?: string;
  logoUrl?: string | null;
  bannerImageUrl?: string | null;
  currency?: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  serviceCount?: number;
  rating?: number | null;
  reviewsCount?: number;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export type MarketplaceService = {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  category?: string | null;
  ctaType?: string;
  priceType?: string;
  startingPrice?: number | string | null;
  compareAtPrice?: number | string | null;
  durationMinutes?: number | null;
  turnaroundLabel?: string | null;
  images?: string[];
  currency?: string;
  canBookOnline?: boolean;
  canRequestQuote?: boolean;
  rating?: number | null;
  reviewsCount?: number;
  studio?: MarketplaceStudio | null;
};

export type FoodStoreCard = MarketplaceStore & {
  shopType?: string | null;
  cuisineTags?: string[];
  openingHours?: Record<string, unknown> | null;
  avgPrepMinutes?: number | null;
  isOpenNow?: boolean | null;
  freeDeliveryThreshold?: number | null;
  rating?: number | null;
  reviewsCount?: number;
  productCount?: number;
  category?: string;
};

export type FoodHomePayload = {
  hero: { eyebrow: string; title: string; description: string };
  cuisineChips: Array<{ label: string; count: number }>;
  openNearYou: FoodStoreCard[];
  restaurants: FoodStoreCard[];
  popularMeals: MarketplaceProduct[];
  groceries: FoodStoreCard[];
  groceryProducts: MarketplaceProduct[];
  drinks: MarketplaceProduct[];
  fastDelivery: FoodStoreCard[];
  hasVendors: boolean;
};

export type ProductHomePayload = {
  hero: { eyebrow: string; title: string; description: string };
  categories: MarketplaceCategory[];
  popularStores: MarketplaceStore[];
  featuredProducts: MarketplaceProduct[];
  newArrivals: MarketplaceProduct[];
  bestDeals: MarketplaceProduct[];
  deliveryStores: MarketplaceStore[];
  hasVendors: boolean;
};

export type ServiceHomePayload = {
  hero: { eyebrow: string; title: string; description: string };
  categories: Array<{ name: string; count: number }>;
  featuredServices: MarketplaceService[];
  popularStudios: MarketplaceStudio[];
  bookableServices: MarketplaceService[];
  quoteServices: MarketplaceService[];
  hasProviders: boolean;
};

export type StudioHomePayload = {
  studio: MarketplaceStudio & {
    contactPhone?: string | null;
    whatsappNumber?: string | null;
    contactEmail?: string | null;
    reviewSummary?: { rating?: number | null; reviewsCount?: number };
  };
  categories: Array<{ name: string; count?: number }>;
  featuredServices: MarketplaceService[];
  services: MarketplaceService[];
  reviews?: unknown[];
};

export type ServiceDetailPayload = {
  studio: MarketplaceStudio;
  service: MarketplaceService;
};

export type ServiceBookingPaystackPayload = {
  studioSlug: string;
  serviceSlug: string;
  serviceListingId?: string;
  preferredDate?: string;
  preferredTime?: string;
  message?: string;
  amount?: number;
};

export const marketplaceApi = {
  getHome: () => api.get<ApiResponse<Record<string, unknown>>>('/public/marketplace/home'),

  getFoodHome: () => api.get<ApiResponse<FoodHomePayload>>('/public/marketplace/food/home'),

  getProductsHome: () => api.get<ApiResponse<ProductHomePayload>>('/public/marketplace/products/home'),

  getServicesHome: () => api.get<ApiResponse<ServiceHomePayload>>('/public/marketplace/services/home'),

  getStores: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<MarketplaceStore[]>>(`/public/marketplace/stores${buildQuery(params || {})}`),

  getStoreHome: (slug: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`/public/marketplace/stores/${encodeURIComponent(slug)}`),

  getProducts: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<MarketplaceProduct[]>>(`/public/marketplace/products${buildQuery(params || {})}`),

  getProduct: (idOrSlug: string) =>
    api.get<ApiResponse<MarketplaceProduct>>(`/public/marketplace/products/${encodeURIComponent(idOrSlug)}`),

  getCategories: () => api.get<ApiResponse<unknown[]>>('/public/marketplace/categories'),

  getStudios: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<MarketplaceStudio[]>>(`/public/marketplace/studios${buildQuery(params || {})}`),

  getStudioHome: (slug: string) =>
    api.get<ApiResponse<StudioHomePayload>>(`/public/marketplace/studios/${encodeURIComponent(slug)}`),

  getServices: (params?: Record<string, string | number>) =>
    api.get<ApiResponse<MarketplaceService[]>>(`/public/marketplace/services${buildQuery(params || {})}`),

  getService: (studioSlug: string, serviceSlug: string) =>
    api.get<ApiResponse<ServiceDetailPayload>>(
      `/public/marketplace/studios/${encodeURIComponent(studioSlug)}/services/${encodeURIComponent(serviceSlug)}`,
    ),

  getPublicStore: (slug: string) =>
    api.get<ApiResponse<MarketplaceStore>>(`/public/store/${encodeURIComponent(slug)}`),

  getPublicStoreProducts: (slug: string) =>
    api.get<ApiResponse<MarketplaceProduct[]>>(`/public/store/${encodeURIComponent(slug)}/products`),

  submitServiceRequest: (payload: Record<string, unknown>) =>
    api.post<ApiResponse<unknown>>('/public/storefront/service-requests', payload),

  initializeServicePaystack: (payload: ServiceBookingPaystackPayload) =>
    api.post<ApiResponse<{
      authorization_url: string;
      reference: string;
      booking: { jobId: string; jobNumber?: string; paymentStatus: string; total: number; currency: string };
    }>>('/public/storefront/services/initialize-paystack', payload),

  verifyServicePaystack: (reference: string) =>
    api.post<ApiResponse<{ booking: { jobId: string; jobNumber?: string; paymentStatus: string; amountPaid?: number; currency?: string } }>>(
      '/public/storefront/services/verify-paystack',
      { reference },
    ),
};
