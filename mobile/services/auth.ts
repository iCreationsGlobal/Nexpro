import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api, clearApiRequestContext, setApiAuthToken, setApiTenantContext } from './api';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/constants';
import { membershipTenantId, normalizeMemberships } from '@/utils/membership';
import {
  parseJsonStrippingOversizedInlineDataUrls,
  stripOversizedInlineDataUrlsFromJsonText,
} from '@/utils/stripOversizedInlineDataUrls';

const AUTH_STORAGE_KEYS = {
  token: 'token',
  user: 'user',
  memberships: 'tenantMemberships',
  activeTenant: STORAGE_KEYS.ACTIVE_TENANT_ID,
};

async function persistAuthPayload(payload: {
  user?: object;
  token?: string;
  memberships?: Array<{ tenantId?: string; isDefault?: boolean }>;
  defaultTenantId?: string | null;
}) {
  const { user, token, memberships = [], defaultTenantId } = payload;
  const normalizedMemberships = normalizeMemberships(memberships);

  if (token) {
    await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.token, token);
    setApiAuthToken(token);
  }
  if (user) {
    const raw = JSON.stringify(user);
    const cleaned = stripOversizedInlineDataUrlsFromJsonText(raw);
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.user, cleaned);
  }
  await AsyncStorage.setItem(AUTH_STORAGE_KEYS.memberships, JSON.stringify(normalizedMemberships));

  const preferredTenantId =
    defaultTenantId ||
    membershipTenantId(normalizedMemberships.find((m) => m.isDefault)) ||
    membershipTenantId(normalizedMemberships[0]) ||
    null;

  if (preferredTenantId) {
    await AsyncStorage.setItem(AUTH_STORAGE_KEYS.activeTenant, preferredTenantId);
    setApiTenantContext(preferredTenantId);
  } else {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.activeTenant);
    setApiTenantContext(null);
  }
}

async function clearAuthStorage() {
  await SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.token);
  await AsyncStorage.multiRemove([
    AUTH_STORAGE_KEYS.user,
    AUTH_STORAGE_KEYS.memberships,
    AUTH_STORAGE_KEYS.activeTenant,
  ]);
  clearApiRequestContext();
}

