import dayjs from 'dayjs';

export const DAY_BILLING_END_OF_DAY = 'end_of_day';
export const DAY_BILLING_OVERNIGHT = 'overnight';

/**
 * @param {string|undefined|null} value
 * @returns {'end_of_day'|'overnight'}
 */
export const normalizeDayBillingMode = (value) => (
  value === DAY_BILLING_OVERNIGHT ? DAY_BILLING_OVERNIGHT : DAY_BILLING_END_OF_DAY
);

/**
 * Billable rental days for a date span.
 * end_of_day (cars): inclusive calendar days — same-day return = 1 day.
 * overnight (equipment): nights — pickup today / return tomorrow = 1 day.
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} [dayBillingMode]
 * @returns {number}
 */
export const getRentalDayCount = (startDate, endDate, dayBillingMode) => {
  if (!startDate || !endDate) return 0;
  const diff = dayjs(endDate).startOf('day').diff(dayjs(startDate).startOf('day'), 'day');
  if (!Number.isFinite(diff) || diff < 0) return 0;
  if (normalizeDayBillingMode(dayBillingMode) === DAY_BILLING_OVERNIGHT) {
    return Math.max(1, diff);
  }
  return Math.max(1, diff + 1);
};

/**
 * Return date from start + number of billable days.
 * @param {string} startDate
 * @param {number|string} durationDays
 * @param {string} [dayBillingMode]
 * @returns {string}
 */
export const getEndDateFromDuration = (startDate, durationDays, dayBillingMode) => {
  if (!startDate) return '';
  const days = Math.max(1, Number(durationDays) || 1);
  const offset = normalizeDayBillingMode(dayBillingMode) === DAY_BILLING_OVERNIGHT
    ? days
    : days - 1;
  return dayjs(startDate).add(offset, 'day').format('YYYY-MM-DD');
};

export const formatRentalDate = (value) => (
  value ? dayjs(value).format('DD/MM/YYYY') : '—'
);
