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
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { flatListStyleForEmpty, listContentStyleWhenEmpty } from '@/utils/listEmptyLayout';
import { QUERY_STALE } from '@/utils/queryInvalidation';

type ServiceListing = {
  id: string;
  title?: string;
  status?: string;
  priceType?: string;
  startingPrice?: number | string;
  shortDescription?: string;
};

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Hidden', value: 'hidden' },
] as const;

function formatPriceLabel(listing: ServiceListing): string {
  if (listing.priceType === 'quote_only') return 'Quote on request';
  const price = Number.parseFloat(String(listing.startingPrice || 0));
  if (!price) return 'Price on request';
  return listing.priceType === 'fixed' ? formatCurrency(price) : `From ${formatCurrency(price)}`;
}

export default function StoreServicesScreen() {
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
    !!activeTenantId && scopeReady && isStudio && hasFeature('paymentsExpenses') && !inStoreSetup;

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
    queryKey: ['store', 'service-listings', activeTenantId, activeShopId, activeStudioLocationId, queryParams],
    queryFn: () => storeService.getServiceListings(queryParams),
    enabled: featureEnabled && hasStoreSettings,
    staleTime: QUERY_STALE.LIST,
  });

  const listings = useMemo(() => {
    if (!hasStoreSettings) return [];
    const body = (data as { data?: unknown })?.data ?? data ?? {};
    return Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: ServiceListing[] }).data)
      : Array.isArray(body)
        ? (body as ServiceListing[])
        : [];
  }, [data, hasStoreSettings]);

  const publishMutation = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      if (publish) return storeService.publishServiceListing(id);
      return storeService.unpublishServiceListing(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store', 'service-listings'] });
      queryClient.invalidateQueries({ queryKey: ['store', 'setup-status'] });
    },
    onError: (e: unknown) => {
      Alert.alert('Update failed', getApiErrorMessage(e, 'Could not update service listing'));
    },
    onSettled: () => setBusyId(null),
  });

  const handleTogglePublish = useCallback(
    (listing: ServiceListing) => {
      const publish = listing.status !== 'published';
      setBusyId(listing.id);
      publishMutation.mutate({ id: listing.id, publish });
    },
    [publishMutation]
  );

  if (!isStudio || !hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Studio services are not enabled for your workspace." />;
  }

  if (isSetupLoading) {
    return <ListLoadingState message="Loading services..." />;
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

  const renderItem = ({ item }: { item: ServiceListing }) => {
    const isPublished = item.status === 'published';
    const statusColor = isPublished
      ? { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }
      : { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };

    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardTop}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {item.title || 'Untitled service'}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>
              {isPublished ? 'Published' : item.status || 'Draft'}
            </Text>
          </View>
        </View>
        {item.shortDescription ? (
          <Text style={[styles.desc, { color: mutedColor }]} numberOfLines={2}>
            {item.shortDescription}
          </Text>
        ) : null}
        <Text style={[styles.price, { color: colors.tint }]}>{formatPriceLabel(item)}</Text>
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
  const loadErrorMessage = getApiErrorMessage(error, 'Could not load studio services.');

  return (
    <ScreenShell style={styles.container}>
      {isLoading ? (
        <ListLoadingState message="Loading services..." />
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
              <Text style={[styles.hint, { color: mutedColor }]}>
                Create and edit service details on the web app. Publish or hide services here.
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
              title="No studio services"
              subtitle="Import or create services on the web app, then publish them here"
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
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  desc: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  price: { fontSize: 14, fontWeight: '600', marginTop: 8 },
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
