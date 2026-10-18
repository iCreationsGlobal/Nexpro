import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import WelcomeSection from '../components/WelcomeSection';
import DashboardStatsCard from '../components/DashboardStatsCard';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import {
  Plus,
  RefreshCw,
  Phone,
  Mail,
  Users,
  UserCog,
  MessageSquare,
  UserPlus,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingUp,
  Filter,
  X,
  MoreVertical,
  Edit,
  Archive,
  Upload,
} from 'lucide-react';
import dayjs from 'dayjs';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import ActionColumn from '../components/ActionColumn';
import PhoneNumberInput from '../components/PhoneNumberInput';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DetailSkeleton from '../components/DetailSkeleton';
import ImportContactsDialog from '../components/ImportContactsDialog';
import leadService from '../services/leadService';
import userService from '../services/userService';
import customDropdownService from '../services/customDropdownService';
import { useAuth } from '../context/AuthContext';
import { useStudioLocationOptional } from '../context/StudioLocationContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { useSmartSearch } from '../context/SmartSearchContext';
import { showSuccess, showError, showWarning } from '../utils/toast';
import {
  OTHER_DROPDOWN_VALUE,
  resolveOtherDropdownValue,
} from '../utils/customDropdownOther';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import MobileFormDialog from '../components/MobileFormDialog';
import FormFieldGrid from '../components/FormFieldGrid';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, PRIORITY_CHIP_CLASSES, STATUS_CHIP_DEFAULT_CLASS } from '../constants';
import settingsService from '../services/settingsService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_STALE, refreshAfterLeadChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import { usePagedList } from '../hooks/usePagedList';

/** Radix Select cannot use ""; use this value and map to null on change/submit. */
const LEAD_UNASSIGNED_SELECT_VALUE = 'unassigned';

const leadSchema = z.object({
  name: z.string().min(1, 'Enter lead name'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  company: z.string().optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).default('new'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assignedTo: z.string().uuid().optional().nullable(),
  nextFollowUp: z.date().optional().nullable(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const activitySchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'note', 'task']),
  subject: z.string().optional(),
  notes: z.string().optional(),
  nextStep: z.string().optional(),
  followUpDate: z.date().optional().nullable(),
});

const statusSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']),
  statusComment: z.string().optional(),
});

