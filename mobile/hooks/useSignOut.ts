import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { offlineQueueService, type PendingSale } from '@/services/offlineQueueService';
import { getCurrentNetworkOnline } from '@/utils/connectivity';
import { refreshAfterSale } from '@/utils/queryInvalidation';

const salesLabel = (count: number) => `${count} ${count === 1 ? 'sale' : 'sales'}`;

/** What to tell someone signing out while sales they took offline are still on the phone. */
export function pendingSignOutMessage(pending: PendingSale[], activeTenantId: string | null | undefined) {
  const count = pending.length;
  const elsewhere = pending.filter((sale) => sale.tenantId !== activeTenantId).length;
  const where = elsewhere > 0
    ? ` ${elsewhere === count ? (count === 1 ? 'It belongs' : 'All of them belong') : `${elsewhere} ${elsewhere === 1 ? 'belongs' : 'belong'}`}`
      + ` to another workspace — switch to it while online to send ${elsewhere === 1 ? 'it' : 'them'}.`
    : ` Connect to the internet and stay signed in to send ${count === 1 ? 'it' : 'them'} now.`;
  return {
    title: `${salesLabel(count)} ${count === 1 ? "hasn't" : "haven't"} reached ABS yet`,
    message:
      `${count === 1 ? 'It is' : 'They are'} saved on this phone.${where} If you sign out, `
      + `${count === 1 ? 'it stays' : 'they stay'} here and will send the next time you sign in. `
      + `Until then ${count === 1 ? 'it is' : 'they are'} not in your sales reports.`,
  };
}

/**
 * Sign out without losing track of sales taken offline: send this person's sales for the open
 * workspace first; if any are still on the phone, ask before signing out (they stay either way).
 * Resolves true once signed out, false if the person stayed signed in.
 */
export function useSignOut() {
  const { logout, user, activeTenantId } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(
    async ({ confirm }: { confirm?: { title: string; message: string; action: string } } = {}): Promise<boolean> => {
      const userId = user?.id;
      const remaining = () => (userId ? offlineQueueService.getPendingSales({ userId }) : Promise.resolve([]));

      if (userId && activeTenantId && (await remaining()).length > 0 && (await getCurrentNetworkOnline())) {
        const { synced } = await offlineQueueService.syncPendingSales({ tenantId: activeTenantId, userId }).catch(() => ({ synced: 0 }));
        if (synced > 0) await refreshAfterSale(queryClient).catch(() => {});
      }

      const left = await remaining();
      const ask = left.length > 0
        ? { ...pendingSignOutMessage(left, activeTenantId), stay: 'Stay signed in', action: 'Sign out anyway' }
        : confirm && { ...confirm, stay: 'Cancel' };
      if (!ask) {
        await logout();
        return true;
      }
      return new Promise<boolean>((resolve) => {
        Alert.alert(
          ask.title,
          ask.message,
          [
            { text: ask.stay, style: 'cancel', onPress: () => resolve(false) },
            {
              text: ask.action,
              style: 'destructive',
              onPress: () => {
                void logout().then(() => resolve(true), () => resolve(false));
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
    },
    [logout, user?.id, activeTenantId, queryClient],
  );
}

export default useSignOut;
