import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router, Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { authService } from '@/services/auth';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { getErrorMessage } from '@/utils/errorMessages';
import { logger } from '@/utils/logger';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { AppBrandLogo } from '@/components/AppBrandLogo';
import { BRAND_GREEN } from '@/constants/brand';
import {
  PRIVACY_POLICY_PATH,
  TERMS_ACCEPTANCE_MESSAGE,
  TERMS_PATH,
  TERMS_VERSION,
} from '@/constants/legal';
import { FormInput, FormLabel } from '@/components/FormField';
import { useScreenColors } from '@/hooks/useScreenColors';
const WELCOME_BG = '#0E1801';
/** Minimum time (ms) the loading animation runs before transitioning to success (matches web). */
const MIN_LOADING_DISPLAY_MS = 5200;

const ERROR_MESSAGES = {
  EMPTY_FIELDS: 'Please enter your name, email, and password.',
  PASSWORD_MISMATCH: "Passwords don't match.",
  PASSWORD_SHORT: 'Use at least 6 characters for password.',
  NAME_SHORT: 'Enter your full name.',
  TERMS_REQUIRED: TERMS_ACCEPTANCE_MESSAGE,
  DEFAULT: 'Sign up failed. Please try again.',
};

export default function SignupScreen() {
  const { colors, bg, textColor, mutedColor, borderColor } = useScreenColors();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { tenantSignup, googleAuth } = useAuth();
  const { googleClientId, googleIosClientId, googleAndroidClientId } = usePublicConfig();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [welcomeStatus, setWelcomeStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [overlayPhase, setOverlayPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [welcomeErrorMessage, setWelcomeErrorMessage] = useState('');
  const overlayStartTimeRef = useRef<number>(0);

  useEffect(() => {
    if (welcomeStatus === 'loading') {
      setOverlayPhase('loading');
    } else if (welcomeStatus === 'success') {
      const elapsed = overlayStartTimeRef.current ? Date.now() - overlayStartTimeRef.current : 0;
      const delay = Math.max(0, MIN_LOADING_DISPLAY_MS - elapsed);
      const t = setTimeout(() => setOverlayPhase('success'), delay);
      return () => clearTimeout(t);
    } else if (welcomeStatus === 'error') {
      setOverlayPhase('error');
    }
  }, [welcomeStatus]);

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setError('');
    } else {
      router.back();
    }
  };

  const handleNext = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      setError(ERROR_MESSAGES.EMPTY_FIELDS);
      return;
    }
    if (trimmedName.length < 2) {
      setError(ERROR_MESSAGES.NAME_SHORT);
      return;
    }
    if (!acceptedTerms) {
      setError(ERROR_MESSAGES.TERMS_REQUIRED);
      return;
    }

    setError('');

    (async () => {
      try {
        setCheckingEmail(true);
        logger.info('Signup', 'Checking email availability for:', trimmedEmail);
        const result = await authService.checkEmailAvailability(trimmedEmail);
        const exists =
          result?.data?.data?.exists ??
          result?.data?.exists ??
          result?.exists ??
          false;

        if (exists) {
          setError('An account with this email already exists. Please sign in instead.');
          return;
        }

        setStep(2);
      } catch (err) {
        logger.error('Signup', 'Email availability check failed, proceeding anyway:', err);
        // If lookup fails (network error, etc.), continue to step 2 and let backend enforce uniqueness
        setStep(2);
      } finally {
        setCheckingEmail(false);
      }
    })();
  };

  const handleGoogleSuccess = async (idToken: string) => {
    if (!acceptedTerms) {
      setError(ERROR_MESSAGES.TERMS_REQUIRED);
      return;
    }
    setError('');
    overlayStartTimeRef.current = Date.now();
    setShowWelcomeScreen(true);
    setWelcomeStatus('loading');
    setWelcomeErrorMessage('');
    setLoading(true);
    try {
      await googleAuth(idToken, {
        signUp: true,
        companyName: 'My Business',
        acceptedTerms: true,
        termsVersion: TERMS_VERSION,
      });
      logger.info('Signup', 'Google sign-up success');
      setWelcomeStatus('success');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Google sign-up failed. Please try again.');
      setWelcomeStatus('error');
      setWelcomeErrorMessage(msg);
      logger.error('Signup', 'Google sign-up failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!password) {
      setError(ERROR_MESSAGES.EMPTY_FIELDS);
      return;
    }
    if (password.length < 6) {
      setError(ERROR_MESSAGES.PASSWORD_SHORT);
      return;
    }
    if (password !== confirmPassword) {
      setError(ERROR_MESSAGES.PASSWORD_MISMATCH);
      return;
    }
    setError('');
    setLoading(true);
    overlayStartTimeRef.current = Date.now();
    setShowWelcomeScreen(true);
    setWelcomeStatus('loading');
    setWelcomeErrorMessage('');
    logger.info('Signup', 'Attempting signup for:', trimmedEmail);

    try {
      await tenantSignup({
        companyName: 'My Business',
        companyEmail: trimmedEmail,
        adminName: trimmedName,
        adminEmail: trimmedEmail,
        password,
        acceptedTerms: true,
        termsVersion: TERMS_VERSION,
      });
      logger.info('Signup', 'Signup success');
      setWelcomeStatus('success');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, ERROR_MESSAGES.DEFAULT);
      setWelcomeStatus('error');
      setWelcomeErrorMessage(msg);
      logger.error('Signup', 'Signup failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleWelcomeContinue = () => {
    setShowWelcomeScreen(false);
    router.replace('/');
  };

  const handleWelcomeErrorAction = () => {
    const isAlreadyExists = /already exists|sign in instead/i.test(welcomeErrorMessage || '');
    setShowWelcomeScreen(false);
    setWelcomeStatus('loading');
    setWelcomeErrorMessage('');
    if (isAlreadyExists) {
      router.replace('/login');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bg }]}
    >
      {showWelcomeScreen ? (
        <View style={styles.welcomeOverlay}>
          {overlayPhase === 'loading' && (
            <>
              <ConfettiBurst />
              <View style={styles.welcomeLoadingContent}>
                <Text style={styles.welcomeLine1}>Welcome to African Business Suite</Text>
                <Text style={styles.welcomeLine2}>
                  All-in-one business software for growing African businesses.
                </Text>
              </View>
            </>
          )}
          {overlayPhase === 'success' && (
            <View style={styles.welcomeSuccessContent}>
              <Text style={styles.welcomeSuccessTitle}>Account created.</Text>
              <Text style={styles.welcomeSuccessSubtitle}>
                Continue to setup your business.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.welcomeButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleWelcomeContinue}
              >
                <Text style={styles.welcomeButtonText}>Continue to setup</Text>
              </Pressable>
            </View>
          )}
          {overlayPhase === 'error' && (
            <View style={styles.welcomeSuccessContent}>
              <Text style={styles.welcomeSuccessTitle}>We couldn't create your account.</Text>
              <Text style={styles.welcomeSuccessSubtitle}>{welcomeErrorMessage}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.welcomeButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleWelcomeErrorAction}
              >
                <Text style={styles.welcomeButtonText}>
                  {/already exists|sign in instead/i.test(welcomeErrorMessage || '')
                    ? 'Sign in'
                    : 'Try again'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={10}
            style={styles.backIcon}
            disabled={loading}
          >
            <AppIcon name="chevron-back" size={22} color="#111827" />
          </Pressable>
        </View>
        <View style={styles.contentCenter}>
          <View style={styles.content}>
            <AppBrandLogo size={88} style={styles.logoWrap} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Create account</Text>
            <View style={styles.stepper}>
              <View
                style={[
                  styles.stepBar,
                  step >= 1 && styles.stepBarActive,
                ]}
              />
              <View
                style={[
                  styles.stepBar,
                  step >= 2 && styles.stepBarActive,
                ]}
              />
            </View>
          </View>
          <Text style={styles.subtitle}>Sign up to manage your business</Text>

          {step === 1 ? (
            <>
              <FormLabel>Full name</FormLabel>
              <FormInput
                placeholder="Enter your full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />
              <FormLabel>Email</FormLabel>
              <FormInput
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.termsBox,
                  { borderColor },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => setAcceptedTerms((current) => !current)}
                disabled={loading}
              >
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms ? <AppIcon name="check" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.termsText}>
                  I have read and agree to the ABS{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.tint }]}
                    onPress={() => router.push(TERMS_PATH as any)}
                  >
                    Terms and Conditions
                  </Text>
                  {' '}and{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.tint }]}
                    onPress={() => router.push(PRIVACY_POLICY_PATH)}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <FormLabel>Password</FormLabel>
              <View style={[styles.inputWithIcon, { borderColor }]}>
                <TextInput
                  style={[styles.inputInner, { color: textColor }]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={mutedColor}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  disabled={loading}
                >
                  <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={20} color={mutedColor} />
                </Pressable>
              </View>
              <FormLabel>Confirm password</FormLabel>
              <View style={[styles.inputWithIcon, { borderColor }]}>
                <TextInput
                  style={[styles.inputInner, { color: textColor }]}
                  placeholder="Re-enter your password"
                  placeholderTextColor={mutedColor}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  editable={!loading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  disabled={loading}
                >
                  <AppIcon name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={mutedColor} />
                </Pressable>
              </View>
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint },
                pressed && styles.buttonPressed,
                (loading || checkingEmail) && styles.buttonDisabled,
              ]}
              onPress={handleNext}
              disabled={loading || checkingEmail}
            >
              {loading || checkingEmail ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint },
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create account</Text>
              )}
            </Pressable>
          )}

          {googleClientId && step === 1 ? (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>
              <GoogleSignInButton
                webClientId={googleClientId}
                iosClientId={googleIosClientId || undefined}
                androidClientId={googleAndroidClientId || undefined}
                mode="signup"
                onSuccess={handleGoogleSuccess}
                onError={setError}
                disabled={loading}
              />
            </>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/login" asChild>
              <Pressable disabled={loading}>
                <Text style={[styles.link, { color: colors.tint }]}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
          <View style={styles.legalFooter}>
            <Pressable onPress={() => router.push(TERMS_PATH as any)} disabled={loading}>
              <Text style={styles.legalLink}>Terms</Text>
            </Pressable>
            <Text style={styles.legalSeparator}>•</Text>
            <Pressable onPress={() => router.push('/privacy-policy')} disabled={loading}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalSeparator}>•</Text>
            <Pressable onPress={() => router.push('/data-deletion')} disabled={loading}>
              <Text style={styles.legalLink}>Data Deletion</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  welcomeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WELCOME_BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
  welcomeLoadingContent: {
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeLine1: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  welcomeLine2: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
  },
  welcomeSuccessContent: {
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeSuccessTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeSuccessSubtitle: {
    fontSize: 16,
    color: '#d1d5db',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  welcomeButton: {
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  welcomeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  contentCenter: {
    flex: 1,
    justifyContent: 'center',
    transform: [{ translateY: -24 }],
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  backIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  logoWrap: {
    marginBottom: 12,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBar: {
    width: 18,
    height: 3,
    borderRadius: 9999,
    backgroundColor: '#e5e7eb',
  },
  stepBarActive: {
    backgroundColor: BRAND_GREEN,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  inputWithIcon: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputInner: {
    flex: 1,
    fontSize: 16,
  },
  termsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: BRAND_GREEN,
    backgroundColor: BRAND_GREEN,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#4b5563',
  },
  termsLink: {
    fontWeight: '700',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 6,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
  },
  eyeButton: {
    paddingHorizontal: 10,
    height: 48,
    justifyContent: 'center',
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
  button: {
    height: 48,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  orText: { marginHorizontal: 12, fontSize: 14, color: '#6b7280' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  footerText: {
    fontSize: 15,
    color: '#6b7280',
  },
  legalFooter: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  legalLink: {
    fontSize: 13,
    color: BRAND_GREEN,
    fontWeight: '600',
  },
  legalSeparator: {
    color: '#9ca3af',
    fontSize: 13,
  },
  link: {
    fontSize: 15,
    color: BRAND_GREEN,
    fontWeight: '600',
  },
});
