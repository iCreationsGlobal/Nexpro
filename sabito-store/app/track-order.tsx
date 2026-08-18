import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { ordersApi } from '@/services/ordersApi';

export default function TrackOrderScreen() {
  const [reference, setReference] = useState('');
  const [contact, setContact] = useState('');

  const mutation = useMutation({
    mutationFn: () => ordersApi.track(reference.trim(), contact.trim()),
    onSuccess: (res) => {
      const order = res?.data as { saleNumber?: string; orderStatus?: string };
      Alert.alert('Order found', `${order?.saleNumber || 'Order'} — ${order?.orderStatus || 'status unknown'}`);
    },
    onError: (err: { message?: string }) => Alert.alert('Not found', err.message || 'Check reference and contact'),
  });

  return (
    <Screen style={styles.container}>
      <Text style={styles.help}>Enter your order reference and the email or phone used at checkout.</Text>
      <TextInput style={styles.input} placeholder="Order reference" value={reference} onChangeText={setReference} />
      <TextInput style={styles.input} placeholder="Email or phone" value={contact} onChangeText={setContact} />
      <PrimaryButton label="Track order" onPress={() => mutation.mutate()} loading={mutation.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  help: { color: BRAND.muted, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
});
