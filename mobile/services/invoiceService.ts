import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';
import { logger } from '@/utils/logger';

type InvoiceParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  customerId?: string;
  jobId?: string;
  saleId?: string;
  startDate?: string;
  endDate?: string;
};

export type InvoiceStats = {
  totalInvoices?: number;
  paidInvoices?: number;
  unpaidInvoices?: number;
  overdueInvoices?: number;
  totalRevenue?: number;
  outstandingAmount?: number;
};

function summarizeInvoiceParams(params: InvoiceParams) {
  return {
    page: params.page,
    limit: params.limit,
    status: params.status ?? 'all',
    customerId: params.customerId ?? null,
    jobId: params.jobId ?? null,
    saleId: params.saleId ?? null,
    hasSearch: !!params.search,
    searchLength: params.search?.length ?? 0,
    hasDateRange: !!(params.startDate || params.endDate),
  };
}

function summarizeInvoiceResponse(data: unknown) {
  if (!data || typeof data !== 'object') {
    return { success: undefined, dataShape: typeof data, responseCount: null, dataCount: null };
  }

  const payload = data as { success?: unknown; data?: unknown; count?: unknown; pagination?: unknown };
  return {
    success: payload.success,
    dataShape: Array.isArray(payload.data) ? 'array' : typeof payload.data,
    responseCount: typeof payload.count === 'number' ? payload.count : null,
    dataCount: Array.isArray(payload.data) ? payload.data.length : null,
    hasPagination: !!payload.pagination,
  };
}

export const invoiceService = {
  getInvoices: async (params: InvoiceParams = {}) => {
    const query = await buildScopedQueryString(params);
    logger.info('InvoicesService', 'GET /invoices request', {
      params: summarizeInvoiceParams(params),
      query,
    });
    const res = await api.get(query ? `/invoices?${query}` : '/invoices');
    logger.info('InvoicesService', 'GET /invoices response', summarizeInvoiceResponse(res.data));
    return res.data;
  },

  getStats: async (params: InvoiceParams = {}) => {
    const query = await buildScopedQueryString(params);
    const res = await api.get(
      query ? `/invoices/stats/summary?${query}` : '/invoices/stats/summary'
    );
    return res.data;
  },

  getInvoiceById: async (id: string) => {
    const res = await api.get(`/invoices/${id}`);
    return res.data;
  },

  createInvoice: async (data: object) => {
    const query = await buildScopedQueryString({});
    const res = await api.post(query ? `/invoices?${query}` : '/invoices', data);
    return res.data;
  },

  updateInvoice: async (id: string, data: object) => {
    const query = await buildScopedQueryString({});
    const res = await api.put(query ? `/invoices/${id}?${query}` : `/invoices/${id}`, data);
    return res.data;
  },

  recordPayment: async (id: string, paymentData: object) => {
    const res = await api.post(`/invoices/${id}/payment`, paymentData);
    return res.data;
  },

  ensurePaymentLink: async (id: string) => {
    const res = await api.post(`/invoices/${id}/payment-link`);
    return res.data;
  },

  send: async (id: string) => {
    const res = await api.post(`/invoices/${id}/send`);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await api.post(`/invoices/${id}/cancel`);
    return res.data;
  },

  deleteInvoice: async (id: string) => {
    const res = await api.delete(`/invoices/${id}`);
    return res.data;
  },

  deleteCancelledInvoice: async (id: string) => {
    const res = await api.delete(`/invoices/${id}/cancelled`);
    return res.data;
  },

  markAsPaid: async (id: string) => {
    const res = await api.post(`/invoices/${id}/mark-paid`);
    return res.data;
  },

  verifyPaystackCharge: async (id: string, payload: { reference?: string } = {}) => {
    const body: Record<string, string> = {};
    if (payload.reference) body.reference = payload.reference;
    const res = await api.post(`/invoices/${id}/verify-paystack`, body);
    return res.data;
  },

  initiateDirectMobileMoney: async (
    id: string,
    payload: { phoneNumber: string; provider: string }
  ) => {
    const res = await api.post(`/invoices/${id}/paystack-mobile-money`, payload);
    return res.data;
  },

  submitPaystackOtp: async (
    id: string,
    payload: { otp: string; reference?: string }
  ) => {
    const body: Record<string, string> = { otp: payload.otp };
    if (payload.reference) body.reference = payload.reference;
    const res = await api.post(`/invoices/${id}/paystack-submit-otp`, body);
    return res.data;
  },
};
