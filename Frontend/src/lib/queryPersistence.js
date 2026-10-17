import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { removeOldestQuery } from '@tanstack/react-query-persist-client';

/**
 * Phones and tablets keep fetched data between launches (like the native app's AsyncStorage
 * cache), so the installed app opens straight to the last lists while fresh data loads.
 * Cleared on every sign-out (authService.clearAuthStorage) and at startup without a session.
 */
export const QUERY_CACHE_STORAGE_KEY = 'abs-query-cache';
export const PERSISTED_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
/** Bump to drop every saved cache (e.g. after changing the shape of cached responses). */
export const PERSISTED_CACHE_BUSTER = 'abs-web-rq-v1';

/** Never saved: sign-in state, profile images, product payloads (large images), billing state. */
const NEVER_PERSIST = /(^|:)(auth|login|register|profile|products|subscription|tours)(:|$)/i;

/**
 * @param {import('@tanstack/react-query').Query} query
 * @returns {boolean}
 */
export function shouldPersistQuery(query) {
  if (query.state.status !== 'success') return false;
  const keyParts = Array.isArray(query.queryKey) ? query.queryKey : [];
  const keyText = keyParts
    .filter((part) => typeof part === 'string' || typeof part === 'number')
    .join(':');
  if (!keyText) return false;
  return !NEVER_PERSIST.test(keyText);
}

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/**
 * Saved cache size cap (characters ≈ 2 bytes each). localStorage is ~5 MB per site and also holds
 * the sign-in token and preferences, so the cache must never fill it.
 */
export const MAX_SAVED_CACHE_CHARS = 1_500_000;

/** @returns {import('@tanstack/react-query-persist-client').Persister|null} */
export function createQueryPersister() {
  const storage = getStorage();
  if (!storage) return null;
  const cappedStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (key === QUERY_CACHE_STORAGE_KEY && value.length > MAX_SAVED_CACHE_CHARS) {
        // Treated like a full disk: the persister drops the oldest queries and tries again.
        throw new Error('Saved query cache is over its size cap');
      }
      storage.setItem(key, value);
    },
    removeItem: (key) => storage.removeItem(key),
  };
  return createSyncStoragePersister({
    storage: cappedStorage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: 1000,
    // Storage full or over the cap: drop the oldest queries until it fits.
    retry: removeOldestQuery,
  });
}

export function clearPersistedQueryCache() {
  try {
    getStorage()?.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing was saved.
  }
}
