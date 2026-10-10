/**
 * Phone Number Utilities
 * Handles formatting and validation of phone numbers for WhatsApp (E.164 format)
 * Supports African country codes
 */

// Common African country codes
const COUNTRY_CODES = {
  GHANA: '+233',
  NIGERIA: '+234',
  KENYA: '+254',
  SOUTH_AFRICA: '+27',
  UGANDA: '+256',
  TANZANIA: '+255',
  ETHIOPIA: '+251',
  EGYPT: '+20',
  MOROCCO: '+212',
  ALGERIA: '+213',
  TUNISIA: '+216',
  IVORY_COAST: '+225',
  CAMEROON: '+237',
  SENEGAL: '+221',
  ZAMBIA: '+260',
  ZIMBABWE: '+263',
  MALAWI: '+265',
  MOZAMBIQUE: '+258',
  ANGOLA: '+244',
  SUDAN: '+249',
  RWANDA: '+250',
  BURUNDI: '+257',
  BENIN: '+229',
  BURKINA_FASO: '+226',
  MALI: '+223',
  NIGER: '+227',
  CHAD: '+235',
  MAURITANIA: '+222',
  GAMBIA: '+220',
  GUINEA: '+224',
  SIERRA_LEONE: '+232',
  LIBERIA: '+231',
  TOGO: '+228',
  GHANA_ALT: '233' // Without + prefix
};

/**
 * A national trunk "0" sometimes ends up saved right after the country code
 * (e.g. "2330244123456") — that duplicates what the code already marks, so drop it.
 * @param {string} digits - Digits only, no leading +
 * @returns {string}
 */
const GHANA_DIAL_DIGITS = '233';
const GHANA_NATIONAL_LENGTH = 9;

/**
 * Collapse a dial code saved more than once at the start of a phone number. Happens when a
 * dial-code picker is joined to a number that already carried the code:
 *   "+233+233555155979"     → "+233555155979"
 *   "+233 +233 55 515 5979" → "+233 55 515 5979"
 *   "+233233555155979"      → "+233555155979"  (Ghana numbers have 9 digits after 233)
 * Anything else is returned trimmed and unchanged.
 * @param {string|null|undefined} phone
 * @returns {string}
 */
function collapseRepeatedDialCode(phone) {
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
 * Keep phone columns free of a doubled dial code whichever client (or app version) saved them.
 * Covers instance saves, bulk creates (imports) and bulk `Model.update` calls.
 * @param {import('sequelize').ModelStatic<any>} Model
 * @param {string[]} fields
 */
function cleanPhoneFieldsOnSave(Model, fields) {
  const cleanInstance = (instance) => {
    fields.forEach((field) => {
      const value = instance.get(field);
      if (typeof value !== 'string') return;
      const cleaned = collapseRepeatedDialCode(value);
      if (cleaned !== value.trim()) instance.set(field, cleaned);
    });
  };
  Model.addHook('beforeSave', 'collapseRepeatedDialCode', cleanInstance);
  Model.addHook('beforeBulkCreate', 'collapseRepeatedDialCode', (instances) => {
    instances.forEach(cleanInstance);
  });
  Model.addHook('beforeBulkUpdate', 'collapseRepeatedDialCode', (options) => {
    const values = options.attributes || {};
    fields.forEach((field) => {
      if (typeof values[field] !== 'string') return;
      const cleaned = collapseRepeatedDialCode(values[field]);
      if (cleaned !== values[field].trim()) values[field] = cleaned;
    });
  });
}

function stripTrunkZeroAfterCountryCode(digits) {
  const knownCode = Object.values(COUNTRY_CODES)
    .filter((code) => code.startsWith('+'))
    .map((code) => code.slice(1))
    .sort((a, b) => b.length - a.length)
    .find((code) => digits.startsWith(code) && digits[code.length] === '0');
  return knownCode ? knownCode + digits.slice(knownCode.length + 1) : digits;
}

/**
 * Format phone number to E.164 format (e.g., +233241234567)
 * @param {string} phone - Phone number in various formats
 * @param {string} defaultCountryCode - Default country code if not provided (default: +233 for Ghana)
 * @returns {string|null} - Formatted phone number in E.164 format or null if invalid
 */
function formatToE164(phone, defaultCountryCode = '+233') {
  if (!phone) return null;

  // Remove all non-digit characters except +
  let cleaned = collapseRepeatedDialCode(phone.toString()).replace(/[^\d+]/g, '');

  // If already starts with +, validate format
  if (cleaned.startsWith('+')) {
    const digits = stripTrunkZeroAfterCountryCode(cleaned.substring(1));
    if (digits.length >= 9 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  // Handle numbers starting with country code without +
  if (cleaned.startsWith('233') && cleaned.length >= 12) {
    return `+${stripTrunkZeroAfterCountryCode(cleaned)}`;
  }
  if (cleaned.startsWith('234') && cleaned.length >= 13) {
    return `+${stripTrunkZeroAfterCountryCode(cleaned)}`;
  }
  if (cleaned.startsWith('254') && cleaned.length >= 12) {
    return `+${stripTrunkZeroAfterCountryCode(cleaned)}`;
  }

  // Handle local numbers (without country code)
  // Remove leading 0 if present
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Validate length (typically 9 digits for local numbers)
  if (cleaned.length >= 9 && cleaned.length <= 10) {
    // Remove + from default country code if present
    const countryCode = defaultCountryCode.replace(/^\+/, '');
    return `+${countryCode}${cleaned}`;
  }

  return null;
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const formatted = formatToE164(phone);
  return formatted !== null;
}

/**
 * Extract country code from phone number
 * @param {string} phone - Phone number in E.164 format
 * @returns {string|null} - Country code or null
 */
function extractCountryCode(phone) {
  if (!phone || !phone.startsWith('+')) return null;
  
  // Try to match known country codes
  for (const [country, code] of Object.entries(COUNTRY_CODES)) {
    if (phone.startsWith(code)) {
      return code;
    }
  }
  
  // Extract first 1-3 digits after +
  const match = phone.match(/^\+(\d{1,3})/);
  return match ? `+${match[1]}` : null;
}

/**
 * Format phone number for display (adds spaces for readability)
 * @param {string} phone - Phone number in E.164 format
 * @returns {string} - Formatted phone number for display
 */
function formatForDisplay(phone) {
  if (!phone) return '';
  
  const formatted = formatToE164(phone);
  if (!formatted) return phone;
  
  // Format as +XXX XXX XXX XXXX
  const countryCode = formatted.substring(0, 4); // +233
  const rest = formatted.substring(4);
  
  if (rest.length <= 9) {
    // Format as XXX XXX XXXX
    return `${countryCode} ${rest.substring(0, 3)} ${rest.substring(3, 6)} ${rest.substring(6)}`;
  }
  
  return formatted;
}

/**
 * Normalize phone number (remove spaces, dashes, etc.)
 * @param {string} phone - Phone number in any format
 * @returns {string} - Normalized phone number
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  return collapseRepeatedDialCode(phone.toString()).replace(/[\s\-\(\)]/g, '');
}

module.exports = {
  collapseRepeatedDialCode,
  cleanPhoneFieldsOnSave,
  formatToE164,
  isValidPhoneNumber,
  extractCountryCode,
  formatForDisplay,
  normalizePhoneNumber,
  COUNTRY_CODES
};
