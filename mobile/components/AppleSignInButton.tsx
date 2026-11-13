import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';

import { PRIVACY_POLICY_PATH, TERMS_PATH } from '@/constants/legal';
import { TOUCH_TARGET } from '@/constants/sizing';
import { useScreenColors } from '@/hooks/useScreenColors';
import type { AppleAuthCredential } from '@/services/auth';
import { getErrorMessage } from '@/utils/errorMessages';

/** Sign in with Apple exists on iOS 13+ only; Android and web never show the button. */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

type Props = {
  mode: 'signin' | 'signup';
  /** Gets Apple's token, the raw nonce and (first time only) the name. Throw to show an error. */
  onSuccess: (credential: AppleAuthCredential) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
};

/**
 * Apple's own button (App Review rejects look-alikes), with the Terms and Privacy Policy under it:
 * the first Apple sign-in creates the ABS account, from Login or Sign Up, so this line is the
 * agreement. Hide My Email works: the account then uses Apple's relay address.
 */
export function AppleSignInButton({ mode, onSuccess, onError, disabled }: Props) {
  const available = useAppleSignInAvailable();
  const [busy, setBusy] = useState(false);
  const { colors, mutedColor, resolvedTheme } = useScreenColors();

  if (!available) return null;

  const inactive = busy || Boolean(disabled);

  const handlePress = async () => {
    if (inactive) return;
    setBusy(true);
    try {
      // Apple puts the nonce we pass into its token; we pass the hash and send the server the raw value.
      const rawNonce = Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        onError('Apple did not finish signing you in. Please try again.');
        return;
      }
      await onSuccess({
        identityToken: credential.identityToken,
        nonce: rawNonce,
        fullName: credential.fullName
          ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName }
          : null,
      });
    } catch (err) {
      // Closing Apple's sheet is not an error.
      if ((err as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return;
      onError(getErrorMessage(err, 'Apple sign-in failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View pointerEvents={inactive ? 'none' : 'auto'} style={inactive ? styles.inactive : undefined}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'signup'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={
            resolvedTheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={8}
          style={styles.button}
          onPress={handlePress}
        />
      </View>
      <Text style={[styles.legal, { color: mutedColor }]}>
        By continuing with Apple, you agree to the ABS{' '}
        <Text
          style={[styles.legalLink, { color: colors.tint }]}
          accessibilityRole="link"
          onPress={() => router.push(TERMS_PATH as never)}
        >
          Terms and Conditions
        </Text>{' '}
        and{' '}
        <Text
          style={[styles.legalLink, { color: colors.tint }]}
          accessibilityRole="link"
          onPress={() => router.push(PRIVACY_POLICY_PATH as never)}
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: TOUCH_TARGET.standard,
  },
  inactive: {
    opacity: 0.6,
  },
  legal: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  legalLink: {
    fontWeight: '600',
  },
});
