import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReviewSnippet } from '@/components/ReviewSnippet';
import { ReviewList } from '@/components/ReviewList';
import { StickyCartBar } from '@/components/StickyCartBar';
import { ErrorState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceProduct } from '@/services/marketplaceApi';
import { reviewsApi, wishlistApi } from '@/services/ordersApi';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import { analytics } from '@/utils/analytics';
import { buyerQueryKeys, QUERY_STALE, refreshAfterWishlistChange } from '@/utils/queryInvalidation';

type WishlistItem = {
  listingId: string;
  title?: string;
  publicPrice?: number | string;
  imageUrl?: string | null;
  currency?: string;
};

const getWishlistItems = (payload: unknown): WishlistItem[] => {
  const data = (payload as { data?: WishlistItem[] } | null)?.data;
  return Array.isArray(data) ? data : [];
};

const buildWishlistItem = (product: MarketplaceProduct, listingId: string): WishlistItem => ({
  listingId,
  title: product.title,
  publicPrice: product.publicPrice,
  imageUrl: product.images?.[0] || null,
  currency: product.store?.currency || 'GHS',
});

const getOptimisticWishlist = (
  previous: unknown,
  listingId: string,
  product: MarketplaceProduct | undefined,
  shouldSave: boolean,
) => {
  const items = getWishlistItems(previous);
  const nextItems = shouldSave
    ? items.some((item) => item.listingId === listingId)
      ? items
      : [...items, product ? buildWishlistItem(product, listingId) : { listingId }]
    : items.filter((item) => item.listingId !== listingId);

  return {
    ...(previous as Record<string, unknown> | null),
    data: nextItems,
  };
};

