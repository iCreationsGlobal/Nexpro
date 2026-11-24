const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { studioLocationContext } = require('../middleware/studioLocationContext');
const { getStatus, connect, changePin, useHere, disconnect } = require('../controllers/whatsappAssistantController');

/** ABS on WhatsApp (controllers/whatsappAssistantController.js): owners and managers connect their own WhatsApp. */
const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(studioLocationContext);

router.get('/', authorize('admin', 'manager'), getStatus);
router.post('/connect', authorize('admin', 'manager'), connect);
router.put('/pin', authorize('admin', 'manager'), changePin);
router.put('/here', authorize('admin', 'manager'), useHere);
router.delete('/', disconnect);

module.exports = router;
