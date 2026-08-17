import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';

type JobParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export const jobService = {
  getJobs: async (params: JobParams = {}) => {
    const query = await buildScopedQueryString(params);
    const res = await api.get(query ? `/jobs?${query}` : '/jobs');
    // Backend returns: { success: true, count: N, pagination: {...}, data: [...] }
    return res.data;
  },

  getJobById: async (id: string) => {
    const res = await api.get(`/jobs/${id}`);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  createJob: async (data: {
    customerId: string;
    title: string;
    description?: string;
    dueDate?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    quotedPrice?: number;
    finalPrice?: number;
    jobType?: string;
    quantity?: number;
    items?: Array<{
      category: string;
      description?: string;
      quantity: number;
      unitPrice: number;
    }>;
    paymentStatus?: 'unpaid' | 'deposit' | 'paid';
    amountPaid?: number;
    paymentMethod?: string;
    paymentReference?: string;
    paymentNotes?: string;
  }) => {
    const query = await buildScopedQueryString({});
    const res = await api.post(query ? `/jobs?${query}` : '/jobs', data);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  updateJob: async (id: string, data: object) => {
    const query = await buildScopedQueryString({});
    const res = await api.put(query ? `/jobs/${id}?${query}` : `/jobs/${id}`, data);
    // Backend returns: { success: true, data: {...} }
    return res.data;
  },

  updateDeliveryStatus: async (id: string, deliveryStatus: string | null) => {
    const res = await api.put(`/jobs/${id}`, { deliveryStatus });
    return res.data;
  },

  uploadAttachment: async (
    id: string,
    file: { uri: string; name: string; mimeType?: string | null }
  ) => {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as unknown as Blob);
    const res = await api.post(`/jobs/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  deleteJob: async (id: string) => {
    const res = await api.delete(`/jobs/${id}`);
    return res.data;
  },
};
