/**
 * Apply a verified Paystack transaction to a workspace invoice (public pay-invoice link).
 * Shared by Paystack webhooks and POST /api/public/invoices/:token/verify-paystack (return URL fallback).
 */

const { Invoice, Customer } = require('../models');
const activityLogger = require('./activityLogger');
const { updateCustomerBalance } = require('./customerBalanceService');
const { ensureSaleFromPaidInvoice } = require('./invoiceSaleService');
const paystackService = require('./paystackService');

/** In-process pending refs (initialize → verify before webhook); TTL covers multi-day invoice links. */
const pendingInvoicePaystackByInvoiceId = new Map();
const PENDING_REF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {Record<string, unknown>} metadata
 * @returns {{ paymentToken?: string, invoiceId?: string, tenantId?: string }}
 */
function getPaystackInvoiceLinkMetadata(metadata) {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return {
    paymentToken: m.paymentToken ?? m.payment_token,
    invoiceId: m.invoiceId ?? m.invoice_id,
    tenantId: m.tenantId ?? m.tenant_id
  };
}

/**
 * Matches initialize-paystack reference: INV-{invoiceUuid}-{timestamp}
 * @param {string} reference
 * @returns {string|null} invoice UUID
 */
function parseInvoiceIdFromPublicPaystackReference(reference) {
  if (!reference || typeof reference !== 'string') return null;
  const re = /^INV-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+/i;
  const match = reference.match(re);
  return match ? match[1] : null;
}

/**
 * @param {string} reference - Paystack transaction reference
 * @param {object} tx - Paystack verify API `data` object
 * @returns {Promise<{ applied: boolean, duplicate?: boolean, reason?: string }>}
 */
