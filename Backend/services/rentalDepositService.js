const { Payment } = require('../models');

const DEPOSIT_STATUSES = ['held', 'applied', 'refunded'];

/**
 * Map rental payment method to Payment model enum.
 * @param {string} method
 * @returns {string}
 */
const rentalPaymentMethodToPaymentModel = (method) => {
  if (!method) return 'cash';
  const normalized = String(method).toLowerCase();
  if (normalized === 'card') return 'credit_card';
  if (['cash', 'mobile_money', 'check', 'bank_transfer', 'other'].includes(normalized)) {
    return normalized;
  }
  return 'other';
};

/**
 * @param {unknown} value
 * @returns {number}
 */
const normalizeMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Number(amount.toFixed(2));
};

/**
 * Extract normalized deposit object from rental metadata.
 * @param {object|null|undefined} rental
 * @returns {{ amount: number, paid: number, status: string|null, paymentId?: string, paymentMethod?: string, collectedAt?: string, appliedAt?: string, appliedAmount?: number, invoiceId?: string, refundedAt?: string, refundedAmount?: number, refundPaymentId?: string, refundReason?: string, refundMethod?: string }}
 */
const getRentalDeposit = (rental) => {
  const metadata = rental?.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  const raw = metadata.deposit && typeof metadata.deposit === 'object' ? metadata.deposit : {};

  const amount = normalizeMoney(raw.amount ?? raw.depositAmount ?? 0);
  const paid = normalizeMoney(raw.paid ?? raw.depositPaid ?? 0);
  const status = DEPOSIT_STATUSES.includes(raw.status) ? raw.status : (paid > 0 ? 'held' : null);

  return {
    amount,
    paid,
    status,
    paymentId: raw.paymentId || null,
    paymentMethod: raw.paymentMethod || null,
    collectedAt: raw.collectedAt || null,
    appliedAt: raw.appliedAt || null,
    appliedAmount: raw.appliedAmount != null ? normalizeMoney(raw.appliedAmount) : null,
    invoiceId: raw.invoiceId || null,
    refundedAt: raw.refundedAt || null,
    refundedAmount: raw.refundedAmount != null ? normalizeMoney(raw.refundedAmount) : 0,
    refundPaymentId: raw.refundPaymentId || null,
    refundReason: raw.refundReason || null,
    refundMethod: raw.refundMethod || null,
  };
};

/**
 * Amount currently held (not applied or refunded).
 * @param {object|null|undefined} rental
 * @returns {number}
 */
const getDepositHeld = (rental) => {
  const deposit = getRentalDeposit(rental);
  return getDepositRefundableAmount(rental, deposit);
};

/**
 * Amount eligible for refund (held balance or remainder after invoice apply).
 * @param {object|null|undefined} rental
 * @param {ReturnType<typeof getRentalDeposit>} [deposit]
 * @returns {number}
 */
const getDepositRefundableAmount = (rental, deposit = null) => {
  const resolved = deposit || getRentalDeposit(rental);
  if (resolved.status === 'refunded') return 0;
  if (resolved.paid <= 0) return 0;

  const applied = resolved.status === 'applied'
    ? normalizeMoney(resolved.appliedAmount ?? resolved.paid)
    : 0;
  const alreadyRefunded = normalizeMoney(resolved.refundedAmount ?? 0);
  return Number(Math.max(0, resolved.paid - applied - alreadyRefunded).toFixed(2));
};

/**
 * Suggest a deposit amount from workspace defaults or customer profile.
 * @param {{ rentalSettings?: object, customer?: object, rentalSubtotal?: number }} params
 * @returns {number|null}
 */
const resolveSuggestedDepositAmount = ({ rentalSettings = {}, customer = {}, rentalSubtotal = 0 }) => {
  const customerDeposit = customer?.metadata?.rental?.deposit?.standardDepositAmount;
  if (customerDeposit != null && Number(customerDeposit) > 0) {
    return normalizeMoney(customerDeposit);
  }

  const fixedDefault = rentalSettings.defaultDepositAmount;
  if (fixedDefault != null && Number(fixedDefault) > 0) {
    return normalizeMoney(fixedDefault);
  }

  const percentDefault = rentalSettings.defaultDepositPercent;
  if (percentDefault != null && Number(percentDefault) > 0 && rentalSubtotal > 0) {
    return normalizeMoney((rentalSubtotal * Number(percentDefault)) / 100);
  }

  return null;
};

