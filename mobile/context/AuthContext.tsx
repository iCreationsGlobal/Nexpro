import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth';
import { setSessionExpiredHandler } from '@/services/api';
import { logger } from '@/utils/logger';
import { shouldSuppressAppGuidance } from '@/utils/appGuidanceEligibility';
import { isOnboardingComplete } from '@/utils/onboardingStatus';
import { membershipTenantId, normalizeMemberships } from '@/utils/membership';
import { getCurrentNetworkOnline } from '@/utils/connectivity';
import { sanitizeAuthUserForMobile } from '@/utils/stripOversizedInlineDataUrls';

type User = {
  id: string;
  email: string;
  name?: string;
  profilePicture?: string;
  emailVerifiedAt?: string | null;
  isPlatformAdmin?: boolean;
  createdAt?: string;
  lastLogin?: string;
  isFirstLogin?: boolean;
} | null;
type Membership = {
  tenantId: string;
  role?: string | null;
  tenant?: {
    id: string;
    name?: string;
    businessType?: string;
    createdAt?: string;
    effectiveFeatureFlags?: Record<string, boolean>;
    metadata?: {
      shopType?: string;
      onboarding?: { completedAt?: string };
      phone?: string;
      email?: string;
    };
  };
  isDefault?: boolean;
  invitedBy?: string | null;
  createdAt?: string;
  joinedAt?: string;
};

type BootstrapUser = NonNullable<User> & {
  tenantMemberships?: Membership[];
};

type BootstrapData = {
  user?: BootstrapUser | null;
  memberships?: Membership[];
  activeTenantId?: string | null;
  defaultTenantId?: string | null;
  tenantRole?: string | null;
  settings?: Record<string, unknown>;
  access?: {
    shops?: Array<{ id: string; name: string; isDefault?: boolean }>;
    studioLocations?: Array<{ id: string; name: string; isDefault?: boolean }>;
  };
  activeTenant?: { billingStatus?: unknown };
};

type TenantSignupPayload = {
  companyName?: string;
  companyEmail: string;
  adminName: string;
  adminEmail: string;
  password: string;
  acceptedTerms?: boolean;
  termsVersion?: string;
};

type GoogleAuthOptions = {
  signUp?: boolean;
  companyName?: string;
  acceptedTerms?: boolean;
  termsVersion?: string;
};

