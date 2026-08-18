import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { FormSheetModal } from '@/components/FormSheetModal';
import {
  DetailHeroCard,
  DetailInfoRow,
  DetailSectionCard,
  DetailFooter,
  DetailLoading,
  DetailNotFound,
  DetailActionButton,
  DetailMoreActions,
  type DetailMoreAction,
  EntityDetailHeader,
  useEntityDetailTheme,
} from '@/components/EntityDetailLayout';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { useExclusiveAction } from '@/hooks/useExclusiveAction';
import { resolveBusinessType } from '@/constants';
import { FORM_LABELS } from '@/constants/formLabels';
import { customerService, type CustomerPayload } from '@/services/customerService';
import { customDropdownService } from '@/services/customDropdownService';
import { settingsService } from '@/services/settings';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { refreshAfterCustomerChange } from '@/utils/queryInvalidation';
import { formatCurrency } from '@/utils/formatCurrency';

type CustomerDetail = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  howDidYouHear?: string;
  referralName?: string;
  balance?: number | string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  activities?: CustomerActivity[];
  jobs?: CustomerJob[];
};

type CustomerActivity = {
  id: string;
  type?: string;
  subject?: string | null;
  notes?: string | null;
  nextStep?: string | null;
  followUpDate?: string | null;
  createdAt?: string;
  createdByUser?: { name?: string; email?: string } | null;
};

type CustomerJob = {
  id: string;
  jobNumber?: string;
  title?: string;
  status?: string;
  finalPrice?: number | string | null;
  createdAt?: string;
};

type TimelineActivity = CustomerActivity & {
  metadata?: Record<string, unknown>;
};

type CustomerAction = 'edit' | 'note' | 'delete';

const FALLBACK_CUSTOMER_SOURCES = [
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Website', label: 'Website' },
  { value: 'Social Media', label: 'Social Media' },
];

