const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { startLynkAi } = require('../controllers/lynkAiController');

/** Lynk AI inside ABS (controllers/lynkAiController.js): owners and managers open it from the header or the page. */
const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(studioLocationContext);

router.post('/session', authorize('admin', 'manager'), startLynkAi);

module.exports = router;