/**
 * Build deposit metadata for rental.metadata.deposit.
 * @param {object} params
 * @returns {object|null}
 */
const buildDepositMetadata = ({
  amount = 0,
  paid = 0,
  status = 'held',
  paymentId = null,
  paymentMethod = null,
  collectedAt = null,
  appliedAt = null,
  appliedAmount = null,
  invoiceId = null,
  refundedAt = null,
  refundedAmount = null,
  refundPaymentId = null,
  refundReason = null,
  refundMethod = null,
}) => {
  const depositAmount = normalizeMoney(amount);
  const depositPaid = normalizeMoney(paid);

  if (depositAmount <= 0 && depositPaid <= 0) {
    return null;
  }

  const resolvedStatus = DEPOSIT_STATUSES.includes(status)
    ? status
    : (depositPaid > 0 ? 'held' : null);

  return compactDeposit({
    amount: depositAmount,
    paid: depositPaid,
    status: resolvedStatus,
    paymentId,
    paymentMethod,
    collectedAt,
    appliedAt,
    appliedAmount,
    invoiceId,
    refundedAt,
    refundedAmount,
    refundPaymentId,
    refundReason,
    refundMethod,
  });
};

/**
 * Omit empty deposit fields.
 * @param {Record<string, unknown>} deposit
 * @returns {object}
 */
const compactDeposit = (deposit) => {
  const result = {};
  if (deposit.amount > 0) result.amount = deposit.amount;
  if (deposit.paid > 0) result.paid = deposit.paid;
  if (deposit.status) result.status = deposit.status;
  if (deposit.paymentId) result.paymentId = deposit.paymentId;
  if (deposit.paymentMethod) result.paymentMethod = deposit.paymentMethod;
  if (deposit.collectedAt) result.collectedAt = deposit.collectedAt;
  if (deposit.appliedAt) result.appliedAt = deposit.appliedAt;
  if (deposit.appliedAmount != null && deposit.appliedAmount > 0) {
    result.appliedAmount = deposit.appliedAmount;
  }
  if (deposit.invoiceId) result.invoiceId = deposit.invoiceId;
  if (deposit.refundedAt) result.refundedAt = deposit.refundedAt;
  if (deposit.refundedAmount != null && deposit.refundedAmount > 0) {
    result.refundedAmount = deposit.refundedAmount;
  }
  if (deposit.refundPaymentId) result.refundPaymentId = deposit.refundPaymentId;
  if (deposit.refundReason) result.refundReason = deposit.refundReason;
  if (deposit.refundMethod) result.refundMethod = deposit.refundMethod;
  return result;
};

/**
 * Parse deposit fields from rental create/update body.
 * @param {object} body
 * @param {{ amount?: number|null, paid?: number|null, status?: string|null }} [existing]
 * @returns {{ amount: number, paid: number, status: string|null, collectDeposit: boolean }}
 */
const parseDepositInput = (body = {}, existing = {}) => {
  const hasAmount = body.depositAmount !== undefined && body.depositAmount !== null && body.depositAmount !== '';
  const hasPaid = body.depositPaid !== undefined && body.depositPaid !== null && body.depositPaid !== '';

  let amount = hasAmount ? normalizeMoney(body.depositAmount) : normalizeMoney(existing.amount ?? 0);
  let paid = 0;
  let status = existing.status || null;

  if (hasPaid) {
    if (body.depositPaid === true) {
      paid = amount > 0 ? amount : normalizeMoney(existing.paid ?? 0);
    } else if (body.depositPaid === false) {
      paid = 0;
    } else {
      paid = normalizeMoney(body.depositPaid);
    }
  } else if (existing.paid != null) {
    paid = normalizeMoney(existing.paid);
  }

  if (body.depositStatus && DEPOSIT_STATUSES.includes(body.depositStatus)) {
    status = body.depositStatus;
  } else if (paid > 0 && !status) {
    status = 'held';
  } else if (paid <= 0 && !hasAmount && !existing.amount) {
    status = null;
  }

  if (amount > 0 && paid > amount) {
    paid = amount;
  }

  const collectDeposit = body.collectDeposit !== false;

  return { amount, paid, status, collectDeposit };
};

