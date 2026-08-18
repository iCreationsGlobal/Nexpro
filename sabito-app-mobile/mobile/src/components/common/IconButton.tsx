import React from 'react';
import { StyleSheet, ViewStyle, Pressable } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { useIconPressAnimation } from '../../utils/animations';
import COLORS from '../../constants/colors';
import { ICON_SIZES } from '../../constants/icons';

interface IconButtonProps {
  Icon: LucideIcon;
  onPress: () => void;
  size?: number;
  color?: string;
  style?: ViewStyle;
  variant?: 'default' | 'filled' | 'outlined';
  disabled?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({
  Icon,
  onPress,
  size = ICON_SIZES.md,
  color = COLORS.APP_GREEN,
  style,
  variant = 'default',
  disabled = false,
}) => {
  const getButtonStyle = () => {
    const baseStyle: ViewStyle[] = [styles.button];
    
    if (variant === 'filled') {
      baseStyle.push(styles.filled);
    } else if (variant === 'outlined') {
      baseStyle.push(styles.outlined);
    }
    
    if (disabled) {
      baseStyle.push(styles.disabled);
    }
    
    return baseStyle;
  };

  const getIconColor = () => {
    if (disabled) return COLORS.GRAY;
    if (variant === 'filled') return COLORS.WHITE;
    return color;
  };

  const { animatedStyle, handlePressIn, handlePressOut } = useIconPressAnimation();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[...getButtonStyle(), style, animatedStyle]}>
        <Icon size={size} color={getIconColor()} strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filled: {
    backgroundColor: COLORS.APP_GREEN,
  },
  outlined: {
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default IconButton;

