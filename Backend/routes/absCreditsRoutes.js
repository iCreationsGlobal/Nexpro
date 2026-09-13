const express = require('express');
const router = express.Router();
const {
  getCreditsSummary,
  listCreditPacks,
  initializeCreditPurchase,
  verifyCreditPurchase,
  adminGrantCredits,
} = require('../controllers/absCreditsController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');

router.use(protect);
router.use(tenantContext);

router.get('/', authorize('admin', 'manager'), getCreditsSummary);
router.get('/packs', authorize('admin', 'manager'), listCreditPacks);
router.post('/initialize', authorize('admin', 'manager'), initializeCreditPurchase);
router.get('/verify/:reference', authorize('admin', 'manager'), verifyCreditPurchase);
router.post('/admin-grant', authorize('admin'), adminGrantCredits);

module.exports = router;
