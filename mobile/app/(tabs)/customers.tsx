import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { ListEmptyState } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { flatListStyleForEmpty } from '@/utils/listEmptyLayout';
import { customerService, type CustomerPayload } from '@/services/customerService';
import { customDropdownService } from '@/services/customDropdownService';
import { settingsService } from '@/services/settings';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ImportContactsSheet } from '@/components/ImportContactsSheet';
import { PickContactSheet } from '@/components/PickContactSheet';
import { FORM_LABELS } from '@/constants/formLabels';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { refreshAfterCustomerChange, QUERY_STALE } from '@/utils/queryInvalidation';
import { standaloneButtonStyles, standaloneFullWidth } from '@/styles/standaloneButton';
import type { CustomerFormFromContact } from '@/utils/deviceContacts';

type Customer = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  howDidYouHear?: string;
  referralName?: string;
};

type CustomerStats = {
  totalCustomers?: number;
  activeCustomers?: number;
  returningCustomers?: number;
  inactiveCustomers?: number;
};

const DEFAULT_CUSTOMER_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  howDidYouHear: '',
  referralName: '',
};

const FALLBACK_CUSTOMER_SOURCES = [
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Website', label: 'Website' },
  { value: 'Social Media', label: 'Social Media' },
];

const OTHER_SOURCE_VALUE = '__OTHER__';

