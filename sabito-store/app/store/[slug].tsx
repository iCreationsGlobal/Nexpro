import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReviewSnippet } from '@/components/ReviewSnippet';
import { ReviewList } from '@/components/ReviewList';
import { StickyCartBar } from '@/components/StickyCartBar';
import { EmptyState, Screen, SectionTitle } from '@/components/ui';
import { useCart } from '@/context/CartContext';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceProduct } from '@/services/marketplaceApi';
import { reviewsApi } from '@/services/ordersApi';
import { analytics } from '@/utils/analytics';
import { formatCurrency, resolveImageUrl } from '@/utils/format';

const FOOD_SHOP_TYPES = new Set(['restaurant', 'supermarket', 'convenience']);

type StoreProfile = {
  displayName?: string;
  description?: string;
  logoUrl?: string | null;
  bannerImageUrl?: string | null;
  shopType?: string | null;
  cuisineTags?: string[];
  deliveryFee?: number;
  freeDeliveryThreshold?: number | null;
  avgPrepMinutes?: number | null;
  isOpenNow?: boolean | null;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  currency?: string;
  stats?: { rating?: number | null; reviewsCount?: number };
};

type MenuSection = { name: string; products: MarketplaceProduct[] };

const getProductCategoryName = (product: MarketplaceProduct & { product?: { category?: { name?: string } | null } }) => (
  product.category?.name || product.product?.category?.name || 'Products'
);