/**
 * Record a deposit collection as a Payment (v1 metadata link via description).
 * @param {object} params
 * @returns {Promise<object|null>}
 */
const recordDepositPayment = async ({
  tenantId,
  rentalId,
  customerId,
  amount,
  paymentMethod = 'cash',
  referenceNumber = null,
  notes = null,
  transaction = null,
}) => {
  const paymentAmount = normalizeMoney(amount);
  if (paymentAmount <= 0) return null;

  return Payment.create({
    paymentNumber: `RDP-${Date.now()}`,
    type: 'income',
    tenantId,
    customerId,
    amount: paymentAmount,
    paymentMethod: rentalPaymentMethodToPaymentModel(paymentMethod),
    paymentDate: new Date(),
    referenceNumber: referenceNumber || undefined,
    status: 'completed',
    description: `rental-deposit:${rentalId}`,
    notes: notes || 'Rental security deposit collected',
  }, transaction ? { transaction } : undefined);
};

/**
 * Financial summary fields for rental detail views.
 * @param {object|null|undefined} rental
 * @returns {{ depositAmount: number, depositPaid: number, depositHeld: number, depositStatus: string|null, depositApplied: number, depositPaymentId: string|null, depositInvoiceId: string|null, netBalance: number }}
 */
const getDepositFinancialSummary = (rental) => {
  const deposit = getRentalDeposit(rental);
  const depositRefundable = getDepositRefundableAmount(rental, deposit);
  const depositHeld = deposit.status === 'held' ? depositRefundable : 0;
  const depositApplied = deposit.status === 'applied'
    ? normalizeMoney(deposit.appliedAmount ?? deposit.paid)
    : 0;
  const depositRefunded = normalizeMoney(deposit.refundedAmount ?? 0);

  const totalDue = normalizeMoney(rental?.totalDue ?? 0);
  const amountPaid = normalizeMoney(rental?.amountPaid ?? 0);
  const netBalance = Number(Math.max(0, totalDue - amountPaid - depositApplied).toFixed(2));

  return {
    depositAmount: deposit.amount,
    depositPaid: deposit.paid,
    depositHeld,
    depositRefundable,
    depositStatus: deposit.status,
    depositApplied,
    depositRefunded,
    depositPaymentId: deposit.paymentId,
    depositRefundPaymentId: deposit.refundPaymentId,
    depositInvoiceId: deposit.invoiceId,
    netBalance,
  };
};

/**
 * Apply a held deposit against a rental invoice (idempotent).
 * @param {object} rental - Sequelize rental instance
 * @param {object} invoice - Sequelize invoice instance
 * @param {object} [options]
 * @returns {Promise<{ appliedAmount: number, deposit: object|null, invoiceUpdates: object|null }>}
 */
const applyDepositToInvoice = async (rental, invoice, options = {}) => {
  const existingMetadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  const deposit = getRentalDeposit(rental);

  if (deposit.status === 'applied' && deposit.invoiceId === invoice.id) {
    return {
      appliedAmount: normalizeMoney(deposit.appliedAmount ?? deposit.paid),
      deposit: existingMetadata.deposit || null,
      invoiceUpdates: null,
    };
  }

  if (deposit.status !== 'held' || deposit.paid <= 0) {
    return { appliedAmount: 0, deposit: existingMetadata.deposit || null, invoiceUpdates: null };
  }

  const invoiceTotal = normalizeMoney(invoice.totalAmount ?? invoice.subtotal ?? 0);
  const currentPaid = normalizeMoney(invoice.amountPaid ?? 0);
  const appliedAmount = Number(Math.min(deposit.paid, Math.max(0, invoiceTotal - currentPaid)).toFixed(2));

  if (appliedAmount <= 0) {
    return { appliedAmount: 0, deposit: existingMetadata.deposit || null, invoiceUpdates: null };
  }

  const appliedAt = new Date().toISOString();
  const updatedDeposit = buildDepositMetadata({
    amount: deposit.amount,
    paid: deposit.paid,
    status: 'applied',
    paymentId: deposit.paymentId,
    paymentMethod: deposit.paymentMethod,
    collectedAt: deposit.collectedAt,
    appliedAt,
    appliedAmount,
    invoiceId: invoice.id,
  });

  const newAmountPaid = Number((currentPaid + appliedAmount).toFixed(2));
  const newBalance = Number(Math.max(0, invoiceTotal - newAmountPaid).toFixed(2));
  const invoiceUpdates = {
    amountPaid: newAmountPaid,
    balance: newBalance,
    status: newBalance <= 0.01 ? 'paid' : (invoice.status === 'draft' ? 'sent' : invoice.status),
    paidDate: newBalance <= 0.01 ? appliedAt.slice(0, 10) : invoice.paidDate,
    metadata: {
      ...(invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}),
      rentalDepositApplied: appliedAmount,
      rentalDepositPaymentId: deposit.paymentId || null,
    },
  };

  if (!options.dryRun) {
    await invoice.update(invoiceUpdates);
    await rental.update({
      metadata: {
        ...existingMetadata,
        deposit: updatedDeposit,
      },
    });
  }

  return { appliedAmount, deposit: updatedDeposit, invoiceUpdates };
};

