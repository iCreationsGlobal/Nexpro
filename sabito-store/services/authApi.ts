import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import api, { ApiResponse, setApiAuthToken } from '@/services/api';
import { STORAGE_KEYS } from '@/constants';

export type StorefrontCustomer = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type AuthPayload = { token?: string; customer?: StorefrontCustomer };

const persistAuth = async ({ token, customer }: AuthPayload) => {
  if (token) {
    await SecureStore.setItemAsync(STORAGE_KEYS.token, token);
    setApiAuthToken(token);
  }
  if (customer) {
    await AsyncStorage.setItem(STORAGE_KEYS.customer, JSON.stringify(customer));
  }
};

export const clearAuthStorage = async () => {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
  await AsyncStorage.removeItem(STORAGE_KEYS.customer);
  setApiAuthToken(null);
};

export const getStoredCustomer = async (): Promise<StorefrontCustomer | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.customer);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const authApi = {
  register: async (payload: { name: string; email: string; phone: string; password: string }) => {
    const res = await api.post<ApiResponse<AuthPayload>>('/public/storefront/auth/register', payload);
    if (res?.data?.token) await persistAuth(res.data as AuthPayload);
    return res;
  },

  login: async (payload: { email: string; password: string }) => {
    const res = await api.post<ApiResponse<AuthPayload>>('/public/storefront/auth/login', payload);
    if (res?.data?.token) await persistAuth(res.data as AuthPayload);
    return res;
  },

  googleAuth: async (idToken: string, signUp = false) => {
    const res = await api.post<ApiResponse<AuthPayload>>('/public/storefront/auth/google', { idToken, signUp });
    if (res?.data?.token) await persistAuth(res.data as AuthPayload);
    return res;
  },

  sendLoginOtp: (email: string) =>
    api.post<ApiResponse<unknown>>('/public/storefront/auth/send-login-otp', { email }),

  verifyLoginOtp: async (payload: { email: string; code: string }) => {
    const res = await api.post<ApiResponse<AuthPayload>>('/public/storefront/auth/verify-login-otp', payload);
    if (res?.data?.token) await persistAuth(res.data as AuthPayload);
    return res;
  },

  verifyEmail: async (payload: { email: string; code: string }) => {
    const res = await api.post<ApiResponse<AuthPayload>>('/public/storefront/auth/verify-email', payload);
    if (res?.data?.token) await persistAuth(res.data as AuthPayload);
    return res;
  },

  resendVerification: (email: string) =>
    api.post<ApiResponse<unknown>>('/public/storefront/auth/resend-verification', { email }),

  forgotPassword: (email: string) =>
    api.post<ApiResponse<unknown>>('/public/storefront/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<ApiResponse<unknown>>('/public/storefront/auth/reset-password', { token, newPassword }),

  getMe: async () => {
    const res = await api.get<ApiResponse<{ customer: StorefrontCustomer }>>('/public/storefront/auth/me');
    if (res?.data?.customer) {
      await AsyncStorage.setItem(STORAGE_KEYS.customer, JSON.stringify(res.data.customer));
    }
    return res;
  },

  updateProfile: async (payload: { name?: string; phone?: string }) => {
    const res = await api.patch<ApiResponse<{ customer: StorefrontCustomer }>>('/public/storefront/auth/profile', payload);
    if (res?.data?.customer) {
      await AsyncStorage.setItem(STORAGE_KEYS.customer, JSON.stringify(res.data.customer));
    }
    return res;
  },

  logout: clearAuthStorage,
};
