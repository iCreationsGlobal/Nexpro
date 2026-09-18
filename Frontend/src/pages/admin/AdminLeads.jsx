import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '../../hooks/useDebounce';
import { useResponsive } from '../../hooks/useResponsive';
import { useSmartSearch } from '../../context/SmartSearchContext';
import { usePlatformAdminPermissions } from '../../context/PlatformAdminPermissionsContext';
import adminService from '../../services/adminService';
import { showSuccess, showError } from '../../utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import DashboardStatsCard from '../../components/DashboardStatsCard';
import DashboardTable from '../../components/DashboardTable';
import ViewToggle from '../../components/ViewToggle';
import DetailsDrawer from '../../components/DetailsDrawer';
import DrawerSectionCard from '../../components/DrawerSectionCard';
import StatusChip from '../../components/StatusChip';
import TableSkeleton from '../../components/TableSkeleton';
import {
  Plus,
  RefreshCw,
  Phone,
  Mail,
  Users,
  UserCheck,
  Loader2,
  Filter,
  X,
  Edit,
  MessageSquare,
  Calendar,
  Briefcase,
  TrendingUp,
  Clock,
  Eye,
  Megaphone,
  Send
} from 'lucide-react';
import dayjs from 'dayjs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from '@/components/ui/sheet';
import { DatePicker } from '@/components/ui/date-picker';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import MobileFormDialog from '../../components/MobileFormDialog';
import { DEBOUNCE_DELAYS, PRIORITY_CHIP_CLASSES, STATUS_CHIP_DEFAULT_CLASS } from '../../constants';

