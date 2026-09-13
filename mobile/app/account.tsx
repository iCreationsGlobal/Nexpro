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

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/context/AuthContext';
import { resetLocalSessionForOnboardingTest } from '@/utils/devSessionReset';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { standaloneButtonStyles } from '@/styles/standaloneButton';

const AVATAR_SIZE = 104;

type LinkItem = {
  id: string;
  label: string;
  icon: AppIconName;
  route: string;
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout, isDriver } = useAuth();
  const { cardBg, borderColor, textColor, mutedColor, colors, danger } = useScreenColors();

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

  const handleEditProfile = useCallback(() => {
    router.push({ pathname: '/profile', params: { edit: '1' } });
  }, [router]);

  const linkItems: LinkItem[] = isDriver
    ? []
    : [
        {
          id: 'settings',
          label: 'Settings',
          icon: 'cog',
          route: '/settings',
        },
        {
          id: 'privacy',
          label: 'Privacy Policy',
          icon: 'info-circle',
          route: '/privacy-policy',
        },
      ];

  const isEmailVerified = Boolean(user?.emailVerifiedAt);
  const displayName = user?.name?.trim() || 'User';
  const displayEmail = user?.email?.trim() || '';

  const headerEditAction = (
    <Pressable
      onPress={handleEditProfile}
      accessibilityRole="button"
      accessibilityLabel="Edit profile"
      hitSlop={8}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <AppIcon name="pencil" size={20} color={textColor} />
    </Pressable>
  );

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader title="Account" right={headerEditAction} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <UserAvatar
            size={AVATAR_SIZE}
            onPress={handleEditProfile}
            accessibilityLabel="View and edit profile"
          />
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: textColor }]} numberOfLines={2}>
              {displayName}
            </Text>
            {isEmailVerified ? (
              <AppIcon name="check-circle" size={18} color={colors.tint} />
            ) : null}
          </View>
          {displayEmail ? (
            <Text style={[styles.email, { color: mutedColor }]} numberOfLines={1}>
              {displayEmail}
            </Text>
          ) : null}
          <Pressable
            onPress={handleEditProfile}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={({ pressed }) => [styles.editLink, pressed && styles.pressed]}
          >
            <Text style={[styles.editLinkText, { color: mutedColor }]}>Tap to edit profile</Text>
          </Pressable>
        </View>

        {linkItems.length > 0 ? (
          <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor }]}>
            {linkItems.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(item.route as never)}
                style={({ pressed }) => [
                  styles.linkRow,
                  index > 0 && styles.rowBorder,
                  { borderTopColor: borderColor },
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon name={item.icon} size={22} color={textColor} />
                <Text style={[styles.linkLabel, { color: textColor }]}>{item.label}</Text>
                <AppIcon name="chevron-right" size={18} color={mutedColor} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {__DEV__ && !isDriver ? (
          <Pressable
            onPress={handleResetOnboardingTestSession}
            style={({ pressed }) => [
              standaloneButtonStyles.outline,
              { borderColor: danger, marginTop: 16 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={{ color: danger, fontWeight: '600' }}>Reset onboarding test session</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out"
          style={({ pressed }) => [
            standaloneButtonStyles.outline,
            { borderColor: danger, marginTop: 24 },
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name="sign-out" size={18} color={danger} />
          <Text style={[styles.logoutText, { color: danger }]}>Log out</Text>
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 28,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  email: {
    fontSize: 15,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  editLink: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editLinkText: {
    fontSize: 13,
  },
  menuCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  linkLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  rowBorder: { borderTopWidth: 1 },
  logoutText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
