/**
 * Cached API Client Wrapper
 * Provides caching layer on top of apiClient
 * Automatically caches GET requests and returns cached data when available
 */

import apiClient from './apiClient';
import requestCache, { CACHE_DURATION } from './requestCache';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

interface CachedResponse<T = any> extends AxiosResponse<T> {
  __fromCache?: boolean;
}

/**
 * Determine cache duration based on endpoint
 */
const getCacheDuration = (url: string): number => {
  if (url.includes('/api/users/') || url.includes('/api/business/')) {
    return CACHE_DURATION.LONG;
  }
  
  if (url.includes('/dashboard') || url.includes('/stats')) {
    return CACHE_DURATION.SHORT;
  }
  
  if (url.includes('/api/chat') || url.includes('/api/messages')) {
    return CACHE_DURATION.SHORT;
  }

  return CACHE_DURATION.MEDIUM;
};

/**
 * Cached GET request
 */
export const cachedGet = async <T = any>(
  url: string, 
  config: AxiosRequestConfig = {}
): Promise<CachedResponse<T>> => {
  const params = config.params || {};
  const cacheDuration = getCacheDuration(url);
  
  // Check cache first
  if (!config.headers?.['X-No-Cache']) {
    const cachedData = requestCache.get<T>(url, params, cacheDuration);
    if (cachedData) {
      // Return cached data as if it came from API
      return {
        data: cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { ...config, url },
        __fromCache: true,
      } as CachedResponse<T>;
    }
  }

  // Make actual request
  try {
    const response = await apiClient.get(url, config) as AxiosResponse<T>;
    
    // Cache successful responses
    if (response.status === 200 && !config.headers?.['X-No-Cache']) {
      requestCache.set(url, params, response.data, cacheDuration);
    }
    
    return response;
  } catch (error: any) {
    throw error;
  }
};

/**
 * Invalidate cache for a URL pattern
 */
export const invalidateCache = (urlPattern: string): void => {
  requestCache.invalidate(urlPattern);
};

/**
 * Clear all cache
 */
export const clearCache = (): void => {
  requestCache.clear();
};

// Export other methods directly (no caching for non-GET requests)
export const post = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.post<T>(url, data, config);
export const put = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.put<T>(url, data, config);
export const patch = <T = any>(url: string, data?: any, config?: AxiosRequestConfig) => apiClient.patch<T>(url, data, config);
export const deleteRequest = <T = any>(url: string, config?: AxiosRequestConfig) => apiClient.delete<T>(url, config);

export default {
  get: cachedGet,
  post,
  put,
  patch,
  delete: deleteRequest,
  invalidateCache,
  clearCache,
};

