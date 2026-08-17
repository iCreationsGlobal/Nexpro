const express = require('express');
const {
  getRevenueReport,
  getExpenseReport,
  getOutstandingPaymentsReport,
  getSalesReport,
  getProfitLossReport,
  getIncomeExpenditureReport,
  getProfitLossComplianceReport,
  getFinancialPositionReport,
  getCashFlowReport,
  getKpiSummary,
  getTopCustomers,
  getPipelineSummary,
  getServiceAnalyticsReport,
  getProductSalesReport,
  getPrescriptionReport,
  getProductStockSummary,
  getMaterialsSummary,
  getMaterialsMovements,
  getFastestMovingItems,
  getRevenueByChannel,
  getVatReport,
  generateAIAnalysis,
  getOverviewPhase1,
  getOverviewPhase2,
  getOverviewExtendedKpis
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { cacheMiddleware, generateReportCacheKey } = require('../middleware/cache');
const { exportLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(studioLocationContext);
router.use(authorize('admin', 'manager'));

// Cache report endpoints for 5 minutes (300 seconds)
const reportCache = cacheMiddleware(300, (req) => {
  return generateReportCacheKey(req.tenantId, req.path.replace('/api/reports/', ''), {
    ...req.query,
    shopScope: req.shopFilterId || (req.shopScoped ? 'assigned' : 'all'),
    studioScope: req.studioLocationFilterId || (req.studioLocationScoped ? 'assigned' : 'all'),
  });
});

// Batched overview (fewer round trips for Reports page)
router.get('/overview/phase1', reportCache, getOverviewPhase1);
router.get('/overview/phase2', reportCache, getOverviewPhase2);
router.get('/overview/extended-kpis', reportCache, getOverviewExtendedKpis);

router.get('/revenue', reportCache, getRevenueReport);
router.get('/expenses', reportCache, getExpenseReport);
router.get('/outstanding-payments', reportCache, getOutstandingPaymentsReport);
router.get('/sales', reportCache, getSalesReport);
router.get('/profit-loss/compliance', reportCache, getProfitLossComplianceReport);
router.get('/profit-loss', reportCache, getProfitLossReport);
router.get('/income-expenditure', reportCache, getIncomeExpenditureReport);
router.get('/financial-position', reportCache, getFinancialPositionReport);
router.get('/cashflow', reportCache, getCashFlowReport);
router.get('/kpi-summary', reportCache, getKpiSummary);
router.get('/top-customers', reportCache, getTopCustomers);
router.get('/pipeline-summary', reportCache, getPipelineSummary);
router.get('/service-analytics', reportCache, getServiceAnalyticsReport);
router.get('/product-sales', reportCache, getProductSalesReport);
router.get('/prescription-report', reportCache, getPrescriptionReport);
router.get('/product-stock-summary', reportCache, getProductStockSummary);
router.get('/materials-summary', reportCache, getMaterialsSummary);
router.get('/materials-movements', reportCache, getMaterialsMovements);
router.get('/fastest-moving-items', reportCache, getFastestMovingItems);
router.get('/revenue-by-channel', reportCache, getRevenueByChannel);
router.get('/vat', reportCache, getVatReport);
router.post('/ai-analysis', exportLimiter, generateAIAnalysis); // Rate-limited; no cache for POST

module.exports = router;