/**
 * Initialize deposit on rental create.
 * @param {object} params
 * @returns {Promise<{ deposit: object|null, paymentId: string|null }>}
 */
const initializeRentalDeposit = async ({
  tenantId,
  rentalId,
  customerId,
  paymentMethod,
  body = {},
  suggestedAmount = null,
  transaction = null,
}) => {
  const parsed = parseDepositInput(body);
  let amount = parsed.amount;
  const hasExplicitAmount =
    body.depositAmount !== undefined && body.depositAmount !== null && body.depositAmount !== '';

  // Only fill a workspace/customer suggestion when the client omitted amount.
  if (!hasExplicitAmount && amount <= 0 && suggestedAmount != null && suggestedAmount > 0) {
    amount = normalizeMoney(suggestedAmount);
  }

  if (amount <= 0 && parsed.paid <= 0) {
    return { deposit: null, paymentId: null };
  }

  let paymentId = null;
  if (parsed.collectDeposit && parsed.paid > 0) {
    const payment = await recordDepositPayment({
      tenantId,
      rentalId,
      customerId,
      amount: parsed.paid,
      paymentMethod: body.depositPaymentMethod || paymentMethod,
      referenceNumber: body.depositReferenceNumber || null,
      notes: body.depositNotes || null,
      transaction,
    });
    paymentId = payment?.id || null;
  }

  const deposit = buildDepositMetadata({
    amount,
    paid: parsed.paid,
    status: parsed.paid > 0 ? 'held' : null,
    paymentId,
    paymentMethod: body.depositPaymentMethod || paymentMethod,
    collectedAt: parsed.paid > 0 ? new Date().toISOString() : null,
  });

  return { deposit, paymentId };
};

/**
 * Record a deposit refund as an expense Payment (v1 metadata link via description).
 * @param {object} params
 * @returns {Promise<object|null>}
 */
const recordDepositRefundPayment = async ({
  tenantId,
  rentalId,
  customerId,
  amount,
  paymentMethod = 'cash',
  referenceNumber = null,
  reason = null,
  transaction = null,
}) => {
  const refundAmount = normalizeMoney(amount);
  if (refundAmount <= 0) return null;

  return Payment.create({
    paymentNumber: `RDR-${Date.now()}`,
    type: 'expense',
    tenantId,
    customerId,
    amount: refundAmount,
    paymentMethod: rentalPaymentMethodToPaymentModel(paymentMethod),
    paymentDate: new Date(),
    referenceNumber: referenceNumber || undefined,
    status: 'completed',
    description: `rental-deposit-refund:${rentalId}`,
    notes: reason
      ? `Rental security deposit refund — ${String(reason).trim()}`
      : 'Rental security deposit refund',
  }, transaction ? { transaction } : undefined);
};

/**
 * Refund a held deposit balance (full or partial). Idempotent when fully refunded.
 * @param {object} rental - Sequelize rental instance
 * @param {object} options
 * @returns {Promise<{ refundAmount: number, deposit: object|null, refundPaymentId: string|null, idempotent: boolean }>}
 */
