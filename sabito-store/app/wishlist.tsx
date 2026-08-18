import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, ErrorState, ListSkeleton, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/constants';
import { wishlistApi } from '@/services/ordersApi';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import { buyerQueryKeys, QUERY_STALE } from '@/utils/queryInvalidation';
import { Image } from 'expo-image';

export default function WishlistScreen() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: buyerQueryKeys.wishlist,
    queryFn: () => wishlistApi.list(),
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });
  const items = (data?.data as Array<{ listingId: string; title?: string; publicPrice?: number; imageUrl?: string; currency?: string }>) || [];

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.listingId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton rows={4} label="Loading wishlist" />
          ) : isError ? (
            <ErrorState
              title="Could not load wishlist"
              message={(error as { message?: string } | null)?.message || 'Saved products will appear after this refreshes.'}
              onRetry={refetch}
            />
          ) : (
            <EmptyState
              title="Wishlist is empty"
              message="Tap the heart on products you like and they will appear here."
              actionLabel="Browse products"
              onAction={() => router.push('/(tabs)/store')}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/product/${item.listingId}`)}>
            {item.imageUrl ? (
              <Image source={{ uri: resolveImageUrl(item.imageUrl) || undefined }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.placeholder]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title}>{item.title || 'Product'}</Text>
              <Text style={styles.price}>{formatCurrency(item.publicPrice || 0, item.currency || 'GHS')}</Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  placeholder: { backgroundColor: '#e2e8f0' },
  info: { marginLeft: 12, flex: 1, justifyContent: 'center' },
  title: { fontWeight: '600', color: BRAND.text },
  price: { marginTop: 4, fontWeight: '700', color: BRAND.primary },
});
