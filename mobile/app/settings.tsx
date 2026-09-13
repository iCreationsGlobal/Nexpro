import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useScanToSell } from '@/hooks/useScanToSell';
import { settingsService } from '@/services/settings';
import { isRentalBusinessType, resolveBusinessType } from '@/constants';
import { authService } from '@/services/auth';
import { getErrorMessage } from '@/utils/errorMessages';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { standaloneButtonStyles } from '@/styles/standaloneButton';

type SettingsLink = {
  id: string;
  label: string;
  subtitle?: string;
  icon: AppIconName;
  route?: string;
  onPress?: () => void;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, memberships, activeTenantId, setActiveTenantId, refreshAuth, activeTenant, hasFeature } =
    useAuth();
  const { theme, setTheme } = useTheme();
  const { scanToSell, setScanToSell, isLoading: loadingScanToSell } = useScanToSell();
  const { colors, cardBg, borderColor, textColor, mutedColor, resolvedTheme } = useScreenColors();
  const [resendLoading, setResendLoading] = useState(false);

  const businessType = activeTenant?.businessType ?? 'printing_press';
  const isStudio = resolveBusinessType(businessType) === 'studio';
  const isRental = isRentalBusinessType(businessType);
  const showPosSettings = !isStudio && !isRental && hasFeature('products');

  useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => settingsService.getProfile(),
  });

  const handleSelectTenant = useCallback(
    async (tenantId: string) => {
      if (tenantId !== activeTenantId) {
        await setActiveTenantId(tenantId);
      }
    },
    [activeTenantId, setActiveTenantId]
  );

  const handleResendVerification = useCallback(async () => {
    setResendLoading(true);
    try {
      await authService.resendVerification();
      Alert.alert('Done', 'Verification email sent. Check your inbox.');
      await refreshAuth();
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to send verification email.'));
    } finally {
      setResendLoading(false);
    }
  }, [refreshAuth]);

  const accountLinks = useMemo<SettingsLink[]>(
    () => [
      {
        id: 'profile',
        label: 'Profile',
        subtitle: 'Name, photo, and password',
        icon: 'user',
        route: '/profile',
      },
      {
        id: 'notifications-inbox',
        label: 'Notification inbox',
        subtitle: 'View recent alerts',
        icon: 'bell',
        route: '/notifications',
      },
      {
        id: 'notification-settings',
        label: 'Notification settings',
        subtitle: 'Push alerts and email preferences',
        icon: 'cog',
        route: '/notification-settings',
      },
      {
        id: 'reset-password',
        label: 'Reset password',
        subtitle: 'Email a reset link',
        icon: 'lock',
        onPress: () =>
          router.push({
            pathname: '/forgot-password',
            params: user?.email ? { email: user.email } : undefined,
          }),
      },
      {
        id: 'data-deletion',
        label: 'Delete account/data',
        subtitle: 'Request account and content deletion',
        icon: 'trash',
        route: '/data-deletion',
      },
    ],
    [router, user?.email]
  );

  const showVerifyEmail = Boolean(user && !user.emailVerifiedAt);

  const activeRowBg = resolvedTheme === 'dark' ? '#3f3f46' : '#f3f4f6';
  const brand = colors.tint;

  const renderLinkRow = (item: SettingsLink, index: number, total: number) => (
    <Pressable
      key={item.id}
      onPress={() => {
        if (item.onPress) item.onPress();
        else if (item.route) router.push(item.route as never);
      }}
      style={({ pressed }) => [
        styles.linkRow,
        index > 0 && styles.rowBorder,
        { borderTopColor: borderColor },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={item.icon} size={20} color={brand} />
      <View style={styles.linkTextWrap}>
        <Text style={[styles.linkLabel, { color: textColor }]}>{item.label}</Text>
        {item.subtitle ? (
          <Text style={[styles.linkSubtitle, { color: mutedColor }]}>{item.subtitle}</Text>
        ) : null}
      </View>
      <AppIcon name="chevron-right" size={14} color={mutedColor} />
    </Pressable>
  );

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader
        title="Settings"
        subtitle="Account, workspace, and appearance."
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {showVerifyEmail ? (
          <View style={[styles.banner, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.bannerTitle, { color: textColor }]}>Verify your email</Text>
            <Text style={[styles.bannerText, { color: mutedColor }]}>
              Confirm {user?.email} to secure your account and receive important updates.
            </Text>
            <Pressable
              onPress={handleResendVerification}
              disabled={resendLoading}
              style={({ pressed }) => [
                standaloneButtonStyles.outline,
                { borderColor: brand },
                pressed && styles.pressed,
                resendLoading && styles.disabled,
              ]}
            >
              {resendLoading ? (
                <ActivityIndicator color={brand} size="small" />
              ) : (
                <Text style={[styles.bannerButtonText, { color: brand }]}>Resend verification email</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: textColor }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          {accountLinks.map((item, index) => renderLinkRow(item, index, accountLinks.length))}
        </View>

        <Text style={[styles.sectionTitle, { color: textColor }]}>Workspace</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          {memberships.length === 0 ? (
            <Text style={[styles.emptyText, { color: mutedColor }]}>No workspaces</Text>
          ) : (
            memberships.map((m, index) => {
              const isActive = m.tenantId === activeTenantId;
              const name = m.tenant?.name ?? `Workspace ${m.tenantId.slice(0, 8)}`;
              return (
                <Pressable
                  key={m.tenantId}
                  onPress={() => handleSelectTenant(m.tenantId)}
                  style={({ pressed }) => [
                    styles.tenantRow,
                    index > 0 && styles.rowBorder,
                    { borderTopColor: borderColor },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.tenantInfo}>
                    <Text style={[styles.tenantName, { color: textColor }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.tenantType, { color: mutedColor }]}>
                      {m.tenant?.businessType ?? '—'}
                    </Text>
                  </View>
                  {isActive ? <AppIcon name="check-circle" size={22} color={brand} /> : null}
                </Pressable>
              );
            })
          )}
        </View>

        {showPosSettings ? (
          <>
            <Text style={[styles.sectionTitle, { color: textColor }]}>POS</Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.linkLabel, { color: textColor }]}>Scan to sell</Text>
                  <Text style={[styles.linkSubtitle, { color: mutedColor }]}>
                    When on, scanning a barcode adds the product straight to your cart. When off, scans show
                    the product so you can review before adding.
                  </Text>
                </View>
                {loadingScanToSell ? (
                  <ActivityIndicator color={brand} size="small" />
                ) : (
                  <Switch
                    value={scanToSell}
                    onValueChange={setScanToSell}
                    trackColor={{ false: borderColor, true: `${brand}88` }}
                    thumbColor={scanToSell ? brand : '#f4f4f5'}
                    accessibilityLabel="Scan to sell"
                  />
                )}
              </View>
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: textColor }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          {(
            [
              { key: 'light' as const, label: 'Light', icon: 'sun-o' as AppIconName },
              { key: 'dark' as const, label: 'Dark', icon: 'moon-o' as AppIconName },
              { key: 'system' as const, label: 'System', icon: 'circle-o' as AppIconName },
            ] as const
          ).map((option, index) => {
            const active = theme === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setTheme(option.key)}
                style={({ pressed }) => [
                  styles.prefRow,
                  active && { backgroundColor: activeRowBg },
                  index > 0 && styles.rowBorder,
                  { borderTopColor: borderColor },
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon name={option.icon} size={20} color={active ? brand : mutedColor} />
                <Text style={[styles.prefLabel, { color: textColor }]}>{option.label}</Text>
                {active ? <AppIcon name="check-circle" size={20} color={brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  bannerText: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  bannerButtonText: { fontSize: 14, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  linkTextWrap: { flex: 1 },
  linkLabel: { fontSize: 16, fontWeight: '600' },
  linkSubtitle: { fontSize: 13, marginTop: 2 },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  tenantInfo: { flex: 1 },
  tenantName: { fontSize: 16, fontWeight: '600' },
  tenantType: { fontSize: 13, marginTop: 2 },
  emptyText: { padding: 20, fontSize: 15 },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  prefLabel: { flex: 1, fontSize: 16 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  toggleTextWrap: { flex: 1 },
  rowBorder: { borderTopWidth: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
