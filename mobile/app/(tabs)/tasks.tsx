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
import { FORM_LABELS } from '@/constants/formLabels';
import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { matchesSearchQuery } from '@/utils/matchesSearchQuery';
import { flatListStyleForEmpty, listContentStyleWhenEmpty, showListFilters } from '@/utils/listEmptyLayout';
import { userWorkspaceService } from '@/services/userWorkspaceService';
import { useAuth } from '@/context/AuthContext';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FilterChipRow } from '@/components/FilterChip';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { refreshAfterTaskChange } from '@/utils/queryInvalidation';

const STATUS_FILTERS = ['all', 'todo', 'in_progress', 'on_hold', 'completed'] as const;

type TaskRow = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeId?: string | null;
  assignee?: { id?: string; name?: string };
};

type TaskMember = {
  id: string;
  name?: string;
  email?: string;
};

export default function TasksScreen() {
  const router = useRouter();
  const { user, activeTenantId, hasFeature } = useAuth();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg, onTint } = useScreenColors();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('all');
  /** Matches web Tasks.jsx: all | me | unassigned | member uuid */
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { searchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'tasks', placeholder: SEARCH_PLACEHOLDERS.TASKS });
  const debouncedSearch = useDebounce(searchValue, 400);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['user-workspace', 'tasks', activeTenantId],
    queryFn: async () => userWorkspaceService.getTasks(),
    enabled: !!activeTenantId && hasFeature('jobAutomation') && user?.isPlatformAdmin !== true,
  });

  const { data: membersResponse } = useQuery({
    queryKey: ['task-members', activeTenantId],
    queryFn: () => userWorkspaceService.getTaskMembers(),
    enabled: !!activeTenantId && hasFeature('jobAutomation') && user?.isPlatformAdmin !== true,
    staleTime: 5 * 60 * 1000,
  });

  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load tasks. Pull to refresh.'),
    [error]
  );

  const tasks: TaskRow[] = useMemo(() => {
    return parseApiListResponse(data);
  }, [data]);

  const members = useMemo(
    () => parseApiListResponse<TaskMember>(membersResponse),
    [membersResponse]
  );

  const filtered = useMemo(() => {
    let list = status === 'all' ? tasks : tasks.filter((t) => (t.status || 'todo') === status);
    // Same client-side assignee rules as Frontend/src/pages/Tasks.jsx
    if (assigneeFilter === 'me') {
      list = list.filter((task) => task.assigneeId === user?.id);
    } else if (assigneeFilter === 'unassigned') {
      list = list.filter((task) => !task.assigneeId);
    } else if (assigneeFilter !== 'all') {
      list = list.filter((task) => task.assigneeId === assigneeFilter);
    }
    if (!debouncedSearch.trim()) return list;
    return list.filter((task) =>
      matchesSearchQuery(debouncedSearch, [
        task.title,
        task.description,
        task.status,
        task.assignee?.name,
      ])
    );
  }, [tasks, status, assigneeFilter, debouncedSearch, user?.id]);

  const hasActiveFilter =
    status !== 'all' || assigneeFilter !== 'all' || !!debouncedSearch.trim();

  const createMutation = useMutation({
    mutationFn: () =>
      userWorkspaceService.createTask({
        title: title.trim(),
        description: description.trim() || '',
        status: 'todo',
        priority: 'medium',
        startDate: new Date().toISOString().slice(0, 10),
        dueDate: dueDate.trim() || null,
        isPrivate: false,
        assigneeId: user?.id || null,
      }),
    onSuccess: async () => {
      await refreshAfterTaskChange(queryClient);
      setAddOpen(false);
      setTitle('');
      setDescription('');
      setDueDate('');
    },
    onError: (err: unknown) => {
      Alert.alert('Could not create task', getApiErrorMessage(err, 'Try again'));
    },
  });

  const onRefresh = useCallback(() => refetch(), [refetch]);

  const filterOptions = useMemo(
    () =>
      STATUS_FILTERS.map((s) => ({
        value: s,
        label: s === 'all' ? 'All' : s.replace(/_/g, ' '),
      })),
    []
  );

  const assigneeFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All assignees' },
      { value: 'me', label: 'Me' },
      { value: 'unassigned', label: 'Unassigned' },
      ...members.map((m) => ({
        value: m.id,
        label: m.name || m.email || 'User',
      })),
    ],
    [members]
  );

  if (user?.isPlatformAdmin === true) {
    return <FeatureAccessDenied message="Tasks are not available for platform admin accounts." />;
  }
  if (!hasFeature('jobAutomation')) {
    return <FeatureAccessDenied message="Tasks are not enabled for this workspace." />;
  }

  const renderItem = ({ item }: { item: TaskRow }) => (
    <Pressable
      onPress={() => router.push(`/task/${item.id}` as never)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, borderColor },
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={styles.rowTop}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {item.title || 'Untitled task'}
        </Text>
        <View style={[styles.badge, { borderColor: colors.tint }]}>
          <Text style={[styles.badgeText, { color: colors.tint }]}>{(item.status || 'todo').replace(/_/g, ' ')}</Text>
        </View>
      </View>
      {item.dueDate ? (
        <Text style={[styles.meta, { color: mutedColor }]}>Due {String(item.dueDate).slice(0, 10)}</Text>
      ) : null}
      {item.assignee?.name ? (
        <Text style={[styles.meta, { color: mutedColor }]}>{item.assignee.name}</Text>
      ) : null}
    </Pressable>
  );

  return (
    <ScreenShell style={styles.container}>
      {!isLoading && !isError && tasks.length > 0 && (
        <ListActionButton
          label="Add Task"
          onPress={() => setAddOpen(true)}
          backgroundColor={colors.tint}
          contentColor={onTint}
        />
      )}

      {showListFilters(isLoading, isError, tasks.length, hasActiveFilter) && (
        <>
          <FilterChipRow options={filterOptions} value={status} onChange={setStatus} />
          <FilterChipRow
            options={assigneeFilterOptions}
            value={assigneeFilter}
            onChange={setAssigneeFilter}
          />
        </>
      )}

      {isLoading && !data ? (
        <ListLoadingState message="Loading tasks..." />
      ) : isError ? (
        <ListErrorState title="Failed to load tasks" message={loadErrorMessage} onRetry={refetch} />
      ) : (
        <FlatList
          style={flatListStyleForEmpty}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={listContentStyleWhenEmpty(styles.list, filtered.length === 0)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
          ListEmptyComponent={
            <ListEmptyState
              imageKey="TASKS"
              title={!hasActiveFilter ? 'No tasks yet' : 'No tasks in this filter'}
              subtitle={
                !hasActiveFilter
                  ? 'Create a task to track work in your workspace'
                  : 'Try another status or assignee'
              }
            >
              {!hasActiveFilter ? (
                <EmptyStateActionButton
                  label="Add Task"
                  onPress={() => setAddOpen(true)}
                  backgroundColor={colors.tint}
                  contentColor={onTint}
                />
              ) : null}
            </ListEmptyState>
          }
        />
      )}

      <FormSheetModal
        visible={addOpen}
        title={FORM_LABELS.task.addTitle}
        onClose={() => setAddOpen(false)}
        footer={
          <Pressable
            onPress={() => {
              if (!title.trim()) {
                Alert.alert('Task title is required');
                return;
              }
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={onTint} />
            ) : (
              <Text style={[styles.primaryTxt, { color: onTint }]}>{FORM_LABELS.task.create}</Text>
            )}
          </Pressable>
        }
      >
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.task.title}</Text>
        <TextInput
          placeholder="Call customer after meeting"
          placeholderTextColor={mutedColor}
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.task.description}</Text>
        <TextInput
          placeholder="What needs to be done?"
          placeholderTextColor={mutedColor}
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, { borderColor, color: textColor, minHeight: 80, textAlignVertical: 'top' }]}
        />
        <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.task.dueDate}</Text>
        <TextInput
          placeholder="YYYY-MM-DD"
          placeholderTextColor={mutedColor}
          value={dueDate}
          onChangeText={setDueDate}
          style={[styles.input, { borderColor, color: textColor, backgroundColor: inputBg }]}
        />
      </FormSheetModal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, paddingBottom: 32 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '600', flex: 1 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  meta: { marginTop: 6, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  primaryBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center' },
  primaryTxt: { fontWeight: '700' },
});
