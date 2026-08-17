const express = require('express');
const {
  getEvatStatus,
  updateEvatSettings,
  testStamp,
  stampExisting,
  getFilingSummary,
} = require('../controllers/evatController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const router = express.Router();

router.use(protect);
router.use(tenantContext);

router.get('/status', authorize('admin', 'manager', 'staff'), getEvatStatus);
router.put('/settings', authorize('admin', 'manager'), updateEvatSettings);
router.post('/test-stamp', authorize('admin', 'manager'), testStamp);
router.post('/stamp', authorize('admin', 'manager', 'staff'), stampExisting);
router.get('/filing-summary', authorize('admin', 'manager'), getFilingSummary);

module.exports = router;
