import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { settingsService } from '@/services/settings';
import { isBillingLocked, onSubscriptionLocked, type BillingStatus } from '@/utils/billingLock';

/**
 * Billing lock for the active workspace. Seeded by /auth/bootstrap (same query key), kept current by
 * /subscription/status, and flipped immediately when any request comes back SUBSCRIPTION_LOCKED.
 */
export function useBillingLock() {
  const queryClient = useQueryClient();
  const { user, activeTenantId, activeTenant } = useAuth();
  const queryKey = ['subscription', 'status', activeTenantId] as const;
  const enabled = Boolean(user && activeTenantId && !user.isPlatformAdmin);

  const query = useQuery({
    queryKey,
    queryFn: () => settingsService.getSubscriptionStatus(),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!enabled) return;
    return onSubscriptionLocked((status) => {
      queryClient.setQueryData<BillingStatus | null>(['subscription', 'status', activeTenantId], (prev) => ({
        ...prev,
        ...status,
      }));
    });
  }, [enabled, queryClient, activeTenantId]);

  const billing =
    query.data ?? ((activeTenant as { billingStatus?: BillingStatus } | null)?.billingStatus ?? null);
  const locked = enabled && isBillingLocked(billing);

  const recheck = useCallback(async () => {
    const { data } = await query.refetch();
    // Unlocked again: screens that failed while locked fetch fresh data.
    if (data && !isBillingLocked(data)) await queryClient.invalidateQueries();
  }, [query, queryClient]);

  return { locked, billing, recheck, rechecking: query.isFetching };
}
