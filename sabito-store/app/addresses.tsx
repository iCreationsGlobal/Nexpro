import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen } from '@/components/ui';
import { BRAND, GHANA_REGIONS } from '@/constants';
import { addressesApi, type DeliveryAddress } from '@/services/ordersApi';
import { buyerQueryKeys, QUERY_STALE, refreshAfterAddressChange } from '@/utils/queryInvalidation';

export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: buyerQueryKeys.addresses,
    queryFn: () => addressesApi.list(),
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });
  const addresses = (data?.data as DeliveryAddress[]) || [];
  const [form, setForm] = useState<Partial<DeliveryAddress>>({ region: GHANA_REGIONS[0] });

  const createMutation = useMutation({
    mutationFn: () =>
      addressesApi.create({
        recipientName: form.recipientName || '',
        phone: form.phone || '',
        line1: form.line1 || '',
        city: form.city || '',
        region: form.region || GHANA_REGIONS[0],
        label: form.label,
      }),
    onSuccess: () => {
      Alert.alert('Address saved');
      setForm({ region: GHANA_REGIONS[0] });
      refreshAfterAddressChange(queryClient);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => addressesApi.setDefault(id),
    onSuccess: () => refreshAfterAddressChange(queryClient),
  });

  return (
    <Screen>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id || item.line1}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add address</Text>
            {(['label', 'recipientName', 'phone', 'line1', 'city'] as const).map((key) => (
              <TextInput
                key={key}
                style={styles.input}
                placeholder={key}
                value={String(form[key] || '')}
                onChangeText={(v) => setForm((prev) => ({ ...prev, [key]: v }))}
              />
            ))}
            <PrimaryButton label="Save address" onPress={() => createMutation.mutate()} loading={createMutation.isPending} />
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.recipientName}</Text>
            <Text style={styles.line}>{item.line1}, {item.city}, {item.region}</Text>
            {item.isDefault ? <Text style={styles.default}>Default</Text> : (
              <Pressable onPress={() => item.id && setDefaultMutation.mutate(item.id)}>
                <Text style={styles.link}>Set as default</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  form: { marginBottom: 16, gap: 8 },
  formTitle: { fontWeight: '700', fontSize: 16, color: BRAND.text },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    padding: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  name: { fontWeight: '700', color: BRAND.text },
  line: { marginTop: 4, color: BRAND.muted },
  default: { marginTop: 8, color: BRAND.primary, fontWeight: '600' },
  link: { marginTop: 8, color: BRAND.primary, fontWeight: '600' },
});
