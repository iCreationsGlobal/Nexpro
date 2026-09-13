const { Invoice, Rental } = require('../models');
const { updateCustomerBalance } = require('./customerBalanceService');
const { getRentalDeposit } = require('./rentalDepositService');

const PAID_TOLERANCE = 0.01;

const toNumber = (value) => {
  const n = parseFloat(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const getInvoiceMetadata = (invoice) => (
  invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}
);

/**
 * @param {object|null|undefined} invoice
 * @returns {boolean}
 */
const isRentalSourcedInvoice = (invoice) => {
  if (!invoice) return false;
  if (invoice.sourceType === 'rental') return true;
  const metadata = getInvoiceMetadata(invoice);
  return metadata.generatedFrom === 'rental' || Boolean(metadata.rentalId);
};

/**
 * @param {object|null|undefined} invoice
 * @returns {string|null}
 */
const getRentalIdFromInvoice = (invoice) => {
  const metadata = getInvoiceMetadata(invoice);
  return metadata.rentalId || null;
};

/**
 * Deposit already applied toward the invoice (not hire cash).
 * @param {object|null|undefined} rental
 * @returns {number}
 */
const getAppliedDepositAmount = (rental) => {
  const deposit = getRentalDeposit(rental);
  if (deposit.status !== 'applied') return 0;
  return toNumber(deposit.appliedAmount ?? deposit.paid);
};

/**
 * Invoice amountPaid should include hire paid plus any applied deposit.
 * @param {object} rental
 * @returns {number}
 */
const getExpectedInvoiceAmountPaid = (rental) => {
  const hirePaid = toNumber(rental?.amountPaid);
  return Number((hirePaid + getAppliedDepositAmount(rental)).toFixed(2));
};

/**
 * Hire portion of invoice collections (excludes applied deposit).
 * @param {object} invoice
 * @param {object} rental
 * @returns {number}
 */
const getHirePaidFromInvoice = (invoice, rental) => {
  const invoicePaid = toNumber(invoice?.amountPaid);
  const appliedDeposit = getAppliedDepositAmount(rental);
  const totalDue = toNumber(rental?.totalDue);
  const hirePaid = Math.max(0, invoicePaid - appliedDeposit);
  if (totalDue > 0) return Number(Math.min(hirePaid, totalDue).toFixed(2));
  return Number(hirePaid.toFixed(2));
};

/**
 * Find the invoice linked to a rental (metadata.invoiceId or metadata.rentalId).
 * @param {object} rental
 * @param {{ tenantId?: string }} [options]
 * @returns {Promise<object|null>}
 */
const findInvoiceForRental = async (rental, options = {}) => {
  if (!rental?.id) return null;
  const tenantId = options.tenantId || rental.tenantId;
  const metadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};

  if (metadata.invoiceId) {
    const invoice = await Invoice.findOne({
      where: { id: metadata.invoiceId, ...(tenantId ? { tenantId } : {}) },
    });
    if (invoice && invoice.status !== 'cancelled') return invoice;
  }

  if (!tenantId) return null;

  const invoices = await Invoice.findAll({
    where: { tenantId, customerId: rental.customerId },
    order: [['createdAt', 'DESC']],
    limit: 20,
  });
  return invoices.find((invoice) => getRentalIdFromInvoice(invoice) === rental.id && invoice.status !== 'cancelled') || null;
};

/**
 * Copy hire + applied deposit onto the linked invoice.
 * @param {object} rental
 * @param {{ tenantId?: string, invoice?: object }} [options]
 * @returns {Promise<object|null>}
 */
const syncLinkedInvoiceFromRental = async (rental, options = {}) => {
  const invoice = options.invoice || await findInvoiceForRental(rental, options);
  if (!invoice || invoice.status === 'cancelled') return null;

  const amountPaid = getExpectedInvoiceAmountPaid(rental);
  const updatePayload = { amountPaid };
  if (rental.branchId && !invoice.shopId) {
    updatePayload.shopId = rental.branchId;
  }
  const totalAmount = toNumber(invoice.totalAmount);
  if (totalAmount > 0 && amountPaid >= totalAmount - PAID_TOLERANCE) {
    updatePayload.paidDate = invoice.paidDate || new Date();
  }

  await invoice.update(updatePayload);
  return invoice;
};

/**
 * Copy invoice collections back onto rental.amountPaid (hire only).
 * @param {object} invoice
 * @param {{ rental?: object, tenantId?: string }} [options]
 * @returns {Promise<object|null>}
 */
const syncLinkedRentalFromInvoice = async (invoice, options = {}) => {
  if (!isRentalSourcedInvoice(invoice)) return null;

  const rentalId = getRentalIdFromInvoice(invoice);
  if (!rentalId) return null;

  const rental = options.rental || await Rental.findByPk(rentalId);
  if (!rental) return null;
  if (options.tenantId && rental.tenantId !== options.tenantId) return null;
  if (rental.status === 'cancelled') return null;

  const hirePaid = getHirePaidFromInvoice(invoice, rental);
  if (Math.abs(hirePaid - toNumber(rental.amountPaid)) <= PAID_TOLERANCE) {
    return rental;
  }

  await rental.update({ amountPaid: hirePaid });
  return rental;
};

/**
 * Sync invoice from rental and refresh customer AR.
 * @param {object} rental
 * @param {{ tenantId?: string }} [options]
 * @returns {Promise<object|null>}
 */
const syncRentalInvoiceAndRefreshCustomerBalance = async (rental, options = {}) => {
  const invoice = await syncLinkedInvoiceFromRental(rental, options);
  const customerId = rental?.customerId || invoice?.customerId;
  if (customerId) {
    await updateCustomerBalance(customerId);
  }
  return invoice;
};

/**
 * Sync rental from a paid invoice and refresh customer AR.
 * @param {string} invoiceId
 * @param {{ tenantId?: string, invoice?: object }} [options]
 * @returns {Promise<{ rental: object|null, invoice: object|null }>}
 */
const syncRentalFromPaidInvoice = async (invoiceId, options = {}) => {
  const invoice = options.invoice || await Invoice.findByPk(invoiceId);
  if (!invoice || !isRentalSourcedInvoice(invoice)) {
    return { rental: null, invoice: invoice || null };
  }

  const rental = await syncLinkedRentalFromInvoice(invoice, options);
  const customerId = invoice.customerId || rental?.customerId;
  if (customerId) {
    await updateCustomerBalance(customerId);
  }
  return { rental, invoice };
};

/**
 * Cancel an unpaid rental invoice when the rental is cancelled.
 * @param {object} rental
 * @returns {Promise<object|null>}
 */
const cancelUnpaidRentalInvoice = async (rental) => {
  const invoice = await findInvoiceForRental(rental);
  if (!invoice || invoice.status === 'cancelled') return invoice;
  if (toNumber(invoice.amountPaid) > PAID_TOLERANCE) return invoice;

  await invoice.update({ status: 'cancelled' });
  if (rental.customerId) {
    await updateCustomerBalance(rental.customerId);
  }
  return invoice;
};

module.exports = {
  PAID_TOLERANCE,
  isRentalSourcedInvoice,
  getRentalIdFromInvoice,
  getAppliedDepositAmount,
  getExpectedInvoiceAmountPaid,
  getHirePaidFromInvoice,
  findInvoiceForRental,
  syncLinkedInvoiceFromRental,
  syncLinkedRentalFromInvoice,
  syncRentalInvoiceAndRefreshCustomerBalance,
  syncRentalFromPaidInvoice,
  cancelUnpaidRentalInvoice,
};
