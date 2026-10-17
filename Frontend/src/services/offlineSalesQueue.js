import saleService from './saleService';

/**
 * Sales taken with no connection on phones/tablets (web app shell), like the native app's
 * offlineQueueService. Each sale keeps the clientId it was first sent with, and the backend's
 * /sales/sync de-duplicates by clientId — a sale that reached the server before the connection
 * dropped is never recorded twice.
 *
 * Kept per tenant and user in localStorage, and NOT cleared at sign-out (they are real sales);
 * they sync the next time the same person is signed in to the same workspace on this device.
 */

const STORAGE_KEY = 'abs:pending-sales';
export const PENDING_SALES_EVENT = 'abs:pending-sales-changed';

const read = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (entries) => {
  try {
    if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or unavailable: nothing more we can do on this device.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PENDING_SALES_EVENT));
};

/** Id sent with a sale so retries and later syncs are recognised as the same sale. */
export function newSaleClientId() {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `web-${random}`;
}

/**
 * Short reference printed on the provisional receipt and kept in the sale's metadata, so the paper
 * receipt can be matched to the sale once it has synced (e.g. "OFF-1A2B3C4D").
 * @param {string} clientId
 */
export function offlineSaleReference(clientId) {
  const compact = String(clientId || '').replace(/^web-/, '').replace(/[^a-zA-Z0-9]/g, '');
  return `OFF-${compact.slice(0, 8).toUpperCase()}`;
}

/**
 * @param {{ tenantId?: string|null, userId?: string|null }} [scope]
 * @returns {Array<{ clientId: string, tenantId: string, userId: string, payload: object, total: number, itemCount: number, createdAt: string, lastError?: string }>}
 */
export function getPendingSales({ tenantId, userId } = {}) {
  return read().filter(
    (entry) => (!tenantId || entry.tenantId === tenantId) && (!userId || entry.userId === userId)
  );
}

/**
 * @param {object} payload - Same body as POST /sales; must carry its clientId
 * @param {{ tenantId: string, userId: string, total?: number }} scope
 */
export function queueSale(payload, { tenantId, userId, total }) {
  const clientId = payload.clientId || newSaleClientId();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const estimatedTotal = items.reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0) - (Number(item.discount) || 0),
    0
  );
  const entry = {
    clientId,
    reference: offlineSaleReference(clientId),
    tenantId,
    userId,
    payload: {
      ...payload,
      clientId,
      metadata: { ...(payload.metadata || {}), offlineReference: offlineSaleReference(clientId) },
    },
    total: Number(total) || estimatedTotal,
    itemCount: items.length,
    createdAt: new Date().toISOString(),
  };
  write([...read().filter((existing) => existing.clientId !== clientId), entry]);
  return entry;
}

/** Remove one saved sale without sending it (the person chose to discard it). */
export function discardPendingSale(clientId) {
  write(read().filter((entry) => entry.clientId !== clientId));
}

/**
 * Send this person's saved sales for this workspace. Sales the server rejects stay saved with the
 * reason, so they can be reviewed; a failed request (still offline) leaves everything as it was.
 * @param {{ tenantId: string, userId: string }} scope
 * @returns {Promise<{ synced: number, failed: number, remaining: number, offline?: boolean }>}
 */
export async function syncPendingSales({ tenantId, userId }) {
  const mine = getPendingSales({ tenantId, userId });
  if (!mine.length) return { synced: 0, failed: 0, remaining: 0 };

  let results;
  try {
    const response = await saleService.syncBatch(
      mine.map((entry) => ({ clientId: entry.clientId, payload: entry.payload }))
    );
    results = Array.isArray(response?.results) ? response.results : [];
  } catch {
    return { synced: 0, failed: 0, remaining: mine.length, offline: true };
  }

  const synced = new Set();
  const errors = new Map();
  results.forEach((result) => {
    if (!result?.clientId) return;
    if (result.id && !result.error) synced.add(result.clientId);
    else errors.set(result.clientId, result.error || 'The server could not record this sale.');
  });

  const next = read()
    .filter((entry) => !synced.has(entry.clientId))
    .map((entry) => (errors.has(entry.clientId) ? { ...entry, lastError: errors.get(entry.clientId) } : entry));
  write(next);

  return {
    synced: synced.size,
    failed: errors.size,
    remaining: getPendingSales({ tenantId, userId }).length,
  };
}
