import React from 'react';
import Animated from 'react-native-reanimated';
import { useFadeInAnimation } from '../../utils/animations';
import { ViewStyle } from 'react-native';

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  style?: ViewStyle;
  delay?: number;
}

/**
 * Animated List Item Component with fade-in and slide-up animation
 * Use this to wrap items in FlatList for smooth entrance animations
 */
const AnimatedListItem: React.FC<AnimatedListItemProps> = ({
  children,
  index,
  style,
  delay = 50,
}) => {
  const animatedStyle = useFadeInAnimation(index, delay);

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

export default AnimatedListItem;
