import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { DealerRecordPaymentSheet } from '@/components/DealerRecordPaymentSheet';
import { FilterChipRow } from '@/components/FilterChip';
import {
  DetailHeroCard,
  DetailInfoRow,
  DetailSectionCard,
  DetailFooter,
  DetailLoading,
  DetailNotFound,
  DetailActionButton,
  EntityDetailHeader,
  useEntityDetailTheme,
} from '@/components/EntityDetailLayout';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { FORM_LABELS } from '@/constants/formLabels';
import { dealerService, type DealerPayload } from '@/services/dealerService';
import { getApiErrorMessage, parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import { refreshAfterDealerChange } from '@/utils/queryInvalidation';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';

type DealerDetail = {
  id: string;
  businessName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  creditTerms?: string;
  creditLimit?: number | string;
  availableCredit?: number | string;
  balance?: number | string;
  notes?: string;
  isActive?: boolean;
};

type LedgerEntry = {
  id: string;
  entryType?: string;
  description?: string;
  direction?: 'debit' | 'credit';
  amount?: number | string;
  balanceAfter?: number | string;
  entryDate?: string;
  createdAt?: string;
};

type StatementData = {
  dealer?: DealerDetail;
  period?: { startDate?: string; endDate?: string };
  openingBalance?: number;
  closingBalance?: number;
  totals?: {
    charges?: number;
    payments?: number;
    debits?: number;
    credits?: number;
  };
  entries?: LedgerEntry[];
};

const TAB_OPTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'statement', label: 'Statement' },
];

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: toIso(start), endDate: toIso(end) };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DealerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasFeature, isManager } = useAuth();
  const { cardBg, borderColor, textColor, mutedColor, colors } = useEntityDetailTheme();

  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    creditTerms: '',
    creditLimit: '',
    notes: '',
  });
  const initialMonth = useMemo(() => monthBounds(), []);
  const [statementStart, setStatementStart] = useState(initialMonth.startDate);
  const [statementEnd, setStatementEnd] = useState(initialMonth.endDate);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dealer', id],
    queryFn: () => dealerService.getById(String(id)),
    enabled: !!id && hasFeature('dealersAccount'),
  });

  const dealer = useMemo(() => parseApiEntity<DealerDetail>(data), [data]);

  const { data: ledgerResponse, isLoading: ledgerLoading } = useQuery({
    queryKey: ['dealer', id, 'ledger'],
    queryFn: () => dealerService.getLedger(String(id), { page: 1, limit: 50 }),
    enabled: !!id && activeTab === 'activity' && hasFeature('dealersAccount'),
  });

  const ledgerEntries = useMemo(
    () => parseApiListResponse<LedgerEntry>(ledgerResponse),
    [ledgerResponse]
  );

  const {
    data: statementResponse,
    isLoading: statementLoading,
    refetch: refetchStatement,
  } = useQuery({
    queryKey: ['dealer', id, 'statement', statementStart, statementEnd],
    queryFn: async () => {
      const res = await dealerService.getStatement(String(id), {
        startDate: statementStart,
        endDate: statementEnd,
      });
      return res?.data ?? res;
    },
    enabled: !!id && activeTab === 'statement' && hasFeature('dealersAccount'),
  });

  const statement = useMemo(
    () => (statementResponse ?? null) as StatementData | null,
    [statementResponse]
  );

  const statementEntries = useMemo(
    () => (statement?.entries || []).filter((entry) => entry.entryType !== 'opening_balance'),
    [statement?.entries]
  );

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<DealerPayload>) => dealerService.update(String(id), payload),
    onSuccess: async () => {
      await refetch();
      await refreshAfterDealerChange(queryClient);
      setEditOpen(false);
      Alert.alert('Saved', 'Dealer updated');
    },
    onError: (err: unknown) => {
      Alert.alert('Update failed', getApiErrorMessage(err, 'Could not update dealer'));
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: {
      amount: number;
      paymentMethod: string;
      referenceNumber?: string;
      notes?: string;
    }) => dealerService.recordPayment(String(id), payload),
    onSuccess: async () => {
      await refetch();
      await refreshAfterDealerChange(queryClient);
      setPaymentOpen(false);
      Alert.alert('Payment recorded', 'Dealer balance has been updated.');
    },
    onError: (err: unknown) => {
      Alert.alert('Payment failed', getApiErrorMessage(err, 'Could not record payment'));
    },
  });

  const openEdit = useCallback(() => {
    if (!dealer) return;
    setFormData({
      businessName: dealer.businessName || '',
      contactName: dealer.contactName || '',
      email: dealer.email || '',
      phone: dealer.phone || '',
      creditTerms: dealer.creditTerms || '',
      creditLimit: dealer.creditLimit != null ? String(dealer.creditLimit) : '',
      notes: dealer.notes || '',
    });
    setEditOpen(true);
  }, [dealer]);

  const handleSave = useCallback(() => {
    if (!formData.businessName.trim()) {
      Alert.alert('Business name required', 'Enter the dealer business name.');
      return;
    }
    const creditLimit = formData.creditLimit.trim() ? Number(formData.creditLimit) : 0;
    if (creditLimit < 0) {
      Alert.alert('Invalid credit limit', 'Credit limit cannot be negative.');
      return;
    }
    updateMutation.mutate({
      businessName: formData.businessName.trim(),
      contactName: formData.contactName.trim() || undefined,
      email: formData.email.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      creditTerms: formData.creditTerms.trim() || undefined,
      creditLimit,
      notes: formData.notes.trim() || undefined,
    });
  }, [formData, updateMutation]);

  const handleSellToDealer = useCallback(() => {
    if (!dealer?.id) return;
    router.push(`/(tabs)/cart?dealerId=${dealer.id}&mode=dealer` as never);
  }, [dealer?.id, router]);

  if (!hasFeature('dealersAccount')) {
    return <FeatureAccessDenied message="Dealers account is not enabled for this workspace." />;
  }

  if (isLoading) return <DetailLoading title="Dealer" />;
  if (!dealer) return <DetailNotFound title="Dealer" entityLabel="Dealer" />;

  const outstanding = Number(dealer.balance) || 0;

  return (
    <>
      <EntityDetailHeader
        title={dealer.businessName}
        headerRight={() => (
          <Pressable
            onPress={openEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit dealer"
            hitSlop={8}
            style={styles.headerEditBtn}
          >
            <AppIcon name="pencil" size={20} color={colors.tint} />
          </Pressable>
        )}
      />
      <ScreenShell
        scrollable
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
        }
      >
        <DetailHeroCard
          eyebrow="Dealer account"
          title={dealer.businessName}
          message={dealer.isActive === false ? 'Inactive account' : 'Wholesale dealer account'}
          metricLabel="Outstanding balance"
          metricValue={formatCurrency(dealer.balance)}
          secondaryIcon="credit-card"
          secondaryLabel="Available credit"
          secondaryValue={formatCurrency(dealer.availableCredit)}
          showCheck={dealer.isActive !== false}
        />

        <FilterChipRow options={TAB_OPTIONS} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            <DetailSectionCard title="Account">
              <DetailInfoRow label="Credit limit" value={formatCurrency(dealer.creditLimit)} />
              <DetailInfoRow label="Available credit" value={formatCurrency(dealer.availableCredit)} />
              <DetailInfoRow label="Terms" value={dealer.creditTerms || '—'} />
            </DetailSectionCard>
            <DetailSectionCard title="Contact">
              <DetailInfoRow label="Contact name" value={dealer.contactName || '—'} />
              <DetailInfoRow label="Phone" value={dealer.phone || '—'} />
              <DetailInfoRow label="Email" value={dealer.email || '—'} />
            </DetailSectionCard>
            {dealer.notes ? (
              <DetailSectionCard title="Notes">
                <Text style={[styles.notesText, { color: textColor }]}>{dealer.notes}</Text>
              </DetailSectionCard>
            ) : null}
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.tabContent}>
            {ledgerLoading ? (
              <ActivityIndicator color={colors.tint} style={styles.loader} />
            ) : ledgerEntries.length === 0 ? (
              <Text style={[styles.emptyText, { color: mutedColor }]}>No ledger activity yet.</Text>
            ) : (
              ledgerEntries.map((entry) => (
                <View
                  key={entry.id}
                  style={[styles.ledgerCard, { backgroundColor: cardBg, borderColor }]}
                >
                  <View style={styles.ledgerHeader}>
                    <View style={styles.ledgerMain}>
                      <Text style={[styles.ledgerTitle, { color: textColor }]}>
                        {entry.description || entry.entryType || 'Entry'}
                      </Text>
                      <Text style={[styles.ledgerDate, { color: mutedColor }]}>
                        {formatDateTime(entry.entryDate || entry.createdAt)}
                      </Text>
                    </View>
                    <View style={styles.ledgerAmountCol}>
                      <Text
                        style={[
                          styles.ledgerAmount,
                          { color: entry.direction === 'debit' ? '#b45309' : '#166534' },
                        ]}
                      >
                        {entry.direction === 'debit' ? '+' : '−'}
                        {formatCurrency(entry.amount)}
                      </Text>
                      <Text style={[styles.ledgerBalance, { color: mutedColor }]}>
                        Bal {formatCurrency(entry.balanceAfter)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'statement' && (
          <View style={styles.tabContent}>
            <DetailSectionCard title="Statement period">
              <Text style={[styles.inputLabel, { color: mutedColor }]}>From (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor, backgroundColor: cardBg }]}
                value={statementStart}
                onChangeText={setStatementStart}
                placeholder="2026-06-01"
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
              />
              <Text style={[styles.inputLabel, { color: mutedColor }]}>To (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor, backgroundColor: cardBg }]}
                value={statementEnd}
                onChangeText={setStatementEnd}
                placeholder="2026-06-30"
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => refetchStatement()}
                style={[styles.secondaryBtn, { borderColor }]}
              >
                <Text style={[styles.secondaryBtnText, { color: textColor }]}>Refresh statement</Text>
              </Pressable>
            </DetailSectionCard>

            {statementLoading ? (
              <ActivityIndicator color={colors.tint} style={styles.loader} />
            ) : statement ? (
              <>
                <DetailSectionCard title="Summary">
                  <DetailInfoRow label="Opening balance" value={formatCurrency(statement.openingBalance)} />
                  <DetailInfoRow
                    label="Charges"
                    value={formatCurrency(statement.totals?.charges ?? statement.totals?.debits)}
                  />
                  <DetailInfoRow
                    label="Payments"
                    value={formatCurrency(statement.totals?.payments ?? statement.totals?.credits)}
                  />
                  <DetailInfoRow
                    label="Closing balance"
                    value={formatCurrency(statement.closingBalance)}
                    valueColor={colors.tint}
                  />
                </DetailSectionCard>
                {statementEntries.length > 0 ? (
                  <DetailSectionCard title="Period activity">
                    {statementEntries.map((entry) => (
                      <View key={entry.id} style={styles.statementRow}>
                        <View style={styles.statementRowMain}>
                          <Text style={[styles.ledgerTitle, { color: textColor }]}>
                            {entry.description || entry.entryType}
                          </Text>
                          <Text style={[styles.ledgerDate, { color: mutedColor }]}>
                            {formatDate(entry.entryDate || entry.createdAt)}
                          </Text>
                        </View>
                        <Text style={[styles.ledgerAmount, { color: textColor }]}>
                          {entry.direction === 'debit' ? '+' : '−'}
                          {formatCurrency(entry.amount)}
                        </Text>
                      </View>
                    ))}
                  </DetailSectionCard>
                ) : (
                  <Text style={[styles.emptyText, { color: mutedColor }]}>
                    No activity in this period.
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                Adjust the dates and tap refresh to load a statement.
              </Text>
            )}
          </View>
        )}
      </ScreenShell>

      <DetailFooter>
        <DetailActionButton
          label="Sell to dealer"
          icon="shopping-cart"
          variant="primary"
          onPress={handleSellToDealer}
        />
        {isManager ? (
          <DetailActionButton
            label="Record payment"
            icon="credit-card"
            onPress={() => setPaymentOpen(true)}
          />
        ) : null}
      </DetailFooter>

      <FormSheetModal
        visible={editOpen}
        title={FORM_LABELS.dealer.editTitle}
        onClose={() => setEditOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleSave}
            disabled={updateMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{FORM_LABELS.dealer.save}</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.businessName}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.businessName}
          onChangeText={(t) => setFormData((p) => ({ ...p, businessName: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.contactName}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.contactName}
          onChangeText={(t) => setFormData((p) => ({ ...p, contactName: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.phone}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.phone}
          onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.email}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.email}
          onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.creditLimit}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.creditLimit}
          onChangeText={(t) => setFormData((p) => ({ ...p, creditLimit: t }))}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.creditTerms}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.creditTerms}
          onChangeText={(t) => setFormData((p) => ({ ...p, creditTerms: t }))}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.dealer.notes}</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          value={formData.notes}
          onChangeText={(t) => setFormData((p) => ({ ...p, notes: t }))}
          multiline
        />
      </FormSheetModal>

      <DealerRecordPaymentSheet
        visible={paymentOpen}
        balance={outstanding}
        onClose={() => setPaymentOpen(false)}
        onSubmit={(payload) => paymentMutation.mutate(payload)}
        isSubmitting={paymentMutation.isPending}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        tintColor={colors.tint}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  headerEditBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: { paddingHorizontal: 16, paddingTop: 8 },
  notesText: { fontSize: 15, lineHeight: 22 },
  loader: { marginTop: 24 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  ledgerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  ledgerHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ledgerMain: { flex: 1 },
  ledgerTitle: { fontSize: 15, fontWeight: '600' },
  ledgerDate: { fontSize: 12, marginTop: 4 },
  ledgerAmountCol: { alignItems: 'flex-end' },
  ledgerAmount: { fontSize: 15, fontWeight: '700' },
  ledgerBalance: { fontSize: 12, marginTop: 4 },
  statementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statementRowMain: { flex: 1 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  secondaryBtn: {
    marginTop: 12,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
