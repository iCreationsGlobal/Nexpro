/**
 * Simple Request Cache Service
 * Provides caching for API requests to reduce network calls
 * Cache invalidation strategies: time-based, manual, and on data mutations
 */

export const CACHE_DURATION = {
  SHORT: 30000, // 30 seconds - for frequently changing data
  MEDIUM: 300000, // 5 minutes - for moderately changing data
  LONG: 1800000, // 30 minutes - for rarely changing data
  VERY_LONG: 3600000, // 1 hour - for static data
} as const;

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  duration: number;
}

class RequestCache {
  private cache: Map<string, CacheEntry>;
  private maxCacheSize: number;

  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 100; // Maximum number of cached items
  }

  /**
   * Generate cache key from request config
   */
  private getCacheKey(url: string, params: Record<string, any> = {}): string {
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${url}:${paramsStr}`;
  }

  /**
   * Get cached response if available and not expired
   */
  get<T = any>(url: string, params: Record<string, any> = {}, duration: number = CACHE_DURATION.MEDIUM): T | null {
    const key = this.getCacheKey(url, params);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    if (age > duration) {
      // Cache expired, remove it
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set cache entry
   */
  set<T = any>(url: string, params: Record<string, any> = {}, data: T, duration: number = CACHE_DURATION.MEDIUM): void {
    const key = this.getCacheKey(url, params);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration,
    });
  }

  /**
   * Invalidate cache for specific URL pattern
   */
  invalidate(urlPattern: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(urlPattern)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      if (age > value.duration) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance
const requestCache = new RequestCache();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    requestCache.clearExpired();
  }, 300000); // 5 minutes
}

export default requestCache;






