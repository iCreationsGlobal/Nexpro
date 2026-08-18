import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';

type Review = {
  id?: string;
  rating?: number;
  title?: string | null;
  comment?: string | null;
  reviewerName?: string | null;
  createdAt?: string | null;
};

export function ReviewList({ reviews }: { reviews?: Review[] }) {
  const visibleReviews = (reviews || []).slice(0, 5);
  if (!visibleReviews.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Reviews</Text>
        <Text style={styles.empty}>No public reviews yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Reviews</Text>
      {visibleReviews.map((review, index) => (
        <View key={review.id || `${review.reviewerName}-${index}`} style={styles.review}>
          <Text style={styles.rating}>★ {Number(review.rating || 0).toFixed(1)}</Text>
          {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
          {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
          <Text style={styles.reviewer}>{review.reviewerName || 'Verified shopper'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    gap: 10,
  },
  title: { color: BRAND.text, fontSize: 18, fontWeight: '800' },
  empty: { color: BRAND.muted },
  review: { borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 10, gap: 4 },
  rating: { color: BRAND.primary, fontWeight: '800' },
  reviewTitle: { color: BRAND.text, fontWeight: '800' },
  comment: { color: BRAND.muted, lineHeight: 20 },
  reviewer: { color: BRAND.muted, fontSize: 12, fontWeight: '600' },
});
