import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/services/saleService', () => ({
  default: { syncBatch: vi.fn(), createSale: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ activeTenantId: 't1', user: { id: 'u1' } }),
}));
const deviceMode = { isAppShell: true };
vi.mock('@/hooks/useDeviceMode', () => ({
  useDeviceMode: () => deviceMode,
  matchesAppShell: () => deviceMode.isAppShell,
}));

import saleService from '@/services/saleService';
import {
  discardPendingSale,
  getPendingSales,
  queueSale,
  syncPendingSales,
} from '@/services/offlineSalesQueue';
import { usePOS } from '@/hooks/usePOS';

// The shared test setup stubs localStorage so nothing is stored; these tests need a real store.
const store = new Map();
beforeEach(() => {
  store.clear();
  localStorage.getItem.mockImplementation((key) => (store.has(key) ? store.get(key) : null));
  localStorage.setItem.mockImplementation((key, value) => {
    store.set(key, String(value));
  });
  localStorage.removeItem.mockImplementation((key) => {
    store.delete(key);
  });
  vi.clearAllMocks();
  deviceMode.isAppShell = true;
});
afterEach(() => {
  localStorage.getItem.mockImplementation(() => null);
  localStorage.setItem.mockImplementation(() => {});
  localStorage.removeItem.mockImplementation(() => {});
  vi.restoreAllMocks();
});

const SALE = {
  items: [
    { productId: 'p1', quantity: 2, unitPrice: 10, discount: 0 },
    { productId: 'p2', quantity: 1, unitPrice: 5, discount: 1 },
  ],
  paymentMethod: 'cash',
  amountPaid: 24,
};

describe('offlineSalesQueue', () => {
  it('saves a sale with its client id, scoped to the workspace and person', () => {
    const entry = queueSale({ ...SALE, clientId: 'web-1' }, { tenantId: 't1', userId: 'u1' });
    expect(entry).toMatchObject({ clientId: 'web-1', tenantId: 't1', userId: 'u1', itemCount: 2, total: 24 });
    expect(entry.payload.clientId).toBe('web-1');
    queueSale(SALE, { tenantId: 't2', userId: 'u1', total: 99 });
    expect(getPendingSales({ tenantId: 't1', userId: 'u1' }).map((sale) => sale.clientId)).toEqual(['web-1']);
    expect(getPendingSales().length).toBe(2);
  });

  it('removes synced sales and keeps rejected ones with the reason', async () => {
    queueSale({ ...SALE, clientId: 'a' }, { tenantId: 't1', userId: 'u1' });
    queueSale({ ...SALE, clientId: 'b' }, { tenantId: 't1', userId: 'u1' });
    queueSale({ ...SALE, clientId: 'other' }, { tenantId: 't1', userId: 'someone-else' });
    saleService.syncBatch.mockResolvedValue({
      success: true,
      results: [{ clientId: 'a', id: 'sale-1' }, { clientId: 'b', error: 'Product out of stock' }],
    });

    const result = await syncPendingSales({ tenantId: 't1', userId: 'u1' });

    expect(saleService.syncBatch).toHaveBeenCalledWith([
      { clientId: 'a', payload: expect.objectContaining({ clientId: 'a' }) },
      { clientId: 'b', payload: expect.objectContaining({ clientId: 'b' }) },
    ]);
    expect(result).toEqual({ synced: 1, failed: 1, remaining: 1 });
    expect(getPendingSales({ tenantId: 't1', userId: 'u1' })).toEqual([
      expect.objectContaining({ clientId: 'b', lastError: 'Product out of stock' }),
    ]);
    // Another person's saved sale on this device is left alone.
    expect(getPendingSales({ userId: 'someone-else' }).length).toBe(1);
  });

  it('keeps everything when the sync request fails', async () => {
    queueSale({ ...SALE, clientId: 'a' }, { tenantId: 't1', userId: 'u1' });
    saleService.syncBatch.mockRejectedValue(new Error('Network Error'));
    await expect(syncPendingSales({ tenantId: 't1', userId: 'u1' })).resolves.toEqual({
      synced: 0, failed: 0, remaining: 1, offline: true,
    });
    expect(getPendingSales().length).toBe(1);
  });

  it('discards one sale', () => {
    queueSale({ ...SALE, clientId: 'a' }, { tenantId: 't1', userId: 'u1' });
    queueSale({ ...SALE, clientId: 'b' }, { tenantId: 't1', userId: 'u1' });
    discardPendingSale('a');
    expect(getPendingSales().map((sale) => sale.clientId)).toEqual(['b']);
  });
});

describe('usePOS processSale', () => {
  const setOnline = (online) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);

  it('phones/tablets: saves the sale on the device when offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => usePOS());
    const outcome = await result.current.processSale(SALE, { total: 24 });
    expect(outcome).toMatchObject({ success: true, isQueued: true, sale: null });
    expect(saleService.createSale).not.toHaveBeenCalled();
    expect(getPendingSales({ tenantId: 't1', userId: 'u1' })).toEqual([
      expect.objectContaining({ clientId: outcome.localId, total: 24 }),
    ]);
  });

  it('sends a client id online, and reuses it if the connection drops mid-request', async () => {
    setOnline(true);
    saleService.createSale.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    const { result } = renderHook(() => usePOS());

    const outcome = await result.current.processSale(SALE);

    const sentClientId = saleService.createSale.mock.calls[0][0].clientId;
    expect(sentClientId).toMatch(/^web-/);
    expect(outcome).toMatchObject({ isQueued: true, localId: sentClientId });
    expect(getPendingSales()[0].payload.clientId).toBe(sentClientId);
  });

  it('does not hide errors the server answered with', async () => {
    setOnline(true);
    saleService.createSale.mockRejectedValueOnce(Object.assign(new Error('Insufficient stock'), { response: { status: 400 } }));
    const { result } = renderHook(() => usePOS());
    await expect(result.current.processSale(SALE)).rejects.toThrow('Insufficient stock');
    expect(getPendingSales().length).toBe(0);
  });

  it('mobile money prompts and desktop stay online-only', async () => {
    setOnline(false);
    const { result } = renderHook(() => usePOS());
    await expect(result.current.processSale(SALE, { allowOffline: false })).rejects.toThrow(/Internet connection required/);

    deviceMode.isAppShell = false;
    const { result: desktop } = renderHook(() => usePOS());
    await expect(desktop.current.processSale(SALE)).rejects.toThrow(/Internet connection required/);
    expect(getPendingSales().length).toBe(0);
  });
});
