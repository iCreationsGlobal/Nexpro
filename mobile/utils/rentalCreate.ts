import { parsePaymentAmount } from '@/utils/recordPayment';
import {
  getEndDateFromDuration,
  getLocalIsoDate,
  getRentalDayCount,
  parseLocalIsoDate,
  type DayBillingMode,
} from '@/utils/rentalDayBilling';

export const HIRE_PAYMENT_FULL = 'full';
export const HIRE_PAYMENT_PARTIAL = 'partial';
export const HIRE_PAYMENT_CREDIT = 'credit';

export const HIRE_PAYMENT_MODES = [
  { value: HIRE_PAYMENT_FULL, label: 'Full payment' },
  { value: HIRE_PAYMENT_PARTIAL, label: 'Part payment' },
  { value: HIRE_PAYMENT_CREDIT, label: 'Credit' },
] as const;

export type HirePaymentMode =
  | typeof HIRE_PAYMENT_FULL
  | typeof HIRE_PAYMENT_PARTIAL
  | typeof HIRE_PAYMENT_CREDIT;

export type RentalCreateLine = {
  productId: string;
  name?: string;
  quantity: number;
  rentalRatePerDay: number;
};

export type CreateRentalItemPayload = {
  productId: string;
  quantity: number;
  rentalRatePerDay: number;
};

export type CreateRentalPayload = {
  customerId: string;
  startDate: string;
  endDate: string;
  paymentMethod: string;
  amountPaid: number;
  discountAmount: number;
  depositAmount: number;
  depositPaid: boolean;
  operationalLocation?: string;
  promisedPaymentDate?: string;
  items: CreateRentalItemPayload[];
  branchId?: string;
};

export type RentalCreateDraft = {
  customerId: string;
  startDate: string;
  durationDays: number;
  hirePaymentMode: HirePaymentMode;
  hireAmountPaid?: string | number;
  paymentMethod?: string;
  promisedPaymentDate?: string;
  discountAmount?: string | number;
  depositAmount?: string | number;
  operationalLocation?: string;
  items: RentalCreateLine[];
  dayBillingMode?: DayBillingMode | string | null;
};

const MONEY_TOLERANCE = 0.01;

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

function parseOptionalMoney(value: string | number | undefined): number {
  if (value === undefined || value === '') return 0;
  if (typeof value === 'number') return money(value);
  const parsed = parsePaymentAmount(String(value));
  return Number.isFinite(parsed) ? money(parsed) : NaN;
}

/**
 * Tomorrow on the device calendar, used as the default promised-payment date.
 */
export function getTomorrowIsoDate(fromDate: Date = new Date()): string {
  const next = new Date(fromDate);
  next.setDate(next.getDate() + 1);
  return getLocalIsoDate(next);
}

export function resolveRentalEndDate(
  startDate: string,
  durationDays: number,
  dayBillingMode?: string | null
): string {
  return getEndDateFromDuration(startDate, durationDays, dayBillingMode);
}

/**
 * Hire due before payment: daily rates × billable days − discount.
 */
export function estimateHireDue(
  items: RentalCreateLine[],
  startDate: string,
  endDate: string,
  discountAmount = 0,
  dayBillingMode?: string | null
): number {
  const days = getRentalDayCount(startDate, endDate, dayBillingMode);
  const itemsPrice = items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const rate = Math.max(0, Number(item.rentalRatePerDay) || 0);
    return sum + qty * rate;
  }, 0);
  const subtotal = money(itemsPrice * days);
  return Math.max(0, money(subtotal - money(discountAmount)));
}

function needsPromisedPaymentDate(mode: HirePaymentMode): boolean {
  return mode === HIRE_PAYMENT_CREDIT || mode === HIRE_PAYMENT_PARTIAL;
}

/**
 * Client-side checks before POST /rentals.
 * @returns Error message, or null when the draft can be submitted
 */
