import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorState, LoadingState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { BRAND } from '@/constants';
import { bookingsApi } from '@/services/ordersApi';
import { formatCurrency } from '@/utils/format';
import { buyerQueryKeys, QUERY_STALE } from '@/utils/queryInvalidation';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: buyerQueryKeys.serviceBooking(id),
    queryFn: () => bookingsApi.get(id),
    enabled: Boolean(id),
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading booking..." />
      </Screen>
    );
  }

  if (isError || !data?.data) {
    return (
      <Screen>
        <ErrorState message="Could not load this booking." onRetry={() => refetch()} />
      </Screen>
    );
  }

  const booking = data.data;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Service booking</Text>
      <Text style={styles.title}>{booking.serviceTitle || booking.title}</Text>
      <Text style={styles.number}>{booking.jobNumber}</Text>
      <Text style={styles.total}>{formatCurrency(booking.total, booking.currency)}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.row}>Booking: {booking.status}</Text>
        <Text style={styles.row}>Payment: {booking.paymentStatus || 'pending'}</Text>
      </View>

      {(booking.preferredDate || booking.preferredTime || booking.appointmentAt) ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Appointment</Text>
          {booking.preferredDate ? <Text style={styles.row}>Date: {booking.preferredDate}</Text> : null}
          {booking.preferredTime ? <Text style={styles.row}>Time: {booking.preferredTime}</Text> : null}
          {booking.appointmentAt ? <Text style={styles.row}>Scheduled: {String(booking.appointmentAt)}</Text> : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {booking.studioSlug ? (
          <SecondaryButton label="View studio" onPress={() => router.push(`/studio/${booking.studioSlug}`)} />
        ) : null}
        {booking.studioSlug && booking.serviceSlug ? (
          <PrimaryButton
            label="View service"
            onPress={() => router.push(`/service/${booking.studioSlug}/${booking.serviceSlug}`)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { color: BRAND.text, fontSize: 24, fontWeight: '900' },
  number: { color: BRAND.muted, fontWeight: '700' },
  total: { color: BRAND.primary, fontSize: 22, fontWeight: '900' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: BRAND.text, fontSize: 17, fontWeight: '800' },
  row: { color: BRAND.muted, lineHeight: 20 },
  actions: { gap: 10, marginTop: 8 },
});
