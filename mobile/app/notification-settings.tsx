import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/auth';
import { settingsService } from '@/services/settings';
import { getErrorMessage } from '@/utils/errorMessages';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { standaloneButtonStyles } from '@/styles/standaloneButton';
import {
  getStoredPushRegistrationState,
  registerPushNotifications,
  type PushRegistrationState,
} from '@/utils/pushNotifications';
import {
  NOTIFICATION_PREFERENCE_CATEGORY_LABELS,
  NOTIFICATION_PREFERENCE_CATEGORY_ORDER,
  NOTIFICATION_PREFERENCE_LOCKED_CHANNELS,
  normalizeNotificationPreferences,
  type NotificationPrefsDraft,
} from '@/constants/notificationPreferences';

type NotificationCategoryPrefs = { in_app?: boolean; email?: boolean };

export default function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const { colors, cardBg, borderColor, textColor, mutedColor, resolvedTheme } = useScreenColors();
  const [notificationPrefsDraft, setNotificationPrefsDraft] = useState<NotificationPrefsDraft | null>(null);
  const [pushState, setPushState] = useState<PushRegistrationState | null>(null);
  const [pushLoading, setPushLoading] = useState(false);

  const { data: profileRes, isLoading: loadingProfile } = useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => settingsService.getProfile(),
  });

  const profileData = profileRes?.data ?? profileRes;

  useEffect(() => {
    setNotificationPrefsDraft(normalizeNotificationPreferences(profileData?.notificationPreferences));
  }, [profileData]);

  useEffect(() => {
    let mounted = true;
    getStoredPushRegistrationState().then((state) => {
      if (mounted) setPushState(state);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const notificationCategories = notificationPrefsDraft?.categories;
  const hasNotificationPrefs = Boolean(
    notificationCategories && Object.keys(notificationCategories).length > 0
  );

  const updateNotificationPrefsMutation = useMutation({
    mutationFn: (categories: Record<string, NotificationCategoryPrefs>) =>
      authService.updateNotificationPreferences(categories),
    onSuccess: (body) => {
      if (body?.data?.categories) {
        setNotificationPrefsDraft({
          categories: JSON.parse(JSON.stringify(body.data.categories)),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
      refreshAuth();
      Alert.alert('Saved', 'Notification preferences updated.');
    },
    onError: (error) => {
      Alert.alert('Error', getErrorMessage(error, 'Failed to save notification preferences.'));
    },
  });

  const setNotifChannel = useCallback(
    (categoryKey: string, channel: 'in_app' | 'email', value: boolean) => {
      const lock = NOTIFICATION_PREFERENCE_LOCKED_CHANNELS[categoryKey]?.[channel];
      if (lock) return;
      setNotificationPrefsDraft((prev) => {
        if (!prev?.categories?.[categoryKey]) return prev;
        return {
          categories: {
            ...prev.categories,
            [categoryKey]: {
              ...prev.categories[categoryKey],
              [channel]: value,
            },
          },
        };
      });
    },
    []
  );

  const handleResetNotificationPrefs = useCallback(() => {
    setNotificationPrefsDraft(normalizeNotificationPreferences(profileData?.notificationPreferences));
  }, [profileData]);

  const handleSaveNotificationPrefs = useCallback(() => {
    if (notificationPrefsDraft?.categories) {
      updateNotificationPrefsMutation.mutate(notificationPrefsDraft.categories);
    }
  }, [notificationPrefsDraft, updateNotificationPrefsMutation]);

  const handleEnablePush = useCallback(async () => {
    setPushLoading(true);
    try {
      const state = await registerPushNotifications({ prompt: true });
      setPushState(state);
      if (state.status === 'registered') {
        Alert.alert('Push enabled', state.message);
      } else if (state.status === 'denied') {
        Alert.alert('Push not enabled', state.message);
      }
    } finally {
      setPushLoading(false);
    }
  }, []);

  const activeRowBg = resolvedTheme === 'dark' ? '#3f3f46' : '#f3f4f6';
  const brand = colors.tint;
  const actionsDisabled =
    loadingProfile || !hasNotificationPrefs || updateNotificationPrefsMutation.isPending;

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader
        title="Notification settings"
        subtitle={`In-app and email alerts for ${user?.email || 'your account'}.`}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={[styles.pushStatusBox, { borderColor, backgroundColor: activeRowBg }]}>
            <View style={styles.pushStatusHeader}>
              <AppIcon name="bell" size={18} color={brand} />
              <Text style={[styles.noticeTitle, { color: textColor }]}>Push delivery</Text>
            </View>
            <Text style={[styles.noticeText, { color: mutedColor }]}>
              {pushState?.message || 'Checking push notification status...'}
            </Text>
            {pushState?.updatedAt ? (
              <Text style={[styles.pushMetaText, { color: mutedColor }]}>
                Last checked {new Date(pushState.updatedAt).toLocaleString()}
              </Text>
            ) : null}
            <Pressable
              onPress={handleEnablePush}
              disabled={pushLoading || pushState?.status === 'unsupported' || pushState?.canAskAgain === false}
              style={({ pressed }) => [
                standaloneButtonStyles.outline,
                { borderColor: brand, marginTop: 10 },
                pressed && styles.pressed,
                (pushLoading || pushState?.status === 'unsupported' || pushState?.canAskAgain === false) &&
                  styles.disabled,
              ]}
            >
              {pushLoading ? (
                <ActivityIndicator color={brand} size="small" />
              ) : (
                <Text style={[styles.pushButtonText, { color: brand }]}>
                  {pushState?.status === 'registered' ? 'Refresh push token' : 'Enable push notifications'}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.noticeBox, { borderColor, backgroundColor: activeRowBg }]}>
            <Text style={[styles.noticeTitle, { color: textColor }]}>Security and account email</Text>
            <Text style={[styles.noticeText, { color: mutedColor }]}>
              Password reset, email verification, and workspace invitations are sent when required. They are not
              controlled by these toggles.
            </Text>
          </View>

          {loadingProfile || !hasNotificationPrefs ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={brand} />
              <Text style={[styles.loadingText, { color: mutedColor }]}>Loading preferences…</Text>
            </View>
          ) : (
            <>
              <View style={[styles.notifHeaderRow, { borderBottomColor: borderColor, backgroundColor: activeRowBg }]}>
                <Text style={[styles.notifHeaderCell, styles.notifCategoryCell, { color: mutedColor }]}>
                  Category
                </Text>
                <Text style={[styles.notifHeaderCell, { color: mutedColor }]}>In-app</Text>
                <Text style={[styles.notifHeaderCell, { color: mutedColor }]}>Email</Text>
              </View>
              {(NOTIFICATION_PREFERENCE_CATEGORY_ORDER ?? []).map((key) => {
                const row = notificationCategories?.[key];
                if (!row) return null;
                const label = NOTIFICATION_PREFERENCE_CATEGORY_LABELS[key] || key;
                const lockedChannels = NOTIFICATION_PREFERENCE_LOCKED_CHANNELS[key] || {};
                return (
                  <View key={key} style={[styles.notifRow, { borderBottomColor: borderColor }]}>
                    <View style={styles.notifCategoryCell}>
                      <Text style={[styles.notifLabel, { color: textColor }]}>{label}</Text>
                      {key === 'user' ? (
                        <Text style={[styles.notifSubLabel, { color: mutedColor }]}>
                          Invitation messages are always delivered.
                        </Text>
                      ) : null}
                    </View>
                    {(['in_app', 'email'] as const).map((channel) => {
                      const lock = lockedChannels[channel];
                      if (lock === 'not_applicable') {
                        return (
                          <View key={channel} style={styles.notifSwitchCell}>
                            <Text style={[styles.notifNa, { color: mutedColor }]}>—</Text>
                          </View>
                        );
                      }
                      const checked =
                        lock === 'always_on'
                          ? true
                          : channel === 'email'
                            ? row.email === true
                            : row.in_app !== false;
                      return (
                        <View key={channel} style={styles.notifSwitchCell}>
                          <Switch
                            value={checked}
                            disabled={!!lock}
                            onValueChange={(v) => setNotifChannel(key, channel, v)}
                            trackColor={{ false: borderColor, true: `${brand}88` }}
                            thumbColor={checked ? brand : '#f4f4f5'}
                          />
                          {lock === 'always_on' ? (
                            <Text style={[styles.notifLockLabel, { color: mutedColor }]}>Always on</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handleResetNotificationPrefs}
            disabled={actionsDisabled}
            style={({ pressed }) => [
              styles.pairedButton,
              styles.pairedOutlineButton,
              { borderColor },
              pressed && styles.pressed,
              actionsDisabled && styles.disabled,
            ]}
          >
            <Text style={[styles.resetButtonText, { color: textColor }]}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveNotificationPrefs}
            disabled={actionsDisabled}
            style={({ pressed }) => [
              styles.pairedButton,
              styles.pairedPrimaryButton,
              { backgroundColor: brand },
              pressed && styles.pressed,
              actionsDisabled && styles.disabled,
            ]}
          >
            {updateNotificationPrefsMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save preferences</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  noticeBox: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pushStatusBox: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pushStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  noticeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  pushMetaText: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  pushButtonText: { fontSize: 13, fontWeight: '600' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
  },
  loadingText: { fontSize: 14 },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginTop: 12,
  },
  notifHeaderCell: { fontSize: 12, fontWeight: '600', textAlign: 'center', width: 72 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  notifCategoryCell: { flex: 1, width: undefined, textAlign: 'left' },
  notifLabel: { fontSize: 14, fontWeight: '600' },
  notifSubLabel: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  notifSwitchCell: { width: 72, alignItems: 'center' },
  notifNa: { fontSize: 12 },
  notifLockLabel: { fontSize: 10, marginTop: 4 },
  actions: { marginTop: 16, flexDirection: 'row', gap: 12 },
  pairedButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pairedOutlineButton: { borderWidth: 1 },
  pairedPrimaryButton: {},
  resetButtonText: { fontSize: 15, fontWeight: '600' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
