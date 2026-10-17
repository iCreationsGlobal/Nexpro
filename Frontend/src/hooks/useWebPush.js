import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchWebPushConfig,
  getCurrentPushSubscription,
  getPushRegistration,
  isWebPushSupported,
  needsHomeScreenInstall,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/services/webPushService';

/**
 * Notifications on this device (web push).
 * status: 'hidden' (server not set up) | 'unsupported' | 'install' (iPhone: add to Home Screen first)
 *       | 'blocked' | 'off' | 'on' | 'checking'
 */
export function useWebPush() {
  const { user } = useAuth();
  const supported = isWebPushSupported();
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['notifications', 'web-push-config'],
    queryFn: fetchWebPushConfig,
    enabled: Boolean(user),
    staleTime: 60 * 60 * 1000,
  });
  const [subscribed, setSubscribed] = useState(null);
  const [hasWorker, setHasWorker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const registration = await getPushRegistration();
      const subscription = registration ? await getCurrentPushSubscription() : null;
      if (cancelled) return;
      setHasWorker(Boolean(registration));
      setSubscribed(Boolean(subscription));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  let status = 'checking';
  if (!loadingConfig && !config?.enabled) status = 'hidden';
  else if (!supported) status = 'unsupported';
  else if (needsHomeScreenInstall()) status = 'install';
  else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') status = 'blocked';
  else if (subscribed !== null && hasWorker !== null) status = subscribed ? 'on' : hasWorker ? 'off' : 'unsupported';

  const turnOn = useCallback(async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToWebPush(config.publicKey);
      if (result === 'subscribed') setSubscribed(true);
      else if (result === 'denied') setError('Notifications were not allowed. You can allow them in your browser settings.');
      else setError('Notifications are not available in this browser right now.');
    } catch (err) {
      setError(err?.message || 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }, [config?.publicKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromWebPush();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, turnOn, turnOff };
}

export default useWebPush;
