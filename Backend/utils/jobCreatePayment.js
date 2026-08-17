/**
 * Job-create payment intent (not stored on Job).
 * Staff choose unpaid / deposit / paid; the invoice records a real Payment after auto-create.
 */

const JOB_PAYMENT_STATUSES = ['unpaid', 'deposit', 'paid'];
const JOB_PAYMENT_METHODS = ['cash', 'mobile_money', 'check', 'credit_card', 'bank_transfer', 'other'];

const PAYMENT_METHOD_ALIASES = {
  cash: 'cash',
  momo: 'mobile_money',
  mobile_money: 'mobile_money',
  card: 'credit_card',
  credit_card: 'credit_card',
  cheque: 'check',
  check: 'check',
  bank: 'bank_transfer',
  bank_transfer: 'bank_transfer',
  other: 'other',
};

const PAID_TOLERANCE = 0.01;

const JOB_CREATE_PAYMENT_BODY_KEYS = [
  'paymentStatus',
  'amountPaid',
  'paymentAmount',
  'paymentMethod',
  'paymentReference',
  'referenceNumber',
  'paymentNotes',
  'paymentDate',
];

/**
 * @param {object|null} invoice
 * @returns {boolean}
 */
function isInvoiceFullyPaid(invoice) {
  if (!invoice) return false;
  if (String(invoice.status || '').toLowerCase() === 'paid') return true;
  const total = parseFloat(invoice.totalAmount || 0) || 0;
  const paid = parseFloat(invoice.amountPaid || 0) || 0;
  const balanceRaw = invoice.balance;
  const balance = balanceRaw == null ? Math.max(0, total - paid) : parseFloat(balanceRaw) || 0;
  return paid > 0 && (balance <= PAID_TOLERANCE || paid >= total - PAID_TOLERANCE);
}

/**
 * @param {*} value
 * @returns {string|null}
 */
function normalizeJobPaymentMethod(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  return PAYMENT_METHOD_ALIASES[key] || null;
}

function roundMoney(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Parse payment fields from a job-create or quote-convert body.
 * Does not persist anything.
 *
 * @param {object} body
 * @param {{ jobTotal?: number }} [opts]
 * @returns {{ ok: true, status: 'unpaid' } | { ok: true, status: 'deposit'|'paid', amount: number, paymentMethod: string, referenceNumber: string, notes: string|null, paymentDate: * } | { ok: false, error: string }}
 */
function resolveJobCreatePaymentIntent(body = {}, opts = {}) {
  const rawStatus = String(body.paymentStatus || 'unpaid').trim().toLowerCase();
  const status = JOB_PAYMENT_STATUSES.includes(rawStatus) ? rawStatus : 'unpaid';

  if (status === 'unpaid') {
    return { ok: true, status: 'unpaid' };
  }

  const paymentMethod = normalizeJobPaymentMethod(body.paymentMethod);
  if (!paymentMethod || !JOB_PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, error: 'Payment method is required when the job is paid or a deposit is recorded' };
  }

  const jobTotal = roundMoney(opts.jobTotal);
  let amount = roundMoney(body.amountPaid != null ? body.amountPaid : body.paymentAmount);

  if (status === 'paid') {
    if (jobTotal > 0) {
      amount = jobTotal;
    } else if (!(amount > 0)) {
      return { ok: false, error: 'Paid in full requires a job total greater than 0' };
    }
  } else {
    if (!(amount > 0)) {
      return { ok: false, error: 'Deposit amount must be greater than 0' };
    }
    if (jobTotal > 0 && amount >= jobTotal - PAID_TOLERANCE) {
      return { ok: false, error: 'Deposit must be less than the job total. Choose Paid in full instead.' };
    }
  }

  const referenceNumber = body.paymentReference != null
    ? String(body.paymentReference).trim()
    : (body.referenceNumber != null ? String(body.referenceNumber).trim() : '');
  const notesRaw = body.paymentNotes != null ? body.paymentNotes : body.notes;
  const notes = notesRaw == null || String(notesRaw).trim() === '' ? null : String(notesRaw).trim();

  return {
    ok: true,
    status,
    amount,
    paymentMethod,
    referenceNumber,
    notes,
    paymentDate: body.paymentDate || null,
  };
}

/**
 * Map a validated intent onto an invoice total (tax may change the total vs job finalPrice).
 * @param {object} intent
 * @param {number} invoiceTotal
 * @returns {{ amount: number, fullyPaid: boolean } | null}
 */
function amountForInvoice(intent, invoiceTotal) {
  if (!intent || intent.status === 'unpaid' || !intent.ok) return null;
  const total = roundMoney(invoiceTotal);
  if (total <= 0) return null;
  if (intent.status === 'paid') {
    return { amount: total, fullyPaid: true };
  }
  const amount = Math.min(roundMoney(intent.amount), total);
  if (!(amount > 0)) return null;
  return { amount, fullyPaid: amount >= total - PAID_TOLERANCE };
}

/**
 * Pull payment fields off a job-create payload so they are not persisted on Job.
 * @param {object} source
 * @returns {{ paymentBody: object, rest: object }}
 */
function extractJobCreatePaymentBody(source = {}) {
  const rest = { ...source };
  const paymentBody = {};
  JOB_CREATE_PAYMENT_BODY_KEYS.forEach((key) => {
    if (rest[key] !== undefined) {
      paymentBody[key] = rest[key];
      delete rest[key];
    }
  });
  return { paymentBody, rest };
}

module.exports = {
  JOB_PAYMENT_STATUSES,
  JOB_PAYMENT_METHODS,
  JOB_CREATE_PAYMENT_BODY_KEYS,
  PAID_TOLERANCE,
  isInvoiceFullyPaid,
  normalizeJobPaymentMethod,
  resolveJobCreatePaymentIntent,
  amountForInvoice,
  extractJobCreatePaymentBody,
};
