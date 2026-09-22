import api from './api';

const getProfile = async () => api.get('/settings/profile');

const updateProfile = async (payload) => api.put('/settings/profile', payload);

const uploadProfilePicture = async (file) => {
  console.log('[Settings Service] Uploading profile picture:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
    isFile: file instanceof File,
    hasOriginFileObj: !!file?.originFileObj
  });

  // Handle Ant Design Upload file wrapper
  const actualFile = file.originFileObj || file;
  
  if (!actualFile) {
    throw new Error('No file provided');
  }

  const formData = new FormData();
  formData.append('file', actualFile);
  
  console.log('[Settings Service] FormData created, sending request...');
  
  try {
    const response = await api.post('/settings/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    console.log('[Settings Service] Upload response:', response);
    return response;
  } catch (error) {
    console.error('[Settings Service] Upload error:', error);
    throw error;
  }
};

const getOrganization = async () => api.get('/settings/organization');
const getOrganizationSettings = getOrganization;

const updateOrganization = async (payload) => api.put('/settings/organization', payload);

const uploadOrganizationLogo = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/settings/organization/logo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

const getSubscription = async () => api.get('/settings/subscription');

const updateSubscription = async (payload) => api.put('/settings/subscription', payload);

const initializeSubscriptionPayment = async (payload) =>
  api.post('/subscription/initialize', payload);

const verifySubscriptionPayment = async (reference) =>
  api.get(`/subscription/verify/${encodeURIComponent(reference)}`);

const getSubscriptionStatus = async () => api.get('/subscription/status');

const getSubscriptionPayments = async (params = {}) =>
  api.get('/subscription/payments', { params });

const getNotificationChannels = async () => {
  const res = await api.get('/settings/notification-channels');
  const raw = res?.data?.data ?? res?.data ?? res;
  return raw;
};

