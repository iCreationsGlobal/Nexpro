const express = require('express');
const router = express.Router();
const {
  getMessagesOverview,
  getSmsHistory,
  composeSms,
  listMarketingTemplates,
  createMarketingTemplate,
  updateMarketingTemplate,
  deleteMarketingTemplate,
  listMessageGroups,
  createMessageGroup,
  addGroupMembers,
  updatePreferredSenderId,
  setupBirthdayMessaging,
} = require('../controllers/messagesController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireFeature } = require('../middleware/featureAccess');

router.use(protect);
router.use(tenantContext);
router.use(requireFeature('marketing'));
router.use(authorize('admin', 'manager'));

router.get('/overview', getMessagesOverview);
router.get('/history', getSmsHistory);
router.post('/compose', composeSms);
router.put('/sender-id', updatePreferredSenderId);
router.post('/birthday-setup', setupBirthdayMessaging);

router.get('/templates', listMarketingTemplates);
router.post('/templates', createMarketingTemplate);
router.put('/templates/:id', updateMarketingTemplate);
router.delete('/templates/:id', deleteMarketingTemplate);

router.get('/groups', listMessageGroups);
router.post('/groups', createMessageGroup);
router.post('/groups/:id/members', addGroupMembers);

module.exports = router;
