import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { FontAwesome } from '@expo/vector-icons';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily } from '@/constants/typography';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';

export function IntroInvoiceHero({ width, height }: { width: number; height: number }) {
  const { cardWidth, cardHeight } = getIntroCardLayout(width, height);
  const [chipHeight, setChipHeight] = useState(54);
  const scale = Math.max(0.1, Math.min((cardWidth - 32) / 320, (cardHeight - 40) / 380));
  return (
    <View style={styles.stage} accessible accessibilityLabel="Invoice preview, INV-1042 for Ama Mensah. Banner print GH₵500 and business cards GH₵350. Total GH₵850. Invoice delivered automatically via WhatsApp.">
      <View style={[styles.frame, { width: cardWidth, height: cardHeight }]}>
        <View style={{ width: 320 * scale, height: 380 * scale }}>
          <View style={{ width: 320, height: 380, transform: [{ translateX: (320 * scale - 320) / 2 }, { translateY: (380 * scale - 380) / 2 }, { scale }] }}>
            <View style={styles.row}>
              <View><Text style={styles.heading}>Invoice</Text><Text style={styles.reference}>INV-1042</Text></View>
              <View style={styles.badge}><Text style={styles.badgeText}>Auto-sent</Text></View>
            </View>
            <View style={styles.customer}>
              <View style={styles.avatar}><UserRound size={22} color="#fff" /></View>
              <View><Text style={styles.customerName}>Ama Mensah</Text><Text style={styles.muted}>20 May 2025</Text></View>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.tableLabel, styles.itemColumn]}>Item</Text>
              <Text style={[styles.tableLabel, styles.qtyColumn]}>Qty</Text>
              <Text style={[styles.tableLabel, styles.moneyColumn]}>Unit price</Text>
              <Text style={[styles.tableLabel, styles.moneyColumn]}>Amount</Text>
            </View>
            {[
              { name: 'Banner print', detail: '13oz PVC Banner', qty: '1', unit: '500.00', amount: '500.00' },
              { name: 'Business cards', detail: 'Full color, 2 sides', qty: '2', unit: '175.00', amount: '350.00' },
            ].map(item => (
              <View key={item.name} style={styles.itemRow}>
                <View style={styles.itemColumn}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemDetail}>{item.detail}</Text></View>
                <Text style={[styles.cell, styles.qtyColumn]}>{item.qty}</Text>
                <Text style={[styles.cell, styles.moneyColumn]}>GH₵ {item.unit}</Text>
                <Text style={[styles.cell, styles.moneyColumn, styles.amount]}>GH₵ {item.amount}</Text>
              </View>
            ))}
            <View style={styles.summary}>
              {[['Subtotal', '850.00'], ['Discount', '0.00'], ['Tax (0%)', '0.00']].map(([label, value]) => (
                <View key={label} style={styles.summaryRow}><Text style={styles.summaryText}>{label}</Text><Text style={styles.summaryText}>GH₵ {value}</Text></View>
              ))}
            </View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>GH₵ 850.00</Text></View>
          </View>
        </View>
      </View>
      <View onLayout={event => setChipHeight(event.nativeEvent.layout.height)} style={[styles.chip, { marginTop: -chipHeight / 2 }]}>
        <View style={styles.chipIcon}><FontAwesome name="whatsapp" size={22} color={BRAND_GREEN} /></View>
        <Text style={styles.chipText}>Invoice sent via WhatsApp</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingTop: 16 },
  frame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 24, backgroundColor: '#fff', ...INTRO_CARD_SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: FontFamily.bold, fontSize: 24, color: '#0f172a' },
  reference: { fontFamily: FontFamily.regular, fontSize: 13, color: '#7c879b', marginTop: 3 },
  badge: { backgroundColor: BRAND_GREEN, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  badgeText: { fontFamily: FontFamily.semiBold, fontSize: 12, color: '#fff' },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 12, paddingVertical: 13 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' },
  customerName: { fontFamily: FontFamily.semiBold, fontSize: 15, color: '#0f172a', marginBottom: 3 },
  muted: { fontFamily: FontFamily.regular, fontSize: 11, color: '#7c879b' },
  tableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f6f7', borderRadius: 5, paddingVertical: 9, paddingHorizontal: 5 },
  tableLabel: { fontFamily: FontFamily.medium, fontSize: 10, color: '#64748b' },
  itemColumn: { flex: 1 },
  qtyColumn: { width: 26, textAlign: 'center' },
  moneyColumn: { width: 73, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  itemName: { fontFamily: FontFamily.semiBold, fontSize: 11, color: '#0f172a' },
  itemDetail: { fontFamily: FontFamily.regular, fontSize: 9, color: '#7c879b', marginTop: 4 },
  cell: { fontFamily: FontFamily.regular, fontSize: 10, color: '#0f172a' },
  amount: { fontFamily: FontFamily.semiBold },
  summary: { alignSelf: 'flex-end', width: 195, paddingTop: 10, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryText: { fontFamily: FontFamily.regular, fontSize: 11, color: '#334155' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  totalLabel: { fontFamily: FontFamily.bold, fontSize: 17, color: '#0f172a' },
  totalValue: { fontFamily: FontFamily.bold, fontSize: 20, color: BRAND_GREEN },
  chip: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e8f8ee', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: FontFamily.medium, fontSize: 14, color: BRAND_GREEN },
});
