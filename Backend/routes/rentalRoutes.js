const express = require('express');
const {
  listRentals,
  getRental,
  createRental,
  updateRental,
  extendRental,
  previewExtendRental,
  checkoutRental,
  previewReturnRental,
  returnRental,
  recordRentalPayment,
  waiveLateCharge,
  refundDeposit,
  applyDeposit,
  recordDamage,
  listPreBookings,
  createPreBooking,
  confirmPreBooking,
  cancelPreBooking,
  getRentalDashboard,
  getRentalCalendar,
  getAvailability,
  checkAvailability,
  getRentalAgreementPdf,
  getRentalReturnInspectionPdf,
  runRentalNotifications,
} = require('../controllers/rentalController');
const { getAvailableRentalUnits } = require('../controllers/rentalUnitController');
const { protect, authorize } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { shopContext } = require('../middleware/shopContext');
const { requireFeature } = require('../middleware/featureAccess');

const router = express.Router();

router.use(protect);
router.use(tenantContext);
router.use(shopContext);
router.use(requireFeature('rentals'));

router.get('/dashboard', getRentalDashboard);
router.get('/calendar', getRentalCalendar);
router.post('/notifications/run', authorize('admin', 'manager'), runRentalNotifications);
router.get('/availability', getAvailability);
router.get('/units/available', getAvailableRentalUnits);
router.post('/availability/check', authorize('admin', 'manager', 'staff'), checkAvailability);
router.get('/pre-bookings', listPreBookings);
router.post('/pre-bookings', authorize('admin', 'manager', 'staff'), createPreBooking);
router.post('/pre-bookings/:id/confirm', authorize('admin', 'manager'), confirmPreBooking);
router.post('/pre-bookings/:id/cancel', authorize('admin', 'manager'), cancelPreBooking);

router.route('/')
  .get(listRentals)
  .post(authorize('admin', 'manager', 'staff'), createRental);

router.route('/:id')
  .get(getRental)
  .put(authorize('admin', 'manager', 'staff'), updateRental);

router.post('/:id/extend', authorize('admin', 'manager', 'staff'), extendRental);
router.get('/:id/extend-preview', authorize('admin', 'manager', 'staff'), previewExtendRental);
router.post('/:id/checkout', authorize('admin', 'manager', 'staff'), checkoutRental);
router.get('/:id/return-preview', authorize('admin', 'manager', 'staff'), previewReturnRental);
router.post('/:id/return', authorize('admin', 'manager', 'staff'), returnRental);
router.post('/:id/payment', authorize('admin', 'manager', 'staff'), recordRentalPayment);
router.patch('/:id/late-charges/:chargeId/waive', authorize('admin', 'manager'), waiveLateCharge);
router.post('/:id/deposit/refund', authorize('admin', 'manager'), refundDeposit);
router.post('/:id/deposit/apply', authorize('admin', 'manager'), applyDeposit);
router.post('/:id/damage', authorize('admin', 'manager', 'staff'), recordDamage);
router.get('/:id/pdf/agreement', getRentalAgreementPdf);
router.get('/:id/pdf/return-inspection', getRentalReturnInspectionPdf);

module.exports = router;
