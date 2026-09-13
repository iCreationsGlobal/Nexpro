import dayjs from 'dayjs';
import { getRentalDeposit, getDepositRefundableAmount } from './rentalDepositUtils';

/**
 * Financial breakdown for rental detail views.
 * Mirrors backend `computeRentalTotalDue` — waived/cancelled late charges excluded.
 * Deposit is tracked separately from rental revenue.
 * @param {object} rental
 * @returns {{ amount: number, lateChargeTotal: number, damageTotal: number, discountAmount: number, totalDue: number, amountPaid: number, balance: number, depositAmount: number, depositPaid: number, depositRemaining: number, depositHeld: number, depositStatus: string|null, depositApplied: number, depositRefundable: number, depositRefunded: number, netBalance: number }}
 */
export const computeRentalFinancials = (rental) => {
  const amount = Number(rental?.amount || 0);
  const discountAmount = Number(rental?.discountAmount || 0);
  const amountPaid = Number(rental?.amountPaid || 0);
  const totalDue = Number(rental?.totalDue || 0);

  const lateCharges = rental?.lateCharges || [];
  const damageReports = rental?.damageReports || [];

  const lateChargeTotal = lateCharges.reduce((sum, charge) => {
    const status = charge?.status || 'pending';
    if (status === 'waived' || status === 'cancelled') return sum;
    return sum + Number(charge.totalCharge || 0);
  }, 0);

  const damageTotal = damageReports.reduce(
    (sum, report) => sum + Number(report.actualRepairCost ?? report.estimatedRepairCost ?? 0),
    0
  );

  const deposit = getRentalDeposit(rental);
  const depositRefundable = getDepositRefundableAmount(rental);
  const depositHeld = deposit.status === 'held' ? depositRefundable : 0;
  const depositApplied =
    deposit.status === 'applied'
      ? Number(deposit.appliedAmount ?? deposit.paid ?? 0)
      : 0;
  const depositRefunded = Number(deposit.refundedAmount ?? 0);

  const balance = Number((totalDue - amountPaid).toFixed(2));
  const netBalance = Number(Math.max(0, totalDue - amountPaid - depositApplied).toFixed(2));

  return {
    amount,
    lateChargeTotal,
    damageTotal,
    discountAmount,
    totalDue,
    amountPaid,
    balance,
    depositAmount: deposit.amount,
    depositPaid: deposit.paid,
    depositRemaining: Number(Math.max(0, deposit.amount - deposit.paid).toFixed(2)),
    depositHeld,
    depositStatus: deposit.status,
    depositApplied,
    depositRefundable,
    depositRefunded,
    depositPaymentId: deposit.paymentId,
    depositRefundPaymentId: deposit.refundPaymentId,
    depositInvoiceId: deposit.invoiceId,
    netBalance,
  };
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toISOString() : null;
};

/**
 * Build chronological timeline events for a rental.
 * @param {object} rental
 * @returns {Array<{ id: string, at: string, title: string, description?: string, kind: string }>}
 */
export const buildRentalTimelineEvents = (rental) => {
  if (!rental) return [];

  const events = [];
  const push = (id, at, title, description, kind = 'general') => {
    const timestamp = parseTimestamp(at);
    if (!timestamp) return;
    events.push({ id, at: timestamp, title, description, kind });
  };

  if (rental.createdAt) {
    push(
      'created',
      rental.createdAt,
      'Rental created',
      rental.metadata?.convertedFromPreBookingId
        ? 'Converted from a pre-booking'
        : undefined,
      'created'
    );
  }

  const handover = rental.metadata?.handover;
  if (handover?.handedOverAt) {
    push(
      'handover',
      handover.handedOverAt,
      'Checked out / handover',
      [
        handover.notes,
        handover.earlyHandover ? 'Early handover (manager override)' : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
      'handover'
    );
  }

  (rental.extensions || []).forEach((extension) => {
    push(
      `extension-${extension.id}`,
      extension.createdAt,
      'Rental extended',
      [
        extension.extensionDays
          ? `${extension.extensionDays} extra day${extension.extensionDays === 1 ? '' : 's'}`
          : null,
        extension.newEndDate
          ? `New end date: ${dayjs(extension.newEndDate).format('MMM DD, YYYY')}`
          : null,
        extension.reason,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
      'extension'
    );
  });

  const returnInfo = rental.metadata?.return;
  if (returnInfo?.returnedAt) {
    push(
      'return',
      returnInfo.returnedAt,
      'Rental returned',
      returnInfo.inspectionNotes || undefined,
      'return'
    );
  }

  (rental.lateCharges || []).forEach((charge) => {
    const createdAt = charge.createdAt || charge.metadata?.generatedAt;
    if (createdAt) {
      push(
        `late-charge-${charge.id}`,
        createdAt,
        'Late charge created',
        `${charge.daysLate || 0} day${charge.daysLate === 1 ? '' : 's'} late`,
        'late_charge'
      );
    }

    if (charge.status === 'waived' && charge.metadata?.waivedAt) {
      push(
        `late-charge-waived-${charge.id}`,
        charge.metadata.waivedAt,
        'Late charge waived',
        charge.metadata.waiveReason || undefined,
        'late_charge_waived'
      );
    }
  });

  (rental.damageReports || []).forEach((report) => {
    const at = report.createdAt || report.inspectionDate;
    push(
      `damage-${report.id}`,
      at,
      'Damage reported',
      report.description || undefined,
      'damage'
    );
  });

  if (rental.metadata?.invoiceId) {
    const invoiceAt =
      returnInfo?.returnedAt ||
      rental.updatedAt ||
      rental.createdAt;
    push(
      'invoice',
      invoiceAt,
      'Invoice generated',
      'Invoice created for this rental',
      'invoice'
    );
  }

  return events.sort((a, b) => dayjs(a.at).valueOf() - dayjs(b.at).valueOf());
};
