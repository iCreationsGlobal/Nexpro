import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { formatCurrency } from '@/utils/format';

export function StickyCartBar({
  itemCount,
  subtotal,
  currency,
  onPress,
}: {
  itemCount: number;
  subtotal: number;
  currency: string;
  onPress: () => void;
}) {
  if (itemCount <= 0) return null;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.bar} onPress={onPress}>
        <View style={styles.badge}><Text style={styles.badgeText}>{itemCount}</Text></View>
        <Text style={styles.label}>View cart</Text>
        <Text style={styles.total}>{formatCurrency(subtotal, currency)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: BRAND.primary, fontWeight: '800' },
  label: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16 },
  total: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
