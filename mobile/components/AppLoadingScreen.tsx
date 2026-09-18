import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BOOT_GREEN, bootSymbol } from '@/utils/bootArtwork';
import { bootPatternLayers } from '@/utils/bootPattern';

/** Local artwork and native-driven motion keep startup independent of network requests. */
export function AppLoadingScreen({ onLayout, animate = false }: { onLayout?: () => void; animate?: boolean }) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / 420, height / 700, 1.35);
  const motion = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    let animations: Animated.CompositeAnimation[] = [];
    const stop = () => {
      animations.forEach(animation => animation.stop());
      animations = [];
      motion.forEach(value => value.setValue(0));
      pulse.setValue(0);
    };
    const configure = (reduced: boolean) => {
      if (!mounted) return;
      stop();
      if (reduced || !animate) return;
      animations = motion.map((value, index) => Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 3000 + index * 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 3000 + index * 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])));
      animations.push(Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
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
  }, [animate, motion, pulse]);

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
        <View style={{ height: 90 * scale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <SvgXml xml={bootSymbol} width={100 * scale} height={94 * scale} />
          <Text allowFontScaling={false} style={[styles.letters, { fontSize: 108 * scale, lineHeight: 116 * scale }]}>BS</Text>
        </View>
        <Text allowFontScaling={false} adjustsFontSizeToFit numberOfLines={1} style={[styles.subtitle, { fontSize: 22 * scale, marginTop: 12 * scale }]}>African Business Suite</Text>
      </View>
      <Animated.View style={[styles.indicator, { bottom: height * 0.155, width: 76 * scale, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), transform: [{ scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BOOT_GREEN, alignItems: 'center', overflow: 'hidden' },
  pattern: { position: 'absolute', bottom: -20 },
  brand: { position: 'absolute' },
  letters: { color: '#fff', fontWeight: '900', letterSpacing: -4, includeFontPadding: false },
  subtitle: { color: '#fff', textAlign: 'center', fontWeight: '400' },
  indicator: { position: 'absolute', height: 3, borderRadius: 3, backgroundColor: '#b5ed00' },
});
