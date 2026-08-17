const express = require('express');
const path = require('path');
const {
  getProfile,
  updateProfile,
  getCustomerSources,
  getLeadSources,
  getOrganizationSettings,
  updateOrganizationSettings,
  getSubscriptionSettings,
  updateSubscriptionSettings,
  getPayrollSettings,
  updatePayrollSettings,
  getAISettings,
  updateAISettings,
  deleteAISettings,
  getWhatsAppSettings,
  updateWhatsAppSettings,
  testWhatsAppConnection,
  getSMSSettings,
  updateSMSSettings,
  testSMSConnection,
  getSmsTemplates,
  updateSmsTemplate,
  resetSmsTemplate,
  getEmailSettings,
  updateEmailSettings,
  testEmailConnection,
  getNotificationChannels,
  getMessageDeliveryRules,
  updateMessageDeliveryRules,
  getDeliverySettings,
  updateDeliverySettings,
  updateCustomerNotificationPreferences,
  getSidebarPreferences,
  updateSidebarPreferences,
  getQuoteWorkflow,
  updateQuoteWorkflow,
  getJobInvoiceSettings,
  updateJobInvoiceSettings,
  getPOSConfig,
  updatePOSConfig,
  uploadProfilePicture,
  uploadOrganizationLogo,
  requestDataDeletion,
  getPaymentCollectionBanks,
  getPaymentCollectionSettings,
  getPaystackWorkspaceTransactions,
  updatePaymentCollectionSettings,
  verifyPaymentCollectionPassword,
  sendPaymentCollectionOtp,
  verifyPaymentCollectionOtp,
  updateMtnCollectionCredentials,
  testMtnCollectionCredentials,
  disconnectMtnCollectionCredentials,
  updateHubtelCollectionCredentials,
  testHubtelCollectionCredentials,
  disconnectHubtelCollectionCredentials
} = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { cacheMiddleware } = require('../middleware/cache');
const { createUploader, checkStorageLimit } = require('../middleware/upload');
const { timeCrudAction } = require('../middleware/crudTiming');

const router = express.Router();

router.use(protect);
router.use(tenantContext);

const generateTenantSettingsKey = (req) => {
  const tenantId = req.tenantId || '';
  return `settings:${tenantId}:${req.path}`;
};

// Use memory storage for images since we store base64 in database
const multer = require('multer');
// Keep avatars small — large base64-in-DB payloads crash React Native Profile.
const profileUploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1.5 * 1024 * 1024, // 1.5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const organizationUploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10) * 1024 * 1024 // 10MB for images
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

router.get('/customer-sources', getCustomerSources);
router.get('/lead-sources', getLeadSources);

router
  .route('/sidebar-preferences')
  .get(timeCrudAction('settings.sidebar_preferences.read'), getSidebarPreferences)
  .patch(timeCrudAction('settings.sidebar_preferences.update'), updateSidebarPreferences);

router
  .route('/profile')
  .get(timeCrudAction('settings.profile.read'), getProfile)
  .put(timeCrudAction('settings.profile.update'), updateProfile);

router.post('/profile/avatar', checkStorageLimit, profileUploader.single('file'), uploadProfilePicture);
router.post('/data-deletion-request', requestDataDeletion);

