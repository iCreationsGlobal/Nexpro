import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const QUERY_STALE = {
  CHECKOUT: 15_000,
  TRANSACTIONAL: 30_000,
  LIST: 60_000,
  PROFILE: 2 * 60_000,
  METADATA: 5 * 60_000,
} as const;

export const buyerQueryKeys = {
  addresses: ['addresses'] as const,
  disputes: ['disputes'] as const,
  notificationPrefs: ['notification-prefs'] as const,
  order: (id?: string) => ['order', id] as const,
  orders: ['orders'] as const,
  profile: ['profile'] as const,
  serviceBooking: (id?: string) => ['service-booking', id] as const,
  serviceBookings: ['service-bookings'] as const,
  wishlist: ['wishlist'] as const,
} as const;

const invalidatePrefixes = (queryClient: QueryClient, prefixes: QueryKey[]) =>
  Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

const refetchActivePrefixes = (queryClient: QueryClient, prefixes: QueryKey[]) =>
  Promise.all(prefixes.map((queryKey) => queryClient.refetchQueries({ queryKey, type: 'active' })));

export async function refreshRelatedQueries(queryClient: QueryClient, prefixes: QueryKey[]) {
  await invalidatePrefixes(queryClient, prefixes);
  await refetchActivePrefixes(queryClient, prefixes);
}

export async function refreshAfterBuyerAuthChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    buyerQueryKeys.addresses,
    buyerQueryKeys.orders,
    buyerQueryKeys.serviceBookings,
    buyerQueryKeys.wishlist,
    buyerQueryKeys.notificationPrefs,
    buyerQueryKeys.disputes,
  ]);
}

export async function refreshAfterProfileChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [buyerQueryKeys.profile]);
}

export async function refreshAfterWishlistChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [buyerQueryKeys.wishlist]);
}

export async function refreshAfterAddressChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [buyerQueryKeys.addresses]);
}

export async function refreshAfterOrderChange(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [
    buyerQueryKeys.orders,
    ['order'],
    buyerQueryKeys.serviceBookings,
    ['service-booking'],
    buyerQueryKeys.disputes,
  ]);
}

export async function refreshNotificationPreferences(queryClient: QueryClient) {
  await refreshRelatedQueries(queryClient, [buyerQueryKeys.notificationPrefs]);
}
