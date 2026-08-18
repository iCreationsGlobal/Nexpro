import { StyleSheet, View } from 'react-native';
import { BRAND } from '@/constants';

export function ProductSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.image} />
      <View style={styles.lineWide} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 10,
    paddingBottom: 10,
  },
  image: { width: '100%', height: 120, backgroundColor: '#e2e8f0' },
  lineWide: { marginTop: 10, marginHorizontal: 10, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  line: { marginTop: 8, marginHorizontal: 10, width: '50%', height: 10, borderRadius: 6, backgroundColor: '#f1f5f9' },
});
