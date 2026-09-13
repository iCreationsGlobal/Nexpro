import api from './api';

const buildPublicQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, value);
  });
  return searchParams.toString();
};

const storeService = {
  // "Online Store" custom domain resolution: is the current Host a merchant's connected
  // custom domain (single-store mode) or the shared marketplace domain?
  resolveDomain: async (host) => api.get(`/public/storefront/resolve-domain?host=${encodeURIComponent(host || '')}`),

  getPublicStore: async (slug) => api.get(`/public/store/${encodeURIComponent(slug || '')}`),

  getPublicStoreProducts: async (slug) => api.get(`/public/store/${encodeURIComponent(slug || '')}/products`),

  getRentalAvailability: async (storeSlug, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/store/${encodeURIComponent(storeSlug || '')}/rental-availability`;
    return api.get(query ? `${path}?${query}` : path);
  },

  submitRentalBookingRequest: async (storeSlug, payload) => (
    api.post(`/public/store/${encodeURIComponent(storeSlug || '')}/rental-booking-request`, payload)
  ),

  getMarketplaceHome: async () => api.get('/public/marketplace/home'),

  getMarketplaceStores: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/stores?${query}` : '/public/marketplace/stores');
  },

  getMarketplaceStoreHome: async (slug, params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      search.append(key, value);
    });
    const qs = search.toString();
    return api.get(
      `/public/marketplace/stores/${encodeURIComponent(slug || '')}${qs ? `?${qs}` : ''}`
    );
  },

  getMarketplaceProducts: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/products?${query}` : '/public/marketplace/products');
  },

  getMarketplaceCategories: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/categories?${query}` : '/public/marketplace/categories');
  },

  getMarketplaceStudios: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/studios?${query}` : '/public/marketplace/studios');
  },

  getMarketplaceStudioHome: async (slug) => api.get(`/public/marketplace/studios/${encodeURIComponent(slug || '')}`),

  getMarketplaceServices: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/services?${query}` : '/public/marketplace/services');
  },

  getMarketplaceServiceCategories: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/marketplace/service-categories?${query}` : '/public/marketplace/service-categories');
  },

  getPublicStudioService: async (studioSlug, serviceSlug) => (
    api.get(`/public/marketplace/studios/${encodeURIComponent(studioSlug || '')}/services/${encodeURIComponent(serviceSlug || '')}`)
  ),

  submitServiceRequest: async (payload) => api.post('/public/storefront/service-requests', payload),

  initializeServiceBookingPaystack: async (payload) => (
    api.post('/public/storefront/services/initialize-paystack', payload)
  ),

  verifyServiceBookingPaystack: async (reference) => (
    api.post('/public/storefront/services/verify-paystack', { reference })
  ),

  getServiceReviews: async (listingId, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/services/${encodeURIComponent(listingId || '')}`;
    return api.get(query ? `${path}?${query}` : path);
  },

  getServiceReviewEligibility: async (listingId, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/services/${encodeURIComponent(listingId || '')}/eligibility`;
    return api.get(query ? `${path}?${query}` : path);
  },

  submitServiceReview: async (listingId, payload) => (
    api.post(`/public/storefront/reviews/services/${encodeURIComponent(listingId || '')}`, payload)
  ),

  createStorefrontOrder: async (payload) => api.post('/public/storefront/orders', payload),

  previewStorefrontCheckout: async (payload) => api.post('/public/storefront/checkout/preview', payload),

  initializeStorefrontOrderPaystack: async (payload) => api.post('/public/storefront/orders/initialize-paystack', payload),

  verifyStorefrontOrderPaystack: async (reference) => api.post('/public/storefront/orders/verify-paystack', { reference }),

  trackStorefrontOrder: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/storefront/orders/track?${query}` : '/public/storefront/orders/track');
  },

  getStorefrontOrders: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/storefront/orders?${query}` : '/public/storefront/orders');
  },

  getStorefrontOrder: async (id) => api.get(`/public/storefront/orders/${encodeURIComponent(id || '')}`),

  getStorefrontServiceBookings: async (params = {}) => {
    const query = buildPublicQuery(params);
    return api.get(query ? `/public/storefront/services/bookings?${query}` : '/public/storefront/services/bookings');
  },

  getStorefrontServiceBooking: async (id) => api.get(`/public/storefront/services/bookings/${encodeURIComponent(id || '')}`),

  confirmStorefrontOrderReceived: async (id, payload = {}) => api.post(
    `/public/storefront/orders/${encodeURIComponent(id || '')}/confirm-received`,
    payload,
  ),

  openStorefrontOrderDispute: async (id, payload) => api.post(`/public/storefront/orders/${encodeURIComponent(id || '')}/disputes`, payload),

  contactStorefrontOrderSeller: async (id, payload) => api.post(`/public/storefront/orders/${encodeURIComponent(id || '')}/contact-seller`, payload),

  getProductReviews: async (listingId, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/products/${encodeURIComponent(listingId || '')}`;
    return api.get(query ? `${path}?${query}` : path);
  },

  getProductReviewEligibility: async (listingId, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/products/${encodeURIComponent(listingId || '')}/eligibility`;
    return api.get(query ? `${path}?${query}` : path);
  },

  submitProductReview: async (listingId, payload) => api.post(`/public/storefront/reviews/products/${encodeURIComponent(listingId || '')}`, payload),

  getStoreReviews: async (storeSlug, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/stores/${encodeURIComponent(storeSlug || '')}`;
    return api.get(query ? `${path}?${query}` : path);
  },

  getStoreReviewEligibility: async (storeSlug, params = {}) => {
    const query = buildPublicQuery(params);
    const path = `/public/storefront/reviews/stores/${encodeURIComponent(storeSlug || '')}/eligibility`;
    return api.get(query ? `${path}?${query}` : path);
  },

  submitStoreReview: async (storeSlug, payload) => api.post(`/public/storefront/reviews/stores/${encodeURIComponent(storeSlug || '')}`, payload),

  updateReview: async (id, payload) => api.patch(`/public/storefront/reviews/${encodeURIComponent(id || '')}`, payload),

  getWishlist: async () => api.get('/public/storefront/wishlist'),

  addWishlistItem: async (listingId) => api.post('/public/storefront/wishlist', { listingId }),

  toggleWishlistItem: async (listingId) => api.post('/public/storefront/wishlist/toggle', { listingId }),

  getWishlistStatus: async (listingId) => api.get(`/public/storefront/wishlist/${encodeURIComponent(listingId || '')}`),

  removeWishlistItem: async (listingId) => api.delete(`/public/storefront/wishlist/${encodeURIComponent(listingId || '')}`),

  getDeliveryAddresses: async () => api.get('/public/storefront/addresses'),

  createDeliveryAddress: async (payload) => api.post('/public/storefront/addresses', payload),

  updateDeliveryAddress: async (id, payload) => api.put(`/public/storefront/addresses/${encodeURIComponent(id || '')}`, payload),

  deleteDeliveryAddress: async (id) => api.delete(`/public/storefront/addresses/${encodeURIComponent(id || '')}`),

  setDefaultDeliveryAddress: async (id) => api.post(`/public/storefront/addresses/${encodeURIComponent(id || '')}/default`),
};

export default storeService;
