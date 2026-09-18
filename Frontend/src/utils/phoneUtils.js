/**
 * Phone number normalization and validation for African formats.
 * Supports Ghana (0XX / +233), and other formats (digits only, 9–15 length).
 */

/** Default country code for leading-zero normalization (Ghana = 233) */
const DEFAULT_COUNTRY_CODE = '233';

/**
 * Drop a leading national trunk "0" from a number that's about to sit next to (or already
 * carries) a dial code — e.g. a "+233" selector alongside "0244123456" would otherwise display
 * as if the number started twice ("+233 0244..."). Only ever strips one leading zero.
 * @param {string} number
 * @returns {string}
 */
export function stripLeadingTrunkZero(number) {
  return String(number ?? '').replace(/^0+(?=\d)/, '');
}

/**
 * Normalize phone to E.164-like form for storage/API.
 * - Strips spaces, dashes, parentheses.
 * - Converts leading 0 to +{countryCode} (e.g. 0XX XXX XXXX → +233XXXXXXXXX for Ghana).
 * - If already has + or international digits, keeps digits after +.
 * @param {string} phone - Raw input (e.g. "0XX XXX XXXX", "+233 XX XXX XXXX")
 * @param {string} [defaultCountryCode='233'] - Country code when normalizing 0-prefix (Ghana)
 * @returns {string} Normalized digits with leading + (e.g. "+233XXXXXXXXX")
 */
export function normalizePhone(phone, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  if (!phone || typeof phone !== 'string') return '';
  const stripped = phone.replace(/[\s\-\(\)\.]/g, '');
  const digitsOnly = stripped.replace(/\D/g, '');
  if (digitsOnly.length === 0) return '';

  // Already has + and looks international (e.g. +233...). A trunk "0" sometimes ends up typed
  // right after the country code too (e.g. "+2330244123456") — drop it, it's redundant.
  if (stripped.startsWith('+')) {
    if (digitsOnly.startsWith(defaultCountryCode) && digitsOnly[defaultCountryCode.length] === '0') {
      return '+' + defaultCountryCode + digitsOnly.slice(defaultCountryCode.length + 1);
    }
    return '+' + digitsOnly;
  }

  // Leading zero: treat as national format (e.g. Ghana 0XX -> +233XX)
  if (digitsOnly.startsWith('0') && digitsOnly.length >= 10) {
    return '+' + defaultCountryCode + digitsOnly.slice(1);
  }

  // Digits only: if length suggests international (e.g. 12 digits starting with 233), add +
  if (digitsOnly.startsWith(defaultCountryCode) && digitsOnly.length >= 12) {
    return '+' + digitsOnly;
  }

  // National format without leading 0 (e.g. 9 digits for Ghana)
  if (digitsOnly.length >= 9 && digitsOnly.length <= 10 && !digitsOnly.startsWith('0')) {
    return '+' + defaultCountryCode + digitsOnly;
  }

  return '+' + digitsOnly;
}

/**
 * Validate phone: digits (after normalization), length 9–15.
 * @param {string} phone - Raw or normalized phone
 * @param {string} [defaultCountryCode='233'] - Used when normalizing
 * @returns {{ valid: boolean, normalized: string, error?: string }}
 */
export function validatePhone(phone, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  const normalized = normalizePhone(phone, defaultCountryCode);
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Phone number is required' };
  }
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length < 9 || digitsOnly.length > 15) {
    return {
      valid: false,
      normalized,
      error: 'Phone should be 9–15 digits (e.g. 0XX XXX XXXX or +233 XX XXX XXXX)'
    };
  }
  return { valid: true, normalized, error: undefined };
}
