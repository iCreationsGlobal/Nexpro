/**
 * API Client with Token Refresh Logic
 * Axios instance with automatic token refresh on 401 errors
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/env';
import requestCache, { CACHE_DURATION } from './requestCache';

// Extend AxiosRequestConfig to support custom properties
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  __cached?: boolean;
  __cachedData?: any;
  _retry?: boolean;
}

interface QueueItem {
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}

// Create axios instance with safe initialization
let apiClient: AxiosInstance;
try {
  apiClient = axios.create({
    baseURL: API_CONFIG.baseURL || 'https://api.sabito.app',
    timeout: 10000, // Reduced from 30s to 10s for faster error handling
    headers: {
      'Content-Type': 'application/json',
    },
  });
} catch (error: any) {
  console.error('❌ [apiClient] Failed to create axios instance:', error);
  // Fallback: create with default URL
  apiClient = axios.create({
    baseURL: 'https://api.sabito.app',
    timeout: 10000, // Reduced from 30s to 10s for faster error handling
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: QueueItem[] = [];

// Cache access token in memory to avoid AsyncStorage I/O on every request
let cachedAccessToken: string | null = null;
let tokenCacheInitialized = false;

// Request deduplication: Track pending requests to prevent duplicates
const pendingRequests = new Map<string, Promise<any>>();

/**
 * Generate a unique key for request deduplication
 */
const getRequestKey = (config: ExtendedAxiosRequestConfig): string => {
  const { method, url, params, data } = config;
  const paramsStr = params ? JSON.stringify(params) : '';
  const dataStr = data ? JSON.stringify(data) : '';
  return `${method}:${url}:${paramsStr}:${dataStr}`;
};

/**
 * Initialize token cache from AsyncStorage (called on app start)
 */
export const initializeTokenCache = async (): Promise<void> => {
  try {
    cachedAccessToken = await AsyncStorage.getItem('accessToken');
    tokenCacheInitialized = true;
  } catch (error: any) {
    console.error('❌ Failed to initialize token cache:', error);
    tokenCacheInitialized = true; // Mark as initialized even on error
  }
};

/**
 * Get cached token or fetch from AsyncStorage if cache not initialized
 */
const getAccessToken = async (): Promise<string | null> => {
  if (!tokenCacheInitialized) {
    await initializeTokenCache();
  }
  return cachedAccessToken;
};

/**
 * Update token cache (called after login/refresh)
 */
export const updateTokenCache = (token: string | null): void => {
  cachedAccessToken = token;
};

/**
 * Process queued requests after token refresh
 */
const processQueue = (error: any, token: string | null = null): void => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (): Promise<string> => {
  try {
    console.log('[Token Refresh] 🔄 Starting token refresh...');
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    
    if (!refreshToken) {
      console.error('❌ [Token Refresh] No refresh token available in storage');
      console.error('❌ [Token Refresh] User needs to login again');
      // Clear any stale tokens
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
      cachedAccessToken = null;
      throw new Error('No refresh token available. Please login again.');
    }

    // Log refresh token info for debugging
    try {
      const tokenParts = refreshToken.split('.');
      if (tokenParts.length === 3) {
        let base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const payload = JSON.parse(atob(base64));
        if (payload.exp) {
          const expirationTime = new Date(payload.exp * 1000);
          const timeUntilExpiry = Math.round((payload.exp * 1000 - Date.now()) / 1000 / 60);
          console.log('[Token Refresh] Refresh token info:', {
            expiresAt: expirationTime.toISOString(),
            expiresInMinutes: timeUntilExpiry,
            isExpired: timeUntilExpiry < 0,
          });
        }
      }
    } catch (e) {
      // Ignore decode errors
    }

    const response = await axios.post<{ accessToken: string; refreshToken?: string }>(
      `${API_CONFIG.baseURL}/api/users/refresh-token`, 
      { token: refreshToken } // Backend expects 'token' not 'refreshToken'
    );

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

    // Log new access token info
    try {
      const tokenParts = newAccessToken.split('.');
      if (tokenParts.length === 3) {
        let base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const payload = JSON.parse(atob(base64));
        if (payload.exp) {
          const expirationTime = new Date(payload.exp * 1000);
          const timeUntilExpiry = Math.round((payload.exp * 1000 - Date.now()) / 1000 / 60);
          console.log('[Token Refresh] ✅ New access token:', {
            expiresAt: expirationTime.toISOString(),
            expiresInMinutes: timeUntilExpiry,
            userId: payload.userID,
          });
        }
      }
    } catch (e) {
      // Ignore decode errors
    }

    // Save new tokens
    await AsyncStorage.setItem('accessToken', newAccessToken);
    if (newRefreshToken) {
      await AsyncStorage.setItem('refreshToken', newRefreshToken);
    }

    // Update cache
    updateTokenCache(newAccessToken);

    console.log('✅ [Token Refresh] Access token refreshed successfully');
    return newAccessToken;
  } catch (error: any) {
    console.error('❌ [Token Refresh] Token refresh failed:', {
      message: error?.message,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      code: error?.response?.data?.code,
    });
    
    // Clear tokens and cache, redirect to login
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
    cachedAccessToken = null;
    
    throw error;
  }
};

