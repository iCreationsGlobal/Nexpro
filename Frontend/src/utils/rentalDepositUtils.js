/** Rental deposit display helpers — mirrors backend `rentalDepositService`. */

export const DEPOSIT_STATUS_LABELS = {
  held: 'Held',
  applied: 'Applied to invoice',
  refunded: 'Refunded',
};

/**
 * Extract deposit from rental metadata.
 * @param {object|null|undefined} rental
 * @returns {{ amount: number, paid: number, status: string|null, paymentId?: string|null, invoiceId?: string|null, appliedAmount?: number|null, refundedAmount?: number, refundPaymentId?: string|null }}
 */
export const getRentalDeposit = (rental) => {
  const metadata = rental?.metadata && typeof rental.metadata === 'object' ? rental.metadata : {};
  const raw = metadata.deposit && typeof metadata.deposit === 'object' ? metadata.deposit : {};

  const amount = Number(raw.amount ?? raw.depositAmount ?? 0) || 0;
  const paid = Number(raw.paid ?? raw.depositPaid ?? 0) || 0;
  const status = raw.status || (paid > 0 ? 'held' : null);

  return {
    amount,
    paid,
    status,
    paymentId: raw.paymentId || null,
    invoiceId: raw.invoiceId || null,
    appliedAmount: raw.appliedAmount != null ? Number(raw.appliedAmount) : null,
    refundedAmount: raw.refundedAmount != null ? Number(raw.refundedAmount) : 0,
    refundPaymentId: raw.refundPaymentId || null,
  };
};

/**
 * Amount eligible for refund (held balance or remainder after invoice apply).
 * @param {object|null|undefined} rental
 * @returns {number}
 */
export const getDepositRefundableAmount = (rental) => {
  const deposit = getRentalDeposit(rental);
  if (deposit.status === 'refunded') return 0;
  if (deposit.paid <= 0) return 0;

  const applied = deposit.status === 'applied'
    ? Number(deposit.appliedAmount ?? deposit.paid ?? 0)
    : 0;
  const alreadyRefunded = Number(deposit.refundedAmount ?? 0);
  return Number(Math.max(0, deposit.paid - applied - alreadyRefunded).toFixed(2));
};

/**
 * Human-readable deposit status label.
 * @param {string|null|undefined} status
 * @returns {string}
 */
export const formatDepositStatus = (status) =>
  DEPOSIT_STATUS_LABELS[status] || (status ? String(status) : '—');

/**
 * Suggest deposit amount from customer profile and workspace defaults.
 * @param {{ customer?: object, rentalSettings?: object, rentalSubtotal?: number }} params
 * @returns {number|null}
 */
export const resolveSuggestedDepositAmount = ({ customer, rentalSettings = {}, rentalSubtotal = 0 }) => {
  const customerAmount = customer?.metadata?.rental?.deposit?.standardDepositAmount;
  if (customerAmount != null && Number(customerAmount) > 0) {
    return Number(customerAmount);
  }

  const fixedDefault = rentalSettings.defaultDepositAmount;
  if (fixedDefault != null && Number(fixedDefault) > 0) {
    return Number(fixedDefault);
  }

  const percentDefault = rentalSettings.defaultDepositPercent;
  if (percentDefault != null && Number(percentDefault) > 0 && rentalSubtotal > 0) {
    return Number(((rentalSubtotal * Number(percentDefault)) / 100).toFixed(2));
  }

  return null;
};
