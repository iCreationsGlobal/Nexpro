import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import type { FoodStoreCard } from '@/services/marketplaceApi';

export function RestaurantCard({ store, onPress }: { store: FoodStoreCard; onPress: () => void }) {
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
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" />
          ) : (
            <View style={[styles.logo, styles.logoPlaceholder]} />
          )}
          <View style={styles.meta}>
            <Text numberOfLines={1} style={styles.name}>{store.displayName}</Text>
            {store.cuisineTags?.length ? (
              <Text numberOfLines={1} style={styles.cuisine}>{store.cuisineTags.join(' · ')}</Text>
            ) : store.category ? (
              <Text numberOfLines={1} style={styles.cuisine}>{store.category}</Text>
            ) : null}
          </View>
          {store.isOpenNow === true ? (
            <View style={styles.openBadge}><Text style={styles.openText}>Open</Text></View>
          ) : store.isOpenNow === false ? (
            <View style={styles.closedBadge}><Text style={styles.closedText}>Closed</Text></View>
          ) : null}
        </View>
        <View style={styles.footer}>
          {store.rating ? <Text style={styles.stat}>★ {Number(store.rating).toFixed(1)}</Text> : null}
          {store.avgPrepMinutes ? <Text style={styles.stat}>{store.avgPrepMinutes} min</Text> : null}
          {store.deliveryEnabled ? (
            <Text style={styles.stat}>
              {store.deliveryFee ? formatCurrency(store.deliveryFee, store.currency || 'GHS') : 'Free delivery'}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
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
  },
  banner: { width: '100%', height: 100 },
  bannerPlaceholder: { backgroundColor: '#dcfce7' },
  body: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  logoPlaceholder: { backgroundColor: '#e2e8f0' },
  meta: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: BRAND.text },
  cuisine: { marginTop: 2, fontSize: 12, color: BRAND.muted },
  openBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  openText: { color: BRAND.primary, fontWeight: '700', fontSize: 11 },
  closedBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  closedText: { color: BRAND.danger, fontWeight: '700', fontSize: 11 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  stat: { fontSize: 12, color: BRAND.muted, fontWeight: '600' },
});
