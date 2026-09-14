/**
 * Shared rental status lists. Kept in their own module (no other requires) so
 * rentalAvailabilityService and rentalUnitService don't have to require each other
 * just to share these — that circular require was leaving INVENTORY_BLOCKING_STATUSES
 * undefined in whichever of the two loaded second.
 */

/** Rental statuses that reserve inventory for overlapping date ranges. */
const INVENTORY_BLOCKING_STATUSES = ['pending', 'confirmed', 'active', 'overdue'];

/** Pre-booking statuses that reserve inventory for overlapping date ranges. */
const PRE_BOOKING_BLOCKING_STATUSES = ['pending', 'confirmed'];

module.exports = {
  INVENTORY_BLOCKING_STATUSES,
  PRE_BOOKING_BLOCKING_STATUSES,
};
