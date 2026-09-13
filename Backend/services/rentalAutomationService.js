const { Rental, RentalItem, Product, Customer, LateCharge, DamageReport } = require('../models');
const { generateRentalInvoice, syncRentalInvoice, computeRentalTotalDue } = require('./rentalInvoiceService');
const { cancelUnpaidRentalInvoice } = require('./rentalInvoicePaymentService');
const { updateCustomerBalance } = require('./customerBalanceService');
const { invalidateInvoiceListCache, invalidateAfterMutation } = require('../middleware/cache');
const {
  runRentalCreatedAutomations,
  runRentalCreatedStaffAutomations,
  runRentalCheckedOutAutomations,
  runRentalReturnedAutomations,
  runRentalReturnedStaffAutomations,
  runRentalCancelledAutomations,
} = require('./automationEngineService');

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
 * Post-commit rental side effects (invoice, AR, automations).
 * @param {{ event: string, rentalId?: string, rental?: object, tenantId?: string, userId?: string|null }} params
 * @returns {Promise<{ skipped?: boolean, invoice?: object|null, created?: boolean }>}
 */
const runPostRentalAutomation = async ({
  event,
  rentalId = null,
  rental = null,
  tenantId = null,
  userId = null,
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

  try {
    const automationPayload = {
      tenantId: resolvedTenantId,
      rental: resolvedRental,
      invoice: invoiceResult.invoice,
      actorUserId: userId,
    };

    if (event === 'created' || event === 'prebooking_confirmed') {
      await runRentalCreatedAutomations(automationPayload);
      await runRentalCreatedStaffAutomations(automationPayload);
    } else if (event === 'checkout') {
      await runRentalCheckedOutAutomations(automationPayload);
    } else if (event === 'returned') {
      await runRentalReturnedAutomations(automationPayload);
      await runRentalReturnedStaffAutomations(automationPayload);
    } else if (event === 'cancelled') {
      await runRentalCancelledAutomations(automationPayload);
    }
  } catch (automationError) {
    console.error('[rentalAutomation] Engine failed', resolvedRental.id, automationError);
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
