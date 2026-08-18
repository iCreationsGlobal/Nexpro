import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { PrimaryButton, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { marketplaceApi } from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';
import { refreshAfterOrderChange } from '@/utils/queryInvalidation';

export default function ServiceBookingPaystackScreen() {
  const queryClient = useQueryClient();
  const { url, reference, jobId } = useLocalSearchParams<{ url: string; reference: string; jobId: string }>();
  const verifiedRef = useRef(false);
  const lastReferenceRef = useRef(reference);

  const verifyMutation = useMutation({
    mutationFn: (nextReference: string) => marketplaceApi.verifyServicePaystack(nextReference),
    onSuccess: async () => {
      await refreshAfterOrderChange(queryClient);
      analytics.track('service_booking_paid', { jobId: jobId || '' });
      router.replace(`/service/booking/success/${jobId}`);
    },
    onError: (err: { message?: string }) => {
      verifiedRef.current = false;
      Alert.alert('Booking verification failed', err.message || 'We could not verify this service payment. Try again.');
    },
  });

  const onNavigationChange = (nav: WebViewNavigation) => {
    const target = nav.url || '';
    if (verifiedRef.current) return;
    if (target.includes('reference=') || target.includes('trxref=')) {
      const match = target.match(/[?&](?:reference|trxref)=([^&]+)/);
      const ref = match ? decodeURIComponent(match[1]) : reference;
      if (ref) {
        lastReferenceRef.current = ref;
        verifiedRef.current = true;
        verifyMutation.mutate(ref);
      }
    }
  };

  if (!url) {
    return (
      <Screen style={styles.center}>
        <Text>Missing payment URL</Text>
      </Screen>
    );
  }

  if (verifyMutation.isPending) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={BRAND.primary} size="large" />
        <Text style={styles.text}>Confirming booking payment...</Text>
      </Screen>
    );
  }

  if (verifyMutation.isError) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.text}>We could not confirm this booking payment automatically.</Text>
        <PrimaryButton
          label="Try verifying again"
          onPress={() => {
            verifiedRef.current = true;
            verifyMutation.mutate(lastReferenceRef.current || reference);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <WebView source={{ uri: url }} onNavigationStateChange={onNavigationChange} startInLoadingState />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  text: { color: BRAND.muted },
});
