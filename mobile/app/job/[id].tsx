import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invoiceService } from '@/services/invoiceService';
import { jobService } from '@/services/jobService';
import {
  DetailHeroCard,
  DetailInfoRow,
  DetailFooter,
  DetailLoading,
  DetailNotFound,
  DetailActionButton,
  DetailMoreActions,
  type DetailMoreAction,
  DetailSectionCard,
  EntityDetailHeader,
} from '@/components/EntityDetailLayout';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { useExclusiveAction } from '@/hooks/useExclusiveAction';
import { useScreenColors } from '@/hooks/useScreenColors';
import { userWorkspaceService } from '@/services/userWorkspaceService';
import { formatCurrency } from '@/utils/formatCurrency';
import { parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import { refreshAfterJobChange } from '@/utils/queryInvalidation';
import { standaloneFullWidth } from '@/styles/standaloneButton';
import { DeliveryStatusPicker } from '@/components/DeliveryStatusPicker';

type TabKey = 'details' | 'services' | 'attachments' | 'activities';
type JobAction =
  | 'deliveryStatus'
  | 'status:in_progress'
  | 'status:completed'
  | 'status:cancelled'
  | 'attachment'
  | 'delete'
  | 'edit'
  | 'assign'
  | 'deliveryRequired';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeStatus(status?: string): string {
  return String(status || 'new').trim().toLowerCase();
}

function prettyStatus(status?: string): string {
  return normalizeStatus(status)
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function JobDetailsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeTenantId, isAdmin } = useAuth();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
  });
  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<JobAction>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobService.getJobById(String(id)),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const job = useMemo(() => parseApiEntity<any>(data), [data]);

  const { data: linkedInvoicesResponse } = useQuery({
    queryKey: ['invoices', 'job-link', id],
    queryFn: () => invoiceService.getInvoices({ jobId: String(id), limit: 1 }),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const linkedInvoiceId = useMemo(() => {
    if (job?.invoiceId) return job.invoiceId;
    if (job?.invoice?.id) return job.invoice.id;
    const [invoice] = parseApiListResponse<{ id?: string }>(linkedInvoicesResponse);
    return invoice?.id ?? null;
  }, [job?.invoice?.id, job?.invoiceId, linkedInvoicesResponse]);

  const { data: membersResponse } = useQuery({
    queryKey: ['task-members', activeTenantId],
    queryFn: () => userWorkspaceService.getTaskMembers(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(
    () => parseApiListResponse<{ id: string; name?: string; email?: string }>(membersResponse),
    [membersResponse]
  );

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => jobService.updateJob(String(id), { status }),
    onSuccess: async () => {
      await refreshAfterJobChange(queryClient);
    },
    onError: (err: any) => {
      Alert.alert('Update failed', err?.message || 'Could not update job');
    },
  });

  const updateDeliveryStatusMutation = useMutation({
    mutationFn: (deliveryStatus: string | null) =>
      jobService.updateDeliveryStatus(String(id), deliveryStatus),
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['deliveries-queue'] });
      await refreshAfterJobChange(queryClient);
    },
    onError: (err: any) => {
      Alert.alert(
        'Update failed',
        err?.response?.data?.message || err?.message || 'Could not update delivery status'
      );
    },
  });

  const detailRows = useMemo(
    () => [
      { label: 'Customer', value: job?.customer?.name || '—' },
      { label: 'Status', value: prettyStatus(job?.status) },
      { label: 'Priority', value: job?.priority ? prettyStatus(job.priority) : '—' },
      { label: 'Due Date', value: formatDate(job?.dueDate) },
      { label: 'Created', value: formatDate(job?.createdAt) },
      { label: 'Total', value: formatCurrency(job?.total ?? job?.finalPrice ?? 0) },
      { label: 'Delivery required', value: job?.deliveryRequired === true ? 'Yes' : 'No' },
      { label: 'Assigned to', value: job?.assignedUser?.name || job?.assignee?.name || 'Unassigned' },
    ],
    [job]
  );

  const services = Array.isArray(job?.items) ? job.items : [];
  const attachments = Array.isArray(job?.attachments) ? job.attachments : [];
  const activities = Array.isArray(job?.statusHistory) ? job.statusHistory : [];

  const handleUpdateStatus = (status: 'in_progress' | 'completed' | 'cancelled') => {
    runExclusiveAction(`status:${status}`, () => updateStatusMutation.mutateAsync(status));
  };

  const handleUploadAttachment = async () => {
    if (!job) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await runExclusiveAction('attachment', async () => {
      try {
        await jobService.uploadAttachment(job.id, {
          uri: asset.uri,
          name: asset.name || 'attachment',
          mimeType: asset.mimeType,
        });
        await refetch();
        await refreshAfterJobChange(queryClient);
        setActiveTab('attachments');
        Alert.alert('Uploaded', 'Attachment added to this job');
      } catch (err: any) {
        Alert.alert('Upload failed', err?.response?.data?.message || err?.message || 'Could not upload attachment');
      }
    });
  };

  const handleToggleDeliveryRequired = () => {
    if (!job) return;
    const nextValue = job.deliveryRequired !== true;
    runExclusiveAction('deliveryRequired', async () => {
      try {
        await jobService.updateJob(job.id, {
          deliveryRequired: nextValue,
          ...(!nextValue ? { deliveryStatus: null } : {}),
        });
        await refetch();
        await refreshAfterJobChange(queryClient);
      } catch (err: any) {
        Alert.alert('Update failed', err?.response?.data?.message || err?.message || 'Could not update delivery setting');
      }
    });
  };

  const handleAssignJob = (assignedTo: string | null) => {
    if (!job) return;
    runExclusiveAction('assign', async () => {
      try {
        await jobService.updateJob(job.id, { assignedTo });
        await refetch();
        await refreshAfterJobChange(queryClient);
        setAssignOpen(false);
      } catch (err: any) {
        Alert.alert('Assign failed', err?.response?.data?.message || err?.message || 'Could not assign this job');
      }
    });
  };

  const openEditBasics = () => {
    if (!job) return;
    setEditForm({
      title: job.title || '',
      description: job.description || '',
      dueDate: String(job.dueDate || '').slice(0, 10),
      priority: job.priority || 'medium',
    });
    setEditOpen(true);
  };

  const handleSaveBasics = () => {
    if (!job) return;
    if (!editForm.title.trim()) {
      Alert.alert('Title required', 'Enter a job title.');
      return;
    }
    runExclusiveAction('edit', async () => {
      try {
        await jobService.updateJob(job.id, {
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          dueDate: editForm.dueDate.trim() || null,
          priority: editForm.priority,
        });
        await refetch();
        await refreshAfterJobChange(queryClient);
        setEditOpen(false);
        Alert.alert('Success', 'Job updated');
      } catch (err: any) {
        Alert.alert('Update failed', err?.response?.data?.message || err?.message || 'Could not update job');
      }
    });
  };

  const handleDeleteJob = () => {
    if (!job) return;
    Alert.alert(
      'Delete job',
      'Delete this job permanently? Linked invoices, payments, expenses, and material movements will also be removed.',
      [
      { text: 'Keep job', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          runExclusiveAction('delete', async () => {
            try {
              await jobService.deleteJob(job.id);
              await refreshAfterJobChange(queryClient);
              Alert.alert('Deleted', 'Job deleted');
              router.back();
            } catch (err: any) {
              Alert.alert('Delete failed', err?.response?.data?.message || err?.message || 'Could not delete job');
            }
          }),
      },
    ]);
  };

  if (isLoading) return <DetailLoading title="Job details" />;
  if (!job) return <DetailNotFound title="Job details" entityLabel="Job" />;

  const jobStatus = normalizeStatus(job?.status);
  const primaryStatus =
    jobStatus === 'completed' || jobStatus === 'cancelled'
      ? null
      : jobStatus === 'in_progress'
        ? 'completed'
        : 'in_progress';
  const primaryJobIsInvoice = !primaryStatus && Boolean(linkedInvoiceId);
  const primaryJobIsUpload = !primaryStatus && !primaryJobIsInvoice;
  const jobMoreActions: DetailMoreAction[] = [
    {
      key: 'edit',
      label: 'Edit basics',
      icon: 'edit',
      onPress: openEditBasics,
      disabled: isAnyActionActive,
    },
    ...(linkedInvoiceId && !primaryJobIsInvoice
      ? [{
          key: 'viewInvoice',
          label: 'View invoice',
          icon: 'file-text' as const,
          onPress: () => router.push(`/invoice/${encodeURIComponent(linkedInvoiceId)}` as any),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(!primaryJobIsUpload
      ? [{
          key: 'upload',
          label: 'Upload',
          icon: 'paperclip' as const,
          onPress: handleUploadAttachment,
          loading: isActionActive('attachment'),
          disabled: isAnyActionActive,
        }]
      : []),
    {
      key: 'assign',
      label: 'Assign',
      icon: 'user-plus',
      onPress: () => setAssignOpen(true),
      disabled: isAnyActionActive,
    },
    {
      key: 'deliveryRequired',
      label: job.deliveryRequired === true ? 'No delivery' : 'Delivery',
      icon: 'truck',
      onPress: handleToggleDeliveryRequired,
      loading: isActionActive('deliveryRequired'),
      disabled: isAnyActionActive,
    },
    ...(primaryStatus !== 'in_progress'
      ? [{
          key: 'status:in_progress',
          label: 'Mark as In Progress',
          onPress: () => handleUpdateStatus('in_progress'),
          loading: isActionActive('status:in_progress'),
          disabled: isAnyActionActive || jobStatus === 'in_progress',
        }]
      : []),
    ...(primaryStatus !== 'completed'
      ? [{
          key: 'status:completed',
          label: 'Mark as Completed',
          onPress: () => handleUpdateStatus('completed'),
          loading: isActionActive('status:completed'),
          disabled: isAnyActionActive || jobStatus === 'completed',
        }]
      : []),
    {
      key: 'status:cancelled',
      label: 'Cancel Job',
      variant: 'danger',
      onPress: () => handleUpdateStatus('cancelled'),
      loading: isActionActive('status:cancelled'),
      disabled: isAnyActionActive || jobStatus === 'cancelled',
    },
    ...(isAdmin
      ? [{
          key: 'delete',
          label: 'Delete Job',
          variant: 'danger' as const,
          onPress: handleDeleteJob,
          loading: isActionActive('delete'),
          disabled: isAnyActionActive,
        }]
      : []),
  ];

  return (
    <ScreenShell style={styles.container}>
      <EntityDetailHeader title={job?.jobNumber || 'Job details'} />

      <>
          <View style={[styles.tabRow, { borderBottomColor: borderColor }]}>
            {(['details', 'services', 'attachments', 'activities'] as TabKey[]).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.tint }]}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? colors.tint : mutedColor }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <DetailHeroCard
              eyebrow={job?.jobNumber || 'Job'}
              title={prettyStatus(job?.status)}
              message={job.title || 'Job details are ready for review.'}
              metricLabel="Total Amount"
              metricValue={formatCurrency(job?.total ?? job?.finalPrice ?? 0)}
              secondaryIcon="archive"
              secondaryLabel="Services"
              secondaryValue={`${services.length} ${services.length === 1 ? 'Item' : 'Items'}`}
              showCheck={normalizeStatus(job?.status) === 'completed'}
            />

            <DetailSectionCard
              title={
                activeTab === 'details'
                  ? 'Job Details'
                  : activeTab === 'services'
                    ? 'Service Items'
                    : activeTab === 'attachments'
                      ? 'Attachments'
                      : 'Activities'
              }
              icon={
                activeTab === 'details'
                  ? 'briefcase'
                  : activeTab === 'services'
                    ? 'archive'
                    : activeTab === 'attachments'
                      ? 'paperclip'
                      : 'sticky-note-o'
              }
            >
              <Text style={[styles.sectionTitle, { color: mutedColor }]}>Title</Text>
              <Text style={[styles.titleValue, { color: textColor }]}>{job.title || '—'}</Text>

              {activeTab === 'details' && (
                <View style={styles.detailList}>
                  {detailRows.map((row) => (
                    <DetailInfoRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  <DetailInfoRow icon="truck" label="Delivery status">
                    <DeliveryStatusPicker
                      value={job?.deliveryStatus}
                      onChange={(nextStatus) => {
                        runExclusiveAction('deliveryStatus', () => updateDeliveryStatusMutation.mutateAsync(nextStatus));
                      }}
                      cardBg={cardBg}
                      borderColor={borderColor}
                      textColor={textColor}
                      mutedColor={mutedColor}
                      tintColor={colors.tint}
                      loading={isActionActive('deliveryStatus')}
                      disabled={isAnyActionActive || normalizeStatus(job?.status) !== 'completed'}
                    />
                  </DetailInfoRow>
                </View>
              )}

              {activeTab === 'services' && (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Items</Text>
                  {services.length === 0 ? (
                    <Text style={[styles.emptyText, { color: mutedColor }]}>No service items</Text>
                  ) : (
                    services.map((item: any, i: number) => {
                      const qty = item?.quantity || 1;
                      const lineTotal =
                        (item?.unitPrice || item?.price || 0) * qty;
                      return (
                        <DetailInfoRow
                          key={`${item?.id || i}`}
                          label={`${item?.description || item?.name || 'Item'} × ${qty}`}
                          value={formatCurrency(lineTotal)}
                        />
                      );
                    })
                  )}
                </View>
              )}

              {activeTab === 'attachments' && (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Attachments</Text>
                  {attachments.length === 0 ? (
                    <Text style={[styles.emptyText, { color: mutedColor }]}>No attachments</Text>
                  ) : (
                    attachments.map((a: any, i: number) => (
                      <DetailInfoRow
                        key={`${a?.id || i}`}
                        label={`File ${i + 1}`}
                        value={a?.name || a?.filename || 'Attachment'}
                      />
                    ))
                  )}
                </View>
              )}

              {activeTab === 'activities' && (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Activities</Text>
                  {activities.length === 0 ? (
                    <Text style={[styles.emptyText, { color: mutedColor }]}>No activity yet</Text>
                  ) : (
                    activities.map((act: any, i: number) => (
                      <DetailInfoRow
                        key={`${act?.id || i}`}
                        label={prettyStatus(act?.toStatus || act?.status || 'updated')}
                        value={formatDate(act?.createdAt)}
                      />
                    ))
                  )}
                </View>
              )}
            </DetailSectionCard>
          </ScrollView>
          <DetailFooter>
            {primaryStatus ? (
              <DetailActionButton
                label={primaryStatus === 'completed' ? 'Complete' : 'Start'}
                variant="primary"
                onPress={() => handleUpdateStatus(primaryStatus)}
                loading={isActionActive(`status:${primaryStatus}` as JobAction)}
                disabled={isAnyActionActive}
              />
            ) : primaryJobIsInvoice && linkedInvoiceId ? (
              <DetailActionButton
                label="View invoice"
                icon="file-text"
                variant="primary"
                onPress={() => router.push(`/invoice/${encodeURIComponent(linkedInvoiceId)}` as never)}
                disabled={isAnyActionActive}
              />
            ) : (
              <DetailActionButton
                label="Upload"
                icon="paperclip"
                variant="primary"
                onPress={handleUploadAttachment}
                loading={isActionActive('attachment')}
                disabled={isAnyActionActive}
              />
            )}
            <DetailMoreActions actions={jobMoreActions} disabled={isAnyActionActive} />
          </DetailFooter>
      </>

      <FormSheetModal
        visible={editOpen}
        title="Edit job basics"
        onClose={() => setEditOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleSaveBasics}
            disabled={isAnyActionActive}
            style={[styles.saveBtn, { backgroundColor: colors.tint }]}
          >
            {isActionActive('edit') ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save job</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.formLabel, { color: textColor }]}>Title</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={editForm.title}
          onChangeText={(text) => setEditForm((prev) => ({ ...prev, title: text }))}
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.formLabel, { color: textColor }]}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor }]}
          value={editForm.description}
          onChangeText={(text) => setEditForm((prev) => ({ ...prev, description: text }))}
          multiline
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.formLabel, { color: textColor }]}>Due date (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor }]}
          value={editForm.dueDate}
          onChangeText={(text) => setEditForm((prev) => ({ ...prev, dueDate: text }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.formLabel, { color: textColor }]}>Priority</Text>
        <View style={styles.priorityRow}>
          {['low', 'medium', 'high', 'urgent'].map((priority) => {
            const selected = editForm.priority === priority;
            return (
              <Pressable
                key={priority}
                onPress={() => setEditForm((prev) => ({ ...prev, priority }))}
                style={[
                  styles.priorityChip,
                  { borderColor, backgroundColor: selected ? colors.tint : 'transparent' },
                ]}
              >
                <Text style={[styles.priorityChipText, { color: selected ? '#fff' : textColor }]}>
                  {prettyStatus(priority)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormSheetModal>

      <FormSheetModal
        visible={assignOpen}
        title="Assign job"
        onClose={() => setAssignOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        <Pressable
          style={[styles.sheetBtn, { borderColor }]}
          onPress={() => handleAssignJob(null)}
          disabled={isAnyActionActive}
        >
          <Text style={[styles.sheetBtnText, { color: textColor }]}>Unassigned</Text>
        </Pressable>
        {members.map((member) => (
          <Pressable
            key={member.id}
            style={[styles.sheetBtn, { borderColor }]}
            onPress={() => handleAssignJob(member.id)}
            disabled={isAnyActionActive}
          >
            <Text style={[styles.sheetBtnText, { color: textColor }]}>
              {member.name || member.email || 'Team member'}
            </Text>
          </Pressable>
        ))}
      </FormSheetModal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  headerActionBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  disabledAction: { opacity: 0.6 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  titleValue: { fontSize: 19, fontWeight: '700', marginBottom: 12 },
  detailList: { gap: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14, fontWeight: '600', maxWidth: '58%', textAlign: 'right' },
  sectionBlock: { marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  itemName: { flex: 1, fontSize: 14, marginRight: 8 },
  itemAmount: { fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 13, marginTop: 4 },
  activityRow: { paddingVertical: 10, borderBottomWidth: 1 },
  activityTitle: { fontSize: 14, fontWeight: '600' },
  activityMeta: { fontSize: 12, marginTop: 2 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 14, gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sheetBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 },
  sheetBtnText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priorityChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  priorityChipText: { fontSize: 13, fontWeight: '600' },
  saveBtn: {
    ...standaloneFullWidth,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

