import { useEffect, useState } from 'react';
import { onlineManager, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { QUERY_STALE } from '@/utils/queryInvalidation';
import { STARTUP_DATA_WAIT_MS, canRevealStartupData } from '@/utils/startupData';

/** Observe the mounted dashboard's request rather than issuing a second one. */
export function useStartupData(destinationReady: boolean, dashboard: boolean, visible: boolean) {
  const client = useQueryClient();
  const restoring = useIsRestoring();
  const { activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const [needsRetry, setNeedsRetry] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [settledScope, setSettledScope] = useState<string | null>(null);
  const scope = JSON.stringify([activeTenantId, activeShopId, activeStudioLocationId]);

  useEffect(() => {
    if (!destinationReady || !dashboard || !visible) return;
    setNeedsRetry(false);
    const release = () => setSettledScope(scope);
    const check = () => {
      if (!scopeReady || restoring) return;
      const queries = client.getQueryCache().findAll({ queryKey: ['dashboard', 'overview', activeTenantId, activeShopId, activeStudioLocationId] });
      const current = queries.find(query => query.getObserversCount() > 0);
      if (canRevealStartupData(current?.state)) release();
      else if (current?.state.status === 'error' || current?.state.fetchStatus === 'paused') setNeedsRetry(true);
    };
    const unsubscribe = client.getQueryCache().subscribe(check);
    const timeout = setTimeout(() => setNeedsRetry(true), STARTUP_DATA_WAIT_MS);
    check();
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [client, destinationReady, dashboard, visible, scope, scopeReady, restoring, activeTenantId, activeShopId, activeStudioLocationId, attempt]);

  const productsAllowed = hasFeature('products');
  const customersAllowed = hasFeature('crm');
  useEffect(() => {
    if (visible || !dashboard || !scopeReady || restoring || !activeTenantId || !onlineManager.isOnline()) return;
    let cancelled = false;
    // One optional request at a time; keys and response shapes match the destination screens.
    const warm = async () => {
      if (productsAllowed) {
        await client.prefetchInfiniteQuery({
          queryKey: ['products', activeTenantId, activeShopId, activeStudioLocationId, 'infinite', ''],
          initialPageParam: 1,
          queryFn: () => productService.getProducts({ page: 1, limit: 20, isActive: true }),
          staleTime: QUERY_STALE.LIST,
          retry: false,
        });
      }
      if (cancelled || !onlineManager.isOnline()) return;
      if (customersAllowed) {
        await client.prefetchQuery({
          queryKey: ['customers', activeTenantId, activeShopId, activeStudioLocationId, ''],
          queryFn: ({ signal }) => customerService.getCustomers({ page: 1, limit: 20 }, { signal, timeout: 15000 }),
          staleTime: QUERY_STALE.LIST,
          retry: false,
        });
      }
    };
    void warm();
    return () => { cancelled = true; };
  }, [client, visible, dashboard, scopeReady, restoring, activeTenantId, activeShopId, activeStudioLocationId, productsAllowed, customersAllowed]);

  return {
    ready: !dashboard || settledScope === scope,
    needsRetry,
    retry: () => {
      setAttempt(value => value + 1);
      void client.refetchQueries({ queryKey: ['dashboard', 'overview', activeTenantId, activeShopId, activeStudioLocationId], type: 'active' });
    },
    continueWithoutData: () => setSettledScope(scope),
  };
}
