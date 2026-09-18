import GoogleCalendarSettings from '../components/tasks/GoogleCalendarSettings';
import TaskCalendarFields from '../components/tasks/TaskCalendarFields';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import { shallowEqualObjects } from '../utils/formDirty';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  ExternalLink,
  Filter,
  MessageSquare,
  MoreVertical,
  Plus,
  X
} from 'lucide-react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';

import { useAuth } from '../context/AuthContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useShopOptional } from '../context/ShopContext';
import { useStudioLocationOptional } from '../context/StudioLocationContext';
import { useDebounce } from '../hooks/useDebounce';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import userWorkspaceService from '../services/userWorkspaceService';
import { resolveImageUrl } from '../utils/fileUtils';
import { showError, showSuccess } from '../utils/toast';
import WelcomeSection from '../components/WelcomeSection';
import StatusChip from '../components/StatusChip';
import TaskBoardCard from '../components/tasks/TaskBoardCard';
import TaskCalendarView from '../components/tasks/TaskCalendarView';
import {
  DEBOUNCE_DELAYS,
  PRIORITY_CHIP_CLASSES,
  SEARCH_PLACEHOLDERS,
  STATUS_CHIP_CLASSES,
  STATUS_CHIP_DEFAULT_CLASS,
  STUDIO_LIKE_TYPES
} from '../constants';
import { getSearchNoResultsEmptyStateProps } from '../utils/searchEmptyState';
import {
  SOURCE_LABEL,
  formatTaskDate,
  getChecklistProgress,
  getDueLabel,
  getDueState,
  getInitials,
  getTaskProvenance,
  getTaskSourceHref,
  groupTasks,
  normalizeTagInput,
  normalizeTaskChecklists,
  normalizeTaskTags,
  sortTasks
} from '../utils/taskHelpers';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { DatePicker } from '@/components/ui/date-picker';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const STATUS_OPTIONS = ['todo', 'in_progress', 'on_hold', 'completed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const SORT_STORAGE_KEY = 'abs.tasks.sortBy';
const GROUP_STORAGE_KEY = 'abs.tasks.groupBy';

const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed'
};

const getPriorityChipClass = (priority = 'medium') =>
  PRIORITY_CHIP_CLASSES[priority] || PRIORITY_CHIP_CLASSES.medium;

const getSourceChipClass = (source = 'manual') =>
  STATUS_CHIP_CLASSES[`task_source_${source}`] || STATUS_CHIP_CLASSES.task_source_manual || STATUS_CHIP_DEFAULT_CLASS;

const DUE_TEXT_CLASS = {
  overdue: 'text-destructive',
  today: 'text-amber-700',
  soon: 'text-amber-600',
  none: 'text-muted-foreground'
};

const readStoredPreference = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value || fallback;
  } catch {
    return fallback;
  }
};

const initialForm = {
  id: null,
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  startDate: '',
  dueDate: '',
  isPrivate: false,
  assigneeId: '',
  calendar: { enabled: false, reminderMinutes: 10 }
};

