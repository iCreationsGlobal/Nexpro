import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { BRAND } from '@/constants';

export default function ServiceBookingSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Booking confirmed</Text>
        <Text style={styles.message}>
          Your service payment was received. The provider will follow up about your booking.
        </Text>
        {id ? <Text style={styles.ref}>Booking reference: {id}</Text> : null}
      </View>
      <PrimaryButton label="View orders" onPress={() => router.replace('/(tabs)/orders')} />
      <SecondaryButton label="Browse more services" onPress={() => router.replace('/(tabs)/services')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 8,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '900', color: BRAND.text },
  message: { color: BRAND.muted, lineHeight: 22 },
  ref: { color: BRAND.primary, fontWeight: '700' },
});
