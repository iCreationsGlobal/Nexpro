const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a promised hire-payment date to YYYY-MM-DD.
 * @param {unknown} value
 * @returns {string|null}
 */
const parsePromisedPaymentDate = (value) => {
  if (value == null || value === '') return null;
  const str = String(value).trim().slice(0, 10);
  return DATE_ONLY.test(str) ? str : null;
};

/**
 * @param {object|null|undefined} rental
 * @returns {string|null}
 */
const getPromisedPaymentDate = (rental) =>
  parsePromisedPaymentDate(rental?.metadata?.promisedPaymentDate);

/**
 * Hire still outstanding on the rental, or on a linked invoice if one exists.
 * @param {object|null|undefined} rental
 * @param {object|null|undefined} [invoice]
 * @returns {boolean}
 */
const hasOutstandingHire = (rental, invoice = null) => {
  if (invoice) {
    const status = String(invoice.status || '').toLowerCase();
    if (status === 'paid' || status === 'void' || status === 'cancelled') return false;
    if (Number(invoice.balance || 0) > 0.001) return true;
    const invoiceTotal = Number(invoice.total ?? invoice.totalAmount ?? 0);
    const invoicePaid = Number(invoice.amountPaid || 0);
    return invoiceTotal > 0 && invoicePaid + 0.001 < invoiceTotal;
  }
  return Number(rental?.amountPaid || 0) + 0.001 < Number(rental?.totalDue || 0);
};

/**
 * True when a promised payment date is today or earlier and hire is still unpaid.
 * @param {object|null|undefined} rental
 * @param {string} todayKey
 * @param {object|null|undefined} [invoice]
 * @returns {boolean}
 */
const isPromisedPaymentDue = (rental, todayKey, invoice = null) => {
  const promised = getPromisedPaymentDate(rental);
  if (!promised || !todayKey || promised > todayKey) return false;
  return hasOutstandingHire(rental, invoice);
};

module.exports = {
  parsePromisedPaymentDate,
  getPromisedPaymentDate,
  hasOutstandingHire,
  isPromisedPaymentDue,
};
