/**
 * ABS Watch vocabulary and matching defaults.
 * Language stays low-certainty. Never accuse staff of theft.
 */

/**
 * Till linger used for sale matching, incidents, and the Counter interactions card.
 * Zone-enter stays a diagnostic event and must not open unmatched-sale review.
 */
const COUNTER_EVENT_TYPES = ['counter_interaction'];

const COUNTER_ZONE_DIAGNOSTIC_TYPES = ['person_entered_counter_zone', 'transaction_candidate'];

const VISITOR_EVENT_TYPES = ['person_entered'];

const MATCHABLE_SALE_STATUSES = ['pending', 'partially_paid', 'completed'];

const INCIDENT_KINDS = {
  MATCHED: 'matched',
  UNMATCHED_INTERACTION: 'unmatched_interaction',
  SALE_WITHOUT_EVENT: 'sale_without_event',
};

const INCIDENT_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
  NEEDS_CONTEXT: 'needs_context',
};

const REVIEW_DECISIONS = {
  CONFIRM: 'confirm',
  DISMISS: 'dismiss',
  NEEDS_CONTEXT: 'needs_context',
};

const CAMERA_ROLES = ['entrance', 'counter', 'floor', 'exit', 'other'];

const DEFAULT_MATCH_WINDOW_MINUTES = 5;
const MIN_MATCH_WINDOW_MINUTES = 3;
const MAX_MATCH_WINDOW_MINUTES = 10;

const MAX_CLIP_BYTES = 30 * 1024 * 1024;
const ALLOWED_CLIP_MIMES = ['video/mp4', 'video/webm'];
const ALLOWED_CLIP_EXTENSIONS = ['.mp4', '.webm'];

const INCIDENT_COPY = {
  [INCIDENT_KINDS.MATCHED]: 'Time in the till zone corresponds with a recorded sale.',
  [INCIDENT_KINDS.UNMATCHED_INTERACTION]:
    'Time in the till zone with no matching recorded sale. Review required — this is not a confirmed transaction.',
  [INCIDENT_KINDS.SALE_WITHOUT_EVENT]:
    'Recorded sale with no matching time in the till zone. The camera may have missed it.',
};

module.exports = {
  COUNTER_EVENT_TYPES,
  COUNTER_ZONE_DIAGNOSTIC_TYPES,
  VISITOR_EVENT_TYPES,
  MATCHABLE_SALE_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  REVIEW_DECISIONS,
  CAMERA_ROLES,
  DEFAULT_MATCH_WINDOW_MINUTES,
  MIN_MATCH_WINDOW_MINUTES,
  MAX_MATCH_WINDOW_MINUTES,
  INCIDENT_COPY,
  MAX_CLIP_BYTES,
  ALLOWED_CLIP_MIMES,
  ALLOWED_CLIP_EXTENSIONS,
};
