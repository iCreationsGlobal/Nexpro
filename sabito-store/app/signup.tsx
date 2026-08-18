import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StorefrontGoogleSignInButton } from '@/components/StorefrontGoogleSignInButton';
import { PrimaryButton, SecondaryButton } from '@/components/ui';
import { BRAND, STORAGE_KEYS } from '@/constants';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const validationMessage = useMemo(() => {
    if (name.trim().length < 2) return 'Enter your full name.';
    if (!emailPattern.test(email.trim())) return 'Enter a valid email address.';
    if (phone.trim().length < 7) return 'Enter a reachable phone number.';
    return '';
  }, [email, name, phone]);

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

  const onContinue = () => {
    if (validationMessage) {
      Alert.alert('Check your details', validationMessage);
      return;
    }
    router.push({
      pathname: '/signup-password',
      params: {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Create your buyer account</Text>
        <Text style={styles.title}>Save addresses, track food orders, and checkout faster.</Text>
        <Text style={styles.subtitle}>Use the same account for meals, groceries, products, services, reviews, and order support.</Text>
      </View>

      {[
        { label: 'Full name', value: name, set: setName, placeholder: 'Ama Mensah' },
        { label: 'Email', value: email, set: setEmail, keyboard: 'email-address' as const, placeholder: 'ama@example.com' },
        { label: 'Phone', value: phone, set: setPhone, keyboard: 'phone-pad' as const, placeholder: '024 000 0000' },
      ].map((field) => (
        <View key={field.label}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={field.value}
            onChangeText={field.set}
            autoCapitalize={field.keyboard ? 'none' : 'words'}
            keyboardType={field.keyboard}
            placeholder={field.placeholder}
          />
        </View>
      ))}
      {validationMessage ? <Text style={styles.hint}>{validationMessage}</Text> : null}

      <View style={styles.actions}>
        <SecondaryButton label="I already have an account" onPress={() => router.replace('/login')} />
        <StorefrontGoogleSignInButton
          signUp
          label="Sign up with Google"
          unavailableLabel="Google sign-up unavailable"
          onSuccess={routeAfterSignup}
          onError={(error) => Alert.alert('Google sign-up failed', error.message || 'Try again.')}
        />
        <PrimaryButton label="Continue" onPress={onContinue} disabled={Boolean(validationMessage)} />
      </View>

      <Text style={styles.terms}>
        By creating an account, you agree to receive order updates and account notifications from Sabito Store.
      </Text>
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
  terms: { marginTop: 18, color: BRAND.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
