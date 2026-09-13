import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';

type UserAvatarProps = {
  size?: number;
  onPress?: () => void;
  name?: string | null;
  email?: string | null;
  profilePicture?: string | null;
  accessibilityLabel?: string;
};

/**
 * Circular user avatar with image or initial fallback.
 */
export function UserAvatar({
  size = 36,
  onPress,
  name,
  email,
  profilePicture,
  accessibilityLabel = 'Open account',
}: UserAvatarProps) {
  const { user } = useAuth();
  const { colors } = useScreenColors();
  const [imageFailed, setImageFailed] = useState(false);

  const resolvedName = name ?? user?.name ?? '';
  const resolvedEmail = email ?? user?.email ?? '';
  const avatarUrl = useMemo(
    () => resolveDisplayImageUrl(profilePicture ?? user?.profilePicture),
    [profilePicture, user?.profilePicture]
  );
  const initial = (resolvedName.trim()?.[0] || resolvedEmail.trim()?.[0] || '?').toUpperCase();
  const showImage = !!avatarUrl && !imageFailed;
  const hitSize = Math.max(44, size);

  const avatar = (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: showImage ? 'transparent' : colors.tint,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          onError={() => setImageFailed(true)}
          accessibilityLabel={accessibilityLabel}
        />
      ) : initial === '?' ? (
        <AppIcon name="user" size={Math.round(size * 0.45)} color="#fff" />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>{initial}</Text>
      )}
    </View>
  );

  if (!onPress) return avatar;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.hitTarget,
        { width: hitSize, height: hitSize },
        pressed && styles.pressed,
      ]}
    >
      {avatar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: '#fff',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
