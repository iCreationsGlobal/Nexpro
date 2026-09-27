import { useSimpleMode } from '@/hooks/useSimpleMode';
import { SimpleSalesScreen } from '@/components/simple/SimpleSalesScreen';
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { saleService } from '@/services/saleService';
import { CURRENCY } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { resolveBusinessType } from '@/constants';
import { ListEmptyState } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { matchesSearchQuery } from '@/utils/matchesSearchQuery';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { formatStatusLabel, getSaleStatusColors } from '@/utils/formatLabels';
import { QUERY_STALE } from '@/utils/queryInvalidation';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type SaleItem = { name: string; quantity: number; total: number; unitPrice?: number };

type Sale = {
  id: string;
  saleNumber?: string;
  total: number;
  amountPaid?: number;
  balance?: number;
  status: string;
  paymentMethod?: string;
  change?: number;
  createdAt: string;
  customer?: { id: string; name?: string; phone?: string; email?: string };
  shop?: { name?: string };
  items?: SaleItem[];
};

type SalesListResponse = {
  count?: number;
  summary?: {
    totalSales?: number;
    completedCount?: number;
    pendingCount?: number;
    completedRevenue?: number;
  };
  pagination?: {
    page?: number;
    totalPages?: number;
  };
  data?: Sale[];
};

/** Simple Mode shows the essentials-only screen; everyone else the full one. */
export default function SalesScreenRoute() {
  const { isRestricted } = useSimpleMode();
  return isRestricted ? <SimpleSalesScreen /> : <SalesScreen />;
}

