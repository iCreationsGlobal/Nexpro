import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ErrorState, LoadingState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { BRAND } from '@/constants';
import { ordersApi, reviewsApi } from '@/services/ordersApi';
import { formatCurrency } from '@/utils/format';
import { buyerQueryKeys, QUERY_STALE, refreshAfterOrderChange } from '@/utils/queryInvalidation';

const ACTIVE_STATUSES = new Set(['pending', 'paid', 'processing', 'ready', 'packed', 'out_for_delivery']);

export default function OrderDetailScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [disputeMessage, setDisputeMessage] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');

  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: buyerQueryKeys.order(id),
    queryFn: () => ordersApi.get(id),
    enabled: Boolean(id),
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });

  useFocusEffect(
    useCallback(() => {
      const order = data?.data as { orderStatus?: string; status?: string } | undefined;
      const status = String(order?.orderStatus || order?.status || '').toLowerCase();
      if (!ACTIVE_STATUSES.has(status)) return undefined;
      const timer = setInterval(() => refetch(), 15000);
      return () => clearInterval(timer);
    }, [data?.data, refetch]),
  );

  const confirmMutation = useMutation({
    mutationFn: () => ordersApi.confirmReceived(id),
    onSuccess: async () => {
      Alert.alert('Confirmed', 'Thanks for confirming delivery.');
      await refreshAfterOrderChange(queryClient);
    },
  });

  const disputeMutation = useMutation({
    mutationFn: () => ordersApi.openDispute(id, { reason: 'issue', message: disputeMessage }),
    onSuccess: async () => {
      Alert.alert('Issue reported', 'Our team will review your case.');
      await refreshAfterOrderChange(queryClient);
    },
  });

  const contactMutation = useMutation({
    mutationFn: () => ordersApi.contactSeller(id, { message: disputeMessage || 'I need help with my order.' }),
    onSuccess: () => Alert.alert('Message sent', 'The seller has been notified.'),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const order = data?.data as { items?: Array<{ metadata?: { onlineListingId?: string } }> };
      const listingId = order?.items?.[0]?.metadata?.onlineListingId;
      if (!listingId) throw new Error('No reviewable product on this order.');
      const eligibility = await reviewsApi.getProductEligibility(listingId);
      if (eligibility.data?.eligible === false) {
        throw new Error(String(eligibility.data.reason || 'This order is not reviewable yet.'));
      }
      return reviewsApi.submitProductReview(listingId, {
        rating: reviewRating,
        comment: reviewBody,
        saleId: String(eligibility.data?.saleId || id || ''),
      });
    },
    onSuccess: () => Alert.alert('Review submitted'),
  });

  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading order..." />
      </Screen>
    );
  }

  if (isError || !data?.data) {
    return (
      <Screen>
        <ErrorState message="Could not load this order." onRetry={() => refetch()} />
      </Screen>
    );
  }

  const order = data.data as Record<string, unknown>;
  const status = String(order.orderStatus || order.status || '').toLowerCase();
  const isActive = ACTIVE_STATUSES.has(status);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{isActive ? 'Active order' : 'Order details'}</Text>
      <Text style={styles.number}>{String(order.saleNumber || '')}</Text>
      <Text style={styles.total}>{formatCurrency(Number(order.total || 0), String(order.currency || 'GHS'))}</Text>
      <Text style={styles.status}>Status: {String(order.orderStatus || order.status || 'pending')}</Text>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Tracking</Text>
        <OrderTimeline
          timeline={(order.deliveryTimeline as Array<{ label?: string; status?: string; at?: string }>) || []}
          orderStatus={String(order.orderStatus || order.status || '')}
        />
      </View>

      {order.canConfirmReceived ? (
        <PrimaryButton label="Confirm received" onPress={() => confirmMutation.mutate()} loading={confirmMutation.isPending} />
      ) : null}

      <SecondaryButton label="Contact seller" onPress={() => contactMutation.mutate()} />

      {!order.dispute ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Report an issue</Text>
          <TextInput
            style={styles.input}
            placeholder="Describe the issue (min 10 characters)"
            value={disputeMessage}
            onChangeText={setDisputeMessage}
            multiline
          />
          <SecondaryButton label="Open dispute" onPress={() => disputeMutation.mutate()} />
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Leave a review</Text>
        <TextInput
          style={styles.input}
          placeholder="Rating 1-5"
          keyboardType="number-pad"
          value={String(reviewRating)}
          onChangeText={(v) => setReviewRating(Number(v) || 5)}
        />
        <TextInput style={styles.input} placeholder="Your review" value={reviewBody} onChangeText={setReviewBody} multiline />
        <SecondaryButton label="Submit review" onPress={() => reviewMutation.mutate()} />
      </View>

      <SecondaryButton label="Back to orders" onPress={() => router.push('/(tabs)/orders')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  number: { fontSize: 20, fontWeight: '800', color: BRAND.text },
  total: { fontSize: 18, fontWeight: '700', color: BRAND.primary },
  status: { color: BRAND.muted, textTransform: 'capitalize' },
  block: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BRAND.border, gap: 8 },
  blockTitle: { fontWeight: '700', fontSize: 16, color: BRAND.text },
  input: {
    backgroundColor: BRAND.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    minHeight: 44,
  },
});