const updateCustomerNotificationPreferences = async (payload) => {
  const res = await api.put('/settings/customer-notification-preferences', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getMessageDeliveryRules = async () => {
  const res = await api.get('/settings/message-delivery-rules');
  return res?.data?.data ?? res?.data ?? res;
};

const updateMessageDeliveryRules = async (payload) => {
  const res = await api.put('/settings/message-delivery-rules', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getQuoteWorkflow = async () => {
  const res = await api.get('/settings/quote-workflow');
  return res?.data?.data ?? res?.data ?? { onAccept: 'record_only' };
};

const updateQuoteWorkflow = async (payload) => {
  const res = await api.put('/settings/quote-workflow', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getJobInvoice = async () => {
  const res = await api.get('/settings/job-invoice');
  return res?.data?.data ?? res?.data ?? { autoSendInvoiceOnJobCreation: false };
};

const updateJobInvoice = async (payload) => {
  const res = await api.put('/settings/job-invoice', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getPOSConfig = async () => api.get('/settings/pos-config');

const updatePOSConfig = async (payload) => api.put('/settings/pos-config', payload);

const getInterfaceMode = async () => {
  const res = await api.get('/settings/interface-mode');
  return res?.data?.data ?? res?.data ?? { interfaceMode: 'full', source: 'none' };
};

const updateInterfaceMode = async (interfaceMode) => {
  const res = await api.patch('/settings/interface-mode', { interfaceMode });
  return res?.data?.data ?? res?.data ?? { interfaceMode, source: 'user' };
};

const getDeliverySettings = async () => {
  const res = await api.get('/settings/delivery');
  return res?.data?.data ?? res?.data ?? res;
};

const updateDeliverySettings = async (payload) => {
  const res = await api.put('/settings/delivery', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getRentalSettings = async () => {
  const res = await api.get('/settings/rental');
  return res?.data?.data ?? res?.data ?? res;
};

const updateRentalSettings = async (payload) => {
  const res = await api.put('/settings/rental', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const getAISettings = async () => {
  const res = await api.get('/settings/ai');
  return res?.data?.data ?? res?.data ?? res;
};

const updateAISettings = async (payload) => {
  const res = await api.put('/settings/ai', payload);
  return res?.data?.data ?? res?.data ?? res;
};

const deleteAISettings = async () => {
  const res = await api.delete('/settings/ai');
  return res?.data?.data ?? res?.data ?? res;
};

const getCustomerSources = async () => {
  const res = await api.get('/settings/customer-sources');
  return res?.data ?? [];
};

const getLeadSources = async () => {
  const res = await api.get('/settings/lead-sources');
  return res?.data ?? [];
};

const getPaymentCollectionBanks = async () => {
  console.log('[Settings] getPaymentCollectionBanks: requesting banks (country=ghana)');
  try {
    const res = await api.get('/settings/payment-collection/banks', { params: { country: 'ghana' } });
    const raw = res?.data ?? res;
    const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
    console.log('[Settings] getPaymentCollectionBanks: response', {
      success: raw?.success,
      count: list?.length ?? 0,
      firstCode: list?.[0]?.code,
      firstName: list?.[0]?.name
    });
    return list;
  } catch (err) {
    console.error('[Settings] getPaymentCollectionBanks: failed', {
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data
    });
    throw err;
  }
};

const getPaymentCollectionSettings = async () => {
  const res = await api.get('/settings/payment-collection');
  return res?.data ?? res;
};

/** @param {{ from?: string, to?: string, page?: number, perPage?: number }} params */
const getPaystackWorkspaceTransactions = async (params = {}) => {
  const res = await api.get('/settings/payment-collection/paystack-transactions', { params });
  return res?.data?.data ?? res?.data;
};

const verifyPaymentCollectionPassword = async (password) => {
  const payload = password ? { password } : {};
  const res = await api.post('/settings/payment-collection/verify-password', payload);
  return res?.data ?? res;
};

const sendPaymentCollectionOtp = async (password) => {
  const payload = password ? { password } : {};
  const res = await api.post('/settings/payment-collection/send-otp', payload);
  return res?.data ?? res;
};

const verifyPaymentCollectionOtp = async (payload) => {
  const res = await api.post('/settings/payment-collection/verify-otp', payload);
  return res?.data ?? res;
};

const updatePaymentCollectionSettings = async (payload) => {
  const res = await api.put('/settings/payment-collection', payload);
  return res?.data ?? res;
};

const updateMtnCollectionCredentials = async (payload) => {
  const res = await api.put('/settings/mtn-collection-credentials', payload);
  return res?.data ?? res;
};

const testMtnCollectionCredentials = async (payload) => {
  const res = await api.post('/settings/mtn-collection-credentials/test', payload);
  return res?.data ?? res;
};

const disconnectMtnCollectionCredentials = async (payload) => {
  const res = await api.post('/settings/mtn-collection-credentials/disconnect', payload);
  return res?.data ?? res;
};

const updateHubtelCollectionCredentials = async (payload) => {
  const res = await api.put('/settings/hubtel-collection-credentials', payload);
  return res?.data ?? res;
};

const testHubtelCollectionCredentials = async (payload) => {
  const res = await api.post('/settings/hubtel-collection-credentials/test', payload);
  return res?.data ?? res;
};

const disconnectHubtelCollectionCredentials = async (payload) => {
  const res = await api.post('/settings/hubtel-collection-credentials/disconnect', payload);
  return res?.data ?? res;
};

const getSidebarPreferences = async () => {
  const res = await api.get('/settings/sidebar-preferences');
  return res?.data?.data ?? res?.data ?? { hiddenSidebarKeys: [] };
};

const updateSidebarPreferences = async (payload) => {
  const res = await api.patch('/settings/sidebar-preferences', payload);
  return res?.data?.data ?? res?.data ?? { hiddenSidebarKeys: [] };
};

const getSmsTemplates = async () => {
  const res = await api.get('/settings/sms-templates');
  return res?.data?.data ?? res?.data ?? { templates: [] };
};

const updateSmsTemplate = async (eventKey, payload) => {
  const res = await api.put(`/settings/sms-templates/${encodeURIComponent(eventKey)}`, payload);
  return res?.data?.data ?? res?.data ?? res;
};

const resetSmsTemplate = async (eventKey) => {
  const res = await api.post(`/settings/sms-templates/${encodeURIComponent(eventKey)}/reset`);
  return res?.data?.data ?? res?.data ?? res;
};

export default {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  getOrganization,
  getOrganizationSettings,
  updateOrganization,
  uploadOrganizationLogo,
  getSubscription,
  updateSubscription,
  initializeSubscriptionPayment,
  verifySubscriptionPayment,
  getSubscriptionStatus,
  getSubscriptionPayments,
  getPOSConfig,
  updatePOSConfig,
  getInterfaceMode,
  updateInterfaceMode,
  getDeliverySettings,
  updateDeliverySettings,
  getRentalSettings,
  updateRentalSettings,
  getAISettings,
  updateAISettings,
  deleteAISettings,
  getCustomerSources,
  getLeadSources,
  getNotificationChannels,
  updateCustomerNotificationPreferences,
  getMessageDeliveryRules,
  updateMessageDeliveryRules,
  getQuoteWorkflow,
  updateQuoteWorkflow,
  getJobInvoice,
  updateJobInvoice,
  getPaymentCollectionBanks,
  getPaymentCollectionSettings,
  getPaystackWorkspaceTransactions,
  verifyPaymentCollectionPassword,
  sendPaymentCollectionOtp,
  verifyPaymentCollectionOtp,
  updatePaymentCollectionSettings,
  updateMtnCollectionCredentials,
  testMtnCollectionCredentials,
  disconnectMtnCollectionCredentials,
  updateHubtelCollectionCredentials,
  testHubtelCollectionCredentials,
  disconnectHubtelCollectionCredentials,
  getSidebarPreferences,
  updateSidebarPreferences,
  getSmsTemplates,
  updateSmsTemplate,
  resetSmsTemplate,
};

