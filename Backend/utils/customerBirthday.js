/**
 * Customer birthday helpers (day + month only; year is not collected).
 * Stored as DATEONLY with fixed year 2000 so birthday matching on MM-DD
 * works for both new and legacy full DOBs.
 */

const BIRTHDAY_STORAGE_YEAR = 2000;

/**
 * @param {number} month - 1–12
 * @param {number} day - 1–31
 * @returns {number}
 */
function daysInMonth(month, dayYear = BIRTHDAY_STORAGE_YEAR) {
  return new Date(dayYear, month, 0).getDate();
}

/**
 * Parse a birthday-like value into month/day (1-based). Year is ignored.
 * @param {string|Date|null|undefined} value
 * @returns {{ month: number, day: number }|null}
 */
function parseBirthdayParts(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }

  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month)) {
      return { month, day };
    }
    return null;
  }

  const mdMatch = raw.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mdMatch) {
    const month = Number(mdMatch[1]);
    const day = Number(mdMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month)) {
      return { month, day };
    }
    return null;
  }

  return null;
}

/**
 * Normalize any birthday input to DATEONLY `2000-MM-DD`, or null.
 * Accepts full dates, MM-DD, or empty.
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
function normalizeBirthdayDate(value) {
  if (value == null || value === '') return null;
  const parts = parseBirthdayParts(value);
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${BIRTHDAY_STORAGE_YEAR}-${mm}-${dd}`;
}

/**
 * @param {string|Date|null|undefined} value
 * @returns {string|null} MM-DD or null
 */
function toMonthDayString(value) {
  const parts = parseBirthdayParts(value);
  if (!parts) return null;
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Compare birthday month/day to a reference date (defaults to now).
 * @param {string|Date|null|undefined} birthdayValue
 * @param {Date} [now]
 * @returns {{ sameMonth: boolean, sameDay: boolean }}
 */
function matchBirthdayMonthDay(birthdayValue, now = new Date()) {
  const parts = parseBirthdayParts(birthdayValue);
  if (!parts) return { sameMonth: false, sameDay: false };
  const sameMonth = parts.month === now.getMonth() + 1;
  const sameDay = parts.day === now.getDate();
  return { sameMonth, sameDay };
}

module.exports = {
  BIRTHDAY_STORAGE_YEAR,
  daysInMonth,
  parseBirthdayParts,
  normalizeBirthdayDate,
  toMonthDayString,
  matchBirthdayMonthDay,
};
