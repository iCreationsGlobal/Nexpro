import type { AppIconName } from '@/components/AppIcon';
import { isRentalBusinessType, isStudioLikeBusinessType } from '@/constants';

export const MAX_FOCUS_AREAS = 3;

export type FocusAreaId =
  | 'pos'
  | 'online_store'
  | 'expenses'
  | 'deliveries'
  | 'jobs_quotes'
  | 'leads'
  | 'rentals'
  | 'dealers';

export type FocusAreaDefinition = {
  id: FocusAreaId;
  label: string;
  description: string;
  icon: AppIconName;
  /** Primary destination this focus area promotes into the tab bar / More menu / Quick Actions. */
  route: string;
  /** hasFeature() key required, if any. */
  requiredFeature?: string;
  /** Whether this focus area applies to the given business type (mirrors Backend/services/focusAreaHelper.js). */
  appliesTo: (businessType: string | undefined) => boolean;
};

/**
 * Master "what matters most to you" list. Keep in sync with Backend/services/focusAreaHelper.js
 * (FOCUS_AREA_DEFINITIONS) — ids and required features must match.
 */
export const FOCUS_AREA_DEFINITIONS: FocusAreaDefinition[] = [
  {
    id: 'pos',
    label: 'Sell in person',
    description: 'Point of sale, scanning, in-store checkout',
    icon: 'shopping-cart',
    route: '/(tabs)/sales',
    appliesTo: (bt) => bt === 'shop' || bt === 'pharmacy',
  },
  {
    id: 'online_store',
    label: 'Sell online',
    description: 'Your online storefront and orders',
    icon: 'store',
    route: '/(tabs)/store',
    appliesTo: (bt) => bt === 'shop' || bt === 'pharmacy',
  },
  {
    id: 'expenses',
    label: 'Track expenses',
    description: 'Log and monitor business spending',
    icon: 'minus-circle',
    route: '/(tabs)/expenses',
    requiredFeature: 'expenses',
    appliesTo: () => true,
  },
  {
    id: 'deliveries',
    label: 'Manage deliveries',
    description: 'Assign and track deliveries',
    icon: 'truck',
    route: '/(tabs)/deliveries',
    requiredFeature: 'deliveries',
    appliesTo: () => true,
  },
  {
    id: 'jobs_quotes',
    label: 'Jobs & quotes',
    description: 'Track jobs and send quotes',
    icon: 'briefcase',
    route: '/(tabs)/jobs',
    appliesTo: (bt) => isStudioLikeBusinessType(bt) || bt === 'pharmacy',
  },
  {
    id: 'leads',
    label: 'Track leads',
    description: 'Follow up on new leads',
    icon: 'user-plus',
    route: '/(tabs)/leads',
    requiredFeature: 'leadPipeline',
    appliesTo: () => true,
  },
  {
    id: 'rentals',
    label: 'Manage rentals',
    description: 'Track items out and due back',
    icon: 'calendar',
    route: '/(tabs)/rentals',
    requiredFeature: 'rentals',
    appliesTo: (bt) => isRentalBusinessType(bt),
  },
  {
    id: 'dealers',
    label: 'Manage dealers',
    description: 'Wholesale and dealer orders',
    icon: 'briefcase',
    route: '/(tabs)/dealers',
    requiredFeature: 'dealersAccount',
    appliesTo: (bt) => bt === 'shop',
  },
];

const FOCUS_AREA_BY_ID = new Map(FOCUS_AREA_DEFINITIONS.map((d) => [d.id, d]));

export function getFocusAreaDefinition(id: string | undefined | null): FocusAreaDefinition | undefined {
  if (!id) return undefined;
  return FOCUS_AREA_BY_ID.get(id as FocusAreaId);
}

/**
 * Options to show in the focus-area picker: applicable to this business type and,
 * when a required feature is set, enabled for this workspace.
 */
export function getAvailableFocusAreas(
  businessType: string | undefined,
  hasFeature: (key: string) => boolean
): FocusAreaDefinition[] {
  return FOCUS_AREA_DEFINITIONS.filter((def) => {
    if (!def.appliesTo(businessType)) return false;
    if (def.requiredFeature && !hasFeature(def.requiredFeature)) return false;
    return true;
  });
}

/**
 * Keep only ids that are still valid/available for this workspace, in rank order, capped at MAX_FOCUS_AREAS.
 */
export function sanitizeFocusAreaIds(
  ids: string[] | undefined | null,
  businessType: string | undefined,
  hasFeature: (key: string) => boolean
): FocusAreaId[] {
  if (!Array.isArray(ids)) return [];
  const available = new Set(getAvailableFocusAreas(businessType, hasFeature).map((d) => d.id));
  const seen = new Set<string>();
  const result: FocusAreaId[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !available.has(id as FocusAreaId) || seen.has(id)) continue;
    seen.add(id);
    result.push(id as FocusAreaId);
    if (result.length >= MAX_FOCUS_AREAS) break;
  }
  return result;
}
