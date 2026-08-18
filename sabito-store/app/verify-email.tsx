import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/constants';
import { authApi } from '@/services/authApi';

export default function VerifyEmailScreen() {
  const { customer, refreshSession } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const email = customer?.email || '';

  const verify = async () => {
    setLoading(true);
    try {
      await authApi.verifyEmail({ email, code: code.trim() });
      await refreshSession();
      Alert.alert('Email verified', 'Your shopper email has been verified.');
      router.back();
    } catch (err: unknown) {
      Alert.alert('Verification failed', (err as { message?: string })?.message || 'Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    try {
      await authApi.resendVerification(email);
      Alert.alert('Code sent', 'Check your email for a verification code.');
    } catch (err: unknown) {
      Alert.alert('Could not resend', (err as { message?: string })?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.message}>Enter the 6-digit code sent to {email}.</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        placeholder="Verification code"
      />
      <View style={styles.actions}>
        <SecondaryButton label="Resend code" onPress={resend} />
        <PrimaryButton label="Verify email" onPress={verify} loading={loading} disabled={code.trim().length !== 6} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { color: BRAND.text, fontSize: 24, fontWeight: '900' },
  message: { color: BRAND.muted, lineHeight: 22 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  actions: { gap: 10, marginTop: 8 },
});
