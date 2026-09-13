import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, Text, View } from 'react-native';
import { ShoppingCart, Pill, Scissors, Printer, UtensilsCrossed, MonitorSmartphone } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { AppBrandLogo } from '@/components/AppBrandLogo';
import { BRAND_GREEN } from '@/constants/brand';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';
import { FontFamily } from '@/constants/typography';

const services = [
  { label: 'Retail', Icon: ShoppingCart, x: 55, y: 85 },
  { label: 'Pharmacy', Icon: Pill, x: 175, y: 48 },
  { label: 'Salon', Icon: Scissors, x: 295, y: 85 },
  { label: 'Services', Icon: Printer, x: 55, y: 300 },
  { label: 'Restaurant', Icon: UtensilsCrossed, x: 175, y: 342 },
  { label: 'Rental', Icon: MonitorSmartphone, x: 295, y: 300 },
];

export function IntroBusinessHero({ width, height, active }: { width: number; height: number; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [chipHeight, setChipHeight] = useState(40);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const { cardWidth, cardHeight } = getIntroCardLayout(width, height);
  const scale = Math.max(0.1, Math.min((cardWidth - 22) / 350, (cardHeight - 46) / 400));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    progress.setValue(0);
    if (!active || reduceMotion || !foreground) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(700),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, foreground, progress, reduceMotion]);

  return (
    <View style={styles.stage} accessible accessibilityLabel="ABS connects Retail, Pharmacy, Salon, Services, Restaurant and Rental businesses.">
      <View style={[styles.heroFrame, { width: cardWidth, height: cardHeight }]}>
      <View style={{ width: 350 * scale, height: 400 * scale }}>
        <View style={{ width: 350, height: 400, transform: [{ translateX: (350 * scale - 350) / 2 }, { translateY: (400 * scale - 400) / 2 }, { scale }] }}>
          <Svg width={350} height={400} style={StyleSheet.absoluteFill}>
            {services.map(({ label, x, y }) => <Path key={label} d={`M175 200 L${x} 200 L${x} ${y}`} fill="none" stroke="#b5dfc7" strokeWidth={1.5} strokeLinejoin="round" />)}
          </Svg>
          {services.map(({ label, Icon, x, y }) => (
            <React.Fragment key={label}>
              {!reduceMotion && active && foreground && <Animated.View style={[styles.pulse, {
                opacity: progress.interpolate({ inputRange: [0, 0.08, 0.75, 0.9, 1], outputRange: [0, 1, 1, 0, 0] }),
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 0.35, 0.75, 1], outputRange: [175, x, x, x] }) },
                  { translateY: progress.interpolate({ inputRange: [0, 0.35, 0.75, 1], outputRange: [200, 200, y, y] }) },
                ],
              }]} />}
              <View style={[styles.service, { left: x - 49, top: y - 44 }]}>
                <Animated.View style={[styles.halo, { opacity: reduceMotion ? 0 : progress.interpolate({ inputRange: [0, 0.65, 0.8, 1], outputRange: [0, 0, 0.8, 0] }) }]} />
                <Icon size={35} color={BRAND_GREEN} strokeWidth={1.8} />
                <Text style={styles.label}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
          <View style={styles.brandOuter}>
          <View style={styles.brand}>
            <AppBrandLogo size={66} style={{ marginBottom: 5 }} />
            <Text style={styles.brandName}>ABS</Text>
          </View>
          </View>
        </View>
      </View>
      </View>
      <View
        onLayout={event => setChipHeight(event.nativeEvent.layout.height)}
        style={[styles.captionChip, { marginTop: -chipHeight / 2 }]}
      >
        <View style={styles.captionIconBackground}>
          <Text style={styles.captionIcon}>✦</Text>
        </View>
        <Text style={styles.caption}>ABS adapts to your business</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 16 },
  heroFrame: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 22, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 24, backgroundColor: '#fff', ...INTRO_CARD_SHADOW },
  service: { position: 'absolute', width: 98, height: 88, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#e5e7eb' },
  halo: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: 22, borderWidth: 1, borderColor: BRAND_GREEN, backgroundColor: '#effbf3' },
  label: { fontFamily: FontFamily.medium, fontSize: 13, color: '#0f172a' },
  brandOuter: { position: 'absolute', left: 113, top: 134, width: 124, height: 132, padding: 6, backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#0f172a', shadowOpacity: 0.09, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 23, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  brandName: { fontFamily: FontFamily.bold, fontSize: 26, color: BRAND_GREEN },
  pulse: { position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', shadowColor: '#22c55e', shadowOpacity: 0.8, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
  captionChip: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff' },
  captionIconBackground: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f8ee' },
  captionIcon: { fontSize: 22, lineHeight: 26, color: BRAND_GREEN },
  caption: { fontFamily: FontFamily.medium, fontSize: 14, color: BRAND_GREEN },
});
