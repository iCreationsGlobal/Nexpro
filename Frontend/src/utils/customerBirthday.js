/**
 * Customer birthday helpers (day + month only; year is not collected).
 * Stored as DATEONLY with fixed year 2000 (only month and day matter).
 */

export const BIRTHDAY_STORAGE_YEAR = 2000;

export const BIRTHDAY_MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

/**
 * @param {number} month - 1–12
 * @returns {number}
 */
export function daysInMonth(month) {
  return new Date(BIRTHDAY_STORAGE_YEAR, month, 0).getDate();
}

/**
 * @param {string|Date|null|undefined} value
 * @returns {{ month: string, day: string }|null} month/day as strings for selects
 */
export function parseBirthdayParts(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      month: String(value.getUTCMonth() + 1),
      day: String(value.getUTCDate()),
    };
  }

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month)) {
      return { month: String(month), day: String(day) };
    }
    return null;
  }

  const mdMatch = raw.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mdMatch) {
    const month = Number(mdMatch[1]);
    const day = Number(mdMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month)) {
      return { month: String(month), day: String(day) };
    }
  }

  return null;
}

/**
 * Build storage DATEONLY `2000-MM-DD` from month/day select values.
 * @param {string|number|null|undefined} month
 * @param {string|number|null|undefined} day
 * @returns {string} empty string when incomplete/invalid
 */
export function toBirthdayStorageDate(month, day) {
  if (month == null || month === '' || day == null || day === '') return '';
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12) return '';
  if (d < 1 || d > daysInMonth(m)) return '';
  return `${BIRTHDAY_STORAGE_YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Format birthday for display (e.g. "Mar 15") without year.
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatBirthdayDisplay(value) {
  const parts = parseBirthdayParts(value);
  if (!parts) return '';
  const date = new Date(Date.UTC(BIRTHDAY_STORAGE_YEAR, Number(parts.month) - 1, Number(parts.day)));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
