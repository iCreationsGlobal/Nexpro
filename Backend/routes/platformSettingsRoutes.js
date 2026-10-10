const express = require('express');
const { protect, requirePlatformAdmin } = require('../middleware/auth');
const { requirePlatformAdminPermission } = require('../middleware/platformAdminPermissions');
const {
  getPlatformSettings,
  updatePlatformSettings,
  testPlatformEmailSettings,
  testPlatformSmsSettings,
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  reorderSubscriptionPlans,
  syncPaystackPlans,
  getFeatureCatalog,
  getFeaturePlanMatrix,
  updateFeaturePlanMatrix,
  getModules,
  getTenantStorageUsage
} = require('../controllers/platformSettingsController');

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

/**
 * @swagger
 * tags:
 *   name: PlatformSettings
 *   description: Platform-wide configuration, branding, and feature flags
 */

/**
 * @swagger
 * /api/platform-settings:
 *   get:
 *     summary: Retrieve platform settings
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current platform settings.
 */
router.get('/', requirePlatformAdminPermission('settings.view'), getPlatformSettings);

/**
 * @swagger
 * /api/platform-settings:
 *   put:
 *     summary: Update platform settings
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               branding:
 *                 type: object
 *               featureFlags:
 *                 type: object
 *               communications:
 *                 type: object
 *     responses:
 *       200:
 *         description: Platform settings updated.
 */
router.put('/', requirePlatformAdminPermission('settings.manage'), updatePlatformSettings);

router.post('/email/test', requirePlatformAdminPermission('settings.manage'), testPlatformEmailSettings);
router.post('/sms/test', requirePlatformAdminPermission('settings.manage'), testPlatformSmsSettings);

/**
 * @swagger
 * /api/platform-settings/features:
 *   get:
 *     summary: Get feature catalog
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Feature catalog with categories
 */
router.get('/features', getFeatureCatalog);
router.get('/feature-matrix', getFeaturePlanMatrix);
router.put('/feature-matrix', requirePlatformAdminPermission('settings.manage'), updateFeaturePlanMatrix);

/**
 * @swagger
 * /api/platform-settings/modules:
 *   get:
 *     summary: Get modules (organized features for pricing)
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Modules with grouped features
 */
router.get('/modules', getModules);

/**
 * @swagger
 * /api/platform-settings/storage-usage/:tenantId:
 *   get:
 *     summary: Get storage usage for a tenant
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Storage usage details
 */
router.get('/storage-usage/:tenantId', getTenantStorageUsage);

/**
 * @swagger
 * /api/platform-settings/plans:
 *   get:
 *     summary: Get all subscription plans (CMS)
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all subscription plans
 */
router.get('/plans', getSubscriptionPlans);

/**
 * @swagger
 * /api/platform-settings/plans:
 *   post:
 *     summary: Create new subscription plan
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Subscription plan created
 */
router.post('/plans', requirePlatformAdminPermission('settings.manage'), createSubscriptionPlan);

/**
 * @swagger
 * /api/platform-settings/plans/bulk/reorder:
 *   put:
 *     summary: Reorder subscription plans
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Plan order updated
 */
router.put('/plans/bulk/reorder', requirePlatformAdminPermission('settings.manage'), reorderSubscriptionPlans);

/**
 * @swagger
 * /api/platform-settings/plans/sync-paystack:
 *   post:
 *     summary: Sync plans from Paystack to database
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Plans synced from Paystack
 */
router.post('/plans/sync-paystack', requirePlatformAdminPermission('settings.manage'), syncPaystackPlans);

/**
 * @swagger
 * /api/platform-settings/plans/:id:
 *   get:
 *     summary: Get single subscription plan
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plan details
 */
router.get('/plans/:id', getSubscriptionPlan);

/**
 * @swagger
 * /api/platform-settings/plans/:id:
 *   put:
 *     summary: Update subscription plan
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plan updated
 */
router.put('/plans/:id', requirePlatformAdminPermission('settings.manage'), updateSubscriptionPlan);

/**
 * @swagger
 * /api/platform-settings/plans/:id:
 *   delete:
 *     summary: Delete subscription plan
 *     tags: [PlatformSettings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plan deleted
 */
router.delete('/plans/:id', requirePlatformAdminPermission('settings.manage'), deleteSubscriptionPlan);

module.exports = router;

