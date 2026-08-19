import api from './api';

const getSummary = async () => api.get('/admin/summary');

const getTenants = async (params = {}) => api.get('/admin/tenants', { params });

/** Invite a new tenant (platform admin). Sends email with signup link; invitee creates account and becomes owner. */
const inviteTenant = async (payload) => api.post('/admin/tenants/invite', payload);
const getTenantInvites = async () => api.get('/admin/tenants/invites');
const revokeTenantInvite = async (id) => api.delete(`/admin/tenants/invites/${id}`);

const getTenantMetrics = async () => api.get('/admin/metrics/tenants');

const getAlerts = async () => api.get('/admin/alerts');

const getTenantDetail = async (tenantId) => api.get(`/admin/tenants/${tenantId}`);
const getTenantAccessAudit = async (tenantId) => api.get(`/admin/tenants/${tenantId}/access-audit`);
const getTenantCleanupRecords = async (tenantId, params = {}) =>
  api.get(`/admin/tenants/${tenantId}/cleanup`, { params });
const cleanupTenantProducts = async (tenantId, payload) =>
  api.delete(`/admin/tenants/${tenantId}/cleanup/products`, { data: payload });
const cleanupTenantInvoices = async (tenantId, payload) =>
  api.delete(`/admin/tenants/${tenantId}/cleanup/invoices`, { data: payload });
const cleanupTenantSales = async (tenantId, payload) =>
  api.delete(`/admin/tenants/${tenantId}/cleanup/sales`, { data: payload });
const cleanupTenantQuotes = async (tenantId, payload) =>
  api.delete(`/admin/tenants/${tenantId}/cleanup/quotes`, { data: payload });

const getSupportTickets = async (params = {}) => api.get('/admin/support-tickets', { params });
const getSupportTicket = async (id) => api.get(`/admin/support-tickets/${id}`);
const createSupportTicket = async (payload) => api.post('/admin/support-tickets', payload);
const updateSupportTicket = async (id, payload) => api.patch(`/admin/support-tickets/${id}`, payload);

const getSabitoOverview = async () => api.get('/admin/sabito/overview');
const getSabitoStores = async (params = {}) => api.get('/admin/sabito/stores', { params });
const getSabitoOrders = async (params = {}) => api.get('/admin/sabito/orders', { params });
const getSabitoOrder = async (id) => api.get(`/admin/sabito/orders/${id}`);
const getSabitoTradeAssurance = async (params = {}) => api.get('/admin/sabito/trade-assurance', { params });
const releaseSabitoOrderPayout = async (orderId, payload = {}) => (
  api.post(`/admin/sabito/orders/${orderId}/release-payout`, payload)
);
const getSabitoDisputes = async (params = {}) => api.get('/admin/sabito/disputes', { params });
const getSabitoCustomers = async (params = {}) => api.get('/admin/sabito/customers', { params });
const getSabitoSettings = async () => api.get('/admin/sabito/settings');

const getOnlineStoreHeroLibrary = async () => api.get('/admin/online-store/heroes');
const createOnlineStoreHeroCategory = async (payload) =>
  api.post('/admin/online-store/heroes/categories', payload);
const updateOnlineStoreHeroCategory = async (id, payload) =>
  api.patch(`/admin/online-store/heroes/categories/${id}`, payload);
const deleteOnlineStoreHeroCategory = async (id) =>
  api.delete(`/admin/online-store/heroes/categories/${id}`);
