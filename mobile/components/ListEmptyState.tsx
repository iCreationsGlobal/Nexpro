import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { EMPTY_STATE_IMAGES, type EmptyStateImageKey } from '@/config/emptyStateImages';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';

export type ListEmptyStateProps = {
  imageKey: EmptyStateImageKey;
  title: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
  children?: React.ReactNode;
  /** Fill remaining vertical space (use for standalone empty views outside FlatList). */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  /** Text/icon color on the button fill (defaults to white). */
  contentColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const actionButtonStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButton: {
    alignSelf: 'stretch',
    width: '100%',
  },
  listButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  buttonPressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

/** Primary CTA placed after empty-state title/subtitle. */
export function EmptyStateActionButton({
  label,
  onPress,
  backgroundColor = BRAND_GREEN,
  contentColor = '#fff',
  disabled = false,
  style,
}: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        actionButtonStyles.button,
        actionButtonStyles.emptyButton,
        { backgroundColor },
        style,
        pressed && actionButtonStyles.buttonPressed,
        disabled && actionButtonStyles.buttonDisabled,
      ]}
    >
      <AppIcon name="plus" size={18} color={contentColor} />
      <Text style={[actionButtonStyles.buttonText, { color: contentColor }]}>{label}</Text>
    </Pressable>
  );
}

/** Primary CTA at the top of a list when it already has items. */
export function ListActionButton({
  label,
  onPress,
  backgroundColor = BRAND_GREEN,
  contentColor = '#fff',
  disabled = false,
  style,
}: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        actionButtonStyles.button,
        actionButtonStyles.listButton,
        { backgroundColor },
        style,
        pressed && actionButtonStyles.buttonPressed,
        disabled && actionButtonStyles.buttonDisabled,
      ]}
    >
      <AppIcon name="plus" size={18} color={contentColor} />
      <Text style={[actionButtonStyles.buttonText, { color: contentColor }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Centered list empty state with bundled illustration (web + mobile parity).
 */
export function ListEmptyState({
  imageKey,
  title,
  subtitle,
  titleColor,
  subtitleColor,
  children,
  fill = false,
  style,
  imageStyle,
}: ListEmptyStateProps) {
  const { textColor, mutedColor, cardBg, borderColor } = useScreenColors();
  const resolvedTitleColor = titleColor ?? textColor;
  const resolvedSubtitleColor = subtitleColor ?? mutedColor;

  return (
    <View style={[styles.empty, fill && styles.emptyFill, style]}>
      <View style={[styles.imageCircle, { backgroundColor: cardBg, borderColor }]}>
        <Image
          source={EMPTY_STATE_IMAGES[imageKey]}
          style={[styles.emptyImage, imageStyle]}
          resizeMode="contain"
          accessibilityLabel={title}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: resolvedTitleColor }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: resolvedSubtitleColor }]}>{subtitle}</Text>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyFill: {
    flex: 1,
    justifyContent: 'center',
  },
  imageCircle: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emptyImage: {
    width: 260,
    height: 260,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 20,
    gap: 8,
  },
});
