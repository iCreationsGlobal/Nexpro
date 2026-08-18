import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import * as Network from 'expo-network';

import { BRAND } from '@/constants';
import { isNetworkStateOnline } from '@/utils/connectivity';

const SLOW_REQUEST_MS = 7000;
const RECONNECTED_VISIBLE_MS = 4000;

export function ConnectivityBanner() {
  const networkState = Network.useNetworkState();
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const [showSlowRequest, setShowSlowRequest] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const isOnline = useMemo(() => isNetworkStateOnline(networkState), [networkState]);
  const activeRequests = isFetching + isMutating;

  useEffect(() => {
    if (!isOnline || activeRequests === 0) {
      setShowSlowRequest(false);
      return;
    }

    const timeout = setTimeout(() => setShowSlowRequest(true), SLOW_REQUEST_MS);
    return () => clearTimeout(timeout);
  }, [activeRequests, isOnline]);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
      return;
    }

    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;
    setShowReconnected(true);
    const timeout = setTimeout(() => setShowReconnected(false), RECONNECTED_VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [isOnline]);

  if (!isOnline) {
    return (
      <Banner
        title="You're offline"
        message="Saved details stay visible. New requests will resume when you're back online."
        tone="warning"
      />
    );
  }

  if (showReconnected) {
    return <Banner title="Back online" message="Refreshing the latest store details now." tone="success" />;
  }

  if (showSlowRequest) {
    return <Banner title="Still working" message="This is taking longer than usual. We'll keep trying." tone="neutral" />;
  }

  return null;
}

function Banner({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: 'warning' | 'success' | 'neutral';
}) {
  const palette = palettes[tone];

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[styles.wrap, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <Text style={[styles.title, { color: palette.title }]}>{title}</Text>
      <Text style={[styles.message, { color: palette.message }]}>{message}</Text>
    </View>
  );
}

const palettes = {
  warning: {
    background: '#fffbeb',
    border: '#f59e0b',
    title: '#92400e',
    message: '#92400e',
  },
  success: {
    background: '#f0fdf4',
    border: '#22c55e',
    title: BRAND.primary,
    message: BRAND.primary,
  },
  neutral: {
    background: '#fff',
    border: BRAND.border,
    title: BRAND.text,
    message: BRAND.muted,
  },
} as const;

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 13, fontWeight: '700' },
  message: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
