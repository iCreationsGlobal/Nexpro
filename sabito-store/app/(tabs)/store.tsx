import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryChip } from '@/components/marketplace/CategoryChip';
import { FilterBar, type ProductFilter } from '@/components/marketplace/FilterBar';
import { ProductSection } from '@/components/marketplace/ProductSection';
import { ProductSkeleton } from '@/components/marketplace/ProductSkeleton';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import {
  marketplaceApi,
  type MarketplaceProduct,
  type MarketplaceStore,
} from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';

export default function StoreTabScreen() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProductFilter>('all');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['products-home'],
    queryFn: () => marketplaceApi.getProductsHome(),
  });

  useEffect(() => {
    analytics.track('product_home_view');
  }, []);

  const payload = data?.data;

  const filteredProducts = useMemo(() => {
    if (!payload) return [] as MarketplaceProduct[];
    let list = payload.featuredProducts;
    if (activeFilter === 'deals') list = payload.bestDeals;
    else if (activeFilter === 'new') list = payload.newArrivals;
    else if (activeFilter === 'delivery') {
      const deliverySlugs = new Set(payload.deliveryStores.map((store) => store.slug));
      list = [...payload.featuredProducts, ...payload.newArrivals].filter((product) =>
        product.store?.slug && deliverySlugs.has(product.store.slug),
      );
    }
    if (activeCategory) {
      list = list.filter((product) => product.category?.name === activeCategory);
    }
    return list;
  }, [payload, activeCategory, activeFilter]);

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Sabito Store Products</Text>
          <Text style={styles.title}>Loading products...</Text>
        </View>
        <ScrollView horizontal contentContainerStyle={styles.skeletonRow}>
          {[1, 2, 3].map((key) => <ProductSkeleton key={key} />)}
        </ScrollView>
        <LoadingState label="Finding stores and deals..." />
      </Screen>
    );
  }

  if (isError || !payload) {
    return (
      <Screen>
        <ErrorState message="We could not load the product marketplace right now." onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!payload.hasVendors) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{payload.hero.eyebrow}</Text>
          <Text style={styles.title}>{payload.hero.title}</Text>
          <Text style={styles.subtitle}>{payload.hero.description}</Text>
        </View>
        <EmptyState
          title="No product stores yet"
          message="Shops will appear here once sellers launch product catalogs on Sabito Store."
          actionLabel="Browse services"
          onAction={() => router.push('/(tabs)/services')}
        />
      </Screen>
    );
  }

  const openProduct = (product: MarketplaceProduct) => {
    analytics.track('product_view', { productId: product.id, storeSlug: product.store?.slug || '' });
    router.push(`/product/${product.id}`);
  };

  const openStore = (store: MarketplaceStore) => {
    analytics.track('store_view', { storeSlug: store.slug });
    router.push(`/store/${store.slug}`);
  };

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BRAND.primary} />}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{payload.hero.eyebrow}</Text>
          <Text style={styles.title}>{payload.hero.title}</Text>
          <Text style={styles.subtitle}>{payload.hero.description}</Text>
          <Pressable style={styles.searchBtn} onPress={() => router.push('/search')}>
            <Text style={styles.searchBtnText}>Search products and stores</Text>
          </Pressable>
        </View>

        {payload.categories?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <CategoryChip label="All" active={!activeCategory} onPress={() => setActiveCategory(null)} />
            {payload.categories.map((category) => (
              <CategoryChip
                key={category.name}
                label={category.name}
                active={activeCategory === category.name}
                onPress={() => {
                  analytics.track('category_select', { category: category.name, scope: 'products' });
                  setActiveCategory(category.name);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        <FilterBar active={activeFilter} onChange={setActiveFilter} />

        {payload.popularStores?.length ? (
          <ProductSection title="Popular stores" subtitle="Trusted sellers with active catalogs">
            {payload.popularStores.map((store) => (
              <StoreCard key={store.slug} store={store} onPress={() => openStore(store)} />
            ))}
          </ProductSection>
        ) : null}

        {payload.featuredProducts?.length ? (
          <ProductSection title="Featured products">
            {(activeCategory || activeFilter !== 'all' ? filteredProducts : payload.featuredProducts).map((product) => (
              <View key={product.id} style={styles.productCard}>
                <ProductCard product={product} onPress={() => openProduct(product)} />
              </View>
            ))}
          </ProductSection>
        ) : null}

        {payload.bestDeals?.length && activeFilter !== 'deals' ? (
          <ProductSection title="Best deals" subtitle="Products currently on sale">
            {payload.bestDeals.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <ProductCard product={product} onPress={() => openProduct(product)} />
              </View>
            ))}
          </ProductSection>
        ) : null}

        {payload.newArrivals?.length && activeFilter !== 'new' ? (
          <ProductSection title="New arrivals">
            {payload.newArrivals.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <ProductCard product={product} onPress={() => openProduct(product)} />
              </View>
            ))}
          </ProductSection>
        ) : null}

        {payload.deliveryStores?.length ? (
          <ProductSection title="Delivery available" subtitle="Stores that deliver to you">
            {payload.deliveryStores.map((store) => (
              <StoreCard key={`delivery-${store.slug}`} store={store} onPress={() => openStore(store)} />
            ))}
          </ProductSection>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 6,
  },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { color: BRAND.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: BRAND.muted, lineHeight: 20 },
  searchBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  searchBtnText: { color: BRAND.primary, fontWeight: '700' },
  filters: { paddingHorizontal: 16, paddingBottom: 8 },
  skeletonRow: { paddingHorizontal: 16, paddingBottom: 12 },
  productCard: { width: 168 },
});