const createOnlineStoreHeroDesign = async (formData) =>
  api.post('/admin/online-store/heroes/designs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
const updateOnlineStoreHeroDesign = async (id, formData) =>
  api.patch(`/admin/online-store/heroes/designs/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
const deleteOnlineStoreHeroDesign = async (id) =>
  api.delete(`/admin/online-store/heroes/designs/${id}`);
const createOnlineStoreHeroColorway = async (formData) =>
  api.post('/admin/online-store/heroes/colorways', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
const updateOnlineStoreHeroColorway = async (id, formData) =>
  api.patch(`/admin/online-store/heroes/colorways/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
const deleteOnlineStoreHeroColorway = async (id) =>
  api.delete(`/admin/online-store/heroes/colorways/${id}`);

const getOnlineStoreDomains = async (params = {}) =>
  api.get('/admin/online-store/domains', { params });
const getOnlineStorePendingDomainCount = async () =>
  api.get('/admin/online-store/domains/pending-count');
const updateOnlineStoreDomainStatus = async (id, action) =>
  api.patch(`/admin/online-store/domains/${id}`, { action });

const getOnlineStoreSampleCatalog = async () =>
  api.get('/admin/online-store/sample-catalog');
const getTenantOnlineStore = async (tenantId) =>
  api.get(`/admin/tenants/${tenantId}/online-store`);
const upsertTenantOnlineStore = async (tenantId, payload) =>
  api.put(`/admin/tenants/${tenantId}/online-store`, payload);
const seedTenantSampleProducts = async (tenantId, sampleIds) =>
  api.post(`/admin/tenants/${tenantId}/online-store/sample-products`, { sampleIds });
const clearTenantSampleProducts = async (tenantId) =>
  api.delete(`/admin/tenants/${tenantId}/online-store/sample-products`);
const createTenantStoreProduct = async (tenantId, payload) =>
  api.post(`/admin/tenants/${tenantId}/online-store/products`, payload);
const updateTenantStoreProduct = async (tenantId, listingId, payload) =>
  api.patch(`/admin/tenants/${tenantId}/online-store/products/${listingId}`, payload);
const deleteTenantStoreProduct = async (tenantId, listingId) =>
  api.delete(`/admin/tenants/${tenantId}/online-store/products/${listingId}`);
const uploadTenantStoreProductImages = async (tenantId, formData) =>
  api.post(`/admin/tenants/${tenantId}/online-store/products/upload-images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

const getActiveSupportAccess = async () => api.get('/admin/support-access/active');
const startSupportAccess = async (tenantId, payload) =>
  api.post(`/admin/tenants/${tenantId}/support-access`, payload);
const endSupportAccess = async (sessionId) =>
  api.post(`/admin/support-access/${sessionId}/end`);

const updateTenantStatus = async (tenantId, action) =>
  api.patch(`/admin/tenants/${tenantId}/status`, { action });

/** Permanently delete tenant and all workspace data (requires matching confirmName or DELETE). */
const deleteTenant = async (tenantId, confirmName) =>
  api.delete(`/admin/tenants/${tenantId}`, { data: { confirmName } });

const updateTenantAccess = async (tenantId, payload) =>
  api.patch(`/admin/tenants/${tenantId}/access`, payload);

/** Grant another ~1-month free trial (expired/unpaid tenants only). */
const resetTenantTrial = async (tenantId, payload = {}) =>
  api.post(`/admin/tenants/${tenantId}/reset-trial`, payload);

const updateTenantBranding = async (tenantId, payload) =>
  api.patch(`/admin/tenants/${tenantId}/branding`, payload);

const getTenantSettings = async (tenantId) => api.get(`/admin/tenants/${tenantId}/settings`);
const updateTenantSettings = async (tenantId, payload) =>
  api.patch(`/admin/tenants/${tenantId}/settings`, payload);

const getBillingSummary = async () => api.get('/admin/billing/summary');

const getBillingTenants = async () => api.get('/admin/billing/tenants');

const getTenantSubscriptionPayments = async (tenantId, params = {}) =>
  api.get(`/admin/tenants/${tenantId}/subscription-payments`, { params });

const createTenantSubscriptionPayment = async (tenantId, payload) =>
  api.post(`/admin/tenants/${tenantId}/subscription-payments`, payload);

const getPlatformSettings = async () => api.get('/platform-settings');

const updatePlatformSettings = async (payload) =>
  api.put('/platform-settings', payload);

const testPlatformEmailSettings = async (payload) =>
  api.post('/platform-settings/email/test', payload);

const testPlatformSmsSettings = async (payload) =>
  api.post('/platform-settings/sms/test', payload);

const getSystemHealth = async () => api.get('/admin/health');

const acknowledgeSystemHealthIssue = async (id) =>
  api.post(`/admin/health/issues/${id}/acknowledge`);

const resolveSystemHealthIssue = async (id) =>
  api.post(`/admin/health/issues/${id}/resolve`);

const getOpsStats = async () => api.get('/admin/ops/stats');

const getOpsCustomers = async () => api.get('/admin/ops/customers');

const createOpsCustomer = async (payload) =>
  api.post('/admin/ops/customers', payload);

const getOpsAssets = async (params = {}) =>
  api.get('/admin/ops/assets', { params });

const createOpsAsset = async (payload) =>
  api.post('/admin/ops/assets', payload);

const updateOpsAsset = async (id, payload) =>
  api.patch(`/admin/ops/assets/${id}`, payload);

const archiveOpsAsset = async (id) =>
  api.delete(`/admin/ops/assets/${id}`);

const challengeOpsReveal = async (id, payload) =>
  api.post(`/admin/ops/assets/${id}/reveal/challenge`, payload);

const confirmOpsReveal = async (id, payload) =>
  api.post(`/admin/ops/assets/${id}/reveal/confirm`, payload);

const getOpsReveals = async (id) =>
  api.get(`/admin/ops/assets/${id}/reveals`);

const getAutomationsOverview = async (params = {}) =>
  api.get('/admin/automations/overview', { params });

const getMessagingUsage = async (params = {}) =>
  api.get('/admin/messaging/usage', { params });

const getPlatformAdmins = async () => api.get('/platform-admins');

/** Roles offered when inviting a platform admin */
const getPlatformAdminInviteRoles = async () => {
  const res = await api.get('/platform-admins/invite-roles');
  const data = res?.data;
  return Array.isArray(data) ? data : [];
};

/** Invite platform admin (same flow as shop invites: invitee sets password at signup) */
const invitePlatformAdmin = async (payload) =>
  api.post('/platform-admins/invite', payload);

const getPlatformAdminInvites = async () =>
  api.get('/platform-admins/invites');

const revokePlatformAdminInvite = async (id) =>
  api.delete(`/platform-admins/invites/${id}`);

const createPlatformAdmin = async (payload) =>
  api.post('/platform-admins', payload);

const updatePlatformAdmin = async (adminId, payload) =>
  api.put(`/platform-admins/${adminId}`, payload);

const getReportKpis = async (params = {}) => api.get('/admin/reports/kpi-summary', { params });

const getReportRevenue = async (params = {}) => api.get('/admin/reports/revenue', { params });

const getReportExpenses = async (params = {}) => api.get('/admin/reports/expenses', { params });

const getReportPipeline = async () => api.get('/admin/reports/pipeline-summary');

const getReportTopCustomers = async (params = {}) =>
  api.get('/admin/reports/top-customers', { params });

const getSubscriptionPlans = async () => {
  console.log('[adminService] getSubscriptionPlans: Making API call to /platform-settings/plans');
  try {
    const result = await api.get('/platform-settings/plans');
    console.log('[adminService] getSubscriptionPlans: API call successful');
    console.log('[adminService] getSubscriptionPlans: Result:', result);
    return result;
  } catch (error) {
    console.error('[adminService] getSubscriptionPlans: API call failed');
    console.error('[adminService] getSubscriptionPlans: Error:', error);
    throw error;
  }
};

const getSubscriptionPlan = async (id) => api.get(`/platform-settings/plans/${id}`);

const createSubscriptionPlan = async (payload) =>
  api.post('/platform-settings/plans', payload);

const updateSubscriptionPlan = async (id, payload) =>
  api.put(`/platform-settings/plans/${id}`, payload);

const deleteSubscriptionPlan = async (id) =>
  api.delete(`/platform-settings/plans/${id}`);

const reorderSubscriptionPlans = async (planOrders) =>
  api.put('/platform-settings/plans/bulk/reorder', { planOrders });

const syncPaystackPlans = async () => api.post('/platform-settings/plans/sync-paystack');

const getFeatureCatalog = async () => api.get('/platform-settings/features');
const getFeatureMatrix = async () => api.get('/platform-settings/feature-matrix');
const updateFeatureMatrix = async (matrix) => api.put('/platform-settings/feature-matrix', { matrix });

const getModules = async () => api.get('/platform-settings/modules');

// Admin Leads
const getSalesAgents = async (params = {}) => api.get('/admin/sales-agents', { params });
const getSalesAgent = async (id) => api.get(`/admin/sales-agents/${id}`);
const createSalesAgent = async (payload) => api.post('/admin/sales-agents', payload);
const updateSalesAgent = async (id, payload) => api.patch(`/admin/sales-agents/${id}`, payload);
const approveSalesAgent = async (id, payload = {}) => api.post(`/admin/sales-agents/${id}/approve`, payload);
const createSalesAgentCode = async (id, payload) => api.post(`/admin/sales-agents/${id}/codes`, payload);
const updateSalesAgentCode = async (codeId, payload) =>
  api.patch(`/admin/sales-agents/codes/${codeId}`, payload);
const updateSalesAgentCommission = async (commissionId, payload) =>
  api.patch(`/admin/sales-agents/commissions/${commissionId}`, payload);

const getAdminLeads = async (params = {}) => api.get('/admin/leads', { params });
const getAdminLead = async (id) => api.get(`/admin/leads/${id}`);
const createAdminLead = async (data) => api.post('/admin/leads', data);
const updateAdminLead = async (id, data) => api.put(`/admin/leads/${id}`, data);
const deleteAdminLead = async (id) => api.delete(`/admin/leads/${id}`);
const addAdminLeadActivity = async (id, data) => api.post(`/admin/leads/${id}/activities`, data);
const getAdminLeadStats = async () => api.get('/admin/leads/stats');
const convertAdminLeadToJob = async (id, jobData) => api.post(`/admin/leads/${id}/convert-to-job`, jobData);

// Admin Jobs
const getAdminJobs = async (params = {}) => api.get('/admin/jobs', { params });
const getAdminJob = async (id) => api.get(`/admin/jobs/${id}`);
const createAdminJob = async (data) => api.post('/admin/jobs', data);
const updateAdminJob = async (id, data) => api.put(`/admin/jobs/${id}`, data);
const assignAdminJob = async (id, userId) => api.patch(`/admin/jobs/${id}/assign`, { assignedTo: userId });
const deleteAdminJob = async (id) => api.delete(`/admin/jobs/${id}`);
const getAdminJobStats = async () => api.get('/admin/jobs/stats');

// Admin Expenses (platform/internal; categories are admin-specific)
const getAdminExpenseCategories = async () => {
  const res = await api.get('/admin/expenses/categories');
  const data = res?.data;
  return Array.isArray(data) ? data : [];
};
const getAdminExpenses = async (params = {}) => api.get('/admin/expenses', { params });
const getAdminExpense = async (id) => api.get(`/admin/expenses/${id}`);
const getAdminExpenseStats = async (params = {}) => api.get('/admin/expenses/stats', { params });
const createAdminExpense = async (data) => api.post('/admin/expenses', data);
const getTenantVendors = async (tenantId) => api.get(`/admin/tenants/${tenantId}/vendors`);
const getTenantJobs = async (tenantId) => api.get(`/admin/tenants/${tenantId}/jobs`);

// Admin Customers (platform's own customers)
const getAdminCustomers = async (params = {}) => api.get('/admin/customers', { params });
const getAdminCustomer = async (id) => api.get(`/admin/customers/${id}`);
const createAdminCustomer = async (data) => api.post('/admin/customers', data);
const updateAdminCustomer = async (id, data) => api.put(`/admin/customers/${id}`, data);
const deleteAdminCustomer = async (id) => api.delete(`/admin/customers/${id}`);

// Platform Admin Roles
const getPlatformAdminRoles = async () => api.get('/platform-admin/roles');
const getPlatformAdminRole = async (id) => api.get(`/platform-admin/roles/${id}`);
const createPlatformAdminRole = async (data) => api.post('/platform-admin/roles', data);
const updatePlatformAdminRole = async (id, data) => api.put(`/platform-admin/roles/${id}`, data);
const deletePlatformAdminRole = async (id) => api.delete(`/platform-admin/roles/${id}`);
const assignPermissionsToRole = async (roleId, permissionIds) => api.post(`/platform-admin/roles/${roleId}/permissions`, { permissionIds });
const getPlatformAdminPermissions = async () => api.get('/platform-admin/permissions');
const getUserRoles = async (userId) => api.get(`/platform-admin/users/${userId}/roles`);
const assignRoleToUser = async (userId, roleId) => api.post(`/platform-admin/users/${userId}/roles`, { roleId });
const removeRoleFromUser = async (userId, roleId) => api.delete(`/platform-admin/users/${userId}/roles/${roleId}`);
const getMyPermissions = async () => api.get('/platform-admin/me/permissions');
const getUserPermissions = async (userId) => api.get(`/platform-admin/users/${userId}/permissions`);

export default {
  getSummary,
  getTenants,
  inviteTenant,
  getTenantInvites,
  revokeTenantInvite,
  getTenantMetrics,
  getAlerts,
  getTenantDetail,
  getTenantAccessAudit,
  getTenantCleanupRecords,
  cleanupTenantProducts,
  cleanupTenantInvoices,
  cleanupTenantSales,
  cleanupTenantQuotes,
  getSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
  getSabitoOverview,
  getSabitoStores,
  getSabitoOrders,
  getSabitoOrder,
  getSabitoTradeAssurance,
  releaseSabitoOrderPayout,
  getSabitoDisputes,
  getSabitoCustomers,
  getSabitoSettings,
  getOnlineStoreHeroLibrary,
  createOnlineStoreHeroCategory,
  updateOnlineStoreHeroCategory,
  deleteOnlineStoreHeroCategory,
  createOnlineStoreHeroDesign,
  updateOnlineStoreHeroDesign,
  deleteOnlineStoreHeroDesign,
  createOnlineStoreHeroColorway,
  updateOnlineStoreHeroColorway,
  deleteOnlineStoreHeroColorway,
  getOnlineStoreDomains,
  getOnlineStorePendingDomainCount,
  updateOnlineStoreDomainStatus,
  getOnlineStoreSampleCatalog,
  getTenantOnlineStore,
  upsertTenantOnlineStore,
  seedTenantSampleProducts,
  clearTenantSampleProducts,
  createTenantStoreProduct,
  updateTenantStoreProduct,
  deleteTenantStoreProduct,
  uploadTenantStoreProductImages,
  getActiveSupportAccess,
  startSupportAccess,
  endSupportAccess,
  updateTenantStatus,
  deleteTenant,
  updateTenantAccess,
  resetTenantTrial,
  updateTenantBranding,
  getTenantSettings,
  updateTenantSettings,
  getBillingSummary,
  getBillingTenants,
  getTenantSubscriptionPayments,
  createTenantSubscriptionPayment,
  getPlatformSettings,
  updatePlatformSettings,
  testPlatformEmailSettings,
  testPlatformSmsSettings,
  getSystemHealth,
  acknowledgeSystemHealthIssue,
  resolveSystemHealthIssue,
  getOpsStats,
  getOpsCustomers,
  createOpsCustomer,
  getOpsAssets,
  createOpsAsset,
  updateOpsAsset,
  archiveOpsAsset,
  challengeOpsReveal,
  confirmOpsReveal,
  getOpsReveals,
  getAutomationsOverview,
  getMessagingUsage,
  getPlatformAdmins,
  getPlatformAdminInviteRoles,
  invitePlatformAdmin,
  getPlatformAdminInvites,
  revokePlatformAdminInvite,
  createPlatformAdmin,
  updatePlatformAdmin,
  getReportKpis,
  getReportRevenue,
  getReportExpenses,
  getReportPipeline,
  getReportTopCustomers,
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  reorderSubscriptionPlans,
  syncPaystackPlans,
  getFeatureCatalog,
  getFeatureMatrix,
  updateFeatureMatrix,
  getModules,
  // Sales Agents
  getSalesAgents,
  getSalesAgent,
  createSalesAgent,
  updateSalesAgent,
  approveSalesAgent,
  createSalesAgentCode,
  updateSalesAgentCode,
  updateSalesAgentCommission,
  // Admin Leads
  getAdminLeads,
  getAdminLead,
  createAdminLead,
  updateAdminLead,
  deleteAdminLead,
  addAdminLeadActivity,
  getAdminLeadStats,
  convertAdminLeadToJob,
  // Admin Jobs
  getAdminJobs,
  getAdminJob,
  createAdminJob,
  updateAdminJob,
  assignAdminJob,
  deleteAdminJob,
  getAdminJobStats,
  // Admin Expenses
  getAdminExpenseCategories,
  getAdminExpenses,
  getAdminExpense,
  getAdminExpenseStats,
  createAdminExpense,
  getTenantVendors,
  getTenantJobs,
  getAdminCustomers,
  getAdminCustomer,
  createAdminCustomer,
  updateAdminCustomer,
  deleteAdminCustomer,
  // Platform Admin Roles
  getPlatformAdminRoles,
  getPlatformAdminRole,
  createPlatformAdminRole,
  updatePlatformAdminRole,
  deletePlatformAdminRole,
  assignPermissionsToRole,
  getPlatformAdminPermissions,
  getUserRoles,
  assignRoleToUser,
  removeRoleFromUser,
  getMyPermissions,
  getUserPermissions,
};

