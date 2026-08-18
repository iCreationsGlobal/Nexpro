import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '@/constants';
import { API_BASE_URL } from '@/utils/apiBaseUrl';
export { API_BASE_URL };

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
  count?: number;
  pagination?: { page: number; limit: number; totalPages: number };
};

type ApiClient = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

const axiosInstance: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 30000,
});

let cachedToken: string | null | undefined;
let sessionExpiredHandler: ((detail: { message: string }) => void | Promise<void>) | null = null;

export const setApiAuthToken = (token: string | null) => {
  cachedToken = token;
};

export const setSessionExpiredHandler = (
  handler: ((detail: { message: string }) => void | Promise<void>) | null
) => {
  sessionExpiredHandler = handler;
};

export const getApiAuthToken = async () => {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(STORAGE_KEYS.token);
  return cachedToken;
};

const isPublicAuthPath = (url?: string) =>
  Boolean(
    url?.includes('/public/storefront/auth/login') ||
      url?.includes('/public/storefront/auth/register') ||
      url?.includes('/public/storefront/auth/google') ||
      url?.includes('/public/storefront/auth/send-login-otp') ||
      url?.includes('/public/storefront/auth/verify-login-otp') ||
      url?.includes('/public/storefront/auth/verify-email') ||
      url?.includes('/public/storefront/auth/resend-verification') ||
      url?.includes('/public/storefront/auth/forgot-password') ||
      url?.includes('/public/storefront/auth/reset-password') ||
      url?.includes('/public/marketplace/') ||
      url?.includes('/public/store/') ||
      url?.includes('/public/storefront/orders/track') ||
      url?.includes('/public/storefront/reviews/') ||
      url?.includes('/public/storefront/service-requests') ||
      url?.includes('/auth/config'),
  );

axiosInstance.interceptors.request.use(async (config) => {
  const token = await getApiAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !isPublicAuthPath(url)) {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
      setApiAuthToken(null);
      await sessionExpiredHandler?.({
        message: 'Your shopper session expired. Sign in again to continue.',
      });
    }
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Request failed';
    return Promise.reject({
      ...error,
      message,
      status,
      errorCode: error.response?.data?.errorCode || error.response?.data?.code,
      code: error.response?.data?.code,
    });
  },
);

const api = axiosInstance as unknown as ApiClient;

export default api;
