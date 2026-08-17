export const JOB_CREATE_PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'paid', label: 'Paid in full' },
];

export const JOB_CREATE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'credit_card', label: 'Card' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const JOB_CREATE_PAYMENT_DEFAULTS = {
  paymentStatus: 'unpaid',
  paymentAmount: '',
  paymentMethod: '',
  paymentReference: '',
  paymentNotes: '',
};

/**
 * Payment fields posted with POST /jobs (or quote convert). Unpaid sends status only.
 * @param {object} values
 * @returns {object}
 */
export function buildJobCreatePaymentPayload(values = {}) {
  const paymentStatus = values.paymentStatus || 'unpaid';
  if (paymentStatus === 'unpaid') {
    return { paymentStatus: 'unpaid' };
  }
  const amount = parseFloat(values.paymentAmount);
  return {
    paymentStatus,
    ...(paymentStatus === 'deposit' && Number.isFinite(amount) ? { amountPaid: amount } : {}),
    paymentMethod: values.paymentMethod,
    ...(values.paymentReference ? { paymentReference: String(values.paymentReference).trim() } : {}),
    ...(values.paymentNotes ? { paymentNotes: String(values.paymentNotes).trim() } : {}),
  };
}
