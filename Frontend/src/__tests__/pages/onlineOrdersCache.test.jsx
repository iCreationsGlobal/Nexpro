import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { patchCachedOnlineOrders } from '../../pages/OnlineOrders';

/** Status changes on Online Orders are written straight into the list caches (optimistic update). */
const order = (id, fulfillmentStatus = 'pending') => ({ id, orderNumber: `ORD-${id}`, fulfillmentStatus });
const markProcessing = (current) => ({ ...current, fulfillmentStatus: 'processing' });
const listResponse = (orders) => ({ success: true, count: 45, pagination: { page: 1, limit: 20 }, data: orders });

describe('patchCachedOnlineOrders', () => {
  it('desktop: patches the order in a single page response', () => {
    const cached = listResponse([order('a'), order('b')]);
    const next = patchCachedOnlineOrders(cached, 'b', markProcessing);
    expect(next).not.toBe(cached);
    expect(next.count).toBe(45);
    expect(next.data.map((row) => row.fulfillmentStatus)).toEqual(['pending', 'processing']);
  });

  it('phones/tablets: patches the order in whichever loaded page has it, keeping the infinite shape', () => {
    const page1 = listResponse([order('a'), order('b')]);
    const page2 = listResponse([order('c'), order('d')]);
    const cached = { pages: [page1, page2], pageParams: [1, 2] };

    const next = patchCachedOnlineOrders(cached, 'c', markProcessing);

    expect(next).not.toBe(cached);
    expect(next.pageParams).toEqual([1, 2]);
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]).toBe(page1);
    expect(next.pages[1].data.map((row) => row.fulfillmentStatus)).toEqual(['processing', 'pending']);
    expect(next.pages[1].count).toBe(45);
  });

  it('drops the order from a filtered list it no longer belongs to', () => {
    const cached = { pages: [listResponse([order('a'), order('b')])], pageParams: [1] };
    const next = patchCachedOnlineOrders(cached, 'a', markProcessing, (updated) => updated.fulfillmentStatus === 'pending');
    expect(next.pages[0].data.map((row) => row.id)).toEqual(['b']);
  });

  it('leaves caches without the order untouched', () => {
    const single = listResponse([order('a')]);
    const infinite = { pages: [listResponse([order('a')])], pageParams: [1] };
    expect(patchCachedOnlineOrders(single, 'zzz', markProcessing)).toBe(single);
    expect(patchCachedOnlineOrders(infinite, 'zzz', markProcessing)).toBe(infinite);
    expect(patchCachedOnlineOrders(undefined, 'a', markProcessing)).toBeUndefined();
  });

  it('works with setQueryData on both list keys and rolls back to the saved snapshot', () => {
    const client = new QueryClient();
    const params = { status: undefined, includeStats: false, commerceChannel: 'online_store' };
    const desktopKey = ['store', 'online-orders', { ...params, page: 1, limit: 10 }];
    const shellKey = ['store', 'online-orders', { ...params, limit: 20 }, 'infinite'];
    client.setQueryData(desktopKey, listResponse([order('a'), order('b')]));
    client.setQueryData(shellKey, { pages: [listResponse([order('a')]), listResponse([order('b')])], pageParams: [1, 2] });

    const previous = client.getQueriesData({ queryKey: ['store', 'online-orders'] });
    previous.forEach(([queryKey]) => {
      client.setQueryData(queryKey, (current) => patchCachedOnlineOrders(current, 'b', markProcessing));
    });

    expect(client.getQueryData(desktopKey).data[1].fulfillmentStatus).toBe('processing');
    const shell = client.getQueryData(shellKey);
    expect(shell.pageParams).toEqual([1, 2]);
    expect(shell.pages[1].data[0].fulfillmentStatus).toBe('processing');

    previous.forEach(([queryKey, data]) => client.setQueryData(queryKey, data));
    expect(client.getQueryData(desktopKey).data[1].fulfillmentStatus).toBe('pending');
    expect(client.getQueryData(shellKey).pages[1].data[0].fulfillmentStatus).toBe('pending');
  });
});
