const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const {
  getPartnerProgramSettings,
  updatePartnerProgramSettings,
  listCatalogForPartnerProgram,
  listPartnershipApplications,
  approvePartnershipApplication,
  declinePartnershipApplication,
  listPartnerships,
  revokePartnership,
  listPartnerCommissions,
  markPartnerCommissionsPaid,
  listPartnerRemittances,
  createPartnerRemittance,
  listTenantPartnerReferrals,
  listTenantPartnerCashouts,
  approvePartnerCashout,
  rejectPartnerCashout,
  markPartnerCashoutPaid,
} = require('../controllers/partnerProgramController');

const router = express.Router();

router.use(protect);
router.use(tenantContext);

router.get('/settings', authorize('admin', 'manager'), getPartnerProgramSettings);
router.put('/settings', authorize('admin', 'manager'), updatePartnerProgramSettings);
router.get('/catalog', authorize('admin', 'manager'), listCatalogForPartnerProgram);

router.get('/applications', authorize('admin', 'manager'), listPartnershipApplications);
router.post('/applications/:id/approve', authorize('admin', 'manager'), approvePartnershipApplication);
router.post('/applications/:id/decline', authorize('admin', 'manager'), declinePartnershipApplication);

router.get('/partnerships', authorize('admin', 'manager'), listPartnerships);
router.post('/partnerships/:id/revoke', authorize('admin', 'manager'), revokePartnership);

router.get('/commissions', authorize('admin', 'manager'), listPartnerCommissions);
router.post('/commissions/mark-paid', authorize('admin', 'manager'), markPartnerCommissionsPaid);
router.get('/remittances', authorize('admin', 'manager'), listPartnerRemittances);
router.post('/remittances', authorize('admin', 'manager'), createPartnerRemittance);

router.get('/referrals', authorize('admin', 'manager'), listTenantPartnerReferrals);
router.get('/cashouts', authorize('admin', 'manager'), listTenantPartnerCashouts);
router.post('/cashouts/:id/approve', authorize('admin', 'manager'), approvePartnerCashout);
router.post('/cashouts/:id/reject', authorize('admin', 'manager'), rejectPartnerCashout);
router.post('/cashouts/:id/mark-paid', authorize('admin', 'manager'), markPartnerCashoutPaid);

module.exports = router;