async function applyPaystackChargeToInvoiceFromTx(reference, tx) {
  const metadata =
    typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});
  const invLink = getPaystackInvoiceLinkMetadata(metadata);
  const refInvoiceId = parseInvoiceIdFromPublicPaystackReference(reference);

  const isInvoiceCharge =
    String(metadata.type || '').toLowerCase() === 'invoice' ||
    invLink.paymentToken ||
    (invLink.invoiceId && invLink.tenantId) ||
    refInvoiceId;

  if (!isInvoiceCharge) {
    return { applied: false, reason: 'not_invoice_charge' };
  }

  let invoice = null;
  if (invLink.paymentToken) {
    invoice = await Invoice.findOne({
      where: { paymentToken: invLink.paymentToken },
      include: [{ model: Customer, as: 'customer' }]
    });
  }
  if (!invoice && invLink.invoiceId && invLink.tenantId) {
    invoice = await Invoice.findOne({
      where: { id: invLink.invoiceId, tenantId: invLink.tenantId },
      include: [{ model: Customer, as: 'customer' }]
    });
  }
  if (!invoice && refInvoiceId) {
    invoice = await Invoice.findByPk(refInvoiceId, {
      include: [{ model: Customer, as: 'customer' }]
    });
    if (invoice && invLink.tenantId && String(invoice.tenantId) !== String(invLink.tenantId)) {
      invoice = null;
    }
  }

  if (!invoice) {
    console.error(
      '[PaystackInvoice] Invoice not found for payment – paymentToken:',
      invLink.paymentToken,
      'invoiceId:',
      invLink.invoiceId,
      'refInvoiceId:',
      refInvoiceId
    );
    return { applied: false, reason: 'invoice_not_found' };
  }

  if (invoice.status === 'cancelled') {
    return { applied: false, reason: 'invoice_terminal_state', invoiceId: invoice.id };
  }

  const existingPayment = await Payment.findOne({
    where: { referenceNumber: reference, tenantId: invoice.tenantId }
  });
  if (existingPayment) {
    await ensureSaleFromPaidInvoice(invoice.id, existingPayment.id, {
      tenantId: invoice.tenantId,
      paymentMethod: existingPayment.paymentMethod
    });
    console.log('[PaystackInvoice] Payment already recorded for reference:', reference);
    return { applied: false, duplicate: true, invoiceId: invoice.id };
  }

  if (invoice.status === 'paid') {
    await ensureSaleFromPaidInvoice(invoice.id, null, {
      tenantId: invoice.tenantId,
      paymentMethod: 'credit_card'
    });
    return { applied: false, reason: 'invoice_terminal_state', invoiceId: invoice.id };
  }

  const paymentAmount = parseFloat(tx.amount || 0) / 100;
  const channel = String(tx.channel || tx.authorization?.channel || '').toLowerCase();
  const paymentMethod =
    channel.includes('mobile') ||
    String(metadata.payment_source || '').toLowerCase().includes('mobile_money') ||
    Boolean(metadata.mobileNumber || metadata.mobile_number)
      ? 'mobile_money'
      : 'credit_card';
  const totalAmount = parseFloat(invoice.totalAmount || 0);
  const currentPaid = parseFloat(invoice.amountPaid || 0);
  const remaining = Math.max(totalAmount - currentPaid, 0);
  const appliedPaymentAmount = Math.min(paymentAmount, remaining);
  const newAmountPaid = currentPaid + appliedPaymentAmount;
  const newBalance = Math.max(totalAmount - newAmountPaid, 0);

  const updatePayload = {
    amountPaid: newAmountPaid,
    balance: newBalance
  };
  if (newBalance <= 0) {
    updatePayload.status = 'paid';
    updatePayload.paidDate = new Date();
  } else if (invoice.status === 'draft') {
    updatePayload.status = 'sent';
  } else if (invoice.status === 'sent' && newAmountPaid > 0) {
    updatePayload.status = 'partial';
  }
  await invoice.update(updatePayload);

  const { createInvoiceIncomePayment } = require('../utils/incomePaymentLedger');
  const { payment } = await createInvoiceIncomePayment(invoice, {
    amount: appliedPaymentAmount,
    paymentMethod,
    paymentDate: new Date(),
    referenceNumber: reference,
    notes: `Paystack payment for invoice ${invoice.invoiceNumber}`,
    jobId: invoice.jobId || null,
  });

  await ensureSaleFromPaidInvoice(invoice.id, payment?.id || null, {
    tenantId: invoice.tenantId,
    paymentMethod
  });

  try {
    await activityLogger.logInvoicePaid(invoice, null);
  } catch (e) {
    console.error('[PaystackInvoice] activityLogger error:', e.message);
  }

  const tenantId = invoice.tenantId;
  const invoiceSnapshot = invoice;
  setImmediate(() => {
    try {
      const { sendInvoicePaidConfirmationToCustomer } = require('../controllers/invoiceController');
      sendInvoicePaidConfirmationToCustomer(tenantId, invoiceSnapshot);
    } catch (e) {
      console.error('[PaystackInvoice] sendInvoicePaidConfirmation:', e.message);
    }
  });

  try {
    if (invoice.customerId) await updateCustomerBalance(invoice.customerId);
  } catch (e) {
    console.error('[PaystackInvoice] updateCustomerBalance error:', e.message);
  }

  console.log(
    '[PaystackInvoice] Invoice payment applied:',
    invoice.invoiceNumber,
    'reference:',
    reference
  );
  return { applied: true, invoiceId: invoice.id };
}

/**
 * Remember Paystack reference when checkout is initialized (public or workspace flow).
 * @param {string} invoiceId
 * @param {string} reference
 */
function rememberPendingInvoicePaystackReference(invoiceId, reference) {
  if (!invoiceId || !reference) return;
  pendingInvoicePaystackByInvoiceId.set(String(invoiceId), {
    reference: String(reference),
    at: Date.now()
  });
}

/**
 * @param {string} invoiceId
 * @returns {string|null}
 */
function getRememberedPendingInvoicePaystackReference(invoiceId) {
  const entry = pendingInvoicePaystackByInvoiceId.get(String(invoiceId));
  if (!entry) return null;
  if (Date.now() - entry.at > PENDING_REF_TTL_MS) {
    pendingInvoicePaystackByInvoiceId.delete(String(invoiceId));
    return null;
  }
  return entry.reference;
}

/**
 * @param {import('../models').Invoice} invoice
 * @param {string} reference
 * @param {object} tx
 * @returns {Promise<{ applied: boolean, duplicate?: boolean, reason?: string, reference?: string, paystackStatus?: string }>}
 */
