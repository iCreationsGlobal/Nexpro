import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { EmptyStateActionButton, ListActionButton, ListEmptyState } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { rentalService, type RentalRow } from '@/services/rentalService';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { isRentalBusinessType } from '@/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { computeRentalFinancials } from '@/utils/rentalFinancials';
import {
  getRentalCustomerLabel,
  getRentalItemsSummary,
  getRentalReference,
  getRentalStatusColors,
  getRentalStatusLabel,
  isRentalDueToday,
  matchesRentalSearch,
  RENTAL_LIST_FILTERS,
  type RentalListFilter,
} from '@/utils/rentalStatus';

export default function RentalsScreen() {
  const router = useRouter();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const [filter, setFilter] = useState<RentalListFilter>('active');

  const isRentalTenant = isRentalBusinessType(activeTenant?.businessType);
  const rentalsEnabled = !!activeTenantId && isRentalTenant && hasFeature('rentals') && scopeReady;

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'rentals', placeholder: SEARCH_PLACEHOLDERS.RENTALS });
  const debouncedSearch = useDebounce(searchValue, 400);

  const { data, isLoading, isError, error, isRefetching, refetch } = useQuery({
    queryKey: ['rentals', activeTenantId, activeShopId, activeStudioLocationId, filter],
    queryFn: async () => {
      if (filter === 'overdue') {
        return rentalService.getRentals({ overdue: true });
      }
      return rentalService.getRentals({});
    },
    enabled: rentalsEnabled,
  });

  const rows = useMemo(() => {
    let list = parseApiListResponse<RentalRow>(data);
    if (filter === 'active') {
      list = list.filter((row) => ['active', 'confirmed'].includes(row.status || ''));
    } else if (filter === 'due_today') {
      list = list.filter(isRentalDueToday);
    }
    if (debouncedSearch.trim()) {
      list = list.filter((row) => matchesRentalSearch(row, debouncedSearch));
    }
    return list;
  }, [data, filter, debouncedSearch]);

  const handleNewRental = useCallback(() => {
    router.push('/rental/new' as never);
  }, [router]);

  const hasActiveFilter = filter !== 'active' || !!debouncedSearch.trim();
  const allRows = useMemo(() => parseApiListResponse<RentalRow>(data), [data]);
  const filtersExcludeAll = allRows.length > 0 && rows.length === 0 && hasActiveFilter;
  const searchFilteredOut = allRows.length > 0 && rows.length === 0 && !!debouncedSearch.trim();

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load rentals. Pull to refresh.'),
    [error]
  );

  const renderRow = useCallback(
    ({ item }: { item: RentalRow }) => {
      const statusColors = getRentalStatusColors(item.status);
      const hire = computeRentalFinancials(item);
      return (
        <Pressable
          onPress={() => router.push(`/rental/${encodeURIComponent(item.id)}` as never)}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: cardBg, borderColor, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.rowTop}>
            <Text style={[styles.ref, { color: textColor }]} numberOfLines={1}>
              {getRentalReference(item)}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
              <Text style={[styles.statusText, { color: statusColors.text }]}>
                {getRentalStatusLabel(item.status)}
              </Text>
            </View>
          </View>
          <Text style={[styles.customer, { color: textColor }]} numberOfLines={1}>
            {getRentalCustomerLabel(item)}
          </Text>
          <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
            {getRentalItemsSummary(item)}
          </Text>
          <View style={styles.dateRow}>
            <AppIcon name="calendar" size={14} color={mutedColor} />
            <Text style={[styles.meta, { color: mutedColor }]}>
              {formatDate(item.startDate)} – {formatDate(item.endDate)}
            </Text>
          </View>
          {typeof item.totalDue === 'number' || typeof item.amountPaid === 'number' ? (
            <Text style={[styles.amount, { color: textColor }]}>
              {hire.balance > 0.01
                ? `${formatCurrency(hire.balance)} due`
                : formatCurrency(hire.totalDue)}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [router, cardBg, borderColor, textColor, mutedColor]
  );

  const emptyTitle = searchFilteredOut
    ? 'No matches'
    : filtersExcludeAll
      ? 'No matches for filters'
      : 'Nothing here yet';

  const emptySubtitle = searchFilteredOut
    ? 'Try another term in the search box at the top of the page.'
    : filtersExcludeAll
      ? 'Change the rental filter above.'
      : filter === 'overdue'
        ? 'Overdue rentals will appear here when items are past their due date.'
        : filter === 'due_today'
          ? 'Rentals due back today will appear here.'
          : 'Create a hire or open an existing one to hand over, collect payment, record a return, or report damage.';

  if (!isRentalTenant || !hasFeature('rentals')) {
    return <FeatureAccessDenied message="Rentals are not enabled for this workspace." />;
  }

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && allRows.length > 0 && (
        <ListActionButton
          label="New rental"
          onPress={handleNewRental}
          backgroundColor={colors.tint}
        />
      )}
      {showListFilters(isLoading, isError, allRows.length, hasActiveFilter) && (
        <FilterChipRow
          options={RENTAL_LIST_FILTERS}
          value={filter}
          onChange={(value) => setFilter(value as RentalListFilter)}
        />
      )}

      {isLoading && !data ? (
        <ListLoadingState message="Loading rentals..." />
      ) : isError ? (
        <ListErrorState title="Failed to load rentals" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={listContentStyleWhenEmpty(
            { padding: 12, paddingBottom: 32 },
            rows.length === 0
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
          }
          ListEmptyComponent={
            <ListEmptyState
              imageKey="TASKS"
              title={emptyTitle}
              subtitle={emptySubtitle}
              titleColor={textColor}
              subtitleColor={mutedColor}
            >
              {!hasActiveFilter ? (
                <EmptyStateActionButton
                  label="New rental"
                  onPress={handleNewRental}
                  backgroundColor={colors.tint}
                />
              ) : null}
            </ListEmptyState>
          }
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ref: { fontSize: 16, fontWeight: '700', flex: 1 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  customer: { marginTop: 8, fontSize: 15, fontWeight: '600' },
  meta: { marginTop: 4, fontSize: 13 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  amount: { marginTop: 8, fontSize: 15, fontWeight: '700' },
});
