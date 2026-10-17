import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  getPendingSales,
  PENDING_SALES_EVENT,
  syncPendingSales,
} from '@/services/offlineSalesQueue';
import { showError, showSuccess } from '@/utils/toast';

const RETRY_INTERVAL_MS = 60 * 1000;

const salesLabel = (count) => `${count} ${count === 1 ? 'sale' : 'sales'}`;

/**
 * Sends sales saved offline on this phone/tablet: on launch, when the connection comes back, when
 * the app returns to the foreground, and every minute while any are waiting.
 * @param {{ enabled: boolean }} options
 * @returns {{ pending: Array, syncing: boolean, syncNow: () => Promise<void> }}
 */
export function useOfflineSalesSync({ enabled }) {
  const { activeTenantId, user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const queryClient = useQueryClient();
  const scope = useMemo(() => ({ tenantId: activeTenantId, userId: user?.id }), [activeTenantId, user?.id]);
  const [pending, setPending] = useState(() => (scope.tenantId && scope.userId ? getPendingSales(scope) : []));
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const update = () => setPending(scope.tenantId && scope.userId ? getPendingSales(scope) : []);
    update();
    window.addEventListener(PENDING_SALES_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(PENDING_SALES_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, [scope]);

  /** @param {{ quiet?: boolean }} [options] - quiet: automatic retry, no toast about failures */
  const syncNow = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled || !scope.tenantId || !scope.userId || syncingRef.current) return;
    if (!getPendingSales(scope).length) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!quiet) showError("Still offline. Saved sales will sync when you're back online.");
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncPendingSales(scope);
      if (result.synced > 0) {
        showSuccess(`${salesLabel(result.synced)} saved offline ${result.synced === 1 ? 'has' : 'have'} synced.`);
        queryClient.invalidateQueries();
      }
      if (!quiet && result.failed > 0) {
        showError(`${salesLabel(result.failed)} couldn't sync. Open the list to see why.`);
      } else if (!quiet && result.offline) {
        showError("Couldn't reach ABS. Saved sales will sync when the connection is back.");
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [enabled, scope, queryClient]);

  // Launch and reconnect.
  useEffect(() => {
    if (enabled && isOnline) syncNow({ quiet: true });
  }, [enabled, isOnline, syncNow]);

  // Back in the foreground, and a steady retry while something is waiting.
  useEffect(() => {
    if (!enabled || pending.length === 0) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => syncNow({ quiet: true }), RETRY_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [enabled, pending.length, syncNow]);

  return { pending, syncing, syncNow };
}

export default useOfflineSalesSync;
