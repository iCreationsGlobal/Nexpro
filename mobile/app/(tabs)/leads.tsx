import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ImportContactsSheet } from '@/components/ImportContactsSheet';
import { FORM_LABELS } from '@/constants/formLabels';
import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { leadService } from '@/services/leadService';
import { customDropdownService } from '@/services/customDropdownService';
import { settingsService } from '@/services/settings';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { refreshAfterLeadChange } from '@/utils/queryInvalidation';
import { formatStatusLabel } from '@/utils/formatLabels';
import { standaloneFullWidth } from '@/styles/standaloneButton';

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const;
const OTHER_SOURCE_VALUE = '__OTHER__';

const FALLBACK_LEAD_SOURCES = [
  { value: 'Online - Website', label: 'Online - Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Social Media', label: 'Social Media' },
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Event/Exhibition', label: 'Event/Exhibition' },
  { value: 'Cold Call', label: 'Cold Call' },
];

type LeadRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  priority?: string;
};

export default function LeadsScreen() {
  const router = useRouter();
  const { activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'leads', placeholder: SEARCH_PLACEHOLDERS.LEADS });
  const [status, setStatus] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', source: '' });
  const [customSourceValue, setCustomSourceValue] = useState('');

  const debouncedSearch = useDebounce(searchValue, 400);

  const { data, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: ['leads', activeTenantId, activeShopId, activeStudioLocationId, debouncedSearch, status],
    queryFn: async () =>
      leadService.getAll({
        page: 1,
        limit: 50,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
      }),
    enabled: !!activeTenantId && hasFeature('leadPipeline') && scopeReady,
  });

  const { data: leadSourceOptionsApi = [] } = useQuery({
    queryKey: ['settings', 'lead-sources', activeTenantId],
    queryFn: () => settingsService.getLeadSources(),
    enabled: !!activeTenantId && hasFeature('leadPipeline'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: customLeadSources = [] } = useQuery({
    queryKey: ['custom-dropdowns', 'lead_source', activeTenantId],
    queryFn: () => customDropdownService.getCustomOptions('lead_source'),
    enabled: !!activeTenantId && hasFeature('leadPipeline'),
    staleTime: 5 * 60 * 1000,
  });

  const leads = useMemo(() => parseApiListResponse<LeadRow>(data), [data]);
  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load leads. Pull to refresh.'),
    [error]
  );
  const hasActiveFilter = status !== 'all' || !!debouncedSearch.trim();

  const filterOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        value: s,
        label: s === 'all' ? 'All' : formatStatusLabel(s),
      })),
    []
  );

  const leadSourceOptions = useMemo(() => {
    const apiOptions = Array.isArray(leadSourceOptionsApi) ? leadSourceOptionsApi : [];
    const mappedApi = apiOptions.map((source: { value: string; label?: string }) => ({
      value: source.value,
      label: source.label || source.value,
    }));
    const base = mappedApi.length > 0 ? mappedApi : FALLBACK_LEAD_SOURCES;
    const custom = Array.isArray(customLeadSources)
      ? customLeadSources.map((source) => ({ value: source.value, label: source.label || source.value }))
      : [];
    const merged = new Map<string, { value: string; label: string }>();
    [...base, ...custom].forEach((source) => {
      if (source.value) merged.set(source.value, source);
    });
    return Array.from(merged.values());
  }, [customLeadSources, leadSourceOptionsApi]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => leadService.create(payload),
    onSuccess: async () => {
      await refreshAfterLeadChange(queryClient);
      setAddOpen(false);
      setForm({ name: '', email: '', phone: '', company: '', source: '' });
      setCustomSourceValue('');
    },
    onError: (err: unknown) => {
      Alert.alert('Could not create lead', getApiErrorMessage(err, 'Try again'));
    },
  });

  const resolveLeadSourceValue = useCallback(async () => {
    if (form.source !== OTHER_SOURCE_VALUE) return form.source;
    const value = customSourceValue.trim();
    if (!value) {
      Alert.alert('Error', 'Please enter a lead source');
      return null;
    }
    const saved = await customDropdownService.saveCustomOption('lead_source', value, value);
    queryClient.invalidateQueries({ queryKey: ['custom-dropdowns', 'lead_source'] });
    return saved?.value || value;
  }, [customSourceValue, form.source, queryClient]);

  const handleCreateLead = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Lead name required');
      return;
    }

    try {
      const sourceValue = await resolveLeadSourceValue();
      if (sourceValue === null) return;
      createMutation.mutate({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        source: sourceValue || undefined,
        status: 'new',
        priority: 'medium',
      });
    } catch (err) {
      Alert.alert('Could not save lead source', getApiErrorMessage(err, 'Try again'));
    }
  }, [createMutation, form, resolveLeadSourceValue]);

  const onRefresh = useCallback(() => refetch(), [refetch]);


  const renderLead = ({ item }: { item: LeadRow }) => (
    <Pressable
      onPress={() => router.push(`/lead/${item.id}` as never)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, borderColor },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {item.name || 'Untitled'}
        </Text>
        <View style={[styles.badge, { borderColor: colors.tint }]}>
          <Text style={[styles.badgeText, { color: colors.tint }]}>
            {formatStatusLabel(item.status || 'new')}
          </Text>
        </View>
      </View>
      {item.company || item.email || item.phone ? (
        <Text style={[styles.sub, { color: mutedColor }]} numberOfLines={2}>
          {[item.company, item.email, item.phone].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );

  if (!hasFeature('leadPipeline')) {
    return <FeatureAccessDenied message="Leads are not enabled for this workspace." />;
  }

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && leads.length > 0 && (
        <View style={styles.actionStack}>
          <Pressable
            onPress={() => setImportOpen(true)}
            style={[styles.importBtn, { borderColor }]}
          >
            <Text style={[styles.importBtnText, { color: colors.tint }]}>Import contacts</Text>
          </Pressable>
          <ListActionButton
            label="Add Lead"
            onPress={() => setAddOpen(true)}
            backgroundColor={colors.tint}
          />
        </View>
      )}

      {showListFilters(isLoading, isError, leads.length, hasActiveFilter) && (
        <FilterChipRow options={filterOptions} value={status} onChange={setStatus} />
      )}

      {isLoading && !data ? (
        <ListLoadingState message="Loading leads..." />
      ) : isError ? (
        <ListErrorState title="Failed to load leads" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={leads}
          keyExtractor={(item) => item.id}
          renderItem={renderLead}
          contentContainerStyle={listContentStyleWhenEmpty(styles.listContent, leads.length === 0)}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <ListEmptyState
              imageKey="LEADS"
              title={status === 'all' ? 'No leads yet' : 'No leads in this filter'}
              subtitle={status === 'all' ? 'Add your first lead to start building your pipeline' : 'Try another filter'}
              titleColor={textColor}
              subtitleColor={mutedColor}
            >
              {status === 'all' ? (
                <>
                  <EmptyStateActionButton
                    label="Import contacts"
                    onPress={() => setImportOpen(true)}
                    backgroundColor={colors.tint}
                  />
                  <EmptyStateActionButton
                    label="Add Lead"
                    onPress={() => setAddOpen(true)}
                    backgroundColor={colors.tint}
                  />
                </>
              ) : null}
            </ListEmptyState>
          }
        />
      )}

      <FormSheetModal
        visible={addOpen}
        title={FORM_LABELS.lead.addTitle}
        onClose={() => setAddOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleCreateLead}
            disabled={createMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{FORM_LABELS.lead.save}</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.leadName}</Text>
        <TextInput
          placeholder="Contact or company name"
          placeholderTextColor={mutedColor}
          value={form.name}
          onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.company}</Text>
        <TextInput
          placeholder="Company"
          placeholderTextColor={mutedColor}
          value={form.company}
          onChangeText={(t) => setForm((f) => ({ ...f, company: t }))}
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.email}</Text>
        <TextInput
          placeholder="Email address"
          placeholderTextColor={mutedColor}
          value={form.email}
          onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.phone}</Text>
        <TextInput
          placeholder="Enter phone number"
          placeholderTextColor={mutedColor}
          value={form.phone}
          onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
          keyboardType="phone-pad"
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.source}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScroll}>
          {[...leadSourceOptions, { value: OTHER_SOURCE_VALUE, label: 'Other (specify)' }].map((source) => {
            const selected = form.source === source.value;
            return (
              <Pressable
                key={source.value}
                onPress={() => setForm((f) => ({ ...f, source: source.value }))}
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
        {form.source === OTHER_SOURCE_VALUE ? (
          <>
            <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.lead.otherSource}</Text>
            <TextInput
              placeholder="e.g., Trade Show, Partner Referral"
              placeholderTextColor={mutedColor}
              value={customSourceValue}
              onChangeText={setCustomSourceValue}
              style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
            />
          </>
        ) : null}
      </FormSheetModal>

      <ImportContactsSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        defaultDestination="leads"
        onImported={() => {
          refreshAfterLeadChange(queryClient);
          refetch();
        }}
        colors={colors}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionStack: { gap: 8, marginBottom: 4 },
  importBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importBtnText: { fontSize: 15, fontWeight: '600' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 17, fontWeight: '600', marginTop: 12 },
  errorMsg: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  errorRetry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  chipsScroll: { maxHeight: 52, flexGrow: 0 },
  chipsRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listContent: { padding: 12, paddingBottom: 32 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  pressed: { opacity: 0.85 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, fontWeight: '600', flex: 1 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  sub: { marginTop: 6, fontSize: 14 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  sourceScroll: { marginTop: 4, marginBottom: 4 },
  sourceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  sourceChipText: { fontSize: 14, fontWeight: '500' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  secondaryBtn: {
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  primaryBtn: {
    ...standaloneFullWidth,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
