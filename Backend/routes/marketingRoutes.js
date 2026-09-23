const express = require('express');
const {
  createCampaign,
  getCampaign,
  getCapabilities,
  getOverview,
  getCampaignRecipients,
  getPreview,
  listCampaigns,
  postBroadcast,
  retryCampaignFailed,
  scheduleCampaign,
  sendCampaign,
  updateCampaign,
} = require('../controllers/marketingController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { bulkOperationLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(protect);
router.use(tenantContext);

/**
 * @openapi
 * /api/marketing/capabilities:
 *   get:
 *     summary: Marketing channel availability (email, SMS, WhatsApp)
 *     tags: [Marketing]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Per-channel configured flag
 */
router.get('/capabilities', authorize('admin', 'manager'), getCapabilities);
router.get('/overview', authorize('admin', 'manager'), getOverview);

/**
 * @openapi
 * /api/marketing/preview:
 *   get:
 *     summary: Recipient counts for customer broadcast
 *     tags: [Marketing]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema: { type: string, enum: ['true', 'false'] }
 *     responses:
 *       200:
 *         description: Counts and capabilities
 */
router.get('/preview', authorize('admin', 'manager'), getPreview);
router.get('/campaigns', authorize('admin', 'manager'), listCampaigns);
router.post('/campaigns', authorize('admin', 'manager'), createCampaign);
router.get('/campaigns/:id', authorize('admin', 'manager'), getCampaign);
router.put('/campaigns/:id', authorize('admin', 'manager'), updateCampaign);
router.post('/campaigns/:id/send', bulkOperationLimiter, authorize('admin', 'manager'), sendCampaign);
router.post('/campaigns/:id/schedule', authorize('admin', 'manager'), scheduleCampaign);
router.get('/campaigns/:id/recipients', authorize('admin', 'manager'), getCampaignRecipients);
router.post('/campaigns/:id/retry-failed', bulkOperationLimiter, authorize('admin', 'manager'), retryCampaignFailed);

/**
 * @openapi
 * /api/marketing/broadcast:
 *   post:
 *     summary: Send bulk message to customers or leads
 *     tags: [Marketing]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               audienceType: { type: string, enum: [customer, lead], description: 'Defaults to customer.' }
 *               channels: { type: array, items: { type: string } }
 *               dryRun: { type: boolean }
 *               activeOnly: { type: boolean }
 *               customerIds: { type: array, items: { type: string, format: uuid }, description: 'audienceType=customer only. Optional; omit to use full batch.' }
 *               leadIds: { type: array, items: { type: string, format: uuid }, description: 'audienceType=lead only. Optional; omit to use full batch.' }
 *     responses:
 *       200:
 *         description: Send results per channel
 */
router.post('/broadcast', bulkOperationLimiter, authorize('admin', 'manager'), postBroadcast);

module.exports = router;
