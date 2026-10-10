import React from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';
import { RADIUS, TOUCH_TARGET } from '@/constants/sizing';
import { getBillingLockCopy, SUPPORT_EMAIL, type BillingStatus } from '@/utils/billingLock';

type Props = {
  billing: BillingStatus | null;
  onRecheck: () => void;
  rechecking: boolean;
};

/** Whole-app block while the workspace is locked (mobile counterpart of the web BillingLockedScreen). */
export function BillingLockedScreen({ billing, onRecheck, rechecking }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { memberships, activeTenant, logout } = useAuth();
  const { bg, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const { title, description } = getBillingLockCopy(billing);
  const canSwitchWorkspace = memberships.length > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.iconWrap}>
          <AppIcon name="lock" size={28} color={BRAND_GREEN} />
        </View>
        {activeTenant?.name ? <Text style={[styles.workspace, { color: mutedColor }]}>{activeTenant.name}</Text> : null}
        <Text style={[styles.title, { color: textColor }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.description, { color: mutedColor }]}>{description}</Text>

        <ActionButton
          primary
          icon="mail"
          label="Contact support"
          onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}); }}
        />
        <ActionButton
          icon="refresh"
          label={rechecking ? 'Checking…' : 'Check again'}
          loading={rechecking}
          onPress={onRecheck}
          textColor={textColor}
          borderColor={borderColor}
        />
        {canSwitchWorkspace ? (
          <ActionButton
            icon="users"
            label="Switch workspace"
            onPress={() => router.push('/settings' as never)}
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => { void logout(); }} style={styles.signOut}>
          <Text style={[styles.signOutText, { color: mutedColor }]}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  primary = false,
  loading = false,
  textColor,
  borderColor,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
  textColor?: string;
  borderColor?: string;
}) {
  const color = primary ? '#fff' : textColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: BRAND_GREEN } : { borderWidth: 1, borderColor },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <AppIcon name={icon} size={18} color={color} />}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'stretch' },
  iconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.12)',
    marginBottom: 16,
  },
  workspace: { textAlign: 'center', fontSize: 13, marginBottom: 4 },
  title: { textAlign: 'center', fontSize: 20, fontWeight: '600' },
  description: { textAlign: 'center', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  button: {
    minHeight: TOUCH_TARGET.standard,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  signOut: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  signOutText: { fontSize: 15 },
});
