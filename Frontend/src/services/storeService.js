import api from './api';
import { buildScopedQueryString, withActiveShopScope } from '../utils/shopScope';
import { resolveStoreCurrencyCode } from '../utils/storeCurrency';

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(withActiveShopScope(params)).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, value);
  });
  return searchParams.toString();
};

/**
 * Ensure upsert payloads never send template ids / display names as currency.
 * `templateId` is left untouched for the backend template column.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
const normalizeStoreSettingsPayload = (payload = {}) => {
  const body = { ...payload };
  if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
    body.currency = resolveStoreCurrencyCode(body.currency);
  }
  return body;
};

const storeService = {
  getSettings: async () => api.get('/store/settings'),

  updateSettings: async (payload) => api.put('/store/settings', normalizeStoreSettingsPayload(payload)),

  getHeroLibrary: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/heroes/library?${query}` : '/store/heroes/library');
  },

  uploadHeroImages: async (files) => {
    const formData = new FormData();
    (files || []).forEach((file) => formData.append('files', file));
    return api.post('/store/heroes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getSetupStatus: async () => api.get('/store/setup-status'),

  checkSlugAvailability: async (slug) => api.get(`/store/slug-availability?slug=${encodeURIComponent(slug || '')}`),

  // "Online Store" custom domain (customer-owned domain, independent of Sabito marketplace)
  getDomainSettings: async () => api.get('/store/domain'),

  updateDomain: async (customDomain) => api.put('/store/domain', { customDomain }),

  getListings: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/listings?${query}` : '/store/listings');
  },

  getOrders: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/orders?${query}` : '/store/orders');
  },

  getOrderStats: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/orders/stats?${query}` : '/store/orders/stats');
  },

  exportOrders: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/orders/export?${query}` : '/store/orders/export', {
      responseType: 'blob',
    });
  },

  getOrderById: async (id) => api.get(`/store/orders/${id}`),

  getOrder: async (id) => api.get(`/store/orders/${id}`),

  updateOrderStatus: async (id, status, payload = {}) => (
    api.patch(`/store/orders/${id}/status`, { ...payload, status })
  ),

  getTradeAssuranceDashboard: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/trade-assurance/dashboard?${query}` : '/store/trade-assurance/dashboard');
  },

  releaseTradeAssurancePayout: async (orderId, payload = {}) => (
    api.post(`/store/trade-assurance/orders/${orderId}/release`, payload)
  ),

  refundTradeAssuranceOrder: async (orderId, payload = {}) => (
    api.post(`/store/trade-assurance/orders/${orderId}/refund`, payload)
  ),

  createListing: async (payload) => api.post('/store/listings', payload),

  updateListing: async (id, payload) => api.patch(`/store/listings/${id}`, payload),

  getListingForProduct: async (productId) => {
    const query = buildQuery({ productId, limit: 1 });
    const response = await api.get(`/store/listings?${query}`);
    const body = response?.data ? response : response || {};
    const listings = Array.isArray(body.data) ? body.data : [];
    return listings[0] || null;
  },

  deleteListing: async (id) => api.delete(`/store/listings/${id}`),

  publishListing: async (id) => api.patch(`/store/listings/${id}/publish`),

  unpublishListing: async (id) => api.patch(`/store/listings/${id}/unpublish`),

  createOrUpdateProductListing: async (productId, payload) => (
    api.post(`/products/${productId}/store-listing`, payload)
  ),

  uploadListingImages: async (files) => {
    const formData = new FormData();
    Array.from(files || []).slice(0, 5).forEach((file) => formData.append('files', file));
    const query = buildScopedQueryString();
    const response = await api.post(`/store/listings/upload-images${query ? `?${query}` : ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response?.data ?? response;
  },

  uploadStoreAsset: async (file) => {
    const result = await storeService.uploadListingImages(file ? [file] : []);
    const imageUrls = result?.data?.imageUrls || result?.imageUrls || [];
    return imageUrls[0] || '';
  },

  getServiceListings: async (params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/store/service-listings?${query}` : '/store/service-listings');
  },

  createServiceListing: async (payload) => api.post('/store/service-listings', payload),

  updateServiceListing: async (id, payload) => api.patch(`/store/service-listings/${id}`, payload),

  deleteServiceListing: async (id) => api.delete(`/store/service-listings/${id}`),

  publishServiceListing: async (id) => api.patch(`/store/service-listings/${id}/publish`),

  unpublishServiceListing: async (id) => api.patch(`/store/service-listings/${id}/unpublish`),

  importServiceListingFromPricingTemplate: async (templateId, payload = {}) => (
    api.post(`/store/service-listings/import/pricing-template/${templateId}`, payload)
  ),

  uploadServiceListingImages: async (files) => {
    const formData = new FormData();
    Array.from(files || []).slice(0, 5).forEach((file) => formData.append('files', file));
    const query = buildScopedQueryString();
    const response = await api.post(`/store/service-listings/upload-images${query ? `?${query}` : ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response?.data ?? response;
  },
};

export default storeService;
