import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import api from '@/services/api';

type GoogleClientIds = {
  webClientId: string;
  iosClientId: string;
  androidClientId: string;
};

const readEnvGoogleIds = (): GoogleClientIds => {
  const webClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    String(Constants.expoConfig?.extra?.googleClientId || '').trim()
  );
  const iosClientId = String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim();
  const androidClientId = String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim();

  return {
    webClientId,
    iosClientId: iosClientId || webClientId,
    androidClientId: androidClientId || webClientId,
  };
};

/**
 * Resolves Google OAuth client IDs from env (and app config), with optional backend fallback.
 */
export function useGoogleClientId() {
  const envIds = useMemo(readEnvGoogleIds, []);
  const [remoteWebClientId, setRemoteWebClientId] = useState('');
  const [configLoaded, setConfigLoaded] = useState(Boolean(envIds.webClientId));

  useEffect(() => {
    if (envIds.webClientId) return undefined;

    let cancelled = false;
    api
      .get<{ googleClientId?: string }>('/auth/config')
      .then((res) => {
        if (cancelled) return;
        setRemoteWebClientId(String(res?.googleClientId || '').trim());
      })
      .catch(() => {
        if (!cancelled) setRemoteWebClientId('');
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [envIds.webClientId]);

  const webClientId = envIds.webClientId || remoteWebClientId;

  return {
    webClientId,
    iosClientId: envIds.iosClientId || webClientId,
    androidClientId: envIds.androidClientId || webClientId,
    configLoaded,
    googleConfigured: Boolean(webClientId),
  };
}
