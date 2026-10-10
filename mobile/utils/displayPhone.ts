const GHANA_DIAL_DIGITS = '233';
const GHANA_NATIONAL_LENGTH = 9;

/**
 * Collapse a dial code saved more than once at the start of a phone number. Happens when a
 * dial-code picker is joined to a number that already carried the code:
 *   "+233+233555155979"     → "+233555155979"
 *   "+233 +233 55 515 5979" → "+233 55 515 5979"
 *   "+233233555155979"      → "+233555155979"  (Ghana numbers have 9 digits after 233)
 * Anything else is returned trimmed and unchanged. Mirrors collapseRepeatedDialCode in
 * Frontend/src/utils/phoneUtils.js and Backend/utils/phoneUtils.js.
 */
export function collapseRepeatedDialCode(phone?: string | null): string {
  const value = String(phone ?? '').trim();
  const collapsed = value.replace(/^(\+\d{1,4})(?:\s*\1)+(?=[\s\d])/, '$1');
  if (collapsed !== value) return collapsed;

  const digits = value.replace(/\D/g, '');
  const doubledGhana = GHANA_DIAL_DIGITS + GHANA_DIAL_DIGITS;
  if (digits.length === doubledGhana.length + GHANA_NATIONAL_LENGTH && digits.startsWith(doubledGhana)) {
    return `+${GHANA_DIAL_DIGITS}${digits.slice(doubledGhana.length)}`;
  }
  return value;
}

/**
 * Tidy a stored phone for display/dialling. Collapses a country code saved twice
 * ("+233+233555155972" → "+233555155972"). Mirrors formatDisplayPhone in Frontend/src/utils/phoneUtils.js.
 */
export function formatDisplayPhone(phone?: string | null): string {
  return collapseRepeatedDialCode(phone);
}

/**
 * Join a dial-code picker value with the typed number without doubling the code. A number that
 * already carries a code (typed, pasted or autofilled as "+233…", "00233…" or "233…") keeps it;
 * otherwise a trunk "0" is dropped and the picker's code is added. Mirrors joinDialCode on the web.
 *   joinDialCode('+233', '0555155979')    → '+233 555155979'
 *   joinDialCode('+233', '+233555155979') → '+233555155979'
 */
export function joinDialCode(dialCode: string | null | undefined, number: string | null | undefined): string {
  const rest = String(number ?? '').trim().replace(/^00(?=\d)/, '+');
  if (!rest) return '';
  if (rest.startsWith('+')) return collapseRepeatedDialCode(rest);

  const code = String(dialCode ?? '').trim();
  if (!code) return rest;
  const codeDigits = code.replace(/\D/g, '');
  const digits = rest.replace(/\D/g, '');
  if (codeDigits && digits.startsWith(codeDigits) && digits.length - codeDigits.length >= GHANA_NATIONAL_LENGTH) {
    return `${code} ${digits.slice(codeDigits.length)}`;
  }
  return `${code} ${rest.replace(/^0+(?=\d)/, '')}`.trim();
}
