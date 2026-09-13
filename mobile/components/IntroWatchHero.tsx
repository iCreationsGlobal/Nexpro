import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Cpu, Users, ShoppingCart, Coins, ReceiptText, ChevronRight, AlertCircle } from 'lucide-react-native';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily } from '@/constants/typography';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';

export function IntroWatchHero({ width, height }: { width: number; height: number }) {
  const { cardWidth, cardHeight } = getIntroCardLayout(width, height);
  const [chipHeight, setChipHeight] = useState(54);
  const scale = Math.max(0.1, Math.min((cardWidth - 28) / 320, (cardHeight - 64) / 390));
  return (
    <View style={styles.stage} accessible accessibilityLabel="ABS Watch preview. AI Vision camera with visitor detection. 24 visitors, 21 sales, GH₵3,840 revenue. Three transactions need review. Unusual activity detected.">
      <View style={[styles.frame, { width: cardWidth, height: cardHeight }]}>
        <View style={{ width: 320 * scale, height: 390 * scale }}>
          <View style={{ width: 320, height: 390, transform: [{ translateX: (320 * scale - 320) / 2 }, { translateY: (390 * scale - 390) / 2 }, { scale }] }}>
            <View style={styles.header}>
              <Text style={styles.heading}>ABS Watch</Text>
              <View style={styles.badge}><Cpu size={17} color={BRAND_GREEN} /><Text style={styles.badgeText}>AI Vision</Text></View>
            </View>
            <View style={styles.camera}>
              {/* Show only the camera region of the existing illustration. */}
              <Image source={require('@/assets/intro/watch-large.png')} style={styles.cameraImage} resizeMode="stretch" />
            </View>
            <View style={styles.metrics}>
              {[{ label: 'Visitors', value: '24', Icon: Users }, { label: 'Sales', value: '21', Icon: ShoppingCart }, { label: 'Revenue', value: 'GH₵ 3,840', Icon: Coins }].map(({ label, value, Icon }, index) => (
                <View key={label} style={[styles.metric, index < 2 && styles.metricDivider]}>
                  <Icon size={24} color={BRAND_GREEN} strokeWidth={1.7} />
                  <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                  <Text style={styles.label}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.review}><ReceiptText size={21} color={BRAND_GREEN} /><Text style={styles.reviewText}>3 transactions need review</Text><ChevronRight size={17} color="#64748b" /></View>
          </View>
        </View>
      </View>
      <View onLayout={event => setChipHeight(event.nativeEvent.layout.height)} style={[styles.chip, { marginTop: -chipHeight / 2 }]}>
        <View style={styles.chipIcon}><AlertCircle size={22} color="#ea790c" /></View>
        <Text style={styles.chipText}>Unusual activity detected</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 16 },
  frame: { alignItems: 'center', justifyContent: 'center', paddingBottom: 24, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 24, backgroundColor: '#fff', ...INTRO_CARD_SHADOW },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { fontFamily: FontFamily.bold, fontSize: 24, color: '#0f172a' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: '#e8f8ee' },
  badgeText: { fontFamily: FontFamily.medium, fontSize: 12, color: BRAND_GREEN },
  camera: { width: 320, height: 222, overflow: 'hidden', borderRadius: 12, backgroundColor: '#edf2ee' },
  cameraImage: { position: 'absolute', width: 1024 * 320 / 906, height: 1536 * 320 / 906, left: -60 * 320 / 906, top: -224 * 320 / 906 },
  metrics: { flexDirection: 'row', marginVertical: 16 },
  metric: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  metricDivider: { borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  value: { fontFamily: FontFamily.bold, fontSize: 19, color: '#0f172a' },
  label: { fontFamily: FontFamily.regular, fontSize: 12, color: '#7c879b' },
  review: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, borderTopWidth: 1, borderColor: '#e5e7eb' },
  reviewText: { flex: 1, fontFamily: FontFamily.medium, fontSize: 12, color: '#0f172a' },
  chip: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff3e6', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: FontFamily.medium, fontSize: 14, color: BRAND_GREEN },
});
