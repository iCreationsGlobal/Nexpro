import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';

export function ReviewSnippet({
  rating,
  reviewsCount,
  compact,
}: {
  rating?: number | null;
  reviewsCount?: number;
  compact?: boolean;
}) {
  if (!rating && !reviewsCount) return null;

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {rating ? <Text style={styles.rating}>★ {Number(rating).toFixed(1)}</Text> : null}
      {reviewsCount ? <Text style={styles.count}>({reviewsCount} reviews)</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compact: { marginTop: 4 },
  rating: { color: BRAND.text, fontWeight: '800' },
  count: { color: BRAND.muted, fontSize: 13 },
});
