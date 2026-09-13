import { RENTAL_STATUSES } from '@/constants';
import type { RentalRow } from '@/services/rentalService';

const PAID_TOLERANCE = 0.01;

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

/**
 * Hire totals for rental list/detail. Deposit is tracked separately.
 */
export function computeRentalFinancials(rental?: Pick<RentalRow, 'totalDue' | 'amountPaid' | 'status' | 'metadata'> | null) {
  const totalDue = money(rental?.totalDue);
  const amountPaid = money(rental?.amountPaid);
  const balance = money(Math.max(0, totalDue - amountPaid));
  const invoiceId = rental?.metadata?.invoiceId || null;
  const canRecordPayment =
    Boolean(rental)
    && rental?.status !== RENTAL_STATUSES.CANCELLED
    && balance > PAID_TOLERANCE;

  return {
    totalDue,
    amountPaid,
    balance,
    invoiceId,
    canRecordPayment,
  };
}