type AuthContextType = {
  user: User;
  memberships: Membership[];
  activeTenantId: string | null;
  activeTenant: {
    businessType?: string;
    name?: string;
    effectiveFeatureFlags?: Record<string, boolean>;
    metadata?: {
      shopType?: string;
      onboarding?: { completedAt?: string };
      phone?: string;
      email?: string;
    };
  } | null;
  loading: boolean;
  /** True while login/init is syncing memberships from bootstrap */
  sessionSyncing: boolean;
  wasInvited: boolean;
  /** Skip forced onboarding for tenured or very active users */
  suppressAppGuidance: boolean;
  tenantRole: string | null;
  isDriver: boolean;
  isAdmin: boolean;
  isManager: boolean;
  /** Plan/feature gating — same semantics as web: flag must be exactly true */
  hasFeature: (featureKey: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveTenantId: (id: string | null) => Promise<void>;
  tenantSignup: (payload: TenantSignupPayload) => Promise<void>;
  refreshAuth: () => Promise<void>;
  googleAuth: (idToken: string, options?: GoogleAuthOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_SESSION_MESSAGE_KEY = 'auth_session_message';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionSyncing, setSessionSyncing] = useState(false);

  const activeMembership =
    memberships.find((m) => membershipTenantId(m) === activeTenantId) ?? null;
  const activeTenant = activeMembership?.tenant ?? null;
  const tenantRole = activeMembership?.role ?? null;
  const isDriver = tenantRole === 'driver';
  const isAdmin = ['owner', 'admin'].includes(tenantRole || '');
  const isManager = ['owner', 'admin', 'manager'].includes(tenantRole || '');

  const activeFeatureFlags = useMemo(() => {
    const eff = activeTenant?.effectiveFeatureFlags;
    if (eff && typeof eff === 'object' && !Array.isArray(eff)) return eff;
    return {} as Record<string, boolean>;
  }, [activeTenant]);

  const hasFeature = useCallback(
    (featureKey: string) => activeFeatureFlags[featureKey] === true,
    [activeFeatureFlags]
  );

  const wasInvited = useMemo(
    () => Array.isArray(memberships) && memberships.some((m) => !!(m as Membership & { invitedBy?: string }).invitedBy),
    [memberships]
  );

  const suppressAppGuidance = useMemo(
    () => shouldSuppressAppGuidance({ user, activeMembership, activeTenant }),
    [user, activeMembership, activeTenant]
  );

  const activeTenantIdRef = useRef(activeTenantId);
  const sessionExpiredHandledRef = useRef(false);
  activeTenantIdRef.current = activeTenantId;

  const setActiveTenantId = useCallback(
    async (tenantId: string | null) => {
      const prevId = activeTenantIdRef.current;
      await authService.setActiveTenantId(tenantId);
      setActiveTenantIdState(tenantId);
      activeTenantIdRef.current = tenantId;
      if (prevId !== tenantId) {
        queryClient.clear();
        logger.info('AuthContext', 'Tenant switched, cleared query cache');
      }
    },
    [queryClient]
  );

  const setActiveTenantIdRef = useRef(setActiveTenantId);
  setActiveTenantIdRef.current = setActiveTenantId;

  const resolveInitialTenant = useCallback(
    (membershipsList: Membership[] = [], preferredTenantId: string | null = null): string | null => {
      if (preferredTenantId) return preferredTenantId;
      if (!Array.isArray(membershipsList) || membershipsList.length === 0) return null;
      const defaultMembership = membershipsList.find((m) => m.isDefault);
      return membershipTenantId(defaultMembership) ?? membershipTenantId(membershipsList[0]) ?? null;
    },
    []
  );

  const bootstrapDataFromResponse = useCallback((res: unknown) => {
    const response = res as { data?: { data?: unknown } | unknown };
    return ((response?.data as { data?: unknown })?.data ?? response?.data ?? response ?? {}) as BootstrapData;
  }, []);

  const getBootstrapMemberships = useCallback(
    (bootstrapData: BootstrapData) =>
      normalizeMemberships(bootstrapData?.memberships ?? bootstrapData?.user?.tenantMemberships ?? []) as Membership[],
    []
  );

  const hasWorkspaceWideAccess = useCallback(
    (role?: string | null) => ['owner', 'admin', 'support'].includes(role || ''),
    []
  );

  const seedBootstrapQueryCache = useCallback(
    (bootstrapData: BootstrapData, preferredTenantId: string | null = null) => {
      const bootstrapMemberships = getBootstrapMemberships(bootstrapData);
      const resolvedTenantId =
        bootstrapData.activeTenantId ??
        resolveInitialTenant(bootstrapMemberships, preferredTenantId) ??
        null;
      if (!resolvedTenantId) return;

      queryClient.setQueryData(['auth', 'bootstrap', resolvedTenantId], bootstrapData);

      const organization = bootstrapData.settings?.organization;
      if (organization !== undefined) {
        queryClient.setQueryData(['settings', 'organization'], organization || {});
        queryClient.setQueryData(['settings', 'organization', resolvedTenantId], organization || {});
      }

      if (bootstrapData.activeTenant?.billingStatus) {
        queryClient.setQueryData(['subscription', 'status', resolvedTenantId], bootstrapData.activeTenant.billingStatus);
      }

      const role = bootstrapData.tenantRole ?? null;
      const buildAccessCache = (
        items: Array<{ id: string; isDefault?: boolean }> = [],
        activeIdKey: string,
        defaultIdKey: string
      ) => {
        const validIds = new Set(items.map((item) => item.id).filter(Boolean));
        const defaultId = items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? null;
        const activeId = defaultId && validIds.has(defaultId) ? defaultId : null;
        return {
          items,
          canAccessAll: hasWorkspaceWideAccess(role),
          [activeIdKey]: activeId,
          [defaultIdKey]: defaultId,
        };
      };

      if (Array.isArray(bootstrapData.access?.shops)) {
        const shopAccess = buildAccessCache(bootstrapData.access.shops, 'activeShopId', 'defaultShopId');
        queryClient.setQueryData(['shops', 'access', resolvedTenantId], {
          shops: shopAccess.items,
          canAccessAll: shopAccess.canAccessAll,
          activeShopId: shopAccess.activeShopId,
          defaultShopId: shopAccess.defaultShopId,
        });
      }

      if (Array.isArray(bootstrapData.access?.studioLocations)) {
        const locationAccess = buildAccessCache(
          bootstrapData.access.studioLocations,
          'activeStudioLocationId',
          'defaultStudioLocationId'
        );
        queryClient.setQueryData(['studio-locations', 'access', resolvedTenantId], {
          locations: locationAccess.items,
          canAccessAll: locationAccess.canAccessAll,
          activeStudioLocationId: locationAccess.activeStudioLocationId,
          defaultStudioLocationId: locationAccess.defaultStudioLocationId,
        });
      }
    },
    [bootstrapDataFromResponse, getBootstrapMemberships, hasWorkspaceWideAccess, queryClient, resolveInitialTenant]
  );

  const refreshAuth = useCallback(async () => {
    if (!(await getCurrentNetworkOnline())) {
      logger.info('AuthContext', 'Skipping auth refresh while offline');
      return;
    }
    const preferredTenantId = activeTenantIdRef.current ?? (await authService.getActiveTenantId());
    const res = await authService.getBootstrap(preferredTenantId);
    const bootstrapData = bootstrapDataFromResponse(res);
    const userData = bootstrapData.user ?? null;
    const m = getBootstrapMemberships(bootstrapData);
    if (m.length > 0) {
      const token = await authService.getToken();
      const defaultTenantId =
        resolveInitialTenant(m as Membership[], preferredTenantId ?? bootstrapData.activeTenantId ?? bootstrapData.defaultTenantId ?? null);
      seedBootstrapQueryCache(bootstrapData, defaultTenantId);
      await authService.persistAuthPayload({
        user: userData ?? undefined,
        token: token ?? undefined,
        memberships: m,
        defaultTenantId,
      });
      setUser(sanitizeAuthUserForMobile(userData));
      setMemberships(m as Membership[]);
      if (defaultTenantId) await setActiveTenantId(defaultTenantId);
    }
  }, [bootstrapDataFromResponse, getBootstrapMemberships, resolveInitialTenant, seedBootstrapQueryCache, setActiveTenantId]);

  const refreshAuthRef = useRef(refreshAuth);
  refreshAuthRef.current = refreshAuth;

  /** Login/register return raw Tenant rows; bootstrap attaches effectiveFeatureFlags from the plan matrix. */
  const hydrateFeatureFlagsAfterAuth = useCallback(async () => {
    try {
      await refreshAuthRef.current();
    } catch (err) {
      logger.warn('AuthContext', '/auth/bootstrap feature-flag refresh failed', err);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setSessionSyncing(true);
    const res = await authService.login({ email, password });
    const payload = res?.data ?? res;
    const u = payload?.user ?? null;
    const m = normalizeMemberships(payload?.memberships ?? payload?.tenantMemberships ?? []) as Membership[];
    setUser(sanitizeAuthUserForMobile(u));
    setMemberships(m);
    const tid =
      payload?.defaultTenantId ??
      membershipTenantId(m.find((x) => x.isDefault)) ??
      membershipTenantId(m[0]) ??
      null;
    if (tid) await setActiveTenantId(tid);
    sessionExpiredHandledRef.current = false;
    await AsyncStorage.removeItem(AUTH_SESSION_MESSAGE_KEY);
    try {
      await hydrateFeatureFlagsAfterAuth();
    } finally {
      setSessionSyncing(false);
    }
  }, [setActiveTenantId, hydrateFeatureFlagsAfterAuth]);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setMemberships([]);
    setActiveTenantIdState(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(async ({ message }) => {
      if (sessionExpiredHandledRef.current) return;
      sessionExpiredHandledRef.current = true;
      await AsyncStorage.setItem(AUTH_SESSION_MESSAGE_KEY, message || 'Your session expired. Sign in again to continue.');
      await authService.logout();
      setUser(null);
      setMemberships([]);
      setActiveTenantIdState(null);
      queryClient.clear();
      router.replace('/login');
    });

    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  const tenantSignup = useCallback(
    async (payload: TenantSignupPayload) => {
      setSessionSyncing(true);
      const res = await authService.tenantSignup(payload);
      const data = res?.data ?? res;
      const u = data?.user ?? null;
      const m = normalizeMemberships(data?.memberships ?? data?.tenantMemberships ?? []) as Membership[];
      setUser(sanitizeAuthUserForMobile(u));
      setMemberships(m);
      const tid =
        data?.defaultTenantId ??
        membershipTenantId(m.find((x) => x.isDefault)) ??
        membershipTenantId(m[0]) ??
        null;
      if (tid) await setActiveTenantId(tid);
      sessionExpiredHandledRef.current = false;
      await AsyncStorage.removeItem(AUTH_SESSION_MESSAGE_KEY);
      try {
        await hydrateFeatureFlagsAfterAuth();
      } finally {
        setSessionSyncing(false);
      }
    },
    [setActiveTenantId, hydrateFeatureFlagsAfterAuth]
  );

  const googleAuth = useCallback(
    async (idToken: string, options?: GoogleAuthOptions) => {
      setSessionSyncing(true);
      const res = await authService.googleAuth(idToken, options ?? {});
      const data = res?.data ?? res;
      const u = data?.user ?? null;
      const m = normalizeMemberships(data?.memberships ?? data?.tenantMemberships ?? []) as Membership[];
      setUser(sanitizeAuthUserForMobile(u));
      setMemberships(m);
      const tid =
        data?.defaultTenantId ??
        membershipTenantId(m.find((x) => x.isDefault)) ??
        membershipTenantId(m[0]) ??
        null;
      if (tid) await setActiveTenantId(tid);
      sessionExpiredHandledRef.current = false;
      await AsyncStorage.removeItem(AUTH_SESSION_MESSAGE_KEY);
      try {
        await hydrateFeatureFlagsAfterAuth();
      } finally {
        setSessionSyncing(false);
      }
    },
    [setActiveTenantId, hydrateFeatureFlagsAfterAuth]
  );

  const featureFlagsHydrateForTenantRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    logger.info('AuthContext', 'Initializing auth state');

    (async () => {
      try {
        const storedUser = await authService.getStoredUser();
        const storedMemberships = normalizeMemberships(
          await authService.getStoredMemberships()
        ) as Membership[];
        const storedTenantId = await authService.getActiveTenantId();

        logger.info('AuthContext', 'Stored state:', {
          hasUser: !!storedUser,
          membershipsCount: storedMemberships?.length ?? 0,
          activeTenantId: storedTenantId ?? 'none',
        });

        if (mounted && storedUser) setUser(sanitizeAuthUserForMobile(storedUser));
        if (mounted && storedMemberships?.length) setMemberships(storedMemberships);

        // Resolve activeTenantId from stored data (prefer stored if valid, then default, then first)
        // Validate that storedTenantId exists in memberships before using it
        const isValidStoredTenant =
          storedTenantId &&
          storedMemberships?.some((m) => membershipTenantId(m) === storedTenantId);
        const preferredTenantId = isValidStoredTenant ? storedTenantId : null;
        const resolvedTenantId = resolveInitialTenant(storedMemberships ?? [], preferredTenantId);
        
        if (mounted && resolvedTenantId) {
          await authService.setActiveTenantId(resolvedTenantId);
          setActiveTenantIdState(resolvedTenantId);
          activeTenantIdRef.current = resolvedTenantId;
          logger.info('AuthContext', 'Resolved activeTenantId:', resolvedTenantId, {
            fromStored: isValidStoredTenant,
            fromDefault: !isValidStoredTenant && storedMemberships?.find((m: Membership) => m.isDefault)?.tenantId === resolvedTenantId,
            userEmail: storedUser?.email,
            businessType: storedMemberships?.find((m: Membership) => m.tenantId === resolvedTenantId)?.tenant?.businessType,
            fromFirst: !isValidStoredTenant && storedMemberships?.[0]?.tenantId === resolvedTenantId,
          });
        } else {
          logger.warn('AuthContext', 'No tenant ID resolved from stored data');
        }

        const activeMembershipForFlags =
          storedMemberships?.find((m) => membershipTenantId(m) === resolvedTenantId) ??
          storedMemberships?.[0];
        const eff0 = activeMembershipForFlags?.tenant?.effectiveFeatureFlags;
        const flagsHydrated =
          eff0 != null &&
          typeof eff0 === 'object' &&
          !Array.isArray(eff0) &&
          Object.keys(eff0).length > 0;
        const onboardingCompleteOnCache = isOnboardingComplete(activeMembershipForFlags?.tenant);
        if (storedUser && (!storedMemberships?.length || !flagsHydrated || !onboardingCompleteOnCache)) {
          logger.info('AuthContext', 'Refetching /auth/bootstrap (stale session: memberships, flags, or onboarding)');
          if (!(await getCurrentNetworkOnline())) {
            logger.info('AuthContext', 'Offline during init; using stored session until reconnect');
          } else {
            try {
              const res = await authService.getBootstrap(resolvedTenantId ?? storedTenantId ?? undefined);
              const bootstrapData = bootstrapDataFromResponse(res);
              const user = bootstrapData.user ?? null;
              const m = getBootstrapMemberships(bootstrapData) as Membership[];
              if (mounted && m.length) {
                const defaultTenantId =
                  resolveInitialTenant(m, resolvedTenantId ?? storedTenantId ?? bootstrapData.activeTenantId ?? null);
                seedBootstrapQueryCache(bootstrapData, defaultTenantId);
                if (user) setUser(sanitizeAuthUserForMobile(user));
                setMemberships(m);
                await authService.persistAuthPayload({
                  user: user ?? undefined,
                  memberships: m,
                  defaultTenantId,
                });
                if (defaultTenantId) await setActiveTenantIdRef.current(defaultTenantId);
                logger.info('AuthContext', 'Refetched bootstrap memberships:', m.length);
              }
            } catch (err) {
              logger.error('AuthContext', 'Failed to refetch /auth/bootstrap:', err);
            }
          }
        }
      } catch (err) {
        logger.error('AuthContext', 'Init error:', err);
      } finally {
        if (mounted) setLoading(false);
        logger.info('AuthContext', 'Init complete');
      }
    })();

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; use refs for setters
  }, []);

  /** Hydrate effectiveFeatureFlags when session has tenant but flags were never loaded (stale cache). */
  useEffect(() => {
    if (loading || !user || user.isPlatformAdmin || !activeTenantId) return;
    const m = memberships.find((x) => membershipTenantId(x) === activeTenantId);
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
    if (featureFlagsHydrateForTenantRef.current === activeTenantId) return;
    featureFlagsHydrateForTenantRef.current = activeTenantId;
    logger.info('AuthContext', 'Hydrating missing feature flags via /auth/bootstrap');
    refreshAuthRef.current().catch(() => {
      /* Keep ref set to avoid retry loop; user can reload app. */
    });
  }, [loading, user, activeTenantId, memberships]);

  const value: AuthContextType = {
    user,
    memberships,
    activeTenantId,
    activeTenant,
    loading,
    sessionSyncing,
    wasInvited,
    suppressAppGuidance,
    tenantRole,
    isDriver,
    isAdmin,
    isManager,
    hasFeature,
    login,
    logout,
    setActiveTenantId,
    tenantSignup,
    refreshAuth,
    googleAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
