const express = require('express');
const { protect, requirePlatformAdmin } = require('../middleware/auth');
const { loadPlatformAdminPermissions, requirePlatformAdminPermission, requireAnyPlatformAdminPermission } = require('../middleware/platformAdminPermissions');
const {
  getPlatformSummary,
  getTenants,
  inviteTenant,
  getTenantInvites,
  revokeTenantInvite,
  bootstrapPlatformAdmin,
  getTenantMetrics,
  getPlatformAlerts,
  getTenantById,
  getTenantAccessAudit,
  updateTenantAccess,
  resetTenantTrial,
  getTenantSubscriptionPayments,
  createTenantSubscriptionPayment,
  getTenantVendors,
  getTenantJobs,
  updateTenantStatus,
  deleteTenant,
  getTenantCleanupRecords,
  cleanupTenantProducts,
  cleanupTenantInvoices,
  cleanupTenantSales,
  cleanupTenantQuotes,
  getBillingSummary,
  getBillingTenants,
  getSystemHealth,
  acknowledgeSystemHealthIssue,
  resolveSystemHealthIssue,
  updateTenantBranding
} = require('../controllers/adminController');
const {
  getAdminKpiSummary,
  getAdminRevenueReport,
  getAdminExpenseReport,
  getAdminPipelineSummary,
  getAdminTopCustomers
} = require('../controllers/adminReportController');
const {
  getAdminLeads,
  getAdminLead,
  createAdminLead,
  updateAdminLead,
  deleteAdminLead,
  addAdminLeadActivity,
  getAdminLeadStats,
  convertAdminLeadToJob
} = require('../controllers/adminLeadController');
const {
  getAdminJobs,
  getAdminJob,
  createAdminJob,
  updateAdminJob,
  assignAdminJob,
  deleteAdminJob,
  getAdminJobStats
} = require('../controllers/adminJobController');
const {
  getAdminExpenseCategories,
  getAdminExpenses,
  getAdminExpense,
  getAdminExpenseStats,
  createAdminExpense
} = require('../controllers/adminExpenseController');
const {
  getAdminCustomers,
  getAdminCustomer,
  createAdminCustomer,
  updateAdminCustomer,
  deleteAdminCustomer
} = require('../controllers/adminCustomerController');
const {
  getSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
} = require('../controllers/adminSupportTicketController');
const {
  getSabitoOverview,
  getSabitoStores,
  getSabitoOrders,
  getSabitoOrder,
  getSabitoTradeAssurance,
  releaseSabitoOrderPayout,
  getSabitoDisputes,
  getSabitoCustomers,
  getSabitoSettings,
} = require('../controllers/adminSabitoController');
const {
  startSupportAccess,
  endSupportAccess,
  getActiveSupportAccess,
} = require('../controllers/adminSupportAccessController');
const {
  getTenantSettings,
  updateTenantSettings,
} = require('../controllers/adminTenantSettingsController');
const {
  getAdminAutomationsOverview,
  getAdminMessagingUsage,
} = require('../controllers/adminAutomationsController');
const {
  listSalesAgents,
  getSalesAgent,
  createSalesAgent,
  updateSalesAgent,
  approveSalesAgent,
  createSalesAgentCode,
  updateSalesAgentCode,
  updateSalesAgentCommission,
} = require('../controllers/adminSalesAgentController');
const {
  listOpsAssets,
  getOpsStats,
  listOpsCustomers,
  createOpsCustomer,
  createOpsAsset,
  updateOpsAsset,
  archiveOpsAsset,
  challengeOpsReveal,
  confirmOpsReveal,
  listOpsReveals,
} = require('../controllers/adminOpsAssetsController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ControlCenter
 *   description: Platform control center endpoints (platform admin only)
 */

/**
 * @swagger
 * /api/admin/bootstrap:
 *   post:
 *     summary: One-time platform admin bootstrap
 *     description: Creates the first platform administrator when none exist yet.
 *     tags: [ControlCenter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: Platform admin created successfully.
 *       409:
 *         description: Platform admin already exists.
 */
router.post('/bootstrap', bootstrapPlatformAdmin);

router.use(protect);
router.use(requirePlatformAdmin);
router.use(loadPlatformAdminPermissions); // Load permissions for all admin routes

/**
 * @swagger
 * /api/admin/summary:
 *   get:
 *     summary: Platform-wide KPIs
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate metrics across all tenants.
 */
router.get('/summary', requirePlatformAdminPermission('overview.view'), getPlatformSummary);

/**
 * @swagger
 * /api/admin/tenants:
 *   get:
 *     summary: Paginated tenant directory
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Page size (default 20)
 *     responses:
 *       200:
 *         description: List of tenants with plan and usage info.
 */
router.get('/tenants', getTenants);
router.post('/tenants/invite', requirePlatformAdminPermission('tenants.create'), inviteTenant);
router.get('/tenants/invites', requirePlatformAdminPermission('tenants.create'), getTenantInvites);
router.delete('/tenants/invites/:id', requirePlatformAdminPermission('tenants.create'), revokeTenantInvite);

/**
 * @swagger
 * /api/admin/metrics/tenants:
 *   get:
 *     summary: Tenant metrics and trends
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Time-series and distribution metrics for tenants.
 */
router.get('/metrics/tenants', getTenantMetrics);

/**
 * @swagger
 * /api/admin/alerts:
 *   get:
 *     summary: Platform alerts
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notices for upcoming trial expirations or tenants needing attention.
 */
router.get('/alerts', getPlatformAlerts);

/**
 * @swagger
 * /api/admin/tenants/{tenantId}:
 *   get:
 *     summary: Tenant detail
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Detailed tenant information, including members.
 *       404:
 *         description: Tenant not found.
 */
router.get('/tenants/:id/vendors', requirePlatformAdminPermission('expenses.manage'), getTenantVendors);
router.get('/tenants/:id/jobs', requirePlatformAdminPermission('expenses.manage'), getTenantJobs);
router.get('/tenants/:id/cleanup', requirePlatformAdminPermission('tenants.delete'), getTenantCleanupRecords);
router.delete('/tenants/:id/cleanup/products', requirePlatformAdminPermission('tenants.delete'), cleanupTenantProducts);
router.delete('/tenants/:id/cleanup/invoices', requirePlatformAdminPermission('tenants.delete'), cleanupTenantInvoices);
router.delete('/tenants/:id/cleanup/sales', requirePlatformAdminPermission('tenants.delete'), cleanupTenantSales);
router.delete('/tenants/:id/cleanup/quotes', requirePlatformAdminPermission('tenants.delete'), cleanupTenantQuotes);
router.get('/tenants/:id', requirePlatformAdminPermission('tenants.view'), getTenantById);
router.get('/tenants/:id/access-audit', requirePlatformAdminPermission('tenants.view'), getTenantAccessAudit);
router.get('/tenants/:id/settings', requirePlatformAdminPermission('tenants.update'), getTenantSettings);
router.patch('/tenants/:id/settings', requirePlatformAdminPermission('tenants.update'), updateTenantSettings);

/**
 * @swagger
 * /api/admin/tenants/{tenantId}/status:
 *   patch:
 *     summary: Update tenant status
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [activate, pause, suspend]
 *     responses:
 *       200:
 *         description: Tenant status updated.
 *       400:
 *         description: Invalid action.
 *       404:
 *         description: Tenant not found.
 */
router.patch('/tenants/:id/status', requirePlatformAdminPermission('tenants.manage_status'), updateTenantStatus);
/**
 * @swagger
 * /api/admin/tenants/{id}:
 *   delete:
 *     summary: Permanently delete a tenant and all tenant-scoped data
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmName]
 *             properties:
 *               confirmName:
 *                 type: string
 *                 description: Exact tenant name, or the literal DELETE
 *     responses:
 *       200:
 *         description: Tenant permanently deleted.
 *       400:
 *         description: Confirmation mismatch or protected tenant.
 *       403:
 *         description: Not a platform admin.
 *       404:
 *         description: Tenant not found.
 */
router.delete('/tenants/:id', requirePlatformAdminPermission('tenants.delete'), deleteTenant);
router.patch('/tenants/:id/access', requirePlatformAdminPermission('tenants.update'), updateTenantAccess);
router.post('/tenants/:id/reset-trial', requirePlatformAdminPermission('tenants.update'), resetTenantTrial);
router.get(
  '/tenants/:id/subscription-payments',
  requirePlatformAdminPermission('billing.view'),
  getTenantSubscriptionPayments
);
router.post(
  '/tenants/:id/subscription-payments',
  requirePlatformAdminPermission('billing.manage'),
  createTenantSubscriptionPayment
);

router.get('/support-access/active', requirePlatformAdminPermission('tenants.support_access'), getActiveSupportAccess);
router.post('/tenants/:id/support-access', requirePlatformAdminPermission('tenants.support_access'), startSupportAccess);
router.post('/support-access/:sessionId/end', requirePlatformAdminPermission('tenants.support_access'), endSupportAccess);

router.get('/support-tickets', requirePlatformAdminPermission('tickets.view'), getSupportTickets);
router.get('/support-tickets/:id', requirePlatformAdminPermission('tickets.view'), getSupportTicket);
router.post('/support-tickets', requirePlatformAdminPermission('tickets.manage'), createSupportTicket);
router.patch('/support-tickets/:id', requirePlatformAdminPermission('tickets.manage'), updateSupportTicket);

/**
 * Sabito marketplace/platform operations routes.
 */
router.get('/sabito/overview', requirePlatformAdminPermission('overview.view'), getSabitoOverview);
router.get('/sabito/stores', requirePlatformAdminPermission('tenants.view'), getSabitoStores);
router.get('/sabito/orders', requirePlatformAdminPermission('tenants.view'), getSabitoOrders);
router.get('/sabito/orders/:id', requirePlatformAdminPermission('tenants.view'), getSabitoOrder);
router.get('/sabito/trade-assurance', requirePlatformAdminPermission('tenants.view'), getSabitoTradeAssurance);
router.post('/sabito/orders/:id/release-payout', requirePlatformAdminPermission('billing.manage'), releaseSabitoOrderPayout);
router.get('/sabito/disputes', requirePlatformAdminPermission('tenants.view'), getSabitoDisputes);
router.get('/sabito/customers', requirePlatformAdminPermission('tenants.view'), getSabitoCustomers);
router.get('/sabito/settings', requirePlatformAdminPermission('settings.view'), getSabitoSettings);

/**
 * Online Store hero library (platform CMS — not Sabito).
 */
const {
  listAdminHeroCategories,
  createAdminHeroCategory,
  updateAdminHeroCategory,
  deleteAdminHeroCategory,
  createAdminHeroDesign,
  updateAdminHeroDesign,
  deleteAdminHeroDesign,
  createAdminHeroColorway,
  updateAdminHeroColorway,
  deleteAdminHeroColorway,
  uploadAdminHeroImage,
} = require('../controllers/onlineStoreHeroController');
const { imageOnlyMulter } = require('../middleware/upload');
const heroImageUploader = imageOnlyMulter();

router.get('/online-store/heroes', requirePlatformAdminPermission('settings.view'), listAdminHeroCategories);
router.post('/online-store/heroes/categories', requirePlatformAdminPermission('settings.view'), createAdminHeroCategory);
router.patch('/online-store/heroes/categories/:id', requirePlatformAdminPermission('settings.view'), updateAdminHeroCategory);
router.delete('/online-store/heroes/categories/:id', requirePlatformAdminPermission('settings.view'), deleteAdminHeroCategory);
router.post(
  '/online-store/heroes/designs',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('thumbnail'),
  createAdminHeroDesign
);
router.patch(
  '/online-store/heroes/designs/:id',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('thumbnail'),
  updateAdminHeroDesign
);
router.delete('/online-store/heroes/designs/:id', requirePlatformAdminPermission('settings.view'), deleteAdminHeroDesign);
router.post(
  '/online-store/heroes/designs/:designId/colorways',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('image'),
  createAdminHeroColorway
);
router.post(
  '/online-store/heroes/colorways',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('image'),
  createAdminHeroColorway
);
router.patch(
  '/online-store/heroes/colorways/:id',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('image'),
  updateAdminHeroColorway
);
router.delete('/online-store/heroes/colorways/:id', requirePlatformAdminPermission('settings.view'), deleteAdminHeroColorway);
router.post(
  '/online-store/heroes/upload',
  requirePlatformAdminPermission('settings.view'),
  heroImageUploader.single('file'),
  uploadAdminHeroImage
);

/**
 * Online Store custom domains (manual verification queue).
 */
const {
  listCustomDomains,
  getPendingCustomDomainCount,
  updateCustomDomainStatus,
} = require('../controllers/adminOnlineStoreDomainController');

router.get(
  '/online-store/domains',
  requirePlatformAdminPermission('tenants.view'),
  listCustomDomains
);
router.get(
  '/online-store/domains/pending-count',
  requirePlatformAdminPermission('tenants.view'),
  getPendingCustomDomainCount
);
router.patch(
  '/online-store/domains/:id',
  requirePlatformAdminPermission('tenants.view'),
  updateCustomDomainStatus
);

/**
 * Online Store admin provisioning (settings, samples, client products).
 */
const {
  getSampleCatalog,
  getTenantOnlineStore,
  upsertTenantOnlineStore,
  seedTenantSampleProducts,
  clearTenantSampleProducts,
  createTenantStoreProduct,
  updateTenantStoreProduct,
  deleteTenantStoreProduct,
  uploadTenantStoreProductImages,
} = require('../controllers/adminOnlineStoreProvisionController');
const storeProductImageUploader = imageOnlyMulter();

router.get(
  '/online-store/sample-catalog',
  requirePlatformAdminPermission('tenants.update'),
  getSampleCatalog
);
router.get(
  '/tenants/:id/online-store',
  requirePlatformAdminPermission('tenants.update'),
  getTenantOnlineStore
);
router.put(
  '/tenants/:id/online-store',
  requirePlatformAdminPermission('tenants.update'),
  upsertTenantOnlineStore
);
router.post(
  '/tenants/:id/online-store/sample-products',
  requirePlatformAdminPermission('tenants.update'),
  seedTenantSampleProducts
);
router.delete(
  '/tenants/:id/online-store/sample-products',
  requirePlatformAdminPermission('tenants.update'),
  clearTenantSampleProducts
);
router.post(
  '/tenants/:id/online-store/products/upload-images',
  requirePlatformAdminPermission('tenants.update'),
  storeProductImageUploader.array('images', 5),
  uploadTenantStoreProductImages
);
router.post(
  '/tenants/:id/online-store/products',
  requirePlatformAdminPermission('tenants.update'),
  createTenantStoreProduct
);
router.patch(
  '/tenants/:id/online-store/products/:listingId',
  requirePlatformAdminPermission('tenants.update'),
  updateTenantStoreProduct
);
router.delete(
  '/tenants/:id/online-store/products/:listingId',
  requirePlatformAdminPermission('tenants.update'),
  deleteTenantStoreProduct
);

/**
 * @swagger
 * /api/admin/billing/summary:
 *   get:
 *     summary: Billing overview
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estimated MRR and plan breakdown.
 */
router.get('/billing/summary', requirePlatformAdminPermission('billing.view'), getBillingSummary);

/**
 * @swagger
 * /api/admin/billing/tenants:
 *   get:
 *     summary: Paying tenants list
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tenants with paid plans.
 */
router.get('/billing/tenants', requirePlatformAdminPermission('billing.view'), getBillingTenants);

/**
 * @swagger
 * /api/admin/health:
 *   get:
 *     summary: Platform system health
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Uptime, database status, and recent alerts.
 */
router.get('/health', requirePlatformAdminPermission('health.view'), getSystemHealth);
router.post(
  '/health/issues/:id/acknowledge',
  requirePlatformAdminPermission('health.view'),
  acknowledgeSystemHealthIssue
);
router.post(
  '/health/issues/:id/resolve',
  requirePlatformAdminPermission('health.view'),
  resolveSystemHealthIssue
);

/**
 * IT Ops vault (domains, servers, services) — platform-admin only
 */
router.get('/ops/stats', requirePlatformAdminPermission('ops.view'), getOpsStats);
router.get('/ops/customers', requirePlatformAdminPermission('ops.view'), listOpsCustomers);
router.post('/ops/customers', requirePlatformAdminPermission('ops.view'), createOpsCustomer);
router.get('/ops/assets', requirePlatformAdminPermission('ops.view'), listOpsAssets);
router.post('/ops/assets', requirePlatformAdminPermission('ops.view'), createOpsAsset);
router.patch('/ops/assets/:id', requirePlatformAdminPermission('ops.view'), updateOpsAsset);
router.delete('/ops/assets/:id', requirePlatformAdminPermission('ops.view'), archiveOpsAsset);
router.post(
  '/ops/assets/:id/reveal/challenge',
  requirePlatformAdminPermission('ops.view'),
  challengeOpsReveal
);
router.post(
  '/ops/assets/:id/reveal/confirm',
  requirePlatformAdminPermission('ops.view'),
  confirmOpsReveal
);
router.get(
  '/ops/assets/:id/reveals',
  requirePlatformAdminPermission('ops.view'),
  listOpsReveals
);

/**
 * Automations & Messaging observability (cross-tenant, privacy-safe)
 */
router.get(
  '/automations/overview',
  requirePlatformAdminPermission('automations.view'),
  getAdminAutomationsOverview
);
router.get(
  '/messaging/usage',
  requirePlatformAdminPermission('automations.view'),
  getAdminMessagingUsage
);

/**
 * Platform-wide report endpoints (aggregate across all tenants)
 */
router.get('/reports/kpi-summary', requirePlatformAdminPermission('reports.view'), getAdminKpiSummary);
router.get('/reports/revenue', requirePlatformAdminPermission('reports.view'), getAdminRevenueReport);
router.get('/reports/expenses', requirePlatformAdminPermission('reports.view'), getAdminExpenseReport);
router.get('/reports/pipeline-summary', requirePlatformAdminPermission('reports.view'), getAdminPipelineSummary);
router.get('/reports/top-customers', requirePlatformAdminPermission('reports.view'), getAdminTopCustomers);

/**
 * Admin Leads routes (for tracking potential customers/businesses)
 */
router.get('/leads', getAdminLeads);
router.get('/leads/stats', getAdminLeadStats);
router.get('/leads/:id', getAdminLead);
router.post('/leads', createAdminLead);
router.put('/leads/:id', updateAdminLead);
router.delete('/leads/:id', deleteAdminLead);
router.post('/leads/:id/activities', addAdminLeadActivity);
router.post('/leads/:id/convert-to-job', convertAdminLeadToJob);

/**
 * Admin Jobs routes (for tracking software projects)
 */
router.get('/jobs', getAdminJobs);
router.get('/jobs/stats', getAdminJobStats);
router.get('/jobs/:id', getAdminJob);
router.post('/jobs', createAdminJob);
router.put('/jobs/:id', updateAdminJob);
router.patch('/jobs/:id/assign', assignAdminJob);
router.delete('/jobs/:id', deleteAdminJob);

/**
 * Admin Expenses routes (platform-wide expense tracking)
 */
router.get('/expenses/categories', requirePlatformAdminPermission('expenses.view'), getAdminExpenseCategories);
router.get('/expenses', requirePlatformAdminPermission('expenses.view'), getAdminExpenses);
router.post('/expenses', requirePlatformAdminPermission('expenses.manage'), createAdminExpense);
router.get('/expenses/stats', requirePlatformAdminPermission('expenses.view'), getAdminExpenseStats);
router.get('/expenses/:id', requirePlatformAdminPermission('expenses.view'), getAdminExpense);

/**
 * Admin Customers routes (platform's own customers, e.g. for jobs like website design)
 */
router.get('/customers', requirePlatformAdminPermission('tenants.view'), getAdminCustomers);
router.post('/customers', requirePlatformAdminPermission('tenants.view'), createAdminCustomer);
router.get('/customers/:id', requirePlatformAdminPermission('tenants.view'), getAdminCustomer);
router.put('/customers/:id', requirePlatformAdminPermission('tenants.view'), updateAdminCustomer);
router.delete('/customers/:id', requirePlatformAdminPermission('tenants.view'), deleteAdminCustomer);

/**
 * @swagger
 * /api/admin/tenants/{tenantId}/branding:
 *   patch:
 *     summary: Update tenant branding
 *     tags: [ControlCenter]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               logoUrl:
 *                 type: string
 *                 description: Base64 encoded image data
 *     responses:
 *       200:
 *         description: Tenant branding updated.
 */
router.patch('/tenants/:id/branding', requirePlatformAdminPermission('tenants.update'), updateTenantBranding);

/**
 * Sales agents (growth / referral attribution + commissions)
 * Specific /codes and /commissions paths must be registered before /:id.
 */
router.get('/sales-agents', requirePlatformAdminPermission('tenants.view'), listSalesAgents);
router.post('/sales-agents', requirePlatformAdminPermission('tenants.create'), createSalesAgent);
router.patch(
  '/sales-agents/codes/:codeId',
  requirePlatformAdminPermission('tenants.update'),
  updateSalesAgentCode
);
router.patch(
  '/sales-agents/commissions/:commissionId',
  requireAnyPlatformAdminPermission(['billing.manage', 'tenants.update']),
  updateSalesAgentCommission
);
router.get('/sales-agents/:id', requirePlatformAdminPermission('tenants.view'), getSalesAgent);
router.patch('/sales-agents/:id', requirePlatformAdminPermission('tenants.update'), updateSalesAgent);
router.post('/sales-agents/:id/approve', requirePlatformAdminPermission('tenants.update'), approveSalesAgent);
router.post('/sales-agents/:id/codes', requirePlatformAdminPermission('tenants.update'), createSalesAgentCode);

module.exports = router;

