const { Op } = require('sequelize');
const { randomUUID } = require('crypto');

// Payments are the durable source of truth. Failed commission work can be replayed.
const processPayment = async (payment) => {
  if (!payment || payment.type !== 'income' || payment.status !== 'completed' || Number(payment.amount) <= 0) return null;
  const { maybeCreateCommissionForPayment } = require('./partnerCommissionService');
  const source = /^(sale|invoice):([0-9a-f-]{36})$/i.exec(payment.description || '');
  return maybeCreateCommissionForPayment({
    tenantId: payment.tenantId, paymentId: payment.id, paymentAmount: payment.amount,
    customerId: payment.customerId || null, jobId: payment.jobId || null,
    saleId: source?.[1] === 'sale' ? source[2] : null,
    invoiceId: source?.[1] === 'invoice' ? source[2] : null,
    collectedAt: payment.createdAt,
  });
};

const schedulePayment = (payment, options = {}) => {
  if (payment.type !== 'income' || payment.status !== 'completed') return;
  const run = async () => {
    try { await processPayment(payment); }
    catch (error) { console.error('[Partner commission] Deferred for reconciliation', payment.id, error.message); }
  };
  if (options.transaction) options.transaction.afterCommit(run);
  else return run();
};

const recordSalePayment = async (sale, amount, { transaction, reference = null } = {}) => {
  const collected = Math.round(Math.min(Number(amount), Number(sale.total)) * 100) / 100;
  if (!(collected > 0)) return null;
  const { Payment } = require('../models');
  const method = sale.paymentMethod === 'card' ? 'credit_card' : sale.paymentMethod;
  return Payment.create({
    paymentNumber: `PAY-${randomUUID()}`, tenantId: sale.tenantId,
    type: 'income', status: 'completed', customerId: sale.customerId || null,
    amount: collected, paymentMethod: ['cash', 'mobile_money', 'check', 'credit_card', 'bank_transfer', 'other'].includes(method) ? method : 'other',
    description: `sale:${sale.id}`, referenceNumber: reference,
  }, { transaction });
};

let cursor = null;
let running = false;
// A bounded keyset scan cycles through all completed payments, including old failures.
const reconcilePayments = async ({ limit = 200, persistent = false } = {}) => {
  if (running) return { skipped: true };
  running = true;
  try {
    const { Payment, Setting } = require('../models');
    let checkpoint;
    if (persistent) {
      [checkpoint] = await Setting.findOrCreate({
        where: { id: '27776c93-5dbb-4b52-8981-6c31ef0aa0ee' },
        defaults: { tenantId: null, key: 'partner_commission_reconciliation_cursor', value: {} },
      });
      cursor = checkpoint.value?.cursor || null;
    }
    const rows = await Payment.findAll({
      where: { type: 'income', status: 'completed', ...(cursor ? { [Op.or]: [
        { createdAt: { [Op.gt]: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { [Op.gt]: cursor.id } },
      ] } : {}) },
      order: [['createdAt', 'ASC'], ['id', 'ASC']], limit,
    });
    let failed = 0;
    for (const payment of rows) {
      try { await processPayment(payment); }
      catch (error) { failed++; console.error('[Partner reconciliation]', payment.id, error.message); }
    }
    cursor = rows.length === limit ? { createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id } : null;
    if (checkpoint) await checkpoint.update({ value: { cursor } });
    return { scanned: rows.length, failed, more: cursor !== null };
  } finally { running = false; }
};

module.exports = { processPayment, schedulePayment, recordSalePayment, reconcilePayments };