export const authService = {
  login: async (credentials: { email: string; password: string }) => {
    logger.info('Auth', 'Login attempt:', credentials.email);
    try {
      const response = await api.post('/auth/login', credentials);
      // Backend returns: { success: true, data: { user, token, memberships, defaultTenantId } }
      // Mobile API doesn't unwrap response.data, so we need response.data.data
      const payload = response?.data?.data ?? response?.data ?? response ?? {};
      const memberships = payload.memberships ?? payload.tenantMemberships ?? [];
      const defaultTenantId =
        payload.defaultTenantId ??
        memberships.find((m: { isDefault?: boolean }) => m.isDefault)?.tenantId ??
        memberships[0]?.tenantId ??
        null;
      
      logger.info('Auth', 'Login success:', {
        membershipsCount: memberships?.length ?? 0,
        defaultTenantId,
        hasUser: !!payload.user,
        hasToken: !!payload.token,
        membershipTenantIds: memberships?.map((m: { tenantId: string }) => m.tenantId) ?? [],
      });

      await persistAuthPayload({
        user: payload.user,
        token: payload.token,
        memberships,
        defaultTenantId,
      });
      return { ...response, data: payload };
    } catch (err) {
      logger.error('Auth', 'Login failed:', err);
      throw err;
    }
  },

  /**
   * Check if an email is already registered.
   * Returns a payload with an `exists` boolean (mirrors web authService).
   */
  checkEmailAvailability: async (email: string) => {
    logger.info('Auth', 'Checking email availability:', email);
    const response = await api.post('/auth/check-email', { email });
    const data = response?.data ?? response ?? {};
    return data;
  },

  getCurrentUser: async () => {
    logger.debug('Auth', 'Fetching current user');
    const res = await api.get('/auth/me');
    logger.info('Auth', 'Current user fetched');
    return res;
  },

  getBootstrap: async (tenantId?: string | null) => {
    logger.debug('Auth', 'Fetching auth bootstrap');
    const res = await api.get('/auth/bootstrap', {
      params: tenantId ? { tenantId } : undefined,
    });
    logger.info('Auth', 'Auth bootstrap fetched');
    return res;
  },

  resendVerification: async () => {
    await api.post('/auth/resend-verification');
  },

  updateNotificationPreferences: async (
    categories: Record<string, { in_app?: boolean; email?: boolean }>
  ) => {
    const res = await api.patch('/auth/notification-preferences', { categories });
    return res?.data ?? res;
  },

  forgotPassword: async (email: string) => {
    logger.info('Auth', 'Requesting password reset for:', email);
    await api.post('/auth/forgot-password', { email });
  },

  logout: async () => {
    logger.info('Auth', 'Logging out');
    await clearAuthStorage();
  },

  setActiveTenantId: async (tenantId: string | null) => {
    if (tenantId) await AsyncStorage.setItem(AUTH_STORAGE_KEYS.activeTenant, tenantId);
    else await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.activeTenant);
    setApiTenantContext(tenantId);
  },

  getStoredUser: async () => {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.user);
    if (!raw) return null;
    const cleaned = stripOversizedInlineDataUrlsFromJsonText(raw);
    if (cleaned !== raw) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEYS.user, cleaned);
    }
    try {
      return parseJsonStrippingOversizedInlineDataUrls(cleaned);
    } catch {
      return null;
    }
  },

  getStoredMemberships: async () => {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.memberships);
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  getActiveTenantId: async () => {
    return (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.activeTenant)) || null;
  },

  getToken: () => SecureStore.getItemAsync(STORAGE_KEYS.token),

  tenantSignup: async (payload: {
    companyName?: string;
    companyEmail: string;
    adminName: string;
    adminEmail: string;
    password: string;
    acceptedTerms?: boolean;
    termsVersion?: string;
  }) => {
    logger.info('Auth', 'Tenant signup attempt:', payload.adminEmail);
    // Plan is assigned by signup channel on the backend (mobile → free_plan).
    // Do not send planId from the client.
    const body = {
      companyName: payload.companyName ?? 'My Business',
      companyEmail: payload.companyEmail,
      adminName: payload.adminName,
      adminEmail: payload.adminEmail,
      password: payload.password,
      client: 'mobile',
      ...(payload.acceptedTerms !== undefined && { acceptedTerms: payload.acceptedTerms }),
      ...(payload.termsVersion && { termsVersion: payload.termsVersion }),
    };
    const response = await api.post('/tenants/signup', body);
    const data = response?.data?.data ?? response?.data ?? response ?? {};
    const memberships = data.memberships ?? data.tenantMemberships ?? [];
    const defaultTenantId =
      data.defaultTenantId ??
      memberships.find((m: { isDefault?: boolean }) => m.isDefault)?.tenantId ??
      memberships[0]?.tenantId ??
      null;
    await persistAuthPayload({
      user: data.user,
      token: data.token,
      memberships,
      defaultTenantId,
    });
    return { ...response, data: { ...data, memberships, defaultTenantId } };
  },

  googleAuth: async (
    idToken: string,
    options: { signUp?: boolean; companyName?: string; acceptedTerms?: boolean; termsVersion?: string } = {},
  ) => {
    const { signUp = false, companyName, acceptedTerms, termsVersion } = options;
    logger.info('Auth', 'Google auth:', signUp ? 'signUp' : 'signIn');
    const response = await api.post('/auth/google', {
      idToken,
      signUp,
      client: 'mobile',
      ...(companyName && { companyName }),
      ...(acceptedTerms !== undefined && { acceptedTerms }),
      ...(termsVersion && { termsVersion }),
    });
    const data = response?.data?.data ?? response?.data ?? response ?? {};
    const memberships = data.memberships ?? data.tenantMemberships ?? [];
    const defaultTenantId =
      data.defaultTenantId ??
      memberships.find((m: { isDefault?: boolean }) => m.isDefault)?.tenantId ??
      memberships[0]?.tenantId ??
      null;
    await persistAuthPayload({
      user: data.user,
      token: data.token,
      memberships,
      defaultTenantId,
    });
    return { ...response, data: { ...data, memberships, defaultTenantId } };
  },

  persistAuthPayload,
};
