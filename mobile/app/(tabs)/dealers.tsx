import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { flatListStyleForEmpty } from '@/utils/listEmptyLayout';
import { dealerService, type DealerPayload } from '@/services/dealerService';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FormSheetModal } from '@/components/FormSheetModal';
import { FORM_LABELS } from '@/constants/formLabels';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { refreshAfterDealerChange, QUERY_STALE } from '@/utils/queryInvalidation';
import { formatCurrency } from '@/utils/formatCurrency';
import { standaloneFullWidth } from '@/styles/standaloneButton';
import { resolveBusinessType } from '@/constants';
import { FilterChipRow } from '@/components/FilterChip';

type DealerRow = {
  id: string;
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  balance?: number | string;
  creditLimit?: number | string;
  availableCredit?: number | string;
  isActive?: boolean;
};

type DealerStats = {
  totalDealers?: number;
  totalOutstanding?: number;
  totalAvailableCredit?: number;
};

const DEFAULT_DEALER_FORM = {
  businessName: '',
  contactName: '',
  email: '',
  phone: '',
  creditTerms: '',
  creditLimit: '',
  openingBalance: '',
  notes: '',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function DealersScreen() {
  const params = useLocalSearchParams<{ search?: string; add?: string }>();
  const router = useRouter();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { scopeReady } = useWorkspaceScope();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const queryClient = useQueryClient();

  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isRetailLike = resolvedType === 'shop' || resolvedType === 'pharmacy';

  const { searchValue, setSearchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'dealers', placeholder: SEARCH_PLACEHOLDERS.DEALERS });
  const [addModalVisible, setAddModalVisible] = useState(params.add === '1');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState(DEFAULT_DEALER_FORM);

  useEffect(() => {
    if (params.search) setSearchValue(String(params.search));
    if (params.add === '1') setAddModalVisible(true);
  }, [params.search, params.add, setSearchValue]);

  const debouncedSearch = useDebounce(searchValue, 400);

  const dealersEnabled =
    !!activeTenantId && isRetailLike && hasFeature('dealersAccount') && scopeReady;

  const { data: response, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: [
      'dealers',
      activeTenantId,
      debouncedSearch,
      statusFilter,
    ],
    queryFn: () =>
      dealerService.getAll({
        page: 1,
        limit: 50,
        search: debouncedSearch || undefined,
        ...(statusFilter === 'active' ? { isActive: true } : {}),
        ...(statusFilter === 'inactive' ? { isActive: false } : {}),
      }),
    enabled: dealersEnabled,
    staleTime: QUERY_STALE.LIST,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const { data: statsResponse } = useQuery({
    queryKey: ['dealers', 'stats', activeTenantId],
    queryFn: () => dealerService.getStats(),
    enabled: dealersEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: DealerPayload) => dealerService.create(payload),
    onSuccess: async () => {
      await refreshAfterDealerChange(queryClient);
      setAddModalVisible(false);
      setFormData(DEFAULT_DEALER_FORM);
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to add dealer'));
    },
  });

  const dealers = useMemo(() => parseApiListResponse<DealerRow>(response), [response]);
  const dealerStats = useMemo(() => {
    const stats = (statsResponse ?? {}) as DealerStats;
    return {
      totalDealers: Number(stats.totalDealers ?? 0),
      totalOutstanding: Number(stats.totalOutstanding ?? 0),
      totalAvailableCredit: Number(stats.totalAvailableCredit ?? 0),
    };
  }, [statsResponse]);

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load dealers. Pull to refresh.'),
    [error]
  );

  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleDealerPress = useCallback(
    (dealer: DealerRow) => {
      router.push(`/dealer/${dealer.id}` as never);
    },
    [router]
  );

  const handleAddDealer = useCallback(() => {
    if (!formData.businessName.trim()) {
      Alert.alert('Error', 'Business name is required');
      return;
    }
    const creditLimit = formData.creditLimit.trim() ? Number(formData.creditLimit) : 0;
    const openingBalance = formData.openingBalance.trim() ? Number(formData.openingBalance) : 0;
    if (creditLimit < 0 || openingBalance < 0) {
      Alert.alert('Error', 'Credit limit and opening balance cannot be negative');
      return;
    }
    createMutation.mutate({
      businessName: formData.businessName.trim(),
      contactName: formData.contactName.trim() || undefined,
      email: formData.email.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      creditTerms: formData.creditTerms.trim() || undefined,
      creditLimit,
      openingBalance,
      notes: formData.notes.trim() || undefined,
    });
  }, [formData, createMutation]);

  if (!hasFeature('dealersAccount')) {
    return <FeatureAccessDenied message="Dealers account is not enabled for this workspace." />;
  }

  if (!isRetailLike) {
    return (
      <FeatureAccessDenied message="Dealers are only available for shop and pharmacy workspaces." />
    );
  }

  const renderDealerItem = ({ item }: { item: DealerRow }) => (
    <Pressable
      onPress={() => handleDealerPress(item)}
      style={({ pressed }) => [
        styles.dealerCard,
        { backgroundColor: cardBg, borderColor },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.dealerRow}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.tint }]}>
          <Text style={styles.avatarText}>
            {(item.businessName || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.dealerInfo}>
          <Text style={[styles.dealerName, { color: textColor }]} numberOfLines={1}>
            {item.businessName}
          </Text>
          <Text style={[styles.dealerMeta, { color: mutedColor }]} numberOfLines={1}>
            {item.contactName || item.phone || item.email || '—'}
          </Text>
          <Text style={[styles.dealerBalance, { color: Number(item.balance) > 0 ? '#b45309' : mutedColor }]}>
            Outstanding: {formatCurrency(item.balance)}
          </Text>
        </View>
        <AppIcon name="chevron-right" size={14} color={mutedColor} />
      </View>
    </Pressable>
  );

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && (dealers.length > 0 || dealerStats.totalDealers > 0) && (
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Total dealers</Text>
            <Text style={[styles.statValue, { color: textColor }]}>{dealerStats.totalDealers}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Outstanding</Text>
            <Text style={[styles.statValue, { color: textColor }]}>
              {formatCurrency(dealerStats.totalOutstanding)}
            </Text>
          </View>
        </View>
      )}

      <FilterChipRow options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />

      {!isLoading && !isError && dealers.length > 0 && (
        <ListActionButton
          label="Add Dealer"
          onPress={() => setAddModalVisible(true)}
          backgroundColor={colors.tint}
        />
      )}

      {isLoading && !response ? (
        <ListLoadingState message="Loading dealers..." />
      ) : isError ? (
        <ListErrorState title="Failed to load dealers" message={loadErrorMessage} onRetry={refetch} />
      ) : dealers.length === 0 ? (
        <ListEmptyState
          fill
          imageKey="CUSTOMERS"
          title="No dealers yet"
          subtitle="Add wholesale dealer accounts to track balances and sales"
          titleColor={textColor}
          subtitleColor={mutedColor}
        >
          <EmptyStateActionButton
            label="Add Dealer"
            onPress={() => setAddModalVisible(true)}
            backgroundColor={colors.tint}
          />
        </ListEmptyState>
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={dealers}
          keyExtractor={(item) => item.id}
          renderItem={renderDealerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        />
      )}

      <FormSheetModal
        visible={addModalVisible}
        title={FORM_LABELS.dealer.addTitle}
        onClose={() => setAddModalVisible(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleAddDealer}
            disabled={createMutation.isPending}
            style={[styles.submitBtn, { backgroundColor: colors.tint }]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{FORM_LABELS.dealer.add}</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.businessName}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Business name"
          placeholderTextColor={mutedColor}
          value={formData.businessName}
          onChangeText={(t) => setFormData((p) => ({ ...p, businessName: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.contactName}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Contact person"
          placeholderTextColor={mutedColor}
          value={formData.contactName}
          onChangeText={(t) => setFormData((p) => ({ ...p, contactName: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.phone}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Phone number"
          placeholderTextColor={mutedColor}
          value={formData.phone}
          onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.email}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="email@example.com"
          placeholderTextColor={mutedColor}
          value={formData.email}
          onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.creditLimit}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="0"
          placeholderTextColor={mutedColor}
          value={formData.creditLimit}
          onChangeText={(t) => setFormData((p) => ({ ...p, creditLimit: t }))}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.openingBalance}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="0"
          placeholderTextColor={mutedColor}
          value={formData.openingBalance}
          onChangeText={(t) => setFormData((p) => ({ ...p, openingBalance: t }))}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.creditTerms}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="e.g. Net 30"
          placeholderTextColor={mutedColor}
          value={formData.creditTerms}
          onChangeText={(t) => setFormData((p) => ({ ...p, creditTerms: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.notes}</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          placeholder="Notes (optional)"
          placeholderTextColor={mutedColor}
          value={formData.notes}
          onChangeText={(t) => setFormData((p) => ({ ...p, notes: t }))}
          multiline
        />
      </FormSheetModal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  branchHint: { fontSize: 13, paddingHorizontal: 16, paddingTop: 12 },
  scopeNotice: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scopeTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  scopeCopy: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  dealerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  dealerRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  dealerInfo: { flex: 1 },
  dealerName: { fontSize: 16, fontWeight: '600' },
  dealerMeta: { fontSize: 14, marginTop: 2 },
  dealerBalance: { fontSize: 13, marginTop: 4, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    ...standaloneFullWidth,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
