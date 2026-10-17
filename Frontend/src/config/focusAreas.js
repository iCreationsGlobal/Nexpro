import {
  Banknote,
  Briefcase,
  CalendarClock,
  ShoppingCart,
  Store,
  Truck,
  UserPlus,
  Building2,
} from 'lucide-react';
import { STUDIO_LIKE_TYPES } from '@/constants';

export const MAX_FOCUS_AREAS = 3;

/**
 * "What matters most to you" picks — the same list as mobile/constants/focusAreas.ts and
 * Backend/services/focusAreaHelper.js (ids, business types and required features must match;
 * mobile/__tests__/webParity.test.ts checks). Members choose them in the mobile app; the web
 * app reads them to fill the flexible tab-bar slot on phones and tablets.
 *
 * `paths` are web routes in preference order: the first one the member's menu allows wins.
 * `tabLabel` is short enough for a five-slot tab bar.
 */
export const FOCUS_AREA_DEFINITIONS = Object.freeze([
  {
    id: 'pos',
    label: 'Sell in person',
    tabLabel: 'Sales',
    icon: ShoppingCart,
    paths: ['/sales'],
    appliesTo: (bt) => bt === 'shop' || bt === 'pharmacy',
  },
  {
    id: 'online_store',
    label: 'Sell online',
    tabLabel: 'Store',
    icon: Store,
    paths: ['/online-store', '/store'],
    appliesTo: (bt) => bt === 'shop' || bt === 'pharmacy',
  },
  {
    id: 'expenses',
    label: 'Track expenses',
    tabLabel: 'Expenses',
    icon: Banknote,
    paths: ['/expenses'],
    requiredFeature: 'expenses',
    appliesTo: () => true,
  },
  {
    id: 'deliveries',
    label: 'Manage deliveries',
    tabLabel: 'Deliveries',
    icon: Truck,
    paths: ['/deliveries'],
    requiredFeature: 'deliveries',
    appliesTo: () => true,
  },
  {
    id: 'jobs_quotes',
    label: 'Jobs & quotes',
    tabLabel: 'Jobs',
    icon: Briefcase,
    paths: ['/jobs', '/quotes'],
    appliesTo: (bt) => STUDIO_LIKE_TYPES.includes(bt) || bt === 'studio' || bt === 'pharmacy',
  },
  {
    id: 'leads',
    label: 'Track leads',
    tabLabel: 'Leads',
    icon: UserPlus,
    paths: ['/leads'],
    requiredFeature: 'leadPipeline',
    appliesTo: () => true,
  },
  {
    id: 'rentals',
    label: 'Manage rentals',
    tabLabel: 'Rentals',
    icon: CalendarClock,
    paths: ['/rentals'],
    requiredFeature: 'rentals',
    appliesTo: (bt) => bt === 'rental',
  },
  {
    id: 'dealers',
    label: 'Manage dealers',
    tabLabel: 'Dealers',
    icon: Building2,
    paths: ['/dealers'],
    requiredFeature: 'dealersAccount',
    appliesTo: (bt) => bt === 'shop',
  },
]);

const FOCUS_AREA_BY_ID = new Map(FOCUS_AREA_DEFINITIONS.map((d) => [d.id, d]));

/** @param {string|null|undefined} id */
export function getFocusAreaDefinition(id) {
  if (!id) return undefined;
  return FOCUS_AREA_BY_ID.get(id);
}

/**
 * Keep only ids that apply to this workspace, in rank order, capped at MAX_FOCUS_AREAS.
 * @param {unknown} ids
 * @param {string|null|undefined} businessType
 * @param {(key: string) => boolean} hasFeature
 * @returns {string[]}
 */
export function sanitizeFocusAreaIds(ids, businessType, hasFeature) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    const def = typeof id === 'string' ? FOCUS_AREA_BY_ID.get(id) : undefined;
    if (!def || seen.has(id) || !def.appliesTo(businessType)) continue;
    if (def.requiredFeature && !hasFeature(def.requiredFeature)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_FOCUS_AREAS) break;
  }
  return result;
}
