const { Rental, RentalItem, Product, Customer, LateCharge, DamageReport } = require('../models');
const { generateRentalInvoice, syncRentalInvoice, computeRentalTotalDue } = require('./rentalInvoiceService');
const { cancelUnpaidRentalInvoice } = require('./rentalInvoicePaymentService');
const { updateCustomerBalance } = require('./customerBalanceService');
const { invalidateInvoiceListCache, invalidateAfterMutation } = require('../middleware/cache');
const { sendRentalLifecycleMessage } = require('./rentalNotificationService');
const { emitBusinessEvent } = require('./businessEvents');

/** Post-rental events that notify the customer and report a business event. */
const RENTAL_EVENT_MESSAGES = {
  created: { message: 'created', businessEvent: 'rental.created' },
  prebooking_confirmed: { message: 'created', businessEvent: 'rental.created' },
  checkout: { message: 'checked_out', businessEvent: 'rental.checked_out' },
  returned: { message: 'returned', businessEvent: 'rental.returned' },
  cancelled: { message: null, businessEvent: 'rental.cancelled' },
};

const RENTAL_AUTOMATION_INCLUDES = [
  { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product' }] },
  { model: Customer, as: 'customer' },
  { model: LateCharge, as: 'lateCharges' },
  { model: DamageReport, as: 'damageReports' },
];

/**
 * @param {string} rentalId
 * @returns {Promise<object|null>}
 */
const loadRentalForAutomation = async (rentalId) => {
  if (!rentalId) return null;
  return Rental.findByPk(rentalId, { include: RENTAL_AUTOMATION_INCLUDES });
};

const invalidateRentalCaches = (tenantId) => {
  if (!tenantId) return;
  invalidateInvoiceListCache(tenantId);
  invalidateAfterMutation(tenantId);
};

/**
 * Post-commit rental side effects (invoice, AR, customer message, business event).
 * @param {{ event: string, rentalId?: string, rental?: object, tenantId?: string }} params
 * @returns {Promise<{ skipped?: boolean, invoice?: object|null, created?: boolean }>}
 */
const runPostRentalAutomation = async ({
  event,
  rentalId = null,
  rental = null,
  tenantId = null,
} = {}) => {
  const resolvedId = rentalId || rental?.id;
  if (!resolvedId) return { skipped: true, reason: 'missing_rental' };

  let resolvedRental = rental;
  if (!resolvedRental?.items) {
    resolvedRental = await loadRentalForAutomation(resolvedId);
  }
  if (!resolvedRental) return { skipped: true, reason: 'rental_not_found' };

  const resolvedTenantId = tenantId || resolvedRental.tenantId;
  const applyHeldDeposit = event === 'returned';

  let invoiceResult = { invoice: null, created: false };
  try {
    if (event === 'cancelled') {
      await cancelUnpaidRentalInvoice(resolvedRental);
    } else {
      invoiceResult = await generateRentalInvoice(resolvedRental.id, { applyHeldDeposit });
      if (event === 'returned' || event === 'extended' || event === 'damage') {
        await resolvedRental.reload({ include: RENTAL_AUTOMATION_INCLUDES });
        const totalDue = computeRentalTotalDue(
          resolvedRental,
          resolvedRental.lateCharges,
          resolvedRental.damageReports
        );
        if (Number(resolvedRental.totalDue) !== totalDue) {
          await resolvedRental.update({ totalDue });
        }
        await syncRentalInvoice(resolvedRental);
      }
    }
  } catch (invoiceError) {
    console.error('[rentalAutomation] Invoice step failed', resolvedRental.id, invoiceError);
  }

  if (resolvedRental.customerId) {
    try {
      await updateCustomerBalance(resolvedRental.customerId);
    } catch (balanceError) {
      console.error('[rentalAutomation] Customer balance failed', resolvedRental.id, balanceError);
    }
  }

  invalidateRentalCaches(resolvedTenantId);

  const eventConfig = RENTAL_EVENT_MESSAGES[event];
  if (eventConfig) {
    emitBusinessEvent(resolvedTenantId, eventConfig.businessEvent, {
      rentalId: resolvedRental.id,
      customerId: resolvedRental.customerId || null,
      invoiceId: invoiceResult.invoice?.id || null,
    });
    if (eventConfig.message) {
      try {
        // The invoice step writes rental.metadata on its own instance; reload before logging the send.
        if (typeof resolvedRental.reload === 'function') {
          await resolvedRental.reload({ include: RENTAL_AUTOMATION_INCLUDES });
        }
        await sendRentalLifecycleMessage({
          rental: resolvedRental,
          invoice: invoiceResult.invoice,
          event: eventConfig.message,
        });
      } catch (messageError) {
        console.error('[rentalAutomation] Customer message failed', resolvedRental.id, messageError);
      }
    }
  }

  return invoiceResult;
};

const enqueuePostRentalAutomation = (params) => {
  setImmediate(() => {
    runPostRentalAutomation(params).catch((error) => {
      console.error('[rentalAutomation] Background run failed', params?.rentalId || params?.rental?.id, error);
    });
  });
};

module.exports = {
  loadRentalForAutomation,
  runPostRentalAutomation,
  enqueuePostRentalAutomation,
  invalidateRentalCaches,
};
