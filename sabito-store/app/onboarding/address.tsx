import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND, GHANA_REGIONS } from '@/constants';
import { addressesApi, type DeliveryAddress } from '@/services/ordersApi';
import { refreshAfterAddressChange } from '@/utils/queryInvalidation';

export default function OnboardingAddressScreen() {
  const queryClient = useQueryClient();
  const { customer, isAuthenticated } = useAuth();
  const [form, setForm] = useState<Partial<DeliveryAddress>>({
    label: 'Home',
    recipientName: customer?.name || '',
    phone: customer?.phone || '',
    line1: '',
    city: '',
    region: GHANA_REGIONS[0],
    isDefault: true,
  });

  const canSubmit = useMemo(
    () => Boolean(form.recipientName?.trim() && form.phone?.trim() && form.line1?.trim() && form.city?.trim()),
    [form],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await addressesApi.create({
        label: form.label?.trim() || 'Home',
        recipientName: form.recipientName?.trim() || '',
        phone: form.phone?.trim() || '',
        line1: form.line1?.trim() || '',
        line2: form.line2?.trim() || undefined,
        city: form.city?.trim() || '',
        region: form.region || GHANA_REGIONS[0],
        isDefault: true,
      });
      const id = response?.data?.id;
      if (id) await addressesApi.setDefault(id);
      return response;
    },
    onSuccess: async () => {
      await refreshAfterAddressChange(queryClient);
      Alert.alert('Address saved', 'Your default delivery address is ready.');
      router.replace('/(tabs)/food');
    },
    onError: (err: { message?: string }) => {
      Alert.alert('Could not save address', err.message || 'You can add it later from Account.');
    },
  });

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Create an account first</Text>
        <Text style={styles.subtitle}>Delivery setup is available after you sign in.</Text>
        <SecondaryButton label="Back to onboarding" onPress={() => router.replace('/onboarding')} />
        <PrimaryButton label="Create account" onPress={() => router.replace('/signup')} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Delivery setup</Text>
        <Text style={styles.title}>Where should food orders go?</Text>
        <Text style={styles.subtitle}>Save a default address now so checkout is faster later. You can edit it anytime.</Text>
      </View>

      {([
        { key: 'label', label: 'Label (optional)', placeholder: 'Home, Office, Hostel' },
        { key: 'recipientName', label: 'Recipient name', placeholder: 'Full name' },
        { key: 'phone', label: 'Phone', placeholder: '024 000 0000', keyboardType: 'phone-pad' as const },
        { key: 'line1', label: 'Address line', placeholder: 'House number, street, area' },
        { key: 'line2', label: 'Landmark (optional)', placeholder: 'Near...' },
        { key: 'city', label: 'City', placeholder: 'Accra' },
      ] as const).map((field) => (
        <View key={field.key}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            placeholder={field.placeholder}
            keyboardType={'keyboardType' in field ? field.keyboardType : undefined}
            value={String(form[field.key] || '')}
            onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
          />
        </View>
      ))}

      <Text style={styles.label}>Region</Text>
      <TextInput
        style={styles.input}
        value={String(form.region || '')}
        onChangeText={(value) => setForm((current) => ({ ...current, region: value }))}
      />

      <View style={styles.actions}>
        <SecondaryButton label="Skip for now" onPress={() => router.replace('/(tabs)/food')} />
        <PrimaryButton
          label="Save and start ordering"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!canSubmit}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: BRAND.background },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  hero: {
    backgroundColor: '#ecfccb',
    borderWidth: 1,
    borderColor: '#bef264',
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { color: BRAND.text, fontWeight: '900', fontSize: 24, marginTop: 6 },
  subtitle: { color: BRAND.muted, marginTop: 8, lineHeight: 20 },
  label: { fontWeight: '700', color: BRAND.text, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  actions: { marginTop: 16, gap: 10 },
});

