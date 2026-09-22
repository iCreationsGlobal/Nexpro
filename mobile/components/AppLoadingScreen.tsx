import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BOOT_GREEN } from '@/utils/bootArtwork';
import { bootPatternLayers } from '@/utils/bootPattern';

const logoSource = require('@/assets/images/abs-boot-logo.png');
/** Intrinsic size of assets/images/abs-boot-logo.png — used to keep the logo's aspect ratio at any scale. */
const LOGO_ASPECT = 455 / 194;

/** Local artwork and native-driven motion keep startup independent of network requests. */
export function AppLoadingScreen({ onLayout, animate = false }: { onLayout?: () => void; animate?: boolean }) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / 420, height / 700, 1.35);
  const motion = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    let animations: Animated.CompositeAnimation[] = [];
    const stop = () => {
      animations.forEach(animation => animation.stop());
      animations = [];
      motion.forEach(value => value.setValue(0));
      progress.setValue(0);
    };
    const configure = (reduced: boolean) => {
      if (!mounted) return;
      stop();
      if (reduced || !animate) return;
      animations = motion.map((value, index) => Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 3000 + index * 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 3000 + index * 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])));
      // Indeterminate progress sweep: fill grows from a small stub to the full track width, then
      // resets and grows again — width can't run on the native driver, but this is a single tiny view.
      animations.push(Animated.loop(Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.delay(200),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])));
      animations.forEach(animation => animation.start());
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true;
      configure(reduced);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) configure(reduced);
    }).catch(() => configure(true));
    return () => { mounted = false; subscription.remove(); stop(); };
  }, [animate, motion, progress]);

  return (
    <View onLayout={onLayout} style={styles.container} accessible accessibilityLabel="African Business Suite is loading" accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <StatusBar barStyle="light-content" backgroundColor={BOOT_GREEN} />
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.pattern, { width, height: height * 0.49 }]}>
        {bootPatternLayers.map((xml, index) => (
          <Animated.View key={index} style={[StyleSheet.absoluteFill, {
            opacity: motion[index].interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] }),
            transform: [{ translateY: motion[index].interpolate({ inputRange: [0, 1], outputRange: [0, -14 - index * 5] }) }],
          }]}>
            <SvgXml xml={xml} width="100%" height="100%" preserveAspectRatio="xMidYMin slice" />
          </Animated.View>
        ))}
      </View>
      <View style={[styles.brand, { top: height * 0.405, width: 280 * scale }]}>
        <Image
          source={logoSource}
          resizeMode="contain"
          accessibilityLabel="African Business Suite"
          style={{ width: 260 * scale, height: (260 * scale) / LOGO_ASPECT, alignSelf: 'center' }}
        />
        <Text allowFontScaling={false} adjustsFontSizeToFit numberOfLines={1} style={[styles.subtitle, { fontSize: 22 * scale, marginTop: 12 * scale }]}>African Business Suite</Text>
      </View>
      <View style={[styles.track, { bottom: height * 0.155, width: 76 * scale }]}>
        <Animated.View
          style={[
            styles.fill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: [10 * scale, 76 * scale] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BOOT_GREEN, alignItems: 'center', overflow: 'hidden' },
  pattern: { position: 'absolute', bottom: -20 },
  brand: { position: 'absolute' },
  subtitle: { color: '#fff', textAlign: 'center', fontWeight: '400' },
  track: { position: 'absolute', height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: '#b5ed00' },
});
