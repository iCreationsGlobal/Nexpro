import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppBottomSheet, APP_SHEET_HEIGHT_TALL } from '@/components/AppBottomSheet';
import { SimpleBigButton, SimpleField, simpleStyles } from '@/components/simple/SimpleUI';
import { useScreenColors } from '@/hooks/useScreenColors';
import { expenseService } from '@/services/expenseService';
import { FontFamily } from '@/constants/typography';

type AnyExpense = Record<string, any>;

/** Picture tiles — the same six as the web Simple Mode expense form. */
export const SIMPLE_EXPENSE_TILES = [
  { key: 'Stock', emoji: '📦', bg: '#ecfdf5', ring: '#059669' },
  { key: 'Transport', emoji: '🚐', bg: '#f0f9ff', ring: '#0284c7' },
  { key: 'Electricity', emoji: '💡', bg: '#fffbeb', ring: '#f59e0b' },
  { key: 'Rent', emoji: '🏠', bg: '#fff1f2', ring: '#f43f5e' },
  { key: 'Food', emoji: '🍗', bg: '#fff7ed', ring: '#f97316' },
  { key: 'Other', emoji: '•••', bg: '#f5f3ff', ring: '#7c3aed' },
] as const;
const OTHER = 'Other';

const pad = (n: number) => String(n).padStart(2, '0');
const dayIso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const DATE_CHOICES = [
  { label: 'Today', value: () => dayIso(0) },
  { label: 'Yesterday', value: () => dayIso(1) },
  { label: '2 days ago', value: () => dayIso(2) },
];

const tileFor = (category?: string | null) => {
  if (!category) return null;
  const match = SIMPLE_EXPENSE_TILES.find((t) => t.key !== OTHER && t.key.toLowerCase() === String(category).toLowerCase());
  return match ? match.key : OTHER;
};

/**
 * Simple Mode expense form: pick a picture, type the amount, pick the day, save.
 * `expense` null = add; an existing expense opens for editing with a Remove link.
 */
export function SimpleExpenseSheet({ visible, expense, onClose }: {
  visible: boolean; expense: AnyExpense | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const [tile, setTile] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayIso(0));
  const [error, setError] = useState('');
  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const key = tileFor(expense?.category);
    setTile(key);
    setOther(key === OTHER ? String(expense?.category || '') : '');
    setAmount(expense?.amount != null ? String(Number(expense.amount)) : '');
    setDate(String(expense?.expenseDate || '').slice(0, 10) || dayIso(0));
    setError('');
  }, [visible, expense]);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['simple'] });
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: async (values: { category: string; amount: number; expenseDate: string }) => (
      expense?.id
        ? expenseService.updateExpense(String(expense.id), values)
        : expenseService.createExpense({ ...values, description: '' })
    ),
    onSuccess: done,
    onError: (err: unknown) => Alert.alert('Expense', err instanceof Error ? err.message : 'Could not save this expense.'),
  });

  const remove = useMutation({
    mutationFn: () => expenseService.archive(String(expense?.id)),
    onSuccess: done,
    onError: () => Alert.alert('Expense', 'Could not remove this expense.'),
  });

  const handleSave = () => {
    const category = tile === OTHER ? other.trim() : tile;
    const value = Number(amount.replace(/,/g, ''));
    if (!tile) return setError('Tap what you spent money on.');
    if (!category) return setError('Type what you spent money on.');
    if (!Number.isFinite(value) || value <= 0) return setError('Enter the amount you spent.');
    save.mutate({ category, amount: value, expenseDate: date });
    return undefined;
  };

  const confirmRemove = () => Alert.alert('Remove this expense?', 'It will no longer count in your totals.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
  ]);

  const dateChoices = [...DATE_CHOICES.map((c) => ({ label: c.label, value: c.value() }))];
  if (!dateChoices.some((c) => c.value === date)) {
    dateChoices.push({ label: new Date(`${date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }), value: date });
  }

  return (
    <AppBottomSheet visible={visible} title={expense ? 'Edit Expense' : 'Add Expense'} onClose={onClose} height={APP_SHEET_HEIGHT_TALL}>
      <View style={{ gap: 18, paddingBottom: 24 }}>
        <Text style={[styles.question, { color: textColor }]}>What did you spend money on?</Text>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {SIMPLE_EXPENSE_TILES.map((t) => {
            const active = tile === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => { setTile(t.key); setError(''); if (t.key !== OTHER) amountRef.current?.focus(); }}
                style={[styles.tile, { backgroundColor: t.bg, borderColor: active ? t.ring : 'transparent' }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={t.key}
              >
                <Text style={t.key === OTHER ? styles.otherDots : styles.emoji}>{t.emoji}</Text>
                <Text style={styles.tileLabel}>{t.key}</Text>
              </Pressable>
            );
          })}
        </View>

        {tile === OTHER ? (
          <SimpleField label="What was it?">
            <TextInput
              value={other}
              onChangeText={(text) => { setOther(text); setError(''); }}
              placeholder="e.g. Phone credit"
              placeholderTextColor={mutedColor}
              style={[simpleStyles.input, { borderColor, color: textColor, backgroundColor: cardBg }]}
            />
          </SimpleField>
        ) : null}

        <SimpleField label="Amount">
          <View style={[styles.amountBox, { borderColor: '#6ee7b7' }]}>
            <Text style={styles.cedi}>₵</Text>
            <TextInput
              ref={amountRef}
              value={amount}
              onChangeText={(text) => { setAmount(text.replace(/[^\d.,]/g, '')); setError(''); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#6ee7b7"
              style={styles.amountInput}
              accessibilityLabel="Amount"
            />
          </View>
        </SimpleField>

        <SimpleField label="When?">
          <View style={styles.dates}>
            {dateChoices.map((c) => {
              const active = c.value === date;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setDate(c.value)}
                  style={[styles.dateChip, { borderColor: active ? '#0284c7' : borderColor, backgroundColor: active ? '#f0f9ff' : cardBg }]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <Text style={[styles.dateText, { color: active ? '#0c4a6e' : textColor }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SimpleField>

        {error ? <Text style={simpleStyles.error}>{error}</Text> : null}
        <SimpleBigButton label="Save Expense" icon="check" onPress={handleSave} loading={save.isPending} />
        {expense?.id ? (
          <SimpleBigButton label="Remove this expense" variant="danger" onPress={confirmRemove} loading={remove.isPending} />
        ) : null}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: 19, fontFamily: FontFamily.semiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%', flexGrow: 1, minHeight: 116, borderRadius: 20, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14,
  },
  emoji: { fontSize: 44 },
  otherDots: { fontSize: 30, fontFamily: FontFamily.bold, color: '#5b21b6', letterSpacing: 4 },
  tileLabel: { fontSize: 18, fontFamily: FontFamily.bold, color: '#0f172a' },
  amountBox: {
    height: 76, borderRadius: 18, borderWidth: 2, backgroundColor: '#ecfdf5',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8,
  },
  cedi: { fontSize: 30, fontFamily: FontFamily.bold, color: '#065f46' },
  amountInput: { flex: 1, fontSize: 34, fontFamily: FontFamily.bold, color: '#064e3b' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dateChip: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  dateText: { fontSize: 16, fontFamily: FontFamily.semiBold },
});
