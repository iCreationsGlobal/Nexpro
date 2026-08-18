import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { BRAND } from '@/constants';
import { registerReactQueryOnlineManager } from '@/utils/connectivity';
import { observeBuyerNotificationResponses, registerPushNotifications } from '@/utils/pushNotifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount) => onlineManager.isOnline() && failureCount < 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: {
      retry: (failureCount) => onlineManager.isOnline() && failureCount < 1,
      retryDelay: 1000,
    },
  },
});

registerReactQueryOnlineManager();

function PushRegistrationSync() {
  const { isAuthenticated } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!isAuthenticated) return;
    registerPushNotifications({ prompt: false }).catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (isAuthenticated && appState.current.match(/inactive|background/) && nextState === 'active') {
        registerPushNotifications({ prompt: false }).catch(() => undefined);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  return null;
}

function NotificationTapRouter() {
  const router = useRouter();

  useEffect(() => observeBuyerNotificationResponses((route) => router.push(route)), [router]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <View style={{ flex: 1, backgroundColor: BRAND.background }}>
            <StatusBar style="dark" />
            <ConnectivityBanner />
            <PushRegistrationSync />
            <NotificationTapRouter />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: '#fff' },
                headerTintColor: BRAND.primary,
                headerTitleStyle: { fontWeight: '700' },
                contentStyle: { backgroundColor: BRAND.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/address" options={{ title: 'Delivery setup' }} />
              <Stack.Screen name="search" options={{ title: 'Search' }} />
              <Stack.Screen name="cart" options={{ title: 'Cart' }} />
              <Stack.Screen name="account" options={{ title: 'Account' }} />
              <Stack.Screen name="login" options={{ title: 'Sign in' }} />
              <Stack.Screen name="signup" options={{ title: 'Create account' }} />
              <Stack.Screen name="signup-password" options={{ title: 'Password setup' }} />
              <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
              <Stack.Screen name="store/[slug]" options={{ title: 'Store' }} />
              <Stack.Screen name="studio/[slug]" options={{ title: 'Studio' }} />
              <Stack.Screen name="service/[studioSlug]/[serviceSlug]" options={{ title: 'Service' }} />
              <Stack.Screen name="service/booking/paystack" options={{ title: 'Service payment', presentation: 'modal' }} />
              <Stack.Screen name="service/booking/success/[id]" options={{ title: 'Booking confirmed', headerBackVisible: false }} />
              <Stack.Screen name="checkout/index" options={{ title: 'Checkout' }} />
              <Stack.Screen name="checkout/paystack" options={{ title: 'Payment', presentation: 'modal' }} />
              <Stack.Screen name="checkout/success/[id]" options={{ title: 'Order placed', headerBackVisible: false }} />
              <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
              <Stack.Screen name="booking/[id]" options={{ title: 'Booking details' }} />
              <Stack.Screen name="track-order" options={{ title: 'Track order' }} />
              <Stack.Screen name="wishlist" options={{ title: 'Wishlist' }} />
              <Stack.Screen name="addresses" options={{ title: 'Addresses' }} />
              <Stack.Screen name="profile" options={{ title: 'Profile' }} />
              <Stack.Screen name="verify-email" options={{ title: 'Verify email' }} />
              <Stack.Screen name="disputes" options={{ title: 'Issues' }} />
              <Stack.Screen name="notifications-settings" options={{ title: 'Notifications' }} />
            </Stack>
          </View>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
