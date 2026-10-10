import { useSimpleMode } from '@/hooks/useSimpleMode';
import { isSimpleModePathAllowed } from '@/constants/simpleMode';
import { SimpleModePinGate } from '@/components/simple/SimpleModePinGate';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router/react-navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, usePathname, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, AppState, AppStateStatus, Pressable, Text, TextInput, View } from 'react-native';
import 'react-native-reanimated';
import { offlineQueueService } from '@/services/offlineQueueService';
import { refreshAfterSale } from '@/utils/queryInvalidation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useStartupData } from '@/hooks/useStartupData';
import { isStartupDestinationReady } from '@/utils/startupReadiness';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ShopProvider } from '@/context/ShopContext';
import { StudioLocationProvider } from '@/context/StudioLocationContext';
import { CartProvider } from '@/context/CartContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { FontFamily } from '@/constants/typography';
import { getCurrentNetworkOnline, registerReactQueryOnlineManager } from '@/utils/connectivity';
import { observeSellerNotificationResponses, registerPushNotifications } from '@/utils/pushNotifications';
import { logger } from '@/utils/logger';
import { Observe, ObserveRoot, type ObserveErrorBoundaryFallbackProps } from '@/utils/observe';
import { markStartupComplete } from '@/hooks/useMarkInteractiveAfterStartup';
import { useBillingLock } from '@/hooks/useBillingLock';
import { BillingLockedScreen } from '@/components/BillingLockedScreen';
import { isBillingExemptPath } from '@/utils/billingLock';

// EAS Observe: must run before any screen mounts; one call holds every option.
// Personal free-text route params are kept out of exported navigation metrics.
Observe.configure({
  integrations: {
    'expo-router': { filteredParams: ['email', 'customerName', 'prompt', 'search'] },
  },
});

type RouteErrorBoundaryProps = {
  error: Error;
  retry: () => Promise<void> | void;
};

/**
 * Local boundary — do not re-export from `expo-router`. That import is circular
 * (`expo-router` loads this layout before `ErrorBoundary` exists) and crashes
 * Profile / other lazy stack screens with: Cannot read property 'ErrorBoundary' of undefined.
 */
export function ErrorBoundary({ error, retry }: RouteErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>Something went wrong</Text>
      <Text style={{ color: '#fff', fontSize: 16, marginTop: 8 }}>
        {error?.message || 'Unknown error'}
      </Text>
      <Pressable
        onPress={() => {
          void retry();
        }}
        style={{
          marginTop: 24,
          borderWidth: 2,
          borderColor: '#fff',
          paddingVertical: 12,
          paddingHorizontal: 24,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

/** App-wide render-error fallback; Observe records the error with its component stack. */
function RootErrorFallback({ error, resetError }: ObserveErrorBoundaryFallbackProps) {
  return <ErrorBoundary error={error as Error} retry={resetError} />;
}

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

/** Apply Inter as the default UI typeface app-wide. */
function applyDefaultTypography() {
  const TextAny = Text as typeof Text & { defaultProps?: { style?: object } };
  const InputAny = TextInput as typeof TextInput & { defaultProps?: { style?: object } };
  TextAny.defaultProps = TextAny.defaultProps ?? {};
  InputAny.defaultProps = InputAny.defaultProps ?? {};
  TextAny.defaultProps.style = [{ fontFamily: FontFamily.regular }, TextAny.defaultProps.style];
  InputAny.defaultProps.style = [{ fontFamily: FontFamily.regular }, InputAny.defaultProps.style];
}
// Configure QueryClient with optimized defaults for mobile
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale window; transactional screens override with QUERY_STALE
      staleTime: 60 * 1000,
      // Keep cached data for 24 hours (allows offline access)
      gcTime: 24 * 60 * 60 * 1000, // 24 hours (formerly cacheTime)
      // Avoid retry churn while the device is known offline.
      retry: (failureCount) => onlineManager.isOnline() && failureCount < 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus (disabled for mobile - battery optimization)
      refetchOnWindowFocus: false,
      // Refetch on reconnect (enabled - good for mobile)
      refetchOnReconnect: true,
      // Refetch stale queries when returning to a screen (pairs with mutation invalidation)
      refetchOnMount: true,
      networkMode: 'online',
    },
    mutations: {
      retry: (failureCount) => onlineManager.isOnline() && failureCount < 1,
      retryDelay: 1000,
    },
  },
});