export function validateRentalCreateDraft(draft: RentalCreateDraft): string | null {
  if (!String(draft.customerId || '').trim()) {
    return 'Select a customer';
  }
  if (!parseLocalIsoDate(draft.startDate)) {
    return 'Enter a valid start date (YYYY-MM-DD)';
  }
  const duration = Number(draft.durationDays);
  if (!Number.isInteger(duration) || duration < 1) {
    return 'Enter at least 1 hire day';
  }
  const endDate = resolveRentalEndDate(draft.startDate, duration, draft.dayBillingMode);
  if (!parseLocalIsoDate(endDate)) {
    return 'Enter a valid hire duration';
  }

  const items = (draft.items || []).filter((item) => item.productId && Number(item.quantity) > 0);
  if (!items.length) {
    return 'Add at least one rentable item';
  }
  if (items.some((item) => Number(item.rentalRatePerDay) < 0)) {
    return 'Daily rate cannot be negative';
  }

  const discount = parseOptionalMoney(draft.discountAmount);
  if (!Number.isFinite(discount) || discount < 0) {
    return 'Discount cannot be negative';
  }
  const deposit = parseOptionalMoney(draft.depositAmount);
  if (!Number.isFinite(deposit) || deposit < 0) {
    return 'Deposit cannot be negative';
  }

  const hireDue = estimateHireDue(items, draft.startDate, endDate, discount, draft.dayBillingMode);
  const mode = draft.hirePaymentMode || HIRE_PAYMENT_CREDIT;

  if (mode === HIRE_PAYMENT_PARTIAL) {
    const paidNow = parseOptionalMoney(draft.hireAmountPaid);
    if (!Number.isFinite(paidNow) || paidNow <= 0) {
      return 'Enter the amount being paid now';
    }
    if (hireDue <= MONEY_TOLERANCE) {
      return 'Nothing to part-pay on this hire';
    }
    if (paidNow >= hireDue - MONEY_TOLERANCE) {
      return 'Amount paid now must be less than the hire due. Use full payment.';
    }
  }

  if (needsPromisedPaymentDate(mode)) {
    const promised = String(draft.promisedPaymentDate || '').trim();
    if (!parseLocalIsoDate(promised)) {
      return 'Enter the promised payment date (YYYY-MM-DD)';
    }
    if (promised < getLocalIsoDate()) {
      return 'Promised payment date cannot be in the past';
    }
  }

  return null;
}

/**
 * Build the POST /rentals body from a validated checkout draft.
 */
export function buildCreateRentalPayload(draft: RentalCreateDraft): CreateRentalPayload {
  const items = (draft.items || [])
    .filter((item) => item.productId && Number(item.quantity) > 0)
    .map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      rentalRatePerDay: Number(item.rentalRatePerDay || 0),
    }));
  const discountAmount = money(parseOptionalMoney(draft.discountAmount) || 0);
  const depositAmount = money(parseOptionalMoney(draft.depositAmount) || 0);
  const endDate = resolveRentalEndDate(draft.startDate, draft.durationDays, draft.dayBillingMode);
  const hireDue = estimateHireDue(items, draft.startDate, endDate, discountAmount, draft.dayBillingMode);
  const mode = draft.hirePaymentMode || HIRE_PAYMENT_CREDIT;
  const collectingHire = mode === HIRE_PAYMENT_FULL || mode === HIRE_PAYMENT_PARTIAL;
  const amountPaid = mode === HIRE_PAYMENT_FULL
    ? hireDue
    : mode === HIRE_PAYMENT_PARTIAL
      ? money(parseOptionalMoney(draft.hireAmountPaid) || 0)
      : 0;
  const collectingDeposit = depositAmount > 0;
  const paymentMethod = (collectingHire || collectingDeposit)
    ? (String(draft.paymentMethod || 'cash').trim() || 'cash')
    : 'credit';
  const operationalLocation = String(draft.operationalLocation || '').trim();
  const promisedPaymentDate = needsPromisedPaymentDate(mode)
    ? String(draft.promisedPaymentDate || '').trim() || undefined
    : undefined;

  return {
    customerId: draft.customerId,
    startDate: draft.startDate,
    endDate,
    paymentMethod,
    amountPaid,
    discountAmount,
    depositAmount,
    depositPaid: collectingDeposit,
    ...(operationalLocation ? { operationalLocation } : {}),
    ...(promisedPaymentDate ? { promisedPaymentDate } : {}),
    items,
  };
}

export function unwrapCreatedRentalId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const top = response as { data?: unknown; id?: unknown };
  if (typeof top.id === 'string' && top.id) return top.id;
  if (top.data && typeof top.data === 'object') {
    const nested = top.data as { id?: unknown; data?: { id?: unknown } };
    if (typeof nested.id === 'string' && nested.id) return nested.id;
    if (typeof nested.data?.id === 'string' && nested.data.id) return nested.data.id;
  }
  return null;
}

export type RentalAvailabilityRow = {
  productId?: string;
  productName?: string | null;
  availableQty?: number;
  requestedQty?: number;
  canFulfill?: boolean;
  reason?: string | null;
};

export function parseAvailabilityItems(response: unknown): RentalAvailabilityRow[] {
  if (!response || typeof response !== 'object') return [];
  const top = response as { data?: { items?: unknown } };
  const items = top.data?.items;
  return Array.isArray(items) ? (items as RentalAvailabilityRow[]) : [];
}
