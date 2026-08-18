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
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { quoteService } from '@/services/quoteService';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';
import { ScreenShell } from '@/components/ScreenShell';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { CURRENCY, isQuotesEnabledForTenant } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { formatStatusLabel } from '@/utils/formatLabels';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    draft: '#6b7280',
    sent: '#3b82f6',
    accepted: '#10b981',
    declined: '#ef4444',
    expired: '#6b7280',
  };
  return statusColors[status] || '#6b7280';
}

type Quote = {
  id: string;
  quoteNumber?: string;
  title: string;
  status: string;
  totalAmount: number;
  validUntil?: string;
  createdAt: string;
  customer?: { id: string; name?: string };
};

export default function QuotesScreen() {
  const router = useRouter();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor } = useScreenColors();

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'quotes', placeholder: SEARCH_PLACEHOLDERS.QUOTES });
  const debouncedSearch = useDebounce(searchValue, 400);

  const shopType = activeTenant?.metadata?.shopType;
  const businessType = activeTenant?.businessType ?? 'printing_press';
  const quotesFeatureOk =
    hasFeature('quoteAutomation') && isQuotesEnabledForTenant(businessType, shopType);

  const { data: response, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: ['quotes', activeTenantId, activeShopId, activeStudioLocationId, statusFilter, debouncedSearch],
    queryFn: async () => {
      const params: { page?: number; limit?: number; status?: string; search?: string } = {
        page: 1,
        limit: 20,
        search: debouncedSearch || undefined,
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      return quoteService.getQuotes(params);
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: !!activeTenantId && quotesFeatureOk && scopeReady,
  });

  const quotes = useMemo(() => parseApiListResponse<Quote>(response), [response]);
  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load quotes. Pull to refresh.'),
    [error]
  );
  const hasActiveFilter = statusFilter !== 'all' || !!debouncedSearch.trim();
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleQuotePress = useCallback(
    (quote: Quote) => {
      router.push(`/quote/${quote.id}` as never);
    },
    [router]
  );

  const quoteFilterOptions = useMemo(
    () =>
      ['all', 'draft', 'sent', 'accepted', 'declined'].map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    []
  );

  const handleNewQuote = useCallback(() => {
    router.push('/quotes-new');
  }, [router]);

  if (!quotesFeatureOk) {
    return <FeatureAccessDenied message="Quotes are not enabled for this workspace." />;
  }

  const renderQuoteItem = ({ item }: { item: Quote }) => {
    const statusColor = getStatusColor(item.status);
    const isExpired = item.validUntil && new Date(item.validUntil) < new Date() && item.status !== 'accepted' && item.status !== 'declined';

    return (
      <Pressable
        onPress={() => handleQuotePress(item)}
        style={({ pressed }) => [
          styles.quoteCard,
          { backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.quoteRow}>
          <View style={styles.quoteInfo}>
            <Text style={[styles.quoteNumber, { color: textColor }]}>
              {item.quoteNumber || `#${item.id.slice(0, 8)}`}
            </Text>
            <Text style={[styles.quoteTitle, { color: textColor }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.quoteCustomer, { color: mutedColor }]} numberOfLines={1}>
              {item.customer?.name ?? '—'}
            </Text>
          </View>
          <Text style={[styles.quoteTotal, { color: colors.tint }]}>
            {formatCurrency(item.totalAmount)}
          </Text>
        </View>
        <View style={styles.quoteMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {formatStatusLabel(item.status)}
            </Text>
          </View>
          {item.validUntil && (
            <Text style={[styles.validUntil, { color: isExpired ? '#ef4444' : mutedColor }]}>
              Valid until {formatDate(item.validUntil)}
            </Text>
          )}
          <Text style={[styles.quoteDate, { color: mutedColor }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && quotes.length > 0 && quotesFeatureOk && (
        <ListActionButton
          label="New Quote"
          onPress={handleNewQuote}
          backgroundColor={colors.tint}
        />
      )}

      {showListFilters(isLoading, isError, quotes.length, hasActiveFilter) && (
        <FilterChipRow
          options={quoteFilterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      )}

      {isLoading ? (
        <ListLoadingState message="Loading quotes..." />
      ) : isError ? (
        <ListErrorState title="Failed to load quotes" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={quotes}
          keyExtractor={(item) => item.id}
          renderItem={renderQuoteItem}
          contentContainerStyle={listContentStyleWhenEmpty(styles.listContent, quotes.length === 0)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
          ListEmptyComponent={
            <ListEmptyState
              imageKey="QUOTES"
              title={statusFilter === 'all' ? 'No quotes yet' : 'No quotes in this filter'}
              subtitle={
                statusFilter === 'all'
                  ? 'Create quotes to share pricing with customers'
                  : 'Try another filter'
              }
            >
              {statusFilter === 'all' && quotesFeatureOk ? (
                <EmptyStateActionButton
                  label="New Quote"
                  onPress={handleNewQuote}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  filterText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 32 },
  quoteCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quoteInfo: { flex: 1, marginRight: 12 },
  quoteNumber: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  quoteTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  quoteCustomer: { fontSize: 14 },
  quoteTotal: { fontSize: 16, fontWeight: '700' },
  quoteMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  validUntil: { fontSize: 12 },
  quoteDate: { fontSize: 12 },
  pressed: { opacity: 0.8 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
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
  modalBody: { padding: 20 },
  detailRow: { marginBottom: 16 },
  detailLabel: { fontSize: 12, marginBottom: 4 },
  detailValue: { fontSize: 16, fontWeight: '500' },
  detailSection: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemName: { flex: 1, fontSize: 14 },
  itemTotal: { fontSize: 14, fontWeight: '600' },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  footerBtnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  footerBtnOutlineText: { fontSize: 15, fontWeight: '600' },
  convertButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: BRAND_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convertButtonDisabled: {
    opacity: 0.7,
  },
  convertButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
