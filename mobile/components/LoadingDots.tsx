import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

const DOT_SIZE = 10;
const BOUNCE_DURATION = 350;
const STAGGER = 150;

type LoadingDotsProps = {
  color?: string;
  size?: number;
};

/** Three-dot bouncing loader for inline "working on it" states. */
export function LoadingDots({ color = '#fff', size = DOT_SIZE }: LoadingDotsProps) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER),
          Animated.timing(dot, {
            toValue: 1,
            duration: BOUNCE_DURATION,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: BOUNCE_DURATION,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - 1 - i) * STAGGER),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dots refs are stable for the component's lifetime
  }, []);

  return (
    <View style={styles.row}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
              transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    marginHorizontal: 5,
  },
});
