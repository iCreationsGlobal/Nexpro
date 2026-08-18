import { Link, router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { analytics } from '@/utils/analytics';

export default function CheckoutSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    analytics.track('order_paid', { orderId: id || '' });
  }, [id]);

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Payment confirmed</Text>
      <Text style={styles.message}>Your order is live. Track preparation and delivery in real time.</Text>
      <Link href={`/order/${id}`} asChild>
        <PrimaryButton label="Track active order" onPress={() => {}} />
      </Link>
      <Link href="/(tabs)/orders" asChild>
        <PrimaryButton label="All orders" onPress={() => router.push('/(tabs)/orders')} />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: BRAND.primary, textAlign: 'center' },
  message: { color: BRAND.muted, textAlign: 'center' },
});
