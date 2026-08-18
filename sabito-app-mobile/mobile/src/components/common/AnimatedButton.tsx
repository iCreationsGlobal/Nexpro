import React from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useButtonPressAnimation } from '../../utils/animations';
import { StyleSheet, ViewStyle } from 'react-native';

interface AnimatedButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

/**
 * Animated Button Component with press scale animation
 */
const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  onPress,
  style,
  disabled = false,
}) => {
  const { animatedStyle, handlePressIn, handlePressOut } = useButtonPressAnimation();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.button, style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    // Base styles will be passed via style prop
  },
});

export default AnimatedButton;
