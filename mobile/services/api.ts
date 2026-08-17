import axios, { CancelTokenSource, AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/constants';
import { parseJsonStrippingOversizedInlineDataUrls } from '@/utils/stripOversizedInlineDataUrls';

// Extend AxiosRequestConfig to support metadata
declare module 'axios' {
  export interface AxiosRequestConfig {
    metadata?: {
      requestId?: string;
    };
  }
}

/**
 * Normalize EXPO_PUBLIC_API_URL like Frontend normalizeEnvApiUrl:
 * trim, strip trailing slash, strip trailing /api (uploads live at /uploads, not /api/uploads).
 */
function normalizeApiBaseUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.trim().replace(/\/$/, '');
  url = url.replace(/\/api\/?$/i, '');
  return url;
}

const API_BASE_URL =
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL) ||
  normalizeApiBaseUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'https://api.africanbusinesssuite.com';

logger.info('API', 'Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    // Explicit client flag for signup-channel plan assignment (mobile → free_plan).
    // Prefer these headers over User-Agent sniffing on the backend.
    'X-Client': 'mobile',
    'X-App': 'abs-mobile',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
  timeout: 30000,
  // Parse JSON only after dropping multi-MB data:image payloads (device OOM on Profile/Products).
  transformResponse: [
    (data) => parseJsonStrippingOversizedInlineDataUrls(data),
  ],
});

let cachedToken: string | null | undefined;
let cachedTenantId: string | null | undefined;
let cachedStudioLocationId: string | null | undefined;
let cachedShopId: string | null | undefined;
let sessionExpiredHandler: ((detail: { message: string }) => void | Promise<void>) | null = null;

const getCachedToken = async () => {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(STORAGE_KEYS.token);
  return cachedToken;
};

const getCachedStorageValue = async (
  currentValue: string | null | undefined,
  key: string,
  setValue: (value: string | null) => void
) => {
  if (currentValue !== undefined) return currentValue;
  const value = await AsyncStorage.getItem(key);
  setValue(value);
  return value;
};

export const setApiAuthToken = (token: string | null) => {
  cachedToken = token;
};

export const setSessionExpiredHandler = (
  handler: ((detail: { message: string }) => void | Promise<void>) | null
) => {
  sessionExpiredHandler = handler;
};

export const setApiTenantContext = (tenantId: string | null) => {
  cachedTenantId = tenantId;
};

export const setApiStudioLocationContext = (studioLocationId: string | null) => {
  cachedStudioLocationId = studioLocationId;
};

export const setApiShopContext = (shopId: string | null) => {
  cachedShopId = shopId;
};

export const clearApiRequestContext = () => {
  cachedToken = null;
  cachedTenantId = null;
  cachedStudioLocationId = null;
  cachedShopId = null;
};

// Request cancellation map for canceling stale requests
const cancelTokenSources = new Map<string, CancelTokenSource>();

/**
 * Create a cancel token for a request
 * @param requestId - Unique identifier for the request
 * @returns Cancel token source
 */
export const createCancelToken = (requestId: string): CancelTokenSource => {
  // Cancel previous request with same ID if it exists
  const existingSource = cancelTokenSources.get(requestId);
  if (existingSource) {
    existingSource.cancel('Request superseded by new request');
  }

  // Create new cancel token source
  const source = axios.CancelToken.source();
  cancelTokenSources.set(requestId, source);

  // Clean up after request completes (with delay to allow cancellation)
  setTimeout(() => {
    cancelTokenSources.delete(requestId);
  }, 5000);

  return source;
};

const isPublicEndpoint = (url?: string) =>
  url?.includes('/auth/login') ||
  url?.includes('/auth/register') ||
  url?.includes('/auth/google') ||
  url?.includes('/auth/verify-email') ||
  url?.includes('/auth/config') ||
  url?.includes('/auth/sso') ||
  url?.includes('/tenants/signup') ||
  url?.includes('/invites/validate');

api.interceptors.request.use(
  async (config) => {
    logger.debug('API', `→ ${config.method?.toUpperCase()} ${config.url}`);

    const token = await getCachedToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (!isPublicEndpoint(config.url)) {
      const tenantId = await getCachedStorageValue(
        cachedTenantId,
        STORAGE_KEYS.ACTIVE_TENANT_ID,
        setApiTenantContext
      );
      if (tenantId) {
        config.headers['x-tenant-id'] = tenantId;
        const studioLocationId = await getCachedStorageValue(
          cachedStudioLocationId,
          STORAGE_KEYS.ACTIVE_STUDIO_LOCATION_ID,
          setApiStudioLocationContext
        );
        if (studioLocationId) {
          config.headers['x-studio-location-id'] = studioLocationId;
        } else {
          delete config.headers['x-studio-location-id'];
        }
        const shopId = await getCachedStorageValue(
          cachedShopId,
          STORAGE_KEYS.ACTIVE_SHOP_ID,
          setApiShopContext
        );
        const isShopAccessRequest = String(config.url || '').includes('/shops/access');
        if (shopId && !isShopAccessRequest) {
          config.headers['x-shop-id'] = shopId;
        } else {
          delete config.headers['x-shop-id'];
        }
      } else {
        logger.warn('API', 'No activeTenantId for tenant-scoped request:', config.url);
      }
    }

    // Add cancel token if requestId is provided in config metadata
    if (config.metadata?.requestId) {
      const cancelToken = createCancelToken(config.metadata.requestId);
      config.cancelToken = cancelToken.token;
    }

    return config;
  },
  (error) => {
    logger.error('API', 'Request error:', error?.message);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    logger.debug('API', `← ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    if (axios.isCancel(error)) {
      logger.debug('API', 'Request canceled:', error.message);
      return Promise.reject(error);
    }

    const url = error.config?.url?.replace(error.config.baseURL || '', '') || 'unknown';
    const status = error.response?.status;
    const msg = error.response?.data?.error || error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.errorCode || error.response?.data?.code;
    const isNetworkError =
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));
    const assistantProviderErrorCodes = [
      'OPENAI_NOT_CONFIGURED',
      'OPENAI_INVALID_KEY',
      'AI_PROVIDER_BILLING_REQUIRED',
      'AI_PROVIDER_UNAVAILABLE',
    ];
    const isExpectedAssistantConfigError =
      url === '/assistant/chat' &&
      [402, 503].includes(status || 0) &&
      assistantProviderErrorCodes.includes(errorCode);

    if (isNetworkError) {
      logger.warn('API', `← ${url}: ${error.message || 'unreachable'}. Check backend is running and EXPO_PUBLIC_API_URL.`);
    } else if (isExpectedAssistantConfigError) {
      logger.warn('API', `← ${status} ${url}:`, msg || error.message);
    } else {
      logger.error('API', `← ${status || 'ERR'} ${url}:`, msg || error.message);
    }

    if (status === 401) {
      logger.info('API', '401 Unauthorized - clearing token');
      await SecureStore.deleteItemAsync('token');
      setApiAuthToken(null);
      if (!isPublicEndpoint(error.config?.url)) {
        await sessionExpiredHandler?.({
          message: 'Your session expired. Sign in again to continue.',
        });
      }
    }

    return Promise.reject(error);
  }
);

export { api, API_BASE_URL };
