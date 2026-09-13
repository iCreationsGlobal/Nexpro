import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useScreenColors } from '@/hooks/useScreenColors';
import { TOUCH_TARGET, BORDER_WIDTH } from '@/constants/sizing';

type IconButtonVariant = 'outline' | 'filled' | 'ghost';

interface IconButtonProps {
  icon: AppIconName;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  variant?: IconButtonVariant;
  color?: string;
  borderColor?: string;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Square icon-only button. `size` is clamped to TOUCH_TARGET.compact so a
 * caller can never regress below the app-wide minimum touch target.
 */
export function IconButton({
  icon,
  onPress,
  size = TOUCH_TARGET.compact,
  iconSize = 18,
  variant = 'outline',
  color,
  borderColor,
  disabled,
  hitSlop = 8,
  style,
  accessibilityLabel,
}: IconButtonProps) {
  const { colors, borderColor: defaultBorderColor } = useScreenColors();
  const boxSize = Math.max(size, TOUCH_TARGET.compact);
  const tint = color ?? colors.tint;
  const resolvedBorderColor = borderColor ?? defaultBorderColor;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        {
          width: boxSize,
          height: boxSize,
          borderRadius: boxSize / 2,
        },
        variant === 'outline' && { borderWidth: BORDER_WIDTH.standard, borderColor: resolvedBorderColor },
        variant === 'filled' && { backgroundColor: tint },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <AppIcon name={icon} size={iconSize} color={variant === 'filled' ? '#fff' : tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
