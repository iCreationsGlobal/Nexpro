import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useQueryClient } from '@tanstack/react-query';

import authService from '../services/authService';
import {
  refreshAfterProfileChange,
  refreshAfterShopperAuthChange,
  SHOPPER_QUERY_KEYS,
} from '../utils/queryInvalidation';

const StorefrontAuthContext = createContext(null);
export const STOREFRONT_PURCHASE_INTENT_KEY = 'sabito_storefront_purchase_intent';

const buildDefaultIntent = (intent = {}) => {
  const currentPath = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search || ''}`
    : '/';

  return {
    action: intent.action || 'home',
    returnTo: intent.returnTo || currentPath || '/',
    productId: intent.productId || intent.listingId || null,
    listingId: intent.listingId || intent.productId || null,
    productSlug: intent.productSlug || null,
    storeSlug: intent.storeSlug || null,
  };
};

export const StorefrontAuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState(() => authService.getStoredCustomer());
  const [googleClientId, setGoogleClientId] = useState(() => (
    String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  ));
  const [googleConfigLoaded, setGoogleConfigLoaded] = useState(() => Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID));
  const [isLoading, setIsLoading] = useState(() => Boolean(authService.getToken()));
  const [signOutRedirect, setSignOutRedirect] = useState(null);
  const [authModal, setAuthModal] = useState({
    isOpen: false,
    mode: 'login',
    intent: null,
  });

  useEffect(() => {
    let mounted = true;
    const token = authService.getToken();
    if (!token) {
      setIsLoading(false);
      return undefined;
    }
    // False once they sign out, or someone else signs in, before the reply arrives.
    const isSameShopper = () => authService.getToken() === token;

    authService.getMe()
      .then((data) => {
        if (!mounted || !isSameShopper()) return;
        const nextCustomer = data.customer || null;
        setCustomer(nextCustomer);
        queryClient.setQueryData(SHOPPER_QUERY_KEYS.profile, data);
      })
      .catch(() => {
        if (!isSameShopper()) return;
        authService.logout();
        if (mounted) setCustomer(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [queryClient]);

  const applyAuthenticatedCustomer = useCallback(async (data) => {
    const nextCustomer = data.customer || null;
    setCustomer(nextCustomer);
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.profile, data);
    await refreshAfterShopperAuthChange(queryClient);
    return data;
  }, [queryClient]);

  useEffect(() => {
    if (googleClientId) {
      setGoogleConfigLoaded(true);
      return undefined;
    }

    let mounted = true;
    authService.getPublicConfig()
      .then((config) => {
        if (!mounted) return;
        const clientId = String(config?.googleClientId || '').trim();
        if (clientId) setGoogleClientId(clientId);
      })
      .catch(() => {
        // Google is optional; keep password/OTP auth available if config cannot load.
      })
      .finally(() => {
        if (mounted) setGoogleConfigLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [googleClientId]);

  const login = useCallback(async (payload) => {
    const data = await authService.login(payload);
    return applyAuthenticatedCustomer(data);
  }, [applyAuthenticatedCustomer]);

  const googleAuth = useCallback(async (idToken, options = {}) => {
    const data = await authService.googleAuth(idToken, options);
    return applyAuthenticatedCustomer(data);
  }, [applyAuthenticatedCustomer]);

  const verifyLoginOtp = useCallback(async (payload) => {
    const data = await authService.verifyLoginOtp(payload);
    return applyAuthenticatedCustomer(data);
  }, [applyAuthenticatedCustomer]);

  const sendLoginOtp = useCallback(async (payload) => {
    const data = await authService.sendLoginOtp(payload);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await authService.register(payload);
    if (data?.token) await applyAuthenticatedCustomer(data);
    return data;
  }, [applyAuthenticatedCustomer]);

  const verifyEmail = useCallback(async (payload) => {
    const data = await authService.verifyEmail(payload);
    return applyAuthenticatedCustomer(data);
  }, [applyAuthenticatedCustomer]);

  const resendVerification = useCallback(async (payload) => {
    const data = await authService.resendVerification(payload);
    return data;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const data = await authService.updateProfile(payload);
    setCustomer(data.customer || null);
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.profile, data);
    await refreshAfterProfileChange(queryClient);
    return data;
  }, [queryClient]);

  const uploadAvatar = useCallback(async (file) => {
    const data = await authService.uploadAvatar(file);
    setCustomer(data.customer || null);
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.profile, data);
    await refreshAfterProfileChange(queryClient);
    return data;
  }, [queryClient]);

  const removeAvatar = useCallback(async () => {
    const data = await authService.removeAvatar();
    setCustomer(data.customer || null);
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.profile, data);
    await refreshAfterProfileChange(queryClient);
    return data;
  }, [queryClient]);

  /**
   * On a page that needs a sign-in, pass where to go and the current location key: the page's guard then
   * sends the shopper there. Navigating alone loses to the guard, which asks them to sign in.
   * @param {{ redirectTo?: string, locationKey?: string }} [opts]
   */
  const logout = useCallback(({ redirectTo, locationKey } = {}) => {
    authService.logout();
    setCustomer(null);
    setSignOutRedirect(redirectTo ? { to: redirectTo, locationKey } : null);
    queryClient.removeQueries({ queryKey: ['shopper'] });
  }, [queryClient]);

  useEffect(() => {
    const handleSessionExpired = (event) => {
      const detail = event?.detail || {};
      const returnTo = typeof detail.returnTo === 'string' && detail.returnTo.startsWith('/') && !detail.returnTo.startsWith('//')
        ? detail.returnTo
        : '/';
      try {
        window.sessionStorage.setItem('storefrontAuthMessage', detail.message || 'Your shopper session expired. Sign in again to continue.');
      } catch {
        // One-time login notice is best-effort only.
      }
      authService.logout();
      setCustomer(null);
      queryClient.removeQueries({ queryKey: ['shopper'] });
      window.location.assign(`/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`);
    };

    window.addEventListener('sabito-storefront:session-expired', handleSessionExpired);
    return () => window.removeEventListener('sabito-storefront:session-expired', handleSessionExpired);
  }, [queryClient]);

  const openShopperAuthModal = useCallback((options = {}) => {
    const intent = buildDefaultIntent(options.intent);

    try {
      window.localStorage.setItem(STOREFRONT_PURCHASE_INTENT_KEY, JSON.stringify(intent));
    } catch {
      // Purchase intent is a convenience only; auth should still proceed if storage is unavailable.
    }

    setAuthModal({
      isOpen: true,
      mode: options.mode || 'login',
      intent,
    });
  }, []);

  const closeShopperAuthModal = useCallback(() => {
    setAuthModal((current) => ({
      ...current,
      isOpen: false,
    }));
  }, []);

  const value = useMemo(() => ({
    authModal,
    closeShopperAuthModal,
    customer,
    googleAuth,
    googleClientId,
    googleConfigLoaded,
    isAuthenticated: Boolean(customer && authService.getToken()),
    isLoading,
    login,
    logout,
    openShopperAuthModal,
    register,
    removeAvatar,
    resendVerification,
    sendLoginOtp,
    signOutRedirect,
    uploadAvatar,
    updateProfile,
    verifyLoginOtp,
    verifyEmail,
  }), [
    authModal,
    closeShopperAuthModal,
    customer,
    googleAuth,
    googleClientId,
    googleConfigLoaded,
    isLoading,
    login,
    logout,
    openShopperAuthModal,
    register,
    removeAvatar,
    resendVerification,
    sendLoginOtp,
    signOutRedirect,
    uploadAvatar,
    updateProfile,
    verifyEmail,
    verifyLoginOtp,
  ]);

  const authTree = (
    <StorefrontAuthContext.Provider value={value}>
      {children}
    </StorefrontAuthContext.Provider>
  );

  if (!googleConfigLoaded || !googleClientId) {
    return authTree;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      {authTree}
    </GoogleOAuthProvider>
  );
};

export const useStorefrontAuth = () => {
  const context = useContext(StorefrontAuthContext);
  if (!context) {
    throw new Error('useStorefrontAuth must be used within StorefrontAuthProvider');
  }
  return context;
};
