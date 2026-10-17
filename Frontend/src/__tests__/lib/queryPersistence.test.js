import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPersistedQueryCache,
  createQueryPersister,
  MAX_SAVED_CACHE_CHARS,
  QUERY_CACHE_STORAGE_KEY,
  shouldPersistQuery,
} from '@/lib/queryPersistence';
import authService from '@/services/authService';

const query = (queryKey, status = 'success') => ({ queryKey, state: { status } });

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
  localStorage.clear.mockImplementation(() => store.clear());
});
afterEach(() => {
  localStorage.getItem.mockImplementation(() => null);
  localStorage.setItem.mockImplementation(() => {});
  localStorage.removeItem.mockImplementation(() => {});
  localStorage.clear.mockImplementation(() => {});
});

describe('shouldPersistQuery', () => {
  it('keeps successful business data', () => {
    expect(shouldPersistQuery(query(['customers', { page: 1 }]))).toBe(true);
    expect(shouldPersistQuery(query(['sales', 't1', 'list']))).toBe(true);
  });

  it('never keeps sign-in, profile, product, billing or tour data', () => {
    for (const key of [['auth', 'bootstrap', 't1'], ['profile'], ['products', 't1'], ['subscription', 'status', 't1'], ['tours', 'status']]) {
      expect(shouldPersistQuery(query(key))).toBe(false);
    }
  });

  it('skips failed or loading queries and keys without a name', () => {
    expect(shouldPersistQuery(query(['customers'], 'error'))).toBe(false);
    expect(shouldPersistQuery(query(['customers'], 'pending'))).toBe(false);
    expect(shouldPersistQuery(query([{ page: 1 }]))).toBe(false);
  });
});

describe('createQueryPersister', () => {
  it('drops the oldest queries so the saved cache stays under its cap', async () => {
    const persister = createQueryPersister();
    const bigData = 'x'.repeat(400_000);
    const queries = Array.from({ length: 8 }, (_, index) => ({
      queryKey: ['list', index],
      queryHash: `["list",${index}]`,
      state: { data: bigData, dataUpdatedAt: index + 1, status: 'success' },
    }));
    persister.persistClient({
      timestamp: Date.now(),
      buster: 'test',
      clientState: { mutations: [], queries },
    });
    // Saves are throttled by React Query's own timer (1 second).
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const saved = localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    expect(saved).toBeTruthy();
    expect(saved.length).toBeLessThanOrEqual(MAX_SAVED_CACHE_CHARS);
    const keptKeys = JSON.parse(saved).clientState.queries.map((q) => q.queryKey[1]);
    expect(keptKeys.length).toBeLessThan(queries.length);
    // The newest queries survive.
    expect(keptKeys).toContain(7);
  });
});

describe('clearing the saved cache', () => {
  it('clearPersistedQueryCache removes it', () => {
    localStorage.setItem(QUERY_CACHE_STORAGE_KEY, '{}');
    expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBe('{}');
    clearPersistedQueryCache();
    expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
  });

  it('every sign-out removes it with the session', () => {
    localStorage.setItem('token', 'abc');
    localStorage.setItem(QUERY_CACHE_STORAGE_KEY, '{}');
    expect(localStorage.getItem('token')).toBe('abc');
    authService.logout();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
  });
});
