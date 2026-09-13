import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banknote, Check, CreditCard, Smartphone, Droplets, Wheat, Calculator } from 'lucide-react-native';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily } from '@/constants/typography';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';

/** Native illustration: all details stay sharp as the shared intro frame scales. */
export function IntroPosHero({ width, height }: { width: number; height: number }) {
  const { cardWidth, cardHeight } = getIntroCardLayout(width, height);
  const [chipHeight, setChipHeight] = useState(54);
  const scale = Math.max(0.1, Math.min((cardWidth - 32) / 320, (cardHeight - 56) / 400));
  return (
    <View style={styles.stage} accessible accessibilityLabel="Quick Sale preview. Two bottled waters for GH₵10 and one bread loaf for GH₵35. Total GH₵45, paid with mobile money. Payment successful.">
      <View style={[styles.frame, { width: cardWidth, height: cardHeight }]}>
        <View style={{ width: 320 * scale, height: 400 * scale }}>
          <View style={{ width: 320, height: 400, transform: [{ translateX: (320 * scale - 320) / 2 }, { translateY: (400 * scale - 400) / 2 }, { scale }] }}>
            <View style={styles.row}>
              <Text style={styles.heading}>Quick Sale</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>POS</Text></View>
            </View>
            <Text style={styles.section}>Items</Text>
            {[
              { name: 'Bottled Water', detail: '500ml', quantity: '×2', price: '10.00', Icon: Droplets, color: '#299cca', bg: '#edf8fc' },
              { name: 'Bread Loaf', detail: 'Sliced', quantity: '×1', price: '35.00', Icon: Wheat, color: '#b87d35', bg: '#fcf6ec' },
            ].map(({ name, detail, quantity, price, Icon, color, bg }) => (
              <View key={name} style={styles.product}>
                <View style={[styles.productArt, { backgroundColor: bg }]}><Icon size={30} color={color} strokeWidth={1.6} /></View>
                <View style={styles.productCopy}>
                  <Text style={styles.productName}>{name}</Text>
                  <Text style={styles.muted}>{detail}</Text>
                  <Text style={styles.quantity}>{quantity}</Text>
                </View>
                <Text style={styles.price}>GH₵ {price}</Text>
              </View>
            ))}
            <View style={[styles.row, styles.subtotal]}><Text style={styles.body}>Subtotal</Text><Text style={styles.body}>GH₵ 45.00</Text></View>
            <View style={[styles.row, styles.total]}><Text style={styles.totalText}>Total</Text><Text style={styles.totalText}>GH₵ 45.00</Text></View>
            <Text style={styles.section}>Payment Method</Text>
            <View style={styles.methods}>
              {[{ label: 'Cash', Icon: Banknote }, { label: 'MoMo', Icon: Smartphone }, { label: 'Card', Icon: CreditCard }].map(({ label, Icon }) => (
                <View key={label} style={[styles.method, label === 'MoMo' && styles.selectedMethod]}>
                  <Icon size={26} color={label === 'MoMo' ? '#fff' : '#334155'} strokeWidth={1.7} />
                  <Text style={[styles.body, label === 'MoMo' && styles.white]}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.complete}><Text style={styles.completeText}>Complete Sale</Text></View>
            <View style={styles.brandRow}>
              <Calculator size={17} color={BRAND_GREEN} />
              <Text style={styles.brandText}>ABS Smart POS</Text>
              <Text style={styles.tagline}>Simple. Smart. Reliable.</Text>
            </View>
          </View>
        </View>
      </View>
      <View onLayout={event => setChipHeight(event.nativeEvent.layout.height)} style={[styles.chip, { marginTop: -chipHeight / 2 }]}>
        <View style={styles.chipIcon}><Check size={22} color={BRAND_GREEN} strokeWidth={2.5} /></View>
        <Text style={styles.chipText}>Payment successful</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 16 },
  frame: { alignItems: 'center', justifyContent: 'center', paddingBottom: 24, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 24, backgroundColor: '#fff', ...INTRO_CARD_SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: FontFamily.bold, fontSize: 23, color: '#0f172a' },
  badge: { backgroundColor: BRAND_GREEN, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: FontFamily.semiBold, color: '#fff', fontSize: 12 },
  section: { fontFamily: FontFamily.medium, fontSize: 13, color: '#0f172a', marginTop: 8, marginBottom: 5 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  productArt: { width: 50, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, gap: 3 },
  productName: { fontFamily: FontFamily.semiBold, fontSize: 14, color: '#0f172a' },
  muted: { fontFamily: FontFamily.regular, fontSize: 11, color: '#7c879b' },
  quantity: { alignSelf: 'flex-start', backgroundColor: '#eff7f2', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, fontFamily: FontFamily.medium },
  price: { fontFamily: FontFamily.medium, fontSize: 13, color: '#0f172a' },
  body: { fontFamily: FontFamily.medium, fontSize: 13, color: '#0f172a' },
  subtotal: { marginTop: 8 },
  total: { marginTop: 5, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  totalText: { fontFamily: FontFamily.bold, fontSize: 20, color: '#0f172a' },
  methods: { flexDirection: 'row', gap: 10 },
  method: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7 },
  selectedMethod: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  white: { color: '#fff' },
  complete: { marginTop: 8, height: 34, borderRadius: 7, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' },
  completeText: { fontFamily: FontFamily.semiBold, color: '#fff', fontSize: 15 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  brandText: { fontFamily: FontFamily.semiBold, fontSize: 11, color: BRAND_GREEN },
  tagline: { marginLeft: 'auto', fontFamily: FontFamily.regular, fontSize: 9, color: '#7c879b' },
  chip: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e8f8ee', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: FontFamily.medium, fontSize: 14, color: BRAND_GREEN },
});