/** Leads in one list response (`{ data: [...], count }`). */
const leadRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const Leads = () => {
  const { activeTenant, activeTenantId } = useAuth();
  const studioLocationCtx = useStudioLocationOptional();
  const activeStudioLocationId = studioLocationCtx?.activeStudioLocationId ?? null;
  const { scopeReady } = useWorkspaceScope();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();
  const businessType = activeTenant?.businessType || 'printing_press';
  const isPrintingPress = businessType === 'printing_press';
  const queryClient = useQueryClient();

  const [refreshingLeads, setRefreshingLeads] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    source: 'all',
    assignedTo: '',
    isActive: 'all'
  });
  const [leadModalVisible, setLeadModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [viewingLead, setViewingLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [convertingLead, setConvertingLead] = useState(false);
  const [customLeadSources, setCustomLeadSources] = useState([]);
  const [savingLeadSource, setSavingLeadSource] = useState(false);
  const [showLeadSourceOtherInput, setShowLeadSourceOtherInput] = useState(false);
  const [leadSourceOtherValue, setLeadSourceOtherValue] = useState('');
  const [archiveLeadId, setArchiveLeadId] = useState(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingLead, setArchivingLead] = useState(false);
  const [convertLeadId, setConvertLeadId] = useState(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [importContactsOpen, setImportContactsOpen] = useState(false);
  const [updateStatusDialogOpen, setUpdateStatusDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [leadBeingUpdated, setLeadBeingUpdated] = useState(null);

  const statusForm = useForm({
    resolver: zodResolver(statusSchema),
    defaultValues: {
      status: 'new',
      statusComment: '',
    },
  });

  const leadForm = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      source: '',
      status: 'new',
      priority: 'medium',
      assignedTo: null,
      nextFollowUp: null,
      notes: '',
      tags: [],
    },
  });

  const activityForm = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      type: 'note',
      subject: '',
      notes: '',
      nextStep: '',
      followUpDate: null,
    },
  });

  useEffect(() => {
    setPageSearchConfig({ scope: 'leads', placeholder: SEARCH_PLACEHOLDERS.LEADS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    const loadCustomSources = async () => {
      try {
        const options = await customDropdownService.getCustomOptions('lead_source');
        setCustomLeadSources(options || []);
      } catch (error) {
        console.error('Failed to load custom lead sources:', error);
      }
    };
    loadCustomSources();
  }, []);

  const { data: leadSourceOptionsApi = [] } = useQuery({
    queryKey: queryKeys.settings.leadSources(activeTenantId),
    queryFn: () => settingsService.getLeadSources(),
    enabled: !!activeTenantId,
    staleTime: QUERY_STALE.METADATA,
  });

  const leadSourceOptions = useMemo(() => {
    const apiOpts = Array.isArray(leadSourceOptionsApi) ? leadSourceOptionsApi : [];
    const mapped = apiOpts.map(s => ({ value: s.value, label: s.label || s.value }));
    return mapped.length > 0 ? mapped : [
      { value: 'Online - Website', label: 'Online - Website' },
      { value: 'Referral', label: 'Referral' },
      { value: 'Walk-in', label: 'Walk-in' },
      { value: 'Phone Call', label: 'Phone Call' },
      { value: 'Email', label: 'Email' },
      { value: 'Event/Exhibition', label: 'Event/Exhibition' },
      { value: 'Cold Call', label: 'Cold Call' }
    ];
  }, [leadSourceOptionsApi]);

  const leadFilterParams = useMemo(() => {
    const params = {
      status: filters.status,
      priority: filters.priority,
      source: filters.source === 'all' ? undefined : filters.source,
      assignedTo: filters.assignedTo && filters.assignedTo !== 'all' ? filters.assignedTo : undefined,
      isActive: filters.isActive,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [debouncedSearch, filters.assignedTo, filters.isActive, filters.priority, filters.source, filters.status]);

  // Pages on desktop; loads as you scroll on phones and tablets.
  const {
    rows: leads,
    total: leadsTotal,
    isLoading: loading,
    error: leadsError,
    refetch: refetchLeads,
    infinite: leadsInfinite,
  } = usePagedList({
    queryKey: (params) => queryKeys.leads.list(activeTenantId, activeStudioLocationId, params),
    params: leadFilterParams,
    fetchPage: (params) => leadService.getAll(params),
    getRows: leadRowsFromResponse,
    getTotal: (response, rows) => response?.count || rows.length || 0,
    page: pagination.current,
    pageSize: pagination.pageSize,
    enabled: scopeReady && (!studioLocationCtx?.isStudioWorkspace || !!activeStudioLocationId || !!studioLocationCtx?.canAccessAll),
    staleTime: QUERY_STALE.LIST,
    queryOptions: { refetchOnWindowFocus: true },
  });

  const {
    data: summaryResponse,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.leads.summary(activeTenantId, activeStudioLocationId),
    queryFn: () => leadService.getSummary(),
    enabled: scopeReady && (!studioLocationCtx?.isStudioWorkspace || !!activeStudioLocationId || !!studioLocationCtx?.canAccessAll),
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: true,
  });

  const { data: usersResponse } = useQuery({
    queryKey: ['users', 'leads-assignees', activeTenantId],
    queryFn: () => userService.getAll({ limit: 100, isActive: true }),
    enabled: !!activeTenantId,
    staleTime: QUERY_STALE.METADATA,
    refetchOnWindowFocus: false,
  });

  const summary = summaryResponse?.data || summaryResponse || {};
  const users = useMemo(() => {
    const data = usersResponse?.data || usersResponse;
    return data?.data || data || [];
  }, [usersResponse]);

  useEffect(() => {
    if (leadsError) {
      console.error('Failed to load leads', leadsError);
      showError(leadsError, 'Failed to load leads');
    }
  }, [leadsError]);

  const fetchSummary = useCallback(() => refetchSummary(), [refetchSummary]);

  const fetchLeads = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshingLeads(true);
    }
    try {
      await refetchLeads();
    } finally {
      if (isRefresh) {
        setRefreshingLeads(false);
      }
    }
  }, [refetchLeads]);

  const { isRefreshing, pullDistance, containerProps } = usePullToRefresh(
    () => {
      fetchLeads(true);
      fetchSummary();
    },
    { enabled: isMobile }
  );


  const openLeadModal = (lead = null) => {
    setEditingLead(lead);
    setShowLeadSourceOtherInput(false);
    setLeadSourceOtherValue('');
    if (lead) {
      leadForm.reset({
        name: lead.name,
        company: lead.company || '',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || '',
        status: lead.status || 'new',
        priority: lead.priority || 'medium',
        assignedTo: lead.assignee?.id || lead.assignedTo || null,
        nextFollowUp: lead.nextFollowUp ? new Date(lead.nextFollowUp) : null,
        notes: lead.notes || '',
        tags: Array.isArray(lead.tags) ? lead.tags.filter((t) => typeof t === 'string') : [],
      });
    } else {
      leadForm.reset({
        name: '',
        company: '',
        email: '',
        phone: '',
        source: 'website',
        status: 'new',
        priority: 'medium',
        assignedTo: null,
        nextFollowUp: null,
        notes: '',
        tags: [],
      });
    }
    setLeadModalVisible(true);
  };

  const handleLeadSourceChange = (value) => {
    leadForm.setValue('source', value);
    if (value === '__OTHER__') {
      setShowLeadSourceOtherInput(true);
    } else {
      setShowLeadSourceOtherInput(false);
    }
  };

  const handleSaveCustomLeadSource = async () => {
    if (!leadSourceOtherValue || !leadSourceOtherValue.trim()) {
      showWarning('Please enter a source name');
      return;
    }

    try {
      setSavingLeadSource(true);
      const saved = await customDropdownService.saveCustomOption('lead_source', leadSourceOtherValue.trim());
      if (saved) {
        setCustomLeadSources(prev => {
          if (prev.find(s => s.value === saved.value)) {
            return prev;
          }
          return [...prev, saved];
        });
        
        leadForm.setValue('source', saved.value);
        setShowLeadSourceOtherInput(false);
        setLeadSourceOtherValue('');
        showSuccess(`"${saved.label}" added to sources`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save custom source');
    } finally {
      setSavingLeadSource(false);
    }
  };

  const getMergedLeadSourceOptions = () => {
    const merged = [...leadSourceOptions];
    customLeadSources.forEach(source => {
      if (!merged.find(s => s.value === source.value)) {
        merged.push({ value: source.value, label: source.label });
      }
    });
    return merged;
  };

  const onLeadSubmit = async (values) => {
    const resolvedSource = resolveOtherDropdownValue(values.source, leadSourceOtherValue);
    if (values.source === OTHER_DROPDOWN_VALUE && !resolvedSource) {
      showWarning('Enter a source name for "Other (specify)", or pick a source from the list.');
      return;
    }

    if (resolvedSource) {
      void customDropdownService.saveCustomOption('lead_source', resolvedSource, resolvedSource);
    }

    const payload = {
      ...values,
      source: resolvedSource || values.source,
      assignedTo: values.assignedTo || null,
      nextFollowUp: values.nextFollowUp ? values.nextFollowUp.toISOString() : null
    };
    try {
      if (editingLead) {
        await leadService.update(editingLead.id, payload);
        showSuccess('Lead updated successfully');
      } else {
        await leadService.create(payload);
        showSuccess('Lead created successfully');
      }
      setLeadModalVisible(false);
      leadForm.reset();
      refreshAfterLeadChange(queryClient);
    } catch (error) {
      console.error('Failed to save lead', error);
      showError(error, error?.response?.data?.message || 'Failed to save lead');
    }
  };

  const handleViewLead = (record) => {
    setViewingLead(record);
    setDrawerVisible(true);
    leadService.getById(record.id)
      .then((response) => {
        const data = response?.data || response;
        setViewingLead((prev) => (prev?.id === record.id ? (data || prev) : prev));
      })
      .catch((error) => {
        console.error('Failed to fetch lead', error);
        showError(error, 'Failed to load lead details');
      });
  };

  const handleConvertLead = (leadRecord = null) => {
    const targetLead = leadRecord || viewingLead;
    if (!targetLead) {
      return;
    }
    setConvertLeadId(targetLead.id);
    setConvertDialogOpen(true);
  };

  const handleConvertConfirm = async () => {
    if (!convertLeadId) return;
        try {
          setConvertingLead(true);
      const response = await leadService.convert(convertLeadId);
          const data = response?.data || response;
          if (data) {
            setViewingLead(data);
          }
          setDrawerVisible(true);
      showSuccess('Lead converted to customer');
      refreshAfterLeadChange(queryClient);
      setConvertDialogOpen(false);
      setConvertLeadId(null);
        } catch (error) {
          console.error('Failed to convert lead', error);
      showError(error, error?.response?.data?.message || 'Failed to convert lead');
        } finally {
          setConvertingLead(false);
        }
  };

  useEffect(() => {
    if (viewingLead) {
      setActivityModalVisible(false);
    }
  }, [viewingLead]);

  const openActivityModal = () => {
    activityForm.reset({
      type: 'note',
      subject: '',
      notes: '',
      nextStep: '',
      followUpDate: null,
    });
    setActivityModalVisible(true);
  };

  const onActivitySubmit = async (values) => {
    if (!viewingLead) return;
    try {
      await leadService.addActivity(viewingLead.id, {
        ...values,
        followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null
      });
      showSuccess('Activity added successfully');
      setActivityModalVisible(false);
      handleViewLead({ id: viewingLead.id });
      refreshAfterLeadChange(queryClient);
    } catch (error) {
      console.error('Failed to add activity', error);
      showError(error, error?.response?.data?.message || 'Failed to add activity');
    }
  };

  const handleArchiveLead = (record) => {
    setArchiveLeadId(record.id);
    setArchiveDialogOpen(true);
  };

  const handleArchiveConfirm = async () => {
    if (!archiveLeadId) return;
    try {
      setArchivingLead(true);
      await leadService.archive(archiveLeadId);
      showSuccess('Lead archived');
      await refreshAfterLeadChange(queryClient);
      setArchiveDialogOpen(false);
      setArchiveLeadId(null);
        } catch (error) {
          console.error('Failed to archive lead', error);
      showError(error, error?.response?.data?.message || 'Failed to archive lead');
        } finally {
          setArchivingLead(false);
        }
  };

  const openStatusModal = (lead) => {
    setLeadBeingUpdated(lead);
    setUpdateStatusDialogOpen(true);
    statusForm.reset({
      status: lead.status || 'new',
      statusComment: '',
    });
  };

  const closeStatusModal = () => {
    setUpdateStatusDialogOpen(false);
    setLeadBeingUpdated(null);
    statusForm.reset();
  };

  const handleStatusSubmit = async ({ status, statusComment }) => {
    if (!leadBeingUpdated) {
      return;
    }

    const leadId = leadBeingUpdated.id;

    try {
      setUpdatingStatus(true);
      await leadService.update(leadId, {
        status,
        statusComment: statusComment || undefined
      });
      showSuccess('Lead status updated successfully');
      closeStatusModal();
      
      // Refresh lead details if drawer is open
      if (drawerVisible && viewingLead?.id === leadId) {
        handleViewLead({ id: leadId });
      }
      
      refreshAfterLeadChange(queryClient);
    } catch (error) {
      console.error('Failed to update lead status', error);
      showError(error, error?.response?.data?.message || 'Failed to update lead status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const tableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Lead',
      render: (_, record) => (
        <div>
          <div className="font-semibold">{record.name || '—'}</div>
          <div className="text-muted-foreground text-sm">
            {record.company || '—'}
          </div>
        </div>
      )
    },
    {
      key: 'email',
      label: 'Email',
      render: (_, record) =>
        record.email ? (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-foreground" />
            <a href={`mailto:${record.email}`} className="text-foreground hover:underline">{record.email}</a>
          </div>
        ) : (
          '—'
        )
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (_, record) =>
        record.phone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-foreground" />
            <span>{record.phone}</span>
          </div>
        ) : (
          '—'
        )
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => (
        <StatusChip status={record.status} />
      )
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (_, record) => (
        <Badge
          variant="outline"
          className={PRIORITY_CHIP_CLASSES[record.priority] ?? STATUS_CHIP_DEFAULT_CLASS}
        >
          {record.priority?.toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'source',
      label: 'Source',
      render: (_, record) => {
        const matched = leadSourceOptions.find((option) => option.value === record.source);
        const label = matched ? matched.label : record.source || '—';
        if (record.source === 'marketplace') {
          return (
            <div className="space-y-1">
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">Sabito marketplace</Badge>
              {record.metadata?.serviceTitle ? (
                <p className="text-xs text-muted-foreground">{record.metadata.serviceTitle}</p>
              ) : null}
            </div>
          );
        }
        return label;
      }
    },
    {
      key: 'assignedTo',
      label: 'Assigned To',
      render: (_, record) =>
        record.assignee?.name ||
        (record.assignedTo ? 'Unresolved' : 'Unassigned')
    },
    {
      key: 'nextFollowUp',
      label: 'Next Follow-up',
      render: (_, record) =>
        record.nextFollowUp ? dayjs(record.nextFollowUp).format('MMM DD, YYYY HH:mm') : '—'
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleViewLead}
          extraActions={[
            record.status !== 'converted' && !record.convertedCustomerId && {
              label: 'Convert to Customer',
              onClick: () => handleConvertLead(record),
              icon: <UserPlus className="h-4 w-4" />
            },
            {
              label: 'Edit',
              variant: 'secondary',
              onClick: () => openLeadModal(record),
              icon: <UserCog className="h-4 w-4" />
            }
          ].filter(Boolean)}
        />
      )
    }
  ], [handleViewLead, handleConvertLead, openLeadModal]);


  const drawerTabs = useMemo(() => {
    if (!viewingLead) return [];
    const activities = viewingLead.activities || [];

    // Add creation activity at the beginning
    const creationActivity = {
      id: 'creation',
      type: 'creation',
      createdAt: viewingLead.createdAt,
      createdByUser: viewingLead.createdByUser || null
    };

    const allActivities = [creationActivity, ...activities];

    const timelineItems = allActivities.map((activity, index) => {
      const isLast = index === allActivities.length - 1;
      
      if (activity.type === 'creation') {
        return (
          <TimelineItem key={activity.id} isLast={isLast}>
            <TimelineIndicator />
            <TimelineContent>
              <TimelineTitle className="text-foreground">
                {activity.createdByUser 
                  ? `${activity.createdByUser.name} added a new lead, ${viewingLead.name}`
                  : `Added a new lead, ${viewingLead.name}`}
              </TimelineTitle>
              <TimelineTime className="text-foreground">
                {dayjs(activity.createdAt).format('MMM DD, YYYY [at] h:mm A')}
              </TimelineTime>
            </TimelineContent>
          </TimelineItem>
        );
      }

      return (
        <TimelineItem key={activity.id} isLast={isLast}>
          <TimelineIndicator />
          <TimelineContent>
            <TimelineTitle className="text-foreground">
              {activity.type.toUpperCase()} {activity.subject ? `- ${activity.subject}` : ''}
            </TimelineTitle>
            <TimelineTime className="text-foreground">
              {dayjs(activity.createdAt).format('MMM DD, YYYY [at] h:mm A')}
              {activity.createdByUser ? ` • ${activity.createdByUser.name}` : ''}
            </TimelineTime>
            {activity.notes && (
              <TimelineDescription className="text-foreground">{activity.notes}</TimelineDescription>
            )}
            {activity.nextStep && (
              <TimelineDescription className="text-foreground">Next Step: {activity.nextStep}</TimelineDescription>
            )}
            {activity.followUpDate && (
              <TimelineDescription className="text-foreground">
                Follow-up: {dayjs(activity.followUpDate).format('MMM DD, YYYY hh:mm A')}
              </TimelineDescription>
            )}
          </TimelineContent>
        </TimelineItem>
      );
    });

    return [
      {
        key: 'overview',
        label: 'Overview',
        content: (
          <DrawerSectionCard title="Lead details">
            <div className="space-y-4">
              {viewingLead.status === 'converted' && (
                <Alert>
                  <AlertTitle>Lead converted</AlertTitle>
                  <AlertDescription>
                    {viewingLead.convertedCustomer
                      ? `Customer profile created for ${viewingLead.convertedCustomer.name}.`
                      : 'This lead has been converted.'}
                  </AlertDescription>
                </Alert>
              )}
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Name">
                  <span className="text-foreground">{viewingLead.name}</span>
                </DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={viewingLead.status} />
                </DescriptionItem>
                <DescriptionItem label="Priority">
                  <Badge
                    variant="outline"
                    className={PRIORITY_CHIP_CLASSES[viewingLead.priority] ?? STATUS_CHIP_DEFAULT_CLASS}
                  >
                    {viewingLead.priority?.toUpperCase()}
                  </Badge>
                </DescriptionItem>
                <DescriptionItem label="Company">
                  <span className="text-foreground">{viewingLead.company || '—'}</span>
                </DescriptionItem>
                <DescriptionItem label="Email">
                  <span className="text-foreground">{viewingLead.email || '—'}</span>
                </DescriptionItem>
                <DescriptionItem label="Phone">
                  <span className="text-foreground">{viewingLead.phone || '—'}</span>
                </DescriptionItem>
                <DescriptionItem label="Source">
                  <span className="text-foreground">{viewingLead.source || '—'}</span>
                </DescriptionItem>
                {viewingLead.metadata?.serviceTitle ? (
                  <DescriptionItem label="Requested service">
                    <span className="text-foreground">{viewingLead.metadata.serviceTitle}</span>
                  </DescriptionItem>
                ) : null}
                {viewingLead.metadata?.requestMessage ? (
                  <DescriptionItem label="Customer message">
                    <span className="text-foreground">{viewingLead.metadata.requestMessage}</span>
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label="Assigned To">
                  <span className="text-foreground">{viewingLead.assignee?.name || 'Unassigned'}</span>
                </DescriptionItem>
                <DescriptionItem label="Next Follow-Up">
                  <span className="text-foreground">
                    {viewingLead.nextFollowUp ? dayjs(viewingLead.nextFollowUp).format('MMM DD, YYYY hh:mm A') : '—'}
                  </span>
                </DescriptionItem>
                <DescriptionItem label="Last Contacted">
                  <span className="text-foreground">
                    {viewingLead.lastContactedAt ? dayjs(viewingLead.lastContactedAt).format('MMM DD, YYYY hh:mm A') : '—'}
                  </span>
                </DescriptionItem>
                {viewingLead.convertedCustomer && (
                  <DescriptionItem label="Converted Customer">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{viewingLead.convertedCustomer.name}</Badge>
                      {viewingLead.convertedCustomer.company && (
                        <span className="text-foreground">{viewingLead.convertedCustomer.company}</span>
                      )}
                    </div>
                  </DescriptionItem>
                )}
                {viewingLead.convertedJob && isPrintingPress && (
                  <DescriptionItem label="Linked Job">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{viewingLead.convertedJob.jobNumber}</Badge>
                      <span className="text-foreground">{viewingLead.convertedJob.title}</span>
                    </div>
                  </DescriptionItem>
                )}
                <DescriptionItem label="Tags">
                  {(viewingLead.tags || []).length
                    ? viewingLead.tags.map((tag) => <Badge key={tag} variant="outline" className="mr-1">{tag}</Badge>)
                    : <span className="text-foreground">—</span>}
                </DescriptionItem>
                <DescriptionItem label="Notes">
                  <span className="text-foreground">{viewingLead.notes || '—'}</span>
                </DescriptionItem>
              </Descriptions>
            </div>
          </DrawerSectionCard>
        )
      },
      {
        key: 'activities',
        label: 'Activity',
        content: (
          <DrawerSectionCard title="Activity">
            {timelineItems.length ? (
              <Timeline>
                {timelineItems}
              </Timeline>
            ) : (
              <Alert>
                <AlertTitle>No activity logged yet.</AlertTitle>
              </Alert>
            )}
          </DrawerSectionCard>
        )
      }
    ];
  }, [viewingLead]);

  const statusOptions = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'];
  const priorityOptions = ['all', 'low', 'medium', 'high'];

  const handleClearFilters = useCallback(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    setSearchValue('');
    setFilters({
      status: 'all',
      priority: 'all',
      source: 'all',
      assignedTo: 'all',
      isActive: 'all'
    });
  }, [setSearchValue]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.source !== 'all' ||
    filters.assignedTo !== 'all' ||
    filters.isActive !== 'all' ||
    !!debouncedSearch.trim();

  const leadsEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(EMPTY_STATES.LEADS_FILTERED, {
          primary: handleClearFilters,
        });
      }
      return getEmptyStateProps(EMPTY_STATES.LEADS, {
        primary: () => openLeadModal(),
      });
    },
    [hasActiveFilters, handleClearFilters, openLeadModal]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <WelcomeSection
          welcomeMessage="Leads"
          subText="Track prospects and follow-ups for customer service and marketing."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setFilterDrawerOpen(true)}
                size={isMobile ? 'icon' : 'default'}
              >
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter leads by status, priority, source, or assignee</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={async () => {
                  await fetchLeads(true);
                  fetchSummary();
                }}
                disabled={refreshingLeads}
                size={isMobile ? 'icon' : 'default'}
              >
                {refreshingLeads ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh leads list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setImportContactsOpen(true)}
                size={isMobile ? 'icon' : 'default'}
              >
                <Upload className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Import</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import contacts into Customers or Leads</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => openLeadModal()}
                className="min-h-[44px] flex-1 min-w-0 md:flex-none"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span>Add Lead</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new lead</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Leads Card */}
        <div className={summaryLoading ? 'opacity-50' : ''}>
          <DashboardStatsCard
            tooltip="Total number of leads in your pipeline"
            title="Total Leads"
            value={summary?.totals?.totalLeads || 0}
            icon={Users}
            iconBgColor="rgba(22, 101, 52, 0.1)"
            iconColor="#166534"
          />
        </div>

        {/* Qualified Card */}
        <div className={summaryLoading ? 'opacity-50' : ''}>
          <DashboardStatsCard
            tooltip="Leads that have been qualified and are ready for conversion"
            title="Qualified"
            value={summary?.totals?.qualifiedLeads || 0}
            icon={CheckCircle}
            iconBgColor="rgba(59, 130, 246, 0.1)"
            iconColor="#166534"
          />
        </div>

        {/* Converted Card */}
        <div className={summaryLoading ? 'opacity-50' : ''}>
          <DashboardStatsCard
            tooltip="Leads that have been converted to customers"
            title="Converted"
            value={summary?.totals?.convertedLeads || 0}
            icon={TrendingUp}
            iconBgColor="rgba(132, 204, 22, 0.1)"
            iconColor="#84cc16"
          />
        </div>

        {/* Lost Card */}
        <div className={summaryLoading ? 'opacity-50' : ''}>
          <DashboardStatsCard
            tooltip="Leads that did not convert or were disqualified"
            title="Lost"
            value={summary?.totals?.lostLeads || 0}
            icon={XCircle}
            iconBgColor="rgba(239, 68, 68, 0.1)"
            iconColor="#ef4444"
          />
        </div>
      </div>

      {/* Main Content Area with Pull-to-Refresh */}
      <div {...containerProps} className="relative">
        {/* Pull-to-refresh indicator */}
        {isMobile && pullDistance > 0 && (
          <div 
            className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 transition-opacity"
            style={{
              height: `${Math.min(pullDistance, 80)}px`,
              opacity: Math.min(pullDistance / 80, 1),
            }}
          >
            {isRefreshing ? (
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            ) : (
              <RefreshCw className="h-6 w-6 text-brand" />
            )}
          </div>
        )}
        
        <DashboardTable
          data={leads}
          columns={tableColumns}
          loading={loading || (isMobile && isRefreshing)}
          title={null}
          emptyState={leadsEmptyState}
          pageSize={pagination.pageSize}
          externalPagination={{ current: pagination.current, total: leadsTotal }}
          onPageChange={(newPagination) => {
            setPagination(newPagination);
          }}
          infinite={leadsInfinite}
          viewMode={tableViewMode}
          onViewModeChange={setTableViewMode}
        />
      </div>

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-lg overflow-y-auto" 
          style={{
            borderRadius: '8px',
            top: '8px',
            bottom: '8px',
            right: '8px',
            height: 'calc(100dvh - 16px)',
          }}
        >
          <SheetHeader className="border-b pb-4 mb-4" style={{ marginLeft: '-24px', marginRight: '-24px', paddingLeft: '24px', paddingRight: '24px' }}>
            <SheetTitle className="text-lg font-semibold">Select filters below</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 md:space-y-6">
            {/* Status Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Status</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, status: 'all' }));
                  }}
                >
                  Reset
                </Button>
              </div>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setPagination((prev) => ({ ...prev, current: 1 }));
                  setFilters((prev) => ({ ...prev, status: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All Statuses' : option.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Priority</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, priority: 'all' }));
                  }}
                >
                  Reset
                </Button>
              </div>
              <Select
                value={filters.priority}
                onValueChange={(value) => {
                  setPagination((prev) => ({ ...prev, current: 1 }));
                  setFilters((prev) => ({ ...prev, priority: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All Priorities' : option.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Source</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, source: 'all' }));
                  }}
                >
                  Reset
                </Button>
              </div>
              <Select
                value={filters.source}
                onValueChange={(value) => {
                  setPagination((prev) => ({ ...prev, current: 1 }));
                  setFilters((prev) => ({ ...prev, source: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {leadSourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assigned To Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Assigned To</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, assignedTo: 'all' }));
                  }}
                >
                  Reset
                </Button>
              </div>
              <Select
                value={filters.assignedTo || 'all'}
                onValueChange={(value) => {
                  setPagination((prev) => ({ ...prev, current: 1 }));
                  setFilters((prev) => ({ ...prev, assignedTo: value === 'all' ? '' : value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Type Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Status Type</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, isActive: 'all' }));
                  }}
                >
                  Reset
                </Button>
              </div>
              <Select
                value={filters.isActive}
                onValueChange={(value) => {
                  setPagination((prev) => ({ ...prev, current: 1 }));
                  setFilters((prev) => ({ ...prev, isActive: value }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Archived</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="border-t pt-4 mt-6">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  handleClearFilters();
                }}
              >
                Reset all
              </Button>
              <Button
                className="flex-1"
                onClick={() => setFilterDrawerOpen(false)}
              >
                Show results
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DetailsDrawer
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setViewingLead(null);
        }}
        title={viewingLead ? viewingLead.name : 'Lead details'}
        width={720}
        extra={
          viewingLead && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  style={{ marginRight: '32px' }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => openLeadModal(viewingLead)}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openStatusModal(viewingLead)}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Update Status
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleArchiveLead(viewingLead)}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
        extraActions={
          viewingLead
            ? [
                !viewingLead.convertedCustomerId && {
                  key: 'convert',
                  label: convertingLead ? 'Converting...' : 'Convert to Customer',
                  icon: <UserPlus className="h-4 w-4" />,
                  onClick: () => handleConvertLead(viewingLead),
                  variant: 'secondary'
                },
                {
                  key: 'log-activity',
                  label: 'Log Activity',
                  icon: <MessageSquare className="h-4 w-4" />,
                  onClick: openActivityModal,
                  variant: 'default'
                }
              ].filter(Boolean)
            : []
        }
        tabs={drawerTabs}
      />

      {/* Update Status Dialog */}
      <MobileFormDialog
        open={updateStatusDialogOpen}
        onOpenChange={setUpdateStatusDialogOpen}
        isDirty={statusForm.formState.isDirty}
        onDiscard={() => {
          setLeadBeingUpdated(null);
          statusForm.reset();
        }}
        title={leadBeingUpdated ? `Update Status - ${leadBeingUpdated.name}` : 'Update Status'}
        description="Update the status of this lead and optionally add a comment."
        footer={({ requestClose }) => (
          <>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" form="status-form" loading={updatingStatus}>
              Update Status
            </Button>
          </>
        )}
      >
        <Form {...statusForm}>
          <form id="status-form" onSubmit={statusForm.handleSubmit(handleStatusSubmit)} className="space-y-4">
            <FormField
              control={statusForm.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={statusForm.control}
              name="statusComment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Add an optional comment for this status update" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={leadModalVisible}
        onOpenChange={setLeadModalVisible}
        isDirty={leadForm.formState.isDirty}
        onDiscard={() => {
          setEditingLead(null);
          leadForm.reset();
          setShowLeadSourceOtherInput(false);
          setLeadSourceOtherValue('');
        }}
        title={editingLead ? `Edit Lead (${editingLead.name})` : 'New Lead'}
        description={editingLead ? 'Update lead information' : 'Add a new lead to your system'}
        footer={({ requestClose }) => (
          <>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" form="lead-form" loading={leadForm.formState.isSubmitting}>
              {editingLead ? 'Update Lead' : 'Create Lead'}
            </Button>
          </>
        )}
      >
        <Form {...leadForm}>
          <form id="lead-form" onSubmit={leadForm.handleSubmit(onLeadSubmit)} className="space-y-4">
            <FormFieldGrid columns={2}>
              <FormField
                control={leadForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Contact or company name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={leadForm.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Company" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGrid>

            <FormFieldGrid columns={2}>
              <FormField
                control={leadForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="Email address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={leadForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <PhoneNumberInput {...field} placeholder="Enter phone number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGrid>

            <FormFieldGrid columns={2}>
                <FormField
                  control={leadForm.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Source (optional)</FormLabel>
                      <Select value={field.value} onValueChange={handleLeadSourceChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select lead source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                {getMergedLeadSourceOptions().map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                    {option.label}
                            </SelectItem>
                ))}
                          <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                        </SelectContent>
              </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leadForm.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned To (optional)</FormLabel>
                      <Select
                        value={field.value || LEAD_UNASSIGNED_SELECT_VALUE}
                        onValueChange={(value) =>
                          field.onChange(value === LEAD_UNASSIGNED_SELECT_VALUE ? null : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select team member" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={LEAD_UNASSIGNED_SELECT_VALUE}>Unassigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name} ({user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </FormFieldGrid>

            {showLeadSourceOtherInput && (
                <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Trade Show, Partner Referral"
                      value={leadSourceOtherValue}
                      onChange={(e) => setLeadSourceOtherValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCustomLeadSource();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleSaveCustomLeadSource} loading={savingLeadSource}>
                    Save
                  </Button>
                </div>
              )}

            <FormFieldGrid columns={2}>
              <FormField
                control={leadForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {['new', 'contacted', 'qualified', 'converted', 'lost'].map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={leadForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {['low', 'medium', 'high'].map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGrid>

            <FormFieldGrid columns={2}>
                <FormField
                  control={leadForm.control}
                  name="nextFollowUp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Follow-up (optional)</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onSelect={(date) => field.onChange(date)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leadForm.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value?.join(', ') || ''}
                          onChange={(e) => {
                            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                            field.onChange(tags);
                          }}
                          placeholder="Add tags separated by commas"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </FormFieldGrid>

            <FormField
                control={leadForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Internal notes or context" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

          </form>
        </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={activityModalVisible}
        onOpenChange={setActivityModalVisible}
        isDirty={activityForm.formState.isDirty}
        onDiscard={() => activityForm.reset()}
        title="Log Activity"
        description="Record an interaction with this lead"
        footer={({ requestClose }) => (
          <>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" form="activity-form" loading={activityForm.formState.isSubmitting}>
              Save Activity
            </Button>
          </>
        )}
      >
        <Form {...activityForm}>
          <form id="activity-form" onSubmit={activityForm.handleSubmit(onActivitySubmit)} className="space-y-4">
            <FormField
              control={activityForm.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={activityForm.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Short subject or summary" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={activityForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Details of the interaction" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={activityForm.control}
              name="nextStep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Step (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional next step" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={activityForm.control}
              name="followUpDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Follow-up Date (optional)</FormLabel>
                  <FormControl>
                    <DatePicker
                      date={field.value}
                      onSelect={(date) => field.onChange(date)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </MobileFormDialog>

      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert Lead to Customer</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a customer record using the lead details. You can adjust the customer later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertConfirm} loading={convertingLead}>
              Convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this lead? You can restore it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleArchiveConfirm} 
              className="bg-destructive text-destructive-foreground"
              loading={archivingLead}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportContactsDialog
        open={importContactsOpen}
        onOpenChange={setImportContactsOpen}
        defaultDestination="leads"
        onImported={() => {
          fetchLeads(true);
          fetchSummary();
        }}
      />
    </div>
  );
};

export default Leads;
