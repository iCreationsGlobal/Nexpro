/**
 * Helpers to write completed income Payment ledger rows for sales/invoices.
 * Revenue and cash-flow reports attribute collections by paymentDate + amount.
 */

const { Payment } = require('../models');

/**
 * Map POS/sale payment method strings onto Payment.paymentMethod enum.
 * @param {string|null|undefined} method
 * @returns {string}
 */
function mapToPaymentModelMethod(method) {
  if (!method) return 'cash';
  const m = String(method).toLowerCase();
  if (m === 'card') return 'credit_card';
  if (['cash', 'mobile_money', 'check', 'credit_card', 'bank_transfer', 'other'].includes(m)) {
    return m;
  }
  return 'other';
}

/**
 * @param {string} [prefix]
 * @returns {string}
 */
function buildPaymentNumber(prefix = 'PAY') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {number|string} amount
 * @returns {number}
 */
function roundMoney(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

/**
 * Find an existing income payment by reference (idempotent webhooks / Paystack).
 * @param {{ tenantId: string, referenceNumber?: string|null, transaction?: object|null }} opts
 * @returns {Promise<object|null>}
 */
async function findIncomePaymentByReference({ tenantId, referenceNumber, transaction = null }) {
  if (!referenceNumber) return null;
  return Payment.findOne({
    where: {
      tenantId,
      type: 'income',
      referenceNumber: String(referenceNumber),
    },
    transaction: transaction || undefined,
  });
}

/**
 * Create a completed income Payment row (no-op when amount <= 0).
 * Skips create when referenceNumber already exists for the tenant.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {number|string} params.amount
 * @param {string} [params.paymentMethod]
 * @param {Date|string} [params.paymentDate]
 * @param {string|null} [params.customerId]
 * @param {string|null} [params.dealerId]
 * @param {string|null} [params.jobId]
 * @param {string|null} [params.description]
 * @param {string|null} [params.referenceNumber]
 * @param {string|null} [params.notes]
 * @param {object|null} [params.transaction]
 * @returns {Promise<{ payment: object|null, created: boolean }>}
 */
async function createIncomePayment({
  tenantId,
  amount,
  paymentMethod = 'cash',
  paymentDate = new Date(),
  customerId = null,
  dealerId = null,
  jobId = null,
  description = null,
  referenceNumber = null,
  notes = null,
  transaction = null,
}) {
  const amt = roundMoney(amount);
  if (amt <= 0 || !tenantId) {
    return { payment: null, created: false };
  }

  const existing = await findIncomePaymentByReference({
    tenantId,
    referenceNumber,
    transaction,
  });
  if (existing) {
    return { payment: existing, created: false };
  }

  const payment = await Payment.create(
    {
      paymentNumber: buildPaymentNumber(),
      type: 'income',
      tenantId,
      amount: amt,
      paymentMethod: mapToPaymentModelMethod(paymentMethod),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      customerId: customerId || null,
      dealerId: dealerId || null,
      jobId: jobId || null,
      referenceNumber: referenceNumber || null,
      status: 'completed',
      description: description || null,
      notes: notes || null,
    },
    transaction ? { transaction } : undefined
  );

  return { payment, created: true };
}

/**
 * Ledger row for a sale collection (POS tender, installment, Paystack, MoMo).
 * Net cash for over-tender is capped at sale.total (change is not revenue).
 *
 * @param {object} sale - Sale instance or plain object with id, tenantId, total, ...
 * @param {object} [opts]
 * @returns {Promise<{ payment: object|null, created: boolean }>}
 */
async function createSaleIncomePayment(sale, opts = {}) {
  if (!sale?.id || !sale?.tenantId) {
    return { payment: null, created: false };
  }

  const saleTotal = roundMoney(sale.total);
  const rawAmount = opts.amount != null ? opts.amount : sale.amountPaid;
  let amount = roundMoney(rawAmount);
  if (saleTotal > 0 && amount > saleTotal) {
    amount = saleTotal;
  }

  return createIncomePayment({
    tenantId: sale.tenantId,
    amount,
    paymentMethod: opts.paymentMethod || sale.paymentMethod || 'cash',
    paymentDate: opts.paymentDate || sale.createdAt || new Date(),
    customerId: sale.customerId || null,
    dealerId: sale.dealerId || null,
    description: `sale:${sale.id}`,
    referenceNumber: opts.referenceNumber || null,
    notes: opts.notes || null,
    transaction: opts.transaction || null,
  });
}

/**
 * When a rail marks a sale fully paid (MoMo/Paystack), record only the unpaid delta
 * so prior installment ledger rows are not double-counted.
 *
 * @param {object} sale - sale BEFORE amountPaid is updated to the new total
 * @param {object} [opts]
 * @param {number} [opts.newAmountPaid] - target amountPaid after apply (defaults to sale.total)
 * @returns {Promise<{ payment: object|null, created: boolean, delta: number }>}
 */
async function createSaleIncomePaymentForSettlement(sale, opts = {}) {
  const previousPaid = roundMoney(sale.amountPaid);
  const targetPaid = roundMoney(
    opts.newAmountPaid != null ? opts.newAmountPaid : sale.total
  );
  const delta = Math.max(0, Math.min(targetPaid, roundMoney(sale.total)) - previousPaid);

  if (delta <= 0) {
    return { payment: null, created: false, delta: 0 };
  }

  const result = await createSaleIncomePayment(sale, {
    ...opts,
    amount: delta,
  });
  return { ...result, delta };
}

/**
 * Invoice collection ledger row.
 * @param {object} invoice
 * @param {object} opts
 */
async function createInvoiceIncomePayment(invoice, opts = {}) {
  if (!invoice?.id || !invoice?.tenantId) {
    return { payment: null, created: false };
  }

  return createIncomePayment({
    tenantId: invoice.tenantId,
    amount: opts.amount,
    paymentMethod: opts.paymentMethod || 'cash',
    paymentDate: opts.paymentDate || new Date(),
    customerId: invoice.customerId || null,
    jobId: invoice.jobId || opts.jobId || null,
    description: `invoice:${invoice.id}`,
    referenceNumber: opts.referenceNumber || null,
    notes: opts.notes || null,
    transaction: opts.transaction || null,
  });
}

module.exports = {
  mapToPaymentModelMethod,
  buildPaymentNumber,
  roundMoney,
  findIncomePaymentByReference,
  createIncomePayment,
  createSaleIncomePayment,
  createSaleIncomePaymentForSettlement,
  createInvoiceIncomePayment,
};
