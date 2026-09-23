import { useCallback, useEffect, useRef, useState } from 'react';
import AppUpdateRequiredDialog, {
  APP_UPDATE_REQUIRED_EVENT,
  clearAppUpdateSnooze,
  isAppUpdateSnoozed,
  snoozeAppUpdateDialog,
} from './AppUpdateRequiredDialog';

/**
 * Registers the PWA service worker (prod only) and shows a friendly dialog
 * when a new ABS version is ready (SW update or stale chunks).
 */
export default function PWAUpdatePrompt() {
  const registrationRef = useRef(null);
  const reloadingRef = useRef(false);
  const updateAcceptedRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  const markUpdateAvailable = useCallback(() => {
    if (isAppUpdateSnoozed()) return;
    setUpdateAvailable(true);
  }, []);

  const reloadApp = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    clearAppUpdateSnooze();
    window.location.reload();
  }, []);

  const handleUpdate = useCallback(() => {
    if (updating) return;
    setUpdating(true);
    updateAcceptedRef.current = true;

    const registration = registrationRef.current;
    try {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch {
      // Fall through to hard reload
    }

    window.setTimeout(() => {
      reloadApp();
    }, 300);
    // Some tablet browsers ignore a reload issued while the service worker is swapping;
    // navigate to the same URL as a fallback so "Updating…" can never hang.
    window.setTimeout(() => {
      window.location.replace(window.location.href);
    }, 4000);
  }, [updating, reloadApp]);

  const handleRemindLater = useCallback(() => {
    snoozeAppUpdateDialog();
    setUpdateAvailable(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onRequestUpdate = () => markUpdateAvailable();
    window.addEventListener(APP_UPDATE_REQUIRED_EVENT, onRequestUpdate);

    const onSwMessage = (event) => {
      if (event.data?.type === 'CHUNK_LOAD_FAILED') {
        markUpdateAvailable();
      }
    };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

    return () => {
      window.removeEventListener(APP_UPDATE_REQUIRED_EVENT, onRequestUpdate);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [markUpdateAvailable]);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    let intervalId;
    let cancelled = false;

    const onWaitingReady = (registration) => {
      if (cancelled || !registration?.waiting) return;
      // Only prompt when there is already a controlling SW (true update, not first install).
      if (navigator.serviceWorker.controller) {
        markUpdateAvailable();
      }
    };

    const onUpdateFound = (registration) => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          onWaitingReady(registration);
        }
      });
    };

    const onControllerChange = () => {
      // Only reload when the user accepted an update — not on first SW install/claim.
      if (updateAcceptedRef.current) {
        reloadApp();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;
        registration.addEventListener('updatefound', () => onUpdateFound(registration));
        onWaitingReady(registration);

        const checkUpdate = () => {
          const reg = registrationRef.current;
          if (!reg) return;
          onWaitingReady(reg);
          reg.update?.().catch(() => {});
        };
        checkUpdate();
        intervalId = setInterval(checkUpdate, 60 * 60 * 1000);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [markUpdateAvailable, reloadApp]);

  return (
    <AppUpdateRequiredDialog
      open={updateAvailable}
      updating={updating}
      onUpdate={handleUpdate}
      onRemindLater={handleRemindLater}
    />
  );
}
