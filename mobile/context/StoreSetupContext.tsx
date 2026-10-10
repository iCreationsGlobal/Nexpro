import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { productService } from '@/services/productService';
import { settingsService } from '@/services/settings';
import { storeService } from '@/services/storeService';
import { isPaymentCollectionConfigured } from '@/utils/paymentCollection';
import { parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import {
  buildOnlineStoreDefaultsFromTenant,
  firstFilled,
  normalizeStoreSlug,
  resolvePaymentMethodsForSetup,
  STORE_CURRENCY_GHS,
  STORE_PRIMARY_FALLBACK,
  STORE_TEMPLATE_CLASSIC,
  defaultDeliveryOptions,
  type OnlineStoreDefaults,
} from '@/utils/onlineStoreDefaults';
import { isStoreSetupBackgroundNoiseQuery } from '@/utils/storeSetupQueryGate';
import { buildLiveStoreEditPayload, canEditLiveStoreSettings } from '@/utils/storeSettingsEdit';
import {
  buildGapFlags,
  canVisitSetupStep,
  getLinearNextSetupStep,
  getPreviousSetupStep,
  setupStepHref,
  type SetupChecklist,
  type StoreSetupGapFlags,
  type StoreSetupStepId,
} from '@/utils/storeSetupFlow';

export type StoreSetupProduct = {
  id: string;
  name: string;
  sellingPrice?: number | string | null;
  imageUrl?: string | null;
  description?: string | null;
  isActive?: boolean;
};

type StoreSettings = Record<string, unknown> & {
  id?: string;
  displayName?: string;
  slug?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  contactEmail?: string | null;
  customDomain?: string | null;
  customDomainStatus?: string | null;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
};

type SaveSettingsOptions = {
  /** When true, wait for setup-status (go-live). Default: fire-and-forget. */
  awaitStatus?: boolean;
};

type SmartDefaultsOverrides = {
  displayName?: string;
  whatsappNumber?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  launch?: boolean;
  forcePaymentConfigured?: boolean;
};

type StoreSetupContextValue = {
  loading: boolean;
  productsLoading: boolean;
  error: string | null;
  defaults: OnlineStoreDefaults;
  organization: Record<string, unknown> | null;
  paymentCollection: unknown;
  paymentConfigured: boolean;
  settings: StoreSettings | null;
  checklist: SetupChecklist;
  products: StoreSetupProduct[];
  gapFlags: StoreSetupGapFlags;
  /** True once store name/settings exist — unlocks free nav to later steps. */
  hasBasics: boolean;
  refresh: () => Promise<void>;
  refreshSetupStatus: () => Promise<void>;
  ensureProductsLoaded: () => Promise<void>;
  patchLocalSettings: (partial: Partial<StoreSettings>) => void;
  setPaymentCollectionLocal: (value: unknown) => void;
  resolveAvailableSlug: (displayName: string) => Promise<string>;
  buildSmartDefaultsPayload: (overrides?: SmartDefaultsOverrides) => Promise<Record<string, unknown>>;
  saveSettings: (
    payload: Record<string, unknown>,
    options?: SaveSettingsOptions
  ) => Promise<StoreSettings | null>;
  /**
   * Soft steps: patch local state, advance immediately, persist in background.
   * Never blocks navigation on network.
   */
  persistSoftAndAdvance: (
    current: StoreSetupStepId,
    overrides?: SmartDefaultsOverrides,
    localPatch?: Partial<StoreSettings>
  ) => void;
  /** Continue — next step in full wizard order (no gap-skip). */
  advanceFrom: (current: StoreSetupStepId) => void;
  /** Back — previous step in full order (includes gap-skipped). */
  goBackFrom: (current: StoreSetupStepId) => void;
  /** Jump to any step when allowed (basics required after name). */
  goToStep: (step: StoreSetupStepId) => void;
  finishAndOpenStore: () => void;
  /**
   * Live store: save only the edited fields on top of the saved settings (never the first-run
   * defaults), waiting for the result so errors can be shown.
   */
  saveLiveEdit: (changes: Record<string, unknown>) => Promise<void>;
  /** Leave a live-store editor and return to where it was opened from. */
  closeEditor: () => void;
};

const StoreSetupContext = createContext<StoreSetupContextValue | null>(null);

function unwrapSetupStatus(response: unknown): {
  settings: StoreSettings | null;
  checklist: SetupChecklist;
} {
  const entity = parseApiEntity<{ settings?: StoreSettings | null; checklist?: SetupChecklist }>(response)
    || (response as { data?: { settings?: StoreSettings | null; checklist?: SetupChecklist } })?.data
    || (response as { settings?: StoreSettings | null; checklist?: SetupChecklist });
  return {
    settings: (entity?.settings as StoreSettings) || null,
    checklist: (entity?.checklist as SetupChecklist) || {},
  };
}

function unwrapProducts(response: unknown): StoreSetupProduct[] {
  if (!response || typeof response !== 'object') return [];
  const body = response as { products?: unknown; data?: unknown };
  if (Array.isArray(body.products)) return body.products as StoreSetupProduct[];
  if (body.data && typeof body.data === 'object') {
    const nested = body.data as { products?: unknown; data?: unknown };
    if (Array.isArray(nested.products)) return nested.products as StoreSetupProduct[];
    if (Array.isArray(nested.data)) return nested.data as StoreSetupProduct[];
  }
  return parseApiListResponse<StoreSetupProduct>(response);
}

function checklistAfterSave(
  prev: SetupChecklist,
  saved: StoreSettings | null,
  payload: Record<string, unknown>
): SetupChecklist {
  const contact =
    saved?.whatsappNumber
    || saved?.contactPhone
    || payload.whatsappNumber
    || payload.contactPhone;
  const launched = Boolean(payload.markSetupComplete) || Boolean(payload.enabled && prev.launched);
  return {
    ...prev,
    hasSettings: true,
    hasBasics: true,
    hasContact: Boolean(contact) || Boolean(prev.hasContact),
    hasFulfillment: prev.hasFulfillment !== false,
    canLaunch: launched ? true : prev.canLaunch,
    launched: launched || Boolean(prev.launched),
  };
}

/**
 * Prefetches org, payment collection, profile, and setup-status for the wizard.
 * Products load lazily (and deferred) so early steps stay snappy.
 */
export function StoreSetupProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenant, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Record<string, unknown> | null>(null);
  const [paymentCollection, setPaymentCollection] = useState<unknown>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [checklist, setChecklist] = useState<SetupChecklist>({});
  const [products, setProducts] = useState<StoreSetupProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const slugCacheRef = useRef<{ base: string; slug: string } | null>(null);
  const slugInflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const statusInflightRef = useRef<Promise<void> | null>(null);
  /** Serializes background PUTs so rapid step hops do not race. */
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const settingsRef = useRef<StoreSettings | null>(null);
  settingsRef.current = settings;

  // Cancel competing tab polls/refetches while the wizard owns the network.
  useEffect(() => {
    void queryClient.cancelQueries({
      predicate: (query) => isStoreSetupBackgroundNoiseQuery(query.queryKey),
    });
  }, [queryClient]);

  const refreshSetupStatus = useCallback(async () => {
    if (statusInflightRef.current) {
      await statusInflightRef.current;
      return;
    }
    const run = (async () => {
      try {
        const statusRes = await storeService.getSetupStatus();
        const { settings: nextSettings, checklist: nextChecklist } = unwrapSetupStatus(statusRes);
        if (nextSettings) setSettings(nextSettings);
        setChecklist(nextChecklist);
      } catch {
        // ignore soft status refresh errors
      } finally {
        statusInflightRef.current = null;
      }
    })();
    statusInflightRef.current = run;
    await run;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, paymentRes, statusRes, profileRes] = await Promise.all([
        settingsService.getOrganizationSettings().catch(() => null),
        settingsService.getPaymentCollectionSettings().catch(() => null),
        storeService.getSetupStatus().catch(() => null),
        settingsService.getProfile().catch(() => null),
      ]);

      const orgEntity =
        parseApiEntity<Record<string, unknown>>(orgRes)
        || (orgRes && typeof orgRes === 'object' && !Array.isArray(orgRes)
          ? (orgRes as Record<string, unknown>)
          : null);
      // Organization payload is flat `{ logoUrl, name, ... }` (GET /settings/organization).
      setOrganization(orgEntity);
      setPaymentCollection(paymentRes);

      const { settings: nextSettings, checklist: nextChecklist } = unwrapSetupStatus(statusRes);
      setSettings(nextSettings);
      setChecklist(nextChecklist);

      const profileEntity = parseApiEntity<Record<string, unknown>>(profileRes)
        || (profileRes as { data?: Record<string, unknown> })?.data
        || null;
      setProfile(profileEntity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load store setup.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureProductsLoaded = useCallback(async () => {
    if (productsLoaded) return;
    setProductsLoading(true);
    try {
      const productsRes = await productService.getProducts({ isActive: true, limit: 100 }).catch(() => null);
      setProducts(unwrapProducts(productsRes));
      setProductsLoaded(true);
    } finally {
      setProductsLoading(false);
    }
  }, [productsLoaded]);

  // Defer products so they do not compete with early step saves.
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      void ensureProductsLoaded();
    }, 1200);
    return () => clearTimeout(timer);
  }, [loading, ensureProductsLoaded]);

  const defaults = useMemo(
    () =>
      buildOnlineStoreDefaultsFromTenant(activeTenant, user, {
        organization,
        profile,
      }),
    [activeTenant, organization, profile, user]
  );

  const paymentConfigured = useMemo(
    () => isPaymentCollectionConfigured(paymentCollection),
    [paymentCollection]
  );

  const hasBasics = useMemo(
    () =>
      Boolean(
        checklist.hasBasics
        || checklist.hasSettings
        || settings?.id
        || settings?.slug
        || String(settings?.displayName || '').trim()
      ),
    [checklist.hasBasics, checklist.hasSettings, settings?.displayName, settings?.id, settings?.slug]
  );

  // Gap routing uses ABS/org defaults + live payment for contact/color
  // (first save writes fallback primaryColor that would incorrectly skip the color step).
  // Logo: skip when business already has one, or merchant uploaded during this session.
  const gapFlags = useMemo(
    () =>
      buildGapFlags({
        contactPhone: defaults.contactPhone,
        whatsappNumber: defaults.whatsappNumber,
        logoUrl: firstFilled(settings?.logoUrl, defaults.logoUrl),
        hasExplicitPrimaryColor: defaults.hasExplicitPrimaryColor,
        paymentConfigured,
      }),
    [defaults, paymentConfigured, settings?.logoUrl]
  );

  const resolveAvailableSlug = useCallback(async (displayName: string) => {
    const base = normalizeStoreSlug(displayName);
    if (slugCacheRef.current?.base === base) {
      return slugCacheRef.current.slug;
    }
    const inflight = slugInflightRef.current.get(base);
    if (inflight) return inflight;

    const promise = (async () => {
      let candidate = base;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const res = await storeService.checkSlugAvailability(candidate);
          const data = parseApiEntity<{ available?: boolean; slug?: string }>(res)
            || (res as { data?: { available?: boolean } })?.data
            || res;
          if ((data as { available?: boolean })?.available !== false) {
            slugCacheRef.current = { base, slug: candidate };
            return candidate;
          }
        } catch {
          slugCacheRef.current = { base, slug: candidate };
          return candidate;
        }
        candidate = `${base}-${attempt + 2}`.slice(0, 80);
      }
      const fallback = `${base}-${Date.now().toString(36)}`.slice(0, 80);
      slugCacheRef.current = { base, slug: fallback };
      return fallback;
    })();

    slugInflightRef.current.set(base, promise);
    try {
      return await promise;
    } finally {
      slugInflightRef.current.delete(base);
    }
  }, []);

  // Prefetch slug for the default store name so confirm-name Continue is not blocked.
  useEffect(() => {
    const name = String(defaults.displayName || '').trim();
    if (!name || settings?.slug) return;
    void resolveAvailableSlug(name);
  }, [defaults.displayName, resolveAvailableSlug, settings?.slug]);

  const buildSmartDefaultsPayload = useCallback(
    async (overrides: SmartDefaultsOverrides = {}) => {
      const live = settingsRef.current;
      const displayName = String(overrides.displayName || live?.displayName || defaults.displayName || 'My Store').trim();
      // Prefer existing slug, then warm cache — avoid serial availability loops on Continue.
      const slug = live?.slug
        ? String(live.slug)
        : await resolveAvailableSlug(displayName);

      const contactPhone =
        overrides.contactPhone !== undefined
          ? overrides.contactPhone
          : live?.contactPhone || defaults.contactPhone || null;
      let whatsappNumber =
        overrides.whatsappNumber !== undefined
          ? overrides.whatsappNumber
          : live?.whatsappNumber || defaults.whatsappNumber || null;
      if (!whatsappNumber && contactPhone) {
        whatsappNumber = contactPhone;
      }

      // Copy business logo into store settings when store logo is still empty.
      const logoUrl =
        overrides.logoUrl !== undefined
          ? overrides.logoUrl
          : firstFilled(live?.logoUrl, defaults.logoUrl) || null;
      const primaryColor =
        overrides.primaryColor !== undefined
          ? overrides.primaryColor
          : live?.primaryColor || defaults.primaryColor || STORE_PRIMARY_FALLBACK;

      const existingMeta = getPlainObject(live?.metadata);
      const paymentMethods = resolvePaymentMethodsForSetup(
        Boolean(overrides.forcePaymentConfigured) || paymentConfigured,
        getPlainObject(existingMeta.paymentMethods) as Record<
          string,
          { enabled?: boolean; configured?: boolean }
        >
      );

      // Omit heroSlides so the backend keeps existing slides (sending [] forces
      // expensive resolveHeroSlidesForStore on every soft save).
      return {
        displayName,
        slug,
        description: defaults.description || null,
        logoUrl: logoUrl || null,
        primaryColor,
        secondaryColor: null,
        tertiaryColor: null,
        templateId: STORE_TEMPLATE_CLASSIC,
        contactPhone: contactPhone || null,
        whatsappNumber: whatsappNumber || null,
        contactEmail: live?.contactEmail || defaults.contactEmail || null,
        pickupEnabled: true,
        deliveryEnabled: false,
        deliveryFee: 0,
        currency: STORE_CURRENCY_GHS,
        enabled: overrides.launch ? true : live?.enabled === true,
        markSetupComplete: Boolean(overrides.launch),
        metadata: {
          ...existingMeta,
          category: defaults.category || null,
          paymentMethods,
          deliveryOptions: {
            ...defaultDeliveryOptions,
            ...(getPlainObject(existingMeta.deliveryOptions) as object),
            pickup: { enabled: true, configured: true },
            localDelivery: { enabled: false, configured: false },
            nationwideDelivery: { enabled: false, configured: false },
          },
          pickupInstructions: defaults.pickupInstructions || null,
          templateChosen: true,
          heroAnimation: 'fade',
        },
      };
    },
    [defaults, paymentConfigured, resolveAvailableSlug]
  );

  /**
   * Persist settings. Checklist sync is non-blocking by default so Continue
   * is not stuck behind a second setup-status round trip.
   */
  const saveSettings = useCallback(
    async (payload: Record<string, unknown>, options?: SaveSettingsOptions) => {
      const response = await storeService.updateSettings(payload);
      const saved = parseApiEntity<StoreSettings>(response)
        || (response as { data?: StoreSettings })?.data
        || null;
      if (saved) {
        settingsRef.current = saved;
        setSettings(saved);
        if (saved.slug) {
          const base = normalizeStoreSlug(String(saved.displayName || payload.displayName || ''));
          slugCacheRef.current = { base, slug: String(saved.slug) };
        }
        setChecklist((prev) => checklistAfterSave(prev, saved, payload));
      } else {
        setChecklist((prev) => checklistAfterSave(prev, null, payload));
      }

      if (options?.awaitStatus) {
        await refreshSetupStatus();
      } else {
        void refreshSetupStatus();
      }
      return saved;
    },
    [refreshSetupStatus]
  );

  const queueSettingsSave = useCallback(
    (payload: Record<string, unknown>, options?: SaveSettingsOptions) => {
      const run = saveChainRef.current.then(
        () => saveSettings(payload, options),
        () => saveSettings(payload, options)
      );
      saveChainRef.current = run.catch(() => undefined);
      return run;
    },
    [saveSettings]
  );

  const patchLocalSettings = useCallback((partial: Partial<StoreSettings>) => {
    setSettings((prev) => ({ ...(prev || {}), ...partial }));
  }, []);

  const setPaymentCollectionLocal = useCallback((value: unknown) => {
    setPaymentCollection(value);
  }, []);

  const goToStep = useCallback(
    (step: StoreSetupStepId) => {
      if (!canVisitSetupStep(step, { hasBasics })) return;
      if (step === 'products' || step === 'go-live') {
        void ensureProductsLoaded();
      }
      router.replace(setupStepHref(step) as never);
    },
    [ensureProductsLoaded, hasBasics, router]
  );

  const goBackFrom = useCallback(
    (current: StoreSetupStepId) => {
      const prev = getPreviousSetupStep(current);
      if (!prev) {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/store' as never);
        }
        return;
      }
      router.replace(setupStepHref(prev) as never);
    },
    [router]
  );

  const advanceFrom = useCallback(
    (current: StoreSetupStepId) => {
      const next = getLinearNextSetupStep(current);
      if (!next) {
        router.replace('/(tabs)/store' as never);
        return;
      }
      if (next === 'products' || next === 'go-live') {
        void ensureProductsLoaded();
      }
      router.replace(setupStepHref(next) as never);
    },
    [ensureProductsLoaded, router]
  );

  /**
   * Navigate immediately; persist in a background save chain.
   * Used for contact / logo / color (and similar non-critical mid-flight fields).
   */
  const persistSoftAndAdvance = useCallback(
    (
      current: StoreSetupStepId,
      overrides: SmartDefaultsOverrides = {},
      localPatch?: Partial<StoreSettings>
    ) => {
      if (localPatch && Object.keys(localPatch).length) {
        const merged = { ...(settingsRef.current || {}), ...localPatch };
        settingsRef.current = merged;
        setSettings(merged);
        setChecklist((prev) => checklistAfterSave(prev, merged, localPatch as Record<string, unknown>));
      }
      advanceFrom(current);
      void (async () => {
        try {
          const payload = await buildSmartDefaultsPayload(overrides);
          await queueSettingsSave(payload);
        } catch {
          // Soft failure — go-live / later edits can retry.
        }
      })();
    },
    [advanceFrom, buildSmartDefaultsPayload, queueSettingsSave]
  );

  const finishAndOpenStore = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['store'] });
    router.replace('/(tabs)/store' as never);
  }, [queryClient, router]);

  const saveLiveEdit = useCallback(
    async (changes: Record<string, unknown>) => {
      const saved = settingsRef.current;
      if (!canEditLiveStoreSettings(saved)) {
        throw new Error('Your store settings are still loading. Try again in a moment.');
      }
      await queueSettingsSave(buildLiveStoreEditPayload(saved as Record<string, unknown>, changes));
    },
    [queueSettingsSave]
  );

  const closeEditor = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['store'] });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/store' as never);
    }
  }, [queryClient, router]);

  const value = useMemo<StoreSetupContextValue>(
    () => ({
      loading,
      productsLoading,
      error,
      defaults,
      organization,
      paymentCollection,
      paymentConfigured,
      settings,
      checklist,
      products,
      gapFlags,
      hasBasics,
      refresh,
      refreshSetupStatus,
      ensureProductsLoaded,
      patchLocalSettings,
      setPaymentCollectionLocal,
      resolveAvailableSlug,
      buildSmartDefaultsPayload,
      saveSettings,
      persistSoftAndAdvance,
      advanceFrom,
      goBackFrom,
      goToStep,
      finishAndOpenStore,
      saveLiveEdit,
      closeEditor,
    }),
    [
      advanceFrom,
      buildSmartDefaultsPayload,
      checklist,
      closeEditor,
      defaults,
      ensureProductsLoaded,
      error,
      finishAndOpenStore,
      gapFlags,
      goBackFrom,
      goToStep,
      hasBasics,
      loading,
      organization,
      patchLocalSettings,
      paymentCollection,
      paymentConfigured,
      persistSoftAndAdvance,
      products,
      productsLoading,
      refresh,
      refreshSetupStatus,
      resolveAvailableSlug,
      saveLiveEdit,
      saveSettings,
      setPaymentCollectionLocal,
      settings,
    ]
  );

  return <StoreSetupContext.Provider value={value}>{children}</StoreSetupContext.Provider>;
}

function getPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function useStoreSetup(): StoreSetupContextValue {
  const ctx = useContext(StoreSetupContext);
  if (!ctx) {
    throw new Error('useStoreSetup must be used within StoreSetupProvider');
  }
  return ctx;
}

/**
 * Setup steps double as editors once the store is live: opened with `?mode=edit` from the Store tab,
 * or reached any other way after launch, so a live store never gets the first-run defaults saved over it.
 */
export function useStoreSetupEditing(): boolean {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { checklist } = useStoreSetup();
  return mode === 'edit' || Boolean(checklist.launched);
}