registerReactQueryOnlineManager();

// Create AsyncStorage persister for offline cache
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Only persist successful queries
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  // Throttle persistence to avoid excessive writes
  throttleTime: 1000,
});

function OfflineSyncOnActive() {
  const queryClient = useQueryClient();
  const { isDriver } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (isDriver) return;
      if (appState.current === 'background' && nextState === 'active') {
        if (!(await getCurrentNetworkOnline())) {
          appState.current = nextState;
          return;
        }
        offlineQueueService
          .syncPendingSales()
          .then(({ synced }) => {
            if (synced > 0) return refreshAfterSale(queryClient);
          })
          .catch(() => {});
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [queryClient, isDriver]);
  return null;
}

function PushRegistrationOnActive() {
  const { activeTenantId, user } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!user || !activeTenantId) return;
    registerPushNotifications({ prompt: false }).catch(() => {});
  }, [activeTenantId, user]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (!user || !activeTenantId) {
        appState.current = nextState;
        return;
      }
      if (appState.current === 'background' && nextState === 'active') {
        registerPushNotifications({ prompt: false }).catch(() => {});
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [activeTenantId, user]);

  return null;
}

export default function ObservedRootLayout() {
  return (
    <ObserveRoot errorBoundaryFallback={RootErrorFallback}>
      <RootLayout />
    </ObserveRoot>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      applyDefaultTypography();
      logger.info('RootLayout', 'Fonts loaded');
    }
  }, [loaded]);


  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        // Only persist queries that are marked as persistent
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        // Bust caches that may include multi-MB product image data URLs (Products OOM).
        buster: 'abs-rq-v3-no-inline-api-images',
        // Dehydrate options - only persist successful queries
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Don't persist auth/profile (avatars) or products (image payloads).
            const keyParts = Array.isArray(query.queryKey) ? query.queryKey : [];
            const keyText = keyParts.map((part) => String(part ?? '')).join(':');
            if (query.state.status !== 'success') return false;
            if (!keyText) return false;
            if (/(^|:)(auth|login|register|profile|products)(:|$)/i.test(keyText)) return false;
            return true;
          },
        },
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <ShopProvider>
            <StudioLocationProvider>
              <CartProvider>
                <OfflineSyncOnActive />
                <PushRegistrationOnActive />
                {loaded && <RootLayoutNav />}
                <StartupOverlay fontsReady={loaded} />
              </CartProvider>
            </StudioLocationProvider>
          </ShopProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

/** One overlay per cold launch; providers restore the session underneath it. */
function StartupOverlay({ fontsReady }: { fontsReady: boolean }) {
  const { loading, sessionSyncing, user } = useAuth();
  const { isSimple } = useSimpleMode();
  const pinGateActive = Boolean(user) && isSimple;
  const segments = useSegments();
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const destinationReady = isStartupDestinationReady(fontsReady, loading, sessionSyncing, segments, pinGateActive);
  // The PIN gate must be visible before it can unlock and mount the dashboard.
  const dashboard = !pinGateActive && segments[0] === '(tabs)' && (!segments[1] || String(segments[1]) === 'index');
  const startupData = useStartupData(destinationReady, dashboard, visible);
  // A locked workspace's dashboard can never load; the billing lock screen takes over instead.
  const { locked: billingLocked } = useBillingLock();
  const ready = destinationReady && (startupData.ready || billingLocked);
  useEffect(() => {
    if (!ready || !visible) return;
    // Startup must not depend on a native animation completion callback.
    setVisible(false);
    markStartupComplete();
  }, [ready, visible, opacity]);
  useEffect(() => {
    if (!visible) return;
    logger.debug('StartupOverlay', 'Readiness', {
      fontsReady, loading, sessionSyncing, pinGateActive,
      route: segments.join('/'), destinationReady, dataReady: startupData.ready,
    });
  }, [visible, fontsReady, loading, sessionSyncing, pinGateActive, segments, destinationReady, startupData.ready]);
  if (!visible || ready) return null;
  return <Animated.View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 100, opacity }]}>
    <AppLoadingScreen animate onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }} />
    {dashboard && startupData.needsRetry && (
      <View style={{ position: 'absolute', bottom: 48, left: 24, right: 24, padding: 16, borderRadius: 16, backgroundColor: '#00291f', alignItems: 'center' }}>
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 8 }}>Your dashboard isn’t ready yet. Check your connection and try again.</Text>
        <Pressable accessibilityRole="button" onPress={startupData.retry} style={{ padding: 12 }}>
          <Text style={{ color: '#b5ed00', fontWeight: '700' }}>Retry loading</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={startupData.continueWithoutData} style={{ padding: 12 }}>
          <Text style={{ color: '#fff' }}>Open app anyway</Text>
        </Pressable>
      </View>
    )}
  </Animated.View>;
}

