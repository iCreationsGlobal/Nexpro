import api, { ApiResponse } from '@/services/api';

export type CartCheckoutItem = { listingId: string; quantity: number };

export type DeliveryAddress = {
  id?: string;
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  isDefault?: boolean;
};

export type CheckoutPreview = {
  store: {
    slug: string;
    displayName: string;
    currency: string;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFee: number;
  };
  items: Array<{
    listingId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    available: boolean;
    imageUrl?: string | null;
  }>;
  subtotal: number;
  deliveryFee: number;
  deliveryFeeWaived?: boolean;
  freeDeliveryThreshold?: number | null;
  total: number;
  currency: string;
  fulfillmentMethod: 'delivery' | 'pickup';
};

export type OrderSummary = {
  id: string;
  saleNumber: string;
  status: string;
  orderStatus?: string | null;
  total: number;
  currency: string;
  storeName: string;
  storeSlug?: string | null;
  fulfillmentMethod?: string;
  deliveryTracking?: Record<string, unknown>;
  deliveryTimeline?: unknown[];
  canConfirmReceived?: boolean;
  tradeAssurance?: Record<string, unknown>;
  dispute?: { id: string; status: string; reason: string; openedAt?: string } | null;
  createdAt: string;
};

export type OrdersListPayload = {
  orders: OrderSummary[];
};

export type ServiceBookingSummary = {
  id: string;
  jobId: string;
  jobNumber: string;
  title: string;
  status: string;
  paymentStatus?: string | null;
  total: number;
  currency: string;
  studioSlug?: string | null;
  serviceSlug?: string | null;
  serviceTitle?: string;
  preferredDate?: string | null;
  preferredTime?: string | null;
  appointmentAt?: string | null;
  createdAt: string;
};

export type ServiceBookingsPayload = {
  bookings: ServiceBookingSummary[];
};

