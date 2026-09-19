import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useMutationState } from '@tanstack/react-query';

import { ConfettiBurst } from '@/components/ConfettiBurst';
import { getErrorMessage } from '@/utils/errorMessages';
import { BRAND_GREEN } from '@/constants/brand';
import { SIGNUP_MUTATION_KEY } from '@/constants/signupFlow';

const WELCOME_BG = '#0E1801';
/** Minimum time (ms) the loading animation runs before transitioning to success (matches web). */
const MIN_LOADING_DISPLAY_MS = 5200;
/** Safety-net ceiling (ms): if the mutation never settles (hung request, a promise that never
 * resolves/rejects after the network call) force an error so the screen never hangs forever on
 * the branded loading animation. Comfortably past the API client's own 30s request timeout. Matches web. */
const OVERLAY_LOADING_SAFETY_MS = 35000;
const DEFAULT_ERROR_MESSAGE = 'Sign up failed. Please try again.';

type OverlayPhase = 'loading' | 'success' | 'error';

export default function SignupWelcomeScreen() {
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('loading');
  const startTimeRef = useRef(Date.now());

  const mutationState = useMutationState({
    filters: { mutationKey: SIGNUP_MUTATION_KEY, exact: true },
    select: (mutation) => ({ status: mutation.state.status, error: mutation.state.error }),
  });
  const latest = mutationState[mutationState.length - 1];
  const status = latest?.status ?? 'pending';

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status === 'pending' || status === 'idle') {
      setOverlayPhase('loading');
    } else if (status === 'success') {
      const elapsed = Date.now() - startTimeRef.current;
      const delay = Math.max(0, MIN_LOADING_DISPLAY_MS - elapsed);
      const t = setTimeout(() => setOverlayPhase('success'), delay);
      return () => clearTimeout(t);
    } else if (status === 'error') {
      setOverlayPhase('error');
    }
  }, [status]);

  // Safety net: never let the branded loading screen hang forever if the mutation never settles.
  useEffect(() => {
    if (status !== 'pending' && status !== 'idle') return;
    const t = setTimeout(() => {
      setTimedOut(true);
      setOverlayPhase('error');
    }, OVERLAY_LOADING_SAFETY_MS);
    return () => clearTimeout(t);
  }, [status]);

  const errorMessage = timedOut
    ? 'This is taking longer than expected. Please check your connection and try again.'
    : status === 'error'
      ? getErrorMessage(latest?.error, DEFAULT_ERROR_MESSAGE)
      : '';
  const isAlreadyExists = /already exists|sign in instead/i.test(errorMessage);

  const handleContinue = () => {
    router.replace('/');
  };

  const handleErrorAction = () => {
    if (isAlreadyExists) {
      router.replace('/login');
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      {overlayPhase === 'loading' && (
        <View style={styles.loadingContent}>
          <Text style={styles.line1}>Welcome to African Business Suite</Text>
          <Text style={styles.line2}>
            All-in-one business software for growing African businesses.
          </Text>
        </View>
      )}
      {overlayPhase === 'success' && (
        <>
          <ConfettiBurst />
          <View style={styles.resultContent}>
            <Text style={styles.resultTitle}>Account created.</Text>
            <Text style={styles.resultSubtitle}>Continue to setup your business.</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={handleContinue}
            >
              <Text style={styles.buttonText}>Continue to setup</Text>
            </Pressable>
          </View>
        </>
      )}
      {overlayPhase === 'error' && (
        <View style={styles.resultContent}>
          <Text style={styles.resultTitle}>We couldn't create your account.</Text>
          <Text style={styles.resultSubtitle}>{errorMessage}</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleErrorAction}
          >
            <Text style={styles.buttonText}>{isAlreadyExists ? 'Sign in' : 'Try again'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WELCOME_BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingContent: {
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line1: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  line2: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
  },
  resultContent: {
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  resultSubtitle: {
    fontSize: 16,
    color: '#d1d5db',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.9 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