const leadSourceOptions = [
  { value: 'Social Media - Facebook', label: 'Social Media - Facebook' },
  { value: 'Social Media - Instagram', label: 'Social Media - Instagram' },
  { value: 'Online - Google', label: 'Online - Google' },
  { value: 'Online - Website', label: 'Online - Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Event/Exhibition', label: 'Event/Exhibition' },
  { value: 'Cold Call', label: 'Cold Call' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone Call', label: 'Phone Call' }
];

const leadSchema = z.object({
  name: z.string().min(1, 'Enter lead name'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  company: z.string().min(1, 'Enter company name'),
  phone: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).default('new'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assignedTo: z.string().optional().nullable(),
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

const AdminLeads = () => {
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();

  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [platformAdmins, setPlatformAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshingLeads, setRefreshingLeads] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    source: 'all',
    assignedTo: '',
    isActive: 'true'
  });
  const [leadModalVisible, setLeadModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [convertJobModalVisible, setConvertJobModalVisible] = useState(false);
  const [viewingLead, setViewingLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);

  const leadForm = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      phone: '',
      source: '',
      status: 'new',
      priority: 'medium',
      assignedTo: null,
      nextFollowUp: null,
      notes: '',
      tags: []
    }
  });

  const activityForm = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      type: 'note',
      subject: '',
      notes: '',
      nextStep: '',
      followUpDate: null
    }
  });

  const jobForm = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Job title is required'),
      description: z.string().optional(),
      status: z.enum(['new', 'in_progress', 'on_hold', 'completed', 'cancelled']).default('new'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      assignedTo: z.string().optional().nullable(),
      startDate: z.date().optional().nullable(),
      dueDate: z.date().optional().nullable(),
      notes: z.string().optional()
    })),
    defaultValues: {
      title: '',
      description: '',
      status: 'new',
      priority: 'medium',
      assignedTo: null,
      startDate: null,
      dueDate: null,
      notes: ''
    }
  });

  // Set page search config
  useEffect(() => {
    setPageSearchConfig({
      scope: 'admin-leads',
      placeholder: 'Search leads by name, company, email, phone...'
    });
  }, [setPageSearchConfig]);

  // Load platform admins for assignment dropdown
  useEffect(() => {
    const loadPlatformAdmins = async () => {
      try {
        const response = await adminService.getPlatformAdmins();
        if (response?.success) {
          setPlatformAdmins(response.data || []);
        }
      } catch (error) {
        console.error('Failed to load platform admins:', error);
      }
    };
    loadPlatformAdmins();
  }, []);

  // Fetch leads
  const fetchLeads = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshingLeads(true);
    } else {
      setLoading(true);
    }

    try {
      const params = {
        page: pagination.current,
        limit: pagination.pageSize,
        search: debouncedSearch || undefined,
        status: filters.status !== 'all' ? filters.status : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        source: filters.source !== 'all' ? filters.source : undefined,
        assignedTo: filters.assignedTo || undefined,
        isActive: filters.isActive !== 'all' ? filters.isActive === 'true' : undefined
      };

      const response = await adminService.getAdminLeads(params);
      if (response?.success) {
        setLeads(response.data || []);
        setPagination(prev => ({
          ...prev,
          total: response.count || 0,
          totalPages: response.pagination?.totalPages || 0
        }));
      }
    } catch (error) {
      console.error('Failed to fetch admin leads:', error);
      showError(error, 'Failed to load leads');
    } finally {
      setLoading(false);
      setRefreshingLeads(false);
    }
  }, [pagination.current, pagination.pageSize, debouncedSearch, filters]);

  // Fetch summary stats
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await adminService.getAdminLeadStats();
      if (response?.success) {
        setSummary(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch admin lead stats:', error);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleAdd = () => {
    setEditingLead(null);
    leadForm.reset({
      name: '',
      email: '',
      company: '',
      phone: '',
      source: '',
      status: 'new',
      priority: 'medium',
      assignedTo: null,
      nextFollowUp: null,
      notes: '',
      tags: []
    });
    setLeadModalVisible(true);
  };

  const handleEdit = (lead) => {
    setEditingLead(lead);
    leadForm.reset({
      name: lead.name || '',
      email: lead.email || '',
      company: lead.company || '',
      phone: lead.phone || '',
      source: lead.source || '',
      status: lead.status || 'new',
      priority: lead.priority || 'medium',
      assignedTo: lead.assignedTo || null,
      nextFollowUp: lead.nextFollowUp ? new Date(lead.nextFollowUp) : null,
      notes: lead.notes || '',
      tags: lead.tags || []
    });
    setLeadModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingLead) {
        await adminService.updateAdminLead(editingLead.id, values);
        showSuccess('Lead updated successfully');
      } else {
        await adminService.createAdminLead(values);
        showSuccess('Lead created successfully');
      }
      setLeadModalVisible(false);
      fetchLeads();
      fetchSummary();
    } catch (error) {
      showError(error, editingLead ? 'Failed to update lead' : 'Failed to create lead');
    }
  };

  const handleDelete = async (lead) => {
    try {
      await adminService.deleteAdminLead(lead.id);
      showSuccess('Lead archived successfully');
      fetchLeads();
      fetchSummary();
    } catch (error) {
      showError(error, 'Failed to archive lead');
    }
  };

  const handleAddActivity = async (values) => {
    if (!viewingLead) return;
    try {
      await adminService.addAdminLeadActivity(viewingLead.id, {
        ...values,
        followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null
      });
      showSuccess('Activity added successfully');
      setActivityModalVisible(false);
      activityForm.reset();
      // Reload lead details
      const response = await adminService.getAdminLead(viewingLead.id);
      if (response?.success) {
        setViewingLead(response.data);
      }
      fetchLeads();
    } catch (error) {
      showError(error, 'Failed to add activity');
    }
  };

  const handleConvertToJob = async (values) => {
    if (!viewingLead) return;
    try {
      const response = await adminService.convertAdminLeadToJob(viewingLead.id, {
        ...values,
        startDate: values.startDate ? values.startDate.toISOString() : null,
        dueDate: values.dueDate ? values.dueDate.toISOString() : null
      });
      if (response?.success) {
        showSuccess('Lead converted to job successfully');
        setConvertJobModalVisible(false);
        jobForm.reset();
        fetchLeads();
        fetchSummary();
        setDrawerVisible(false);
      }
    } catch (error) {
      showError(error, 'Failed to convert lead to job');
    }
  };

  const handleViewLead = async (lead) => {
    try {
      const response = await adminService.getAdminLead(lead.id);
      if (response?.success) {
        setViewingLead(response.data);
        setDrawerVisible(true);
      }
    } catch (error) {
      showError(error, 'Failed to load lead details');
    }
  };

  const tableColumns = useMemo(() => [
    {
      key: 'company',
      title: 'Company',
      dataIndex: 'company',
      render: (text, record) => (
        <div>
          <div className="font-medium">{text || record.name}</div>
          {record.name && text && <div className="text-sm text-gray-500">{record.name}</div>}
        </div>
      )
    },
    {
      key: 'contact',
      title: 'Contact',
      render: (_, record) => (
        <div className="text-sm">
          {record.email && (
            <div className="flex items-center gap-1 text-gray-600">
              <Mail className="h-3 w-3" />
              {record.email}
            </div>
          )}
          {record.phone && (
            <div className="flex items-center gap-1 text-gray-600">
              <Phone className="h-3 w-3" />
              {record.phone}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'status',
      title: 'Status',
      dataIndex: 'status',
      mobileDashboardPlacement: 'headerEnd',
      render: (status) => <StatusChip status={status} />
    },
    {
      key: 'priority',
      title: 'Priority',
      dataIndex: 'priority',
      render: (priority) => (
        <Badge className={PRIORITY_CHIP_CLASSES[priority] || STATUS_CHIP_DEFAULT_CLASS}>
          {priority}
        </Badge>
      )
    },
    {
      key: 'source',
      title: 'Source',
      dataIndex: 'source'
    },
    {
      key: 'nextFollowUp',
      title: 'Next Follow-up',
      dataIndex: 'nextFollowUp',
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : '-'
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleViewLead(record)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </Button>
          {hasPermission('leads.manage') && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleEdit(record)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </div>
      )
    }
  ], []);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Admin Leads</h2>
          <p className="text-sm text-muted-foreground">
            Track potential customers and businesses you've engaged with about the app
          </p>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Button
            variant="outline"
            onClick={() => setFilterDrawerOpen(true)}
            size={isMobile ? "icon" : "default"}
          >
            <Filter className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Filter</span>}
          </Button>
          <Button
            variant="outline"
            onClick={() => fetchLeads(true)}
            disabled={refreshingLeads}
            size={isMobile ? "icon" : "default"}
          >
            {refreshingLeads ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          {hasPermission('leads.manage') && (
            <Button variant="outline" onClick={() => setBroadcastModalVisible(true)} size={isMobile ? 'icon' : 'default'}>
              <Megaphone className="h-4 w-4" />
              {!isMobile && <span className="ml-2">Broadcast</span>}
            </Button>
          )}
          {hasPermission('leads.manage') && (
            <Button onClick={handleAdd} className="flex-1 min-w-0 md:flex-none">
              <Plus className="h-4 w-4" />
              <span className="ml-2">New Lead</span>
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        <DashboardStatsCard
          title="Total Leads"
          value={summary?.total || 0}
          icon={Users}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          title="New"
          value={summary?.byStatus?.new || 0}
          icon={UserCheck}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          title="Qualified"
          value={summary?.byStatus?.qualified || 0}
          icon={TrendingUp}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          title="Upcoming Follow-ups"
          value={summary?.upcomingFollowUps || 0}
          icon={Clock}
          iconBgColor="rgba(251, 191, 36, 0.1)"
          iconColor="#fbbf24"
        />
      </div>

      {/* Check permission after hooks */}
      {!permissionsLoading && !hasPermission('leads.view') ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">Access Denied</h3>
            <p className="text-gray-600">You don't have permission to view leads.</p>
          </div>
        </div>
      ) : loading && !refreshingLeads ? (
        <TableSkeleton />
      ) : (
        <DashboardTable
          data={leads}
          columns={tableColumns}
          loading={refreshingLeads}
          title={null}
          emptyIcon={<Users className="h-12 w-12 text-muted-foreground" />}
          emptyTitle="No leads yet"
          emptyDescription="Create your first lead to start tracking potential customers"
          viewMode={tableViewMode}
          onViewModeChange={setTableViewMode}
        />
      )}

      {/* Create/Edit Lead Modal */}
      <MobileFormDialog
        open={leadModalVisible}
        onOpenChange={setLeadModalVisible}
        title={editingLead ? 'Edit Lead' : 'Create New Lead'}
        description="Track a potential customer or business you've engaged with"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setLeadModalVisible(false)}>
              Cancel
            </Button>
            <Button type="submit" form="admin-lead-form">
              {editingLead ? 'Update' : 'Create'} Lead
            </Button>
          </>
        }
      >
        <Form {...leadForm}>
          <form id="admin-lead-form" onSubmit={leadForm.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={leadForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John Doe" />
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
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Acme Corp" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={leadForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} placeholder="john@example.com" />
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+233 XX XXX XXXX" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={leadForm.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leadSourceOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={leadForm.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === 'unassigned' ? null : value)} 
                      value={field.value || 'unassigned'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {platformAdmins.map(admin => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.name} ({admin.email})
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
                name="nextFollowUp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Follow-up Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                        onDateChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={leadForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Additional notes..." rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </form>
        </Form>
      </MobileFormDialog>

      {/* Add Activity Modal */}
      <MobileFormDialog
        open={activityModalVisible}
        onOpenChange={setActivityModalVisible}
        title="Add Activity"
        description="Log an interaction with this lead"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setActivityModalVisible(false)}>
              Cancel
            </Button>
            <Button type="submit" form="admin-activity-form">
              Add Activity
            </Button>
          </>
        }
      >
        <Form {...activityForm}>
          <form id="admin-activity-form" onSubmit={activityForm.handleSubmit(handleAddActivity)} className="space-y-4">
              <FormField
                control={activityForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activity Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Activity subject" />
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
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Activity details..." rows={4} />
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
                    <FormLabel>Follow-up Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                        onDateChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </form>
        </Form>
      </MobileFormDialog>

      {/* Convert to Job Modal */}
      <MobileFormDialog
        open={convertJobModalVisible}
        onOpenChange={setConvertJobModalVisible}
        title="Convert Lead to Job"
        description="Create a software project from this lead"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConvertJobModalVisible(false)}>
              Cancel
            </Button>
            <Button type="submit" form="admin-convert-job-form">
              Create Job
            </Button>
          </>
        }
      >
        <Form {...jobForm}>
          <form id="admin-convert-job-form" onSubmit={jobForm.handleSubmit(handleConvertToJob)} className="space-y-4">
              <FormField
                control={jobForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Project title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={jobForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Project description..." rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={jobForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={jobForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={jobForm.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === 'unassigned' ? null : value)} 
                      value={field.value || 'unassigned'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {platformAdmins.map(admin => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.name} ({admin.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={jobForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onDateChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={jobForm.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <DatePicker
                          date={field.value}
                          onDateChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={jobForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Project notes..." rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </form>
        </Form>
      </MobileFormDialog>

      {/* Lead Details Drawer */}
      <DetailsDrawer
        open={drawerVisible}
        onOpenChange={setDrawerVisible}
        title={viewingLead ? `${viewingLead.company || viewingLead.name}` : ''}
        loading={!viewingLead}
        onDelete={viewingLead && hasPermission('leads.manage') ? () => handleDelete(viewingLead) : undefined}
        deleteConfirmTitle="Delete this lead?"
        deleteConfirmText="This can't be undone."
        deleteButtonLabel="Delete"
        extraActions={
          viewingLead
            ? [
                {
                  key: 'add-activity',
                  label: 'Add Activity',
                  variant: 'secondary',
                  icon: <MessageSquare className="h-4 w-4" />,
                  onClick: () => {
                    activityForm.reset();
                    setActivityModalVisible(true);
                  }
                },
                viewingLead.status !== 'converted'
                  ? {
                      key: 'convert-to-job',
                      label: 'Convert to Job',
                      icon: <Briefcase className="h-4 w-4" />,
                      onClick: () => {
                        jobForm.reset({
                          title: `Project for ${viewingLead.company || viewingLead.name}`,
                          description: viewingLead.notes || '',
                          status: 'new',
                          priority: viewingLead.priority || 'medium',
                          assignedTo: viewingLead.assignedTo || null,
                          startDate: null,
                          dueDate: null,
                          notes: ''
                        });
                        setConvertJobModalVisible(true);
                      }
                    }
                  : null
              ].filter(Boolean)
            : []
        }
      >
        {viewingLead && (
          <>
            <DrawerSectionCard title="Lead Information">
              <Descriptions>
                <DescriptionItem label="Contact Name">{viewingLead.name}</DescriptionItem>
                <DescriptionItem label="Company">{viewingLead.company || '-'}</DescriptionItem>
                <DescriptionItem label="Email">
                  {viewingLead.email ? (
                    <a href={`mailto:${viewingLead.email}`} className="text-blue-600 hover:underline">
                      {viewingLead.email}
                    </a>
                  ) : '-'}
                </DescriptionItem>
                <DescriptionItem label="Phone">
                  {viewingLead.phone ? (
                    <a href={`tel:${viewingLead.phone}`} className="text-blue-600 hover:underline">
                      {viewingLead.phone}
                    </a>
                  ) : '-'}
                </DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={viewingLead.status} />
                </DescriptionItem>
                <DescriptionItem label="Priority">
                  <Badge className={PRIORITY_CHIP_CLASSES[viewingLead.priority] || STATUS_CHIP_DEFAULT_CLASS}>
                    {viewingLead.priority}
                  </Badge>
                </DescriptionItem>
                <DescriptionItem label="Source">{viewingLead.source || '-'}</DescriptionItem>
                <DescriptionItem label="Assigned To">
                  {viewingLead.assignee ? `${viewingLead.assignee.name} (${viewingLead.assignee.email})` : 'Unassigned'}
                </DescriptionItem>
                <DescriptionItem label="Next Follow-up">
                  {viewingLead.nextFollowUp ? dayjs(viewingLead.nextFollowUp).format('MMM D, YYYY') : '-'}
                </DescriptionItem>
                {viewingLead.notes && (
                  <DescriptionItem label="Notes">{viewingLead.notes}</DescriptionItem>
                )}
              </Descriptions>
            </DrawerSectionCard>

            {viewingLead.activities && viewingLead.activities.length > 0 && (
              <DrawerSectionCard title="Activity Timeline">
                <Timeline>
                  {viewingLead.activities.map((activity) => (
                    <TimelineItem key={activity.id}>
                      <TimelineIndicator>
                        {activity.type === 'call' && <Phone className="h-4 w-4" />}
                        {activity.type === 'email' && <Mail className="h-4 w-4" />}
                        {activity.type === 'meeting' && <Calendar className="h-4 w-4" />}
                        {activity.type === 'note' && <MessageSquare className="h-4 w-4" />}
                        {activity.type === 'task' && <Briefcase className="h-4 w-4" />}
                      </TimelineIndicator>
                      <TimelineContent>
                        <TimelineTitle>{activity.subject || activity.type}</TimelineTitle>
                        {activity.notes && <TimelineDescription>{activity.notes}</TimelineDescription>}
                        <TimelineTime>{dayjs(activity.createdAt).format('MMM D, YYYY h:mm A')}</TimelineTime>
                        {activity.createdByUser && (
                          <div className="text-xs text-gray-500 mt-1">
                            by {activity.createdByUser.name}
                          </div>
                        )}
                      </TimelineContent>
                    </TimelineItem>
                  ))}
                </Timeline>
              </DrawerSectionCard>
            )}
          </>
        )}
      </DetailsDrawer>

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filter Leads</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={filters.priority}
                onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select
                value={filters.source}
                onValueChange={(value) => setFilters(prev => ({ ...prev, source: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {leadSourceOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={filters.assignedTo || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {platformAdmins.map(admin => (
                    <SelectItem key={admin.id} value={admin.id}>
                      {admin.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setFilters({
                  status: 'all',
                  priority: 'all',
                  source: 'all',
                  assignedTo: '',
                  isActive: 'true'
                });
                setFilterDrawerOpen(false);
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AdminLeadBroadcastDialog
        open={broadcastModalVisible}
        onOpenChange={setBroadcastModalVisible}
      />
    </div>
  );
};

const BROADCAST_FETCH_LIMIT = 100; // server caps page size at MAX_PAGE_SIZE (default 100)

function AdminLeadBroadcastDialog({ open, onOpenChange }) {
  const [search, setSearch] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadOptions, setLeadOptions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const debouncedSearch = useDebounce(search, DEBOUNCE_DELAYS.SEARCH);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingLeads(true);
    adminService.getAdminLeads({ search: debouncedSearch || undefined, isActive: 'true', limit: BROADCAST_FETCH_LIMIT })
      .then((res) => {
        if (cancelled) return;
        setLeadOptions(res?.data || []);
      })
      .catch(() => {
        if (!cancelled) setLeadOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLeads(false);
      });
    return () => { cancelled = true; };
  }, [open, debouncedSearch]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setLeadOptions([]);
      setSelectedIds(new Set());
      setSubject('');
      setEmailBody('');
      setResult(null);
    }
  }, [open]);

  const contactableLeads = useMemo(
    () => leadOptions.filter((lead) => lead.email && !lead.doNotContact),
    [leadOptions]
  );

  const toggleLead = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(contactableLeads.map((lead) => lead.id)));
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      showError(null, 'Select at least one lead to message');
      return;
    }
    if (!subject.trim() || !emailBody.trim()) {
      showError(null, 'Email subject and message are required');
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await adminService.broadcastAdminLeads({
        leadIds: Array.from(selectedIds),
        subject: subject.trim(),
        emailBody,
      });
      setResult(res?.data || null);
      showSuccess(`Sent ${res?.data?.sent || 0} email${res?.data?.sent === 1 ? '' : 's'}`);
    } catch (err) {
      showError(err, err?.response?.data?.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <MobileFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Broadcast to leads"
      description="Email a personalized message to selected admin leads. Use {{name}} in the subject or message to insert each lead's name."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Hi {{name}}, quick update from ABS" />
          </div>
          <div className="space-y-1.5">
            <Label>Search leads</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, company, email..." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea rows={5} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Hi {{name}}, ..." />
        </div>

        <div className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">
              {loadingLeads ? 'Loading leads…' : `${contactableLeads.length} contactable, ${selectedIds.size} selected`}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={selectAllVisible} disabled={contactableLeads.length === 0}>
              Select all
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {contactableLeads.length === 0 && !loadingLeads ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No leads with an email address match this search.</p>
            ) : (
              contactableLeads.map((lead) => (
                <label key={lead.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleLead(lead.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{lead.name || lead.company || 'Lead'}</span>
                    <span className="block text-xs text-muted-foreground truncate">{lead.email}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {result ? (
          <div className="rounded-md border border-border p-3 text-sm">
            <p><span className="text-muted-foreground">Sent:</span> {result.sent} · <span className="text-muted-foreground">Skipped:</span> {result.skipped} · <span className="text-muted-foreground">Failed:</span> {result.failed?.length || 0}</p>
          </div>
        ) : null}
      </div>
    </MobileFormDialog>
  );
}

export default AdminLeads;