async function tryVerifyAndApplyInvoiceReference(invoice, reference, tx) {
  const metadata =
    typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});
  const invLink = getPaystackInvoiceLinkMetadata(metadata);
  const refInvoiceId = parseInvoiceIdFromPublicPaystackReference(reference);

  const tokenMatch =
    invLink.paymentToken &&
    invoice.paymentToken &&
    String(invLink.paymentToken) === String(invoice.paymentToken);
  const idMatch =
    invLink.invoiceId &&
    String(invLink.invoiceId) === String(invoice.id) &&
    invLink.tenantId &&
    String(invLink.tenantId) === String(invoice.tenantId);
  const refMatch = refInvoiceId && String(refInvoiceId) === String(invoice.id);

  if (!tokenMatch && !idMatch && !refMatch) {
    return { applied: false, reason: 'reference_mismatch', reference };
  }

  const outcome = await applyPaystackChargeToInvoiceFromTx(reference, tx);
  return { ...outcome, reference };
}

/**
 * Verify Paystack and apply payment to an invoice without relying on webhooks.
 * @param {import('../models').Invoice} invoice
 * @param {{ reference?: string }} [options]
 */
async function reconcileInvoicePaystackPayment(invoice, options = {}) {
  if (!paystackService.secretKey) {
    return { applied: false, reason: 'paystack_not_configured' };
  }

  if (!invoice) {
    return { applied: false, reason: 'invoice_not_found' };
  }

  if (invoice.status === 'cancelled' || invoice.status === 'paid') {
    return { applied: false, reason: 'invoice_terminal_state', duplicate: invoice.status === 'paid' };
  }

  const refsToTry = [];
  const explicitRef = String(options.reference || '').trim();
  if (explicitRef) refsToTry.push(explicitRef);
  const remembered = getRememberedPendingInvoicePaystackReference(invoice.id);
  if (remembered && !refsToTry.includes(remembered)) refsToTry.push(remembered);

  for (const ref of refsToTry) {
    let result;
    try {
      result = await paystackService.verifyTransaction(ref);
    } catch (err) {
      console.error('[PaystackInvoice] verify error during reconcile:', err?.message);
      continue;
    }
    if (!result?.status || !result?.data) continue;

    const tx = result.data;
    const txStatus = String(tx.status || '').toLowerCase();
    if (txStatus !== 'success') {
      return { applied: false, reason: 'not_success', paystackStatus: tx.status, reference: ref };
    }

    const outcome = await tryVerifyAndApplyInvoiceReference(invoice, ref, tx);
    if (outcome.applied || outcome.duplicate) {
      return outcome;
    }
  }

  const refPrefix = `INV-${invoice.id}-`;
  const from = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  try {
    for (let page = 1; page <= 3; page += 1) {
      const listResult = await paystackService.listTransactions({
        page,
        perPage: 50,
        from,
        status: 'success'
      });
      const txs = Array.isArray(listResult?.data) ? listResult.data : [];
      for (const listed of txs) {
        const ref = String(listed.reference || '').trim();
        if (!ref.startsWith(refPrefix)) continue;

        let verifyResult;
        try {
          verifyResult = await paystackService.verifyTransaction(ref);
        } catch {
          continue;
        }
        if (!verifyResult?.status || !verifyResult?.data) continue;
        const tx = verifyResult.data;
        if (String(tx.status || '').toLowerCase() !== 'success') continue;

        const outcome = await tryVerifyAndApplyInvoiceReference(invoice, ref, tx);
        if (outcome.applied || outcome.duplicate) {
          return outcome;
        }
      }

      if (!listResult?.meta?.next_page) break;
    }
  } catch (err) {
    console.error('[PaystackInvoice] listTransactions reconcile error:', err?.message);
  }

  return { applied: false, reason: 'no_matching_transaction' };
}

module.exports = {
  applyPaystackChargeToInvoiceFromTx,
  getPaystackInvoiceLinkMetadata,
  parseInvoiceIdFromPublicPaystackReference,
  rememberPendingInvoicePaystackReference,
  getRememberedPendingInvoicePaystackReference,
  reconcileInvoicePaystackPayment,
  tryVerifyAndApplyInvoiceReference
};