export default function CustomersScreen() {
  const params = useLocalSearchParams<{ search?: string; add?: string }>();
  const router = useRouter();
  const { activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();
  const inStoreSetup = useIsStoreSetupRoute();

  const { searchValue, setSearchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'customers', placeholder: SEARCH_PLACEHOLDERS.CUSTOMERS });
  const [addModalVisible, setAddModalVisible] = useState(params.add === '1');
  const [importOpen, setImportOpen] = useState(false);
  const [pickContactOpen, setPickContactOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_CUSTOMER_FORM);
  const [customSourceValue, setCustomSourceValue] = useState('');

  useEffect(() => {
    if (params.search) setSearchValue(String(params.search));
    if (params.add === '1') setAddModalVisible(true);
  }, [params.search, params.add, setSearchValue]);

  const debouncedSearch = useDebounce(searchValue, 400);
  const customersEnabled = !!activeTenantId && hasFeature('crm') && scopeReady && !inStoreSetup;

  const { data: response, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: ['customers', activeTenantId, activeShopId, activeStudioLocationId, debouncedSearch],
    queryFn: () =>
      customerService.getCustomers({
        page: 1,
        limit: 20,
        search: debouncedSearch || undefined,
      }),
    enabled: customersEnabled,
    staleTime: QUERY_STALE.LIST,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const { data: statsResponse } = useQuery({
    queryKey: ['customers', 'stats', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => customerService.getStats(),
    enabled: customersEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const { data: customerSourceOptions = [] } = useQuery({
    queryKey: ['settings', 'customer-sources', activeTenantId],
    queryFn: () => settingsService.getCustomerSources(),
    enabled: customersEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: customSourceOptions = [] } = useQuery({
    queryKey: ['custom-dropdowns', 'customer_source', activeTenantId],
    queryFn: () => customDropdownService.getCustomOptions('customer_source'),
    enabled: customersEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const sourceOptions = useMemo(() => {
    const apiOptions = Array.isArray(customerSourceOptions) ? customerSourceOptions : [];
    const mappedApi = apiOptions.map((source: { value: string; label?: string }) => ({
      value: source.value,
      label: source.label || source.value,
    }));
    const base = mappedApi.length > 0 ? mappedApi : FALLBACK_CUSTOMER_SOURCES;
    const custom = Array.isArray(customSourceOptions)
      ? customSourceOptions.map((source) => ({ value: source.value, label: source.label || source.value }))
      : [];
    const merged = new Map<string, { value: string; label: string }>();
    [...base, ...custom].forEach((source) => {
      if (source.value) merged.set(source.value, source);
    });
    return Array.from(merged.values());
  }, [customerSourceOptions, customSourceOptions]);

  const createMutation = useMutation({
    mutationFn: (d: CustomerPayload) => customerService.createCustomer(d),
    onSuccess: async () => {
      await refreshAfterCustomerChange(queryClient);
      setAddModalVisible(false);
      setFormData(DEFAULT_CUSTOMER_FORM);
      setCustomSourceValue('');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to add customer'));
    },
  });

  const customers = useMemo(() => parseApiListResponse<Customer>(response), [response]);
  const customerStats = useMemo(() => {
    const stats = (statsResponse ?? {}) as CustomerStats;
    return {
      totalCustomers: Number(stats.totalCustomers ?? 0),
      activeCustomers: Number(stats.activeCustomers ?? 0),
      returningCustomers: Number(stats.returningCustomers ?? 0),
      inactiveCustomers: Number(stats.inactiveCustomers ?? 0),
    };
  }, [statsResponse]);
  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load customers. Pull to refresh.'),
    [error]
  );
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleCustomerPress = useCallback(
    (customer: Customer) => {
      router.push(`/customer/${customer.id}` as never);
    },
    [router]
  );

  const resolveSourceValue = useCallback(async () => {
    if (formData.howDidYouHear !== OTHER_SOURCE_VALUE) return formData.howDidYouHear;
    const value = customSourceValue.trim();
    if (!value) {
      Alert.alert('Error', 'Please enter how the customer heard about you');
      return null;
    }
    const saved = await customDropdownService.saveCustomOption('customer_source', value, value);
    queryClient.invalidateQueries({ queryKey: ['custom-dropdowns', 'customer_source'] });
    return saved?.value || value;
  }, [customSourceValue, formData.howDidYouHear, queryClient]);

  const handleAddCustomer = useCallback(async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    try {
      const sourceValue = await resolveSourceValue();
      if (sourceValue === null) return;
      createMutation.mutate({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        company: formData.company.trim() || undefined,
        address: formData.address.trim() || undefined,
        howDidYouHear: sourceValue || undefined,
        referralName: sourceValue === 'Referral' ? formData.referralName.trim() || undefined : undefined,
      });
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to save customer source'));
    }
  }, [formData, createMutation, resolveSourceValue]);

  const handleContactSelected = useCallback((contact: CustomerFormFromContact) => {
    setFormData((prev) => ({
      ...prev,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      company: contact.company,
    }));
  }, []);

  if (!hasFeature('crm')) {
    return <FeatureAccessDenied message="Customers is not enabled for this workspace." />;
  }

  const renderCustomerItem = ({ item }: { item: Customer }) => (
    <Pressable
      onPress={() => handleCustomerPress(item)}
      style={({ pressed }) => [
        styles.customerCard,
        { backgroundColor: cardBg, borderColor },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.customerRow}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.tint }]}>
          <Text style={styles.avatarText}>
            {(item.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={[styles.customerName, { color: textColor }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.customerEmail, { color: mutedColor }]} numberOfLines={1}>
            {item.email || item.phone || '—'}
          </Text>
        </View>
        <AppIcon name="chevron-right" size={14} color={mutedColor} />
      </View>
    </Pressable>
  );

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && (customers.length > 0 || customerStats.totalCustomers > 0) && (
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Total Customers</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{customerStats.totalCustomers}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#dcfce7' }]}>
                <AppIcon name="users" size={18} color={colors.tint} />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Active</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{customerStats.activeCustomers}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#dbeafe' }]}>
                <AppIcon name="check-circle" size={18} color={colors.tint} />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Returning Customers</Text>
                <Text style={[styles.statValue, { color: textColor }]}>
                  {customerStats.returningCustomers}
                </Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#ecfccb' }]}>
                <AppIcon name="trending-up" size={18} color="#84cc16" />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Inactive</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{customerStats.inactiveCustomers}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#fee2e2' }]}>
                <AppIcon name="times-circle" size={18} color="#ef4444" />
              </View>
            </View>
          </View>
        </View>
      )}

      {!isLoading && !isError && customers.length > 0 && (
        <CustomerCreateActions
          borderColor={borderColor}
          textColor={textColor}
          tintColor={colors.tint}
          onImport={() => setImportOpen(true)}
          onAdd={() => setAddModalVisible(true)}
        />
      )}

      {isLoading && !response ? (
        <ListLoadingState message="Loading customers..." />
      ) : isError ? (
        <ListErrorState title="Failed to load customers" message={loadErrorMessage} onRetry={refetch} />
      ) : customers.length === 0 ? (
        <ListEmptyState
          fill
          imageKey="CUSTOMERS"
          title="No customers yet"
          subtitle="Add your first customer to start tracking sales"
          titleColor={textColor}
          subtitleColor={mutedColor}
        >
          <CustomerCreateActions
            borderColor={borderColor}
            textColor={textColor}
            tintColor={colors.tint}
            onImport={() => setImportOpen(true)}
            onAdd={() => setAddModalVisible(true)}
            inEmptyState
          />
        </ListEmptyState>
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        />
      )}

      <FormSheetModal
        visible={addModalVisible && !pickContactOpen}
        title={FORM_LABELS.customer.addTitle}
        onClose={() => {
          setAddModalVisible(false);
          setCustomSourceValue('');
        }}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.formFooter}>
            <Pressable
              onPress={() => setPickContactOpen(true)}
              style={[standaloneButtonStyles.outline, { borderColor }]}
            >
              <Text style={[styles.chooseContactText, { color: textColor }]}>Choose from contacts</Text>
            </Pressable>
            <Pressable
              onPress={handleAddCustomer}
              disabled={createMutation.isPending}
              style={[styles.submitBtn, { backgroundColor: colors.tint }]}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>{FORM_LABELS.customer.add}</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.customer.name}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Customer name"
          placeholderTextColor={mutedColor}
          value={formData.name}
          onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.customer.company}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Company name"
          placeholderTextColor={mutedColor}
          value={formData.company}
          onChangeText={(t) => setFormData((p) => ({ ...p, company: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.customer.email}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="email@example.com"
          placeholderTextColor={mutedColor}
          value={formData.email}
          onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.customer.phone}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          placeholder="Phone number"
          placeholderTextColor={mutedColor}
          value={formData.phone}
          onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>Address (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          placeholder="Enter street address"
          placeholderTextColor={mutedColor}
          value={formData.address}
          onChangeText={(t) => setFormData((p) => ({ ...p, address: t }))}
          multiline
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>How did you hear about us? (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScroll}>
          {[...sourceOptions, { value: OTHER_SOURCE_VALUE, label: 'Other (specify)' }].map((source) => {
            const selected = formData.howDidYouHear === source.value;
            return (
              <Pressable
                key={source.value}
                onPress={() =>
                  setFormData((p) => ({
                    ...p,
                    howDidYouHear: source.value,
                    referralName: source.value === 'Referral' ? p.referralName : '',
                  }))
                }
                style={[
                  styles.sourceChip,
                  { borderColor, backgroundColor: selected ? colors.tint : 'transparent' },
                ]}
              >
                <Text style={[styles.sourceChipText, { color: selected ? '#fff' : textColor }]}>
                  {source.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {formData.howDidYouHear === OTHER_SOURCE_VALUE ? (
          <>
            <Text style={[styles.inputLabel, { color: textColor }]}>Other source (optional)</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              placeholder="e.g., Billboard, Magazine Ad"
              placeholderTextColor={mutedColor}
              value={customSourceValue}
              onChangeText={setCustomSourceValue}
            />
          </>
        ) : null}
        {formData.howDidYouHear === 'Referral' ? (
          <>
            <Text style={[styles.inputLabel, { color: textColor }]}>Referral Name (optional)</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              placeholder="Enter referral name"
              placeholderTextColor={mutedColor}
              value={formData.referralName}
              onChangeText={(t) => setFormData((p) => ({ ...p, referralName: t }))}
            />
          </>
        ) : null}
      </FormSheetModal>

      <ImportContactsSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        defaultDestination="customers"
        onImported={() => {
          refreshAfterCustomerChange(queryClient);
          refetch();
        }}
        colors={colors}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      />

      <PickContactSheet
        visible={pickContactOpen}
        onClose={() => setPickContactOpen(false)}
        onSelect={handleContactSelected}
        colors={colors}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      />
    </ScreenShell>
  );
}

type CustomerCreateActionsProps = {
  borderColor: string;
  textColor: string;
  tintColor: string;
  onImport: () => void;
  onAdd: () => void;
  inEmptyState?: boolean;
};

function CustomerCreateActions({
  borderColor,
  textColor,
  tintColor,
  onImport,
  onAdd,
  inEmptyState = false,
}: CustomerCreateActionsProps) {
  return (
    <View style={[styles.actionRow, inEmptyState && styles.actionRowEmpty]}>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.secondaryAction,
          inEmptyState && styles.secondaryActionFull,
          { backgroundColor: tintColor, borderColor: tintColor },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.secondaryActionText, { color: '#fff' }]} numberOfLines={1}>
          Add Customer
        </Text>
      </Pressable>
      <Pressable
        onPress={onImport}
        style={({ pressed }) => [
          styles.secondaryAction,
          inEmptyState && styles.secondaryActionFull,
          { borderColor },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.secondaryActionText, { color: textColor }]} numberOfLines={1}>
          Import contacts
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  actionRowEmpty: {
    width: '100%',
    flexDirection: 'column',
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionFull: {
    flex: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  customerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600' },
  customerEmail: { fontSize: 14, marginTop: 2 },
  pressed: { opacity: 0.8 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
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
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  sourceScroll: { marginTop: 4, marginBottom: 4 },
  sourceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  sourceChipText: { fontSize: 14, fontWeight: '500' },
  formFooter: {
    gap: 10,
    marginTop: 24,
  },
  chooseContactText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    ...standaloneFullWidth,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  editBtnText: { fontSize: 15, fontWeight: '600' },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  secondaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
