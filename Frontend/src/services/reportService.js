import api from './api';
import { buildScopedQueryString } from '../utils/shopScope';

const scopedGet = (path, params = {}) => {
  const queryString = buildScopedQueryString(params);
  return api.get(queryString ? `${path}?${queryString}` : path);
};

const reportService = {
  getRevenueReport: async (startDate = null, endDate = null, groupBy = 'day') => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (groupBy) params.groupBy = groupBy;
    return scopedGet('/reports/revenue', params);
  },

  getExpenseReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/expenses', params);
  },

  getOutstandingPaymentsReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/outstanding-payments', params);
  },

  getSalesReport: async (startDate = null, endDate = null, groupBy = 'jobType') => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (groupBy) params.groupBy = groupBy;
    return scopedGet('/reports/sales', params);
  },

  getProfitLossReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/profit-loss', params);
  },

  getIncomeExpenditureReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/income-expenditure', params);
  },

  getProfitLossComplianceReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/profit-loss/compliance', params);
  },

  getFinancialPositionReport: async (endDate = null) => {
    const params = {};
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/financial-position', params);
  },

  getCashFlowReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/cashflow', params);
  },

  getServiceAnalyticsReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/service-analytics', params);
  },

  getProductSalesReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/product-sales', params);
  },

  getPrescriptionReport: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/prescription-report', params);
  },

  getInventorySummary: async () => scopedGet('/reports/product-stock-summary'),

  getInventoryMovements: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/materials-movements', params);
  },

  getFastestMovingItems: async (startDate = null, endDate = null, limit = 5) => {
    const params = { limit };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/fastest-moving-items', params);
  },

  getRevenueByChannel: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/revenue-by-channel', params);
  },

  getVatReport: async (startDate = null, endDate = null, groupBy = 'month') => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (groupBy) params.groupBy = groupBy;
    return scopedGet('/reports/vat', params);
  },

  /**
   * AI narrative for Smart Report (Insights / Recommendations).
   * Pass options.customQuestion for free-text “Describe with AI” steering.
   * @param {Object} reportData
   * @param {Object} [options]
   * @param {string} [options.customQuestion]
   * @param {Object} [requestConfig] - axios config (e.g. signal for abort)
   */
  generateAIAnalysis: async (reportData, options = {}, requestConfig = {}) => {
    return api.post('/reports/ai-analysis', {
      reportData,
      options,
    }, requestConfig);
  },

  getKpiSummary: async (startDate = null, endDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/kpi-summary', params);
  },

  getTopCustomers: async (startDate = null, endDate = null, limit = 5) => {
    const params = { limit };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/top-customers', params);
  },

  getPipelineSummary: async () => scopedGet('/reports/pipeline-summary'),

  getOverviewPhase1: async (startDate, endDate, groupBy = 'day', includeProductSales = false) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (groupBy) params.groupBy = groupBy;
    if (includeProductSales) params.includeProductSales = 'true';
    return scopedGet('/reports/overview/phase1', params);
  },

  getOverviewPhase2: async (startDate, endDate, limit = 5) => {
    const params = { limit };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return scopedGet('/reports/overview/phase2', params);
  },

  getOverviewExtendedKpis: async (startDate, endDate, compareStartDate = null, compareEndDate = null) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (compareStartDate) params.compareStartDate = compareStartDate;
    if (compareEndDate) params.compareEndDate = compareEndDate;
    return scopedGet('/reports/overview/extended-kpis', params);
  },
};

export default reportService;
