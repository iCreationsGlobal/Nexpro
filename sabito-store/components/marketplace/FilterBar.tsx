import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { BRAND } from '@/constants';

export type ProductFilter = 'all' | 'delivery' | 'deals' | 'new';

const FILTERS: Array<{ key: ProductFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'deals', label: 'Deals' },
  { key: 'new', label: 'New' },
];

export function FilterBar({
  active,
  onChange,
}: {
  active: ProductFilter;
  onChange: (filter: ProductFilter) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {FILTERS.map((filter) => (
        <Pressable
          key={filter.key}
          style={[styles.chip, active === filter.key && styles.chipActive]}
          onPress={() => onChange(filter.key)}
        >
          <Text style={[styles.text, active === filter.key && styles.textActive]}>{filter.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  text: { fontWeight: '700', color: BRAND.text },
  textActive: { color: '#fff' },
});
