import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, StyleSheet, View } from 'react-native';
import { BRAND_GREEN } from '@/constants/brand';

/** Startup animation stays visible only while the caller is loading. */
export function AppLoadingScreen({ onLayout }: { onLayout?: () => void }) {
  const entrance = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const bgPhase = useRef(new Animated.Value(0)).current; // 0 = brand green, 1 = white
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);

  /** One-time green → white background phase-in on first mount. */
  useEffect(() => {
    if (reduceMotion) {
      bgPhase.setValue(1);
      return;
    }
    const phase = Animated.timing(bgPhase, {
      toValue: 1,
      duration: 900,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // backgroundColor interpolation isn't supported by the native driver
    });
    phase.start();
    return () => phase.stop();
  }, [bgPhase, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !foreground) {
      entrance.setValue(1);
      glow.setValue(0);
      return;
    }
    entrance.setValue(0);
    const reveal = Animated.timing(entrance, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    reveal.start();
    pulse.start();
    return () => { reveal.stop(); pulse.stop(); };
  }, [entrance, foreground, glow, reduceMotion]);

  const backgroundColor = bgPhase.interpolate({ inputRange: [0, 1], outputRange: [BRAND_GREEN, '#ffffff'] });
  const nameColor = bgPhase.interpolate({ inputRange: [0, 1], outputRange: ['#ffffff', BRAND_GREEN] });
  const glowColor = bgPhase.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.35)', '#c7ecd3'] });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[styles.container, { backgroundColor }]}
      accessible
      accessibilityLabel="ABS is loading"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <Animated.View style={[styles.brand, { opacity: entrance, transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
        <View style={styles.logoWrap}>
          <Animated.View
            style={[
              styles.glow,
              {
                backgroundColor: glowColor,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.16] }) }],
              },
            ]}
          />
          <Image source={require('@/assets/images/abs-logo-icon.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Animated.Text style={[styles.name, { color: nameColor }]}>ABS</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center' },
  logoWrap: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 144, height: 144, borderRadius: 72 },
  logo: { width: 88, height: 88 },
  // System font remains available before the app's custom fonts have loaded.
  name: { fontSize: 32, fontWeight: '700', letterSpacing: 1 },
});
