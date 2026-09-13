export const MANUAL_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
] as const;

export const RENTAL_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]['value'];
export type RentalPaymentMethod = (typeof RENTAL_PAYMENT_METHODS)[number]['value'];
export type PaymentAmountType = 'full' | 'partial';

const PAID_TOLERANCE = 0.01;

/**
 * Map UI payment methods onto the invoice Payment model enum.
 * Web sends `credit_card`; mobile chips use `card`.
 */
export function toInvoicePaymentMethod(method?: string | null): string {
  const normalized = String(method || 'cash').trim().toLowerCase();
  if (normalized === 'card') return 'credit_card';
  if (normalized === 'momo') return 'mobile_money';
  return normalized || 'cash';
}

/**
 * Parse a payment amount from a text field.
 */
export function parsePaymentAmount(value: string): number {
  const amount = parseFloat(String(value || '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : NaN;
}

/**
 * Client-side checks before recording a full or part payment.
 * @returns {string|null} Error message, or null when valid
 */
export function validateRecordedPaymentAmount(
  amount: number,
  balance: number,
  paymentType: PaymentAmountType = 'partial'
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter a valid payment amount';
  }
  if (amount > balance + PAID_TOLERANCE) {
    return 'Payment cannot exceed the balance';
  }
  if (paymentType === 'partial' && balance > PAID_TOLERANCE && amount >= balance - PAID_TOLERANCE) {
    return 'Part payment must be less than the balance. Choose Full payment instead.';
  }
  return null;
}
