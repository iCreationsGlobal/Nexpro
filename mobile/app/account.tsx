import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { resetLocalSessionForOnboardingTest } from '@/utils/devSessionReset';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';

type MenuItem = {
  id: string;
  label: string;
  icon: AppIconName;
  route?: string;
  destructive?: boolean;
  onPress?: () => void;
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout, isDriver } = useAuth();
  const { bg, cardBg, borderColor, textColor, mutedColor, colors } = useScreenColors();

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  }, [logout, router]);

  const handleResetOnboardingTestSession = useCallback(() => {
    Alert.alert(
      'Reset onboarding test session',
      'This clears local auth, intro, workspace, shop, cart, and cached data on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetLocalSessionForOnboardingTest();
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  }, [logout, router]);

  const menuItems: MenuItem[] = isDriver
    ? [
        { id: 'profile', label: 'Profile', icon: 'user', route: '/profile' },
        { id: 'logout', label: 'Log out', icon: 'sign-out', destructive: true, onPress: handleLogout },
      ]
    : [
        { id: 'profile', label: 'Profile', icon: 'user', route: '/profile' },
        { id: 'settings', label: 'Settings', icon: 'cog', route: '/settings' },
        { id: 'privacy', label: 'Privacy Policy', icon: 'info-circle', route: '/privacy-policy' },
        { id: 'data-deletion', label: 'Delete account/data', icon: 'trash', route: '/data-deletion', destructive: true },
        ...(__DEV__
          ? [
              {
                id: 'reset-onboarding-test',
                label: 'Reset onboarding test session',
                icon: 'refresh' as AppIconName,
                destructive: true,
                onPress: handleResetOnboardingTestSession,
              },
            ]
          : []),
        { id: 'logout', label: 'Log out', icon: 'sign-out', destructive: true, onPress: handleLogout },
      ];

  const handleMenuPress = useCallback(
    (item: MenuItem) => {
      if (item.onPress) {
        item.onPress();
      } else if (item.route) {
        router.push(item.route as any);
      }
    },
    [router]
  );

  const avatarUrl = resolveDisplayImageUrl(user?.profilePicture);

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader title="Account" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: cardBg, borderColor }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tint }]}>
              <Text style={styles.avatarInitial}>
                {(user?.name?.trim()?.[0] || user?.email?.[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.name, { color: textColor }]}>{user?.name || 'User'}</Text>
          <Text style={[styles.email, { color: mutedColor }]}>{user?.email}</Text>
        </View>

        <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor }]}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => handleMenuPress(item)}
              style={({ pressed }) => [
                styles.menuRow,
                index > 0 && styles.menuRowBorder,
                { borderTopColor: borderColor },
                pressed && styles.pressed,
              ]}
            >
              <AppIcon
                name={item.icon}
                size={20}
                color={item.destructive ? '#ef4444' : colors.tint}
              />
              <Text
                style={[
                  styles.menuLabel,
                  { color: item.destructive ? '#ef4444' : textColor },
                ]}
              >
                {item.label}
              </Text>
              <AppIcon name="chevron-right" size={14} color={mutedColor} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  profileCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 14 },
  menuCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowBorder: { borderTopWidth: 1 },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  pressed: { opacity: 0.7 },
});
