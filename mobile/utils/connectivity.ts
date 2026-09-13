import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

type ExpoNetworkState = Network.NetworkState | Network.NetworkStateEvent;

let reactQueryOnlineManagerRegistered = false;

function isDomAvailable(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as { window?: unknown }).window !== 'undefined';
}

export const isNetworkStateOnline = (state: ExpoNetworkState) => {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  if (state.type === Network.NetworkStateType.NONE) return false;
  return true;
};

export const getCurrentNetworkOnline = async () => {
  try {
    if (Platform.OS === 'web') {
      if (!isDomAvailable()) return true;
      return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    }
    return isNetworkStateOnline(await Network.getNetworkStateAsync());
  } catch {
    // Keep React Query optimistic if Expo cannot determine reachability.
    return true;
  }
};

/**
 * Browser `online`/`offline` events. Safe on web SSR because `window` is not touched until a DOM exists.
 */
function subscribeWebOnline(setOnline: (online: boolean) => void): () => void {
  if (!isDomAvailable()) return () => {};
  const handle = () => setOnline(navigator.onLine !== false);
  handle();
  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);
  return () => {
    window.removeEventListener('online', handle);
    window.removeEventListener('offline', handle);
  };
}

export const registerReactQueryOnlineManager = () => {
  if (reactQueryOnlineManagerRegistered) return;
  reactQueryOnlineManagerRegistered = true;

  onlineManager.setEventListener((setOnline) => {
    if (Platform.OS === 'web') {
      return subscribeWebOnline(setOnline);
    }

    getCurrentNetworkOnline().then(setOnline);
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isNetworkStateOnline(state));
    });

    return () => subscription.remove();
  });
};

/**
 * Device/browser online flag for UI. Avoids `Network.useNetworkState()` during web SSR
 * (`window is not defined` in expo-network).
 */
export function useAppOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return subscribeWebOnline(setOnline);
    }

    let cancelled = false;
    getCurrentNetworkOnline().then((value) => {
      if (!cancelled) setOnline(value);
    });
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isNetworkStateOnline(state));
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return online;
}
