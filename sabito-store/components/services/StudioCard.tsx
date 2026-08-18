import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import type { MarketplaceStudio } from '@/services/marketplaceApi';
import { resolveImageUrl } from '@/utils/format';

export function StudioCard({ studio, onPress }: { studio: MarketplaceStudio; onPress: () => void }) {
  const logo = resolveImageUrl(studio.logoUrl);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" /> : <View style={[styles.logo, styles.placeholder]} />}
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>{studio.displayName}</Text>
        {studio.category ? <Text style={styles.category}>{studio.category}</Text> : null}
        <View style={styles.footer}>
          {studio.rating ? <Text style={styles.stat}>★ {Number(studio.rating).toFixed(1)}</Text> : null}
          {studio.serviceCount ? <Text style={styles.stat}>{studio.serviceCount} services</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 12,
    flexDirection: 'row',
    gap: 10,
  },
  logo: { width: 52, height: 52, borderRadius: 12 },
  placeholder: { backgroundColor: '#e2e8f0' },
  body: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: BRAND.text },
  category: { marginTop: 2, color: BRAND.muted, fontSize: 12 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stat: { fontSize: 12, color: BRAND.muted, fontWeight: '600' },
});
