import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { EmptyState, ErrorState, ListSkeleton, PrimaryButton, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND, STORAGE_KEYS } from '@/constants';
import { bookingsApi, ordersApi, type OrderSummary, type ServiceBookingSummary } from '@/services/ordersApi';
import { formatCurrency } from '@/utils/format';
import { buyerQueryKeys, QUERY_STALE } from '@/utils/queryInvalidation';

type ActivityItem =
  | { type: 'order'; id: string; createdAt: string; order: OrderSummary }
  | { type: 'booking'; id: string; createdAt: string; booking: ServiceBookingSummary };

export default function OrdersScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const signInToOrders = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.authReturnTo, '/(tabs)/orders');
    router.push('/login');
  };

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: buyerQueryKeys.orders,
    queryFn: () => ordersApi.list({ limit: 30 }),
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });

  const bookingsQuery = useQuery({
    queryKey: buyerQueryKeys.serviceBookings,
    queryFn: () => bookingsApi.list({ limit: 30 }),
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });

  if (authLoading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={BRAND.primary} />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen style={styles.center}>
        <EmptyState title="Sign in to view orders" />
        <PrimaryButton label="Sign in" onPress={signInToOrders} />
        <Link href="/track-order" asChild>
          <Pressable style={styles.trackLink}>
            <Text style={styles.trackText}>Track as guest</Text>
          </Pressable>
        </Link>
      </Screen>
    );
  }

  const orders = (data?.data?.orders as OrderSummary[]) || [];
  const bookings = (bookingsQuery.data?.data?.bookings as ServiceBookingSummary[]) || [];
  const activity: ActivityItem[] = [
    ...orders.map((order) => ({ type: 'order' as const, id: `order-${order.id}`, createdAt: order.createdAt, order })),
    ...bookings.map((booking) => ({ type: 'booking' as const, id: `booking-${booking.id}`, createdAt: booking.createdAt, booking })),
  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const refreshAll = () => {
    refetch();
    bookingsQuery.refetch();
  };

  const loadError = (error as { message?: string } | null)?.message
    || (bookingsQuery.error as { message?: string } | null)?.message
    || 'Could not load your orders and bookings.';

  return (
    <Screen>
      <FlatList
        data={activity}
        keyExtractor={(item) => item.id}
        refreshing={isRefetching || bookingsQuery.isRefetching}
        onRefresh={refreshAll}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading || bookingsQuery.isLoading ? (
            <ListSkeleton rows={5} label="Loading orders and bookings" />
          ) : isError || bookingsQuery.isError ? (
            <ErrorState
              title="Could not load activity"
              message={loadError}
              onRetry={refreshAll}
            />
          ) : (
            <EmptyState
              title="No orders or bookings yet"
              message="Your product purchases and service bookings will appear here after checkout."
              actionLabel="Browse products"
              onAction={() => router.push('/(tabs)/store')}
            />
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'booking') {
            const booking = item.booking;
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/booking/${booking.id}`)}
              >
                <Text style={styles.badge}>Service booking</Text>
                <Text style={styles.number}>{booking.jobNumber}</Text>
                <Text style={styles.store}>{booking.serviceTitle || booking.title}</Text>
                <Text style={styles.total}>{formatCurrency(booking.total, booking.currency)}</Text>
                <Text style={styles.status}>{booking.paymentStatus || booking.status}</Text>
              </Pressable>
            );
          }
          const order = item.order;
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/order/${order.id}`)}>
              <Text style={styles.badge}>Product order</Text>
              <Text style={styles.number}>{order.saleNumber}</Text>
              <Text style={styles.store}>{order.storeName}</Text>
              <Text style={styles.total}>{formatCurrency(order.total, order.currency)}</Text>
              <Text style={styles.status}>{order.orderStatus || order.status}</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  number: { fontWeight: '800', color: BRAND.text },
  badge: { alignSelf: 'flex-start', color: BRAND.primary, fontWeight: '800', fontSize: 12, marginBottom: 6 },
  store: { marginTop: 4, color: BRAND.muted },
  total: { marginTop: 8, fontWeight: '700', color: BRAND.primary },
  status: { marginTop: 4, textTransform: 'capitalize', color: BRAND.text },
  trackLink: { marginTop: 12, alignItems: 'center' },
  trackText: { color: BRAND.primary, fontWeight: '600' },
});
