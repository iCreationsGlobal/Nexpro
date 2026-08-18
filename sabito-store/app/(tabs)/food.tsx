import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CuisineChip } from '@/components/food/CuisineChip';
import { FoodHero } from '@/components/food/FoodHero';
import { FoodSection } from '@/components/food/FoodSection';
import { RestaurantCard } from '@/components/food/RestaurantCard';
import { SkeletonCard } from '@/components/food/SkeletonCard';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { addressesApi } from '@/services/ordersApi';
import { marketplaceApi, type FoodStoreCard, type MarketplaceProduct } from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';
import { buyerQueryKeys, QUERY_STALE } from '@/utils/queryInvalidation';

export default function FoodTabScreen() {
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['food-home'],
    queryFn: () => marketplaceApi.getFoodHome(),
  });

  const addressesQuery = useQuery({
    queryKey: buyerQueryKeys.addresses,
    queryFn: () => addressesApi.list(),
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    analytics.track('food_home_view');
  }, []);

  const payload = data?.data;
  const defaultAddress = ((addressesQuery.data?.data as Array<{ label?: string; line1?: string; city?: string; isDefault?: boolean }>) || [])
    .find((entry) => entry.isDefault) || (addressesQuery.data?.data as Array<{ label?: string; line1?: string; city?: string }>)?.[0];
  const addressLabel = defaultAddress
    ? [defaultAddress.label, defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ')
    : null;

  const filterStores = (stores: FoodStoreCard[] = []) => {
    if (!activeCuisine) return stores;
    return stores.filter((store) => store.cuisineTags?.some((tag) => tag.toLowerCase() === activeCuisine.toLowerCase()));
  };

  const openNearYou = useMemo(() => filterStores(payload?.openNearYou), [payload?.openNearYou, activeCuisine]);
  const restaurants = useMemo(() => filterStores(payload?.restaurants), [payload?.restaurants, activeCuisine]);
  const fastDelivery = useMemo(() => filterStores(payload?.fastDelivery), [payload?.fastDelivery, activeCuisine]);

  if (isLoading) {
    return (
      <Screen>
        <FoodHero addressLabel={addressLabel} title="Loading food near you..." description="Finding restaurants and groceries." />
        <ScrollView horizontal contentContainerStyle={styles.skeletonRow}>
          {[1, 2, 3].map((key) => <SkeletonCard key={key} />)}
        </ScrollView>
        <LoadingState label="Loading vendors..." />
      </Screen>
    );
  }

  if (isError || !payload) {
    return (
      <Screen>
        <ErrorState message="We could not load food vendors right now." onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!payload.hasVendors) {
    return (
      <Screen>
        <FoodHero
          addressLabel={addressLabel}
          title={payload.hero.title}
          description={payload.hero.description}
        />
        <EmptyState
          title="No food vendors yet"
          message="Restaurants and grocery stores will appear here once sellers launch on Sabito Store."
          actionLabel="Browse marketplace"
          onAction={() => router.push('/(tabs)/store')}
        />
      </Screen>
    );
  }

  const renderMeal = (item: MarketplaceProduct) => (
    <View key={item.id} style={styles.mealCard}>
      <ProductCard
        product={item}
        onPress={() => {
          analytics.track('restaurant_view', { productId: item.id, storeSlug: item.store?.slug || '' });
          router.push(`/product/${item.id}`);
        }}
      />
    </View>
  );

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BRAND.primary} />}
      >
        <FoodHero addressLabel={addressLabel} title={payload.hero.title} description={payload.hero.description} />

        {payload.cuisineChips?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <CuisineChip label="All" active={!activeCuisine} onPress={() => setActiveCuisine(null)} />
            {payload.cuisineChips.map((chip) => (
              <CuisineChip
                key={chip.label}
                label={chip.label}
                active={activeCuisine === chip.label}
                onPress={() => setActiveCuisine(chip.label)}
              />
            ))}
          </ScrollView>
        ) : null}

        {openNearYou.length ? (
          <FoodSection title="Open near you" subtitle="Restaurants accepting delivery now">
            {openNearYou.map((store) => (
              <RestaurantCard
                key={store.slug}
                store={store}
                onPress={() => {
                  analytics.track('restaurant_view', { storeSlug: store.slug });
                  router.push(`/store/${store.slug}`);
                }}
              />
            ))}
          </FoodSection>
        ) : null}

        {payload.popularMeals?.length ? (
          <View style={styles.gridSection}>
            <Text style={styles.sectionTitle}>Popular meals</Text>
            <View style={styles.grid}>{payload.popularMeals.slice(0, 6).map(renderMeal)}</View>
          </View>
        ) : null}

        {restaurants.length ? (
          <FoodSection title="Restaurants" subtitle="Browse menus from local vendors">
            {restaurants.map((store) => (
              <RestaurantCard
                key={`rest-${store.slug}`}
                store={store}
                onPress={() => router.push(`/store/${store.slug}`)}
              />
            ))}
          </FoodSection>
        ) : null}

        {payload.groceries?.length || payload.groceryProducts?.length ? (
          <>
            {payload.groceries?.length ? (
              <FoodSection title="Groceries" subtitle="Shops for pantry and essentials">
                {payload.groceries.map((store) => (
                  <RestaurantCard key={`groc-${store.slug}`} store={store} onPress={() => router.push(`/store/${store.slug}`)} />
                ))}
              </FoodSection>
            ) : null}
            {payload.groceryProducts?.length ? (
              <View style={styles.gridSection}>
                <Text style={styles.sectionTitle}>Grocery picks</Text>
                <View style={styles.grid}>{payload.groceryProducts.slice(0, 4).map(renderMeal)}</View>
              </View>
            ) : null}
          </>
        ) : null}

        {payload.drinks?.length ? (
          <View style={styles.gridSection}>
            <Text style={styles.sectionTitle}>Drinks</Text>
            <View style={styles.grid}>{payload.drinks.slice(0, 4).map(renderMeal)}</View>
          </View>
        ) : null}

        {fastDelivery.length ? (
          <FoodSection title="Fast delivery" subtitle="Shorter prep and delivery times">
            {fastDelivery.map((store) => (
              <RestaurantCard key={`fast-${store.slug}`} store={store} onPress={() => router.push(`/store/${store.slug}`)} />
            ))}
          </FoodSection>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: 16, paddingBottom: 12 },
  skeletonRow: { paddingHorizontal: 16, paddingBottom: 12 },
  gridSection: { paddingHorizontal: 10, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: BRAND.text, paddingHorizontal: 6, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  mealCard: { width: '50%' },
});
