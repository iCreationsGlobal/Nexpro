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
  ScrollView,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { ListEmptyState } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { deliveryService, type DeliveryQueueRow } from '@/services/deliveryService';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { resolveBusinessType } from '@/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import {
  DELIVERY_ACTIVE_FILTERS,
  DELIVERY_STATUS_ORDER,
  getDeliveryQueueFilterLabel,
  getDeliveryStatusColors,
  getDeliveryStatusDisplayLabel,
} from '@/utils/deliveryStatus';
import { useMarkInteractiveAfterStartup } from '@/hooks/useMarkInteractiveAfterStartup';

export default function DeliveriesScreen() {
  useMarkInteractiveAfterStartup();
  const { activeTenantId, activeTenant, hasFeature, isDriver } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, resolvedTheme } = useScreenColors();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'active' | 'done'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pickerRow, setPickerRow] = useState<DeliveryQueueRow | null>(null);

  const isStudioLike = resolveBusinessType(activeTenant?.businessType) === 'studio';
  const isTerminalFilter = isDriver ? scope === 'done' : statusFilter === 'delivered' || statusFilter === 'returned';
  const inStoreSetup = useIsStoreSetupRoute();
  const deliveriesEnabled = (hasFeature('deliveries') || isDriver) && !inStoreSetup;

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({
    scope: 'deliveries',
    placeholder: isStudioLike ? SEARCH_PLACEHOLDERS.JOBS : SEARCH_PLACEHOLDERS.SALES,
  });
  const debouncedSearch = useDebounce(searchValue, 400);

  const activeQuery = useQuery({
    queryKey: ['deliveries-queue', 'active', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => deliveryService.getQueue('active'),
    enabled: !!activeTenantId && scopeReady && !isTerminalFilter && deliveriesEnabled,
  });

  const doneQuery = useQuery({
    queryKey: ['deliveries-queue', 'done', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => deliveryService.getQueue('done'),
    enabled: !!activeTenantId && scopeReady && isTerminalFilter && deliveriesEnabled,
  });

  const queueRes = isTerminalFilter ? doneQuery.data : activeQuery.data;
  const isLoading = isTerminalFilter ? doneQuery.isLoading : activeQuery.isLoading;
  const isError = isTerminalFilter ? doneQuery.isError : activeQuery.isError;
  const queryError = isTerminalFilter ? doneQuery.error : activeQuery.error;
  const isRefetching = activeQuery.isRefetching || doneQuery.isRefetching;
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['deliveries-queue'] });
  }, [queryClient]);

  const rows: DeliveryQueueRow[] = useMemo(() => {
    const raw = queueRes?.data?.rows;
    if (!Array.isArray(raw)) return [];
    return isStudioLike ? raw.filter((r) => r.entityType === 'job') : raw.filter((r) => r.entityType === 'sale');
  }, [queueRes, isStudioLike]);

  const statusFilteredRows = useMemo(() => {
    if (isDriver) {
      if (scope === 'done') {
        if (statusFilter === 'delivered') return rows.filter((r) => r.deliveryStatus === 'delivered');
        return rows;
      }
      if (statusFilter === 'ready_for_delivery') {
        return rows.filter((r) => r.deliveryStatus === 'ready_for_delivery');
      }
      if (statusFilter === 'out_for_delivery') {
        return rows.filter((r) => r.deliveryStatus === 'out_for_delivery');
      }
      return rows;
    }

    if (isTerminalFilter) {
      if (statusFilter === 'delivered') {
        return rows.filter((r) => r.deliveryStatus === 'delivered');
      }
      if (statusFilter === 'returned') {
        return rows.filter((r) => r.deliveryStatus === 'returned');
      }
      return rows;
    }
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'not_set') return rows.filter((r) => !r.deliveryStatus);
    if (statusFilter === 'ready_for_delivery') {
      return rows.filter((r) => r.deliveryStatus === 'ready_for_delivery');
    }
    if (statusFilter === 'out_for_delivery') {
      return rows.filter((r) => r.deliveryStatus === 'out_for_delivery');
    }
    return rows;
  }, [rows, statusFilter, isTerminalFilter, isDriver, scope]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return statusFilteredRows;
    return statusFilteredRows.filter((r) => {
      const blob = [r.reference, r.title, r.customerName, r.customerPhone, r.addressSummary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [statusFilteredRows, debouncedSearch]);

  const hasActiveFilter = statusFilter !== 'all' || !!debouncedSearch.trim();
  const filtersExcludeAll = rows.length > 0 && statusFilteredRows.length === 0 && statusFilter !== 'all';
  const searchFilteredOut =
    statusFilteredRows.length > 0 && filtered.length === 0 && !!debouncedSearch.trim();

  const patchMutation = useMutation({
    mutationFn: (updates: Parameters<typeof deliveryService.patchStatuses>[0]) =>
      deliveryService.patchStatuses(updates),
    onSuccess: (response) => {
      const failed = response?.data?.results?.find((result: { ok?: boolean }) => !result.ok);
      if (failed) {
        Alert.alert('Update failed', failed.message || 'Could not update delivery status');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['deliveries-queue'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'infinite'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setPickerRow(null);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      Alert.alert('Update failed', e?.response?.data?.message || e?.message || 'Try again');
    },
  });

  const deliveryFilterOptions = useMemo(
    () => {
      const filters = isDriver
        ? scope === 'done'
          ? (['all', 'delivered'] as const)
          : (['all', 'ready_for_delivery', 'out_for_delivery'] as const)
        : DELIVERY_ACTIVE_FILTERS;
      return filters.map((f) => ({
        value: f,
        label: getDeliveryQueueFilterLabel(isDriver && scope === 'done' ? 'done' : 'active', f),
      }));
    },
    [isDriver, scope]
  );

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(queryError, 'Could not load deliveries. Pull to refresh.'),
    [queryError]
  );

  const renderRow = ({ item }: { item: DeliveryQueueRow }) => {
    const label = getDeliveryStatusDisplayLabel(item.deliveryStatus);
    const statusColors = getDeliveryStatusColors(item.deliveryStatus);
    const unset = !item.deliveryStatus;
    const pillText = unset && resolvedTheme === 'dark' ? mutedColor : statusColors.text;
    const pillBorder = unset && resolvedTheme === 'dark' ? borderColor : statusColors.border;
    const canStart = isDriver && item.deliveryStatus === 'ready_for_delivery';
    const canComplete = isDriver && item.deliveryStatus === 'out_for_delivery';

    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.rowTop}>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { borderColor }]}>
              <Text style={[styles.typeBadgeText, { color: mutedColor }]}>
                {item.entityType === 'job' ? 'Job' : 'Sale'}
              </Text>
            </View>
            {item.isOnlineStore || item.title === 'Online delivery order' ? (
              <View style={[styles.onlineBadge, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
                <Text style={[styles.onlineBadgeText, { color: '#b45309' }]}>Online store</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.ref, { color: textColor }]} numberOfLines={1}>
            {item.reference || item.id.slice(0, 8)}
          </Text>
          <AppIcon name="truck" size={14} color={colors.tint} />
        </View>
        {item.title ? (
          <Text style={[styles.title, { color: mutedColor }]} numberOfLines={2}>
            {item.title}
          </Text>
        ) : null}
        {item.customerName ? (
          <Text style={[styles.cust, { color: textColor }]} numberOfLines={1}>
            {item.customerName}
          </Text>
        ) : null}
        {item.customerPhone ? (
          <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={1}>
            {item.customerPhone}
          </Text>
        ) : null}
        {item.addressSummary ? (
          <Text style={[styles.meta, { color: mutedColor }]} numberOfLines={2}>
            {item.addressSummary}
          </Text>
        ) : null}
        {!isDriver ? (
          <Pressable
            onPress={() => setPickerRow(item)}
            style={({ pressed }) => [
              styles.statusSelect,
              {
                borderColor: pillBorder,
                backgroundColor: unset ? cardBg : statusColors.bg,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[styles.statusSelectText, { color: pillText }]} numberOfLines={1}>
              {label}
            </Text>
            <AppIcon name="chevron-down" size={16} color={pillText} />
          </Pressable>
        ) : canStart || canComplete ? (
          <>
            <View
              style={[
                styles.statusSelect,
                {
                  borderColor: pillBorder,
                  backgroundColor: unset ? cardBg : statusColors.bg,
                },
              ]}
            >
              <Text style={[styles.statusSelectText, { color: pillText }]} numberOfLines={1}>
                {label}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                patchMutation.mutate([
                  {
                    entityType: item.entityType,
                    id: item.id,
                    deliveryStatus: canStart ? 'out_for_delivery' : 'delivered',
                  },
                ]);
              }}
              disabled={patchMutation.isPending}
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: colors.tint },
                (pressed || patchMutation.isPending) && styles.actionPressed,
              ]}
            >
              {patchMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <AppIcon name={canStart ? 'truck' : 'check'} size={16} color="#fff" />
                  <Text style={styles.primaryActionText}>
                    {canStart ? 'Start delivery' : 'Mark delivered'}
                  </Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <View
            style={[
              styles.statusSelect,
              {
                borderColor: pillBorder,
                backgroundColor: unset ? cardBg : statusColors.bg,
              },
            ]}
          >
            <Text style={[styles.statusSelectText, { color: pillText }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const emptyTitle = searchFilteredOut
    ? 'No matches'
    : filtersExcludeAll
      ? 'No matches for filters'
      : 'Nothing here yet';

  const emptySubtitle = searchFilteredOut
    ? 'Try another term in the search box at the top of the page.'
    : filtersExcludeAll
      ? 'Change the delivery status filter above.'
      : isDriver
        ? scope === 'active'
          ? 'Assigned deliveries that are ready or already out for delivery will appear here.'
          : 'Deliveries you completed recently will appear here.'
        : isStudioLike
        ? 'When jobs are completed, they appear here so you can set delivery status.'
        : 'When sales are completed, they appear here so you can set delivery status.';

  if (!deliveriesEnabled) {
    return <FeatureAccessDenied message="Deliveries are not enabled for this workspace." />;
  }

  return (
    <ScreenShell style={styles.container}>
      {isDriver ? (
        <View style={[styles.driverHero, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.driverHeroIcon}>
            <AppIcon name="truck" size={22} color={colors.tint} />
          </View>
          <View style={styles.driverHeroCopy}>
            <Text style={[styles.driverHeroTitle, { color: textColor }]}>My deliveries</Text>
            <Text style={[styles.driverHeroSubtitle, { color: mutedColor }]}>
              Start assigned deliveries, mark them delivered, and review completed work.
            </Text>
          </View>
        </View>
      ) : null}

      {isDriver ? (
        <View style={[styles.scopeTabs, { backgroundColor: cardBg, borderColor }]}>
          {[
            { value: 'active' as const, label: 'My Deliveries' },
            { value: 'done' as const, label: 'Completed' },
          ].map((tab) => {
            const selected = scope === tab.value;
            return (
              <Pressable
                key={tab.value}
                onPress={() => {
                  setScope(tab.value);
                  setStatusFilter('all');
                }}
                style={[
                  styles.scopeTab,
                  selected && { backgroundColor: colors.tint },
                ]}
              >
                <Text style={[styles.scopeTabText, { color: selected ? '#fff' : textColor }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showListFilters(isLoading, isError, rows.length, hasActiveFilter) && (
        <FilterChipRow
          options={deliveryFilterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      )}

      {isLoading && !queueRes ? (
        <ListLoadingState message="Loading deliveries..." />
      ) : isError ? (
        <ListErrorState title="Failed to load deliveries" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={filtered}
          keyExtractor={(item) => `${item.entityType}:${item.id}`}
          renderItem={renderRow}
          contentContainerStyle={listContentStyleWhenEmpty(
            { padding: 12, paddingBottom: 32 },
            filtered.length === 0
          )}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />}
          ListEmptyComponent={
            <ListEmptyState
              imageKey="DELIVERIES"
              title={emptyTitle}
              subtitle={emptySubtitle}
              titleColor={textColor}
              subtitleColor={mutedColor}
            />
          }
        />
      )}

      {!isDriver && (
      <AppBottomSheet
        visible={!!pickerRow}
        title="Delivery status"
        onClose={() => setPickerRow(null)}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        <SheetMenuRow
          label="Not set yet"
          active={!pickerRow?.deliveryStatus}
          onPress={() => {
            if (!pickerRow) return;
            patchMutation.mutate([
              { entityType: pickerRow.entityType, id: pickerRow.id, deliveryStatus: null },
            ]);
          }}
          trailing={
            !pickerRow?.deliveryStatus ? (
              <AppIcon name="check" size={18} color="#fff" />
            ) : (
              <View />
            )
          }
        />
        {DELIVERY_STATUS_ORDER.map((key) => {
          const selected = pickerRow?.deliveryStatus === key;
          return (
            <SheetMenuRow
              key={key}
              label={getDeliveryStatusDisplayLabel(key)}
              active={selected}
              onPress={() => {
                if (!pickerRow) return;
                patchMutation.mutate([
                  { entityType: pickerRow.entityType, id: pickerRow.id, deliveryStatus: key },
                ]);
              }}
              trailing={
                selected ? <AppIcon name="check" size={18} color="#fff" /> : <View />
              }
            />
          );
        })}
      </AppBottomSheet>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  driverHero: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.1)',
  },
  driverHeroCopy: { flex: 1 },
  driverHeroTitle: { fontSize: 18, fontWeight: '800' },
  driverHeroSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  scopeTabs: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  scopeTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  scopeTabText: { fontSize: 13, fontWeight: '700' },
  filterRow: { paddingHorizontal: 12, paddingTop: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  onlineBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  onlineBadgeText: { fontSize: 11, fontWeight: '600' },
  ref: { fontSize: 16, fontWeight: '700', flex: 1 },
  title: { marginTop: 6, fontSize: 14 },
  cust: { marginTop: 6, fontSize: 14, fontWeight: '500' },
  meta: { marginTop: 4, fontSize: 12 },
  statusSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  statusSelectText: { fontSize: 14, fontWeight: '600', flex: 1 },
  primaryAction: {
    minHeight: 44,
    borderRadius: 10,
    marginTop: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  actionPressed: { opacity: 0.85 },
});
