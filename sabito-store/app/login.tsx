import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StorefrontGoogleSignInButton } from '@/components/StorefrontGoogleSignInButton';
import { PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND, STORAGE_KEYS } from '@/constants';
import { authApi } from '@/services/authApi';

type LoginMode = 'password' | 'otp';
type LoginFieldErrors = { email?: string; password?: string; otp?: string; form?: string };

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export default function LoginScreen() {
  const { login, verifyOtp } = useAuth();
  const [mode, setMode] = useState<LoginMode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [sessionNotice, setSessionNotice] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const otpRef = useRef<TextInput>(null);

  const validateEmail = () => {
    if (!email.trim()) return 'Enter your email.';
    if (!isValidEmail(email)) return 'Enter a valid email address.';
    return '';
  };

  const focusFirstInvalid = (errors: LoginFieldErrors) => {
    requestAnimationFrame(() => {
      if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      else if (errors.otp) otpRef.current?.focus();
    });
  };

  useEffect(() => {
    (async () => {
      const intent = await AsyncStorage.getItem(STORAGE_KEYS.checkoutIntent);
      if (intent) setMode('otp');
      const message = await AsyncStorage.getItem(STORAGE_KEYS.authSessionMessage);
      if (message) {
        setSessionNotice(message);
        await AsyncStorage.removeItem(STORAGE_KEYS.authSessionMessage);
      }
    })();
  }, []);

  const restoreIntent = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, 'true');
    const intent = await AsyncStorage.getItem(STORAGE_KEYS.checkoutIntent);
    await AsyncStorage.removeItem(STORAGE_KEYS.checkoutIntent);
    if (intent) {
      router.replace(intent as '/checkout');
      return;
    }
    const returnTo = await AsyncStorage.getItem(STORAGE_KEYS.authReturnTo);
    await AsyncStorage.removeItem(STORAGE_KEYS.authReturnTo);
    if (returnTo) {
      router.replace(returnTo as '/(tabs)');
      return;
    }
    router.replace('/(tabs)');
  };

  const onPasswordSubmit = async () => {
    const errors: LoginFieldErrors = {};
    const emailError = validateEmail();
    if (emailError) errors.email = emailError;
    if (!password) errors.password = 'Enter your password.';
    if (errors.email || errors.password) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      await login(email.trim(), password);
      await restoreIntent();
    } catch (err: unknown) {
      const errorCode = (err as { errorCode?: string; code?: string })?.errorCode || (err as { errorCode?: string; code?: string })?.code;
      const message = (err as { message?: string })?.message || 'Login failed. Check your details and try again.';
      if (errorCode === 'EMAIL_VERIFICATION_REQUIRED' || errorCode === 'PHONE_VERIFICATION_REQUIRED') {
        setVerificationNotice(message || 'Verify your account before signing in.');
        setFieldErrors({});
      } else {
        setFieldErrors({ form: message });
      }
    } finally {
      setLoading(false);
    }
  };

  const onSendOtp = async () => {
    const emailError = validateEmail();
    if (emailError) {
      const errors = { email: emailError };
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      await authApi.sendLoginOtp(email.trim());
      setOtpSent(true);
      Alert.alert('Code sent', 'Check your email for a one-time login code.');
    } catch (err: unknown) {
      const errorCode = (err as { errorCode?: string; code?: string })?.errorCode || (err as { errorCode?: string; code?: string })?.code;
      const message = (err as { message?: string })?.message || 'Could not send a login code. Try again.';
      if (errorCode === 'EMAIL_VERIFICATION_REQUIRED' || errorCode === 'PHONE_VERIFICATION_REQUIRED') {
        setVerificationNotice(message || 'Verify your account before signing in.');
      } else {
        setFieldErrors({ form: message });
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    const errors: LoginFieldErrors = {};
    const emailError = validateEmail();
    if (emailError) errors.email = emailError;
    if (!otp.trim()) errors.otp = 'Enter the code from your email.';
    if (otp.trim() && otp.trim().length !== 6) errors.otp = 'Enter the 6-digit code from your email.';
    if (errors.email || errors.otp) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      await verifyOtp(email.trim(), otp.trim());
      await restoreIntent();
    } catch (err: unknown) {
      setFieldErrors({ otp: (err as { message?: string })?.message || 'Invalid code. Check your email and try again.' });
      requestAnimationFrame(() => otpRef.current?.focus());
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = (error: { message?: string; errorCode?: string; code?: string }, signUp = false) => {
    if (!signUp && (error.errorCode === 'GOOGLE_SHOPPER_NOT_FOUND' || error.code === 'GOOGLE_SHOPPER_NOT_FOUND')) {
      Alert.alert(
        'Create account with Google?',
        'No shopper account was found for that Google account.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign up with Google', onPress: () => router.replace('/signup') },
        ],
      );
      return;
    }
    Alert.alert('Google sign-in failed', error.message || 'Try again.');
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, mode === 'otp' && styles.tabActive]} onPress={() => setMode('otp')}>
          <Text style={[styles.tabText, mode === 'otp' && styles.tabTextActive]}>Email code</Text>
        </Pressable>
        <Pressable style={[styles.tab, mode === 'password' && styles.tabActive]} onPress={() => setMode('password')}>
          <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>Password</Text>
        </Pressable>
      </View>

      <StorefrontGoogleSignInButton
        label="Continue with Google"
        onSuccess={restoreIntent}
        onError={(error) => handleGoogleError(error, false)}
      />

      {sessionNotice ? (
        <View style={styles.noticeBox} accessibilityRole="alert">
          <Text style={styles.noticeTitle}>Session expired</Text>
          <Text style={styles.noticeText}>{sessionNotice}</Text>
        </View>
      ) : null}

      {verificationNotice ? (
        <View style={styles.noticeBox} accessibilityRole="alert">
          <Text style={styles.noticeTitle}>Verification required</Text>
          <Text style={styles.noticeText}>{verificationNotice}</Text>
          <Text style={styles.noticeText}>Check your email for the verification code, then try again.</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Email</Text>
      <TextInput
        ref={emailRef}
        style={[styles.input, fieldErrors.email && styles.inputError]}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
          if (verificationNotice) setVerificationNotice('');
        }}
        textContentType="emailAddress"
        autoComplete="email"
        accessibilityLabel="Email"
        accessibilityHint={fieldErrors.email || 'Enter your email address'}
      />
      {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}

      {mode === 'password' ? (
        <>
          <Text style={styles.label}>Password</Text>
          <TextInput
            ref={passwordRef}
            style={[styles.input, fieldErrors.password && styles.inputError]}
            secureTextEntry
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            textContentType="password"
            autoComplete="password"
            accessibilityLabel="Password"
            accessibilityHint={fieldErrors.password || 'Enter your password'}
          />
          {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
          {fieldErrors.form ? <Text style={styles.formError}>{fieldErrors.form}</Text> : null}
          <View style={styles.actions}>
            <SecondaryButton label="Create account" onPress={() => router.replace('/signup')} />
            <PrimaryButton
              label="Sign in"
              onPress={onPasswordSubmit}
              loading={loading}
              disabled={!email.trim() || !password}
            />
          </View>
          {!email.trim() || !password ? (
            <Text style={styles.helperText}>Enter your email and password to sign in.</Text>
          ) : null}
        </>
      ) : (
        <>
          {!otpSent ? (
            <View style={styles.actions}>
              <SecondaryButton label="Create account" onPress={() => router.replace('/signup')} />
              <PrimaryButton label="Send login code" onPress={onSendOtp} loading={loading} disabled={!email.trim()} />
            </View>
          ) : (
            <>
              <Text style={styles.label}>One-time code</Text>
              <TextInput
                ref={otpRef}
                style={[styles.input, fieldErrors.otp && styles.inputError]}
                keyboardType="number-pad"
                value={otp}
                onChangeText={(value) => {
                  setOtp(value.replace(/\D/g, '').slice(0, 6));
                  if (fieldErrors.otp) setFieldErrors((current) => ({ ...current, otp: undefined }));
                }}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                accessibilityLabel="One-time code"
                accessibilityHint={fieldErrors.otp || 'Enter the 6-digit code from your email'}
              />
              {fieldErrors.otp ? <Text style={styles.fieldError}>{fieldErrors.otp}</Text> : null}
              {fieldErrors.form ? <Text style={styles.formError}>{fieldErrors.form}</Text> : null}
              <View style={styles.actions}>
                <SecondaryButton label="Resend code" onPress={onSendOtp} />
                <SecondaryButton label="Create account" onPress={() => router.replace('/signup')} />
                <PrimaryButton label="Verify and continue" onPress={onVerifyOtp} loading={loading} disabled={!otp.trim()} />
              </View>
            </>
          )}
          {!email.trim() ? <Text style={styles.helperText}>Enter your email to receive a login code.</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tabActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  tabText: { fontWeight: '700', color: BRAND.text },
  tabTextActive: { color: '#fff' },
  noticeBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  noticeTitle: { color: '#92400e', fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#92400e', fontSize: 13, lineHeight: 18 },
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
  inputError: { borderColor: BRAND.danger },
  fieldError: { marginTop: 6, color: BRAND.danger, fontSize: 13, lineHeight: 18 },
  formError: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    color: BRAND.danger,
    padding: 10,
    lineHeight: 18,
  },
  helperText: { marginTop: 8, color: BRAND.muted, fontSize: 12, lineHeight: 18 },
  actions: { marginTop: 24, gap: 10 },
});
