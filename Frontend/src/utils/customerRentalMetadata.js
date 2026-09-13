/** Rental customer metadata helpers — read/write `Customer.metadata.rental`. */

export const RENTER_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'government', label: 'Government' },
];

export const ID_TYPE_OPTIONS = [
  { value: 'ghanaCard', label: 'Ghana Card' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivingLicense', label: 'Driving License' },
  { value: 'nid', label: 'National ID' },
];

export const RELATIONSHIP_OPTIONS = [
  { value: 'Spouse', label: 'Spouse' },
  { value: 'Parent', label: 'Parent' },
  { value: 'Sibling', label: 'Sibling' },
  { value: 'Friend', label: 'Friend' },
  { value: 'Colleague', label: 'Colleague' },
  { value: 'Other', label: 'Other' },
];

export const RISK_RATING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/**
 * Resolve a select option label from its stored value.
 * @param {Array<{ value: string, label: string }>} options
 * @param {string|undefined|null} value
 * @returns {string|undefined}
 */
export function getOptionLabel(options, value) {
  if (!value) return undefined;
  const found = options.find((opt) => opt.value === value);
  return found?.label || String(value);
}

/**
 * True when `metadata.rental` has any profile fields beyond empty history.
 * @param {Record<string, unknown>|null|undefined} rental
 * @returns {boolean}
 */
export function hasRentalProfileData(rental) {
  if (!rental || typeof rental !== 'object') return false;
  const keys = Object.keys(rental).filter((key) => key !== 'history');
  return keys.length > 0;
}

/**
 * True when rental history summary exists in metadata.
 * @param {Record<string, unknown>|null|undefined} history
 * @returns {boolean}
 */
export function hasRentalHistorySummary(history) {
  if (!history || typeof history !== 'object') return false;
  return (
    (typeof history.totalRentals === 'number' && history.totalRentals > 0) ||
    Boolean(history.lastRentalDate)
  );
}

/** Default empty rental form field values. */
export const RENTAL_FORM_DEFAULTS = {
  rentalRenterType: '',
  rentalIdType: '',
  rentalIdNumber: '',
  rentalIdExpiry: '',
  rentalEmergencyName: '',
  rentalEmergencyPhone: '',
  rentalEmergencyRelationship: '',
  rentalGuarantorName: '',
  rentalGuarantorPhone: '',
  rentalGuarantorIdType: '',
  rentalGuarantorIdNumber: '',
  rentalGuarantorRelationship: '',
  rentalRiskRating: '',
  rentalRiskNotes: '',
};

/**
 * Pick non-empty string from a value.
 * @param {unknown} val
 * @returns {string|undefined}
 */
function pickString(val) {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  return s || undefined;
}

/**
 * Build nested object, omitting if empty.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>|undefined}
 */
function compactObject(obj) {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Build `metadata.rental` patch from flat form values.
 * Omits empty sections; preserves structure expected by backend merge.
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>|null}
 */
export function buildRentalMetadataFromForm(values) {
  const rental = {};

  const renterType = pickString(values.rentalRenterType);
  if (renterType) rental.renterType = renterType;

  const identification = compactObject({
    idType: pickString(values.rentalIdType),
    idNumber: pickString(values.rentalIdNumber),
    idExpiry: pickString(values.rentalIdExpiry),
  });
  if (identification) rental.identification = identification;

  const emergencyContact = compactObject({
    name: pickString(values.rentalEmergencyName),
    phone: pickString(values.rentalEmergencyPhone),
    relationship: pickString(values.rentalEmergencyRelationship),
  });
  if (emergencyContact) rental.emergencyContact = emergencyContact;

  const guarantor = compactObject({
    name: pickString(values.rentalGuarantorName),
    phone: pickString(values.rentalGuarantorPhone),
    idType: pickString(values.rentalGuarantorIdType),
    idNumber: pickString(values.rentalGuarantorIdNumber),
    relationship: pickString(values.rentalGuarantorRelationship),
  });
  if (guarantor) rental.guarantor = guarantor;

  const riskProfile = compactObject({
    riskRating: pickString(values.rentalRiskRating),
    riskNotes: pickString(values.rentalRiskNotes),
  });
  if (riskProfile) rental.riskProfile = riskProfile;

  return Object.keys(rental).length ? rental : null;
}

/**
 * Map `customer.metadata.rental` into flat form defaults for edit/create reset.
 * @param {Record<string, unknown>|null|undefined} customer
 * @returns {typeof RENTAL_FORM_DEFAULTS}
 */
export function rentalFormValuesFromCustomer(customer) {
  const rental = customer?.metadata?.rental || {};
  const identification = rental.identification || {};
  const emergencyContact = rental.emergencyContact || {};
  const guarantor = rental.guarantor || {};
  const riskProfile = rental.riskProfile || {};

  return {
    rentalRenterType: rental.renterType || '',
    rentalIdType: identification.idType || '',
    rentalIdNumber: identification.idNumber || '',
    rentalIdExpiry: identification.idExpiry || '',
    rentalEmergencyName: emergencyContact.name || '',
    rentalEmergencyPhone: emergencyContact.phone || '',
    rentalEmergencyRelationship: emergencyContact.relationship || '',
    rentalGuarantorName: guarantor.name || '',
    rentalGuarantorPhone: guarantor.phone || '',
    rentalGuarantorIdType: guarantor.idType || '',
    rentalGuarantorIdNumber: guarantor.idNumber || '',
    rentalGuarantorRelationship: guarantor.relationship || '',
    rentalRiskRating: riskProfile.riskRating || '',
    rentalRiskNotes: riskProfile.riskNotes || '',
  };
}