/** PIN lock over the whole app for Simple Mode members; everyone else passes straight through. */
function SimpleModeGateWrapper({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <SimpleModePinGate>{children}</SimpleModePinGate> : <>{children}</>;
}

function RootLayoutNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDriver, user } = useAuth();
  const { isSimple, isRestricted, config: simpleModeConfig } = useSimpleMode();
  const billingLock = useBillingLock();
  const showBillingLock = billingLock.locked && !isBillingExemptPath(pathname);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const headerTint = Colors[resolvedTheme ?? 'light'].tint;

  const innerScreenOptions = {
    headerShown: true,
    headerBackTitle: 'Back',
    headerBackVisible: true,
    headerTintColor: headerTint,
    headerStyle: {
      backgroundColor: isDark ? '#0f0f0f' : '#fff',
    },
    headerTitleStyle: {
      color: isDark ? '#fff' : '#000',
    },
  };

  useEffect(() => {
    if (!user || !isDriver) return;
    const allowed =
      pathname === '/' ||
      pathname === '/index' ||
      pathname === '/account' ||
      pathname === '/profile' ||
      pathname === '/settings' ||
      pathname === '/(tabs)' ||
      pathname === '/deliveries' ||
      pathname === '/more' ||
      pathname.endsWith('/deliveries') ||
      pathname.endsWith('/more');
    if (!allowed) {
      router.replace('/(tabs)/deliveries');
    }
  }, [isDriver, pathname, router, user]);

  // Simple Mode: the normal app with a trimmed set of screens. Anything outside that set
  // (deep link, back button, stale nav state) goes to Home until the member turns on
  // "Show advanced features" in Settings.
  useEffect(() => {
    if (!user || !isRestricted) return;
    if (isSimpleModePathAllowed(simpleModeConfig, pathname)) return;
    router.replace('/(tabs)');
  }, [isRestricted, pathname, router, simpleModeConfig, user]);

  useEffect(() => observeSellerNotificationResponses((route) => router.push(route as never)), [router]);

  return (
    <NavigationThemeProvider value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fff' }}>
        <ConnectivityBanner />
        <SimpleModeGateWrapper enabled={isSimple}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="intro" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="simple" />
          <Stack.Screen name="account" options={{ ...innerScreenOptions, title: 'Account', headerShown: false }} />
          <Stack.Screen name="profile" options={{ ...innerScreenOptions, title: 'Profile', headerShown: false }} />
          <Stack.Screen name="settings" options={{ ...innerScreenOptions, title: 'Settings', headerShown: false }} />
          <Stack.Screen name="terms" options={{ ...innerScreenOptions, title: 'Terms and Conditions', headerShown: false }} />
          <Stack.Screen name="privacy-policy" options={{ ...innerScreenOptions, title: 'Privacy Policy', headerShown: false }} />
          <Stack.Screen name="data-deletion" options={{ ...innerScreenOptions, title: 'Data Deletion', headerShown: false }} />
          <Stack.Screen name="notifications" options={{ ...innerScreenOptions, title: 'Notifications', headerShown: false }} />
          <Stack.Screen name="notification-settings" options={{ ...innerScreenOptions, title: 'Notification settings', headerShown: false }} />
          <Stack.Screen name="focus-areas" options={{ ...innerScreenOptions, title: 'What matters most to you', headerShown: false }} />
          <Stack.Screen name="store-order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="store-setup" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        </SimpleModeGateWrapper>
        {showBillingLock && (
          <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 50 }]}>
            <BillingLockedScreen
              billing={billingLock.billing}
              onRecheck={() => { void billingLock.recheck(); }}
              rechecking={billingLock.rechecking}
            />
          </View>
        )}
      </View>
    </NavigationThemeProvider>
  );
}
