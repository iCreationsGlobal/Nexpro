import api from './api';

export const STOREFRONT_AUTH_TOKEN_KEY = 'sabito_storefront_token';
export const STOREFRONT_AUTH_CUSTOMER_KEY = 'sabito_storefront_customer';

const readStoredCustomer = () => {
  try {
    const raw = window.localStorage.getItem(STOREFRONT_AUTH_CUSTOMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistAuth = ({ token, customer }) => {
  if (token) window.localStorage.setItem(STOREFRONT_AUTH_TOKEN_KEY, token);
  if (customer) window.localStorage.setItem(STOREFRONT_AUTH_CUSTOMER_KEY, JSON.stringify(customer));
};

const clearAuth = () => {
  window.localStorage.removeItem(STOREFRONT_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(STOREFRONT_AUTH_CUSTOMER_KEY);
};

const getToken = () => window.localStorage.getItem(STOREFRONT_AUTH_TOKEN_KEY);

/** Keep the returned details only if the same shopper is still signed in: a late reply must not undo a sign-out. */
const keepCustomer = async (request) => {
  const token = getToken();
  const response = await request();
  const data = response?.data || response;
  if (data?.customer && getToken() === token) {
    window.localStorage.setItem(STOREFRONT_AUTH_CUSTOMER_KEY, JSON.stringify(data.customer));
  }
  return data;
};

const authService = {
  getToken,

  getStoredCustomer: readStoredCustomer,

  getPublicConfig: async () => {
    const response = await api.get('/auth/config');
    return response?.data || response;
  },

  register: async (payload) => {
    const response = await api.post('/public/storefront/auth/register', payload);
    const data = response?.data || response;
    if (data?.token) persistAuth(data);
    return data;
  },

  login: async (payload) => {
    const response = await api.post('/public/storefront/auth/login', payload);
    const data = response?.data || response;
    persistAuth(data);
    return data;
  },

  googleAuth: async (idToken, options = {}) => {
    const response = await api.post('/public/storefront/auth/google', {
      idToken,
      signUp: options.signUp === true,
    });
    const data = response?.data || response;
    persistAuth(data);
    return data;
  },

  requestPasswordReset: async (email, returnTo) => {
    const response = await api.post('/public/storefront/auth/forgot-password', { email, returnTo });
    return response?.data || response;
  },

  resetPassword: async (token, newPassword) => {
    const response = await api.post('/public/storefront/auth/reset-password', { token, newPassword });
    return response?.data || response;
  },

  sendLoginOtp: async (payload) => {
    const response = await api.post('/public/storefront/auth/send-login-otp', payload);
    return response?.data || response;
  },

  verifyLoginOtp: async (payload) => {
    const response = await api.post('/public/storefront/auth/verify-login-otp', payload);
    const data = response?.data || response;
    persistAuth(data);
    return data;
  },

  verifyEmail: async (payload) => {
    const response = await api.post('/public/storefront/auth/verify-email', payload);
    const data = response?.data || response;
    persistAuth(data);
    return data;
  },

  resendVerification: async (payload) => {
    const response = await api.post('/public/storefront/auth/resend-verification', payload);
    return response?.data || response;
  },

  getMe: () => keepCustomer(() => api.get('/public/storefront/auth/me')),

  updateProfile: (payload) => keepCustomer(() => api.patch('/public/storefront/auth/profile', payload)),

  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return keepCustomer(() => api.post('/public/storefront/auth/profile/avatar', formData));
  },

  removeAvatar: () => keepCustomer(() => api.delete('/public/storefront/auth/profile/avatar')),

  logout: () => {
    clearAuth();
  },
};

export default authService;