const OTHER_SOURCE_VALUE = '__OTHER__';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenant, isManager, tenantRole } = useAuth();
  const canManageCustomer = isManager || tenantRole === 'staff';
  const { cardBg, borderColor, textColor, mutedColor, bg, colors } = useEntityDetailTheme();
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    howDidYouHear: '',
    referralName: '',
  });
  const [customSourceValue, setCustomSourceValue] = useState('');
  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<CustomerAction>();
  const isStudio = resolveBusinessType(activeTenant?.businessType) === 'studio';

  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getCustomerById(String(id)),
    enabled: !!id,
  });

  const customer = useMemo(() => parseApiEntity<CustomerDetail>(data), [data]);

  const { data: activitiesResponse } = useQuery({
    queryKey: ['customer', id, 'activities'],
    queryFn: () => customerService.getActivities(String(id)),
    enabled: !!id,
  });

  const customerActivities = useMemo(() => {
    const body = activitiesResponse?.data ?? activitiesResponse;
    return Array.isArray(body) ? (body as CustomerActivity[]) : customer?.activities || [];
  }, [activitiesResponse, customer?.activities]);

  const { data: customerSourceOptions = [] } = useQuery({
    queryKey: ['settings', 'customer-sources'],
    queryFn: () => settingsService.getCustomerSources(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: customSourceOptions = [] } = useQuery({
    queryKey: ['custom-dropdowns', 'customer_source'],
    queryFn: () => customDropdownService.getCustomOptions('customer_source'),
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

  const openEdit = useCallback(() => {
    if (!customer) return;
    setFormData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      address: customer.address || '',
      howDidYouHear: customer.howDidYouHear || '',
      referralName: customer.referralName || '',
    });
    setCustomSourceValue('');
    setEditOpen(true);
  }, [customer]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CustomerPayload>) => customerService.updateCustomer(String(id), payload),
    onSuccess: async () => {
      await refreshAfterCustomerChange(queryClient);
      setEditOpen(false);
      Alert.alert('Success', 'Customer updated');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to update customer'));
    },
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      customerService.addActivity(String(id), {
        type: 'note',
        subject: 'Mobile note',
        notes: noteText.trim(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer', id, 'activities'] }),
        refreshAfterCustomerChange(queryClient),
      ]);
      setNoteOpen(false);
      setNoteText('');
    },
    onError: (err: unknown) => {
      Alert.alert('Could not save note', getApiErrorMessage(err, 'Failed to add activity'));
    },
  });

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

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    try {
      const sourceValue = await resolveSourceValue();
      if (sourceValue === null) return;
      await runExclusiveAction('edit', () => {
        return updateMutation.mutateAsync({
          name: formData.name.trim(),
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          company: formData.company.trim() || undefined,
          address: formData.address.trim() || undefined,
          howDidYouHear: sourceValue || undefined,
          referralName: sourceValue === 'Referral' ? formData.referralName.trim() || undefined : undefined,
        });
      });
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to save customer source'));
    }
  }, [formData, resolveSourceValue, runExclusiveAction, updateMutation]);

  const handleCreateJob = useCallback(() => {
    if (!customer) return;
    router.push({
      pathname: '/(tabs)/jobs',
      params: { add: '1', customerId: customer.id, customerName: customer.name },
    } as never);
  }, [customer, router]);

  const handleDeleteCustomer = useCallback(() => {
    if (!customer) return;
    Alert.alert('Delete customer', 'Delete this customer permanently? Existing sales, jobs, or invoices may prevent deletion.', [
      { text: 'Keep customer', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          runExclusiveAction('delete', async () => {
            try {
              await customerService.deleteCustomer(customer.id);
              await refreshAfterCustomerChange(queryClient);
              Alert.alert('Deleted', 'Customer deleted');
              router.back();
            } catch (err: unknown) {
              Alert.alert('Error', getApiErrorMessage(err, 'Failed to delete customer'));
            }
          }),
      },
    ]);
  }, [customer, queryClient, router, runExclusiveAction]);

  if (isLoading) return <DetailLoading title="Customer" />;
  if (!customer) return <DetailNotFound title="Customer" entityLabel="Customer" />;

  const creationActivity: TimelineActivity | null = customer.createdAt
    ? {
        id: 'creation',
        type: 'creation',
        subject: `Added customer`,
        notes: customer.name,
        createdAt: customer.createdAt,
      }
    : null;

  const jobActivities: TimelineActivity[] = (customer.jobs || []).map((job) => ({
    id: `job-${job.id}`,
    type: 'job',
    subject: job.jobNumber ? `Job ${job.jobNumber}` : 'Job created',
    notes: [
      job.title,
      job.status ? `Status: ${job.status.replace(/_/g, ' ')}` : '',
      Number(job.finalPrice || 0) ? `Amount: ${formatCurrency(job.finalPrice || 0)}` : '',
    ].filter(Boolean).join(' | '),
    createdAt: job.createdAt,
    metadata: { jobId: job.id, jobNumber: job.jobNumber },
  }));

  const timelineActivities = [
    ...(creationActivity ? [creationActivity] : []),
    ...customerActivities,
    ...jobActivities,
  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const customerPrimaryIsCreateJob = isStudio;
  const customerMoreActions: DetailMoreAction[] = [
    ...(canManageCustomer
      ? [
          {
            key: 'edit',
            label: 'Edit',
            icon: 'edit' as const,
            onPress: openEdit,
            disabled: isAnyActionActive,
          },
          {
            key: 'delete',
            label: 'Delete',
            icon: 'trash' as const,
            variant: 'danger' as const,
            onPress: handleDeleteCustomer,
            loading: isActionActive('delete'),
            disabled: isAnyActionActive,
          },
        ]
      : []),
  ];

  return (
    <>
      <EntityDetailHeader title={customer.name || 'Customer'} />
      <ScreenShell style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow={customer.isActive === false ? 'Inactive customer' : 'Customer'}
            title={customer.name}
            message={customer.company || customer.email || customer.phone || 'Customer profile and activity.'}
            metricLabel="Balance"
            metricValue={formatCurrency(customer.balance || 0)}
            secondaryIcon="sticky-note-o"
            secondaryLabel="Activity"
            secondaryValue={`${timelineActivities.length} ${timelineActivities.length === 1 ? 'Entry' : 'Entries'}`}
            showCheck={customer.isActive !== false}
          />

          <DetailSectionCard title="Customer Details" icon="user">
            <DetailInfoRow icon="user" label={FORM_LABELS.customer.name} value={customer.name} />
            <DetailInfoRow
              icon="briefcase"
              label={FORM_LABELS.customer.company.replace(' (optional)', '')}
              value={customer.company || '—'}
            />
            <DetailInfoRow icon="mail" label={FORM_LABELS.customer.email.replace(' (optional)', '')} value={customer.email || '—'} />
            <DetailInfoRow icon="phone" label={FORM_LABELS.customer.phone.replace(' (optional)', '')} value={customer.phone || '—'} />
            <DetailInfoRow icon="map-pin" label="Address" value={customer.address || '—'} />
            <DetailInfoRow icon="info" label="Source" value={customer.howDidYouHear || '—'} />
            {customer.howDidYouHear === 'Referral' ? (
              <DetailInfoRow icon="user-plus" label="Referral Name" value={customer.referralName || '—'} />
            ) : null}
          </DetailSectionCard>

          <DetailSectionCard title="Activity" icon="sticky-note-o">
            <View style={styles.activityHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Recent activity</Text>
              <Pressable
                onPress={() => setNoteOpen(true)}
                disabled={isAnyActionActive}
                style={({ pressed }) => [
                  styles.addNoteBtn,
                  { borderColor, opacity: pressed ? 0.85 : isAnyActionActive ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.addNoteText, { color: colors.tint }]}>Add note</Text>
              </Pressable>
            </View>
            {timelineActivities.length > 0 ? (
              timelineActivities.slice(0, 20).map((activity, index) => {
                const isLast = index === timelineActivities.length - 1;
                return (
                  <View key={activity.id} style={styles.activityRow}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, { backgroundColor: colors.tint }]} />
                      {!isLast ? <View style={[styles.timelineLine, { backgroundColor: borderColor }]} /> : null}
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={[styles.activityTitle, { color: textColor }]}>
                        {getActivityTitle(activity, customer.name)}
                      </Text>
                      {activity.notes ? (
                        <Text style={[styles.activityNotes, { color: mutedColor }]}>
                          {activity.notes}
                        </Text>
                      ) : null}
                      <Text style={[styles.activityMeta, { color: mutedColor }]}>
                        {formatActivityDate(activity.createdAt)}
                        {activity.createdByUser?.name ? ` · ${activity.createdByUser.name}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyActivity, { color: mutedColor }]}>No customer activity yet.</Text>
            )}
          </DetailSectionCard>
        </ScrollView>
        <DetailFooter>
          {customerPrimaryIsCreateJob ? (
            <DetailActionButton
              label="Create job"
              icon="briefcase"
              variant="primary"
              onPress={handleCreateJob}
              disabled={isAnyActionActive}
            />
          ) : null}
          {canManageCustomer ? (
            <DetailActionButton
              label="Edit"
              icon="edit"
              variant={customerPrimaryIsCreateJob ? 'outline' : 'primary'}
              onPress={openEdit}
              disabled={isAnyActionActive}
            />
          ) : null}
          <DetailMoreActions actions={customerMoreActions} disabled={isAnyActionActive} />
        </DetailFooter>
      </ScreenShell>

      <FormSheetModal
        visible={editOpen}
        title={FORM_LABELS.customer.editTitle}
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
              <Text style={styles.saveBtnText}>{FORM_LABELS.customer.save}</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.label, { color: textColor }]}>{FORM_LABELS.customer.name}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.name}
          onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
        />
        <Text style={[styles.label, { color: textColor }]}>{FORM_LABELS.customer.company}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.company}
          onChangeText={(t) => setFormData((p) => ({ ...p, company: t }))}
        />
        <Text style={[styles.label, { color: textColor }]}>{FORM_LABELS.customer.email}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.email}
          onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={[styles.label, { color: textColor }]}>{FORM_LABELS.customer.phone}</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={formData.phone}
          onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
          keyboardType="phone-pad"
        />
        <Text style={[styles.label, { color: textColor }]}>Address (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          value={formData.address}
          onChangeText={(t) => setFormData((p) => ({ ...p, address: t }))}
          placeholder="Enter street address"
          placeholderTextColor={mutedColor}
          multiline
        />
        <Text style={[styles.label, { color: textColor }]}>How did you hear about us? (optional)</Text>
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
            <Text style={[styles.label, { color: textColor }]}>Other source (optional)</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              value={customSourceValue}
              onChangeText={setCustomSourceValue}
              placeholder="e.g., Billboard, Magazine Ad"
              placeholderTextColor={mutedColor}
            />
          </>
        ) : null}
        {formData.howDidYouHear === 'Referral' ? (
          <>
            <Text style={[styles.label, { color: textColor }]}>Referral Name (optional)</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              value={formData.referralName}
              onChangeText={(t) => setFormData((p) => ({ ...p, referralName: t }))}
              placeholder="Enter referral name"
              placeholderTextColor={mutedColor}
            />
          </>
        ) : null}
      </FormSheetModal>

      <FormSheetModal
        visible={noteOpen}
        title="Add activity note"
        onClose={() => setNoteOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.noteFooter}>
            <Pressable
              onPress={() => setNoteOpen(false)}
              disabled={isAnyActionActive}
              style={[styles.cancelNoteBtn, { borderColor }]}
            >
              <Text style={[styles.cancelNoteText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!noteText.trim()) {
                  Alert.alert('Note required', 'Enter a note or cancel.');
                  return;
                }
                runExclusiveAction('note', () => noteMutation.mutateAsync());
              }}
              disabled={isAnyActionActive}
              style={[styles.saveNoteBtn, { backgroundColor: colors.tint }]}
            >
              {isActionActive('note') ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveNoteText}>Save note</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={[styles.label, { color: textColor }]}>Note</Text>
        <TextInput
          style={[styles.input, styles.noteInput, { color: textColor, borderColor }]}
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Write a customer activity note"
          placeholderTextColor={mutedColor}
          multiline
        />
      </FormSheetModal>
    </>
  );
}

function formatActivityDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatActivityType(type?: string): string {
  return String(type || 'note')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getActivityTitle(activity: TimelineActivity, customerName: string): string {
  if (activity.type === 'creation') return `Added customer, ${customerName}`;
  if (activity.subject) return activity.subject;
  return formatActivityType(activity.type);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  saveBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 8 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  sourceScroll: { marginTop: 4, marginBottom: 8 },
  sourceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  sourceChipText: { fontSize: 14, fontWeight: '500' },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addNoteBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addNoteText: { fontSize: 13, fontWeight: '600' },
  activityRow: { flexDirection: 'row', minHeight: 62 },
  timelineRail: { width: 20, alignItems: 'center' },
  timelineDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  timelineLine: { width: 1, flex: 1, marginTop: 4 },
  activityContent: { flex: 1, paddingBottom: 14 },
  activityTitle: { fontSize: 14, fontWeight: '700' },
  activityNotes: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  activityMeta: { fontSize: 12, marginTop: 4 },
  emptyActivity: { fontSize: 14, paddingVertical: 10 },
  noteFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelNoteBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNoteText: { fontSize: 15, fontWeight: '600' },
  saveNoteBtn: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 112,
  },
  saveNoteText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  noteInput: { minHeight: 120, textAlignVertical: 'top' },
});
