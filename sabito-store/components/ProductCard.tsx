import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import type { MarketplaceProduct } from '@/services/marketplaceApi';

export function ProductCard({
  product,
  onPress,
}: {
  product: MarketplaceProduct;
  onPress: () => void;
}) {
  const image = resolveImageUrl(product.images?.[0]);
  const currency = product.store?.currency || 'GHS';
  const onSale = product.onSale || (product.compareAtPrice && Number(product.compareAtPrice) > Number(product.publicPrice));
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      {onSale ? (
        <View style={styles.saleBadge}>
          <Text style={styles.saleBadgeText}>
            {product.discountPercent ? `-${product.discountPercent}%` : 'Sale'}
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>
          {product.title}
        </Text>
        <Text style={styles.price}>{formatCurrency(product.publicPrice, currency)}</Text>
        {product.store?.displayName ? (
          <Text numberOfLines={1} style={styles.store}>
            {product.store.displayName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.border,
    margin: 6,
  },
  image: { width: '100%', aspectRatio: 1 },
  imagePlaceholder: { backgroundColor: '#e2e8f0' },
  saleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saleBadgeText: { color: '#b91c1c', fontWeight: '800', fontSize: 11 },
  body: { padding: 10 },
  title: { fontSize: 14, fontWeight: '600', color: BRAND.text, minHeight: 36 },
  price: { marginTop: 4, fontSize: 15, fontWeight: '700', color: BRAND.primary },
  store: { marginTop: 2, fontSize: 12, color: BRAND.muted },
});
