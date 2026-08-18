import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import type { MarketplaceStore } from '@/services/marketplaceApi';

export function StoreCard({ store, onPress }: { store: MarketplaceStore; onPress: () => void }) {
  const logo = resolveImageUrl(store.logoUrl);
  const banner = resolveImageUrl(store.bannerImageUrl);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {banner ? (
        <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" />
      ) : (
        <View style={[styles.banner, styles.bannerPlaceholder]} />
      )}
      <View style={styles.body}>
        <View style={styles.row}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" /> : null}
          <View style={styles.meta}>
            <Text numberOfLines={1} style={styles.name}>{store.displayName}</Text>
            {store.category ? <Text numberOfLines={1} style={styles.category}>{store.category}</Text> : null}
          </View>
        </View>
        <View style={styles.footer}>
          {store.rating ? <Text style={styles.stat}>★ {Number(store.rating).toFixed(1)}</Text> : null}
          {store.productCount ? <Text style={styles.stat}>{store.productCount} items</Text> : null}
          {store.deliveryEnabled ? (
            <Text style={styles.stat}>
              {store.deliveryFee ? formatCurrency(store.deliveryFee, store.currency || 'GHS') : 'Delivery'}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 12,
  },
  banner: { width: '100%', height: 90 },
  bannerPlaceholder: { backgroundColor: '#dcfce7' },
  body: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  meta: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: BRAND.text },
  category: { marginTop: 2, fontSize: 12, color: BRAND.muted },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stat: { fontSize: 12, color: BRAND.muted, fontWeight: '600' },
});
