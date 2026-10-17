import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getPendingSales, syncPendingSales } from '@/services/offlineSalesQueue';
import { showSuccess } from '@/utils/toast';

/**
 * Sign out from the account menu without losing track of sales taken offline: if this person has
 * sales still on the device, try to send them first; if some remain (offline, or rejected), ask
 * before signing out. They stay on the device either way and send at the next sign-in.
 * @returns {{
 *   requestSignOut: () => Promise<void>,
 *   pendingCheck: { step: 'idle'|'syncing'|'confirm', count: number, otherWorkspaces: number },
 *   confirmSignOut: () => void,
 *   cancelSignOut: () => void,
 * }}
 */
export function useSignOut() {
  const navigate = useNavigate();
  const { logout, user, activeTenantId } = useAuth();
  const [pendingCheck, setPendingCheck] = useState({ step: 'idle', count: 0, otherWorkspaces: 0 });

  const signOutNow = useCallback(() => {
    setPendingCheck({ step: 'idle', count: 0, otherWorkspaces: 0 });
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const requestSignOut = useCallback(async () => {
    const userId = user?.id;
    const remaining = () => (userId ? getPendingSales({ userId }) : []);
    if (remaining().length === 0) {
      signOutNow();
      return;
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (isOnline && activeTenantId) {
      setPendingCheck({ step: 'syncing', count: remaining().length, otherWorkspaces: 0 });
      const result = await syncPendingSales({ tenantId: activeTenantId, userId });
      if (remaining().length === 0) {
        if (result.synced > 0) showSuccess('Sales saved offline have synced.');
        signOutNow();
        return;
      }
    }

    const left = remaining();
    setPendingCheck({
      step: 'confirm',
      count: left.length,
      otherWorkspaces: left.filter((entry) => entry.tenantId !== activeTenantId).length,
    });
  }, [user?.id, activeTenantId, signOutNow]);

  const cancelSignOut = useCallback(() => {
    setPendingCheck({ step: 'idle', count: 0, otherWorkspaces: 0 });
  }, []);

  return { requestSignOut, pendingCheck, confirmSignOut: signOutNow, cancelSignOut };
}

export default useSignOut;
