import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RestaurantCard } from '@/components/food/RestaurantCard';
import { ProductCard } from '@/components/ProductCard';
import { ServiceCard } from '@/components/services/ServiceCard';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { EmptyState, ErrorState, Screen } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceProduct, type MarketplaceService, type MarketplaceStore } from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';

type SearchMode = 'products' | 'stores' | 'services' | 'food';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ mode?: SearchMode }>();
  const initialMode = params.mode && ['products', 'stores', 'services', 'food'].includes(params.mode)
    ? params.mode
    : 'products';
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search.trim(), 500);
  const query = debouncedSearch;

  useEffect(() => {
    setPage(1);
  }, [mode, query]);

  const productsQuery = useQuery({
    queryKey: ['search-products', query, page],
    queryFn: () => marketplaceApi.getProducts({ search: query, page, limit: 30 }),
    enabled: mode === 'products' && query.length > 0,
  });

  const storesQuery = useQuery({
    queryKey: ['search-stores', query, page],
    queryFn: () => marketplaceApi.getStores({ search: query, page, limit: 30 }),
    enabled: mode === 'stores' && query.length > 0,
  });

  const servicesQuery = useQuery({
    queryKey: ['search-services', query, page],
    queryFn: () => marketplaceApi.getServices({ search: query, page, limit: 30 }),
    enabled: mode === 'services' && query.length > 0,
  });

  const foodStoresQuery = useQuery({
    queryKey: ['search-food-stores', query, page],
    queryFn: () => marketplaceApi.getStores({ search: query, shopType: 'restaurant,supermarket', page, limit: 15 }),
    enabled: mode === 'food' && query.length > 0,
  });

  const foodProductsQuery = useQuery({
    queryKey: ['search-food-products', query, page],
    queryFn: () => marketplaceApi.getProducts({ search: query, shopType: 'restaurant,supermarket', page, limit: 15 }),
    enabled: mode === 'food' && query.length > 0,
  });

  const loading =
    productsQuery.isLoading
    || storesQuery.isLoading
    || servicesQuery.isLoading
    || foodStoresQuery.isLoading
    || foodProductsQuery.isLoading;
  const products = (productsQuery.data?.data as MarketplaceProduct[]) || [];
  const foodStores = (foodStoresQuery.data?.data as MarketplaceStore[]) || [];
  const foodProducts = (foodProductsQuery.data?.data as MarketplaceProduct[]) || [];
  const stores = (storesQuery.data?.data as MarketplaceStore[]) || [];
  const services = (servicesQuery.data?.data as MarketplaceService[]) || [];

  const isEmptyQuery = query.length === 0;
  const activePagination = mode === 'products'
    ? productsQuery.data?.pagination
    : mode === 'stores'
      ? storesQuery.data?.pagination
      : mode === 'services'
        ? servicesQuery.data?.pagination
        : foodProductsQuery.data?.pagination || foodStoresQuery.data?.pagination;
  const totalPages = activePagination?.totalPages || 1;
  const paginationFooter = !isEmptyQuery && totalPages > 1 ? (
    <View style={styles.pagination}>
      <Pressable
        style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
        disabled={page <= 1}
        onPress={() => setPage((value) => Math.max(1, value - 1))}
      >
        <Text style={styles.pageText}>Previous</Text>
      </Pressable>
      <Text style={styles.pageLabel}>Page {page} of {totalPages}</Text>
      <Pressable
        style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
        disabled={page >= totalPages}
        onPress={() => setPage((value) => Math.min(totalPages, value + 1))}
      >
        <Text style={styles.pageText}>Next</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <Screen>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search products, stores, services..."
          value={search}
          onChangeText={setSearch}
          autoFocus
          placeholderTextColor={BRAND.muted}
        />
      </View>

      <View style={styles.tabs}>
        {(['products', 'stores', 'services', 'food'] as const).map((key) => (
          <Pressable
            key={key}
            style={[styles.tab, mode === key && styles.tabActive]}
            onPress={() => {
              setMode(key);
              analytics.track('search_mode_change', { mode: key });
            }}
          >
            <Text style={[styles.tabText, mode === key && styles.tabTextActive]}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isEmptyQuery ? (
        <EmptyState title="Start searching" message="Search across Sabito Store products, stores, services, and food." />
      ) : loading ? (
        <ActivityIndicator color={BRAND.primary} style={styles.loader} />
      ) : mode === 'products' ? (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={<EmptyState title="No products found" />}
          ListFooterComponent={paginationFooter}
          renderItem={({ item }) => <ProductCard product={item} onPress={() => router.push(`/product/${item.id}`)} />}
        />
      ) : mode === 'food' ? (
        <FlatList
          data={[...foodStores.map((store) => ({ type: 'store' as const, store })), ...foodProducts.map((product) => ({ type: 'product' as const, product }))]}
          keyExtractor={(item) => ('store' in item && item.type === 'store' ? `store-${item.store.slug}` : `product-${item.product.id}`)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No food vendors or meals found" />}
          ListFooterComponent={paginationFooter}
          renderItem={({ item }) => {
            if (item.type === 'store') {
              return (
                <View style={styles.foodStoreWrap}>
                  <RestaurantCard store={item.store} onPress={() => router.push(`/store/${item.store.slug}`)} />
                </View>
              );
            }
            return (
              <View style={styles.foodProductWrap}>
                <ProductCard product={item.product} onPress={() => router.push(`/product/${item.product.id}`)} />
              </View>
            );
          }}
        />
      ) : mode === 'stores' ? (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.slug}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No stores found" />}
          ListFooterComponent={paginationFooter}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <StoreCard store={item} onPress={() => router.push(`/store/${item.slug}`)} />
            </View>
          )}
        />
      ) : servicesQuery.isError ? (
        <ErrorState message="Could not search services." onRetry={() => servicesQuery.refetch()} />
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No services found" />}
          ListFooterComponent={paginationFooter}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ServiceCard
                service={item}
                onPress={() => {
                  if (item.studio?.slug && item.slug) router.push(`/service/${item.studio.slug}/${item.slug}`);
                }}
              />
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { padding: 16, paddingBottom: 8 },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  tabActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  tabText: { fontWeight: '700', color: BRAND.text },
  tabTextActive: { color: '#fff' },
  loader: { marginTop: 40 },
  grid: { padding: 10, paddingBottom: 24 },
  list: { padding: 16, paddingTop: 8, paddingBottom: 24 },
  foodStoreWrap: { marginBottom: 12 },
  foodProductWrap: { width: '100%' },
  cardWrap: { marginBottom: 12 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16 },
  pageBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: BRAND.primary },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { color: '#fff', fontWeight: '800' },
  pageLabel: { color: BRAND.muted, fontWeight: '700' },
  row: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  rowTitle: { fontSize: 16, fontWeight: '800', color: BRAND.text },
  rowText: { marginTop: 4, color: BRAND.muted },
});
