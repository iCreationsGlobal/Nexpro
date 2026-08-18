import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { authService } from '@/services/auth';
import { getErrorMessage } from '@/utils/errorMessages';
import { logger } from '@/utils/logger';

import { AppIcon } from '@/components/AppIcon';
import { StackPageHeader } from '@/components/StackPageHeader';
import { FormInput, FormLabel } from '@/components/FormField';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';

export default function ForgotPasswordScreen() {
  const { colors, bg, cardBg, borderColor, mutedColor, textColor } = useScreenColors();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === 'string' ? emailParam : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email to reset your password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(trimmed);
      logger.info('ForgotPassword', 'Reset email sent for:', trimmed);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Something went wrong. Please try again.');
      setError(msg);
      logger.error('ForgotPassword', 'Request failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bg }]}
    >
      <StackPageHeader
        title="Forgot password"
        subtitle={submitted ? undefined : "We'll email you a reset link."}
      />
      <View style={styles.content}>
        {submitted ? (
          <View style={[styles.successCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.successIconWrap}>
              <AppIcon name="checkmark-circle" size={36} color={colors.tint} />
            </View>
            <Text style={[styles.successTitle, { color: textColor }]}>Check your email</Text>
            <Text style={[styles.successText, { color: mutedColor }]}>
              If an account exists for that email, we've sent a password reset link. The link
              may expire after some time.
            </Text>
            <Text style={[styles.successHint, { color: mutedColor }]}>
              Didn't see it? Check your spam or promotions folder.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint },
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.primaryButtonText}>Back to sign in</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FormLabel>Email</FormLabel>
            <FormInput
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />

            {error ? (
              <View style={[styles.errorBox, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint },
                pressed && styles.primaryButtonPressed,
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Send reset link</Text>
              )}
            </Pressable>

            <Pressable style={styles.backLink} onPress={() => router.back()} disabled={loading}>
              <Text style={[styles.backLinkText, { color: colors.tint }]}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  logoWrap: {
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    height: 48,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonPressed: { opacity: 0.9 },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    marginTop: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backLinkText: {
    fontSize: 14,
    color: BRAND_GREEN,
    fontWeight: '600',
  },
  successCard: {
    alignItems: 'center',
    marginTop: 8,
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(22, 101, 52, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 4,
  },
  successHint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
});

