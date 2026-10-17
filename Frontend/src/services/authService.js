import api from './api';
import { clearPersistedQueryCache } from '../lib/queryPersistence';
import { forgetWebPushSubscriptionOnSignOut } from './webPushService';

/**
 * Tenant id from a membership row (API or localStorage). Handles camelCase, snake_case, or nested tenant only.
 * @param {object|null|undefined} m
 * @returns {string|null}
 */
const membershipTenantId = (m) => {
  if (!m || typeof m !== 'object') return null;
  const direct = m.tenantId ?? m.tenant_id;
  if (direct != null && direct !== '') return String(direct);
  const nested = m.tenant;
  if (nested && typeof nested === 'object') {
    const tid = nested.id ?? nested.tenantId ?? nested.tenant_id;
    if (tid != null && tid !== '') return String(tid);
  }
  return null;
};

const STORAGE_KEYS = {
  token: 'token',
  user: 'user',
  memberships: 'tenantMemberships',
  activeTenant: 'activeTenantId',
};

/**
 * Persists session. Prefer payloads from GET /auth/bootstrap or /auth/me so each
 * membership.tenant includes effectiveFeatureFlags (computed from DB plan + overrides).
 * Login/register bodies alone may omit flags.
 */
const persistAuthPayload = (payload = {}) => {
  const { user, token, memberships = [], defaultTenantId } = payload;

  if (token) {
    localStorage.setItem(STORAGE_KEYS.token, token);
  }

  if (user) {
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  }

  localStorage.setItem(STORAGE_KEYS.memberships, JSON.stringify(memberships));

  const preferredTenantId =
    defaultTenantId ||
    membershipTenantId(memberships.find((membership) => membership.isDefault)) ||
    membershipTenantId(memberships[0]) ||
    null;

  if (preferredTenantId) {
    localStorage.setItem(STORAGE_KEYS.activeTenant, preferredTenantId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activeTenant);
  }
};

const clearAuthStorage = () => {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  // Business data saved for offline launches belongs to this session only.
  clearPersistedQueryCache();
  // So the next person on this device does not get this account's notifications.
  forgetWebPushSubscriptionOnSignOut();
};

const setActiveTenantId = (tenantId) => {
  if (tenantId) {
    localStorage.setItem(STORAGE_KEYS.activeTenant, tenantId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activeTenant);
  }
};

const getStoredMemberships = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.memberships);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Failed to parse stored memberships', error);
    return [];
  }
};

const getActiveTenantId = () => localStorage.getItem(STORAGE_KEYS.activeTenant) || null;

const authService = {
  // Login
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    const payload = response?.data || response || {};
    persistAuthPayload(payload);
    return { ...response, data: payload };
  },

  // Register
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    const payload = response?.data || response || {};
    persistAuthPayload(payload);
    return { ...response, data: payload };
  },

  /**
   * Check if an email is already registered.
   * Returns { success, data: { exists: boolean } }
   */
  checkEmailAvailability: async (email) => {
    const response = await api.post('/auth/check-email', { email });
    return response?.data || response || {};
  },

  // Get current user
  getCurrentUser: async () => {
    return await api.get('/auth/me');
  },

  // Get post-login bootstrap payload (user, memberships, settings, and workspace access)
  getBootstrap: async (tenantId) => {
    const params = tenantId ? { tenantId } : undefined;
    return await api.get('/auth/bootstrap', { params });
  },

  // Update user details
  updateDetails: async (userData) => {
    return await api.put('/auth/updatedetails', userData);
  },

  /**
   * Staff notification preferences (in-app bell + optional email to account address).
   * @param {Record<string, { in_app?: boolean, email?: boolean }>} categories
   */
  updateNotificationPreferences: async (categories) => {
    const response = await api.patch('/auth/notification-preferences', { categories });
    return response?.data || response || {};
  },

  // Update password
  updatePassword: async (passwordData) => {
    return await api.put('/auth/updatepassword', passwordData);
  },

  // Set initial password (admin-created users; no current password when isFirstLogin)
  setInitialPassword: async (newPassword) => {
    return await api.put('/auth/set-initial-password', { newPassword });
  },

  // Forgot password (request reset email)
  requestPasswordReset: async (email) => {
    return await api.post('/auth/forgot-password', { email });
  },

  // Reset password with token (from email link)
  resetPassword: async (token, newPassword) => {
    return await api.post('/auth/reset-password', { token, newPassword });
  },

  // Verify email via token (from link in email)
  verifyEmail: async (token) => {
    return await api.get('/auth/verify-email', { params: { token } });
  },

  // Resend verification email (requires auth)
  resendVerification: async () => {
    return await api.post('/auth/resend-verification');
  },

  // Logout
  logout: () => {
    clearAuthStorage();
  },

  // Tenant onboarding
  tenantSignup: async (payload) => {
    const response = await api.post('/tenants/signup', payload);
    const data = response?.data || response || {};
    persistAuthPayload(data);
    return { ...response, data };
  },

  // Sabito SSO
  sabitoSSO: async (sabitoToken) => {
    const response = await api.post('/auth/sso/sabito', { sabitoToken });
    const payload = response?.data || response || {};
    persistAuthPayload(payload);
    return { ...response, data: payload };
  },

  /**
   * Google OAuth sign-in or sign-up.
   * @param {string} idToken - Google ID token from credentialResponse.credential
   * @param {Object} options - Optional: { signUp: boolean, companyName: string, acceptedTerms: boolean, termsVersion: string }
   * @returns {Promise<{ data }>} - Same shape as login (user, token, memberships, defaultTenantId)
   */
  googleAuth: async (idToken, options = {}) => {
    const { signUp = false, companyName, acceptedTerms, termsVersion, agentCode } = options;
    const response = await api.post('/auth/google', {
      idToken,
      signUp,
      ...(companyName && { companyName }),
      ...(acceptedTerms !== undefined && { acceptedTerms }),
      ...(termsVersion && { termsVersion }),
      ...(agentCode && { agentCode }),
    });
    const payload = response?.data || response || {};
    persistAuthPayload(payload);
    return { ...response, data: payload };
  },

  persistAuthPayload,
  membershipTenantId,
  clearAuthStorage,
  setActiveTenantId,
  getStoredUser: () => {
    const user = localStorage.getItem(STORAGE_KEYS.user);
    return user ? JSON.parse(user) : null;
  },
  getStoredMemberships,
  getActiveTenantId,
  getToken: () => localStorage.getItem(STORAGE_KEYS.token),
};

export default authService;


