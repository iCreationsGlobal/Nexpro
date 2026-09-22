import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import settingsService from '../services/settingsService';
import authService from '../services/authService';
import adminService from '../services/adminService';
import supportAccessService from '../services/supportAccessService';
import { shouldSuppressAppGuidance } from '../utils/appGuidanceEligibility';
import {
  isTeamMemberWorkspaceInvite,
  shouldRequireTenantOnboarding,
} from '../utils/tenantOnboarding';
import { getInterfaceMode } from '../utils/interfaceMode';

const AuthContext = createContext(null);

/**
 * Same resolution as useEffect bootstrap: prefer stored active tenant, else default/first membership.
 * Keeps React state aligned with localStorage on first paint so tenant-scoped queries (e.g. notifications) run immediately.
 */
function readInitialActiveTenantId() {
  try {
    const storedActive = authService.getActiveTenantId();
    const memberships = authService.getStoredMemberships();
    if (storedActive) return storedActive;
    if (!Array.isArray(memberships) || memberships.length === 0) return null;
    const defaultMembership = memberships.find((m) => m.isDefault);
    return (
      authService.membershipTenantId(defaultMembership) ||
      authService.membershipTenantId(memberships[0]) ||
      null
    );
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(() => readInitialActiveTenantId());
  const [loading, setLoading] = useState(true);
  const [supportSession, setSupportSession] = useState(() => supportAccessService.getSession());
  const [endingSupportAccess, setEndingSupportAccess] = useState(false);
  const [workspaceProfile, setWorkspaceProfile] = useState(null);
  const [bootstrapAccess, setBootstrapAccess] = useState({ defaultBranchId: null, shops: [], studioLocations: [] });
  const [bootstrapSettings, setBootstrapSettings] = useState({});
  const queryClient = useQueryClient();
  /** Prevents repeated bootstrap loops when flags are missing; cleared on logout / successful hydrate. */
  const featureFlagsHydrateForTenantRef = useRef(null);

  /**
   * Resolves the initial tenant ID from memberships
   * @param {Array} membershipsList - List of tenant memberships
   * @param {string|null} preferredTenantId - Preferred tenant ID (e.g., from localStorage)
   * @returns {string|null} - Resolved tenant ID
   */
  const resolveInitialTenant = (membershipsList = [], preferredTenantId = null) => {
    if (preferredTenantId != null && preferredTenantId !== '') {
      return String(preferredTenantId);
    }
    if (!Array.isArray(membershipsList) || membershipsList.length === 0) {
      return null;
    }
    const defaultMembership = membershipsList.find((membership) => membership.isDefault);
    return (
      authService.membershipTenantId(defaultMembership) ||
      authService.membershipTenantId(membershipsList[0]) ||
      null
    );
  };

  const bootstrapDataFromResponse = (body) => body?.data ?? body ?? {};

  const getBootstrapMemberships = (bootstrapData = {}) =>
    bootstrapData?.memberships || bootstrapData?.user?.tenantMemberships || [];

  const buildAuthPayloadFromBootstrap = (bootstrapData = {}, preferredTenantId = null) => {
    const nextMemberships = getBootstrapMemberships(bootstrapData);
    const resolvedTenantId = resolveInitialTenant(
      nextMemberships,
      preferredTenantId || bootstrapData?.activeTenantId || bootstrapData?.defaultTenantId || null
    );
    return {
      user: bootstrapData?.user || null,
      memberships: nextMemberships,
      defaultTenantId: resolvedTenantId,
    };
  };

  const hasWorkspaceWideAccess = (role) => ['owner', 'admin', 'support'].includes(role || '');

  const buildAccessCache = (items = [], role = null, storedActiveId = null, activeIdKey = 'activeId', defaultIdKey = 'defaultId') => {
    const list = Array.isArray(items) ? items : [];
    const validIds = new Set(list.map((item) => item?.id).filter(Boolean));
    const defaultId = list.find((item) => item?.isDefault)?.id || list[0]?.id || null;
    const activeId = storedActiveId && validIds.has(storedActiveId) ? storedActiveId : defaultId;
    return {
      items: list,
      canAccessAll: hasWorkspaceWideAccess(role),
      [activeIdKey]: activeId,
      [defaultIdKey]: defaultId,
    };
  };

  const applyBootstrapWorkspaceState = (bootstrapData = {}) => {
    setWorkspaceProfile(bootstrapData.workspace || null);
    setBootstrapAccess({
      defaultBranchId: bootstrapData.access?.defaultBranchId || null,
      shops: bootstrapData.access?.shops || [],
      studioLocations: bootstrapData.access?.studioLocations || [],
    });
    setBootstrapSettings(bootstrapData.settings || {});
  };

  const seedBootstrapQueryCache = (bootstrapData = {}, preferredTenantId = null) => {
    const activeId =
      bootstrapData?.activeTenantId ||
      resolveInitialTenant(getBootstrapMemberships(bootstrapData), preferredTenantId) ||
      null;
    if (!activeId) return;

    applyBootstrapWorkspaceState(bootstrapData);

    queryClient.setQueryData(['auth', 'bootstrap', activeId], {
      success: true,
      data: bootstrapData,
    });

    if (bootstrapData?.user) {
      queryClient.setQueryData(['auth', 'me'], {
        success: true,
        data: bootstrapData.user,
      });
    }

    const settings = bootstrapData?.settings || {};
    if (Object.prototype.hasOwnProperty.call(settings, 'organization')) {
      const organization = { success: true, data: settings.organization || {} };
      queryClient.setQueryData(['settings', 'organization'], organization);
      queryClient.setQueryData(['settings', 'organization', activeId], organization);
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'rental')) {
      const rental = { success: true, data: settings.rental || {} };
      queryClient.setQueryData(['settings', 'rental', activeId], rental);
    }

    const role = bootstrapData?.tenantRole || null;
    if (bootstrapData?.activeTenant?.billingStatus) {
      queryClient.setQueryData(['subscription', 'status', activeId], bootstrapData.activeTenant.billingStatus);
    }

    const access = bootstrapData?.access || {};
    if (Array.isArray(access.shops)) {
      const shopAccess = buildAccessCache(
        access.shops,
        role,
        localStorage.getItem('activeShopId'),
        'activeShopId',
        'defaultShopId'
      );
      queryClient.setQueryData(['shops', 'access', activeId], {
        shops: shopAccess.items,
        canAccessAll: shopAccess.canAccessAll,
        activeShopId: shopAccess.activeShopId,
        defaultShopId: shopAccess.defaultShopId,
      });
    }

    if (Array.isArray(access.studioLocations)) {
      const locationAccess = buildAccessCache(
        access.studioLocations,
        role,
        localStorage.getItem('activeStudioLocationId'),
        'activeStudioLocationId',
        'defaultStudioLocationId'
      );
      queryClient.setQueryData(['studio-locations', 'access', activeId], {
        locations: locationAccess.items,
        canAccessAll: locationAccess.canAccessAll,
        activeStudioLocationId: locationAccess.activeStudioLocationId,
        defaultStudioLocationId: locationAccess.defaultStudioLocationId,
      });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const applyBootstrapFromServer = (body) => {
      const bootstrapData = bootstrapDataFromResponse(body);
      const payload = buildAuthPayloadFromBootstrap(bootstrapData, storedActiveTenantId);
      const userData = payload.user;
      const nextMemberships = payload.memberships || [];
      if (import.meta.env.DEV) {
        console.log('[AuthContext] Fetched memberships:', {
          membershipsCount: nextMemberships.length,
          memberships: nextMemberships.map((m) => ({ tenantId: m.tenantId, isDefault: m.isDefault })),
        });
        console.log('[AuthContext][features] Fresh feature flags snapshot:', nextMemberships.map((m) => ({
          tenantId: m?.tenantId,
          plan: m?.tenant?.plan,
          enabledCount: Object.values(m?.tenant?.effectiveFeatureFlags || {}).filter(Boolean).length,
          crm: m?.tenant?.effectiveFeatureFlags?.crm === true,
          automations: m?.tenant?.effectiveFeatureFlags?.automations === true,
        })));
      }
      for (const m of nextMemberships) {
        const eff = m?.tenant?.effectiveFeatureFlags && typeof m.tenant.effectiveFeatureFlags === 'object'
          ? m.tenant.effectiveFeatureFlags
          : {};
        const enabled = Object.entries(eff)
          .filter(([, v]) => v === true)
          .map(([k]) => k)
          .sort();
        console.log(
          '[TenantAccess] bootstrap_getMe tenantId=%s plan=%s businessType=%s enabledCount=%s enabled=%j',
          m.tenantId,
          m.tenant?.plan || 'n/a',
          m.tenant?.businessType || 'n/a',
          enabled.length,
          enabled
        );
      }

      setUser(userData);
      seedBootstrapQueryCache(bootstrapData, storedActiveTenantId);

      if (nextMemberships.length > 0) {
        setMemberships(nextMemberships);
        authService.persistAuthPayload({
          user: userData,
          memberships: nextMemberships,
          defaultTenantId: payload.defaultTenantId,
        });
        applyResolvedTenant(nextMemberships, storedActiveTenantId);
      } else {
        if (import.meta.env.DEV) console.warn('[AuthContext] No tenant memberships');
        setMemberships([]);
        applyResolvedTenant(nextMemberships, storedActiveTenantId);
      }
      featureFlagsHydrateForTenantRef.current = null;
    };

    // Check for stored user on mount
    const storedUser = authService.getStoredUser();
    const storedMemberships = authService.getStoredMemberships();
    const storedActiveTenantId = authService.getActiveTenantId();

    if (import.meta.env.DEV) console.log('[AuthContext] Initializing auth state:', {
      hasUser: !!storedUser,
      hasMemberships: !!storedMemberships,
      membershipsCount: storedMemberships?.length || 0,
      storedActiveTenantId,
      allLocalStorageKeys: Object.keys(localStorage)
    });

    if (storedUser) {
      setUser(storedUser);
    }
    if (storedMemberships && storedMemberships.length > 0) {
      setMemberships(storedMemberships);
    }

    const resolvedFromCache = resolveInitialTenant(storedMemberships, storedActiveTenantId);
    const hasToken = Boolean(authService.getToken());

    if (import.meta.env.DEV) {
      console.log('[AuthContext][features] Cached feature flags snapshot:', (storedMemberships || []).map((m) => ({
        tenantId: m?.tenantId,
        plan: m?.tenant?.plan,
        hasEffectiveFlags: !!m?.tenant?.effectiveFeatureFlags,
        enabledCount: Object.values(m?.tenant?.effectiveFeatureFlags || {}).filter(Boolean).length,
        crm: m?.tenant?.effectiveFeatureFlags?.crm === true,
        automations: m?.tenant?.effectiveFeatureFlags?.automations === true,
      })));
    }

    const applyResolvedTenant = (membershipsList, preferredActiveId) => {
      const ids = new Set(
        (membershipsList || []).map((m) => authService.membershipTenantId(m)).filter(Boolean)
      );
      const preferred = preferredActiveId != null && preferredActiveId !== '' ? String(preferredActiveId) : null;
      const resolvedTenantId =
        preferred && ids.has(preferred)
          ? preferred
          : resolveInitialTenant(membershipsList, null);
      if (resolvedTenantId) {
        if (import.meta.env.DEV) console.log('[AuthContext] Set activeTenantId:', resolvedTenantId);
        authService.setActiveTenantId(resolvedTenantId);
      } else if (import.meta.env.DEV) {
        console.warn('[AuthContext] No tenant ID resolved');
      }
      setActiveTenantId(resolvedTenantId);
    };

    const finishBootstrapFromCache = () => {
      if (import.meta.env.DEV) {
        console.log('[AuthContext] Resolved tenant (cache):', {
          resolvedTenantId: resolvedFromCache,
          storedActiveTenantId,
          hasMemberships: !!storedMemberships,
          memberships: storedMemberships?.map((m) => ({
            tenantId: authService.membershipTenantId(m),
            isDefault: m.isDefault,
          })),
        });
      }
      applyResolvedTenant(storedMemberships, storedActiveTenantId);
      setLoading(false);
    };

    if (!storedUser) {
      setLoading(false);
      return undefined;
    }

    // No token: cannot call API; keep whatever we hydrated from storage.
    if (!hasToken) {
      finishBootstrapFromCache();
      return undefined;
    }

    // Unblock the shell from cache immediately; the server refresh should not block PrivateRoute.
    finishBootstrapFromCache();

    // Always refresh from server so effectiveFeatureFlags, settings, and workspace access match source of truth.
    if (import.meta.env.DEV) {
      console.log('[AuthContext] Refreshing session via GET /auth/bootstrap (auth shell source of truth)...');
    }
    authService
      .getBootstrap(storedActiveTenantId || undefined)
      .then((body) => {
        if (cancelled) return;
        applyBootstrapFromServer(body);
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error('[AuthContext] Error fetching /auth/bootstrap:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Synchronizes authentication state across the application
   * Updates user, memberships, and active tenant ID
   * @param {Object} payload - Auth payload containing user, memberships, and defaultTenantId
   * @param {Object} payload.user - User object
   * @param {Array} payload.memberships - Array of tenant memberships
   * @param {string} payload.defaultTenantId - Default tenant ID
   */
  const syncAuthState = (payload = {}) => {
    const { user: nextUser, memberships: nextMemberships = [], defaultTenantId } = payload;
    
    if (import.meta.env.DEV) {
      console.log('[AuthContext] syncAuthState payload:', {
        hasUser: !!nextUser,
        membershipsCount: Array.isArray(nextMemberships) ? nextMemberships.length : 0,
        defaultTenantId,
      });
    }

    setUser(nextUser || null);
    setMemberships(nextMemberships);
    const tenantFromStorage = authService.getActiveTenantId();
    const resolvedTenantId = resolveInitialTenant(
      nextMemberships,
      tenantFromStorage || defaultTenantId || null
    );
    
    // Persist activeTenantId to localStorage so API calls include the header
    if (resolvedTenantId) {
      authService.setActiveTenantId(resolvedTenantId);
      if (import.meta.env.DEV) console.log('[AuthContext] Set activeTenantId:', resolvedTenantId);
    } else {
      if (import.meta.env.DEV) console.warn('[AuthContext] No tenant ID resolved');
    }
    
    setActiveTenantId(resolvedTenantId);
  };

  /**
   * Refetch /auth/bootstrap so tenant.effectiveFeatureFlags, settings, and workspace access are populated.
   */
  const refreshAuthState = async () => {
    const preferredTenantId = authService.getActiveTenantId();
    if (import.meta.env.DEV) console.log('[AuthContext] refreshAuthState: fetching /auth/bootstrap');
    const body = await authService.getBootstrap(preferredTenantId || undefined);
    const bootstrapData = bootstrapDataFromResponse(body);
    const payload = buildAuthPayloadFromBootstrap(bootstrapData, preferredTenantId);
    const userData = payload.user;
    const nextMemberships = payload.memberships || [];
    const firstTenant = nextMemberships[0]?.tenant;
    if (import.meta.env.DEV) {
      console.log('[AuthContext] refreshAuthState:', { membershipsCount: nextMemberships.length, firstTenantId: firstTenant?.id });
    }
    seedBootstrapQueryCache(bootstrapData, preferredTenantId);
    authService.persistAuthPayload(payload);
    syncAuthState(payload);
    const activeId =
      payload.defaultTenantId ||
      authService.getActiveTenantId() ||
      authService.membershipTenantId(nextMemberships.find((m) => m.isDefault)) ||
      authService.membershipTenantId(nextMemberships[0]);
    const activeM = nextMemberships.find((m) => authService.membershipTenantId(m) === activeId);
    const t = activeM?.tenant;
    const eff = t?.effectiveFeatureFlags && typeof t.effectiveFeatureFlags === 'object' ? t.effectiveFeatureFlags : {};
    const enabled = Object.entries(eff)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort();
    console.log('[TenantAccess] client refreshAuthState activeTenantId=%s plan=%s businessType=%s enabledCount=%s enabled=%j', activeId || 'n/a', t?.plan || 'n/a', t?.businessType || 'n/a', enabled.length, enabled);
    if (import.meta.env.DEV) {
      console.log('[AuthContext] refreshAuthState: updated, defaultTenantId=', payload.defaultTenantId);
    }
    return payload;
  };

  /**
   * Logs in a user with credentials
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - User email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} - Login response
   * @throws {Error} - If login fails
   */
  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);
      syncAuthState(response.data || {});
      try {
        await refreshAuthState();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AuthContext] login: /auth/bootstrap refresh failed', e);
      }
      if (import.meta.env.DEV) {
        const data = response?.data || {};
        console.log('[AuthContext] login success:', {
          hasUser: !!data.user,
          membershipsCount: Array.isArray(data.memberships) ? data.memberships.length : 0,
          defaultTenantId: data.defaultTenantId || null,
        });
      }
      return response;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[AuthContext] login failed:', error);
      }
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const response = await authService.register(userData);
      syncAuthState(response.data || {});
      try {
        await refreshAuthState();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AuthContext] register: /auth/bootstrap refresh failed', e);
      }
      return response;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setMemberships([]);
    setActiveTenantId(null);
    setWorkspaceProfile(null);
    setBootstrapAccess({ defaultBranchId: null, shops: [], studioLocations: [] });
    setBootstrapSettings({});
    featureFlagsHydrateForTenantRef.current = null;
    queryClient.clear();
  };

  useEffect(() => {
    const handleSessionExpired = (event) => {
      const detail = event?.detail || {};
      const returnTo = typeof detail.returnTo === 'string' && detail.returnTo.startsWith('/') && !detail.returnTo.startsWith('//')
        ? detail.returnTo
        : '/dashboard';
      try {
        sessionStorage.setItem('authSessionMessage', detail.message || 'Your session expired. Sign in again to continue.');
      } catch {
        // Session messaging is best-effort only.
      }
      authService.logout();
      supportAccessService.clearSession();
      setUser(null);
      setMemberships([]);
      setActiveTenantId(null);
      setWorkspaceProfile(null);
      setBootstrapAccess({ defaultBranchId: null, shops: [], studioLocations: [] });
      setBootstrapSettings({});
      setSupportSession(null);
      featureFlagsHydrateForTenantRef.current = null;
      queryClient.clear();
      const loginUrl = `/login?reason=session_expired&returnTo=${encodeURIComponent(returnTo)}`;
      if (window.location.pathname !== '/login') {
        window.location.assign(loginUrl);
      }
    };

    window.addEventListener('nexpro:auth-session-expired', handleSessionExpired);
    return () => window.removeEventListener('nexpro:auth-session-expired', handleSessionExpired);
  }, [queryClient]);

  const tenantSignup = async (payload) => {
    try {
      const response = await authService.tenantSignup(payload);
      syncAuthState(response.data || {});
      try {
        await refreshAuthState();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AuthContext] tenantSignup: /auth/bootstrap refresh failed', e);
      }
      return response;
    } catch (error) {
      throw error;
    }
  };

  const sabitoSSO = async (sabitoToken) => {
    try {
      if (import.meta.env.DEV) console.log('[AuthContext] Starting Sabito SSO login...');
      const response = await authService.sabitoSSO(sabitoToken);
      if (import.meta.env.DEV) console.log('[AuthContext] SSO response:', {
        hasData: !!response?.data,
        hasUser: !!response?.data?.user,
        hasMemberships: !!response?.data?.memberships,
        membershipsCount: response?.data?.memberships?.length || 0,
        defaultTenantId: response?.data?.defaultTenantId,
        fullResponse: response?.data
      });
      
      syncAuthState(response.data || {});
      try {
        await refreshAuthState();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AuthContext] sabitoSSO: /auth/bootstrap refresh failed', e);
      }

      // Verify activeTenantId was set
      const activeTenantId = authService.getActiveTenantId();
      if (import.meta.env.DEV) console.log('[AuthContext] Active tenant after sync:', activeTenantId);
      
      return response;
    } catch (error) {
      if (import.meta.env.DEV) console.error('[AuthContext] SSO login failed:', error);
      throw error;
    }
  };

  /**
   * Google OAuth sign-in or sign-up.
   * @param {string} idToken - Google ID token from credentialResponse.credential
   * @param {Object} options - { signUp: boolean, businessType?: string, companyName?: string }
   * @returns {Promise<{ data }>}
   */
  const googleAuth = async (idToken, options = {}) => {
    const response = await authService.googleAuth(idToken, options);
    syncAuthState(response.data || {});
    try {
      await refreshAuthState();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[AuthContext] googleAuth: /auth/bootstrap refresh failed', e);
    }
    return response;
  };

  const loginWithToken = async (token) => {
    try {
      if (token) {
        localStorage.setItem('token', token);
      }
      const body = await authService.getBootstrap(authService.getActiveTenantId() || undefined);
      const bootstrapData = bootstrapDataFromResponse(body);
      const payload = buildAuthPayloadFromBootstrap(bootstrapData, authService.getActiveTenantId());
      seedBootstrapQueryCache(bootstrapData, payload.defaultTenantId);
      
      // Sync auth state
      authService.persistAuthPayload(payload);
      syncAuthState(payload);
      
      return { success: true, data: payload };
    } catch (error) {
      throw error;
    }
  };

  const updateUser = (userData) => {
    setUser((prev) => {
      const nextUser = {
        ...(prev && typeof prev === 'object' ? prev : {}),
        ...(userData && typeof userData === 'object' ? userData : {}),
      };
      localStorage.setItem('user', JSON.stringify(nextUser));
      return nextUser;
    });
  };

  const setActiveTenant = (tenantId) => {
    authService.setActiveTenantId(tenantId);
    setActiveTenantId(tenantId || null);
    queryClient.clear();
    if (tenantId && user) {
      refreshAuthState().catch(() => {});
    }
  };

  const isSupportAccessActive = useMemo(
    () => Boolean(supportSession?.sessionId && supportAccessService.isActive()),
    [supportSession]
  );

  const startSupportAccess = async (tenantId, { reason, supportTicketId, hours, mode } = {}) => {
    const response = await adminService.startSupportAccess(tenantId, {
      reason,
      supportTicketId,
      hours,
      mode,
    });
    const payload = response?.data || response;
    const session = payload?.session;
    const tenant = payload?.tenant;
    if (!session?.id || !tenant?.id) {
      throw new Error('Invalid support access response');
    }
    const stored = {
      sessionId: session.id,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenant,
      mode: session.mode,
      expiresAt: session.expiresAt,
      reason: session.reason,
    };
    supportAccessService.setSession(stored);
    setSupportSession(stored);
    authService.setActiveTenantId(tenant.id);
    setActiveTenantId(tenant.id);
    queryClient.clear();
    return payload;
  };

  const endSupportAccess = async () => {
    const sessionId = supportSession?.sessionId;
    if (!sessionId) {
      supportAccessService.clearSession();
      setSupportSession(null);
      return;
    }
    setEndingSupportAccess(true);
    try {
      await adminService.endSupportAccess(sessionId);
    } finally {
      supportAccessService.clearSession();
      setSupportSession(null);
      setEndingSupportAccess(false);
      window.location.href = '/admin/tenants';
    }
  };

  useEffect(() => {
    if (!user?.isPlatformAdmin) return;
    adminService
      .getActiveSupportAccess()
      .then((response) => {
        const data = response?.data ?? response;
        if (!data?.session?.id || !data?.tenant?.id) return;
        const stored = {
          sessionId: data.session.id,
          tenantId: data.tenant.id,
          tenantName: data.tenant.name,
          tenant: data.tenant,
          mode: data.session.mode,
          expiresAt: data.session.expiresAt,
          reason: data.session.reason,
        };
        supportAccessService.setSession(stored);
        setSupportSession(stored);
        authService.setActiveTenantId(data.tenant.id);
        setActiveTenantId(data.tenant.id);
      })
      .catch(() => {
        /* no active session */
      });
  }, [user?.id, user?.isPlatformAdmin]);

  const resolvedActiveTenantId = isSupportAccessActive
    ? supportSession?.tenantId
    : activeTenantId;

  const activeMembership = useMemo(
    () =>
      memberships.find(
        (membership) => authService.membershipTenantId(membership) === resolvedActiveTenantId
      ) || null,
    [memberships, resolvedActiveTenantId]
  );

  const activeTenant = useMemo(() => {
    if (isSupportAccessActive && supportSession?.tenant) {
      return supportSession.tenant;
    }
    return activeMembership?.tenant || null;
  }, [isSupportAccessActive, supportSession, activeMembership]);
  const activeFeatureFlags = useMemo(
    () => (activeTenant?.effectiveFeatureFlags && typeof activeTenant.effectiveFeatureFlags === 'object'
      ? activeTenant.effectiveFeatureFlags
      : {}),
    [activeTenant]
  );
  const hasFeature = useMemo(
    () => (featureKey) => activeFeatureFlags[featureKey] === true,
    [activeFeatureFlags]
  );

  const {
    data: billingStatusLive,
    refetch: refreshBillingStatus,
  } = useQuery({
    queryKey: ['subscription', 'status', resolvedActiveTenantId],
    queryFn: async () => {
      const res = await settingsService.getSubscriptionStatus();
      return res?.data ?? res;
    },
    enabled: Boolean(
      resolvedActiveTenantId && user && !user.isPlatformAdmin && !isSupportAccessActive
    ),
    staleTime: 60_000,
  });

  const billingStatus = useMemo(
    () => billingStatusLive || activeTenant?.billingStatus || null,
    [billingStatusLive, activeTenant?.billingStatus]
  );

  useEffect(() => {
    const onLocked = () => {
      refreshBillingStatus();
    };
    window.addEventListener('subscription-locked', onLocked);
    return () => window.removeEventListener('subscription-locked', onLocked);
  }, [refreshBillingStatus]);

  const refreshAuthStateRef = useRef(refreshAuthState);
  refreshAuthStateRef.current = refreshAuthState;

  /**
   * DB is source of truth; /auth/bootstrap attaches computed effectiveFeatureFlags.
   * If the active membership's tenant is missing that payload (stale localStorage, old login shape), hydrate once.
   */
  useEffect(() => {
    if (loading || !user || user.isPlatformAdmin || isSupportAccessActive || !resolvedActiveTenantId) return;
    const m = memberships.find((x) => authService.membershipTenantId(x) === resolvedActiveTenantId);
    const eff = m?.tenant?.effectiveFeatureFlags;
    const looksHydrated =
      eff != null &&
      typeof eff === 'object' &&
      !Array.isArray(eff) &&
      Object.keys(eff).length > 0;
    if (looksHydrated) {
      featureFlagsHydrateForTenantRef.current = null;
      return;
    }
    if (featureFlagsHydrateForTenantRef.current === resolvedActiveTenantId) return;
    featureFlagsHydrateForTenantRef.current = resolvedActiveTenantId;
    console.log('[TenantAccess] hydrate_missing_flags tenantId=%s -> GET /auth/bootstrap', resolvedActiveTenantId);
    refreshAuthStateRef.current().catch(() => {
      /* Keep ref = tenantId so we do not retry in a loop; full page reload can retry. */
    });
  }, [loading, user, resolvedActiveTenantId, memberships, isSupportAccessActive]);

  const tenantRole = useMemo(
    () => activeMembership?.role || null,
    [activeMembership]
  );

  const interfaceMode = useMemo(
    () => getInterfaceMode(activeMembership),
    [activeMembership]
  );

  const effectiveRole = tenantRole || user?.role || null;
  const isPlatformAdmin = user?.isPlatformAdmin === true;
  const isFirstLogin = user?.isFirstLogin === true;
  const isWorkspaceAdmin = ['owner', 'admin'].includes(effectiveRole || '');

  /** True if user signed up via invite link (invitedBy set on any membership). */
  const wasInvited = useMemo(
    () => Array.isArray(memberships) && memberships.some((m) => !!m.invitedBy),
    [memberships]
  );

  /**
   * Every active membership was created from a workspace invite (invitedBy set).
   * Empty memberships is false so platform-only users are not misclassified.
   * Self-service owners have invitedBy null on their workspace — they still need email verification.
   */
  const joinedOnlyViaWorkspaceInvite = useMemo(
    () =>
      Array.isArray(memberships) &&
      memberships.length > 0 &&
      memberships.every((m) => !!m.invitedBy),
    [memberships]
  );

  /** In-app verify-email banner, checkout gate, etc. Invited joiners are treated as already validated. */
  const needsEmailVerification = useMemo(
    () => Boolean(user && !isSupportAccessActive && !user.emailVerifiedAt && !joinedOnlyViaWorkspaceInvite),
    [user, isSupportAccessActive, joinedOnlyViaWorkspaceInvite]
  );

  /**
   * Show "Complete Your Profile" only for admin-created users (isFirstLogin) who were
   * NOT invited and are NOT admins (platform or workspace). Invited users set their own
   * password at signup; admins are excluded.
   */
  const shouldCompleteProfile = useMemo(
    () => Boolean(isFirstLogin && !isPlatformAdmin && !isWorkspaceAdmin && !wasInvited),
    [isFirstLogin, isPlatformAdmin, isWorkspaceAdmin, wasInvited]
  );

  /** Skip product tour prompts and forced workspace onboarding for tenured or very active users. */
  const suppressAppGuidance = useMemo(
    () => shouldSuppressAppGuidance({ user, activeMembership, activeTenant }),
    [user, activeMembership, activeTenant]
  );

  const shouldRequireOnboarding = useMemo(
    () =>
      shouldRequireTenantOnboarding({
        user,
        membership: activeMembership,
        activeTenant,
        suppressAppGuidance,
      }),
    [user, activeMembership, activeTenant, suppressAppGuidance]
  );

  const isTeamMemberInvite = useMemo(
    () => isTeamMemberWorkspaceInvite(activeMembership, user),
    [activeMembership, user]
  );

  // Log core auth state whenever it changes (for redirect debugging)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[AuthContext] State change:', {
      hasUser: !!user,
      activeTenantId,
      membershipsCount: Array.isArray(memberships) ? memberships.length : 0,
      loading,
    });
  }, [user, activeTenantId, memberships, loading]);

  useEffect(() => {
    if (!user) return;
    console.log('[ProfileCompletion] Decision factors:', {
      userId: user?.id,
      email: user?.email,
      isFirstLogin,
      isPlatformAdmin,
      isWorkspaceAdmin,
      wasInvited,
      effectiveRole,
      membershipsInvitedBy: Array.isArray(memberships) ? memberships.map((m) => ({ tenantId: m.tenantId, role: m.role, invitedBy: m.invitedBy })) : [],
      shouldCompleteProfile,
      reason: !isFirstLogin
        ? 'not first login'
        : isPlatformAdmin
          ? 'platform admin excluded'
          : isWorkspaceAdmin
            ? 'workspace admin excluded'
            : wasInvited
              ? 'invited user excluded'
              : 'admin-created user → must complete profile',
    });
  }, [user, memberships, isFirstLogin, isPlatformAdmin, isWorkspaceAdmin, wasInvited, shouldCompleteProfile, effectiveRole]);

  const value = useMemo(
    () => ({
      user,
      memberships,
      tenantMemberships: memberships,
      activeTenantId: resolvedActiveTenantId,
      activeTenant,
      workspaceProfile,
      bootstrapAccess,
      bootstrapSettings,
      activeFeatureFlags,
      hasFeature,
      activeMembership,
      tenantRole,
      interfaceMode,
      setActiveTenant,
      refreshAuthState,
      login,
      register,
      logout,
      tenantSignup,
      sabitoSSO,
      googleAuth,
      loginWithToken,
      updateUser,
      loading,
      isAuthenticated: !!user,
      isAdmin: ['owner', 'admin'].includes(effectiveRole),
      isManager: ['owner', 'admin', 'manager'].includes(effectiveRole || ''),
      isDriver: effectiveRole === 'driver',
      isPlatformAdmin,
      isFirstLogin,
      wasInvited,
      isTeamMemberInvite,
      joinedOnlyViaWorkspaceInvite,
      needsEmailVerification,
      shouldCompleteProfile,
      suppressAppGuidance,
      shouldRequireOnboarding,
      supportSession,
      isSupportAccessActive,
      startSupportAccess,
      endSupportAccess,
      endingSupportAccess,
      billingStatus,
      refreshBillingStatus,
    }),
    [
      user,
      memberships,
      resolvedActiveTenantId,
      activeTenant,
      workspaceProfile,
      bootstrapAccess,
      bootstrapSettings,
      activeFeatureFlags,
      hasFeature,
      activeMembership,
      tenantRole,
      interfaceMode,
      setActiveTenant,
      refreshAuthState,
      login,
      register,
      logout,
      tenantSignup,
      sabitoSSO,
      googleAuth,
      loginWithToken,
      updateUser,
      loading,
      effectiveRole,
      isPlatformAdmin,
      isFirstLogin,
      wasInvited,
      isTeamMemberInvite,
      joinedOnlyViaWorkspaceInvite,
      needsEmailVerification,
      shouldCompleteProfile,
      suppressAppGuidance,
      shouldRequireOnboarding,
      supportSession,
      isSupportAccessActive,
      startSupportAccess,
      endSupportAccess,
      endingSupportAccess,
      billingStatus,
      refreshBillingStatus,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;


