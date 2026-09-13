const { Op } = require('sequelize');
const { Invoice, Rental, RentalItem, Product, LateCharge, DamageReport } = require('../models');
const { applyDepositToInvoice, getRentalDeposit } = require('./rentalDepositService');
const { createInvoiceRevenueJournal } = require('./invoiceAccountingService');
const { updateCustomerBalance } = require('./customerBalanceService');
const { invalidateInvoiceListCache } = require('../middleware/cache');
const { getExpectedInvoiceAmountPaid } = require('./rentalInvoicePaymentService');
const { getDayCount } = require('./rentalAvailabilityService');

const BILLABLE_LATE_CHARGE_STATUSES = ['pending', 'paid'];

/**
 * @param {object} charge
 * @returns {boolean}
 */
const isBillableLateCharge = (charge) => {
  const status = charge?.status || 'pending';
  return BILLABLE_LATE_CHARGE_STATUSES.includes(status);
};

/**
 * @param {object[]} [lateCharges]
 * @returns {number}
 */
const sumBillableLateCharges = (lateCharges = []) => (lateCharges || []).reduce(
  (sum, charge) => sum + (isBillableLateCharge(charge) ? Number(charge.totalCharge || 0) : 0),
  0
);

/**
 * Sum rental amount, billable late charges, and damage minus discount.
 * Waived and cancelled late charges are excluded.
 * @param {object} rental
 * @param {object[]} [lateCharges]
 * @param {object[]} [damageReports]
 * @returns {number}
 */
const computeRentalTotalDue = (rental, lateCharges = [], damageReports = []) => {
  const amount = Number(rental?.amount || 0);
  const discount = Number(rental?.discountAmount || 0);
  const lateChargeTotal = sumBillableLateCharges(lateCharges);
  const damageTotal = (damageReports || []).reduce(
    (sum, record) => sum + Number(record.actualRepairCost || record.estimatedRepairCost || 0),
    0
  );
  return Number((amount + lateChargeTotal + damageTotal - discount).toFixed(2));
};

/**
 * Billable hire days for invoice lines and metadata.
 * @param {object} rental
 * @returns {number}
 */
const resolveRentalInvoiceDays = (rental) => {
  const fromDuration = Number(rental?.rentalDurationDays || 0);
  if (fromDuration > 0) return fromDuration;
  const computed = getDayCount(rental?.startDate, rental?.endDate, rental?.metadata);
  return computed > 0 ? computed : 1;
};

/**
 * Persist hire period on the invoice so print/PDF can show rental details.
 * @param {object} rental
 * @param {object} [extra]
 * @returns {object}
 */
const buildRentalInvoiceMetadata = (rental, extra = {}) => ({
  rentalId: rental.id,
  rentalStatus: rental.status,
  generatedFrom: 'rental',
  startDate: rental.startDate || null,
  endDate: rental.endDate || null,
  rentalDurationDays: resolveRentalInvoiceDays(rental),
  ...extra,
});

/**
 * Build invoice line items for a rental including billable late charges and damage.
 * Quantity is hire days; unit price is daily rate × units.
 * @param {object} rental
 * @returns {{ invoiceItems: object[], lateChargeTotal: number, damageTotal: number }}
 */
const buildRentalInvoiceItems = (rental) => {
  const days = resolveRentalInvoiceDays(rental);
  const invoiceItems = (rental.items || []).map((item) => {
    const units = Number(item.quantity || 1);
    const ratePerDay = Number(item.rentalRatePerDay || 0);
    const name = item.product ? item.product.name : 'Rental item';
    return {
      productId: item.productId,
      description: units > 1 ? `${name} × ${units}` : name,
      category: 'Rental',
      quantity: days,
      unit: 'day',
      unitSymbol: 'day',
      unitPrice: Number((ratePerDay * units).toFixed(2)),
      rate: Number((ratePerDay * units).toFixed(2)),
      amount: Number(item.subtotal || 0),
      total: Number(item.subtotal || 0),
      metadata: {
        rentalDays: days,
        rentalUnits: units,
        ratePerDay,
        startDate: rental.startDate || null,
        endDate: rental.endDate || null,
      },
    };
  });

  const lateChargeTotal = sumBillableLateCharges(rental.lateCharges);
  if (lateChargeTotal > 0) {
    invoiceItems.push({
      description: 'Late return charges',
      category: 'Rental',
      quantity: 1,
      unitPrice: lateChargeTotal,
      rate: lateChargeTotal,
      amount: lateChargeTotal,
      total: lateChargeTotal,
    });
  }

  const damageTotal = (rental.damageReports || []).reduce(
    (sum, record) => sum + Number(record.actualRepairCost || record.estimatedRepairCost || 0),
    0
  );
  if (damageTotal > 0) {
    invoiceItems.push({
      description: 'Damage repair charges',
      category: 'Rental',
      quantity: 1,
      unitPrice: damageTotal,
      rate: damageTotal,
      amount: damageTotal,
      total: damageTotal,
    });
  }

  return { invoiceItems, lateChargeTotal, damageTotal };
};

/**
 * @param {string} tenantId
 * @returns {Promise<string>}
 */
const generateInvoiceNumber = async (tenantId) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const lastInvoice = await Invoice.findOne({
    where: {
      tenantId,
      invoiceNumber: {
        [Op.like]: `INV-${year}${month}%`,
      },
    },
    order: [['createdAt', 'DESC']],
  });

  let sequence = 1;
  if (lastInvoice) {
    const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop(), 10);
    sequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

const deriveInvoiceStatus = (totalAmount, amountPaid) => {
  const balance = Math.max(totalAmount - amountPaid, 0);
  if (balance <= 0.01 && amountPaid > 0) return { status: 'paid', balance: 0 };
  if (amountPaid > 0 && balance > 0) return { status: 'partial', balance };
  return { status: 'sent', balance };
};