function SalesScreen() {
  const router = useRouter();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'sales', placeholder: SEARCH_PLACEHOLDERS.SALES });
  const debouncedSearch = useDebounce(searchValue, 400);

  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isShop = resolvedType === 'shop';
  const isPharmacy = resolvedType === 'pharmacy';
  const inStoreSetup = useIsStoreSetupRoute();

  const {
    data: pagesData,
    isLoading,
    refetch,
    isRefetching,
    error,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['sales', 'infinite', activeTenantId, activeShopId, activeStudioLocationId, statusFilter],
    queryFn: async ({ pageParam }) => {
      const params: { page?: number; limit?: number; status?: string } = {
        page: pageParam,
        limit: 15,
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      return saleService.getSales(params) as Promise<SalesListResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const page = Number(lastPage?.pagination?.page || 1);
      const totalPages = Number(lastPage?.pagination?.totalPages || 1);
      return page < totalPages ? page + 1 : undefined;
    },
    enabled:
      !!activeTenantId
      && (isShop || isPharmacy)
      && hasFeature('paymentsExpenses')
      && scopeReady
      && !inStoreSetup,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const response = pagesData?.pages?.[0];
  const rawSales = useMemo(
    () => (pagesData?.pages ?? []).flatMap((page) => parseApiListResponse<Sale>(page)),
    [pagesData]
  );

  const sales = useMemo(() => {
    const list = rawSales;
    if (!debouncedSearch.trim()) return list;
    return list.filter((sale) =>
      matchesSearchQuery(debouncedSearch, [
        sale.saleNumber,
        sale.customer?.name,
        sale.customer?.phone,
        sale.status,
        sale.total,
      ])
    );
  }, [rawSales, debouncedSearch]);

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'An error occurred while loading sales. Please try again.'),
    [error]
  );

  const isEmpty = !isLoading && !isError && sales.length === 0;
  const salesStats = useMemo(() => {
    const apiResponse = response as SalesListResponse | undefined;
    const summary = apiResponse?.summary ?? {};
    return {
      totalSales: Number(summary.totalSales ?? apiResponse?.count ?? rawSales.length),
      completedCount: Number(summary.completedCount ?? 0),
      pendingCount: Number(summary.pendingCount ?? 0),
      completedRevenue: Number(summary.completedRevenue ?? 0),
    };
  }, [response, rawSales.length]);
  const hasActiveFilter = statusFilter !== 'all' || !!debouncedSearch.trim();
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const filterOptions = useMemo(
    () =>
      (['all', 'completed', 'pending', 'partially_paid'] as const).map((s) => ({
        value: s,
        label: s === 'all' ? 'All' : formatStatusLabel(s),
      })),
    []
  );

  const handleSalePress = useCallback(
    (sale: Sale) => {
      router.push(`/sale/${sale.id}` as never);
    },
    [router]
  );

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Sales are not enabled for this workspace." />;
  }


  const renderSaleItem = ({ item }: { item: Sale }) => {
    const statusColors = getSaleStatusColors(item.status);
    return (
      <Pressable
        onPress={() => handleSalePress(item)}
        style={({ pressed }) => [
          styles.saleCard,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.saleRow}>
          <Text style={[styles.saleNumber, { color: textColor }]}>
            {item.saleNumber || `#${item.id.slice(0, 8)}`}
          </Text>
          <Text style={[styles.saleTotal, { color: colors.tint }]}>
            {formatCurrency(item.total)}
          </Text>
        </View>
        <Text style={[styles.saleCustomer, { color: mutedColor }]} numberOfLines={1}>
          {item.customer?.name ?? 'Walk-in'}
        </Text>
        <View style={styles.saleMeta}>
          <Text style={[styles.saleDate, { color: mutedColor }]}>
            {formatDate(item.createdAt)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {formatStatusLabel(item.status)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!isShop && !isPharmacy) {
    return <FeatureAccessDenied message="Sales are only available for shop and pharmacy workspaces." />;
  }

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && rawSales.length > 0 && (
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Total Sales</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{salesStats.totalSales}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#dcfce7' }]}>
                <AppIcon name="receipt" size={18} color={colors.tint} />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Completed</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{salesStats.completedCount}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#ecfdf5' }]}>
                <AppIcon name="check-circle" size={18} color="#16a34a" />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Pending</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{salesStats.pendingCount}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#fef3c7' }]}>
                <AppIcon name="clock-o" size={18} color="#d97706" />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Total Revenue</Text>
                <Text style={[styles.statValue, { color: textColor }]}>
                  {formatCurrency(salesStats.completedRevenue)}
                </Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#dbeafe' }]}>
                <AppIcon name="money" size={18} color="#2563eb" />
              </View>
            </View>
          </View>
        </View>
      )}

      {showListFilters(isLoading, isError, rawSales.length, hasActiveFilter) && (
        <FilterChipRow options={filterOptions} value={statusFilter} onChange={setStatusFilter} />
      )}

      {isLoading && !response ? (
        <ListLoadingState message="Loading sales..." />
      ) : isError ? (
        <ListErrorState title="Failed to load sales" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={renderSaleItem}
          contentContainerStyle={listContentStyleWhenEmpty(styles.listContent, isEmpty)}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={onRefresh}
              tintColor={colors.tint}
            />
          }
          ListFooterComponent={
            !isEmpty && hasNextPage ? (
              <Pressable
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={[styles.loadMoreButton, { borderColor }]}
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <Text style={[styles.loadMoreText, { color: colors.tint }]}>Load more sales</Text>
                )}
              </Pressable>
            ) : !isEmpty && rawSales.length > 0 ? (
              <Text style={[styles.endOfListText, { color: mutedColor }]}>
                Showing all loaded sales
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <ListEmptyState
              imageKey="SALES"
              title="No sales yet"
              subtitle="Complete a sale from POS and it will show up here"
              titleColor={textColor}
              subtitleColor={mutedColor}
            />
          }
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  filterText: { fontSize: 14, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  statCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  statTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  cardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, flexShrink: 1, textAlign: 'left' },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  listContent: { padding: 16, paddingBottom: 32 },
  loadMoreButton: {
    marginTop: 4,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: { fontSize: 14, fontWeight: '700' },
  endOfListText: { textAlign: 'center', fontSize: 12, marginTop: 4, marginBottom: 16 },
  saleCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  saleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saleNumber: { fontSize: 16, fontWeight: '600' },
  saleTotal: { fontSize: 16, fontWeight: '700' },
  saleCustomer: { fontSize: 14, marginTop: 4 },
  saleMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  saleDate: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20, maxHeight: 360 },
  detailRow: { marginBottom: 16 },
  detailLabel: { fontSize: 12, marginBottom: 4 },
  detailValue: { fontSize: 16, fontWeight: '500' },
  detailSection: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemName: { flex: 1, fontSize: 14 },
  itemTotal: { fontSize: 14, fontWeight: '600' },
  modalActions: { padding: 16, borderTopWidth: 1 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  actionBtnOutline: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  actionBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  paymentBlock: { gap: 10 },
  inputLabel: { fontSize: 12, fontWeight: '500' },
  paymentInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});
