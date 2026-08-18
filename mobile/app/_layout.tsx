import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Pressable, Text, TextInput, View } from 'react-native';
import 'react-native-reanimated';
import { offlineQueueService } from '@/services/offlineQueueService';
import { refreshAfterSale } from '@/utils/queryInvalidation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

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

export default function RootLayout() {
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
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

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
                <RootLayoutNav />
              </CartProvider>
            </StudioLocationProvider>
          </ShopProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDriver, user } = useAuth();
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
      pathname === '/(tabs)' ||
      pathname === '/deliveries' ||
      pathname === '/more' ||
      pathname.endsWith('/deliveries') ||
      pathname.endsWith('/more');
    if (!allowed) {
      router.replace('/(tabs)/deliveries');
    }
  }, [isDriver, pathname, router, user]);

  useEffect(() => observeSellerNotificationResponses((route) => router.push(route as never)), [router]);

  return (
    <NavigationThemeProvider value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#fff' }}>
        <ConnectivityBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="intro" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" options={{ ...innerScreenOptions, title: 'Account', headerShown: false }} />
          <Stack.Screen name="profile" options={{ ...innerScreenOptions, title: 'Profile', headerShown: false }} />
          <Stack.Screen name="settings" options={{ ...innerScreenOptions, title: 'Settings', headerShown: false }} />
          <Stack.Screen name="terms" options={{ ...innerScreenOptions, title: 'Terms and Conditions', headerShown: false }} />
          <Stack.Screen name="privacy-policy" options={{ ...innerScreenOptions, title: 'Privacy Policy', headerShown: false }} />
          <Stack.Screen name="data-deletion" options={{ ...innerScreenOptions, title: 'Data Deletion', headerShown: false }} />
          <Stack.Screen name="notifications" options={{ ...innerScreenOptions, title: 'Notifications', headerShown: false }} />
          <Stack.Screen name="store-order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="store-setup" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
    </NavigationThemeProvider>
  );
}