/**
 * Request interceptor - Add auth token and handle deduplication
 * Uses cached token to avoid AsyncStorage I/O on every request
 */
apiClient.interceptors.request.use(
  async (config: ExtendedAxiosRequestConfig): Promise<ExtendedAxiosRequestConfig> => {
    const accessToken = await getAccessToken();
    
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
      
      // Log token expiration info for debugging
      try {
        // Simple decode without verification to check expiration
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          // Decode base64 in React Native (add padding if needed)
          let base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) {
            base64 += '=';
          }
          const payload = JSON.parse(atob(base64));
          if (payload.exp) {
            const expirationTime = payload.exp * 1000;
            const currentTime = Date.now();
            const timeUntilExpiry = Math.round((expirationTime - currentTime) / 1000 / 60); // minutes
            if (timeUntilExpiry < 5) {
              console.warn(`[API Client] ⚠️ Token expiring soon: ${timeUntilExpiry} minutes remaining`);
            }
          }
        }
      } catch (e) {
        // Ignore decode errors
      }
    } else {
      console.warn('[API Client] ⚠️ No access token available for request:', config.url);
    }

    // Note: Cache checking happens in a wrapper function, not in interceptor
    // This is because axios interceptors can't return cached responses directly

    // Request deduplication: Check if same request is already pending
    const requestKey = getRequestKey(config);
    if (pendingRequests.has(requestKey)) {
      // Return the existing promise instead of making a new request
      return pendingRequests.get(requestKey)!.then(() => {
        // Create a new config for this specific request
        return config;
      }).catch(() => {
        // Remove from pending on error
        pendingRequests.delete(requestKey);
        return config;
      });
    }

    // Mark request as pending
    const requestPromise = Promise.resolve(config);
    pendingRequests.set(requestKey, requestPromise);

    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle token refresh on 401, cache responses, and cleanup pending requests
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    const config = response.config as ExtendedAxiosRequestConfig;
    
    // Handle cached responses
    if (config.__cached && config.__cachedData) {
      // Return cached data as if it came from the network
      return {
        ...response,
        data: config.__cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: response.config,
      } as AxiosResponse & { __fromCache?: boolean };
    }

    // Remove from pending requests on success
    const requestKey = getRequestKey(config);
    pendingRequests.delete(requestKey);

    // Cache GET requests (only cache successful responses)
    if (config.method === 'get' && response.status === 200 && !config.__cached) {
      const url = config.url || '';
      const params = config.params || {};
      
      // Determine cache duration based on endpoint
      let cacheDuration = CACHE_DURATION.MEDIUM;
      
      // Cache user profile and business data longer
      if (url.includes('/api/users/') || url.includes('/api/business/')) {
        cacheDuration = CACHE_DURATION.LONG;
      }
      
      // Cache dashboard stats shorter (they change frequently)
      if (url.includes('/dashboard') || url.includes('/stats')) {
        cacheDuration = CACHE_DURATION.SHORT;
      }
      
      // Cache chat lists and messages shorter
      if (url.includes('/api/chat') || url.includes('/api/messages')) {
        cacheDuration = CACHE_DURATION.SHORT;
      }

      // Don't cache if response indicates it shouldn't be cached
      if (!config.headers['X-No-Cache']) {
        requestCache.set(url, params, response.data, cacheDuration);
      }
    }

    return response;
  },
  async (error: any): Promise<AxiosResponse | any> => {
    const originalRequest = error.config as ExtendedAxiosRequestConfig;

    // Check if error is 401 (Unauthorized) and not a refresh token request
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/refresh-token')
    ) {
      // Log 401 error details
      console.warn('[API Client] ⚠️ Received 401 Unauthorized:', {
        url: originalRequest.url,
        method: originalRequest.method,
        errorCode: error.response?.data?.code,
        errorMessage: error.response?.data?.message,
        expiredAt: error.response?.data?.expiredAt,
      });
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token: string | null) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err: any) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        
        // Update authorization header
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        
        // Process queued requests
        processQueue(null, newAccessToken);
        
        isRefreshing = false;
        
        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        isRefreshing = false;
        
        // Clear tokens and user data
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
        cachedAccessToken = null;
        
        // Log detailed error
        console.error('❌ [Token Refresh] Failed to refresh token:', {
          message: refreshError?.message,
          status: refreshError?.response?.status,
          statusText: refreshError?.response?.statusText,
          data: refreshError?.response?.data,
        });
        
        // Redirect to login screen
        // Note: Navigation should be handled at app level
        console.error('⚠️ Session expired or invalid. Please login again.');
        
        return Promise.reject(refreshError);
      }
    }

    // Remove from pending requests on error
    const requestKey = error.config ? getRequestKey(error.config) : null;
    if (requestKey) {
      pendingRequests.delete(requestKey);
    }

    // Handle cached responses (from request interceptor)
    if (error.config?.__cached && error.config?.__cachedData) {
      return {
        data: error.config.__cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: error.config,
        __fromCache: true,
      };
    }

    return Promise.reject(error);
  }
);

export default apiClient;





