import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

import { useTheme } from '@/context/ThemeContext';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import Colors from '@/constants/Colors';
import { useAppOnline } from '@/utils/connectivity';
import { isStoreSetupBackgroundNoiseQuery } from '@/utils/storeSetupQueryGate';

const SLOW_REQUEST_MS = 7000;
const RECONNECTED_VISIBLE_MS = 4000;

export function ConnectivityBanner() {
  const isOnline = useAppOnline();
  const inStoreSetup = useIsStoreSetupRoute();
  const isFetching = useIsFetching({
    predicate: (query) => !(inStoreSetup && isStoreSetupBackgroundNoiseQuery(query.queryKey)),
  });
  const isMutating = useIsMutating();
  const { resolvedTheme } = useTheme();
  const [showSlowRequest, setShowSlowRequest] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
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

  const colors = Colors[resolvedTheme ?? 'light'];
  const isDark = resolvedTheme === 'dark';

  if (!isOnline) {
    return (
      <Banner
        title="You're offline"
        message="Showing saved data where available. New requests will resume when you're back online."
        tone="warning"
      />
    );
  }

  if (showReconnected) {
    return (
      <Banner
        title="Back online"
        message="Refreshing the latest data now."
        tone="success"
      />
    );
  }

  if (showSlowRequest) {
    return (
      <Banner
        title="Still working"
        message="This is taking longer than usual. We'll keep trying."
        tone={isDark ? 'neutralDark' : 'neutral'}
        accentColor={colors.tint}
      />
    );
  }

  return null;
}

function Banner({
  title,
  message,
  tone,
  accentColor,
}: {
  title: string;
  message: string;
  tone: 'warning' | 'success' | 'neutral' | 'neutralDark';
  accentColor?: string;
}) {
  const palette = palettes[tone];

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[
        styles.wrap,
        {
          backgroundColor: palette.background,
          borderColor: accentColor ?? palette.border,
        },
      ]}
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
    title: '#166534',
    message: '#166534',
  },
  neutral: {
    background: '#f8fafc',
    border: '#cbd5e1',
    title: '#0f172a',
    message: '#475569',
  },
  neutralDark: {
    background: '#18181b',
    border: '#3f3f46',
    title: '#fafafa',
    message: '#d4d4d8',
  },
} as const;

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});