const refundRentalDeposit = async (rental, options = {}) => {
  const existingMetadata = rental.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  const deposit = getRentalDeposit(rental);
  const refundable = getDepositRefundableAmount(rental, deposit);

  if (deposit.status === 'refunded' || refundable <= 0) {
    const err = new Error('Deposit has already been fully refunded');
    err.statusCode = 400;
    throw err;
  }

  const requestedAmount = options.amount != null
    ? normalizeMoney(options.amount)
    : refundable;

  if (requestedAmount <= 0) {
    const err = new Error('Refund amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  if (requestedAmount > refundable) {
    const err = new Error(`Cannot refund more than the refundable balance (${refundable})`);
    err.statusCode = 400;
    throw err;
  }

  const totalRefunded = Number((normalizeMoney(deposit.refundedAmount ?? 0) + requestedAmount).toFixed(2));
  const applied = deposit.status === 'applied'
    ? normalizeMoney(deposit.appliedAmount ?? deposit.paid)
    : 0;
  const fullyRefunded = totalRefunded >= Number((deposit.paid - applied).toFixed(2));
  const refundedAt = new Date().toISOString();

  let refundPayment = null;
  if (!options.dryRun) {
    refundPayment = await recordDepositRefundPayment({
      tenantId: rental.tenantId,
      rentalId: rental.id,
      customerId: rental.customerId,
      amount: requestedAmount,
      paymentMethod: options.paymentMethod || deposit.paymentMethod || rental.paymentMethod,
      referenceNumber: options.referenceNumber || null,
      reason: options.reason || null,
      transaction: options.transaction,
    });

    if (deposit.paymentId && fullyRefunded) {
      await Payment.update(
        { status: 'refunded' },
        {
          where: { id: deposit.paymentId, tenantId: rental.tenantId },
          ...(options.transaction ? { transaction: options.transaction } : {}),
        }
      );
    }
  }

  const nextStatus = fullyRefunded ? 'refunded' : deposit.status;
  const updatedDeposit = buildDepositMetadata({
    amount: deposit.amount,
    paid: deposit.paid,
    status: nextStatus,
    paymentId: deposit.paymentId,
    paymentMethod: deposit.paymentMethod,
    collectedAt: deposit.collectedAt,
    appliedAt: deposit.appliedAt,
    appliedAmount: deposit.appliedAmount,
    invoiceId: deposit.invoiceId,
    refundedAt,
    refundedAmount: totalRefunded,
    refundPaymentId: refundPayment?.id || deposit.refundPaymentId,
    refundReason: options.reason ? String(options.reason).trim() : deposit.refundReason,
    refundMethod: options.paymentMethod || deposit.refundMethod || deposit.paymentMethod,
  });

  if (!options.dryRun) {
    const updatePayload = {
      metadata: {
        ...existingMetadata,
        deposit: updatedDeposit,
      },
    };
    if (options.transaction) {
      await rental.update(updatePayload, { transaction: options.transaction });
    } else {
      await rental.update(updatePayload);
    }
  }

  return {
    refundAmount: requestedAmount,
    deposit: updatedDeposit,
    refundPaymentId: refundPayment?.id || null,
    idempotent: false,
  };
};

/**
 * Manually apply a held deposit to the rental invoice (beyond auto-apply on generation).
 * @param {object} rental - Sequelize rental instance
 * @param {object} invoice - Sequelize invoice instance
 * @param {object} [options]
 * @returns {Promise<{ appliedAmount: number, deposit: object|null, invoiceUpdates: object|null }>}
 */
const applyRentalDepositManually = async (rental, invoice, options = {}) => {
  const deposit = getRentalDeposit(rental);
  if (deposit.status === 'refunded') {
    const err = new Error('Cannot apply a refunded deposit');
    err.statusCode = 400;
    throw err;
  }
  if (deposit.status === 'applied' && deposit.invoiceId === invoice.id) {
    return applyDepositToInvoice(rental, invoice, options);
  }
  if (deposit.status !== 'held' || deposit.paid <= 0) {
    const err = new Error('No held deposit is available to apply');
    err.statusCode = 400;
    throw err;
  }
  return applyDepositToInvoice(rental, invoice, options);
};

module.exports = {
  DEPOSIT_STATUSES,
  rentalPaymentMethodToPaymentModel,
  getRentalDeposit,
  getDepositHeld,
  getDepositRefundableAmount,
  resolveSuggestedDepositAmount,
  buildDepositMetadata,
  parseDepositInput,
  recordDepositPayment,
  recordDepositRefundPayment,
  getDepositFinancialSummary,
  applyDepositToInvoice,
  applyRentalDepositManually,
  refundRentalDeposit,
  initializeRentalDeposit,
};
