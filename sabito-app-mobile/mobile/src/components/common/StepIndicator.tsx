import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import COLORS from '../../constants/colors';

interface StepIndicatorProps {
  currentStep?: number;
  totalSteps?: number;
}

interface AnimatedDotProps {
  index: number;
  currentStep: number;
}

const AnimatedDot: React.FC<AnimatedDotProps> = ({ index, currentStep }) => {
  const isCurrent = index === currentStep - 1; // Current active step
  const isCompleted = index < currentStep - 1; // Completed steps
  const width = useRef(new Animated.Value(isCurrent ? 24 : 8)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: isCurrent ? 24 : 8, // Only current step is 24px, rest are 8px
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentStep, isCurrent, width]);

  // Determine color: green if current or completed, gray if upcoming
  const backgroundColor = (isCurrent || isCompleted) ? COLORS.APP_GREEN : COLORS.STROKE_COLOR;

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width,
          backgroundColor,
        },
      ]}
    />
  );
};

/**
 * Step Indicator Component
 * Shows progress through multi-step forms
 */
const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep = 1, totalSteps = 4 }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <AnimatedDot key={index} index={index} currentStep={currentStep} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4, // 4px gap between indicators
  },
  dot: {
    height: 8,
    borderRadius: 4, // Pill shape
  },
});

export default StepIndicator;