export default function ProductDetailScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem, items } = useCart();
  const { isAuthenticated } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => marketplaceApi.getProduct(id),
    enabled: Boolean(id),
  });

  const reviewsQuery = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: () => reviewsApi.getProductReviews(id),
    enabled: Boolean(id),
  });

  const product = data?.data;

  const wishlistQuery = useQuery({
    queryKey: buyerQueryKeys.wishlist,
    queryFn: () => wishlistApi.list(),
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });
  const isSavedToWishlist = getWishlistItems(wishlistQuery.data).some((item) => item.listingId === id);

  const relatedQuery = useQuery({
    queryKey: ['related-products', product?.store?.slug, product?.category?.name],
    queryFn: () => marketplaceApi.getProducts({
      storeSlug: product!.store!.slug,
      category: product?.category?.name || '',
      limit: 6,
    }),
    enabled: Boolean(product?.store?.slug),
  });

  const wishlistMutation = useMutation({
    mutationFn: () => wishlistApi.toggle(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: buyerQueryKeys.wishlist });
      const previous = queryClient.getQueryData(buyerQueryKeys.wishlist);
      const hadPrevious = previous !== undefined;
      const wasSaved = isSavedToWishlist;
      const optimistic = getOptimisticWishlist(previous, id, product, !wasSaved);
      queryClient.setQueryData(buyerQueryKeys.wishlist, optimistic);
      return { hadPrevious, previous, wasSaved };
    },
    onError: (error, _variables, context) => {
      if (context?.hadPrevious) {
        queryClient.setQueryData(buyerQueryKeys.wishlist, context.previous);
      } else {
        queryClient.removeQueries({ queryKey: buyerQueryKeys.wishlist, exact: true });
      }
      Alert.alert('Wishlist update failed', (error as { message?: string }).message || 'Try again');
    },
    onSuccess: async (res, _variables, context) => {
      const saved = typeof res?.data?.saved === 'boolean' ? res.data.saved : !context?.wasSaved;
      queryClient.setQueryData(
        buyerQueryKeys.wishlist,
        (current: unknown) => getOptimisticWishlist(current, id, product, saved),
      );
      await refreshAfterWishlistChange(queryClient);
      Alert.alert(saved ? 'Saved to wishlist' : 'Removed from wishlist');
    },
  });
  const images = useMemo(
    () => (product?.images || []).map((entry) => resolveImageUrl(entry)).filter(Boolean) as string[],
    [product?.images],
  );

  const cartItems = items.filter((item) => item.listingId === product?.id);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  useEffect(() => {
    if (product?.id) {
      analytics.track('product_view', { productId: product.id, storeSlug: product.store?.slug || '' });
    }
  }, [product?.id, product?.store?.slug]);

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <Text>Loading product...</Text>
      </Screen>
    );
  }

  if (isError || !product) {
    return (
      <Screen>
        <ErrorState message="Product not found or unavailable." onRetry={() => refetch()} />
      </Screen>
    );
  }

  const currency = product.store?.currency || 'GHS';
  const unavailable = product.available === false;
  const maxQty = product.availability?.quantityOnHand && product.availability.quantityOnHand > 0
    ? product.availability.quantityOnHand
    : 99;

  const onAddToCart = () => {
    const result = addItem({ product, quantity });
    analytics.track('add_to_cart', { listingId: product.id, storeSlug: product.store?.slug || '', quantity });
    if (result.replacedStore) {
      Alert.alert('Cart updated', 'Items from another store were replaced (one store per order).');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, cartQuantity > 0 && styles.contentWithBar]}>
        {images.length ? (
          <>
            <Image source={{ uri: images[activeImage] }} style={styles.hero} contentFit="cover" />
            {images.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                {images.map((uri, index) => (
                  <Pressable key={uri} onPress={() => setActiveImage(index)}>
                    <Image
                      source={{ uri }}
                      style={[styles.thumb, activeImage === index && styles.thumbActive]}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : (
          <View style={[styles.hero, styles.placeholder]} />
        )}

        <View style={styles.body}>
          <Text style={styles.title}>{product.title}</Text>
          {product.category?.name ? <Text style={styles.category}>{product.category.name}</Text> : null}
          <Text style={styles.price}>{formatCurrency(product.publicPrice, currency)}</Text>
          {product.compareAtPrice && Number(product.compareAtPrice) > Number(product.publicPrice) ? (
            <Text style={styles.compareAt}>{formatCurrency(product.compareAtPrice, currency)}</Text>
          ) : null}
          <ReviewSnippet rating={product.rating} reviewsCount={product.reviewsCount} />
          {product.shortDescription ? <Text style={styles.desc}>{product.shortDescription}</Text> : null}
          {product.description && product.description !== product.shortDescription ? (
            <Text style={styles.desc}>{product.description}</Text>
          ) : null}

          <View style={styles.badges}>
            {product.store?.deliveryEnabled ? <Text style={styles.badge}>Delivery available</Text> : null}
            {product.store?.pickupEnabled ? <Text style={styles.badge}>Pickup available</Text> : null}
            {unavailable ? <Text style={[styles.badge, styles.badgeDanger]}>Currently unavailable</Text> : null}
            {product.availability?.message ? <Text style={styles.meta}>{product.availability.message}</Text> : null}
            <Text style={styles.meta}>Options and variants are checked at checkout through the selected listing.</Text>
          </View>

          {product.store ? (
            <Pressable style={styles.storePreview} onPress={() => router.push(`/store/${product.store!.slug}`)}>
              {product.store.logoUrl ? (
                <Image source={{ uri: resolveImageUrl(product.store.logoUrl) || undefined }} style={styles.storeLogo} />
              ) : null}
              <View style={styles.storeMeta}>
                <Text style={styles.storeLabel}>Sold by</Text>
                <Text style={styles.storeName}>{product.store.displayName}</Text>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <View style={styles.qtyControls}>
              <Pressable style={styles.qtyBtn} onPress={() => setQuantity((value) => Math.max(1, value - 1))}>
                <Text>-</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => setQuantity((value) => Math.min(maxQty, value + 1))}>
                <Text>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <PrimaryButton label={unavailable ? 'Unavailable' : 'Add to cart'} onPress={onAddToCart} disabled={unavailable} />
            {isAuthenticated ? (
              <SecondaryButton
                label={isSavedToWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
                onPress={() => wishlistMutation.mutate()}
                disabled={wishlistMutation.isPending}
              />
            ) : (
              <SecondaryButton label="Sign in to save wishlist" onPress={() => router.push('/login')} />
            )}
            <SecondaryButton label="View cart" onPress={() => router.push('/cart')} />
          </View>

          <ReviewList reviews={(reviewsQuery.data?.data?.reviews as never[]) || []} />

          {relatedQuery.data?.data?.length ? (
            <View style={styles.related}>
              <Text style={styles.relatedTitle}>More from this store</Text>
              {relatedQuery.data.data.filter((item) => item.id !== product.id).slice(0, 4).map((item) => (
                <Pressable key={item.id} style={styles.relatedRow} onPress={() => router.push(`/product/${item.id}`)}>
                  <Text style={styles.relatedName} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.relatedPrice}>{formatCurrency(item.publicPrice, currency)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <StickyCartBar
        itemCount={cartQuantity}
        subtotal={cartSubtotal}
        currency={currency}
        onPress={() => router.push('/cart')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 32 },
  contentWithBar: { paddingBottom: 100 },
  hero: { width: '100%', aspectRatio: 1 },
  placeholder: { backgroundColor: '#e2e8f0' },
  thumbs: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  thumb: { width: 64, height: 64, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: BRAND.border },
  thumbActive: { borderColor: BRAND.primary, borderWidth: 2 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: BRAND.text },
  category: { color: BRAND.primary, fontWeight: '800' },
  price: { fontSize: 22, fontWeight: '800', color: BRAND.primary },
  compareAt: { textDecorationLine: 'line-through', color: BRAND.muted },
  desc: { color: BRAND.muted, lineHeight: 22 },
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
  badgeDanger: { color: BRAND.danger, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  meta: { color: BRAND.muted, width: '100%' },
  storePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  storeLogo: { width: 44, height: 44, borderRadius: 10 },
  storeMeta: { flex: 1 },
  storeLabel: { color: BRAND.muted, fontSize: 12 },
  storeName: { fontWeight: '800', color: BRAND.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { fontWeight: '700', color: BRAND.text },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  qtyValue: { minWidth: 24, textAlign: 'center', fontWeight: '800' },
  actions: { marginTop: 8, gap: 10 },
  related: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: BRAND.border, padding: 16, gap: 10 },
  relatedTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800' },
  relatedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 10 },
  relatedName: { flex: 1, color: BRAND.text, fontWeight: '700' },
  relatedPrice: { color: BRAND.primary, fontWeight: '800' },
});
