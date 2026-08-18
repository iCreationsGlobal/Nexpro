import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, ActivityIndicator, View, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { AppIcon } from '@/components/AppIcon';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  webClientId: string;
  iosClientId?: string;
  androidClientId?: string;
  mode: 'signin' | 'signup';
  onSuccess: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
};

/**
 * Google Sign-In via expo-auth-session.
 * Prefer platform OAuth clients for store builds; webClientId is always required by the library.
 */
export function GoogleSignInButton({
  webClientId,
  iosClientId,
  androidClientId,
  mode,
  onSuccess,
  onError,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);

  const config = {
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    ...(androidClientId ? { androidClientId } : {}),
  };

  const [request, result, promptAsync] = Google.useIdTokenAuthRequest(config);

  const handledRef = React.useRef(false);
  React.useEffect(() => {
    if (!result || result.type !== 'success') {
      if (result?.type === 'error') onError(result.error?.message ?? 'Google sign-in was cancelled or failed.');
      return;
    }
    const idToken =
      (result.params as { id_token?: string } | undefined)?.id_token ??
      (result as { authentication?: { idToken?: string } }).authentication?.idToken;
    if (!idToken) {
      onError('Could not get Google ID token.');
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;
    setLoading(true);
    onSuccess(idToken)
      .catch((err: { response?: { data?: { message?: string } }; message?: string }) => {
        onError(err?.response?.data?.message || err?.message || 'Google sign-in failed.');
      })
      .finally(() => {
        setLoading(false);
        handledRef.current = false;
      });
  }, [result, onSuccess, onError]);

  const missingNativeClient =
    (Platform.OS === 'ios' && !iosClientId) || (Platform.OS === 'android' && !androidClientId);

  const handlePress = () => {
    if (!request || loading || disabled) return;
    if (missingNativeClient && !__DEV__) {
      onError(
        Platform.OS === 'ios'
          ? 'Google Sign-In is not configured for iOS yet. Use email and password, or contact support.'
          : 'Google Sign-In is not configured for Android yet. Use email and password, or contact support.',
      );
      return;
    }
    promptAsync();
  };

  const label = mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        (loading || disabled) && styles.buttonDisabled,
      ]}
      onPress={handlePress}
      disabled={!request || loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color="#374151" />
      ) : (
        <View style={styles.buttonContent}>
          <AppIcon name="logo-google" size={18} color="#DB4437" />
          <Text style={styles.buttonText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.6 },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});