const Tasks = () => {
  const { user, activeTenant } = useAuth();
  const navigate = useNavigate();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const { activeShopId, activeStudioLocationId, isShopWorkspace, isStudioWorkspace, scopeReady } = useWorkspaceScope();
  const shopContext = useShopOptional();
  const studioLocationContext = useStudioLocationOptional();
  const debouncedSearchValue = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const queryClient = useQueryClient();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('assigned_to_me');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [privacyFilter, setPrivacyFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState(() => readStoredPreference(SORT_STORAGE_KEY, 'created_desc'));
  const [groupBy, setGroupBy] = useState(() => readStoredPreference(GROUP_STORAGE_KEY, 'none'));
  const [locationFilter, setLocationFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialForm);
  const [createFormBaseline, setCreateFormBaseline] = useState(initialForm);
  const [form, setForm] = useState(initialForm);
  const [detailsFormBaseline, setDetailsFormBaseline] = useState(initialForm);
  const [isDetailsEditing, setIsDetailsEditing] = useState(false);
  const [detailsTab, setDetailsTab] = useState('overview');
  const [highlightedTaskId, setHighlightedTaskId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [checklistDraft, setChecklistDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const taskCardRefs = useRef({});
  const businessType = activeTenant?.businessType || '';
  const isShopLike = isShopWorkspace || ['shop', 'pharmacy'].includes(businessType);
  const isStudioLike = STUDIO_LIKE_TYPES.includes(businessType);
  const locationFilterLabel = isShopLike
    ? 'Shop location'
    : isStudioLike || isStudioWorkspace
      ? 'Studio location'
      : 'Location';
  const locationOptions = useMemo(() => {
    if (isShopWorkspace) {
      return (shopContext?.shops || []).map((shop) => ({
        id: shop.id,
        name: shop.name || shop.code || 'Unnamed shop',
      }));
    }
    if (isStudioLike || isStudioWorkspace) {
      return (studioLocationContext?.locations || []).map((location) => ({
        id: location.id,
        name: location.name || location.code || 'Unnamed location',
      }));
    }
    return [];
  }, [isShopWorkspace, isStudioLike, isStudioWorkspace, shopContext?.shops, studioLocationContext?.locations]);
  const selectedLocationName = useMemo(() => {
    if (locationFilter === 'all') return 'All';
    return locationOptions.find((location) => location.id === locationFilter)?.name || 'Selected';
  }, [locationFilter, locationOptions]);
  const taskLocationQueryParams = useMemo(() => {
    if (locationFilter === 'all') {
      if (isShopWorkspace) return { shopId: 'all' };
      if (isStudioLike || isStudioWorkspace) return { studioLocationId: 'all' };
      return {};
    }
    if (isShopWorkspace) return { shopId: locationFilter };
    if (isStudioLike || isStudioWorkspace) return { studioLocationId: locationFilter };
    return {};
  }, [locationFilter, isShopWorkspace, isStudioLike, isStudioWorkspace]);
  const taskWriteLocationQueryParams = useMemo(() => {
    if (locationFilter !== 'all') return taskLocationQueryParams;
    if (isShopWorkspace && activeShopId) return { shopId: activeShopId };
    if ((isStudioLike || isStudioWorkspace) && activeStudioLocationId) {
      return { studioLocationId: activeStudioLocationId };
    }
    return {};
  }, [
    locationFilter,
    taskLocationQueryParams,
    isShopWorkspace,
    activeShopId,
    isStudioLike,
    isStudioWorkspace,
    activeStudioLocationId,
  ]);
  const taskListQueryKey = useMemo(
    () => ['user-workspace', 'tasks', activeShopId, activeStudioLocationId, isShopWorkspace, isStudioWorkspace, locationFilter],
    [activeShopId, activeStudioLocationId, isShopWorkspace, isStudioWorkspace, locationFilter]
  );

  useEffect(() => {
    if (locationFilter === 'all') return;
    if (!locationOptions.some((location) => location.id === locationFilter)) {
      setLocationFilter('all');
    }
  }, [locationFilter, locationOptions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      /* ignore */
    }
  }, [sortBy]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_STORAGE_KEY, groupBy);
    } catch {
      /* ignore */
    }
  }, [groupBy]);

  useEffect(() => {
    setPageSearchConfig({
      scope: 'tasks',
      placeholder: SEARCH_PLACEHOLDERS.TASKS,
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  const { data: tasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: taskListQueryKey,
    queryFn: async () => {
      const res = await userWorkspaceService.getTasks(taskLocationQueryParams);
      return Array.isArray(res?.data) ? res.data : [];
    },
    enabled: scopeReady,
  });

  const { data: membersData = [] } = useQuery({
    queryKey: ['user-workspace', 'task-members', activeStudioLocationId],
    queryFn: async () => {
      const res = await userWorkspaceService.getTaskMembers();
      return Array.isArray(res?.data) ? res.data : [];
    },
    enabled: scopeReady,
  });

  const { data: taskDetailResponse, isLoading: detailLoading } = useQuery({
    queryKey: ['user-workspace', 'task-detail', selectedTaskId, activeShopId, activeStudioLocationId, locationFilter],
    enabled: Boolean(selectedTaskId && openDetails && scopeReady),
    queryFn: () => userWorkspaceService.getTaskDetail(selectedTaskId, taskLocationQueryParams),
  });

  const { data: taskActivityResponse, isLoading: activityLoading } = useQuery({
    queryKey: ['user-workspace', 'task-activity', selectedTaskId, activeShopId, activeStudioLocationId, locationFilter],
    enabled: Boolean(selectedTaskId && openDetails && scopeReady),
    queryFn: () => userWorkspaceService.getTaskActivity(selectedTaskId, taskLocationQueryParams),
  });
  const { data: taskCommentsResponse, isLoading: commentsLoading } = useQuery({
    queryKey: ['user-workspace', 'task-comments', selectedTaskId, activeShopId, activeStudioLocationId, locationFilter],
    enabled: Boolean(selectedTaskId && openDetails && scopeReady),
    queryFn: () => userWorkspaceService.getTaskComments(selectedTaskId, taskLocationQueryParams),
  });

  const saveTaskMutation = useMutation({
    mutationFn: async (payload) => userWorkspaceService.updateTask(payload.id, payload, taskLocationQueryParams),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
      if (selectedTaskId) {
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-detail', selectedTaskId] });
      }
      setDetailsFormBaseline({ ...form });
      setIsDetailsEditing(false);
      showSuccess('Task saved');
    },
    onError: (err) => {
      showError(err?.response?.data?.message || 'Failed to save task');
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: async (payload) => userWorkspaceService.createTask(payload, taskWriteLocationQueryParams),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
      setOpenCreateModal(false);
      setCreateForm(initialForm);
      setCreateFormBaseline(initialForm);
      showSuccess('Task created');
    },
    onError: (err) => {
      showError(err?.response?.data?.message || 'Failed to create task');
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => userWorkspaceService.deleteTask(id, taskLocationQueryParams),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
      if (selectedTaskId) {
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-detail', selectedTaskId] });
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-activity', selectedTaskId] });
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-comments', selectedTaskId] });
      }
      setOpenDetails(false);
      setConfirmDeleteOpen(false);
      setSelectedTaskId(null);
      setCommentText('');
      showSuccess('Task deleted');
    },
    onError: (err) => {
      showError(err?.response?.data?.message || 'Failed to delete task');
    }
  });

  const quickStatusMutation = useMutation({
    mutationFn: ({ id, status }) => userWorkspaceService.updateTask(id, { status }, taskLocationQueryParams),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: taskListQueryKey });
      const previousTasks = queryClient.getQueryData(taskListQueryKey);
      queryClient.setQueryData(taskListQueryKey, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((task) => (task.id === id ? { ...task, status } : task));
      });
      return { previousTasks };
    },
    onError: (err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(taskListQueryKey, context.previousTasks);
      }
      showError(err?.response?.data?.message || 'Failed to update task status');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
    }
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ taskId, text }) => userWorkspaceService.addTaskComment(taskId, { text }, taskLocationQueryParams),
    onSuccess: () => {
      if (selectedTaskId) {
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-activity', selectedTaskId] });
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-comments', selectedTaskId] });
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-detail', selectedTaskId] });
        queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
      }
      setCommentText('');
      showSuccess('Comment added');
    },
    onError: (err) => {
      showError(err?.response?.data?.message || 'Failed to add comment');
    }
  });

  const buildTaskFormState = useCallback((task) => ({
    id: task.id,
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    startDate: task.startDate
      ? String(task.startDate).slice(0, 10)
      : (task.createdAt ? String(task.createdAt).slice(0, 10) : ''),
    dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
    isPrivate: task.isPrivate === true,
    assigneeId: task.assigneeId || '',
    calendar: task.metadata?.calendar || { enabled: false, reminderMinutes: 10 },
  }), []);

  const openCreate = useCallback(() => {
    const next = {
      ...initialForm,
      assigneeId: user?.id || '',
      startDate: new Date().toISOString().slice(0, 10),
    };
    setCreateForm(next);
    setCreateFormBaseline(next);
    setOpenCreateModal(true);
  }, [user?.id]);

  const openEdit = useCallback((task) => {
    const snapshot = buildTaskFormState(task);
    setForm(snapshot);
    setDetailsFormBaseline(snapshot);
    setSelectedTaskId(task.id);
    setIsDetailsEditing(true);
    setDetailsTab('overview');
    setOpenDetails(true);
  }, [buildTaskFormState]);

  const openTaskDetails = useCallback((taskId) => {
    setSelectedTaskId(taskId);
    const task = tasksData.find((t) => t.id === taskId);
    if (task) {
      const snapshot = buildTaskFormState(task);
      setForm(snapshot);
      setDetailsFormBaseline(snapshot);
    } else {
      setForm(initialForm);
      setDetailsFormBaseline(initialForm);
    }
    setIsDetailsEditing(false);
    setDetailsTab('overview');
    setOpenDetails(true);
  }, [tasksData, buildTaskFormState]);

  const closeCreateModal = useCallback(() => {
    setOpenCreateModal(false);
    setCreateForm(initialForm);
    setCreateFormBaseline(initialForm);
  }, []);

  const closeDetailsSheet = useCallback(() => {
    setOpenDetails(false);
    setSelectedTaskId(null);
    setCommentText('');
    setIsDetailsEditing(false);
    setDetailsTab('overview');
  }, []);

  const isCreateFormDirty = useMemo(
    () => !shallowEqualObjects(createForm, createFormBaseline),
    [createForm, createFormBaseline]
  );

  const isDetailsFormDirty = useMemo(
    () => isDetailsEditing && !shallowEqualObjects(form, detailsFormBaseline),
    [isDetailsEditing, form, detailsFormBaseline]
  );

  const createGuard = useUnsavedChangesGuard({
    isDirty: isCreateFormDirty,
    onClose: closeCreateModal,
  });

  const detailsSheetGuard = useUnsavedChangesGuard({
    isDirty: isDetailsFormDirty,
    onClose: closeDetailsSheet,
  });

  const exitDetailsEditing = useCallback(() => {
    setForm({ ...detailsFormBaseline });
    setIsDetailsEditing(false);
  }, [detailsFormBaseline]);

  const editModeGuard = useUnsavedChangesGuard({
    isDirty: isDetailsFormDirty,
    onClose: exitDetailsEditing,
  });

  const startDetailsEditing = useCallback(() => {
    setDetailsFormBaseline({ ...form });
    setIsDetailsEditing(true);
  }, [form]);

  const handleToggleDetailsEdit = useCallback(() => {
    if (isDetailsEditing) {
      editModeGuard.requestClose();
      return;
    }
    startDetailsEditing();
  }, [isDetailsEditing, editModeGuard, startDetailsEditing]);

  const filteredTasks = useMemo(() => {
    const q = debouncedSearchValue.trim().toLowerCase();
    return tasksData.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (scopeFilter === 'assigned_to_me' && task.assigneeId !== user?.id) return false;
      if (scopeFilter === 'created_by_me' && task.userId !== user?.id) return false;
      if (scopeFilter === 'automated_only' && !task.sourceType) return false;
      if (scopeFilter === 'manual_only' && task.sourceType) return false;
      if (priorityFilter !== 'all' && (task.priority || 'medium') !== priorityFilter) return false;
      if (sourceFilter === 'manual' && task.sourceType) return false;
      if (sourceFilter === 'automated' && !task.sourceType) return false;
      if (['lead', 'invoice', 'quote', 'stock'].includes(sourceFilter) && task.sourceType !== sourceFilter) return false;
      if (assigneeFilter === 'me' && task.assigneeId !== user?.id) return false;
      if (assigneeFilter === 'unassigned' && task.assigneeId) return false;
      if (!['all', 'me', 'unassigned'].includes(assigneeFilter) && task.assigneeId !== assigneeFilter) return false;
      if (privacyFilter === 'private' && task.isPrivate !== true) return false;
      if (privacyFilter === 'public' && task.isPrivate === true) return false;
      if (tagFilter !== 'all') {
        const tags = normalizeTaskTags(task);
        if (!tags.includes(tagFilter)) return false;
      }
      if (overdueOnly && getDueState(task) !== 'overdue') return false;
      if (!q) return true;
      return (
        String(task.title || '').toLowerCase().includes(q) ||
        String(task.description || '').toLowerCase().includes(q) ||
        String(task.assignee?.name || '').toLowerCase().includes(q) ||
        normalizeTaskTags(task).some((tag) => tag.includes(q))
      );
    });
  }, [
    tasksData,
    debouncedSearchValue,
    statusFilter,
    scopeFilter,
    priorityFilter,
    sourceFilter,
    assigneeFilter,
    privacyFilter,
    tagFilter,
    overdueOnly,
    user?.id
  ]);

  const sortedTasks = useMemo(() => sortTasks(filteredTasks, sortBy), [filteredTasks, sortBy]);

  const groupedListSections = useMemo(
    () => groupTasks(sortedTasks, viewMode === 'list' ? groupBy : 'none'),
    [sortedTasks, groupBy, viewMode]
  );

  const availableTags = useMemo(() => {
    const set = new Set();
    tasksData.forEach((task) => normalizeTaskTags(task).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasksData]);

  const tasksByStatus = useMemo(() => {
    return STATUS_OPTIONS.reduce((acc, status) => {
      acc[status] = sortTasks(
        filteredTasks.filter((t) => t.status === status),
        sortBy
      );
      return acc;
    }, {});
  }, [filteredTasks, sortBy]);

  const dueTodayTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredTasks.filter((task) => {
      if (!task?.dueDate) return false;
      return String(task.dueDate).slice(0, 10) === today;
    });
  }, [filteredTasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredTasks.filter((task) => {
      if (!task?.dueDate) return false;
      const due = String(task.dueDate).slice(0, 10);
      if (due >= today) return false;
      return task.status !== 'completed';
    });
  }, [filteredTasks]);

  const onSubmit = useCallback(() => {
    const title = form.title.trim();
    if (!title) {
      showError('Task title is required');
      return;
    }
    if (!form.id) return;
    saveTaskMutation.mutate({
      id: form.id,
      title,
      description: form.description?.trim() || '',
      status: form.status || 'todo',
      priority: form.priority || 'medium',
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      calendar: form.calendar,
      isPrivate: form.isPrivate === true,
      assigneeId: form.assigneeId || null
    });
  }, [form, saveTaskMutation]);

  const onCreateSubmit = useCallback(() => {
    const title = createForm.title.trim();
    if (!title) {
      showError('Task title is required');
      return;
    }
    createTaskMutation.mutate({
      title,
      description: createForm.description?.trim() || '',
      status: createForm.status || 'todo',
      priority: createForm.priority || 'medium',
      startDate: createForm.startDate || new Date().toISOString().slice(0, 10),
      dueDate: createForm.dueDate || null,
      calendar: createForm.calendar,
      isPrivate: createForm.isPrivate === true,
      assigneeId: createForm.assigneeId || null
    });
  }, [createForm, createTaskMutation]);

  const taskDetail = taskDetailResponse?.data || null;
  useEffect(() => {
    if (taskDetail?.id === selectedTaskId && !isDetailsEditing) {
      const snapshot = buildTaskFormState(taskDetail);
      setForm(snapshot);
      setDetailsFormBaseline(snapshot);
    }
  }, [taskDetail, selectedTaskId, isDetailsEditing, buildTaskFormState]);
  const taskActivity = Array.isArray(taskActivityResponse?.data) ? taskActivityResponse.data : [];
  const taskComments = Array.isArray(taskCommentsResponse?.data) ? taskCommentsResponse.data : [];
  const selectedAssignee = membersData.find((m) => m.id === form.assigneeId) || taskDetail?.assignee || null;
  const selectedAssigneeName = selectedAssignee?.name || 'Unassigned';
  const selectedAssigneeImage = resolveImageUrl(selectedAssignee?.profilePicture || '') || undefined;
  const detailSourceHref = getTaskSourceHref(taskDetail || filteredTasks.find((t) => t.id === selectedTaskId));
  const detailProvenance = getTaskProvenance(taskDetail || filteredTasks.find((t) => t.id === selectedTaskId));
  const detailChecklists = normalizeTaskChecklists(taskDetail);
  const detailTags = normalizeTaskTags(taskDetail);

  const persistTaskMetadata = useCallback(
    async ({ checklists, tags }) => {
      if (!selectedTaskId) return;
      await userWorkspaceService.updateTask(
        selectedTaskId,
        {
          ...(checklists !== undefined ? { checklists } : {}),
          ...(tags !== undefined ? { tags } : {}),
        },
        taskLocationQueryParams
      );
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-detail', selectedTaskId] });
      queryClient.invalidateQueries({ queryKey: ['user-workspace', 'task-activity', selectedTaskId] });
    },
    [selectedTaskId, taskLocationQueryParams, queryClient]
  );

  const handleToggleChecklistItem = useCallback(
    async (itemId, done) => {
      const next = detailChecklists.map((item) =>
        item.id === itemId ? { ...item, done } : item
      );
      try {
        await persistTaskMetadata({ checklists: next });
      } catch (err) {
        showError(err?.response?.data?.message || 'Failed to update checklist');
      }
    },
    [detailChecklists, persistTaskMetadata]
  );

  const handleAddChecklistItem = useCallback(async () => {
    const text = checklistDraft.trim();
    if (!text) return;
    if (detailChecklists.length >= 50) {
      showError('Checklist is limited to 50 items');
      return;
    }
    const next = [
      ...detailChecklists,
      {
        id: `cl_${Date.now()}`,
        text,
        done: false,
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      await persistTaskMetadata({ checklists: next });
      setChecklistDraft('');
      showSuccess('Checklist item added');
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to add checklist item');
    }
  }, [checklistDraft, detailChecklists, persistTaskMetadata]);

  const handleRemoveChecklistItem = useCallback(
    async (itemId) => {
      const next = detailChecklists.filter((item) => item.id !== itemId);
      try {
        await persistTaskMetadata({ checklists: next });
      } catch (err) {
        showError(err?.response?.data?.message || 'Failed to remove checklist item');
      }
    },
    [detailChecklists, persistTaskMetadata]
  );

  const handleAddTag = useCallback(async () => {
    const tag = normalizeTagInput(tagDraft);
    if (!tag) return;
    if (detailTags.includes(tag)) {
      setTagDraft('');
      return;
    }
    if (detailTags.length >= 5) {
      showError('Maximum 5 tags per task');
      return;
    }
    try {
      await persistTaskMetadata({ tags: [...detailTags, tag] });
      setTagDraft('');
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to add tag');
    }
  }, [tagDraft, detailTags, persistTaskMetadata]);

  const handleRemoveTag = useCallback(
    async (tag) => {
      try {
        await persistTaskMetadata({ tags: detailTags.filter((item) => item !== tag) });
      } catch (err) {
        showError(err?.response?.data?.message || 'Failed to remove tag');
      }
    },
    [detailTags, persistTaskMetadata]
  );
  const activityItems = useMemo(() => {
    const normalizeText = (value) => String(value || '').trim().toLowerCase();
    const activity = taskActivity.map((entry) => ({
      id: entry.id,
      type: entry.type || 'activity',
      createdAt: entry.createdAt,
      userName: entry.userName || 'User',
      summary: entry.summary || 'Activity updated',
      source: 'activity'
    }));
    const activityCommentTextSet = new Set(
      activity
        .filter((entry) => entry.type === 'comment')
        .map((entry) => normalizeText(String(entry.summary || '').replace(/^Commented:\s*/i, '')))
        .filter(Boolean)
    );
    const legacyComments = taskComments
      .filter((comment) => !activityCommentTextSet.has(normalizeText(comment.text || comment.comment || comment.content || '')))
      .map((comment) => ({
      id: `legacy-comment-${comment.id}`,
      type: 'comment',
      createdAt: comment.createdAt,
      userName: comment.userName || comment.userEmail || 'User',
      summary: 'Commented',
      body: comment.text || comment.comment || comment.content || '',
      source: 'comment'
      }));
    const hasCreatedEvent = activity.some((entry) => entry.type === 'created');
    const createdByName = taskDetail?.user?.name || taskDetail?.user?.email || 'User';
    const createdAt = taskDetail?.createdAt || null;
    const createdEvent =
      !hasCreatedEvent && createdAt
        ? [
            {
              id: `synthetic-created-${taskDetail?.id || 'task'}`,
              type: 'created',
              createdAt,
              userName: createdByName,
              summary: 'Task created',
              source: 'system'
            }
          ]
        : [];
    return [...createdEvent, ...activity, ...legacyComments]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [taskActivity, taskComments, taskDetail]);
  const hasActivity = activityItems.length > 0;

  const calendarDeepLinkOpened = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('taskId');
    if (id && scopeReady && !calendarDeepLinkOpened.current) {
      calendarDeepLinkOpened.current = true;
      openTaskDetails(id);
    }
  }, [scopeReady, openTaskDetails]);

  const jumpToTask = useCallback((taskId) => {
    const el = taskCardRefs.current?.[taskId];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedTaskId(taskId);
      window.setTimeout(() => setHighlightedTaskId((prev) => (prev === taskId ? null : prev)), 1800);
    }
  }, []);

  const handleDragEnd = useCallback(
    (result) => {
      const { destination, source, draggableId } = result || {};
      if (!destination) return;
      if (destination.droppableId === source.droppableId) return;
      const task = filteredTasks.find((t) => t.id === draggableId);
      if (!task) return;
      const nextStatus = destination.droppableId;
      if (!STATUS_OPTIONS.includes(nextStatus)) return;
      quickStatusMutation.mutate({ id: task.id, status: nextStatus });
    },
    [filteredTasks, quickStatusMutation]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Google Calendar integration</summary><div className="mt-3"><GoogleCalendarSettings /></div></details>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <WelcomeSection
          welcomeMessage="Tasks"
          subText="Track meetings, follow-ups, due work, and automated tasks in one place."
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              onClick={() => setViewMode('kanban')}
            >
              Kanban
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              onClick={() => setViewMode('calendar')}
            >
              Calendar
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            size="icon"
            className="sm:w-auto sm:px-3 sm:gap-2"
            aria-label="Open task filters"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New task
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-3 sm:pt-6 px-2.5 sm:px-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Status: {statusFilter === 'all' ? 'All' : STATUS_LABELS[statusFilter]}</Badge>
            <Badge variant="outline">
              Scope:{' '}
              {scopeFilter === 'all'
                ? 'All'
                : scopeFilter === 'assigned_to_me'
                  ? 'Assigned to me'
                  : scopeFilter === 'created_by_me'
                    ? 'Created by me'
                    : scopeFilter === 'automated_only'
                      ? 'Automated'
                      : 'Manual'}
            </Badge>
            <Badge variant="outline">Priority: {priorityFilter === 'all' ? 'All' : priorityFilter}</Badge>
            <Badge variant="outline">{locationFilterLabel}: {selectedLocationName}</Badge>
            {tagFilter !== 'all' ? <Badge variant="outline">Tag: {tagFilter}</Badge> : null}
            <Badge variant="outline">
              Results: {filteredTasks.length}/{tasksData.length}
            </Badge>
            {overdueTasks.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant={overdueOnly ? 'default' : 'outline'}
                className="h-7"
                onClick={() => setOverdueOnly((prev) => !prev)}
              >
                Overdue ({overdueTasks.length})
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Newest</SelectItem>
                <SelectItem value="created_asc">Oldest</SelectItem>
                <SelectItem value="due_asc">Due soonest</SelectItem>
                <SelectItem value="due_desc">Due latest</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>
            {viewMode === 'list' ? (
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  <SelectItem value="assignee">Assignee</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="source">Source</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-1.5 sm:gap-3">
        {tasksLoading ? (
          <Card>
            <CardContent className="pt-3 sm:pt-6 px-2.5 sm:px-6 text-sm text-muted-foreground">Loading tasks...</CardContent>
          </Card>
        ) : filteredTasks.length === 0 && viewMode !== 'calendar' ? (
          <Card>
            <CardContent className="pt-3 sm:pt-6 px-2.5 sm:px-6">
              {debouncedSearchValue.trim() ? (
                <EmptyState
                  {...getSearchNoResultsEmptyStateProps(debouncedSearchValue, () => setSearchValue(''))}
                  size="sm"
                  className="py-4"
                />
              ) : (
                <p className="text-sm text-muted-foreground">No tasks match your filters.</p>
              )}
            </CardContent>
          </Card>
        ) : viewMode === 'calendar' ? (
          <TaskCalendarView
            tasks={sortedTasks}
            monthDate={calendarMonth}
            onMonthChange={setCalendarMonth}
            onSelectTask={openTaskDetails}
            onSelectDay={(dateKey) => {
              const next = {
                ...initialForm,
                assigneeId: user?.id || '',
                startDate: new Date().toISOString().slice(0, 10),
                dueDate: dateKey,
              };
              setCreateForm(next);
              setCreateFormBaseline(next);
              setOpenCreateModal(true);
            }}
          />
        ) : viewMode === 'list' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-4 sm:space-y-5">
              {groupedListSections.map((section) => (
                <div key={section.key} className="space-y-2 sm:space-y-3">
                  {groupBy !== 'none' ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.label} ({section.tasks.length})
                    </p>
                  ) : null}
                  {section.tasks.map((task) => {
                    const dueState = getDueState(task);
                    const progress = getChecklistProgress(task);
                    const sourceHref = getTaskSourceHref(task);
                    const tags = normalizeTaskTags(task);
                    const assigneeName = task.assignee?.name || 'Unassigned';
                    const avatarUrl = resolveImageUrl(task.assignee?.profilePicture || '') || undefined;
                    return (
                      <Card
                        key={task.id}
                        ref={(node) => {
                          if (node) {
                            taskCardRefs.current[task.id] = node;
                          } else {
                            delete taskCardRefs.current[task.id];
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => openTaskDetails(task.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTaskDetails(task.id);
                          }
                        }}
                        className={`cursor-pointer hover:bg-muted/30 ${
                          highlightedTaskId === task.id ? 'ring-2 ring-primary/40 border-primary/40 transition-colors' : ''
                        }`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base">{task.title}</CardTitle>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <Avatar className="h-6 w-6" title={assigneeName}>
                                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={assigneeName} /> : null}
                                  <AvatarFallback className="text-[10px]">{getInitials(assigneeName)}</AvatarFallback>
                                </Avatar>
                                <span className={DUE_TEXT_CLASS[dueState] || DUE_TEXT_CLASS.none}>
                                  {getDueLabel(task)}
                                </span>
                                {progress ? (
                                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                                    <CheckSquare className="h-3 w-3" />
                                    {progress.done}/{progress.total}
                                  </span>
                                ) : null}
                                {task.sourceType ? (
                                  sourceHref ? (
                                    <Link
                                      to={sourceHref}
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex"
                                    >
                                      <Badge variant="outline" className={`hover:underline ${getSourceChipClass(task.sourceType)}`}>
                                        {SOURCE_LABEL[task.sourceType] || task.sourceType}
                                      </Badge>
                                    </Link>
                                  ) : (
                                    <Badge variant="outline" className={getSourceChipClass(task.sourceType)}>
                                      {SOURCE_LABEL[task.sourceType] || task.sourceType}
                                    </Badge>
                                  )
                                ) : (
                                  <Badge variant="outline" className={getSourceChipClass('manual')}>
                                    Manual
                                  </Badge>
                                )}
                                {task.isPrivate && <Badge variant="outline">Private</Badge>}
                                <Badge variant="outline" className={getPriorityChipClass(task.priority || 'medium')}>
                                  {String(task.priority || 'medium').toUpperCase()}
                                </Badge>
                                {tags.map((tag) => (
                                  <Badge key={tag} variant="secondary">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <StatusChip status={task.status} />
                          </div>
                        </CardHeader>
                        {task.description ? (
                          <CardContent className="pt-0">
                            <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                          </CardContent>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="hidden lg:block lg:col-span-1 min-w-0">
              <Card className="h-full min-h-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Task timeline</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 min-w-0 overflow-hidden">
                  {dueTodayTasks.length === 0 && overdueTasks.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No due-today or overdue tasks
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5 min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Due today ({dueTodayTasks.length})
                        </p>
                        {dueTodayTasks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No tasks due today</p>
                        ) : (
                          <div className="flex flex-col gap-3 min-w-0">
                            {dueTodayTasks.map((task) => (
                              <button
                                type="button"
                                key={`due-${task.id}`}
                                className="w-full text-left flex items-start justify-between gap-2 min-w-0 rounded-md hover:bg-muted/40 p-1 transition-colors"
                                onClick={() => jumpToTask(task.id)}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {task.assignee?.name || 'Unassigned'}
                                  </p>
                                </div>
                                <Badge variant="outline" className="capitalize shrink-0">
                                  {STATUS_LABELS[task.status] || task.status}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Overdue ({overdueTasks.length})
                        </p>
                        {overdueTasks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No overdue tasks</p>
                        ) : (
                          <div className="flex flex-col gap-3 min-w-0">
                            {overdueTasks.map((task) => (
                              <button
                                type="button"
                                key={`overdue-${task.id}`}
                                className="w-full text-left flex items-start justify-between gap-2 min-w-0 rounded-md hover:bg-muted/40 p-1 transition-colors"
                                onClick={() => jumpToTask(task.id)}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    Due {formatTaskDate(task.dueDate)} • {task.assignee?.name || 'Unassigned'}
                                  </p>
                                </div>
                                <Badge variant="destructive" className="capitalize shrink-0">
                                  Overdue
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 h-[calc(100vh-16rem)] min-h-[420px]">
              {STATUS_OPTIONS.map((statusKey) => (
                <Card key={statusKey} className="flex h-full min-h-0 flex-col overflow-hidden">
                  <CardHeader className="shrink-0 pb-1.5 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                    <CardTitle className="text-sm">
                      {STATUS_LABELS[statusKey]} ({tasksByStatus[statusKey]?.length || 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col px-3 sm:px-6 pb-3 sm:pb-6">
                    <Droppable droppableId={statusKey}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md p-1 ${
                            snapshot.isDraggingOver ? 'bg-muted/60' : ''
                          }`}
                        >
                          {(tasksByStatus[statusKey] || []).map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={dragSnapshot.isDragging ? 'ring-2 ring-primary/30 rounded-md' : ''}
                                >
                                  <TaskBoardCard
                                    task={task}
                                    onOpen={openTaskDetails}
                                    dragHandleProps={dragProvided.dragHandleProps}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {(tasksByStatus[statusKey] || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No tasks</p>
                          ) : null}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      <Dialog
        open={openCreateModal}
        onOpenChange={(open) => {
          if (open) {
            setOpenCreateModal(true);
            return;
          }
          createGuard.requestClose();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="task-title-create">Title</Label>
                <Input
                  id="task-title-create"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Call customer after meeting"
                />
              </div>
              <TaskCalendarFields value={createForm.calendar} onChange={calendar => setCreateForm(p => ({ ...p, calendar }))} />
              <div className="md:col-span-2">
                <Label htmlFor="task-description-create">Description (optional)</Label>
                <Textarea
                  id="task-description-create"
                  rows={4}
                  value={createForm.description}
                  onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(v) => setCreateForm((p) => ({ ...p, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={createForm.priority || 'medium'}
                  onValueChange={(v) => setCreateForm((p) => ({ ...p, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <DatePicker
                    date={createForm.startDate ? new Date(createForm.startDate) : undefined}
                    onDateChange={(d) =>
                      setCreateForm((p) => ({
                        ...p,
                        startDate: d ? d.toISOString().slice(0, 10) : ''
                      }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Due date</Label>
                  <DatePicker
                    date={createForm.dueDate ? new Date(createForm.dueDate) : undefined}
                    onDateChange={(d) =>
                      setCreateForm((p) => ({
                        ...p,
                        dueDate: d ? d.toISOString().slice(0, 10) : ''
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Assignee</Label>
                  <Select
                    value={createForm.assigneeId || 'unassigned'}
                    onValueChange={(v) => setCreateForm((p) => ({ ...p, assigneeId: v === 'unassigned' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {membersData.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Visibility</Label>
                  <Select
                    value={createForm.isPrivate ? 'private' : 'public'}
                    onValueChange={(v) => setCreateForm((p) => ({ ...p, isPrivate: v === 'private' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={createGuard.requestClose}>
              Cancel
            </Button>
            <Button onClick={onCreateSubmit} disabled={createTaskMutation.isPending}>
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog {...createGuard.dialogProps} />

      <Sheet
        open={openDetails}
        onOpenChange={(open) => {
          if (open) {
            setOpenDetails(true);
            return;
          }
          detailsSheetGuard.requestClose();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-3xl h-full sm:h-[calc(100%-2rem)] flex flex-col sm:rounded-xl sm:mt-4 sm:mb-4 sm:mr-4 px-3 sm:px-6">
          <SheetHeader>
            <SheetTitle>Task details</SheetTitle>
          </SheetHeader>
          <div className="mt-3 sm:mt-4 flex-1 overflow-y-auto pr-0 sm:pr-1">
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading task...</p>
            ) : !taskDetail && form.id ? (
              <p className="text-sm text-muted-foreground">Task not found.</p>
            ) : (
              <Tabs value={detailsTab} onValueChange={setDetailsTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activities">Activities</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3">
                  {isDetailsEditing ? (
                    <div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Label htmlFor="task-title-inline">Title</Label>
                          <Input
                            id="task-title-inline"
                            value={form.title}
                            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                            placeholder="Call customer after meeting"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="task-description-inline">Description (optional)</Label>
                          <Textarea
                            id="task-description-inline"
                            rows={4}
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            value={form.status}
                            onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Priority</Label>
                          <Select
                            value={form.priority || 'medium'}
                            onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIORITY_OPTIONS.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <TaskCalendarFields value={form.calendar} onChange={calendar => setForm(p => ({ ...p, calendar }))} />
                        <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <Label>Start date</Label>
                            <DatePicker
                              date={form.startDate ? new Date(form.startDate) : undefined}
                              onDateChange={(d) =>
                                setForm((p) => ({
                                  ...p,
                                  startDate: d ? d.toISOString().slice(0, 10) : ''
                                }))
                              }
                              className="w-full"
                            />
                          </div>
                          <div>
                            <Label>Due date</Label>
                            <DatePicker
                              date={form.dueDate ? new Date(form.dueDate) : undefined}
                              onDateChange={(d) =>
                                setForm((p) => ({
                                  ...p,
                                  dueDate: d ? d.toISOString().slice(0, 10) : ''
                                }))
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <Label>Assignee</Label>
                            <Select
                              value={form.assigneeId || 'unassigned'}
                              onValueChange={(v) => setForm((p) => ({ ...p, assigneeId: v === 'unassigned' ? '' : v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {membersData.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Visibility</Label>
                            <Select
                              value={form.isPrivate ? 'private' : 'public'}
                              onValueChange={(v) => setForm((p) => ({ ...p, isPrivate: v === 'private' }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Visibility" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="public">Public</SelectItem>
                                <SelectItem value="private">Private</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-border p-3 sm:p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                          {form.description || taskDetail?.description || 'No description'}
                        </p>
                      </div>
                      <div className="space-y-2 rounded-md border border-border p-2.5 sm:p-3">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm text-muted-foreground">Title</p>
                          <p className="text-sm font-medium text-foreground text-right">{form.title || taskDetail?.title || '-'}</p>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm text-muted-foreground">Status</p>
                          <StatusChip status={form.status} />
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm text-muted-foreground">Priority</p>
                          <Badge variant="outline" className={getPriorityChipClass(form.priority || 'medium')}>
                            {String(form.priority || 'medium').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-4">
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm text-muted-foreground">Start date</p>
                            <Badge variant="outline">
                              {formatTaskDate(form.startDate || taskDetail?.startDate || taskDetail?.createdAt)}
                            </Badge>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm text-muted-foreground">Due date</p>
                            <Badge variant="outline">
                              {formatTaskDate(form.dueDate || taskDetail?.dueDate)}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-4">
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm text-muted-foreground">Assignee</p>
                            <Badge variant="outline" className="gap-1.5">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={selectedAssigneeImage} alt={selectedAssigneeName} />
                                <AvatarFallback className="text-[10px]">{getInitials(selectedAssigneeName)}</AvatarFallback>
                              </Avatar>
                              <span>{selectedAssigneeName}</span>
                            </Badge>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm text-muted-foreground">Visibility</p>
                            <p className="text-sm text-foreground text-right">
                              {form.isPrivate ? 'Private' : 'Public'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {detailProvenance ? (
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Why this task exists</p>
                      <p className="mt-1 text-sm text-foreground">{detailProvenance}</p>
                    </div>
                  ) : null}
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Checklist</p>
                      {detailChecklists.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {detailChecklists.filter((item) => item.done).length}/{detailChecklists.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {detailChecklists.map((item) => (
                        <div key={item.id} className="flex items-start gap-2">
                          <Checkbox
                            checked={item.done}
                            onCheckedChange={(checked) => handleToggleChecklistItem(item.id, Boolean(checked))}
                            className="mt-0.5"
                          />
                          <p className={`flex-1 text-sm ${item.done ? 'text-muted-foreground line-through' : ''}`}>
                            {item.text}
                          </p>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleRemoveChecklistItem(item.id)}
                            aria-label="Remove checklist item"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={checklistDraft}
                        onChange={(e) => setChecklistDraft(e.target.value)}
                        placeholder="Add checklist item"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddChecklistItem();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddChecklistItem}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-sm font-medium">Tags (optional)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button
                            type="button"
                            className="ml-0.5"
                            onClick={() => handleRemoveTag(tag)}
                            aria-label={`Remove ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {detailTags.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tags yet</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        placeholder="Add tag"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddTag}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-comment">Add comment</Label>
                    <Textarea
                      id="task-comment"
                      rows={3}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write an update, question, or note..."
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const text = commentText.trim();
                          if (!text || !selectedTaskId) return;
                          addCommentMutation.mutate({ taskId: selectedTaskId, text });
                        }}
                        disabled={addCommentMutation.isPending || !commentText.trim()}
                        className="gap-2 w-full sm:w-auto"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Add comment
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="activities" className="mt-3 sm:mt-4">
                  {activityLoading || commentsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading activity...</p>
                  ) : !hasActivity ? (
                    <p className="text-sm text-muted-foreground">No activities yet.</p>
                  ) : (
                    <div className="max-h-[460px] overflow-y-auto pr-0 sm:pr-1">
                      <ol className="relative border-l-2 border-muted-foreground/30 pl-6 space-y-4">
                        {activityItems.map((entry) => {
                          const toneClass =
                            entry.type === 'comment'
                              ? 'bg-blue-500'
                              : entry.type === 'created'
                                ? 'bg-green-500'
                                : 'bg-muted-foreground';
                          return (
                            <li key={entry.id} className="relative">
                              <span className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background ${toneClass}`} />
                              <div className="rounded-md border border-border p-2.5 sm:p-3">
                                <p className="text-xs text-muted-foreground">
                                  {entry.userName || 'User'} • {formatTaskDate(entry.createdAt)}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                                  {entry.summary || 'Activity updated'}
                                </p>
                                {entry.body ? (
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                                    {entry.body}
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                  <div className="mt-3 sm:mt-4 space-y-2">
                    <Label htmlFor="task-comment-activities">Add comment</Label>
                    <Textarea
                      id="task-comment-activities"
                      rows={3}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write an update, question, or note..."
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const text = commentText.trim();
                          if (!text || !selectedTaskId) return;
                          addCommentMutation.mutate({ taskId: selectedTaskId, text });
                        }}
                        disabled={addCommentMutation.isPending || !commentText.trim()}
                        className="gap-2 w-full sm:w-auto"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Add comment
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-end gap-2 border-t border-border pt-3 sm:pt-4 mt-auto bg-background">
            {form.id ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleToggleDetailsEdit}>
                    {isDetailsEditing ? 'Cancel edit' : 'Edit details'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    Delete task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {detailSourceHref ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => navigate(detailSourceHref)}
              >
                <ExternalLink className="h-4 w-4" />
                Open source
              </Button>
            ) : null}
            <Button onClick={onSubmit} disabled={saveTaskMutation.isPending || !isDetailsEditing}>
              Update task
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <UnsavedChangesDialog {...detailsSheetGuard.dialogProps} />
      <UnsavedChangesDialog {...editModeGuard.dialogProps} />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The task and its comments will be permanently removed. Its linked calendar event will be removed on the next successful sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (form.id) {
                  deleteTaskMutation.mutate(form.id);
                }
              }}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Task Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tasks</SelectItem>
                  <SelectItem value="assigned_to_me">Assigned to me</SelectItem>
                  <SelectItem value="created_by_me">Created by me</SelectItem>
                  <SelectItem value="automated_only">Automated only</SelectItem>
                  <SelectItem value="manual_only">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Task source</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automated">Automated</SelectItem>
                  <SelectItem value="lead">Lead follow-up</SelectItem>
                  <SelectItem value="invoice">Invoice collection</SelectItem>
                  <SelectItem value="quote">Quote follow-up</SelectItem>
                  <SelectItem value="stock">Restock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {membersData.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{locationFilterLabel}</Label>
              <Select value={locationFilter} onValueChange={setLocationFilter} disabled={locationOptions.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={locationFilterLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locationOptions.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tag</Label>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Privacy</Label>
              <Select value={privacyFilter} onValueChange={setPrivacyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Privacy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter('all');
                  setScopeFilter('assigned_to_me');
                  setPriorityFilter('all');
                  setSourceFilter('all');
                  setAssigneeFilter('all');
                  setPrivacyFilter('all');
                  setTagFilter('all');
                  setOverdueOnly(false);
                  setLocationFilter('all');
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
};

export default Tasks;