router
  .route('/organization')
  .get(cacheMiddleware(30, generateTenantSettingsKey), timeCrudAction('settings.organization.read'), getOrganizationSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.organization.update'), updateOrganizationSettings);

router.post(
  '/organization/logo',
  authorize('admin', 'manager'),
  checkStorageLimit,
  organizationUploader.single('file'),
  uploadOrganizationLogo
);

router
  .route('/subscription')
  .get(getSubscriptionSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.subscription.update'), updateSubscriptionSettings);

router
  .route('/payroll')
  .get(getPayrollSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.payroll.update'), updatePayrollSettings);

router
  .route('/ai')
  .get(authorize('admin', 'manager'), getAISettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.ai.update'), updateAISettings)
  .delete(authorize('admin', 'manager'), timeCrudAction('settings.ai.delete'), deleteAISettings);

router
  .route('/whatsapp')
  .get(getWhatsAppSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.whatsapp.update'), updateWhatsAppSettings);

router.post(
  '/whatsapp/test',
  authorize('admin', 'manager'),
  testWhatsAppConnection
);

router
  .route('/sms')
  .get(getSMSSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.sms.update'), updateSMSSettings);

router.post(
  '/sms/test',
  authorize('admin', 'manager'),
  testSMSConnection
);

router.get(
  '/sms-templates',
  authorize('admin', 'manager'),
  getSmsTemplates
);

router.put(
  '/sms-templates/:eventKey',
  authorize('admin', 'manager'),
  timeCrudAction('settings.sms_templates.update'),
  updateSmsTemplate
);

router.post(
  '/sms-templates/:eventKey/reset',
  authorize('admin', 'manager'),
  timeCrudAction('settings.sms_templates.reset'),
  resetSmsTemplate
);

router
  .route('/email')
  .get(getEmailSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.email.update'), updateEmailSettings);

router.post(
  '/email/test',
  authorize('admin', 'manager'),
  testEmailConnection
);

router.get('/notification-channels', cacheMiddleware(30, generateTenantSettingsKey), getNotificationChannels);
router
  .route('/message-delivery-rules')
  .get(authorize('admin', 'manager'), getMessageDeliveryRules)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.message_delivery_rules.update'), updateMessageDeliveryRules);
router
  .route('/delivery')
  .get(getDeliverySettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.delivery.update'), updateDeliverySettings);
router.put(
  '/customer-notification-preferences',
  authorize('admin', 'manager'),
  timeCrudAction('settings.customer_notification_preferences.update'),
  updateCustomerNotificationPreferences
);

router
  .route('/quote-workflow')
  .get(cacheMiddleware(30, generateTenantSettingsKey), getQuoteWorkflow)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.quote_workflow.update'), updateQuoteWorkflow);

router
  .route('/job-invoice')
  .get(getJobInvoiceSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.job_invoice.update'), updateJobInvoiceSettings);

router
  .route('/pos-config')
  .get(getPOSConfig)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.pos_config.update'), updatePOSConfig);

router.get('/payment-collection/banks', getPaymentCollectionBanks);
router.get(
  '/payment-collection/paystack-transactions',
  authorize('admin', 'manager'),
  getPaystackWorkspaceTransactions
);
router.post(
  '/payment-collection/verify-password',
  authorize('admin', 'manager'),
  verifyPaymentCollectionPassword
);
router.post(
  '/payment-collection/send-otp',
  authorize('admin', 'manager'),
  sendPaymentCollectionOtp
);
router.post(
  '/payment-collection/verify-otp',
  authorize('admin', 'manager'),
  verifyPaymentCollectionOtp
);
router
  .route('/payment-collection')
  .get(cacheMiddleware(30, generateTenantSettingsKey), getPaymentCollectionSettings)
  .put(authorize('admin', 'manager'), timeCrudAction('settings.payment_collection.update'), updatePaymentCollectionSettings);

router.put(
  '/mtn-collection-credentials',
  authorize('admin', 'manager'),
  timeCrudAction('settings.mtn_collection_credentials.update'),
  updateMtnCollectionCredentials
);
router.post(
  '/mtn-collection-credentials/test',
  authorize('admin', 'manager'),
  testMtnCollectionCredentials
);
router.post(
  '/mtn-collection-credentials/disconnect',
  authorize('admin', 'manager'),
  timeCrudAction('settings.mtn_collection_credentials.disconnect'),
  disconnectMtnCollectionCredentials
);

router.put(
  '/hubtel-collection-credentials',
  authorize('admin', 'manager'),
  timeCrudAction('settings.hubtel_collection_credentials.update'),
  updateHubtelCollectionCredentials
);
router.post(
  '/hubtel-collection-credentials/test',
  authorize('admin', 'manager'),
  testHubtelCollectionCredentials
);
router.post(
  '/hubtel-collection-credentials/disconnect',
  authorize('admin', 'manager'),
  timeCrudAction('settings.hubtel_collection_credentials.disconnect'),
  disconnectHubtelCollectionCredentials
);

module.exports = router;

