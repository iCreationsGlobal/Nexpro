import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';

/** Plain "payment finished" page on the API that Paystack returns the phone's browser to after a card sale. */
export function cardPaymentReturnUrl(): string {
  return `${String(api.defaults.baseURL || '').replace(/\/$/, '')}/public/payment-complete`;
}

type SaleParams = {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  paymentMethod?: string;
  startDate?: string;
  endDate?: string;
  orderStatus?: string;
  activeOrders?: boolean;
  shopId?: string;
};

export const saleService = {
  getSales: async (params: SaleParams = {}) => {
    const query = await buildScopedQueryString(params);
    const res = await api.get(query ? `/sales?${query}` : '/sales', {
      timeout: 60000, // 60 seconds
    });
    // Backend returns: { success: true, count: N, pagination: {...}, data: [...] }
    // Mobile api returns full axios response, so res.data = { success: true, count: N, pagination: {...}, data: [...] }
    return res.data;
  },

  getSaleById: async (id: string) => {
    const res = await api.get(`/sales/${id}`);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  createSale: async (payload: object) => {
    const res = await api.post('/sales', payload);
    return res.data;
  },

  generateInvoice: async (saleId: string) => {
    const res = await api.post(`/sales/${saleId}/generate-invoice`);
    return res.data;
  },

  /** Batch sync offline sales (idempotent by clientId) */
  syncBatch: async (items: Array<{ clientId: string; payload: object }>) => {
    const res = await api.post('/sales/sync', { items });
    return res.data;
  },

  getActivities: async (saleId: string) => {
    const res = await api.get(`/sales/${saleId}/activities`);
    // Backend returns: { success: true, data: [...] }
    return res.data;
  },

  /**
   * Get orders for kitchen dashboard (restaurant only).
   * Uses activeOrders to filter for received/preparing/ready (excludes completed).
   */
  getOrders: async (filters: {
    orderStatus?: string;
    activeOrders?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}) => {
    const params: Record<string, string | number | undefined> = { ...filters } as Record<string, string | number | undefined>;
    if (filters.activeOrders) params.activeOrders = 'true';
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      searchParams.append(key, String(value));
    });
    const query = searchParams.toString();
    const res = await api.get(query ? `/sales?${query}` : '/sales', { timeout: 30000 });
    return res.data;
  },

  /**
   * Update order status (restaurant kitchen only).
   * @param orderStatus - One of: received, preparing, ready, completed
   */
  updateOrderStatus: async (saleId: string, orderStatus: string) => {
    const res = await api.patch(`/sales/${saleId}/order-status`, { orderStatus });
    return res.data;
  },

  updateDeliveryStatus: async (saleId: string, deliveryStatus: string | null) => {
    const res = await api.patch(`/sales/${saleId}/delivery-status`, { deliveryStatus });
    return res.data;
  },

  recordPayment: async (
    saleId: string,
    payload: {
      amount: number;
      paymentMethod?: string;
      referenceNumber?: string;
      paymentDate?: string | Date;
    }
  ) => {
    const body: Record<string, string | number> = {
      amount: payload.amount,
      paymentMethod: payload.paymentMethod || 'cash',
    };
    if (payload.referenceNumber) body.referenceNumber = payload.referenceNumber;
    if (payload.paymentDate) {
      body.paymentDate =
        typeof payload.paymentDate === 'string'
          ? payload.paymentDate
          : payload.paymentDate.toISOString().slice(0, 10);
    }
    const res = await api.post(`/sales/${saleId}/payment`, body);
    return res.data;
  },

  initializePaystackPayment: async (
    saleId: string,
    payload: { email?: string; callbackUrl?: string } = {}
  ) => {
    const body: Record<string, string> = {};
    if (payload.email) body.email = payload.email;
    // Without one, Paystack uses the account's default page, which may be the web dashboard.
    body.callbackUrl = payload.callbackUrl || cardPaymentReturnUrl();
    const res = await api.post(`/sales/${saleId}/initialize-paystack`, body);
    return res.data;
  },

  initiateDirectMobileMoney: async (
    saleId: string,
    payload: { phoneNumber: string; provider: string }
  ) => {
    const res = await api.post(`/sales/${saleId}/paystack-mobile-money`, payload);
    return res.data;
  },

  submitPaystackOtp: async (
    saleId: string,
    payload: { otp: string; reference?: string }
  ) => {
    const body: Record<string, string> = { otp: payload.otp };
    if (payload.reference) body.reference = payload.reference;
    const res = await api.post(`/sales/${saleId}/paystack-submit-otp`, body);
    return res.data;
  },

  checkPaystackCharge: async (saleId: string) => {
    const res = await api.get(`/sales/${saleId}/check-paystack-charge`);
    return res.data;
  },

  cancelSale: async (saleId: string) => {
    const res = await api.post(`/sales/${saleId}/cancel`);
    return res.data;
  },

  deleteSale: async (saleId: string) => {
    const res = await api.delete(`/sales/${saleId}`);
    return res.data;
  },

  getReceipt: async (saleId: string) => {
    const res = await api.get(`/sales/${saleId}/receipt`);
    return res.data;
  },

  sendReceipt: async (
    saleId: string,
    payload: { channels: Array<'sms' | 'whatsapp' | 'email'>; phone?: string; email?: string }
  ) => {
    const res = await api.post(`/sales/${saleId}/send-receipt`, payload);
    return res.data;
  },
};
