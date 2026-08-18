import { Pressable, StyleSheet, Text } from 'react-native';
import { BRAND } from '@/constants';

export function CuisineChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
