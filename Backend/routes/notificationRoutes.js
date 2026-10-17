const express = require('express');
const { protect } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { cacheMiddleware, generateNotificationSummaryKey } = require('../middleware/cache');
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationSummary,
  getWebPushConfig,
  registerPushToken,
  unregisterPushToken
} = require('../controllers/notificationController');

const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(studioLocationContext);

// Cache summary for 60s to reduce repeated DB hits (same user/tenant)
router.get('/summary', cacheMiddleware(30, generateNotificationSummaryKey), getNotificationSummary);
router.get('/push/web-config', getWebPushConfig);
router.post('/push/register', registerPushToken);
router.post('/push/unregister', unregisterPushToken);
router.post('/mark-all-read', markAllNotificationsRead);
router.put('/:id/read', markNotificationRead);
router.get('/', getNotifications);

module.exports = router;





