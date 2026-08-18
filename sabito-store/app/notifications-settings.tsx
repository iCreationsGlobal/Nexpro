import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/constants';
import { notificationsApi } from '@/services/ordersApi';
import {
  getStoredPushRegistrationState,
  registerPushNotifications,
  type PushRegistrationState,
} from '@/utils/pushNotifications';
import {
  buyerQueryKeys,
  QUERY_STALE,
  refreshNotificationPreferences,
} from '@/utils/queryInvalidation';

export default function NotificationsSettingsScreen() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promotions, setPromotions] = useState(false);
  const [pushState, setPushState] = useState<PushRegistrationState>({
    status: 'idle',
    message: 'Checking push notification status...',
  });
  const [pushBusy, setPushBusy] = useState(false);

  const prefsQuery = useQuery({
    queryKey: buyerQueryKeys.notificationPrefs,
    queryFn: () => notificationsApi.getPreferences(),
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const prefs = prefsQuery.data?.data;
    if (prefs) {
      setOrderUpdates(prefs.orderUpdates !== false);
      setPromotions(prefs.promotions === true);
    }
  }, [prefsQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    (async () => {
      const stored = await getStoredPushRegistrationState();
      if (mounted) setPushState(stored);
      const registered = await registerPushNotifications({ prompt: false });
      if (mounted) setPushState(registered);
    })().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const savePrefs = useMutation({
    mutationFn: (nextPrefs: { orderUpdates: boolean; promotions: boolean }) =>
      notificationsApi.updatePreferences(nextPrefs),
    onSuccess: async () => {
      await refreshNotificationPreferences(queryClient);
      Alert.alert('Preferences saved', 'Your notification choices were updated.');
    },
    onError: (error: { message?: string }) => {
      Alert.alert('Could not save preferences', error?.message || 'Try again when your connection is stable.');
    },
  });

  const handleEnablePush = async () => {
    if (pushState.status === 'denied' && pushState.canAskAgain === false) {
      Linking.openSettings().catch(() => undefined);
      return;
    }
    setPushBusy(true);
    try {
      const nextState = await registerPushNotifications({ prompt: true });
      setPushState(nextState);
    } finally {
      setPushBusy(false);
    }
  };

  const renderPreferenceRow = ({
    title,
    description,
    value,
    onValueChange,
  }: {
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.label}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={value ? styles.enabledText : styles.disabledText}>
          {value ? 'Enabled' : 'Off'}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={savePrefs.isPending}
        trackColor={{ false: BRAND.border, true: BRAND.primary }}
      />
    </View>
  );

  if (!isAuthenticated) {
    return (
      <Screen style={styles.container}>
        <ErrorState
          title="Sign in required"
          message="Sign in to manage notification preferences for your shopper account."
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Notification delivery</Text>
        <Text style={styles.subtitle}>
          Control push and account alerts for orders, bookings, disputes, and marketplace updates.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Push notification status</Text>
        <Text style={styles.description}>{pushState.message}</Text>
        {pushState.updatedAt ? (
          <Text style={styles.metaText}>
            Last checked {new Date(pushState.updatedAt).toLocaleString()}
          </Text>
        ) : null}
        <Pressable
          onPress={handleEnablePush}
          disabled={pushBusy}
          accessibilityRole="button"
          accessibilityLabel={pushState.status === 'denied' && pushState.canAskAgain === false ? 'Open notification settings' : 'Enable push notifications'}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.pressed,
            pushBusy && styles.disabledButton,
          ]}
        >
          <Text style={styles.actionText}>
            {pushBusy
              ? 'Checking...'
              : pushState.status === 'denied' && pushState.canAskAgain === false
                ? 'Open device settings'
                : pushState.status === 'registered'
                  ? 'Refresh registration'
                  : 'Enable push alerts'}
          </Text>
        </Pressable>
      </View>

      {prefsQuery.isLoading ? (
        <LoadingState label="Loading notification preferences" />
      ) : prefsQuery.isError ? (
        <ErrorState
          title="Could not load preferences"
          message="Retry when your connection is stable."
          onRetry={() => prefsQuery.refetch()}
        />
      ) : (
        <>
          {renderPreferenceRow({
            title: 'Order and booking updates',
            description: 'Delivery, payment, confirmation, and dispute updates.',
            value: orderUpdates,
            onValueChange: (v) => {
              setOrderUpdates(v);
              savePrefs.mutate({ orderUpdates: v, promotions });
            },
          })}
          {renderPreferenceRow({
            title: 'Promotions',
            description: 'Deals, recommendations, and marketplace announcements.',
            value: promotions,
            onValueChange: (v) => {
              setPromotions(v);
              savePrefs.mutate({ orderUpdates, promotions: v });
            },
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  hero: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
  },
  title: { color: BRAND.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: BRAND.muted, lineHeight: 20, marginTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    gap: 8,
  },
  cardTitle: { color: BRAND.text, fontWeight: '800', fontSize: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 12,
  },
  rowCopy: { flex: 1, gap: 4 },
  label: { fontWeight: '600', color: BRAND.text },
  description: { color: BRAND.muted, lineHeight: 20 },
  metaText: { color: BRAND.muted, fontSize: 12 },
  enabledText: { color: BRAND.primary, fontSize: 12, fontWeight: '700' },
  disabledText: { color: BRAND.muted, fontSize: 12, fontWeight: '700' },
  actionButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: BRAND.primary,
    paddingHorizontal: 16,
  },
  actionText: { color: '#fff', fontWeight: '800' },
  pressed: { opacity: 0.9 },
  disabledButton: { opacity: 0.7 },
});
