export const CURRENCY = {
  SYMBOL: '₵',
  DECIMAL_PLACES: 2,
};

/** Default tenant names used as placeholders; treat as incomplete onboarding */
export const DEFAULT_TENANT_NAMES = ['My Workspace', 'My Business'];

/** Storage keys for tenant isolation and auth (must match auth/api) */
export const STORAGE_KEYS = {
  // SecureStore token key (must be non-empty and alphanumeric/._-)
  token: 'token',
  ACTIVE_TENANT_ID: 'activeTenantId',
  ACTIVE_STUDIO_LOCATION_ID: 'activeStudioLocationId',
  ACTIVE_SHOP_ID: 'activeShopId',
  CART_PREFIX: '@cart_items_',
  PUSH_REGISTRATION_STATE: 'pushRegistrationState',
  /** Set after user finishes or skips the 3-screen marketing intro carousel */
  INTRO_ONBOARDING_COMPLETED: 'introOnboardingCompleted',
} as const;

export const STUDIO_TYPES = ['printing_press', 'mechanic', 'barber', 'salon'];

/** Studio-like business types (aligned with web STUDIO_LIKE_TYPES). */
export const STUDIO_LIKE_TYPES = [...STUDIO_TYPES, 'studio'] as const;

/** Shop types where Quotes are hidden (aligned with web) */
export const QUOTES_HIDDEN_SHOP_TYPES = ['restaurant'] as const;

/**
 * Whether Quotes UI should be offered (aligned with web `isQuotesEnabledForTenant`).
 */
export function isQuotesEnabledForTenant(
  businessType: string | undefined,
  shopType: string | undefined
): boolean {
  if (!businessType) return false;
  const isStudioLike = resolveBusinessType(businessType) === 'studio';
  if (isStudioLike || businessType === 'pharmacy') return true;
  if (businessType === 'shop') {
    return !QUOTES_HIDDEN_SHOP_TYPES.includes((shopType || '') as (typeof QUOTES_HIDDEN_SHOP_TYPES)[number]);
  }
  return false;
}

/** Shop types (from tenant metadata.shopType) */
export const SHOP_TYPES = {
  RESTAURANT: 'restaurant',
  SUPERMARKET: 'supermarket',
  HARDWARE: 'hardware',
  ELECTRONICS: 'electronics',
  CONVENIENCE: 'convenience',
  OTHER: 'other',
} as const;

/** Restaurant order statuses (kitchen tracking) */
export const ORDER_STATUSES = {
  RECEIVED: 'received',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
} as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  [ORDER_STATUSES.RECEIVED]: 'Received',
  [ORDER_STATUSES.PREPARING]: 'Preparing',
  [ORDER_STATUSES.READY]: 'Ready',
  [ORDER_STATUSES.COMPLETED]: 'Completed',
};

/** Job statuses */
export const JOB_STATUSES = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on_hold',
  CANCELLED: 'cancelled',
} as const;

/** Invoice statuses */
export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

/** First-party delivery statuses (jobs + sales); aligned with web */
export const DELIVERY_STATUSES = {
  READY_FOR_DELIVERY: 'ready_for_delivery',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
} as const;

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  [DELIVERY_STATUSES.READY_FOR_DELIVERY]: 'Ready for delivery',
  [DELIVERY_STATUSES.OUT_FOR_DELIVERY]: 'Out for delivery',
  [DELIVERY_STATUSES.DELIVERED]: 'Delivered',
  [DELIVERY_STATUSES.RETURNED]: 'Returned',
};

export const DELIVERY_STATUS_ORDER = [
  DELIVERY_STATUSES.READY_FOR_DELIVERY,
  DELIVERY_STATUSES.OUT_FOR_DELIVERY,
  DELIVERY_STATUSES.DELIVERED,
  DELIVERY_STATUSES.RETURNED,
] as const;

export {
  NOTIFICATION_PREFERENCE_CATEGORY_ORDER,
  NOTIFICATION_PREFERENCE_CATEGORY_LABELS,
  buildDefaultNotificationPreferences,
  normalizeNotificationPreferences,
} from './notificationPreferences';
export type { NotificationCategoryPrefs, NotificationPrefsDraft } from './notificationPreferences';

/** Expense statuses */
export const EXPENSE_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAID: 'paid',
} as const;

/**
 * Resolve effective business type (handles legacy values)
 * Legacy studio types (printing_press, mechanic, barber, salon) resolve to 'studio'
 * @param {string} businessType - From tenant
 * @returns {string} 'shop' | 'studio' | 'pharmacy'
 */
export const resolveBusinessType = (businessType: string | undefined): 'shop' | 'studio' | 'pharmacy' => {
  if (!businessType) return 'shop';
  if (STUDIO_TYPES.includes(businessType)) return 'studio';
  if (['shop', 'studio', 'pharmacy'].includes(businessType)) return businessType as 'shop' | 'studio' | 'pharmacy';
  return 'shop';
};

export const isStudioLikeBusinessType = (businessType: string | undefined): boolean =>
  resolveBusinessType(businessType) === 'studio' ||
  STUDIO_LIKE_TYPES.includes((businessType || '') as (typeof STUDIO_LIKE_TYPES)[number]);

/** Rental lifecycle statuses (aligned with web RENTAL_STATUSES). */
export const RENTAL_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  RETURNED: 'returned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const RENTAL_STATUS_LABELS: Record<string, string> = {
  [RENTAL_STATUSES.PENDING]: 'Pending',
  [RENTAL_STATUSES.CONFIRMED]: 'Confirmed',
  [RENTAL_STATUSES.ACTIVE]: 'Active',
  [RENTAL_STATUSES.OVERDUE]: 'Overdue',
  [RENTAL_STATUSES.RETURNED]: 'Returned',
  [RENTAL_STATUSES.COMPLETED]: 'Completed',
  [RENTAL_STATUSES.CANCELLED]: 'Cancelled',
};

/** Rentals where inventory is still reserved or items are out. */
export const RENTAL_OPEN_STATUSES = [
  RENTAL_STATUSES.PENDING,
  RENTAL_STATUSES.CONFIRMED,
  RENTAL_STATUSES.ACTIVE,
  RENTAL_STATUSES.OVERDUE,
] as const;

/** Rentals eligible for return. */
export const RENTAL_RETURNABLE_STATUSES = [
  RENTAL_STATUSES.ACTIVE,
  RENTAL_STATUSES.OVERDUE,
] as const;

/** Rentals eligible for checkout / handover (start date checked separately). */
export const RENTAL_CHECKOUTABLE_STATUSES = [RENTAL_STATUSES.CONFIRMED] as const;

export const isRentalBusinessType = (businessType?: string | null): boolean =>
  businessType === 'rental';
