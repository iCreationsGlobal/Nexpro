export const JOB_CREATE_PAYMENT_STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'paid', label: 'Paid in full' },
] as const;

export const JOB_CREATE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'credit_card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Other' },
] as const;

export type JobCreatePaymentStatus = (typeof JOB_CREATE_PAYMENT_STATUSES)[number]['value'];
export type JobCreatePaymentMethod = (typeof JOB_CREATE_PAYMENT_METHODS)[number]['value'];

export const JOB_CREATE_PAYMENT_DEFAULTS = {
  paymentStatus: 'unpaid' as JobCreatePaymentStatus,
  paymentAmount: '',
  paymentMethod: 'cash' as JobCreatePaymentMethod,
  paymentReference: '',
  paymentNotes: '',
};

/**
 * Map UI payment fields onto the job-create API body.
 */
export function buildJobCreatePaymentPayload(form: {
  paymentStatus?: string;
  paymentAmount?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paymentNotes?: string;
}) {
  const paymentStatus = form.paymentStatus || 'unpaid';
  if (paymentStatus === 'unpaid') {
    return { paymentStatus: 'unpaid' as const };
  }
  const method = form.paymentMethod === 'card' ? 'credit_card' : form.paymentMethod;
  const amount = parseFloat(form.paymentAmount || '');
  return {
    paymentStatus,
    ...(paymentStatus === 'deposit' && Number.isFinite(amount) ? { amountPaid: amount } : {}),
    paymentMethod: method,
    ...(form.paymentReference?.trim() ? { paymentReference: form.paymentReference.trim() } : {}),
    ...(form.paymentNotes?.trim() ? { paymentNotes: form.paymentNotes.trim() } : {}),
  };
}

/**
 * Client-side checks before posting a job with deposit/paid.
 * @returns {string|null} Error message, or null when valid
 */
export function validateJobCreatePayment(
  form: { paymentStatus?: string; paymentAmount?: string; paymentMethod?: string },
  jobTotal: number
): string | null {
  const status = form.paymentStatus || 'unpaid';
  if (status === 'unpaid') return null;
  if (!form.paymentMethod) return 'Select a payment method.';
  if (status === 'paid') {
    if (!(jobTotal > 0)) return 'Paid in full requires a job total greater than 0.';
    return null;
  }
  const amount = parseFloat(form.paymentAmount || '');
  if (!(amount > 0)) return 'Deposit amount must be greater than 0.';
  if (jobTotal > 0 && amount >= jobTotal - 0.01) {
    return 'Deposit must be less than the job total. Choose Paid in full instead.';
  }
  return null;
}