export const ordersApi = {
  previewCheckout: (payload: {
    storeSlug: string;
    items: CartCheckoutItem[];
    fulfillmentMethod: 'delivery' | 'pickup';
    deliveryAddress?: Partial<DeliveryAddress>;
  }) => api.post<ApiResponse<CheckoutPreview>>('/public/storefront/checkout/preview', payload),

  initializePaystack: (payload: {
    storeSlug: string;
    items: CartCheckoutItem[];
    fulfillmentMethod: 'delivery' | 'pickup';
    deliveryAddress?: Partial<DeliveryAddress>;
    notes?: string;
  }) => api.post<ApiResponse<{
    authorization_url: string;
    reference: string;
    access_code?: string;
    order: { id: string; saleNumber: string; total: number; currency: string };
  }>>('/public/storefront/orders/initialize-paystack', payload),

  verifyPaystack: (reference: string) =>
    api.post<ApiResponse<{ order: OrderSummary }>>('/public/storefront/orders/verify-paystack', { reference }),

  list: (params?: { page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return api.get<ApiResponse<OrdersListPayload>>(`/public/storefront/orders${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => api.get<ApiResponse<Record<string, unknown>>>(`/public/storefront/orders/${encodeURIComponent(id)}`),

  track: (reference: string, contact: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/public/storefront/orders/track?reference=${encodeURIComponent(reference)}&contact=${encodeURIComponent(contact)}`,
    ),

  confirmReceived: (id: string, payload?: { review?: Record<string, unknown> }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/orders/${encodeURIComponent(id)}/confirm-received`, payload || {}),

  openDispute: (id: string, payload: { reason: string; message: string }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/orders/${encodeURIComponent(id)}/disputes`, payload),

  contactSeller: (id: string, payload: { message: string }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/orders/${encodeURIComponent(id)}/contact-seller`, payload),
};

export const bookingsApi = {
  list: (params?: { page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return api.get<ApiResponse<ServiceBookingsPayload>>(`/public/storefront/services/bookings${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    api.get<ApiResponse<ServiceBookingSummary>>(`/public/storefront/services/bookings/${encodeURIComponent(id)}`),
};

export const addressesApi = {
  list: () => api.get<ApiResponse<DeliveryAddress[]>>('/public/storefront/addresses'),
  create: (payload: Omit<DeliveryAddress, 'id'>) =>
    api.post<ApiResponse<DeliveryAddress>>('/public/storefront/addresses', payload),
  update: (id: string, payload: Partial<DeliveryAddress>) =>
    api.put<ApiResponse<DeliveryAddress>>(`/public/storefront/addresses/${encodeURIComponent(id)}`, payload),
  remove: (id: string) => api.delete<ApiResponse<unknown>>(`/public/storefront/addresses/${encodeURIComponent(id)}`),
  setDefault: (id: string) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/addresses/${encodeURIComponent(id)}/default`),
};

export const wishlistApi = {
  list: () => api.get<ApiResponse<unknown[]>>('/public/storefront/wishlist'),
  toggle: (listingId: string) =>
    api.post<ApiResponse<{ saved: boolean }>>('/public/storefront/wishlist/toggle', { listingId }),
  remove: (listingId: string) =>
    api.delete<ApiResponse<unknown>>(`/public/storefront/wishlist/${encodeURIComponent(listingId)}`),
};

export const reviewsApi = {
  getProductReviews: (listingId: string) =>
    api.get<ApiResponse<{ summary?: unknown; reviews?: unknown[] }>>(`/public/storefront/reviews/products/${encodeURIComponent(listingId)}`),
  getProductEligibility: (listingId: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/public/storefront/reviews/products/${encodeURIComponent(listingId)}/eligibility`,
    ),
  submitProductReview: (listingId: string, payload: { rating: number; title?: string; comment?: string; saleId?: string }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/reviews/products/${encodeURIComponent(listingId)}`, payload),
  getStoreReviews: (storeSlug: string) =>
    api.get<ApiResponse<{ summary?: unknown; reviews?: unknown[] }>>(`/public/storefront/reviews/stores/${encodeURIComponent(storeSlug)}`),
  getStoreEligibility: (storeSlug: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/public/storefront/reviews/stores/${encodeURIComponent(storeSlug)}/eligibility`,
    ),
  submitStoreReview: (storeSlug: string, payload: { rating: number; title?: string; comment?: string; saleId?: string }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/reviews/stores/${encodeURIComponent(storeSlug)}`, payload),
  getServiceReviews: (listingId: string) =>
    api.get<ApiResponse<{ summary?: unknown; reviews?: unknown[] }>>(`/public/storefront/reviews/services/${encodeURIComponent(listingId)}`),
  getServiceEligibility: (listingId: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(
      `/public/storefront/reviews/services/${encodeURIComponent(listingId)}/eligibility`,
    ),
  submitServiceReview: (listingId: string, payload: { rating: number; title?: string; comment?: string }) =>
    api.post<ApiResponse<unknown>>(`/public/storefront/reviews/services/${encodeURIComponent(listingId)}`, payload),
};

export const notificationsApi = {
  register: (payload: { token: string; platform: 'ios' | 'android'; deviceName?: string }) =>
    api.post<ApiResponse<unknown>>('/public/storefront/notifications/register', payload),
  unregister: (token: string) =>
    api.delete<ApiResponse<unknown>>('/public/storefront/notifications/register', { data: { token } }),
  getPreferences: () => api.get<ApiResponse<Record<string, boolean>>>('/public/storefront/notifications/preferences'),
  updatePreferences: (payload: Record<string, boolean>) =>
    api.patch<ApiResponse<Record<string, boolean>>>('/public/storefront/notifications/preferences', payload),
};

export const disputesApi = {
  list: (params?: { page?: number; limit?: number }) => {
    const qs = params?.page ? `?page=${params.page}&limit=${params.limit || 20}` : '';
    return api.get<ApiResponse<unknown[]>>(`/public/storefront/disputes${qs}`);
  },
  get: (id: string) => api.get<ApiResponse<Record<string, unknown>>>(`/public/storefront/disputes/${encodeURIComponent(id)}`),
};
