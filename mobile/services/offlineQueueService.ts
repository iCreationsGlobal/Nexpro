/**
 * Offline queue for sales on mobile.
 * Stores pending sales in AsyncStorage and syncs when back online.
 *
 * Each sale remembers the workspace and person that took it, and is only ever sent to that
 * workspace by that person: signing out, switching workspace or another person signing in on
 * the same phone never moves a sale. Sales stay on the device until they reach ABS.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saleService } from './saleService';

const PENDING_SALES_KEY = 'shopwise_pending_sales';

export type PendingSale = {
  localId: string;
  clientId: string;
  payload: object;
  createdAt: string;
  /** Missing on sales saved before the queue recorded who took them. */
  tenantId?: string | null;
  userId?: string | null;
  /** Why the server refused it on the last try, if it did. */
  lastError?: string;
};

/** Whose sales: a workspace and/or a person. */
export type SaleOwner = { tenantId?: string | null; userId?: string | null };

type SyncResult = { clientId?: string; id?: string; error?: string };

function generateClientId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const belongsTo = (sale: PendingSale, owner: SaleOwner = {}) =>
  (!owner.tenantId || sale.tenantId === owner.tenantId) && (!owner.userId || sale.userId === owner.userId);

async function readAll(): Promise<PendingSale[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SALES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const writeAll = (list: PendingSale[]) => AsyncStorage.setItem(PENDING_SALES_KEY, JSON.stringify(list));

export const offlineQueueService = {
  async queueSale(payload: object, owner: SaleOwner): Promise<string> {
    const payloadWithClientId = payload as { clientId?: string };
    const clientId = payloadWithClientId.clientId || generateClientId();
    const pending: PendingSale = {
      localId: clientId,
      clientId,
      payload: { ...payloadWithClientId, clientId },
      createdAt: new Date().toISOString(),
      tenantId: owner.tenantId ?? null,
      userId: owner.userId ?? null,
    };
    const list = await readAll();
    list.push(pending);
    await writeAll(list);
    return clientId;
  },

  /** Pending sales, optionally only one workspace's and/or one person's. */
  async getPendingSales(owner?: SaleOwner): Promise<PendingSale[]> {
    const list = await readAll();
    return owner ? list.filter((sale) => belongsTo(sale, owner)) : list;
  },

  async getPendingCount(owner?: SaleOwner): Promise<number> {
    return (await this.getPendingSales(owner)).length;
  },

  /**
   * Send this workspace's sales taken by this person. Sales saved before the queue recorded an
   * owner are claimed by the first signed-in session that syncs (as they were sent before).
   * Re-reads the queue before saving, so sales taken while this runs are kept.
   */
  async syncPendingSales(owner: { tenantId: string; userId: string }): Promise<{ synced: number; failed: number }> {
    const all = await readAll();
    if (all.some((sale) => !sale.tenantId)) {
      await writeAll(all.map((sale) => (sale.tenantId ? sale : { ...sale, tenantId: owner.tenantId, userId: owner.userId })));
    }
    const pending = (await readAll()).filter((sale) => belongsTo(sale, owner));
    if (pending.length === 0) return { synced: 0, failed: 0 };

    const sent = new Set<string>();
    const refused = new Map<string, string>();
    try {
      const items = pending.map((sale) => ({ clientId: sale.clientId, payload: sale.payload }));
      const res = await saleService.syncBatch(items);
      const results = (res as { results?: SyncResult[] } | null)?.results;

      if (Array.isArray(results) && results.length === pending.length) {
        results.forEach((result, index) => {
          const { clientId } = pending[index];
          if (result?.id && !result?.error) sent.add(clientId);
          else refused.set(clientId, result?.error || 'Not accepted');
        });
      } else {
        for (const sale of pending) {
          try {
            await saleService.createSale(sale.payload);
            sent.add(sale.clientId);
          } catch (error) {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
            if (message) refused.set(sale.clientId, message);
          }
        }
      }
    } catch {
      return { synced: 0, failed: pending.length };
    }

    const latest = await readAll();
    await writeAll(
      latest
        .filter((sale) => !sent.has(sale.clientId))
        .map((sale) => (refused.has(sale.clientId) ? { ...sale, lastError: refused.get(sale.clientId) } : sale)),
    );
    return { synced: sent.size, failed: pending.length - sent.size };
  },
};
