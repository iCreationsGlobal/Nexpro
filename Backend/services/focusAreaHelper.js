const { STUDIO_LIKE_TYPES } = require('./sidebarPreferenceHelper');

const MAX_FOCUS_AREAS = 3;

/**
 * Master list of "what matters most to you" personalization options.
 * `businessTypes: null` means available to every business type (still subject to `requiredFeature`).
 * `requiredFeature` is checked client-side today (mobile already resolves `hasFeature()`); kept here
 * as documentation and for a future server-side cross-check.
 */
const FOCUS_AREA_DEFINITIONS = Object.freeze([
  { id: 'pos', label: 'Sell in person', businessTypes: ['shop', 'pharmacy'], requiredFeature: null },
  { id: 'online_store', label: 'Sell online', businessTypes: ['shop', 'pharmacy'], requiredFeature: null },
  { id: 'expenses', label: 'Track expenses', businessTypes: null, requiredFeature: 'expenses' },
  { id: 'deliveries', label: 'Manage deliveries', businessTypes: null, requiredFeature: 'deliveries' },
  { id: 'jobs_quotes', label: 'Jobs & quotes', businessTypes: [...STUDIO_LIKE_TYPES, 'pharmacy'], requiredFeature: null },
  { id: 'leads', label: 'Track leads', businessTypes: null, requiredFeature: 'leadPipeline' },
  { id: 'rentals', label: 'Manage rentals', businessTypes: ['rental'], requiredFeature: 'rentals' },
  { id: 'dealers', label: 'Manage dealers', businessTypes: ['shop'], requiredFeature: 'dealersAccount' },
]);

const FOCUS_AREA_ID_SET = new Set(FOCUS_AREA_DEFINITIONS.map((d) => d.id));

/**
 * Whether a focus-area id is applicable to a given business type.
 * @param {string} id
 * @param {string|null|undefined} businessType
 * @returns {boolean}
 */
function isFocusAreaAllowedForBusinessType(id, businessType = null) {
  const def = FOCUS_AREA_DEFINITIONS.find((d) => d.id === id);
  if (!def) return false;
  if (!def.businessTypes) return true;
  if (!businessType) return true;
  return def.businessTypes.includes(businessType);
}

/**
 * Keep only known, business-type-applicable ids, deduped, capped at MAX_FOCUS_AREAS, order preserved.
 * @param {unknown} ids
 * @param {string|null|undefined} [businessType]
 * @returns {string[]}
 */
function sanitizeFocusAreas(ids, businessType = null) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || !FOCUS_AREA_ID_SET.has(id) || seen.has(id)) continue;
    if (!isFocusAreaAllowedForBusinessType(id, businessType)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_FOCUS_AREAS) break;
  }
  return result;
}

/**
 * Build the API payload for a member's focus-area preference.
 * @param {object|null|undefined} membership - UserTenant instance or plain object
 * @param {string|null|undefined} [businessType] - Tenant.businessType
 * @returns {{ focusAreas: string[], source: 'user'|'none' }}
 */
function getFocusAreaPreferences(membership, businessType = null) {
  const metadata =
    membership?.metadata && typeof membership.metadata === 'object' ? membership.metadata : {};
  if (Array.isArray(metadata.focusAreas)) {
    return {
      focusAreas: sanitizeFocusAreas(metadata.focusAreas, businessType),
      source: 'user',
    };
  }
  return { focusAreas: [], source: 'none' };
}

module.exports = {
  MAX_FOCUS_AREAS,
  FOCUS_AREA_DEFINITIONS,
  isFocusAreaAllowedForBusinessType,
  sanitizeFocusAreas,
  getFocusAreaPreferences,
};
