/**
 * Tidy a stored phone for display/dialling. Collapses a country code saved twice
 * ("+233+233555155972" → "+233555155972"). Mirrors formatDisplayPhone in Frontend/src/utils/phoneUtils.js.
 */
export function formatDisplayPhone(phone?: string | null): string {
  const value = String(phone ?? '').trim();
  return value.replace(/^(\+\d{1,4})(?:\s*\1)+(?=\d)/, '$1');
}