const loadRentalForInvoice = async (rentalId) => Rental.findByPk(rentalId, {
  include: [
    { model: RentalItem, as: 'items', include: [{ model: Product, as: 'product' }] },
    { model: LateCharge, as: 'lateCharges' },
    { model: DamageReport, as: 'damageReports' },
  ],
});

const persistInvoiceLink = async (rental, invoice) => {
  await rental.reload();
  const metadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  if (metadata.invoiceId === invoice.id) return;
  await rental.update({
    metadata: {
      ...metadata,
      invoiceId: invoice.id,
    },
  });
};

const linkLateCharges = async (rental, invoice) => {
  if ((rental.lateCharges || []).length > 0) {
    await LateCharge.update(
      { invoiceId: invoice.id },
      { where: { rentalId: rental.id, invoiceId: null } }
    );
  }
};

/**
 * Recalculate and update an existing rental invoice after billing changes.
 * Does not reset amountPaid.
 * @param {object} rental - Sequelize rental with items, lateCharges, damageReports loaded
 * @returns {Promise<{ invoice: object|null, updated: boolean }>}
 */
const syncRentalInvoice = async (rental) => {
  const existingMetadata = (rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {};
  const invoiceId = existingMetadata.invoiceId;
  if (!invoiceId) {
    return { invoice: null, updated: false };
  }

  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice || invoice.status === 'cancelled') {
    return { invoice: null, updated: false };
  }

  const discountAmount = Number(rental.discountAmount || 0);
  const { invoiceItems } = buildRentalInvoiceItems(rental);
  const subtotal = invoiceItems.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);

  await invoice.update({
    items: invoiceItems,
    subtotal,
    discountType: discountAmount > 0 ? 'fixed' : null,
    discountValue: discountAmount,
    metadata: {
      ...(invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}),
      ...buildRentalInvoiceMetadata(rental, {
        lastSyncedFromRentalAt: new Date().toISOString(),
      }),
    },
  });

  return { invoice, updated: true };
};

/**
 * Create or return the existing invoice for a rental (idempotent).
 * Deposit is applied only when `applyHeldDeposit` is true (return / finalize).
 * @param {string} rentalId
 * @param {{ applyHeldDeposit?: boolean }} [options]
 * @returns {Promise<{ invoice: object, created: boolean }>}
 */
const generateRentalInvoice = async (rentalId, options = {}) => {
  const applyHeldDeposit = options.applyHeldDeposit === true;
  const rental = await loadRentalForInvoice(rentalId);

  if (!rental) {
    throw new Error('Rental not found');
  }

  const existingMetadata = (rental.metadata && typeof rental.metadata === 'object') ? rental.metadata : {};
  if (existingMetadata.invoiceId) {
    const existingInvoice = await Invoice.findByPk(existingMetadata.invoiceId);
    if (existingInvoice) {
      await syncRentalInvoice(rental);
      await existingInvoice.reload();
      if (applyHeldDeposit) {
        await applyDepositToInvoice(rental, existingInvoice);
        await existingInvoice.reload();
      }
      return { invoice: existingInvoice, created: false };
    }
  }

  const discountAmount = Number(rental.discountAmount || 0);
  const { invoiceItems } = buildRentalInvoiceItems(rental);
  const subtotal = invoiceItems.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0);
  const deposit = getRentalDeposit(rental);
  const amountPaid = applyHeldDeposit
    ? Number(rental.amountPaid || 0)
    : getExpectedInvoiceAmountPaid(rental);
  const { status: invoiceStatus, balance } = deriveInvoiceStatus(subtotal - discountAmount, amountPaid);
  const invoiceNumber = await generateInvoiceNumber(rental.tenantId);

  const invoice = await Invoice.create({
    tenantId: rental.tenantId,
    shopId: rental.branchId,
    customerId: rental.customerId,
    invoiceNumber,
    sourceType: 'rental',
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    subtotal,
    discountType: discountAmount > 0 ? 'fixed' : null,
    discountValue: discountAmount,
    taxRate: 0,
    amountPaid,
    status: invoiceStatus,
    paymentTerms: balance <= 0 ? 'Due on Receipt' : 'Net 30',
    items: invoiceItems,
    metadata: {
      ...buildRentalInvoiceMetadata(rental, {
        rentalDepositAmount: deposit.amount > 0 ? deposit.amount : null,
        rentalDepositPaid: deposit.paid > 0 ? deposit.paid : null,
        rentalDepositStatus: deposit.status || null,
      }),
    },
    notes: null,
    termsAndConditions:
      'Payment is due within the specified payment terms. Late payments may incur additional charges.',
    ...(balance <= 0 && amountPaid > 0 ? { paidDate: new Date() } : {}),
  });

  if (applyHeldDeposit) {
    await applyDepositToInvoice(rental, invoice);
    await invoice.reload();
  }

  await linkLateCharges(rental, invoice);
  await persistInvoiceLink(rental, invoice);
  invalidateInvoiceListCache(rental.tenantId);

  try {
    await createInvoiceRevenueJournal(invoice);
  } catch (journalError) {
    console.error('[rentalInvoice] Failed to create revenue journal:', journalError?.message);
  }

  if (rental.customerId) {
    try {
      await updateCustomerBalance(rental.customerId);
    } catch (balanceError) {
      console.error('[rentalInvoice] Failed to update customer balance:', balanceError?.message);
    }
  }

  return { invoice, created: true };
};

module.exports = {
  isBillableLateCharge,
  sumBillableLateCharges,
  computeRentalTotalDue,
  buildRentalInvoiceItems,
  generateInvoiceNumber,
  generateRentalInvoice,
  syncRentalInvoice,
};