export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { addItem, cartSummary, items } = useCart();

  const storeQuery = useQuery({
    queryKey: ['store', slug],
    queryFn: () => marketplaceApi.getStoreHome(slug),
    enabled: Boolean(slug),
  });

  const productsQuery = useQuery({
    queryKey: ['store-products', slug],
    queryFn: () => marketplaceApi.getPublicStoreProducts(slug),
    enabled: Boolean(slug),
  });

  const reviewsQuery = useQuery({
    queryKey: ['store-reviews', slug],
    queryFn: () => reviewsApi.getStoreReviews(slug),
    enabled: Boolean(slug),
  });

  const payload = storeQuery.data?.data as {
    store?: StoreProfile;
    categories?: Array<{ id?: string; name: string }>;
    featuredProducts?: MarketplaceProduct[];
    secondaryProducts?: MarketplaceProduct[];
  } | undefined;

  const store = payload?.store;
  const listedProducts = (productsQuery.data?.data as MarketplaceProduct[]) || [];
  const products = listedProducts.length
    ? listedProducts
    : [...(payload?.featuredProducts || []), ...(payload?.secondaryProducts || [])];
  const isFoodStore = FOOD_SHOP_TYPES.has(store?.shopType || '');

  const menuSections = useMemo(() => {
    const sections = new Map<string, MenuSection>();
    products.forEach((product) => {
      const name = getProductCategoryName(product);
      const existing = sections.get(name) || { name, products: [] };
      existing.products.push(product);
      sections.set(name, existing);
    });
    return [...sections.values()];
  }, [products]);

  const storeCartItems = items.filter((item) => item.storeSlug === slug);
  const storeSubtotal = storeCartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const storeItemCount = storeCartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (storeQuery.isLoading || productsQuery.isLoading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={BRAND.primary} />
      </Screen>
    );
  }

  if (!store) {
    return (
      <Screen style={styles.center}>
        <EmptyState title="Store not found" message="This vendor may not be published yet." />
      </Screen>
    );
  }

  const banner = resolveImageUrl(store.bannerImageUrl);
  const logo = resolveImageUrl(store.logoUrl);
  const currency = store.currency || 'GHS';

  const onAdd = (product: MarketplaceProduct) => {
    const result = addItem({ product, storeSlug: slug, quantity: 1 });
    analytics.track('add_to_cart', { listingId: product.id, storeSlug: slug || '' });
    if (result.replacedStore) {
      Alert.alert('Cart updated', 'Items from another store were replaced (one store per order).');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, storeItemCount > 0 && styles.contentWithBar]}>
        {banner ? <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.bannerPlaceholder]} />}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" /> : null}
            <View style={styles.headerMeta}>
              <Text style={styles.title}>{store.displayName || slug}</Text>
              {store.cuisineTags?.length ? (
                <Text style={styles.cuisine}>{store.cuisineTags.join(' · ')}</Text>
              ) : null}
              <ReviewSnippet rating={store.stats?.rating} reviewsCount={store.stats?.reviewsCount} compact />
            </View>
            {store.isOpenNow === true ? (
              <Text style={styles.open}>Open</Text>
            ) : store.isOpenNow === false ? (
              <Text style={styles.closed}>Closed</Text>
            ) : null}
          </View>
          {store.description ? <Text style={styles.desc}>{store.description}</Text> : null}
          <View style={styles.badges}>
            {store.deliveryEnabled ? (
              <Text style={styles.badge}>
                Delivery {store.deliveryFee ? formatCurrency(store.deliveryFee, currency) : 'available'}
              </Text>
            ) : null}
            {store.pickupEnabled !== false ? <Text style={styles.badge}>Pickup available</Text> : null}
            {store.avgPrepMinutes ? <Text style={styles.badge}>{store.avgPrepMinutes} min prep</Text> : null}
            {store.freeDeliveryThreshold ? (
              <Text style={styles.badge}>Free delivery over {formatCurrency(store.freeDeliveryThreshold, currency)}</Text>
            ) : null}
          </View>
        </View>

        {isFoodStore ? (
          menuSections.map((section) => (
            <View key={section.name} style={styles.section}>
              <SectionTitle title={section.name} />
              {section.products.map((product) => {
                const image = resolveImageUrl(product.images?.[0]);
                const unavailable = product.available === false;
                return (
                  <View key={product.id} style={styles.menuItem}>
                    <View style={styles.menuBody}>
                      <Text style={styles.menuTitle}>{product.title}</Text>
                      {product.shortDescription ? <Text style={styles.menuDesc} numberOfLines={2}>{product.shortDescription}</Text> : null}
                      <ReviewSnippet rating={product.rating} reviewsCount={product.reviewsCount} compact />
                      <Text style={styles.menuPrice}>{formatCurrency(product.publicPrice, currency)}</Text>
                    </View>
                    {image ? <Image source={{ uri: image }} style={styles.menuImage} contentFit="cover" /> : null}
                    <Pressable
                      style={[styles.addBtn, unavailable && styles.addBtnDisabled]}
                      disabled={unavailable}
                      onPress={() => onAdd(product)}
                    >
                      <Text style={styles.addBtnText}>{unavailable ? 'Unavailable' : 'Add'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))
        ) : (
          menuSections.map((section) => (
            <View key={section.name} style={styles.section}>
              <SectionTitle title={section.name} />
              <View style={styles.productGrid}>
                {section.products.map((product) => (
                  <View key={product.id} style={styles.gridItem}>
                    <Pressable onPress={() => router.push(`/product/${product.id}`)}>
                      {resolveImageUrl(product.images?.[0]) ? (
                        <Image source={{ uri: resolveImageUrl(product.images?.[0]) || undefined }} style={styles.gridImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.gridImage, styles.gridImagePlaceholder]} />
                      )}
                      <Text numberOfLines={2} style={styles.gridTitle}>{product.title}</Text>
                      <Text style={styles.gridPrice}>{formatCurrency(product.publicPrice, currency)}</Text>
                      <ReviewSnippet rating={product.rating} reviewsCount={product.reviewsCount} compact />
                    </Pressable>
                    <Pressable
                      style={[styles.gridAddBtn, product.available === false && styles.addBtnDisabled]}
                      disabled={product.available === false}
                      onPress={() => onAdd(product)}
                    >
                      <Text style={styles.addBtnText}>{product.available === false ? 'Unavailable' : 'Add'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
        <View style={styles.section}>
          <ReviewList reviews={(reviewsQuery.data?.data?.reviews as never[]) || []} />
        </View>
      </ScrollView>

      <StickyCartBar
        itemCount={storeItemCount}
        subtotal={storeSubtotal}
        currency={currency}
        onPress={() => router.push('/cart')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 24 },
  contentWithBar: { paddingBottom: 100 },
  banner: { width: '100%', height: 160 },
  bannerPlaceholder: { backgroundColor: '#dcfce7' },
  header: { padding: 16, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logo: { width: 56, height: 56, borderRadius: 12 },
  headerMeta: { flex: 1 },
  title: { fontSize: 24, fontWeight: '900', color: BRAND.text },
  cuisine: { color: BRAND.muted, marginTop: 2 },
  open: { color: BRAND.primary, fontWeight: '800' },
  closed: { color: BRAND.danger, fontWeight: '800' },
  desc: { color: BRAND.muted, lineHeight: 20 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: BRAND.text,
    fontSize: 12,
    fontWeight: '600',
  },
  section: { paddingHorizontal: 16, marginBottom: 12 },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  menuBody: { gap: 4 },
  menuTitle: { fontSize: 16, fontWeight: '800', color: BRAND.text },
  menuDesc: { color: BRAND.muted },
  menuPrice: { marginTop: 4, fontWeight: '800', color: BRAND.primary },
  menuImage: { width: '100%', height: 120, borderRadius: 10 },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnDisabled: { backgroundColor: '#94a3b8' },
  addBtnText: { color: '#fff', fontWeight: '800' },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 10,
    gap: 8,
  },
  gridImage: { width: '100%', height: 120, borderRadius: 10 },
  gridImagePlaceholder: { backgroundColor: '#e2e8f0' },
  gridTitle: { fontWeight: '700', color: BRAND.text, minHeight: 36 },
  gridPrice: { fontWeight: '800', color: BRAND.primary },
  gridAddBtn: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
