const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key) : null)),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
}));

jest.mock('@/services/saleService', () => ({
  saleService: { syncBatch: jest.fn(), createSale: jest.fn() },
}));

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/utils/connectivity', () => ({ getCurrentNetworkOnline: jest.fn() }));
jest.mock('@/utils/queryInvalidation', () => ({ refreshAfterSale: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn() }));

import { offlineQueueService } from '@/services/offlineQueueService';
import { saleService } from '@/services/saleService';
import { pendingSignOutMessage } from '@/hooks/useSignOut';

const syncBatch = saleService.syncBatch as jest.Mock;
const SALE = { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' };
const AMA = { tenantId: 'shop-a', userId: 'ama' };

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('offlineQueueService', () => {
  it('remembers which workspace and person took each sale', async () => {
    await offlineQueueService.queueSale({ ...SALE, clientId: 'one' }, AMA);
    await offlineQueueService.queueSale({ ...SALE, clientId: 'two' }, { tenantId: 'shop-b', userId: 'ama' });
    await offlineQueueService.queueSale({ ...SALE, clientId: 'three' }, { tenantId: 'shop-a', userId: 'kofi' });

    expect((await offlineQueueService.getPendingSales(AMA)).map((sale) => sale.clientId)).toEqual(['one']);
    expect(await offlineQueueService.getPendingCount({ userId: 'ama' })).toBe(2);
    expect(await offlineQueueService.getPendingCount()).toBe(3);
  });

  it("only sends this workspace's sales by this person, and keeps the rest", async () => {
    await offlineQueueService.queueSale({ ...SALE, clientId: 'one' }, AMA);
    await offlineQueueService.queueSale({ ...SALE, clientId: 'other-shop' }, { tenantId: 'shop-b', userId: 'ama' });
    await offlineQueueService.queueSale({ ...SALE, clientId: 'other-person' }, { tenantId: 'shop-a', userId: 'kofi' });
    syncBatch.mockResolvedValue({ success: true, results: [{ clientId: 'one', id: 'sale-1' }] });

    await expect(offlineQueueService.syncPendingSales(AMA)).resolves.toEqual({ synced: 1, failed: 0 });

    expect(syncBatch).toHaveBeenCalledWith([{ clientId: 'one', payload: expect.objectContaining({ clientId: 'one' }) }]);
    expect((await offlineQueueService.getPendingSales()).map((sale) => sale.clientId)).toEqual(['other-shop', 'other-person']);
  });

  it('keeps refused sales with the reason, and everything when offline', async () => {
    await offlineQueueService.queueSale({ ...SALE, clientId: 'ok' }, AMA);
    await offlineQueueService.queueSale({ ...SALE, clientId: 'bad' }, AMA);
    syncBatch.mockResolvedValueOnce({ results: [{ clientId: 'ok', id: 's1' }, { clientId: 'bad', error: 'Out of stock' }] });
    await expect(offlineQueueService.syncPendingSales(AMA)).resolves.toEqual({ synced: 1, failed: 1 });
    expect(await offlineQueueService.getPendingSales()).toEqual([expect.objectContaining({ clientId: 'bad', lastError: 'Out of stock' })]);

    syncBatch.mockRejectedValueOnce(new Error('Network Error'));
    await expect(offlineQueueService.syncPendingSales(AMA)).resolves.toEqual({ synced: 0, failed: 1 });
    expect(await offlineQueueService.getPendingCount()).toBe(1);
  });

  it('keeps a sale taken while a sync is running', async () => {
    await offlineQueueService.queueSale({ ...SALE, clientId: 'first' }, AMA);
    syncBatch.mockImplementation(async () => {
      await offlineQueueService.queueSale({ ...SALE, clientId: 'during' }, AMA);
      return { results: [{ clientId: 'first', id: 's1' }] };
    });
    await offlineQueueService.syncPendingSales(AMA);
    expect((await offlineQueueService.getPendingSales()).map((sale) => sale.clientId)).toEqual(['during']);
  });

  it('sales saved before owners were recorded go to the first signed-in session that syncs', async () => {
    mockStore.set('shopwise_pending_sales', JSON.stringify([
      { localId: 'old', clientId: 'old', payload: { ...SALE, clientId: 'old' }, createdAt: '2026-10-01T10:00:00Z' },
    ]));
    syncBatch.mockResolvedValue({ results: [{ clientId: 'old', id: 's1' }] });
    await expect(offlineQueueService.syncPendingSales(AMA)).resolves.toEqual({ synced: 1, failed: 0 });
    expect(await offlineQueueService.getPendingCount()).toBe(0);
  });
});

describe('pendingSignOutMessage', () => {
  it('says how many are waiting and where', () => {
    const here = { localId: 'a', clientId: 'a', payload: {}, createdAt: '', tenantId: 'shop-a', userId: 'ama' };
    const there = { ...here, localId: 'b', clientId: 'b', tenantId: 'shop-b' };

    expect(pendingSignOutMessage([here], 'shop-a').title).toBe("1 sale hasn't reached ABS yet");
    expect(pendingSignOutMessage([here], 'shop-a').message).toContain('Connect to the internet and stay signed in');
    const mixed = pendingSignOutMessage([here, there], 'shop-a');
    expect(mixed.title).toBe("2 sales haven't reached ABS yet");
    expect(mixed.message).toContain('1 belongs to another workspace — switch to it while online to send it.');
  });
});
