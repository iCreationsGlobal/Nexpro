export const DAY_BILLING_END_OF_DAY = 'end_of_day';
export const DAY_BILLING_OVERNIGHT = 'overnight';

export type DayBillingMode = typeof DAY_BILLING_END_OF_DAY | typeof DAY_BILLING_OVERNIGHT;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Local calendar date as YYYY-MM-DD (not UTC).
 */
export function getLocalIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string as a local calendar date.
 */
export function parseLocalIsoDate(value?: string | null): Date | null {
  const normalized = String(value || '').trim().slice(0, 10);
  if (!ISO_DATE.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Add calendar days to a YYYY-MM-DD date.
 */
export function addLocalIsoDays(isoDate: string, days: number): string {
  const date = parseLocalIsoDate(isoDate);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return getLocalIsoDate(date);
}

/**
 * Whole calendar days from start to end. Negative when end is before start.
 */
export function diffLocalIsoDays(startDate: string, endDate: string): number {
  const start = parseLocalIsoDate(startDate);
  const end = parseLocalIsoDate(endDate);
  if (!start || !end) return NaN;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function normalizeDayBillingMode(value?: string | null): DayBillingMode {
  return value === DAY_BILLING_OVERNIGHT ? DAY_BILLING_OVERNIGHT : DAY_BILLING_END_OF_DAY;
}

/**
 * Billable rental days for a date span.
 * end_of_day (cars): inclusive calendar days — same-day return = 1 day.
 * overnight (equipment): nights — pickup today / return tomorrow = 1 day.
 */
export function getRentalDayCount(
  startDate?: string | null,
  endDate?: string | null,
  dayBillingMode?: string | null
): number {
  if (!startDate || !endDate) return 0;
  const diff = diffLocalIsoDays(startDate, endDate);
  if (!Number.isFinite(diff) || diff < 0) return 0;
  if (normalizeDayBillingMode(dayBillingMode) === DAY_BILLING_OVERNIGHT) {
    return Math.max(1, diff);
  }
  return Math.max(1, diff + 1);
}

/**
 * Return date from start + number of billable days.
 */
export function getEndDateFromDuration(
  startDate?: string | null,
  durationDays?: number | string,
  dayBillingMode?: string | null
): string {
  if (!startDate) return '';
  const days = Math.max(1, Number(durationDays) || 1);
  const offset = normalizeDayBillingMode(dayBillingMode) === DAY_BILLING_OVERNIGHT
    ? days
    : days - 1;
  return addLocalIsoDays(startDate, offset);
}
