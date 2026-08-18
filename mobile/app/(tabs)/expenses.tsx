import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
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
import * as DocumentPicker from 'expo-document-picker';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { matchesSearchQuery } from '@/utils/matchesSearchQuery';
import { flatListStyleForEmpty } from '@/utils/listEmptyLayout';
import { expenseService } from '@/services/expenseService';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { CURRENCY } from '@/constants';
import { formatCurrency, parseDecimalInput } from '@/utils/formatCurrency';
import { FormSheetModal } from '@/components/FormSheetModal';
import { FORM_LABELS } from '@/constants/formLabels';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { refreshAfterExpense, QUERY_STALE } from '@/utils/queryInvalidation';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Expense = {
  id: string;
  description?: string;
  amount: number;
  category?: string;
  categoryObj?: { id: string; name: string };
  date?: string;
  expenseDate?: string;
  paymentMethod?: string;
  approvalStatus?: string;
  notes?: string;
};

type ExpenseStatsResponse = {
  data?: ExpenseStatsResponse;
  totalExpenses?: number;
  thisMonthExpenses?: number;
  categoryCount?: number;
  pendingRequests?: number;
  approvedCount?: number;
  totals?: {
    totalExpenses?: number;
    thisMonth?: number;
    pendingRequests?: number;
    approvedCount?: number;
    categoryCount?: number;
  };
};

