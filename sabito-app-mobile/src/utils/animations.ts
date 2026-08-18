import React from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';

/**
 * Animation constants for consistent timing across the app
 */
export const ANIMATIONS = {
  // Quick feedback (buttons, cards)
  QUICK: {
    duration: 150,
    easing: Easing.out(Easing.ease),
  },
  
  // Standard transitions (screens, modals)
  STANDARD: {
    duration: 250,
    easing: Easing.inOut(Easing.ease),
  },
  
  // Smooth entrances (lists, cards)
  SMOOTH: {
    duration: 300,
    easing: Easing.out(Easing.ease),
  },
};

/**
 * Scale values for press animations (more pronounced for better visibility)
 */
export const SCALES = {
  PRESS: 0.92,      // Cards (8% scale down - more noticeable)
  BUTTON: 0.88,     // Buttons (12% scale down - very noticeable)
  ICON: 0.85,       // Icons (15% scale down - highly visible)
};

/**
 * Hook for card press animation (scale with spring for better visibility)
 */
export const useCardPressAnimation = () => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(SCALES.PRESS, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });
  };

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
};

/**
 * Hook for button press animation (scale with spring for better visibility)
 */
export const useButtonPressAnimation = () => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(SCALES.BUTTON, {
      damping: 12,
      stiffness: 400,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 400,
    });
  };

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
};

/**
 * Hook for icon press animation (scale with spring for better visibility)
 */
export const useIconPressAnimation = () => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(SCALES.ICON, {
      damping: 10,
      stiffness: 500,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 10,
      stiffness: 500,
    });
  };

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
};

/**
 * Hook for fade-in animation (for list items with stagger - more pronounced)
 */
export const useFadeInAnimation = (index: number = 0, delay: number = 50) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30); // Increased from 20 to 30 for more visible slide

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  React.useEffect(() => {
    const totalDelay = index * delay;
    setTimeout(() => {
      opacity.value = withSpring(1, {
        damping: 20,
        stiffness: 100,
      });
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 100,
      });
    }, totalDelay);
  }, [index, delay]);

  return animatedStyle;
};
