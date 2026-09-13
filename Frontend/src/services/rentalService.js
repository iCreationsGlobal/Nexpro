import api from './api';
import { getActiveShopIdForScope } from '../utils/shopScope';

/**
 * Rentals are branch-scoped on the backend via `branchId` (not `shopId`),
 * so we map the active shop onto `branchId` instead of using
 * `withActiveShopScope`, which would send the wrong query key.
 */
const withActiveBranchScope = (params = {}) => {
  const activeShopId = getActiveShopIdForScope();
  return {
    ...params,
    ...(activeShopId && !params.branchId ? { branchId: activeShopId } : {}),
  };
};

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, value);
  });
  return searchParams.toString();
};

const rentalService = {
  /** List rentals for the active tenant/branch. Returns `{ success, data: Rental[] }`. */
  getRentals: async (params = {}) => {
    const query = buildQuery(withActiveBranchScope(params));
    return api.get(query ? `/rentals?${query}` : '/rentals');
  },

  /** Single rental with items, customer, damage reports, late charges and extensions. */
  getById: async (id) => api.get(`/rentals/${id}`),

  createRental: async (payload) => api.post('/rentals', payload),

  updateRental: async (id, payload) => api.put(`/rentals/${id}`, payload),

  /** Extend a rental to a later end date. Body: `{ newEndDate, reason }`. */
  extendRental: async (id, payload) => api.post(`/rentals/${id}/extend`, payload),

  /**
   * Preview extension cost and availability before confirming.
   * Query: `{ newEndDate }` (YYYY-MM-DD).
   */
  previewExtend: async (id, params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/rentals/${id}/extend-preview?${query}` : `/rentals/${id}/extend-preview`);
  },

  /**
   * Check out / hand over a confirmed rental. Body: `{ handoverNotes }`.
   * Transitions confirmed → active and records handover metadata.
   */
  checkoutRental: async (id, payload = {}) => api.post(`/rentals/${id}/checkout`, payload),

  /**
   * Preview return duration and estimated late charge.
   * Query: `{ actualReturnDate }` (YYYY-MM-DD).
   */
  previewReturn: async (id, params = {}) => {
    const query = buildQuery(params);
    return api.get(query ? `/rentals/${id}/return-preview?${query}` : `/rentals/${id}/return-preview`);
  },

  /** Record a return. Body: `{ actualReturnDate, inspectionNotes }`. Late charges are auto-calculated. */
  returnRental: async (id, payload = {}) => api.post(`/rentals/${id}/return`, payload),

  /** Record a hire payment. Body: `{ amount, paymentMethod?, referenceNumber?, paymentDate?, notes? }`. */
  recordPayment: async (id, payload) => api.post(`/rentals/${id}/payment`, payload),

  /** Waive a pending late charge. Body: `{ reason }`. Manager/admin only. */
  waiveLateCharge: async (rentalId, chargeId, payload) =>
    api.patch(`/rentals/${rentalId}/late-charges/${chargeId}/waive`, payload),

  /** Refund a held deposit (full or partial). Body: `{ amount?, reason, paymentMethod?, referenceNumber? }`. Manager/admin only. */
  refundDeposit: async (rentalId, payload) =>
    api.post(`/rentals/${rentalId}/deposit/refund`, payload),

  /** Manually apply held deposit to rental invoice. Manager/admin only. */
  applyDeposit: async (rentalId) => api.post(`/rentals/${rentalId}/deposit/apply`),

  /** Record damage. Auto-creates a pending-approval Expense on the backend. */
  recordDamage: async (id, payload) => api.post(`/rentals/${id}/damage`, payload),

  /** Rental dashboard counters: active, overdue, completed, upcoming pre-bookings. */
  getDashboard: async () => api.get('/rentals/dashboard'),

  /**
   * Calendar events for rentals and pre-bookings in a date range.
   * Query: `{ start, end, branchId? }` (YYYY-MM-DD).
   */
  getCalendar: async (params = {}) => {
    const query = buildQuery(withActiveBranchScope(params));
    return api.get(query ? `/rentals/calendar?${query}` : '/rentals/calendar');
  },

  /**
   * Date-range aware availability for one product.
   * Requires productId, branchId, startDate and endDate.
   */
  getAvailability: async (params = {}) => {
    const query = buildQuery(withActiveBranchScope(params));
    return api.get(query ? `/rentals/availability?${query}` : '/rentals/availability');
  },

  /**
   * Batch availability for rental line items.
   * Body: `{ branchId, startDate, endDate, items: [{ productId, quantity }] }`.
   */
  checkAvailability: async (payload = {}) => {
    const branchId = payload.branchId || getActiveShopIdForScope();
    return api.post('/rentals/availability/check', {
      ...payload,
      ...(branchId && !payload.branchId ? { branchId } : {}),
    });
  },

  getPreBookings: async (params = {}) => {
    const query = buildQuery(withActiveBranchScope(params));
    return api.get(query ? `/rentals/pre-bookings?${query}` : '/rentals/pre-bookings');
  },

  createPreBooking: async (payload) => api.post('/rentals/pre-bookings', payload),

  /** Convert a pre-booking to a rental. Manager/admin only. */
  confirmPreBooking: async (id, payload = {}) =>
    api.post(`/rentals/pre-bookings/${id}/confirm`, payload),

  /** Cancel a pending pre-booking. Manager/admin only. */
  cancelPreBooking: async (id) => api.post(`/rentals/pre-bookings/${id}/cancel`),

  /** Document payload for rental agreement PDF (client-side generation). */
  getAgreementDocument: async (id) => api.get(`/rentals/${id}/pdf/agreement`),

  /** Document payload for return inspection PDF (client-side generation). */
  getReturnInspectionDocument: async (id) => api.get(`/rentals/${id}/pdf/return-inspection`),

  /**
   * Available serialized units for a product and date range.
   * Query: `{ productId, branchId, startDate, endDate, excludeRentalId? }`.
   */
  getAvailableUnits: async (params = {}) => {
    const query = buildQuery(withActiveBranchScope(params));
    return api.get(query ? `/rentals/units/available?${query}` : '/rentals/units/available');
  },
};

export default rentalService;
