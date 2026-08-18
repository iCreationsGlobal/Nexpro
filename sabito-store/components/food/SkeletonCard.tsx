import { StyleSheet, View } from 'react-native';
import { BRAND } from '@/constants';

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.banner} />
      <View style={styles.lineWide} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 12,
    paddingBottom: 12,
  },
  banner: { width: '100%', height: 100, backgroundColor: '#e2e8f0' },
  lineWide: { marginTop: 12, marginHorizontal: 12, height: 14, borderRadius: 6, backgroundColor: '#e2e8f0' },
  line: { marginTop: 8, marginHorizontal: 12, width: '50%', height: 10, borderRadius: 6, backgroundColor: '#f1f5f9' },
});
