import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  DetailHeroCard,
  DetailInfoRow,
  DetailFooter,
  DetailActionButton,
  DetailMoreActions,
  type DetailMoreAction,
  DetailLoading,
  DetailNotFound,
  DetailSectionCard,
  EntityDetailHeader,
  useEntityDetailTheme,
} from '@/components/EntityDetailLayout';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ScreenShell } from '@/components/ScreenShell';
import { useExclusiveAction } from '@/hooks/useExclusiveAction';
import { expenseService } from '@/services/expenseService';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { refreshAfterExpense } from '@/utils/queryInvalidation';

type ExpenseDetail = {
  id: string;
  description?: string;
  amount: number;
  category?: string;
  expenseDate?: string;
  date?: string;
  paymentMethod?: string;
  notes?: string;
  categoryObj?: { name?: string };
};

type ExpenseAction = 'edit' | 'archive';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { cardBg, borderColor, textColor, mutedColor, colors } = useEntityDetailTheme();
  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    expenseDate: '',
    paymentMethod: '',
    notes: '',
  });
  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<ExpenseAction>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['expense', id],
    queryFn: () => expenseService.getExpenseById(String(id)),
    enabled: !!id,
  });

  const expense = useMemo(() => parseApiEntity<ExpenseDetail>(data), [data]);

  const updateMutation = useMutation({
    mutationFn: (payload: object) => expenseService.updateExpense(String(id), payload),
    onSuccess: () => {
      setEditOpen(false);
      Alert.alert('Success', 'Expense updated');
      void refetch();
      void refreshAfterExpense(queryClient);
    },
    onError: (err: unknown) => {
      Alert.alert('Update failed', getApiErrorMessage(err, 'Could not update expense'));
    },
  });

  const openEdit = useCallback(() => {
    if (!expense) return;
    const categoryLabel =
      typeof expense.category === 'string' ? expense.category : expense.categoryObj?.name;
    setFormData({
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      category: categoryLabel || '',
      expenseDate: String(expense.expenseDate ?? expense.date ?? '').slice(0, 10),
      paymentMethod: expense.paymentMethod || 'cash',
      notes: expense.notes || '',
    });
    setEditOpen(true);
  }, [expense]);

  const handleSave = useCallback(() => {
    const amount = Number(formData.amount);
    if (!amount || amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid expense amount.');
      return;
    }
    const description = formData.description.trim();
    runExclusiveAction('edit', () =>
      updateMutation.mutateAsync({
        description,
        amount,
        category: formData.category.trim() || undefined,
        expenseDate: formData.expenseDate.trim() || undefined,
        paymentMethod: formData.paymentMethod.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      })
    );
  }, [formData, runExclusiveAction, updateMutation]);

  const handleArchive = useCallback(() => {
    if (!expense) return;
    Alert.alert('Archive expense', 'Archive this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () =>
          runExclusiveAction('archive', async () => {
            try {
              await expenseService.archive(expense.id);
              Alert.alert('Archived', 'Expense archived');
              void refreshAfterExpense(queryClient);
              router.back();
            } catch (err: unknown) {
              Alert.alert('Archive failed', getApiErrorMessage(err, 'Could not archive expense'));
            }
          }),
      },
    ]);
  }, [expense, queryClient, router, runExclusiveAction]);

  if (isLoading) return <DetailLoading title="Expense" />;
  if (!expense) return <DetailNotFound title="Expense" entityLabel="Expense" />;

  const categoryLabel =
    typeof expense.category === 'string' ? expense.category : expense.categoryObj?.name;
  const expenseMoreActions: DetailMoreAction[] = [
    {
      key: 'archive',
      label: 'Archive',
      icon: 'archive',
      variant: 'danger',
      onPress: handleArchive,
      loading: isActionActive('archive'),
      disabled: isAnyActionActive,
    },
  ];

  return (
    <>
      <EntityDetailHeader title={expense.description || 'Expense'} />
      <ScreenShell style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow={categoryLabel || 'Expense'}
            title="Expense"
            message={expense.description || expense.notes || 'Expense details are ready for review.'}
            metricLabel="Amount"
            metricValue={formatCurrency(expense.amount)}
            secondaryIcon="credit-card"
            secondaryLabel="Payment"
            secondaryValue={expense.paymentMethod ? expense.paymentMethod.replace(/_/g, ' ') : 'Not specified'}
            showCheck={false}
          />

          <DetailSectionCard title="Expense Details" icon="receipt">
            {expense.description ? (
              <DetailInfoRow icon="file-text" label="Description" value={expense.description} />
            ) : null}
            <DetailInfoRow icon="money" label="Amount" value={formatCurrency(expense.amount)} valueColor="#ef4444" />
            {categoryLabel ? <DetailInfoRow icon="tag" label="Category" value={categoryLabel} /> : null}
            <DetailInfoRow
              icon="calendar"
              label="Expense Date"
              value={formatDate(expense.expenseDate ?? expense.date)}
            />
            {expense.paymentMethod ? (
              <DetailInfoRow icon="credit-card" label="Payment Method" value={expense.paymentMethod.replace(/_/g, ' ')} />
            ) : null}
            {expense.notes ? <DetailInfoRow icon="sticky-note-o" label="Notes" value={expense.notes} /> : null}
          </DetailSectionCard>
        </ScrollView>
        <DetailFooter>
          <DetailActionButton
            label="Edit"
            icon="edit"
            variant="primary"
            onPress={openEdit}
            disabled={isAnyActionActive}
          />
          <DetailMoreActions actions={expenseMoreActions} disabled={isAnyActionActive} />
        </DetailFooter>
      </ScreenShell>

      <FormSheetModal
        visible={editOpen}
        title="Edit expense"
        onClose={() => setEditOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleSave}
            disabled={isAnyActionActive}
            style={[styles.saveBtn, { backgroundColor: colors.tint }]}
          >
            {isActionActive('edit') ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save expense</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.label, { color: textColor }]}>Description (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.description}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.label, { color: textColor }]}>Amount</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.amount}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, amount: text }))}
          keyboardType="decimal-pad"
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.label, { color: textColor }]}>Category (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.category}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, category: text }))}
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.label, { color: textColor }]}>Expense date (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.expenseDate}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, expenseDate: text }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.label, { color: textColor }]}>Payment method (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.paymentMethod}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, paymentMethod: text }))}
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.label, { color: textColor }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          value={formData.notes}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, notes: text }))}
          multiline
          placeholderTextColor={mutedColor}
        />
      </FormSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  saveBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
