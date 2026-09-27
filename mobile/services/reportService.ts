import { api } from './api';
import { buildScopedQueryString } from '@/utils/shopScope';

/** Report endpoints used by the Simple Mode Reports screen (same API as the web app). */
export const reportService = {
  /** Best sellers for a period: [{ productName, quantitySold, ... }] */
  getFastestMovingItems: async (startDate: string, endDate: string, limit = 5) => {
    const query = await buildScopedQueryString({ startDate, endDate, limit: String(limit) });
    const res = await api.get(`/reports/fastest-moving-items?${query}`);
    return res.data;
  },

  /** Expenses for a period: { totalExpenses, byCategory: [{ category, totalAmount }] } */
  getExpenseReport: async (startDate: string, endDate: string) => {
    const query = await buildScopedQueryString({ startDate, endDate });
    const res = await api.get(`/reports/expenses?${query}`);
    return res.data;
  },
};
