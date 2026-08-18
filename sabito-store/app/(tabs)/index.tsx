import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductCard } from '@/components/ProductCard';
import { Screen, SectionTitle } from '@/components/ui';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceProduct, type MarketplaceStore } from '@/services/marketplaceApi';

export default function HomeScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-home'],
    queryFn: () => marketplaceApi.getHome(),
  });

  const home = data?.data || {};
  const featuredProducts = (home.featuredProducts as MarketplaceProduct[]) || [];
  const popularStores = (home.popularStores as MarketplaceStore[]) || [];

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={BRAND.primary} size="large" />
      </Screen>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.heroLogo}
          contentFit="contain"
        />
        <Text style={styles.heroTitle}>Shop Ghana on Sabito Store</Text>
        <Text style={styles.heroSubtitle}>Discover stores, products, and studios near you.</Text>
        <Link href="/(tabs)/store" asChild>
          <Pressable style={styles.heroBtn}>
            <Text style={styles.heroBtnText}>Browse marketplace</Text>
          </Pressable>
        </Link>
      </View>

      {popularStores.length > 0 ? (
        <>
          <SectionTitle title="Popular stores" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
            {popularStores.map((store) => (
              <Link key={store.slug} href={`/store/${store.slug}`} asChild>
                <Pressable style={styles.storeChip}>
                  <Text style={styles.storeChipText}>{store.displayName}</Text>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionTitle title="Featured products" />
      <FlatList
        data={featuredProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push(`/product/${item.id}`)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No featured products yet.</Text>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  center: { justifyContent: 'center', alignItems: 'center' },
  hero: {
    backgroundColor: BRAND.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  heroLogo: {
    width: 96,
    height: 96,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroSubtitle: { color: '#dcfce7', marginTop: 8, fontSize: 15 },
  heroBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  heroBtnText: { color: BRAND.primary, fontWeight: '700' },
  row: { marginBottom: 16 },
  storeChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  storeChipText: { fontWeight: '600', color: BRAND.text },
  empty: { color: BRAND.muted, padding: 16 },
});
