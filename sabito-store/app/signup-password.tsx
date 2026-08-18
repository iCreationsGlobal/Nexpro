import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND, STORAGE_KEYS } from '@/constants';

const getParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value || '');

export default function SignupPasswordScreen() {
  const { register } = useAuth();
  const params = useLocalSearchParams<{ name?: string; email?: string; phone?: string }>();
  const name = getParam(params.name).trim();
  const email = getParam(params.email).trim();
  const phone = getParam(params.phone).trim();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validationMessage = useMemo(() => {
    if (!name || !email || !phone) return 'Go back and complete your account details.';
    if (password.length < 8) return 'Use at least 8 characters for your password.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return '';
  }, [confirmPassword, email, name, password, phone]);

  const routeAfterSignup = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, 'true');
    const checkoutIntent = await AsyncStorage.getItem(STORAGE_KEYS.checkoutIntent);
    if (checkoutIntent) {
      await AsyncStorage.removeItem(STORAGE_KEYS.checkoutIntent);
      router.replace(checkoutIntent as '/checkout');
      return;
    }
    router.replace('/onboarding/address');
  };

  const onSubmit = async () => {
    if (validationMessage) {
      Alert.alert('Check your password', validationMessage);
      return;
    }
    setLoading(true);
    try {
      await register({ name, email, phone, password });
      await routeAfterSignup();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Registration failed';
      Alert.alert('Sign up failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Password setup</Text>
        <Text style={styles.title}>Create a secure password.</Text>
        <Text style={styles.subtitle}>You will use this password to sign in with your email when you are not using a one-time code.</Text>
      </View>

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
      />
      <Text style={styles.label}>Confirm password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Re-enter password"
      />
      {validationMessage ? <Text style={styles.hint}>{validationMessage}</Text> : null}

      <View style={styles.actions}>
        <SecondaryButton label="Back" onPress={() => router.back()} />
        <PrimaryButton label="Create account" onPress={onSubmit} loading={loading} disabled={Boolean(validationMessage)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  hero: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#ecfccb',
    borderWidth: 1,
    borderColor: '#bef264',
    marginBottom: 4,
  },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { color: BRAND.text, fontWeight: '900', fontSize: 23, marginTop: 6, lineHeight: 29 },
  subtitle: { color: BRAND.muted, marginTop: 8, lineHeight: 20 },
  label: { fontWeight: '600', color: BRAND.text, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { marginTop: 10, color: BRAND.warning, fontWeight: '600' },
  actions: { marginTop: 24, gap: 10 },
});
