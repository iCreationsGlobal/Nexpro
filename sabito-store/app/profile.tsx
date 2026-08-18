import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/constants';

export default function ProfileScreen() {
  const { customer, updateProfile } = useAuth();
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [loading, setLoading] = useState(false);

  const onSave = async () => {
    setLoading(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      Alert.alert('Profile updated');
    } catch (err: unknown) {
      Alert.alert('Update failed', (err as { message?: string })?.message || 'Try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={phone || ''} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.email}>{customer?.email}</Text>
      <PrimaryButton label="Save changes" onPress={onSave} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontWeight: '600', marginBottom: 6, marginTop: 12, color: BRAND.text },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  email: { marginTop: 16, color: BRAND.muted },
});
