import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useGoogleClientId } from '@/hooks/useGoogleClientId';

WebBrowser.maybeCompleteAuthSession();

type StorefrontGoogleSignInButtonProps = {
  signUp?: boolean;
  label?: string;
  unavailableLabel?: string;
  loadingLabel?: string;
  onSuccess: () => void | Promise<void>;
  onError?: (error: { message?: string; errorCode?: string; code?: string }) => void;
};

type GoogleSignInInnerProps = StorefrontGoogleSignInButtonProps & {
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
};

function GoogleSignInInner({
  webClientId,
  iosClientId,
  androidClientId,
  signUp = false,
  label = 'Continue with Google',
  loadingLabel = 'Connecting Google...',
  onSuccess,
  onError,
}: GoogleSignInInnerProps) {
  const { googleAuth } = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest(
    {
      webClientId,
      iosClientId,
      androidClientId,
      scopes: ['openid', 'profile', 'email'],
      selectAccount: true,
    },
    { scheme: 'sabito-buyer' },
  );

  const handlePress = async () => {
    if (!request || isGoogleLoading) return;

    setIsGoogleLoading(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') {
        throw new Error('Google sign-in was cancelled or failed.');
      }
      const idToken = result.params?.id_token;
      if (!idToken) {
        throw new Error('Google did not return an ID token.');
      }
      await googleAuth(idToken, signUp);
      await onSuccess();
    } catch (err: unknown) {
      const error = err as { message?: string; errorCode?: string; code?: string };
      onError?.(error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <SecondaryButton
      label={isGoogleLoading ? loadingLabel : label}
      onPress={handlePress}
      disabled={!request || isGoogleLoading}
      loading={isGoogleLoading}
    />
  );
}

/**
 * Google sign-in button that only mounts the native OAuth hook when client IDs are configured.
 */
export function StorefrontGoogleSignInButton({
  signUp = false,
  label,
  unavailableLabel = 'Google sign-in unavailable',
  loadingLabel = 'Connecting Google...',
  onSuccess,
  onError,
}: StorefrontGoogleSignInButtonProps) {
  const { webClientId, iosClientId, androidClientId, configLoaded, googleConfigured } = useGoogleClientId();

  if (!googleConfigured) {
    return (
      <SecondaryButton
        label={configLoaded ? unavailableLabel : loadingLabel}
        disabled
      />
    );
  }

  return (
    <GoogleSignInInner
      webClientId={webClientId}
      iosClientId={iosClientId}
      androidClientId={androidClientId}
      signUp={signUp}
      label={label}
      loadingLabel={loadingLabel}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
}
