import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { ListEmptyState } from '@/components/ListEmptyState';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { OnlineStoreWelcome } from '@/components/store/OnlineStoreWelcome';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useScreenColors } from '@/hooks/useScreenColors';
import { standaloneFullWidth } from '@/styles/standaloneButton';
import { storeService } from '@/services/storeService';
import { resolveBusinessType } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { resolveImageUrl } from '@/utils/fileUtils';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { flatListStyleForEmpty, listContentStyleWhenEmpty } from '@/utils/listEmptyLayout';
import { QUERY_STALE } from '@/utils/queryInvalidation';

type ProductListing = {
  id: string;
  title?: string;
  status?: string;
  publicPrice?: number | string | null;
  images?: unknown;
  product?: { name?: string; imageUrl?: string | null } | null;
};

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Draft', value: 'draft' },
] as const;

function listingImage(listing: ProductListing): string {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const first = images[0] as string | { url?: string } | undefined;
  const url = typeof first === 'string' ? first : first?.url;
  return resolveImageUrl(String(url || listing.product?.imageUrl || ''));
}

/**
 * Online Store products for shops: publish or hide listings after the store is live, and add more
 * from stock (the setup Products step in edit mode). Studio stores use store-services instead.
 */
export default function StoreProductsScreen() {
  const router = useRouter();
  const { activeTenantId, activeTenant, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const queryClient = useQueryClient();
  const inStoreSetup = useIsStoreSetupRoute();
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isStudio = resolveBusinessType(activeTenant?.businessType) === 'studio';
  const featureEnabled =
    !!activeTenantId && scopeReady && !isStudio && hasFeature('paymentsExpenses') && !inStoreSetup;

  const {
    data: statusResponse,
    isLoading: isSetupLoading,
    isError: isSetupError,
    error: setupError,
    refetch: refetchSetup,
  } = useQuery({
    queryKey: ['store', 'setup-status'],
    queryFn: () => storeService.getSetupStatus(),
    enabled: featureEnabled,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  const setupData = (statusResponse as { data?: unknown })?.data ?? statusResponse ?? {};
  const checklist = (setupData as { checklist?: Record<string, unknown> }).checklist || {};
  const hasStoreSettings = Boolean(checklist.hasSettings);

  const queryParams = useMemo(
    () => ({
      limit: 100,
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }),
    [statusFilter]
  );

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['store', 'listings', activeTenantId, activeShopId, activeStudioLocationId, queryParams],
    queryFn: () => storeService.getListings(queryParams),
    enabled: featureEnabled && hasStoreSettings,
    staleTime: QUERY_STALE.LIST,
  });

  const listings = useMemo(
    () => (hasStoreSettings ? parseApiListResponse<ProductListing>(data) : []),
    [data, hasStoreSettings]
  );

  const publishMutation = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      if (publish) return storeService.publishListing(id);
      return storeService.unpublishListing(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store', 'listings'] });
      queryClient.invalidateQueries({ queryKey: ['store', 'setup-status'] });
    },
    onError: (e: unknown) => {
      Alert.alert('Update failed', getApiErrorMessage(e, 'Could not update product listing'));
    },
    onSettled: () => setBusyId(null),
  });

  const handleTogglePublish = useCallback(
    (listing: ProductListing) => {
      const publish = listing.status !== 'published';
      setBusyId(listing.id);
      publishMutation.mutate({ id: listing.id, publish });
    },
    [publishMutation]
  );

  const openAddProducts = useCallback(() => {
    router.push('/store-setup/products?mode=edit' as never);
  }, [router]);

  if (isStudio || !hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store products are not enabled for your workspace." />;
  }

  if (isSetupLoading) {
    return <ListLoadingState message="Loading products..." />;
  }

  if (isSetupError) {
    return (
      <ListErrorState
        title="Failed to load store"
        message={getApiErrorMessage(setupError, 'Could not load store status.')}
        onRetry={refetchSetup}
      />
    );
  }

  if (!hasStoreSettings) {
    return (
      <ScreenShell style={styles.container}>
        <OnlineStoreWelcome
          chrome="tab"
          onCreateStore={() => router.push('/store-setup/confirm-name' as never)}
        />
      </ScreenShell>
    );
  }

  const renderItem = ({ item }: { item: ProductListing }) => {
    const isPublished = item.status === 'published';
    const statusColor = isPublished
      ? { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }
      : { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
    const imageUri = listingImage(item);
    const price = Number.parseFloat(String(item.publicPrice ?? ''));

    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardTop}>
          <View style={[styles.thumb, { borderColor }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.thumbImg} contentFit="cover" />
            ) : (
              <AppIcon name="package" size={20} color={mutedColor} />
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
              {item.title || item.product?.name || 'Untitled product'}
            </Text>
            <Text style={[styles.price, { color: colors.tint }]}>
              {Number.isFinite(price) && price > 0 ? formatCurrency(price) : 'No price set'}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>
              {isPublished ? 'Published' : item.status || 'Draft'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => handleTogglePublish(item)}
          disabled={busyId === item.id}
          style={({ pressed }) => [
            styles.toggleBtn,
            { borderColor, opacity: pressed || busyId === item.id ? 0.85 : 1 },
          ]}
        >
          {busyId === item.id ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <>
              <AppIcon name={isPublished ? 'eye-off' : 'eye'} size={16} color={colors.tint} />
              <Text style={[styles.toggleText, { color: colors.tint }]}>
                {isPublished ? 'Hide from store' : 'Publish to store'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  const isEmpty = listings.length === 0;
  const loadErrorMessage = getApiErrorMessage(error, 'Could not load store products.');

  return (
    <ScreenShell style={styles.container}>
      {isLoading ? (
        <ListLoadingState message="Loading products..." />
      ) : isError ? (
        <ListErrorState title="Failed to load" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={listContentStyleWhenEmpty(styles.list, isEmpty)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
          }
          ListHeaderComponent={
            <>
              <Pressable
                onPress={openAddProducts}
                style={({ pressed }) => [
                  styles.addBtn,
                  { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <AppIcon name="plus" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add products from stock</Text>
              </Pressable>
              <Text style={[styles.hint, { color: mutedColor }]}>
                Publish or hide products on your online store.
              </Text>
              <FilterChipRow
                options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </>
          }
          ListEmptyComponent={
            <ListEmptyState
              imageKey="PRODUCTS"
              title={statusFilter === 'all' ? 'No products online yet' : 'No products here'}
              subtitle="Add products from your stock to start selling online"
            />
          }
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 12, marginBottom: 12 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...standaloneFullWidth,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  cardBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700' },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  price: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...standaloneFullWidth,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  toggleText: { fontSize: 14, fontWeight: '600' },
});