export default function ExpensesScreen() {
  const router = useRouter();
  const { activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();
  const inStoreSetup = useIsStoreSetupRoute();
  const expensesEnabled = !!activeTenantId && hasFeature('expenses') && !inStoreSetup;
  const expensesScopedEnabled = expensesEnabled && scopeReady;

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    receiptUrl: '',
    notes: '',
  });
  const [receiptFileName, setReceiptFileName] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'expenses', placeholder: SEARCH_PLACEHOLDERS.EXPENSES });
  const debouncedSearch = useDebounce(searchValue, 400);

  const { data: categoriesResponse } = useQuery({
    queryKey: ['expenses', 'categories', activeTenantId],
    queryFn: () => expenseService.getCategories(),
    enabled: expensesEnabled,
    staleTime: QUERY_STALE.SLOW,
  });

  const { data: statsResponse } = useQuery({
    queryKey: ['expenses', 'stats', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => expenseService.getStats(),
    enabled: expensesScopedEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
  });

  const { data: response, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: ['expenses', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () =>
      expenseService.getExpenses({
        page: 1,
        limit: 20,
      }),
    enabled: expensesScopedEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    gcTime: 60 * 60 * 1000,
  });

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load expenses. Pull to refresh.'),
    [error]
  );

  const rawExpenses = useMemo(() => parseApiListResponse<Expense>(response), [response]);

  const expenses = useMemo(() => {
    if (!debouncedSearch.trim()) return rawExpenses;
    return rawExpenses.filter((expense) =>
      matchesSearchQuery(debouncedSearch, [
        expense.description,
        expense.category,
        (expense as Expense).categoryObj?.name,
        expense.paymentMethod,
        expense.notes,
        expense.amount,
      ])
    );
  }, [rawExpenses, debouncedSearch]);

  const expenseStats = useMemo(() => {
    const stats = ((statsResponse as ExpenseStatsResponse)?.data ?? statsResponse ?? {}) as ExpenseStatsResponse;
    const totals = stats.totals ?? {};
    const fallbackTotal = rawExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const fallbackCategories = new Set(
      rawExpenses
        .map((expense) =>
          typeof expense.category === 'string' ? expense.category : expense.categoryObj?.name
        )
        .filter(Boolean)
    ).size;
    const fallbackPending = rawExpenses.filter((expense) => expense.approvalStatus === 'pending_approval').length;

    return {
      totalExpenses: Number(totals.totalExpenses ?? stats.totalExpenses ?? fallbackTotal),
      categoryCount: Number(totals.categoryCount ?? stats.categoryCount ?? fallbackCategories),
      pendingRequests: Number(totals.pendingRequests ?? stats.pendingRequests ?? fallbackPending),
      approvedCount: Number(totals.approvedCount ?? stats.approvedCount ?? 0),
    };
  }, [rawExpenses, statsResponse]);

  const categoryOptions = useMemo(() => {
    const fromApi = Array.isArray(categoriesResponse?.data) ? categoriesResponse.data : [];
    const fromExpenses = expenses
      .map((expense) =>
        typeof expense.category === 'string' ? expense.category : (expense as Expense).categoryObj?.name
      )
      .filter(Boolean) as string[];
    return Array.from(new Set([...fromApi, ...fromExpenses])).sort();
  }, [categoriesResponse?.data, expenses]);

  const defaultCategory = categoryOptions[0] || 'Other';

  // Match web: category choices are backend/custom categories plus existing expense categories.
  useEffect(() => {
    if (addModalVisible && !formData.category && defaultCategory) {
      setFormData((prev) => ({ ...prev, category: defaultCategory }));
    }
  }, [addModalVisible, defaultCategory, formData.category]);

  const createExpenseMutation = useMutation({
    mutationFn: (data: {
      description?: string;
      amount: number;
      category?: string;
      expenseDate: string;
      paymentMethod?: string;
      receiptUrl?: string;
      notes?: string;
    }) => expenseService.createExpense(data),
    onSuccess: (response, variables) => {
      const created = (response as { data?: Expense })?.data ?? (response as Expense | undefined);
      if (created && typeof created === 'object' && created.id) {
        queryClient.setQueriesData(
          {
            predicate: (query) => {
              const key = query.queryKey;
              return (
                Array.isArray(key) &&
                key[0] === 'expenses' &&
                key[1] !== 'categories' &&
                key[1] !== 'stats'
              );
            },
          },
          (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            const prev = old as { data?: Expense[]; count?: number };
            if (Array.isArray(prev.data)) {
              if (prev.data.some((row) => row?.id === created.id)) return old;
              return {
                ...prev,
                data: [created, ...prev.data],
                count: typeof prev.count === 'number' ? prev.count + 1 : prev.count,
              };
            }
            if (Array.isArray(old)) {
              const list = old as Expense[];
              if (list.some((row) => row?.id === created.id)) return old;
              return [created, ...list];
            }
            return old;
          }
        );

        queryClient.setQueriesData(
          {
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'expenses' &&
              query.queryKey[1] === 'stats',
          },
          (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            const wrap = old as ExpenseStatsResponse;
            const stats = (wrap.data ?? wrap) as ExpenseStatsResponse;
            const amount = Number(variables.amount) || 0;
            const totals = { ...(stats.totals ?? {}) };
            totals.totalExpenses = Number(totals.totalExpenses ?? stats.totalExpenses ?? 0) + amount;
            totals.approvedCount = Number(totals.approvedCount ?? stats.approvedCount ?? 0) + 1;
            const next = {
              ...stats,
              totalExpenses: Number(stats.totalExpenses ?? 0) + amount,
              approvedCount: Number(stats.approvedCount ?? 0) + 1,
              totals,
            };
            return wrap.data ? { ...wrap, data: next } : next;
          }
        );
      }

      // Close UI as soon as POST succeeds — refresh list/stats in the background.
      setAddModalVisible(false);
      setFormData({
        description: '',
        amount: '',
        category: defaultCategory,
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        receiptUrl: '',
        notes: '',
      });
      setReceiptFileName('');
      Alert.alert('Success', 'Expense recorded successfully');
      void refreshAfterExpense(queryClient);
    },
    onError: (error: unknown) => {
      Alert.alert('Error', getApiErrorMessage(error, 'Failed to record expense'));
    },
  });
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleExpensePress = useCallback(
    (expense: Expense) => {
      router.push(`/expense/${expense.id}` as never);
    },
    [router]
  );

  const handlePickReceipt = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      const asset = result.assets[0];
      setUploadingReceipt(true);
      const receiptUrl = await expenseService.uploadReceipt(
        asset.uri,
        asset.name || 'receipt',
        asset.mimeType || 'application/octet-stream'
      );
      setFormData((prev) => ({ ...prev, receiptUrl }));
      setReceiptFileName(asset.name || 'Receipt');
    } catch (err) {
      setFormData((prev) => ({ ...prev, receiptUrl: '' }));
      setReceiptFileName('');
      Alert.alert('Upload failed', getApiErrorMessage(err, 'Failed to upload receipt'));
    } finally {
      setUploadingReceipt(false);
    }
  }, []);

  const handleRemoveReceipt = useCallback(() => {
    setFormData((prev) => ({ ...prev, receiptUrl: '' }));
    setReceiptFileName('');
  }, []);

  const handleCreateExpense = useCallback(() => {
    if (uploadingReceipt) return;
    const amount = parseDecimalInput(formData.amount);
    if (!formData.amount || Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    createExpenseMutation.mutate({
      description: formData.description.trim(),
      amount,
      category: formData.category || defaultCategory,
      expenseDate: formData.expenseDate,
      paymentMethod: formData.paymentMethod,
      receiptUrl: formData.receiptUrl || undefined,
      notes: formData.notes.trim() || undefined,
    });
  }, [formData, createExpenseMutation, defaultCategory, uploadingReceipt]);

  if (!hasFeature('expenses')) {
    return <FeatureAccessDenied message="Expenses are not enabled for this workspace." />;
  }


  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <Pressable
      onPress={() => handleExpensePress(item)}
      style={({ pressed }) => [
        styles.expenseCard,
        { backgroundColor: cardBg, borderColor },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.expenseRow}>
        <View style={styles.expenseInfo}>
          <Text style={[styles.expenseDescription, { color: textColor }]} numberOfLines={1}>
            {item.description || 'Expense'}
          </Text>
          {(item.category || (item as any).categoryObj?.name) && (
            <Text style={[styles.expenseCategory, { color: mutedColor }]}>
              {typeof item.category === 'string' ? item.category : (item as any).categoryObj?.name}
            </Text>
          )}
          <Text style={[styles.expenseDate, { color: mutedColor }]}>
            {formatDate(item.expenseDate ?? item.date ?? '')}
          </Text>
        </View>
        <Text style={[styles.expenseAmount, { color: '#ef4444' }]}>
          {formatCurrency(item.amount)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && expenses.length > 0 && (
        <ListActionButton
          label="Add Expense"
          onPress={() => setAddModalVisible(true)}
          backgroundColor={colors.tint}
        />
      )}

      {!isLoading && !isError && (rawExpenses.length > 0 || expenseStats.totalExpenses > 0) && (
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Total Expenses</Text>
                <Text style={[styles.statValue, { color: textColor }]}>
                  {formatCurrency(expenseStats.totalExpenses)}
                </Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#fee2e2' }]}>
                <AppIcon name="shopping-cart" size={18} color="#ef4444" />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Categories</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{expenseStats.categoryCount}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#dcfce7' }]}>
                <AppIcon name="file-text" size={18} color={colors.tint} />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Pending</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{expenseStats.pendingRequests}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#ffedd5' }]}>
                <AppIcon name="send" size={18} color="#f97316" />
              </View>
            </View>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statCardContent}>
              <View style={styles.statTextColumn}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>Approved</Text>
                <Text style={[styles.statValue, { color: textColor }]}>{expenseStats.approvedCount}</Text>
              </View>
              <View style={[styles.cardIconCircle, { backgroundColor: '#ecfdf5' }]}>
                <AppIcon name="check-circle" size={18} color="#16a34a" />
              </View>
            </View>
          </View>
        </View>
      )}

      {isLoading && !response ? (
        <ListLoadingState message="Loading expenses..." />
      ) : isError ? (
        <ListErrorState title="Failed to load expenses" message={loadErrorMessage} onRetry={refetch} />
      ) : expenses.length === 0 ? (
        <ListEmptyState
          fill
          imageKey="EXPENSES"
          title="No expenses yet"
          subtitle="Record your first expense to track spending"
          titleColor={textColor}
          subtitleColor={mutedColor}
        >
          <EmptyStateActionButton
            label="Add Expense"
            onPress={() => setAddModalVisible(true)}
            backgroundColor={colors.tint}
          />
        </ListEmptyState>
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={expenses}
          keyExtractor={(item) => item.id}
          renderItem={renderExpenseItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        />
      )}

      <FormSheetModal
        visible={addModalVisible}
        title={FORM_LABELS.expense.addTitle}
        onClose={() => setAddModalVisible(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleCreateExpense}
            disabled={createExpenseMutation.isPending || uploadingReceipt}
            style={[
              styles.submitButton,
              { backgroundColor: colors.tint },
              (createExpenseMutation.isPending || uploadingReceipt) && styles.submitButtonDisabled,
            ]}
          >
            {createExpenseMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{FORM_LABELS.expense.record}</Text>
            )}
          </Pressable>
        }
      >
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.category}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {(categoryOptions.length > 0 ? categoryOptions : ['Other']).map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setFormData({ ...formData, category: cat })}
                style={[
                  styles.categoryChip,
                  { borderColor, backgroundColor: (formData.category || defaultCategory) === cat ? colors.tint : inputBg },
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: (formData.category || defaultCategory) === cat ? '#fff' : textColor },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.amount}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            placeholder="0.00"
            placeholderTextColor={mutedColor}
            value={formData.amount}
            onChangeText={(text) => setFormData({ ...formData, amount: text })}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.description}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            placeholder="Enter expense description"
            placeholderTextColor={mutedColor}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.expenseDate}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={mutedColor}
            value={formData.expenseDate}
            onChangeText={(text) => setFormData({ ...formData, expenseDate: text })}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.paymentMethod}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            placeholder="Select payment method (optional)"
            placeholderTextColor={mutedColor}
            value={formData.paymentMethod}
            onChangeText={(text) => setFormData({ ...formData, paymentMethod: text })}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>Receipt (optional)</Text>
          <Pressable
            onPress={handlePickReceipt}
            disabled={uploadingReceipt}
            style={[styles.receiptPicker, { borderColor, backgroundColor: inputBg }]}
          >
            <View style={styles.receiptPickerContent}>
              <AppIcon name="receipt" size={20} color={colors.tint} />
              <View style={styles.receiptPickerTextWrap}>
                <Text style={[styles.receiptPickerTitle, { color: textColor }]}>
                  {formData.receiptUrl ? receiptFileName || 'Receipt attached' : 'Attach receipt'}
                </Text>
                <Text style={[styles.receiptPickerSubtitle, { color: mutedColor }]}>
                  Image or PDF, up to 10MB
                </Text>
              </View>
              {uploadingReceipt ? (
                <ActivityIndicator color={colors.tint} size="small" />
              ) : formData.receiptUrl ? (
                <AppIcon name="check" size={18} color={colors.tint} />
              ) : (
                <AppIcon name="paperclip" size={18} color={mutedColor} />
              )}
            </View>
          </Pressable>
          {formData.receiptUrl && !uploadingReceipt ? (
            <Pressable onPress={handleRemoveReceipt} style={styles.removeReceiptBtn}>
              <Text style={styles.removeReceiptText}>Remove receipt</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.expense.notes}</Text>
          <TextInput
            style={[
              styles.formInput,
              { color: textColor, borderColor, backgroundColor: inputBg, minHeight: 80, textAlignVertical: 'top' },
            ]}
            placeholder="Additional notes (optional)"
            placeholderTextColor={mutedColor}
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
          />
        </View>
      </FormSheetModal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
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
  expenseCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  expenseInfo: { flex: 1, marginRight: 12 },
  expenseDescription: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  expenseCategory: { fontSize: 12, marginBottom: 4 },
  expenseDate: { fontSize: 12 },
  expenseAmount: { fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  categoryScroll: { marginTop: 4, marginBottom: -4 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: { fontSize: 14, fontWeight: '500' },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  receiptPicker: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  receiptPickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  receiptPickerTextWrap: { flex: 1 },
  receiptPickerTitle: { fontSize: 15, fontWeight: '600' },
  receiptPickerSubtitle: { fontSize: 12, marginTop: 2 },
  removeReceiptBtn: { marginTop: 10, alignSelf: 'flex-start' },
  removeReceiptText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  submitButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitButtonDisabled: { opacity: 0.6 },
});
