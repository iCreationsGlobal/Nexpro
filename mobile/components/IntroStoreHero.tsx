import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShoppingCart, Sparkles, Wheat, PlugZap, Cookie } from 'lucide-react-native';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily } from '@/constants/typography';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';

const products = [
  { name: 'Verna Soap', price: '4.50', Icon: Sparkles, color: '#a855b5', background: '#faf0fc', detail: 'Beauty soap' },
  { name: 'Golden Pride Rice 5kg', price: '65.00', Icon: Wheat, color: '#c79327', background: '#fcf8ed', detail: 'Jasmine rice' },
  { name: 'Fast Charger', price: '18.00', Icon: PlugZap, color: '#64748b', background: '#f3f5f8', detail: 'Fast charge' },
  { name: 'Chipsy Original 70g', price: '3.00', Icon: Cookie, color: '#e29a16', background: '#fff7e6', detail: 'Original' },
];

export function IntroStoreHero({ width, height }: { width: number; height: number }) {
  const { cardWidth, cardHeight } = getIntroCardLayout(width, height);
  const [chipHeight, setChipHeight] = useState(54);
  const scale = Math.max(0.1, Math.min((cardWidth - 32) / 320, (cardHeight - 64) / 380));
  return (
    <View style={styles.stage} accessible accessibilityLabel="Aseda Store online store preview. Verna Soap GH₵4.50, Golden Pride Rice 5kg GH₵65, Fast Charger GH₵18, Chipsy Original 70g GH₵3. Twelve orders today. New online order.">
      <View style={[styles.frame, { width: cardWidth, height: cardHeight }]}>
        <View style={{ width: 320 * scale, height: 380 * scale }}>
          <View style={{ width: 320, height: 380, transform: [{ translateX: (320 * scale - 320) / 2 }, { translateY: (380 * scale - 380) / 2 }, { scale }] }}>
            <View style={styles.header}>
              <Text style={styles.heading}>Aseda Store</Text>
              <View style={styles.online}><View style={styles.statusDot} /><Text style={styles.onlineText}>Online</Text></View>
            </View>
            <View style={styles.grid}>
              {products.map(({ name, price, Icon, color, background, detail }, index) => (
                <View key={name} style={[styles.product, index % 2 === 0 && styles.leftCell, index < 2 && styles.topCell]}>
                  <View style={[styles.art, { backgroundColor: background }]}>
                    <Icon size={44} color={color} strokeWidth={1.5} />
                    <Text style={[styles.artLabel, { color }]}>{detail}</Text>
                  </View>
                  <Text style={styles.productName} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
                  <Text style={styles.price}>GH₵ {price}</Text>
                </View>
              ))}
            </View>
            <View style={styles.orders}>
              <View style={styles.orderIcon}><ShoppingCart size={22} color={BRAND_GREEN} /></View>
              <Text style={styles.orderText}>12 orders today</Text>
            </View>
          </View>
        </View>
      </View>
      <View onLayout={event => setChipHeight(event.nativeEvent.layout.height)} style={[styles.chip, { marginTop: -chipHeight / 2 }]}>
        <View style={styles.chipIcon}><ShoppingCart size={22} color={BRAND_GREEN} /></View>
        <Text style={styles.chipText}>New online order</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 16 },
  frame: { alignItems: 'center', justifyContent: 'center', paddingBottom: 24, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 24, backgroundColor: '#fff', ...INTRO_CARD_SHADOW },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  heading: { fontFamily: FontFamily.bold, fontSize: 23, color: '#0f172a' },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND_GREEN, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#86efac' },
  onlineText: { fontFamily: FontFamily.semiBold, fontSize: 12, color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  product: { width: '50%', paddingHorizontal: 10, paddingVertical: 9 },
  leftCell: { borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  topCell: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  art: { height: 76, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 7 },
  artLabel: { fontFamily: FontFamily.medium, fontSize: 9 },
  productName: { fontFamily: FontFamily.semiBold, fontSize: 12, color: '#0f172a' },
  price: { fontFamily: FontFamily.medium, fontSize: 12, color: '#64748b', marginTop: 4 },
  orders: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND_GREEN, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  orderIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  orderText: { fontFamily: FontFamily.semiBold, fontSize: 16, color: '#fff' },
  chip: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e8f8ee', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: FontFamily.medium, fontSize: 14, color: BRAND_GREEN },
});
