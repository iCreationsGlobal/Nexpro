/**
 * Apply a verified Paystack transaction to a workspace sale (POS / direct checkout).
 * Shared by Paystack webhooks and GET /api/sales/:id/check-paystack-charge (return/poll fallback).
 */

const { findTenantWithOptionalColumns } = require('../utils/tenantUtils');
const paystackService = require('./paystackService');
const { Sale, Payment } = require('../models');
const { sequelize } = require('../config/database');
const { recordSalePayment } = require('./partnerPaymentService');

/**
 * @param {import('../models').Sale} sale
 * @param {string} reference
 * @param {object} tx - Paystack verify API `data` object
 * @returns {Promise<{ applied: boolean, duplicate?: boolean, reason?: string, paystackStatus?: string, appliedAmount?: number, nextStatus?: string }>}
 */
async function applyPaystackChargeToSaleFromTx(sale, reference, tx) {
  if (!sale) {
    return { applied: false, reason: 'sale_not_found' };
  }

  const outcome = await sequelize.transaction(async (transaction) => {
    sale = await Sale.findOne({ where: { id: sale.id, tenantId: sale.tenantId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!sale) return { applied: false, reason: 'sale_not_found' };
  const saleTotal = parseFloat(sale.total || 0);
  const currentPaid = parseFloat(sale.amountPaid || 0);
  const balanceDue = Math.max(saleTotal - currentPaid, 0);

  if (sale.status === 'cancelled' || sale.status === 'refunded') {
    return { applied: false, reason: 'sale_terminal_state' };
  }

  if (balanceDue <= 0) {
    return { applied: false, reason: 'already_settled', duplicate: true };
  }

  const txStatus = String(tx?.status || '').toLowerCase();
  if (txStatus !== 'success') {
    return { applied: false, reason: 'not_success', paystackStatus: tx?.status };
  }

  const metadata =
    typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});

  if (metadata.sale_id && String(metadata.sale_id) !== String(sale.id)) {
    return { applied: false, reason: 'sale_mismatch' };
  }
  if (metadata.tenant_id && String(metadata.tenant_id) !== String(sale.tenantId)) {
    return { applied: false, reason: 'tenant_mismatch' };
  }

  if (sale.metadata?.paystackRef === reference) {
    return { applied: false, duplicate: true, reason: 'already_recorded' };
  }

  const existing = await Payment.findOne({ where: {
    tenantId: sale.tenantId, referenceNumber: reference, description: `sale:${sale.id}`,
  }, transaction });
  if (existing) return { applied: false, duplicate: true, reason: 'already_recorded' };
  if (tx.currency && tx.currency !== 'GHS') return { applied: false, reason: 'currency_mismatch' };
  const amount = parseFloat(tx.amount || 0) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { applied: false, reason: 'invalid_amount' };
  const appliedAmount =
    Number.isFinite(balanceDue) && balanceDue > 0 ? Math.min(amount, balanceDue) : amount;
  const newAmountPaid = Math.min(currentPaid + appliedAmount, saleTotal);
  const nextStatus = newAmountPaid >= saleTotal ? 'completed' : 'partially_paid';
  const channel = String(tx.channel || tx.authorization?.channel || '').toLowerCase();
  const nextPaymentMethod =
    channel.includes('mobile') || sale.paymentMethod === 'mobile_money' ? 'mobile_money' : 'card';

  await sale.update({
    status: nextStatus,
    paymentMethod: nextPaymentMethod,
    amountPaid: newAmountPaid,
    metadata: {
      ...(sale.metadata || {}),
      paystackRef: reference,
      paystackCompletedAt: new Date().toISOString()
    }
  }, { transaction });
    await recordSalePayment(sale, appliedAmount, { transaction, reference });
    return { applied: true, appliedAmount, nextStatus };
  });
  if (!outcome.applied) return outcome;
  const { appliedAmount, nextStatus } = outcome;
  const tenant = await findTenantWithOptionalColumns(sale.tenantId);
  const pc = tenant?.metadata?.paymentCollection || {};
  const isMoMo = pc.settlementType === 'momo' && pc.momoPhone;
  const useLegacyMomoTransfer = isMoMo && !tenant?.paystackSubaccountCode;



  if (useLegacyMomoTransfer) {
    try {
      const platformFeePercent = parseFloat(process.env.PAYSTACK_PLATFORM_FEE_PERCENT || '2');
      const tenantShare = appliedAmount * (1 - platformFeePercent / 100);
      const tenantSharePesewas = Math.round(tenantShare * 100);
      if (tenantSharePesewas >= 100) {
        let recipientCode = pc.paystackTransferRecipientCode;
        if (!recipientCode) {
          const momoAccount = (pc.momoPhone || '').replace(/^\+?233/, '0');
          const recipientRes = await paystackService.createTransferRecipient({
            type: 'mobile_money',
            name: tenant?.name || 'Business',
            account_number: momoAccount || pc.momoPhone,
            bank_code: paystackService.getMoMoBankCode(pc.momoProvider),
            currency: 'GHS'
          });
          recipientCode = recipientRes?.data?.recipient_code;
          if (recipientCode && tenant) {
            tenant.metadata = tenant.metadata || {};
            tenant.metadata.paymentCollection = tenant.metadata.paymentCollection || {};
            tenant.metadata.paymentCollection.paystackTransferRecipientCode = recipientCode;
            await tenant.save();
          }
        }
        if (recipientCode) {
          const transferRef = `sale_${sale.id}_${Date.now()}`.slice(0, 50);
          await paystackService.initiateTransfer({
            amount: tenantSharePesewas,
            recipient: recipientCode,
            reference: transferRef,
            reason: `POS sale ${sale.saleNumber}`
          });
        }
      }
    } catch (transferErr) {
      console.error('[PaystackSale] Legacy MoMo transfer failed:', sale.id, transferErr?.message);
    }
  }

  return {
    applied: true,
    appliedAmount,
    nextStatus
  };
}

module.exports = {
  applyPaystackChargeToSaleFromTx
};
