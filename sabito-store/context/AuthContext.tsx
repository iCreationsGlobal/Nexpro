import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { STORAGE_KEYS } from '@/constants';
import { authApi, getStoredCustomer, type StorefrontCustomer } from '@/services/authApi';
import { getApiAuthToken, setApiAuthToken, setSessionExpiredHandler } from '@/services/api';
import { getCurrentNetworkOnline } from '@/utils/connectivity';
import {
  buyerQueryKeys,
  refreshAfterBuyerAuthChange,
  refreshAfterProfileChange,
} from '@/utils/queryInvalidation';

type AuthContextValue = {
  customer: StorefrontCustomer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  googleAuth: (idToken: string, signUp?: boolean) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateProfile: (payload: { name?: string; phone?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<StorefrontCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionExpiredHandledRef = useRef(false);

  const refreshSession = useCallback(async () => {
    const token = await getApiAuthToken();
    if (!token) {
      setCustomer(null);
      return;
    }
    if (!(await getCurrentNetworkOnline())) {
      setCustomer(await getStoredCustomer());
      return;
    }
    try {
      const res = await authApi.getMe();
      const nextCustomer = res?.data?.customer || (await getStoredCustomer());
      setCustomer(nextCustomer);
      queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
    } catch {
      setCustomer(await getStoredCustomer());
    }
  }, [queryClient]);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
      setApiAuthToken(token);
      const stored = await getStoredCustomer();
      setCustomer(stored);
      if (token) {
        try {
          await refreshSession();
        } catch {
          /* keep stored customer */
        }
      }
      setIsLoading(false);
    })();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    const nextCustomer = res?.data?.customer || null;
    setCustomer(nextCustomer);
    sessionExpiredHandledRef.current = false;
    await AsyncStorage.removeItem(STORAGE_KEYS.authSessionMessage);
    queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
    await refreshAfterBuyerAuthChange(queryClient);
  }, [queryClient]);

  const register = useCallback(
    async (payload: { name: string; email: string; phone: string; password: string }) => {
      const res = await authApi.register(payload);
      const nextCustomer = res?.data?.customer || null;
      setCustomer(nextCustomer);
      sessionExpiredHandledRef.current = false;
      await AsyncStorage.removeItem(STORAGE_KEYS.authSessionMessage);
      queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
      await refreshAfterBuyerAuthChange(queryClient);
    },
    [queryClient],
  );

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const res = await authApi.verifyLoginOtp({ email, code });
    const nextCustomer = res?.data?.customer || null;
    setCustomer(nextCustomer);
    sessionExpiredHandledRef.current = false;
    await AsyncStorage.removeItem(STORAGE_KEYS.authSessionMessage);
    queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
    await refreshAfterBuyerAuthChange(queryClient);
  }, [queryClient]);

  const googleAuth = useCallback(async (idToken: string, signUp = false) => {
    const res = await authApi.googleAuth(idToken, signUp);
    const nextCustomer = res?.data?.customer || null;
    setCustomer(nextCustomer);
    sessionExpiredHandledRef.current = false;
    await AsyncStorage.removeItem(STORAGE_KEYS.authSessionMessage);
    queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
    await refreshAfterBuyerAuthChange(queryClient);
  }, [queryClient]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCustomer(null);
    queryClient.removeQueries({ queryKey: buyerQueryKeys.addresses });
    queryClient.removeQueries({ queryKey: buyerQueryKeys.orders });
    queryClient.removeQueries({ queryKey: buyerQueryKeys.serviceBookings });
    queryClient.removeQueries({ queryKey: buyerQueryKeys.wishlist });
    queryClient.removeQueries({ queryKey: buyerQueryKeys.notificationPrefs });
    queryClient.removeQueries({ queryKey: buyerQueryKeys.disputes });
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(async ({ message }) => {
      if (sessionExpiredHandledRef.current) return;
      sessionExpiredHandledRef.current = true;
      await AsyncStorage.setItem(STORAGE_KEYS.authSessionMessage, message || 'Your shopper session expired. Sign in again to continue.');
      await authApi.logout();
      setCustomer(null);
      queryClient.removeQueries({ queryKey: buyerQueryKeys.addresses });
      queryClient.removeQueries({ queryKey: buyerQueryKeys.orders });
      queryClient.removeQueries({ queryKey: buyerQueryKeys.serviceBookings });
      queryClient.removeQueries({ queryKey: buyerQueryKeys.wishlist });
      queryClient.removeQueries({ queryKey: buyerQueryKeys.notificationPrefs });
      queryClient.removeQueries({ queryKey: buyerQueryKeys.disputes });
      router.replace('/login');
    });

    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  const updateProfile = useCallback(async (payload: { name?: string; phone?: string }) => {
    const res = await authApi.updateProfile(payload);
    const nextCustomer = res?.data?.customer || null;
    setCustomer(nextCustomer);
    queryClient.setQueryData(buyerQueryKeys.profile, nextCustomer);
    await refreshAfterProfileChange(queryClient);
  }, [queryClient]);

  const value = useMemo(
    () => ({
      customer,
      isAuthenticated: Boolean(customer),
      isLoading,
      login,
      register,
      googleAuth,
      verifyOtp,
      logout,
      refreshSession,
      updateProfile,
    }),
    [customer, isLoading, login, register, googleAuth, verifyOtp, logout, refreshSession, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
