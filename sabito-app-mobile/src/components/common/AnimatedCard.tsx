import React from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCardPressAnimation } from '../../utils/animations';
import { StyleSheet, ViewStyle } from 'react-native';

interface AnimatedCardProps {
  children: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

/**
 * Animated Card Component with press scale animation
 */
const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  onPress,
  style,
  disabled = false,
}) => {
  const { animatedStyle, handlePressIn, handlePressOut } = useCardPressAnimation();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.card, style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    // Base styles will be passed via style prop
  },
});

export default AnimatedCard;
