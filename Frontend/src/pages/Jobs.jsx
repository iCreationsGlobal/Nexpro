import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useCurrency } from '../hooks/useCurrency';
import { useResponsive } from '../hooks/useResponsive';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, XCircle, Loader2, MinusCircle, FileText, Clock, CheckCircle, User, Edit, PauseCircle, X, Upload, Paperclip, Download, Currency, Eye, ChevronLeft, ChevronRight, Filter, RefreshCw, Briefcase, AlertCircle, Trash2 } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import jobService from '../services/jobService';
import { useSmartSearch } from '../context/SmartSearchContext';
import {
  SEARCH_PLACEHOLDERS,
  DEBOUNCE_DELAYS,
  PRIORITY_CHIP_CLASSES,
  STATUS_CHIP_CLASSES,
  STATUS_CHIP_DEFAULT_CLASS,
  DELIVERY_STATUS_LABELS,
} from '../constants';
import customerService from '../services/customerService';
import invoiceService from '../services/invoiceService';
import pricingService from '../services/pricingService';
import userService from '../services/userService';
import customDropdownService from '../services/customDropdownService';
import settingsService from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import dayjs from 'dayjs';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import MobileFormDialog from '../components/MobileFormDialog';
import DrawerSectionCard from '../components/DrawerSectionCard';
import FileUpload from '../components/FileUpload';
import FilePreview from '../components/FilePreview';
import PhoneNumberInput from '../components/PhoneNumberInput';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { showSuccess, showError, showWarning, showInfo } from '../utils/toast';
import {
  hasUnresolvedOtherCategory,
  resolveOtherCategoryItems,
  collectResolvedCategories,
} from '../utils/customDropdownOther';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import JobCreatePaymentFields from '../components/JobCreatePaymentFields';
import {
  JOB_CREATE_PAYMENT_DEFAULTS,
  buildJobCreatePaymentPayload,
} from '../utils/jobCreatePayment';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { numberInputValue, handleNumberChange, handleIntegerChange, numberOrEmptySchema, integerOrEmptySchema } from '../utils/formUtils';
import { QUERY_STALE, refreshAfterCustomerChange, refreshAfterJobChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';

/** Flatten react-hook-form FieldErrors into a list of readable messages (with field context e.g. "Item 1 – Category is required"). */
function getJobFormErrorMessages(errors) {
  if (!errors || typeof errors !== 'object') return [];
  const messages = [];
  const fieldLabels = {
    customerId: 'Customer',
    title: 'Job title',
    description: 'Description',
    startDate: 'Start date',
    dueDate: 'Due date',
    assignedTo: 'Assign to',
    status: 'Status',
    priority: 'Priority',
    deliveryRequired: 'Delivery required',
    category: 'Category',
    quantity: 'Quantity',
    unitPrice: 'Unit price',
    discountAmount: 'Discount',
  };
  function walk(obj, context = '') {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.message === 'string') {
      messages.push(context ? `${context}: ${obj.message}` : obj.message);
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'root') continue;
      const label = fieldLabels[key] || key;
      const isItemIndex = /^\d+$/.test(key);
      const nextContext = isItemIndex
        ? `Item ${Number(key) + 1}`
        : context && context.startsWith('Item ')
          ? context
          : context ? `${context} – ${label}` : label;
      walk(value, nextContext);
    }
  }
  walk(errors);
  return messages;
}

const jobItemSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Item description is required'),
  quantity: integerOrEmptySchema(z, 1).refine((v) => v >= 1, 'Quantity must be at least 1'),
  unitPrice: numberOrEmptySchema(z),
  discountAmount: numberOrEmptySchema(z),
  paperSize: z.string().optional(),
  pricingMethod: z.string().optional(),
  itemHeight: z.number().optional(),
  itemWidth: z.number().optional(),
  itemUnit: z.string().optional(),
  pricePerSquareFoot: z.number().optional(),
  discountPercent: z.number().optional(),
  discountReason: z.string().optional(),
});

const jobSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  title: z.string().optional(),
  status: z.enum(['new', 'in_progress', 'completed', 'on_hold', 'cancelled']).default('new'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  deliveryRequired: z.boolean().default(false),
  startDate: z.union([z.date(), z.null(), z.undefined()]).optional(),
  dueDate: z.union([z.date(), z.null(), z.undefined()]).optional(),
  assignedTo: z.string().optional().nullable(),
  description: z.string().nullable().optional(),
  items: z.array(jobItemSchema).min(1, 'At least one item is required'),
  paymentStatus: z.enum(['unpaid', 'deposit', 'paid']).default('unpaid'),
  paymentAmount: z.union([z.number(), z.string(), z.literal('')]).optional(),
  paymentMethod: z.string().optional().or(z.literal('')),
  paymentReference: z.string().optional(),
  paymentNotes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.paymentStatus === 'unpaid') return;
  if (!data.paymentMethod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Payment method is required',
      path: ['paymentMethod'],
    });
  }
  if (data.paymentStatus !== 'deposit') return;
  const amount = parseFloat(data.paymentAmount);
  const total = calculateJobItemsPricing(data.items).grandTotal;
  if (!(amount > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Deposit amount must be greater than 0',
      path: ['paymentAmount'],
    });
  } else if (total > 0 && amount >= total - 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Deposit must be less than the job total. Choose Paid in full instead.',
      path: ['paymentAmount'],
    });
  }
});

const toJobMoneyNumber = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundJobMoney = (value) => Math.round(toJobMoneyNumber(value) * 100) / 100;

const calculateJobLinePricing = (item = {}) => {
  const quantity = Math.max(0, toJobMoneyNumber(item.quantity, 0));
  const unitPrice = Math.max(0, toJobMoneyNumber(item.unitPrice, 0));
  const subtotal = roundJobMoney(quantity * unitPrice);
  const requestedDiscount = Math.max(0, toJobMoneyNumber(item.discountAmount, 0));
  const discount = roundJobMoney(Math.min(requestedDiscount, subtotal));
  const total = roundJobMoney(Math.max(0, subtotal - discount));

  return { quantity, unitPrice, subtotal, discount, total };
};

const calculateJobItemsPricing = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (totals, item) => {
      const line = calculateJobLinePricing(item);
      return {
        subtotal: roundJobMoney(totals.subtotal + line.subtotal),
        totalDiscount: roundJobMoney(totals.totalDiscount + line.discount),
        grandTotal: roundJobMoney(totals.grandTotal + line.total),
      };
    },
    { subtotal: 0, totalDiscount: 0, grandTotal: 0 }
  );

const assignmentSchema = z.object({
  assignedTo: z.string().optional().nullable(),
});

const statusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'completed', 'on_hold', 'cancelled']),
  statusComment: z.string().optional(),
});

const customerSchema = z.object({
  name: z.string().min(1, 'Enter customer name'),
  company: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  howDidYouHear: z.string().optional().or(z.literal('')),
  referralName: z.string().optional(),
});

const uploadMaxSizeMb = Number.parseFloat(import.meta.env.VITE_UPLOAD_MAX_SIZE_MB ?? '') || 20;

const Jobs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTenantId, activeTenant, isAdmin } = useAuth();
  const {
    scopeReady,
    activeShopId,
    activeStudioLocationId,
    activeStudioLocation,
    isStudioWorkspace,
    canAccessAllStudioLocations,
  } = useWorkspaceScope();
  const { isMobile } = useResponsive();
  const queryClient = useQueryClient();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { formatAmount } = useCurrency();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({ 
    status: 'all',
    priority: 'all',
    customerId: 'all',
    dueDate: 'all'
  });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const effectiveStudioType =
    activeStudioLocation?.studioType ||
    activeTenant?.metadata?.studioType ||
    activeTenant?.businessType;
  const effectiveBusinessSubType =
    activeStudioLocation?.studioType ||
    activeTenant?.metadata?.businessSubType;
  const isSoftwareTenant = effectiveBusinessSubType === 'software_it_services';
  
  const form = useForm({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customerId: '',
      title: '',
      status: 'new',
      priority: 'medium',
      deliveryRequired: false,
      startDate: null,
      dueDate: null,
      assignedTo: null,
      description: '',
      items: [{ category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 }],
      ...JOB_CREATE_PAYMENT_DEFAULTS,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const watchedItems = useWatch({
    control: form.control,
    name: 'items',
    defaultValue: form.getValues('items'),
  }) || [];
  const jobPricingTotals = useMemo(
    () => calculateJobItemsPricing(watchedItems),
    [watchedItems]
  );
  const [jobInvoices, setJobInvoices] = useState({});
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedTemplates, setSelectedTemplates] = useState({});
  const [customJobType, setCustomJobType] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [attachmentPreviewVisible, setAttachmentPreviewVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [jobBeingAssigned, setJobBeingAssigned] = useState(null);
  const assignmentForm = useForm({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      assignedTo: null,
    },
  });
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [jobBeingUpdated, setJobBeingUpdated] = useState(null);
  const [updatingJobDelivery, setUpdatingJobDelivery] = useState(false);
  const statusForm = useForm({
    resolver: zodResolver(statusSchema),
    defaultValues: {
      status: 'new',
      statusComment: '',
    },
  });
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const customerForm = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      howDidYouHear: '',
      referralName: '',
    },
  });
  const [submittingJob, setSubmittingJob] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [updatingAssignment, setUpdatingAssignment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showReferralName, setShowReferralName] = useState(false);
  const [categoryOtherInputs, setCategoryOtherInputs] = useState({}); // Track "Other" inputs per item index
  const [showCustomerSourceOtherInput, setShowCustomerSourceOtherInput] = useState(false);
  const [customerSourceOtherValue, setCustomerSourceOtherValue] = useState('');
  const [showRegionOtherInput, setShowRegionOtherInput] = useState(false);
  const [regionOtherValue, setRegionOtherValue] = useState('');
  const [editingJobId, setEditingJobId] = useState(null);
  const jobFormRef = useRef(null);

  // Invalidate jobs query - defined early to avoid temporal dead zone
  const invalidateJobs = useCallback(() => {
    refreshAfterJobChange(queryClient);
  }, [queryClient]);

  // Job type configurations
  const jobTypeConfig = {
    'Instant Service': {
      types: ['Photocopying', 'Scanning', 'Printing', 'Lamination', 'Binding'],
      hideFields: ['startDate', 'dueDate', 'priority'],
      defaultValues: { priority: 'urgent', status: 'in_progress' },
      titleFormat: (type, customer) => `${type} for ${customer?.name || 'Customer'}`,
      descriptionFormat: (type) => `Quick ${type.toLowerCase()} service`,
      isInstant: true
    },
    'Standard Printing': {
      types: ['Business Cards', 'Flyers', 'Brochures', 'Posters', 'Banners', 'Booklets'],
      hideFields: [],
      defaultValues: { priority: 'medium', status: 'new' },
      titleFormat: (type, customer) => `${type} - ${customer?.name || 'Customer'}`,
      descriptionFormat: (type, customer) => `${type} service for ${customer?.company || customer?.name || 'customer'}`,
      isInstant: false
    },
    'Large Format': {
      types: ['Large Format Printing', 'Banners', 'Posters'],
      hideFields: [],
      defaultValues: { priority: 'medium', status: 'new' },
      titleFormat: (type, customer) => `${type} - ${customer?.name || 'Customer'}`,
      descriptionFormat: (type) => `Large format ${type.toLowerCase()} project`,
      isInstant: false
    },
    'Design & Custom': {
      types: ['Design & Print', 'Design Services', 'Custom Work', 'Other'],
      hideFields: [],
      defaultValues: { priority: 'high', status: 'new' },
      titleFormat: (type, customer) => `${type} for ${customer?.name || 'Customer'}`,
      descriptionFormat: (type, customer) => `Custom ${type.toLowerCase()} project for ${customer?.company || customer?.name || 'customer'}`,
      isInstant: false
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const getJobTypeCategory = (jobType) => {
    for (const [category, config] of Object.entries(jobTypeConfig)) {
      if (config.types.includes(jobType)) {
        return config;
      }
    }
    return jobTypeConfig['Standard Printing']; // default
  };

  // Pull-to-refresh hook
  const { isRefreshing, pullDistance, containerProps } = usePullToRefresh(
    () => {
      refreshAfterJobChange(queryClient);
      setRefreshingJobs(true);
      setTimeout(() => setRefreshingJobs(false), 500);
    },
    { enabled: isMobile }
  );

  useEffect(() => {
    setPageSearchConfig({ scope: 'jobs', placeholder: SEARCH_PLACEHOLDERS.JOBS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  const jobQueryParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };
    if (filters.status !== 'all') params.status = filters.status;
    if (filters.customerId !== 'all') params.customerId = filters.customerId;
    if (filters.priority !== 'all') params.priority = filters.priority;
    if (filters.dueDate !== 'all') params.dueDate = filters.dueDate;
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [debouncedSearch, filters.customerId, filters.dueDate, filters.priority, filters.status, pagination.current, pagination.pageSize]);

  const { data: summaryResponse, isLoading: summaryLoading } = useQuery({
    queryKey: queryKeys.jobs.stats(activeTenantId, activeShopId, activeStudioLocationId),
    queryFn: () => jobService.getStats(),
    enabled: scopeReady,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const summary = summaryResponse?.data || summaryResponse || null;

  const {
    data: jobsQueryResult,
    isLoading: isJobsLoading,
    isFetching: isJobsFetching,
    error: jobsError,
  } = useQuery({
    queryKey: queryKeys.jobs.list(activeTenantId, activeShopId, activeStudioLocationId, jobQueryParams),
    queryFn: async () => {
      try {
        const response = await jobService.getAll(jobQueryParams);
        return response;
      } catch (error) {
        console.error('Error in queryFn:', error);
        throw error;
      }
    },
    keepPreviousData: true,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    enabled: scopeReady && (!isStudioWorkspace || !!activeStudioLocationId || canAccessAllStudioLocations),
  });

  // Use backend pagination directly
  const jobs = useMemo(() => jobsQueryResult?.data || [], [jobsQueryResult?.data]);
  const jobsCount = jobsQueryResult?.count || 0;
  
  useEffect(() => {
    console.log('Jobs Query Result:', jobsQueryResult);
    console.log('Jobs array:', jobs);
    console.log('Jobs count:', jobsCount);
  }, [jobsQueryResult, jobs, jobsCount]);

  useEffect(() => {
    const totalCount = jobsQueryResult?.count || 0;
    setPagination((prev) => (prev.total === totalCount ? prev : { ...prev, total: totalCount }));
  }, [jobsQueryResult?.count]);

  useEffect(() => {
    if (jobsError) {
      console.error('Failed to load jobs:', jobsError);
      showError('Failed to load jobs');
    }
  }, [jobsError]);

  // Use React Query for customers, templates, and team members with caching
  const { data: customersData = [], isLoading: customersLoading } = useQuery({
    queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, activeStudioLocationId, 'jobs-picker'),
    queryFn: async () => {
      const response = await customerService.getAll({ limit: 100 });
      return response.data || [];
    },
    enabled: scopeReady,
    staleTime: QUERY_STALE.METADATA,
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: pricingTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['pricingTemplates', 'active', activeTenantId, activeShopId, activeStudioLocationId, effectiveStudioType],
    queryFn: async () => {
      const response = await pricingService.getAll({ limit: 100, isActive: 'true' });
      return response.data || [];
    },
    enabled: scopeReady,
    staleTime: QUERY_STALE.METADATA,
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: teamMembers = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: ['teamMembers', 'active'],
    queryFn: async () => {
      const response = await userService.getAll({ limit: 100, isActive: 'true' });
      return response.data || [];
    },
    staleTime: QUERY_STALE.METADATA,
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: customCategories = [] } = useQuery({
    queryKey: ['customCategories'],
    queryFn: async () => {
      return await customDropdownService.getCustomOptions('job_category') || [];
    },
    staleTime: QUERY_STALE.SLOW,
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: lineItemDescriptionOptions = [] } = useQuery({
    queryKey: ['customLineItemDescriptions', activeTenantId],
    queryFn: async () => {
      return await customDropdownService.getCustomOptions('line_item_description') || [];
    },
    enabled: !!activeTenantId,
    staleTime: QUERY_STALE.SLOW,
    cacheTime: 30 * 60 * 1000,
  });

  const { data: jobItemCategoriesApi = [] } = useQuery({
    queryKey: queryKeys.jobs.categories(activeTenantId, activeStudioLocationId, effectiveStudioType),
    queryFn: () => jobService.getCategories(),
    enabled: scopeReady,
    staleTime: QUERY_STALE.METADATA,
  });

  const jobItemCategoriesGrouped = useMemo(() => {
    const apiCats = Array.isArray(jobItemCategoriesApi?.data) ? jobItemCategoriesApi.data : (Array.isArray(jobItemCategoriesApi) ? jobItemCategoriesApi : []);
    const byGroup = new Map();
    apiCats.forEach(cat => {
      const group = cat.group || 'Other';
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push({ value: cat.value, label: cat.label });
    });
    return byGroup;
  }, [jobItemCategoriesApi]);

  const persistedCustomCategories = useMemo(() => {
    const builtIn = new Set();
    jobItemCategoriesGrouped.forEach((groupItems) => {
      groupItems.forEach((cat) => builtIn.add(String(cat.value || '').toLowerCase()));
    });
    return (Array.isArray(customCategories) ? customCategories : []).filter((cat) => {
      const value = String(cat?.value || '').trim();
      if (!value || value === '__OTHER__') return false;
      return !builtIn.has(value.toLowerCase());
    });
  }, [customCategories, jobItemCategoriesGrouped]);

  const getItemDescriptionPlaceholder = useCallback(
    (category) => {
      // Default placeholder before a category is chosen
      if (!category) {
        return isSoftwareTenant
          ? 'e.g., Website or app feature, scope, and deliverables'
          : 'e.g., Full color, double-sided, glossy finish';
      }

      switch (category) {
        case 'Discovery & Planning':
          return 'e.g., Requirements workshop, technical scoping, product roadmap';
        case 'UI/UX Design':
          return 'e.g., Landing page and dashboard designs, user flows, design system';
        case 'Frontend Development':
          return 'e.g., React/Next.js frontend for customer portal and admin dashboard';
        case 'Backend & API Development':
          return 'e.g., REST/GraphQL APIs for orders, payments, and reporting';
        case 'Mobile App Development':
          return 'e.g., iOS & Android app for customers (Expo/React Native)';
        case 'Testing & QA':
          return 'e.g., Regression testing, automated test suite, UAT support';
        case 'DevOps & Infrastructure':
          return 'e.g., CI/CD pipelines, cloud environment setup, monitoring';
        case 'Maintenance & Support':
          return 'e.g., Monthly support, bug fixes, and minor feature updates';
        default:
          return isSoftwareTenant
            ? 'e.g., Feature breakdown, module, or service description'
            : 'e.g., Full color, double-sided, glossy finish';
      }
    },
    [isSoftwareTenant]
  );

useEffect(() => {
  if (assignModalVisible && jobBeingAssigned) {
    assignmentForm.reset({
      assignedTo: jobBeingAssigned.assignedTo || null
    });
  }
}, [assignModalVisible, jobBeingAssigned, assignmentForm]);

useEffect(() => {
  if (statusModalVisible && jobBeingUpdated) {
    statusForm.reset({
      status: jobBeingUpdated.status,
      statusComment: ''
    });
  }
}, [statusModalVisible, jobBeingUpdated, statusForm]);



  const refreshJobDetails = async (jobId) => {
    const response = await jobService.getById(jobId);
    const jobDetails = response?.data || response;
    if (!jobDetails) throw new Error('Failed to fetch job details');
    jobDetails.attachments = Array.isArray(jobDetails.attachments) ? jobDetails.attachments : [];
    try {
      await checkJobInvoice(jobId);
    } catch (error) {
      console.error('Failed to check job invoice:', error);
    }
    setViewingJob((prev) => (prev?.id === jobId ? jobDetails : prev));
    return jobDetails;
  };

  const handleView = useCallback((job) => {
    setViewingJob(job);
    setDrawerVisible(true);
    setJobDetailsLoading(true);
    refreshJobDetails(job.id)
      .catch((error) => {
        console.error('Failed to load job details:', error);
        if (!job?.id) showError('Failed to load job details');
      })
      .finally(() => setJobDetailsLoading(false));
  }, []);

  // Check if coming from dashboard with openModal flag
  useEffect(() => {
    if (location.state?.openModal) {
      // Clear the state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: {} });
      // Open the job modal after a short delay
      setTimeout(() => {
        handleAddJob();
      }, 100);
    }
  }, [location.state]);

  // Check if coming from customer page with customerId query parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const customerId = searchParams.get('customerId');
    if (customerId && customersData.length > 0 && !modalVisible) {
      // Clear the query parameter to prevent reopening on refresh
      navigate(location.pathname, { replace: true });
      // Open the job modal first
      handleAddJob();
      // Set customer after modal opens and form is reset
      // Use a longer delay to ensure form reset is complete
      setTimeout(() => {
        const customer = customersData.find(c => c.id === customerId);
        if (customer) {
          form.setValue('customerId', customerId);
          setSelectedCustomer(customer);
          // Trigger form validation/update
          form.trigger('customerId');
        }
      }, 300);
    }
  }, [location.search, customersData, modalVisible]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false);
    setViewingJob(null);
    setJobDetailsLoading(false);
  }, []);

  const handleDeleteJob = useCallback(async (id) => {
    try {
      await jobService.delete(id);
      showSuccess('Job deleted successfully');
      refreshAfterJobChange(queryClient);
      setJobToDelete(null);
      if (viewingJob?.id === id) {
        handleCloseDrawer();
      }
    } catch (error) {
      showError(error, 'Failed to delete job');
    }
  }, [queryClient, viewingJob?.id, handleCloseDrawer]);

  const checkJobInvoice = async (jobId) => {
    try {
      const response = await invoiceService.getAll({ jobId, limit: 1 });
      if (response.data && response.data.length > 0) {
        setJobInvoices(prev => ({ ...prev, [jobId]: response.data[0] }));
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error('Failed to check job invoice:', error);
      return null;
    }
  };

  const openAssignModal = (job) => {
    setJobBeingAssigned(job);
    setAssignModalVisible(true);
  };

  const closeAssignModal = () => {
    setAssignModalVisible(false);
    setJobBeingAssigned(null);
    assignmentForm.reset();
  };

  const handleAssignmentSubmit = useCallback(async (values) => {
    if (!jobBeingAssigned) {
      return;
    }

    const jobId = jobBeingAssigned.id;
    const { assignedTo } = values;

    try {
      setUpdatingAssignment(true);
      await jobService.update(jobId, { assignedTo: assignedTo || null });
      showSuccess(assignedTo ? 'Job assigned successfully' : 'Job assignment cleared');
      closeAssignModal();
      invalidateJobs();

      if (drawerVisible && viewingJob?.id === jobId) {
        try {
          await refreshJobDetails(jobId);
        } catch (error) {
          console.error('Failed to refresh job details:', error);
        }
      }
    } catch (error) {
      showError(error.error || 'Failed to update job assignment');
    } finally {
      setUpdatingAssignment(false);
    }
  }, [queryClient, jobBeingAssigned, drawerVisible, viewingJob, closeAssignModal, invalidateJobs]);

  const handleAttachmentUpload = useCallback(async ({ file, onSuccess, onError }) => {
    if (!viewingJob) {
      onError && onError(new Error('No job selected'));
      return;
    }

    try {
      setUploadingAttachment(true);
      await jobService.uploadAttachment(viewingJob.id, file);
      await refreshJobDetails(viewingJob.id);
      showSuccess(`${file.name} uploaded successfully`);
      if (onSuccess) onSuccess('ok', file);
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      const errMsg = error?.response?.data?.message || 'Failed to upload attachment';
      showError(errMsg);
      if (onError) onError(error);
    } finally {
      setUploadingAttachment(false);
    }
  }, [viewingJob]);

  const handleAttachmentRemove = useCallback(async (attachment) => {
    if (!viewingJob) return;
    try {
      await jobService.deleteAttachment(viewingJob.id, attachment.id);
      await refreshJobDetails(viewingJob.id);
      showSuccess('Attachment removed');
    } catch (error) {
      console.error('Failed to remove attachment:', error);
      const errMsg = error?.response?.data?.message || 'Failed to remove attachment';
      showError(errMsg);
    }
  }, [viewingJob]);

  const handleAttachmentPreview = useCallback((attachment) => {
    setAttachmentPreview(attachment);
    setAttachmentPreviewVisible(true);
  }, []);

  const handleCloseAttachmentPreview = useCallback(() => {
    setAttachmentPreviewVisible(false);
    setAttachmentPreview(null);
  }, []);

  const attachmentList = Array.isArray(viewingJob?.attachments) ? viewingJob.attachments : [];

  const openStatusModal = (job) => {
    setJobBeingUpdated(job);
    setStatusModalVisible(true);
  };

  const closeStatusModal = () => {
    setStatusModalVisible(false);
    setJobBeingUpdated(null);
    statusForm.reset();
  };

  const handleStatusSubmit = useCallback(async ({ status, statusComment }) => {
    if (!jobBeingUpdated) {
      return;
    }

    const jobId = jobBeingUpdated.id;

    try {
      setUpdatingStatus(true);
      await jobService.update(jobId, {
        status,
        statusComment: statusComment || undefined
      });
      showSuccess('Job status updated successfully');
      closeStatusModal();
      invalidateJobs();

      if (drawerVisible && viewingJob?.id === jobId) {
        try {
          await refreshJobDetails(jobId);
        } catch (error) {
          console.error('Failed to refresh job details:', error);
        }
      }
    } catch (error) {
      showError(error.error || 'Failed to update job status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [queryClient, jobBeingUpdated, drawerVisible, viewingJob, closeStatusModal, invalidateJobs]);

  const handleJobDeliveryRequiredChange = useCallback(
    async (checked) => {
      if (!viewingJob) return;
      try {
        setUpdatingJobDelivery(true);
        await jobService.update(viewingJob.id, {
          deliveryRequired: checked,
          ...(!checked ? { deliveryStatus: null } : {}),
        });
        await refreshJobDetails(viewingJob.id);
        showSuccess(checked ? 'Delivery marked as required' : 'Delivery not required for this job');
        invalidateJobs();
      } catch (error) {
        showError(error?.response?.data?.message || error?.message || 'Failed to update delivery setting');
      } finally {
        setUpdatingJobDelivery(false);
      }
    },
    [viewingJob, refreshJobDetails, invalidateJobs]
  );

  const handleAddJob = useCallback(async () => {
    setEditingJobId(null);
    form.reset({
      customerId: '',
      title: '',
      status: 'new',
      priority: 'medium',
      deliveryRequired: false,
      startDate: null,
      dueDate: null,
      assignedTo: null,
      description: '',
      items: [{ category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 }],
      ...JOB_CREATE_PAYMENT_DEFAULTS,
    });
    setSelectedJobType(null);
    setSelectedCustomer(null);
    setSelectedTemplates({});
    setCustomJobType('');
    setCategoryOtherInputs({}); // Clear category "Other" inputs
    setModalVisible(true);
    
    // Prefetch data if not already cached (React Query handles caching automatically)
    queryClient.prefetchQuery({
      queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, activeStudioLocationId, 'jobs-picker'),
      queryFn: async () => {
        const response = await customerService.getAll({ limit: 100 });
        return response.data || [];
      },
    });
    queryClient.prefetchQuery({
      queryKey: ['pricingTemplates', 'active', activeTenantId, activeShopId, activeStudioLocationId, effectiveStudioType],
      queryFn: async () => {
        const response = await pricingService.getAll({ limit: 100, isActive: 'true' });
        return response.data || [];
      },
    });
  }, [queryClient, form, activeTenantId, activeShopId, activeStudioLocationId, effectiveStudioType]);

  // Update job title and description based on job type and customer
  // Defined early to avoid temporal dead zone (used in handleEdit)
  const updateJobTitleAndDescription = useCallback((jobType, customer, customLabel) => {
    if (!jobType || !customer) return;

    const effectiveLabel = (customLabel && customLabel.trim().length > 0) ? customLabel.trim() : jobType;
    if (!effectiveLabel) return;

    const configKey = jobType === 'Other' ? 'Other' : jobType;
    const config = getJobTypeCategory(configKey);
    const title = config.titleFormat(effectiveLabel, customer);
    const description = config.descriptionFormat(effectiveLabel, customer);

    form.setValue('title', title);
    form.setValue('description', description);
  }, [form]);

  // Handle customer change - defined early to avoid temporal dead zone (used in handleEdit)
  const handleCustomerChange = useCallback((customerId) => {
    const customer = customersData.find(c => c.id === customerId);
    setSelectedCustomer(customer);
    const baseJobType = selectedJobType === 'Other' ? 'Other' : selectedJobType;
    const labelOverride = selectedJobType === 'Other' ? customJobType : undefined;
    updateJobTitleAndDescription(baseJobType, customer, labelOverride);
  }, [customersData, selectedJobType, customJobType, updateJobTitleAndDescription]);

  const handleEdit = useCallback(async (job) => {
    try {
      setEditingJobId(job.id);
      
      // Fetch full job details with items (parallel with prefetching)
      const [jobDetailsResult] = await Promise.all([
        jobService.getById(job.id),
        // Prefetch customers and templates if not cached
        queryClient.prefetchQuery({
          queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, activeStudioLocationId, 'jobs-picker'),
          queryFn: async () => {
            const response = await customerService.getAll({ limit: 100 });
            return response.data || [];
          },
        }),
        queryClient.prefetchQuery({
          queryKey: ['pricingTemplates', 'active', activeTenantId, activeShopId, activeStudioLocationId, effectiveStudioType],
          queryFn: async () => {
            const response = await pricingService.getAll({ limit: 100, isActive: 'true' });
            return response.data || [];
          },
        }),
      ]);
      
      const jobDetails = jobDetailsResult;
      const jobData = jobDetails.data || jobDetails;
      
      // Use cached data from React Query
      const customersList = customersData || [];
      const templatesList = pricingTemplates || [];
      
      // Set customer
      if (jobData.customerId) {
        const customer = customersList.find(c => c.id === jobData.customerId) || 
                        (jobDetails.data?.customer || jobData.customer);
        if (customer) {
          setSelectedCustomer(customer);
          handleCustomerChange(jobData.customerId);
        }
      }
      
      // Set job type
      if (jobData.jobType) {
        setSelectedJobType(jobData.jobType);
      }
      
      // Format dates for form - convert to Date objects for DatePicker
      const formData = {
        ...jobData,
        customerId: jobData.customerId,
        deliveryRequired:
          jobData.deliveryRequired === false
            ? false
            : jobData.deliveryRequired === true || !!jobData.deliveryStatus,
        startDate: jobData.startDate ? (dayjs(jobData.startDate).isValid() ? dayjs(jobData.startDate).toDate() : null) : null,
        dueDate: jobData.dueDate ? (dayjs(jobData.dueDate).isValid() ? dayjs(jobData.dueDate).toDate() : null) : null,
        assignedTo: jobData.assignedTo || null,
        description: jobData.description || '',
        items: (jobData.items || []).map(item => {
          const unitPrice = typeof item.unitPrice === 'string'
            ? parseFloat(item.unitPrice.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
            : (typeof item.unitPrice === 'number' ? item.unitPrice : 0);
          const quantity = typeof item.quantity === 'string'
            ? parseFloat(item.quantity) || 1
            : (typeof item.quantity === 'number' ? item.quantity : 1);
          const explicitDiscount = typeof item.discountAmount === 'string'
            ? parseFloat(item.discountAmount.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
            : (typeof item.discountAmount === 'number' ? item.discountAmount : 0);
          const gross = quantity * unitPrice;
          const storedTotal = item.totalPrice == null ? gross : toJobMoneyNumber(item.totalPrice, gross);
          const derivedDiscount = Math.max(0, gross - storedTotal);

          return {
            ...item,
            // Normalize nullable text fields so Zod string schema does not receive null
            category: item.category ?? '',
            description: item.description ?? '',
            paperSize: item.paperSize ?? undefined,
            pricingMethod: item.pricingMethod ?? undefined,
            itemUnit: item.itemUnit ?? undefined,
            discountReason: item.discountReason ?? undefined,
            // Normalize nullable numeric optional fields
            itemHeight: item.itemHeight == null ? undefined : Number(item.itemHeight),
            itemWidth: item.itemWidth == null ? undefined : Number(item.itemWidth),
            pricePerSquareFoot: item.pricePerSquareFoot == null ? undefined : Number(item.pricePerSquareFoot),
            discountPercent: item.discountPercent == null ? undefined : Number(item.discountPercent),
            unitPrice,
            quantity,
            discountAmount: roundJobMoney(explicitDiscount > 0 ? explicitDiscount : derivedDiscount),
          };
        }),
        ...JOB_CREATE_PAYMENT_DEFAULTS,
      };
      
        // Set form values
        form.reset(formData);
      
      // Set selected templates for items
      if (jobData.items && jobData.items.length > 0) {
        const templates = {};
        jobData.items.forEach((item, index) => {
          // Try to find matching template
          const matchingTemplate = templatesList.find(t => 
            t.category === item.category && 
            t.materialType === item.materialType
          );
          if (matchingTemplate) {
            templates[index] = matchingTemplate;
          }
        });
        setSelectedTemplates(templates);
      }
      
      setModalVisible(true);
    } catch (error) {
      showError('Failed to load job details');
      console.error('Error loading job:', error);
      setEditingJobId(null);
    }
  }, [
    queryClient,
    navigate,
    customersData,
    pricingTemplates,
    handleCustomerChange,
    activeTenantId,
    activeShopId,
    activeStudioLocationId,
    effectiveStudioType,
  ]);


  // Load custom customer sources and regions on mount (categories already loaded via React Query)
  const { data: customCustomerSources = [] } = useQuery({
    queryKey: ['customCustomerSources'],
    queryFn: async () => {
      return await customDropdownService.getCustomOptions('customer_source') || [];
    },
    staleTime: QUERY_STALE.SLOW,
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: customerSourceOptionsApi = [] } = useQuery({
    queryKey: ['settings', 'customer-sources', activeTenantId],
    queryFn: () => settingsService.getCustomerSources(),
    enabled: !!activeTenantId,
    staleTime: QUERY_STALE.METADATA,
  });

  const { data: customRegions = [] } = useQuery({
    queryKey: ['customRegions'],
    queryFn: async () => {
      return await customDropdownService.getCustomOptions('region') || [];
    },
    staleTime: QUERY_STALE.SLOW,
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  // Handle category change (including "Other")
  const handleCategoryChange = async (value, itemIndex) => {
    if (value === '__OTHER__') {
      // Show input for custom category
      setCategoryOtherInputs(prev => ({ ...prev, [itemIndex]: '' }));
    } else {
      // Hide input if not "Other"
      setCategoryOtherInputs(prev => {
        const newState = { ...prev };
        delete newState[itemIndex];
        return newState;
      });
    }
  };

  // Save custom category
  const handleSaveCustomCategory = async (customValue, itemIndex) => {
    if (!customValue || !customValue.trim()) {
      showWarning('Please enter a category name');
      return;
    }

    try {
      const saved = await customDropdownService.saveCustomOption('job_category', customValue.trim());
      if (saved) {
        // Invalidate and refetch custom categories
        queryClient.invalidateQueries({ queryKey: ['customCategories'] });
        
        // Immutable update so react-hook-form / useFieldArray pick up the new category
        const currentItems = form.getValues('items') || [];
        const nextItems = currentItems.map((row, i) =>
          i === itemIndex ? { ...row, category: saved.value } : row
        );
        form.setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
        
        // Clear the "Other" input
        setCategoryOtherInputs(prev => {
          const newState = { ...prev };
          delete newState[itemIndex];
          return newState;
        });
        
        showSuccess(`"${saved.label}" added to categories`);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save custom category');
    }
  };

  const handleAddNewCustomer = useCallback(() => {
    customerForm.reset();
    setShowReferralName(false);
    setShowCustomerSourceOtherInput(false);
    setCustomerSourceOtherValue('');
    setShowRegionOtherInput(false);
    setRegionOtherValue('');
    setCustomerModalVisible(true);
  }, [customerForm]);

  const handleHowDidYouHearChange = useCallback((value) => {
    if (value === '__OTHER__') {
      setShowCustomerSourceOtherInput(true);
      setShowReferralName(false);
      customerForm.setValue('referralName', undefined);
    } else {
      setShowCustomerSourceOtherInput(false);
      setShowReferralName(value === 'Referral');
      if (value !== 'Referral') {
        customerForm.setValue('referralName', undefined);
      }
    }
  }, [customerForm]);

  // Save custom customer source
  const handleSaveCustomCustomerSource = async () => {
    if (!customerSourceOtherValue || !customerSourceOtherValue.trim()) {
      showWarning('Please enter a source name');
      return;
    }

    try {
      const saved = await customDropdownService.saveCustomOption('customer_source', customerSourceOtherValue.trim());
      if (saved) {
        // Invalidate and refetch custom customer sources
        queryClient.invalidateQueries({ queryKey: ['customCustomerSources'] });
        
        // Set the value in the form
        customerForm.setValue('howDidYouHear', saved.value);
        
        // Clear the "Other" input
        setShowCustomerSourceOtherInput(false);
        setCustomerSourceOtherValue('');
        
        showSuccess(`"${saved.label}" added to sources`);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save custom source');
    }
  };

  // Handle region change (including "Other")
  const handleRegionChange = (value) => {
    if (value === '__OTHER__') {
      setShowRegionOtherInput(true);
    } else {
      setShowRegionOtherInput(false);
    }
  };

  // Save custom region
  const handleSaveCustomRegion = async () => {
    if (!regionOtherValue || !regionOtherValue.trim()) {
      showWarning('Please enter a region name');
      return;
    }

    try {
      const saved = await customDropdownService.saveCustomOption('region', regionOtherValue.trim());
      if (saved) {
        // Invalidate and refetch custom regions
        queryClient.invalidateQueries({ queryKey: ['customRegions'] });
        
        // Set the value in the form
        customerForm.setValue('state', saved.value);
        
        // Clear the "Other" input
        setShowRegionOtherInput(false);
        setRegionOtherValue('');
        
        showSuccess(`"${saved.label}" added to regions`);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save custom region');
    }
  };

  // Get merged region options
  const getMergedRegionOptions = () => {
    const defaultRegions = [
      'Greater Accra', 'Ashanti', 'Western', 'Western North', 'Central', 'Eastern',
      'Volta', 'Oti', 'Bono', 'Bono East', 'Ahafo', 'Northern', 'Savannah',
      'North East', 'Upper East', 'Upper West'
    ];
    const merged = [...defaultRegions];
    customRegions.forEach(region => {
      if (!merged.includes(region.value)) {
        merged.push(region.value);
      }
    });
    return merged;
  };

  const handleCustomerSubmit = useCallback(async (values) => {
    try {
      setSubmittingCustomer(true);
      
      // If "Other" is selected for howDidYouHear, save the custom value first
      if (values.howDidYouHear === '__OTHER__') {
        if (!customerSourceOtherValue || !customerSourceOtherValue.trim()) {
          showError('Please enter and save a custom source before submitting');
          setSubmittingCustomer(false);
          return;
        }
        // Save the custom source and update the form value
        const saved = await customDropdownService.saveCustomOption('customer_source', customerSourceOtherValue.trim());
        if (saved) {
          values.howDidYouHear = saved.value;
          // Invalidate and refetch custom customer sources
          queryClient.invalidateQueries({ queryKey: ['customCustomerSources'] });
        }
      }
      
      // If "Other" is selected for region, save the custom value first
      if (values.state === '__OTHER__') {
        if (!regionOtherValue || !regionOtherValue.trim()) {
          showError('Please enter and save a custom region before submitting');
          setSubmittingCustomer(false);
          return;
        }
        // Save the custom region and update the form value
        const saved = await customDropdownService.saveCustomOption('region', regionOtherValue.trim());
        if (saved) {
          values.state = saved.value;
          // Invalidate and refetch custom regions
          queryClient.invalidateQueries({ queryKey: ['customRegions'] });
        }
      }
      
      const response = await customerService.create(values);
      const created = response?.data ?? response;
      showSuccess('Customer created successfully');
      setCustomerModalVisible(false);
      customerForm.reset();

      // Refresh customers list so the new customer appears in the dropdown
      await refreshAfterCustomerChange(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['pricingTemplates', 'active'] });

      // Auto-select the newly created customer
      const newId = created?.id ?? response?.id;
      if (newId) {
        form.setValue('customerId', newId);
        handleCustomerChange(newId);
      }
    } catch (error) {
      const message = error?.response?.data?.message ?? error?.message ?? error?.error ?? 'Failed to create customer';
      showError(message);
    } finally {
      setSubmittingCustomer(false);
    }
  }, [queryClient, customerForm, customerSourceOtherValue, regionOtherValue, form, handleCustomerChange]);

  const handleJobTypeChange = (jobType) => {
    setSelectedJobType(jobType);
    const config = getJobTypeCategory(jobType);
    
    if (jobType !== 'Other') {
      setCustomJobType('');
      form.setValue('customJobType', '');
    }
    
    // Apply default values
    form.setValue('priority', config.defaultValues.priority);
    form.setValue('status', config.defaultValues.status);
    
    // Auto-set due date for instant services (today)
    if (config.isInstant) {
      form.setValue('dueDate', dayjs().toDate());
      showInfo('Instant service - Due date set to today');
    }
    
    const labelOverride = jobType === 'Other' ? customJobType : undefined;
    updateJobTitleAndDescription(jobType, selectedCustomer, labelOverride);
  };

  const handleCustomJobTypeChange = (event) => {
    const value = event.target.value;
    setCustomJobType(value);
    updateJobTitleAndDescription('Other', selectedCustomer, value);
  };

  const resolveTemplateUnitPrice = (template) => {
    if (!template) return 0;
    const parseMoney = (value) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const pricePerUnit = parseMoney(template.pricePerUnit);
    const basePrice = parseMoney(template.basePrice);
    const pricePerSquareFoot = parseMoney(template.pricePerSquareFoot);

    if (pricePerUnit > 0) return pricePerUnit;
    if (pricePerSquareFoot > 0) return pricePerSquareFoot;

    return basePrice;
  };

  // Helper function to calculate discount based on quantity
  const calculateDiscount = (template, quantity, unitPriceOverride, { silent = false } = {}) => {
    if (!template || !quantity) return { discountPercent: 0, discountAmount: 0 };

    const unitPrice = unitPriceOverride ?? resolveTemplateUnitPrice(template);
    const subtotal = Math.max(0, toJobMoneyNumber(unitPrice) * toJobMoneyNumber(quantity));

    // Apply discount tiers if available
    if (template.discountTiers && Array.isArray(template.discountTiers) && template.discountTiers.length > 0) {
      for (const tier of template.discountTiers) {
        const minQty = tier.minQuantity || 0;
        const maxQty = tier.maxQuantity || Infinity;
        
        if (quantity >= minQty && quantity <= maxQty) {
          const discountPercent = parseFloat(tier.discountPercent || 0);
          const discountAmount = Math.min(subtotal, (subtotal * discountPercent) / 100);
          
          if (discountPercent > 0 && !silent) {
            showInfo(`${discountPercent}% discount applied for quantity ${quantity}!`);
          }
          
          return { discountPercent, discountAmount: roundJobMoney(discountAmount) };
        }
      }
    }

    return { discountPercent: 0, discountAmount: 0 };
  };

  const setJobItemsValue = (items) => {
    form.setValue('items', items, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const updateJobItemAtIndex = (itemIndex, updater) => {
    const currentItem = (form.getValues('items') || [])[itemIndex] || {};
    const updatedItem = updater(currentItem);

    Object.keys(updatedItem).forEach((key) => {
      if (updatedItem[key] !== currentItem[key]) {
        form.setValue(`items.${itemIndex}.${key}`, updatedItem[key], {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    });
  };

  const handleTemplateSelect = (templateId, itemIndex) => {
    const template = pricingTemplates.find(t => t.id === templateId);
    
    if (!templateId || !template) {
      // Clear template selection for this item
      setSelectedTemplates(prev => {
        const updated = { ...prev };
        delete updated[itemIndex];
        return updated;
      });
      return;
    }

    // Store the selected template for this item
    setSelectedTemplates(prev => ({
      ...prev,
      [itemIndex]: template
    }));

    const items = form.getValues('items') || [];
    const currentItem = items[itemIndex] || {};
    
    // Check if template uses square-foot pricing
    const isSquareFootPricing = template.pricingMethod === 'square_foot' || 
                                ['SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision'].includes(template.materialType);
    
    if (isSquareFootPricing) {
      // For square-foot pricing, set up dimensions fields
      const updatedItems = [...items];
      updatedItems[itemIndex] = {
        ...currentItem,
        category: template.category,
        materialType: template.materialType,
        materialSize: template.materialSize || 'Custom',
        description: template.description || currentItem.description,
        pricingMethod: 'square_foot',
        pricePerSquareFoot: parseFloat(template.pricePerSquareFoot || 0),
        itemHeight: currentItem.itemHeight,
        itemWidth: currentItem.itemWidth,
        itemUnit: currentItem.itemUnit || 'feet',
        quantity: 1, // Always 1 for square-foot pricing
        unitPrice: 0, // Will be calculated when dimensions are entered
        discountPercent: 0,
        discountAmount: 0
      };
      setJobItemsValue(updatedItems);
    } else {
      // Standard unit-based pricing
      const quantity = currentItem.quantity || 1;
      const unitPrice = resolveTemplateUnitPrice(template);
      const { discountPercent, discountAmount } = calculateDiscount(template, quantity, unitPrice);
      
      const updatedItems = [...items];
      updatedItems[itemIndex] = {
        ...currentItem,
        category: template.category,
        paperSize: template.paperSize || currentItem.paperSize,
        materialType: template.materialType,
        materialSize: template.materialSize,
        description: template.description || currentItem.description,
        quantity: quantity,
        unitPrice: unitPrice,
        pricingMethod: 'unit',
        discountPercent: discountPercent,
        discountAmount: discountAmount
      };
      setJobItemsValue(updatedItems);
    }
    
    // Smart auto-fill for job-level fields if first item
    if (itemIndex === 0 && items.length === 1) {
      const currentTitle = form.getValues('title');
      const currentDescription = form.getValues('description');
      
      // Only auto-fill if fields are empty
      if (!currentTitle || currentTitle.trim() === '') {
        form.setValue('title', template.name);
      }
      if (!currentDescription || currentDescription.trim() === '') {
        form.setValue('description', template.description || template.name);
      }
    }
    
    showSuccess(`Applied pricing template: ${template.name}`);
  };

  // Handle quantity change with real-time discount recalculation
  const handleQuantityChange = (itemIndex, newQuantity) => {
    const template = selectedTemplates[itemIndex];

    updateJobItemAtIndex(itemIndex, (currentItem) => {
      const quantity = newQuantity === '' ? '' : Math.max(1, toJobMoneyNumber(newQuantity, 1));
      const currentPrice = toJobMoneyNumber(currentItem.unitPrice ?? resolveTemplateUnitPrice(template), 0);
      const discount = template
        ? calculateDiscount(template, quantity || 1, currentPrice, { silent: true })
        : {
            discountPercent: currentItem.discountPercent || 0,
            discountAmount: currentItem.discountAmount || 0,
          };

      return {
        ...currentItem,
        quantity,
        discountPercent: discount.discountPercent,
        discountAmount: discount.discountAmount,
      };
    });
  };

  const handleUnitPriceChange = (itemIndex, newUnitPrice) => {
    const template = selectedTemplates[itemIndex];

    updateJobItemAtIndex(itemIndex, (currentItem) => {
      const unitPrice = newUnitPrice === '' ? '' : Math.max(0, toJobMoneyNumber(newUnitPrice, 0));
      const quantity = toJobMoneyNumber(currentItem.quantity, 1);
      const discount = template
        ? calculateDiscount(template, quantity, unitPrice || 0, { silent: true })
        : {
            discountPercent: currentItem.discountPercent || 0,
            discountAmount: currentItem.discountAmount || 0,
          };

      return {
        ...currentItem,
        unitPrice,
        discountPercent: discount.discountPercent,
        discountAmount: discount.discountAmount,
      };
    });
  };

  const handleDiscountAmountChange = (itemIndex, discountAmount) => {
    updateJobItemAtIndex(itemIndex, (currentItem) => ({
      ...currentItem,
      discountAmount: discountAmount === '' ? '' : Math.max(0, toJobMoneyNumber(discountAmount, 0)),
    }));
  };

  const handleSubmit = async (values) => {
    try {
      setSubmittingJob(true);

      // "Other (specify)" keeps category as __OTHER__ until Save; merge typed text on submit so the job still saves
      if (values.items && values.items.length > 0) {
        values.items = resolveOtherCategoryItems(values.items, categoryOtherInputs);
        if (hasUnresolvedOtherCategory(values.items)) {
          showWarning('Enter a category name for each "Other (specify)" line item, or pick a category from the list.');
          setSubmittingJob(false);
          return;
        }
      }

      // Calculate total from items (with discounts)
      let calculatedTotal = 0;
      if (values.items && values.items.length > 0) {
        // Process items - calculate square-foot pricing if needed
        values.items = values.items.map(item => {
          // If square-foot pricing, ensure unitPrice is calculated
          if ((item.pricingMethod === 'square_foot' || item.itemHeight || item.itemWidth) && 
              item.itemHeight && item.itemWidth && item.pricePerSquareFoot) {
            const height = parseFloat(item.itemHeight);
            const width = parseFloat(item.itemWidth);
            const unit = item.itemUnit || 'feet';
            const pricePerSqft = parseFloat(item.pricePerSquareFoot);
            
            if (unit === 'feet') {
              item.unitPrice = height * width * pricePerSqft;
            } else if (unit === 'inches') {
              item.unitPrice = (height * width * pricePerSqft) / 144;
            }
            item.quantity = 1; // Always 1 for square-foot pricing
          }
          
          return item;
        });
        
        calculatedTotal = calculateJobItemsPricing(values.items).grandTotal;
      }

      // Auto-generate job title from the first item only if not provided
      if (!values.title && values.items && values.items.length > 0) {
        const customer = customersData.find(c => c.id === values.customerId);
        const customerName = customer?.name || customer?.company || 'Customer';
        const firstItemCategory = values.items[0]?.category?.trim();
        values.title = firstItemCategory
          ? `${firstItemCategory} for ${customerName}`
          : `Job for ${customerName}`;
      }

      // Set jobType to first item's category for compatibility
      if (values.items && values.items.length > 0) {
        values.jobType = values.items[0].category || 'Other';
      } else {
        values.jobType = 'Other';
      }

      // Format dates and handle assignedTo
      const formatDate = (date) => {
        if (!date) return null;
        if (typeof date === 'string') return date;
        if (date instanceof Date) return dayjs(date).format('YYYY-MM-DD');
        if (dayjs.isDayjs(date)) return date.format('YYYY-MM-DD');
        return null;
      };

      // Validate required fields
      if (!values.customerId) {
        showError('Customer is required');
        setSubmittingJob(false);
        return;
      }

      // Ensure title exists (auto-generated if not provided)
      if (!values.title || values.title.trim() === '') {
        showError('Job title is required');
        setSubmittingJob(false);
        return;
      }

      // Clean assignedTo - convert "__NONE__" to null
      const cleanAssignedTo = values.assignedTo === "__NONE__" || !values.assignedTo ? null : values.assignedTo;

      // Clean and validate items - ensure required fields are present
      const cleanedItems = (values.items || []).map(item => {
        const quantity = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const linePricing = calculateJobLinePricing({
          ...item,
          quantity,
          unitPrice,
        });

        return {
          ...item,
          quantity,
          unitPrice,
          discountAmount: linePricing.discount,
          discountPercent: parseFloat(item.discountPercent) || 0,
        };
      }).filter(item => item.category && item.description); // Filter out invalid items

      if (cleanedItems.length === 0) {
        showError('At least one valid job item is required');
        setSubmittingJob(false);
        return;
      }

      const persistLineItemDescriptions = async () => {
        const uniqueDescriptions = [...new Set(
          cleanedItems
            .map((item) => String(item?.description || '').trim())
            .filter(Boolean)
        )];
        if (uniqueDescriptions.length === 0) return;
        await Promise.allSettled(
          uniqueDescriptions.map((description) =>
            customDropdownService.saveCustomOption('line_item_description', description, description)
          )
        );
      };

      const persistCustomCategories = async () => {
        const uniqueCategories = collectResolvedCategories(cleanedItems);
        if (uniqueCategories.length === 0) return;
        await Promise.allSettled(
          uniqueCategories.map((category) =>
            customDropdownService.saveCustomOption('job_category', category, category)
          )
        );
        queryClient.invalidateQueries({ queryKey: ['customCategories'] });
      };

      // Build job data, only including valid fields
      const jobData = {
        customerId: values.customerId,
        title: values.title.trim(),
        description: values.description || null,
        status: values.status || 'new',
        priority: values.priority || 'medium',
        deliveryRequired: values.deliveryRequired === true,
        ...(!values.deliveryRequired ? { deliveryStatus: null } : {}),
        jobType: values.jobType || null,
        assignedTo: cleanAssignedTo,
        startDate: formatDate(values.startDate),
        dueDate: formatDate(values.dueDate),
        finalPrice: calculatedTotal || values.finalPrice || 0,
        items: cleanedItems,
        ...(!editingJobId ? buildJobCreatePaymentPayload(values) : {}),
      };

      // Log the data being sent for debugging
      console.log('Job data being sent:', JSON.stringify(jobData, null, 2));

      let response;
      if (editingJobId) {
        // Update existing job
        response = await jobService.update(editingJobId, jobData);
        showSuccess('Job updated successfully');
        // Don't hold the save spinner on dropdown persistence
        void Promise.all([persistLineItemDescriptions(), persistCustomCategories()]);
      } else {
        // Create new job
        response = await jobService.create(jobData);
        void Promise.all([persistLineItemDescriptions(), persistCustomCategories()]);
        
        // Check if invoice was auto-generated (create may still return a queued stub)
        if (response.invoice?.invoiceNumber) {
          showSuccess(`Job created successfully! Invoice ${response.invoice.invoiceNumber} automatically generated.`);
          // Navigate to invoice after a short delay
          setTimeout(() => {
            navigate('/invoices', { state: { openInvoiceId: response.invoice.id } });
          }, 2000);
        } else {
          showSuccess('Job created successfully');
        }
      }
      
      setModalVisible(false);
      setEditingJobId(null);
      setSelectedJobType(null);
      setSelectedCustomer(null);
      setSelectedTemplates({});
      setCustomJobType('');
      invalidateJobs();
    } catch (error) {
      console.error('Job creation/update error:', error);
      console.error('Error response data:', error?.response?.data);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.error || error?.message || 'Failed to create job';
      const validationErrors = error?.response?.data?.errors;
      
      // Check if it's a duplicate error - in this case, the job might have been created by another request
      const isDuplicateError = error?.response?.data?.error?.includes('duplicate') || 
                              error?.response?.data?.error?.includes('already exists') ||
                              error?.message?.includes('duplicate') ||
                              error?.message?.includes('already exists');
      
      if (isDuplicateError) {
        // If it's a duplicate error, it might mean another request succeeded
        // Refresh the jobs list to see if a job was created
        invalidateJobs();
        showError('Job creation failed due to duplicate job number. Please check if the job was created successfully.');
      } else if (validationErrors) {
        console.error('Validation errors:', validationErrors);
        showError(`${errorMessage}: ${JSON.stringify(validationErrors)}`);
      } else {
        showError(errorMessage);
      }
    } finally {
      setSubmittingJob(false);
    }
  };

  const statusColors = {
    new: 'gold',
    in_progress: 'blue',
    on_hold: 'orange',
    cancelled: 'red',
    completed: 'green',
  };

  const statusOptions = [
    { value: 'new', label: 'New' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'completed', label: 'Completed' }
  ];

  /** Totals from scoped stats API; overdue still derived from current list page. */
  const displaySummary = useMemo(() => {
    const rows = Array.isArray(summary) ? summary : [];
    let totalJobs = 0;
    let inProgressJobs = 0;
    let completedJobs = 0;
    for (const row of rows) {
      const count = Number(row.count) || 0;
      totalJobs += count;
      if (row.status === 'in_progress') inProgressJobs += count;
      if (row.status === 'completed') completedJobs += count;
    }
    const pageJobs = jobsQueryResult?.data || [];
    const overdueJobs = pageJobs.filter((j) => {
      if (!j.dueDate) return false;
      return dayjs(j.dueDate).isBefore(dayjs(), 'day') && j.status !== 'completed';
    }).length;

    return {
      totals: {
        totalJobs,
        inProgressJobs,
        completedJobs,
        overdueJobs,
      },
    };
  }, [summary, jobsQueryResult?.data]);

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'jobNumber',
      label: 'Job Number',
      render: (_, record) => <span className="font-medium">{record?.jobNumber || '—'}</span>
    },
    {
      key: 'title',
      label: 'Title',
      render: (_, record) => <span className="text-foreground">{record?.title || '—'}</span>
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (_, record) => <span className="text-foreground">{record?.customer?.name || '—'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      width: '160px',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={record?.status} />
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (_, record) => {
        const priority = record?.priority || 'medium';
        return (
          <Badge
            variant="outline"
            className={PRIORITY_CHIP_CLASSES[priority] ?? STATUS_CHIP_DEFAULT_CLASS}
          >
            {priority?.toUpperCase()}
          </Badge>
        );
      }
    },
    {
      key: 'price',
      label: 'Price',
      render: (_, record) => <span className="text-foreground font-medium">{formatAmount(record?.finalPrice)}</span>
    },
    {
      key: 'dueDate',
      label: 'Due Date',
      render: (_, record) => <span className="text-foreground">{record?.dueDate ? dayjs(record.dueDate).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          onView={handleView}
          record={record}
          extraActions={[
            isAdmin && {
              key: 'delete',
              label: 'Delete job',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => setJobToDelete(record),
              destructive: true
            }
          ].filter(Boolean)}
        />
      )
    }
  ], [handleView, formatAmount, isAdmin]);

  const handleClearFilters = useCallback(() => {
    setFilters({
      status: 'all',
      priority: 'all',
      customerId: 'all',
      dueDate: 'all'
    });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.customerId !== 'all' ||
    filters.dueDate !== 'all' ||
    debouncedSearch.trim();

  const jobsEmptyState = useMemo(() => {
    if (hasActiveFilters) {
      return getEmptyStateProps(EMPTY_STATES.JOBS_FILTERED, {
        primary: handleClearFilters,
      });
    }

    return getEmptyStateProps(EMPTY_STATES.JOBS, {
      primary: handleAddJob,
    });
  }, [hasActiveFilters, handleClearFilters, handleAddJob]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <WelcomeSection
          welcomeMessage="Jobs"
          subText="Manage and track all your jobs, services, and orders."
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
            <TooltipContent>Filter jobs by status, priority, customer, or due date</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={async () => {
                  setRefreshingJobs(true);
                  await refreshAfterJobChange(queryClient);
                  setRefreshingJobs(false);
                }}
                disabled={refreshingJobs}
                size={isMobile ? 'icon' : 'default'}
              >
                {refreshingJobs ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh jobs list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleAddJob}
                className="min-h-[44px] flex-1 min-w-0 md:flex-none"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span>Add Job</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new job</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Total Jobs Card */}
        <DashboardStatsCard
          tooltip="Total number of jobs in your workspace"
          title="Total Jobs"
          value={displaySummary?.totals?.totalJobs || 0}
          icon={Briefcase}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />

        {/* In Progress Card */}
        <DashboardStatsCard
          tooltip="Jobs currently being worked on"
          title="In Progress"
          value={displaySummary?.totals?.inProgressJobs || 0}
          icon={Clock}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
        />

        {/* Completed Card */}
        <DashboardStatsCard
          tooltip="Jobs that have been completed"
          title="Completed"
          value={displaySummary?.totals?.completedJobs || 0}
          icon={CheckCircle}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />

        {/* Overdue Card */}
        <DashboardStatsCard
          tooltip="Jobs past their due date"
          title="Overdue"
          value={displaySummary?.totals?.overdueJobs || 0}
          icon={AlertCircle}
          iconBgColor="rgba(239, 68, 68, 0.1)"
          iconColor="#ef4444"
        />
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
          data={jobs}
          columns={tableColumns}
          loading={isJobsLoading || isJobsFetching || (isMobile && isRefreshing)}
          title={null}
          emptyState={jobsEmptyState}
          pageSize={pagination.pageSize}
          onPageChange={(newPagination) => {
            setPagination(newPagination);
          }}
          externalPagination={{
            current: pagination.current,
            total: jobsCount
          }}
          viewMode={tableViewMode}
          onViewModeChange={setTableViewMode}
        />
      </div>

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto"
          style={{ top: 8, bottom: 8, right: 8, height: 'calc(100dvh - 16px)', borderRadius: 8 }}
        >
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Jobs</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 md:space-y-6 mt-4 md:mt-6">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={filters.customerId}
                onValueChange={(value) => setFilters({ ...filters, customerId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customersData.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={filters.priority}
                onValueChange={(value) => setFilters({ ...filters, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Select
                value={filters.dueDate}
                onValueChange={(value) => setFilters({ ...filters, dueDate: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="next_week">Next Week</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters} className="w-full">
                Clear Filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="Job Details"
        showActions={true}
        primaryAction={viewingJob ? {
          label: 'Update Status',
          icon: <Clock className="h-4 w-4" />,
          onClick: () => openStatusModal(viewingJob)
        } : null}
        moreMenuItems={viewingJob ? [
          {
            key: 'edit',
            label: 'Edit',
            icon: <Edit className="h-4 w-4" />,
            onClick: () => handleEdit(viewingJob)
          },
          ...(jobInvoices[viewingJob.id] ? [{
            key: 'viewInvoice',
            label: 'View Invoice',
            icon: <FileText className="h-4 w-4" />,
            onClick: () => {
              const invoiceId = jobInvoices[viewingJob.id].id;
              handleCloseDrawer();
              window.setTimeout(() => {
                navigate('/invoices', { state: { openInvoiceId: invoiceId } });
              }, 0);
            },
          }] : []),
          ...(isAdmin ? [{
            key: 'delete',
            label: 'Delete job',
            icon: <Trash2 className="h-4 w-4" />,
            destructive: true,
            onClick: () => {
              setJobToDelete(viewingJob);
              handleCloseDrawer();
            }
          }] : [])
        ] : []}
        tabs={viewingJob ? [
          {
            key: 'details',
            label: 'Details',
            content: (
                <div className="space-y-4">
                  {/* Job Information Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Job Information</h3>
                    <div className="border rounded-lg px-5 py-4">
                      <Descriptions column={1} className="space-y-2">
                      <DescriptionItem label="Job Number">
                  {viewingJob.jobNumber}
                      </DescriptionItem>
                      <DescriptionItem label="Title">
                  {viewingJob.title}
                      </DescriptionItem>
                      <DescriptionItem label="Customer">
                  {viewingJob.customer?.name}
                      </DescriptionItem>
                      <DescriptionItem label="Job Type">
                  {viewingJob.jobType || '-'}
                      </DescriptionItem>
                      <DescriptionItem label="Description">
                        {viewingJob.description || '-'}
                      </DescriptionItem>
                      <DescriptionItem label="Status">
                        <StatusChip status={viewingJob.status} />
                      </DescriptionItem>
                      <DescriptionItem label="Delivery required">
                        <div className="flex flex-col gap-2 max-w-md">
                          <Switch
                            checked={viewingJob.deliveryRequired === true}
                            onCheckedChange={handleJobDeliveryRequiredChange}
                            disabled={updatingJobDelivery}
                            id="job-drawer-delivery-required"
                            aria-label="Delivery required"
                          />
                          {viewingJob.deliveryRequired === true && viewingJob.deliveryStatus ? (
                            <p className="text-xs text-muted-foreground">
                              Current stage:{' '}
                              <span className="text-foreground font-medium">
                                {DELIVERY_STATUS_LABELS[viewingJob.deliveryStatus] || viewingJob.deliveryStatus}
                              </span>
                              . Update stages on the{' '}
                              <Link to="/deliveries" className="text-brand hover:underline">
                                Deliveries
                              </Link>{' '}
                              page (completed jobs).
                            </p>
                          ) : viewingJob.deliveryRequired === true ? (
                            <p className="text-xs text-muted-foreground">
                              Set delivery stages on the{' '}
                              <Link to="/deliveries" className="text-brand hover:underline">
                                Deliveries
                              </Link>{' '}
                              page after the job is completed.
                            </p>
                          ) : null}
                        </div>
                      </DescriptionItem>
                      <DescriptionItem label="Priority">
                        <Badge
                          variant="outline"
                          className={PRIORITY_CHIP_CLASSES[viewingJob.priority] ?? STATUS_CHIP_DEFAULT_CLASS}
                        >
                          {viewingJob.priority?.toUpperCase()}
                        </Badge>
                      </DescriptionItem>
                      </Descriptions>
                    </div>
                  </div>

                  {/* Assignment & Dates Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Assignment & Dates</h3>
                    <div className="border rounded-lg px-5 py-4">
                      <Descriptions column={1} className="space-y-2">
                      <DescriptionItem label="Created By">
                  <div className="flex items-center gap-2">
                    {viewingJob.creator ? (
                      <Badge variant="outline">
                        <User className="h-3 w-3 mr-1" />
                        {viewingJob.creator.name}
                      </Badge>
                    ) : viewingJob.quoteId ? (
                      <span className="text-sm text-muted-foreground">From quote (customer accepted)</span>
                    ) : (
                      <Badge variant="outline">System</Badge>
                    )}
                  </div>
                      </DescriptionItem>
                      <DescriptionItem label="Assigned To">
                  <div className="flex items-center gap-2">
                    {viewingJob.assignedUser ? (
                      <>
                              <Badge variant="outline"><User className="h-3 w-3 mr-1" />
                          {viewingJob.assignedUser.name}
                        </Badge>
                      </>
                    ) : (
                      <Badge variant="outline">Unassigned</Badge>
                    )}
                          <Button variant="ghost" size="sm" onClick={() => openAssignModal(viewingJob)} className="text-brand hover:opacity-80">
                      Manage
                    </Button>
                  </div>
                      </DescriptionItem>
                      <DescriptionItem label="Start Date">
                  {viewingJob.startDate ? dayjs(viewingJob.startDate).format('MMM DD, YYYY') : 'N/A'}
                      </DescriptionItem>
                      <DescriptionItem label="Due Date">
                  {viewingJob.dueDate ? dayjs(viewingJob.dueDate).format('MMM DD, YYYY') : 'N/A'}
                      </DescriptionItem>
                      <DescriptionItem label="Completion Date">
                  {viewingJob.completionDate ? dayjs(viewingJob.completionDate).format('MMM DD, YYYY') : 'N/A'}
                      </DescriptionItem>
                      <DescriptionItem label="Created At">
                        {viewingJob.createdAt ? new Date(viewingJob.createdAt).toLocaleString() : '-'}
                      </DescriptionItem>
                      </Descriptions>
                    </div>
                  </div>

                  {/* Financial & Additional Information Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">Financial & Additional Information</h3>
                    <div className="border rounded-lg px-5 py-4">
                      <Descriptions column={1} className="space-y-2">
                      <DescriptionItem label="Final Price">
                        <strong className="text-base" style={{ color: 'var(--color-primary)' }}>
                          {formatAmount(viewingJob.finalPrice)}
                        </strong>
                      </DescriptionItem>
                      <DescriptionItem label="Invoice">
                  {(() => {
                    const invoice = jobInvoices[viewingJob.id];
                    if (!invoice) {
                      return (
                        <div className="text-xs text-muted-foreground">
                          Invoice automatically generated
                        </div>
                      );
                    }
                    return (
                      <Badge 
                        variant="outline" 
                        className={
                          invoice.status === 'paid' ? STATUS_CHIP_CLASSES.paid :
                          invoice.status === 'overdue' ? STATUS_CHIP_CLASSES.overdue :
                          STATUS_CHIP_CLASSES.sent ?? STATUS_CHIP_CLASSES.pending
                        }
                      >
                        {invoice.invoiceNumber} - {invoice.status?.toUpperCase()}
                      </Badge>
                    );
                  })()}
                      </DescriptionItem>
                      <DescriptionItem label="Notes">
                        {viewingJob.notes || '-'}
                      </DescriptionItem>
              </Descriptions>
                    </div>
                  </div>
                </div>
            )
          },
          {
            key: 'services',
            label: 'Services',
            content: (
                <DrawerSectionCard title="Items">
                  {(!viewingJob.items || viewingJob.items.length === 0) ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No services/items added to this job
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {viewingJob.items.map((item, idx) => (
                        <div key={idx} className="border border-border/50 rounded-md p-4">
                          <div className="grid grid-cols-12 gap-2 md:gap-4">
                            <div className="col-span-6">
                              <div className="mb-2">
                                <strong className="text-sm font-semibold">{item.category}</strong>
                              </div>
                              {item.paperSize && item.paperSize !== 'N/A' && (
                                <div className="text-xs text-muted-foreground mb-1">Paper Size: {item.paperSize}</div>
                              )}
                              {item.description && (
                                <div className="text-sm text-foreground">{item.description}</div>
                              )}
                            </div>
                            <div className="col-span-2 text-right">
                              <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                              <div className="font-semibold text-sm">{item.quantity}</div>
                            </div>
                            <div className="col-span-2 text-right">
                              <div className="text-xs text-muted-foreground mb-1">Unit Price</div>
                              <div className="text-sm font-medium">{formatAmount(item.unitPrice)}</div>
                            </div>
                            <div className="col-span-2 text-right">
                              <div className="text-xs text-muted-foreground mb-1">Total</div>
                              <div className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
                                {formatAmount((parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="border border-border/50 rounded-md p-4 flex justify-between items-center bg-muted/30">
                        <strong className="text-base font-semibold">Total:</strong>
                        <strong className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                          {formatAmount(viewingJob.finalPrice)}
                        </strong>
                      </div>
                    </div>
                  )}
                </DrawerSectionCard>
            )
          },
          {
            key: 'attachments',
            label: 'Attachments',
            content: (
              <DrawerSectionCard title="Attachments">
                <FileUpload
                  onFileSelect={({ file }) => handleAttachmentUpload({ file, onSuccess: () => {}, onError: () => {} })}
                  disabled={uploadingAttachment}
                  uploading={uploadingAttachment}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
                  maxSizeMB={uploadMaxSizeMb}
                  uploadedFiles={attachmentList}
                  onFilePreview={handleAttachmentPreview}
                  onFileRemove={handleAttachmentRemove}
                />
              </DrawerSectionCard>
            )
          },
          {
            key: 'activities',
            label: 'Activities',
            content: (
                <DrawerSectionCard title="Activity">
                  {(() => {
                    const statusHistory = (viewingJob?.statusHistory || []).slice();
                    const allActivities = [];
                    if (viewingJob?.createdAt) {
                      allActivities.push({
                        id: 'created',
                        type: 'created',
                        status: viewingJob.status || 'new',
                        createdAt: viewingJob.createdAt,
                        changedByUser: viewingJob.creator || null,
                        isCreated: true
                      });
                    }
                    if (viewingJob?.updatedAt && viewingJob?.createdAt && 
                        dayjs(viewingJob.updatedAt).isAfter(dayjs(viewingJob.createdAt).add(1, 'second'))) {
                      const hasUpdateInHistory = statusHistory.some(h => 
                        dayjs(h.createdAt).isSame(dayjs(viewingJob.updatedAt), 'minute')
                      );
                      if (!hasUpdateInHistory) {
                        allActivities.push({
                          id: 'updated',
                          type: 'updated',
                          createdAt: viewingJob.updatedAt,
                          changedByUser: viewingJob.creator || null,
                          isUpdated: true
                        });
                      }
                    }
                    statusHistory.forEach(entry => {
                      allActivities.push({
                        id: entry.id,
                        type: 'status_change',
                        status: entry.status,
                        createdAt: entry.createdAt,
                        comment: entry.comment,
                        changedByUser: entry.changedByUser || null
                      });
                    });
                    allActivities.sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());
                    if (allActivities.length === 0) {
                      return (
                        <div className="flex items-center justify-center p-8 text-muted-foreground">
                          No activities recorded yet.
                        </div>
                      );
                    }
                    return (
                      <Timeline>
                        {allActivities.map((activity, index) => {
                          const isLast = index === allActivities.length - 1;
                          return (
                            <TimelineItem key={activity.id} isLast={isLast}>
                              <TimelineIndicator />
                              <TimelineContent>
                                <TimelineTitle className="text-foreground">
                                  {activity.isCreated ? (
                                    <>
                                      {viewingJob?.quoteId && !viewingJob?.creator
                                        ? 'Job created automatically from quote (customer accepted)'
                                        : `${activity.changedByUser?.name || viewingJob?.creator?.name || 'System'} created job ${viewingJob?.jobNumber}`}
                                      {activity.status && (
                                        <StatusChip status={activity.status} className="ml-2" />
                                      )}
                                    </>
                                  ) : activity.isUpdated ? (
                                    <>Job {viewingJob?.jobNumber} was updated</>
                                  ) : (
                                    <>Status changed to <StatusChip status={activity.status} className="ml-2" /></>
                                  )}
                                </TimelineTitle>
                                <TimelineTime className="text-foreground">
                                  {dayjs(activity.createdAt).format('MMM DD, YYYY [at] h:mm A')}
                                  {activity.changedByUser && !activity.isCreated && (
                                    <> • {activity.changedByUser.name}</>
                                  )}
                                </TimelineTime>
                                {activity.comment && (
                                  <TimelineDescription className="text-foreground">{activity.comment}</TimelineDescription>
                                )}
                                {(activity.isCreated || activity.isUpdated) && (
                                  <TimelineDescription className="text-foreground">
                                    {activity.isCreated ? (
                                      viewingJob?.quoteId && !viewingJob?.creator
                                        ? 'Created via quote acceptance (no user action)'
                                        : (
                                          <>
                                            Created by: {activity.changedByUser?.name || viewingJob?.creator?.name || 'System'}
                                            {(activity.changedByUser?.email || viewingJob?.creator?.email) && (
                                              <span className="ml-1">
                                                ({activity.changedByUser?.email || viewingJob?.creator?.email})
                                              </span>
                                            )}
                                          </>
                                        )
                                    ) : (
                                      <>
                                        Updated by: {activity.changedByUser?.name || viewingJob?.creator?.name || 'System'}
                                        {(activity.changedByUser?.email || viewingJob?.creator?.email) && (
                                          <span className="ml-1">
                                            ({activity.changedByUser?.email || viewingJob?.creator?.email})
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </TimelineDescription>
                                )}
                              </TimelineContent>
                            </TimelineItem>
                          );
                        })}
                      </Timeline>
                    );
                  })()}
                </DrawerSectionCard>
            )
          }
        ] : []}
      />

      <FilePreview
        open={attachmentPreviewVisible}
        onClose={handleCloseAttachmentPreview}
        file={attachmentPreview ? {
          fileUrl: attachmentPreview.fileUrl || attachmentPreview.url,
          title: attachmentPreview.originalName || attachmentPreview.filename || attachmentPreview.name || 'Attachment',
          type: attachmentPreview.type,
          metadata: attachmentPreview.metadata || {}
        } : null}
      />

      <MobileFormDialog
        open={modalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setModalVisible(false);
            setEditingJobId(null);
            setCategoryOtherInputs({}); // Clear category "Other" inputs
          }
        }}
        title={editingJobId ? "Edit Job" : "Add New Job"}
        description={editingJobId ? "Update the job details below." : "Fill in the details to create a new job."}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => {
              setModalVisible(false);
              setEditingJobId(null);
              setCategoryOtherInputs({});
            }}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => jobFormRef.current?.requestSubmit()}
              loading={submittingJob}
            >
              {editingJobId ? 'Update Job' : 'Create Job'}
            </Button>
          </>
        }
      >
          <Form {...form}>
            <form
              id="job-form"
              ref={jobFormRef}
              onSubmit={form.handleSubmit(handleSubmit, (errors) => {
                const list = getJobFormErrorMessages(errors);
                const message = list.length
                  ? `Please fix the following: ${list.join('. ')}`
                  : 'Please fix the errors in the form before saving.';
                showError(message);
              })}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                {!customerModalVisible && (
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        handleCustomerChange(value);
                      }} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer first" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customersData.map(customer => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} {customer.company ? `(${customer.company})` : ''}
                            </SelectItem>
                          ))}
                          <Separator className="my-2" />
                          <div className="px-2 py-1.5">
                      <Button
                              type="button"
                              variant="ghost"
                              className="w-full justify-start"
                        onClick={handleAddNewCustomer}
                      >
                              <Plus className="h-4 w-4 mr-2" />
                        Add New Customer
                      </Button>
                          </div>
                        </SelectContent>
                </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}
                <FormField
                  control={form.control}
                name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title (optional, auto-generated from items)</FormLabel>
                      <FormControl>
                        <Input placeholder="Will auto-generate based on items added" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <FormField
                  control={form.control}
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
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
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
                control={form.control}
                name="deliveryRequired"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Delivery required</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Turn on if the customer should receive this work as a delivery. Stages (ready, out, delivered) are
                        managed on the Deliveries page after the job is completed.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <FormField
                  control={form.control}
                name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date (optional)</FormLabel>
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
                  control={form.control}
                name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date (optional)</FormLabel>
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
                control={form.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To (optional)</FormLabel>
                    <Select onValueChange={(value) => field.onChange(value === "__NONE__" ? null : value)} value={field.value ? String(field.value) : "__NONE__"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                  {teamMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                      {member.name} {member.role ? `(${member.role})` : ''}
                          </SelectItem>
                  ))}
                      </SelectContent>
                </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="relative my-2" style={{ marginBottom: '8px' }}>
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-sm font-medium">Job Items / Services</span>
                </div>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4 bg-muted/50">
                    {pricingTemplates.length > 0 && (
                      <div className="mb-4">
                        <Label>Select Pricing Template (Optional)</Label>
                            <Select
                          value={selectedTemplates[index]?.id || undefined}
                          onValueChange={(value) => handleTemplateSelect(value, index)}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select a pricing template to auto-fill" />
                          </SelectTrigger>
                          <SelectContent>
                              {pricingTemplates.map(template => {
                                const resolvedPrice = resolveTemplateUnitPrice(template);
                                const hasUnitPricing = Number.isFinite(parseFloat(template.pricePerUnit)) && parseFloat(template.pricePerUnit) > 0;
                                const hasSquareFootPricing = Number.isFinite(parseFloat(template.pricePerSquareFoot)) && parseFloat(template.pricePerSquareFoot) > 0;
                                const priceLabel = (() => {
                                  if (resolvedPrice <= 0) return '';
                                  if (hasUnitPricing) return ` (${formatAmount(resolvedPrice)}/unit)`;
                                  if (hasSquareFootPricing) return ` (${formatAmount(resolvedPrice)}/sq ft)`;
                                  return ` (${formatAmount(resolvedPrice)})`;
                                })();
                                return (
                                <SelectItem key={template.id} value={template.id}>
                                    {template.name} - {template.category}
                                    {priceLabel}
                                </SelectItem>
                                );
                              })}
                          </SelectContent>
                            </Select>
                      </div>
                    )}

                    {(() => {
                      const items = watchedItems || [];
                      const currentItem = items[index] || {};
                      const hasTemplate = selectedTemplates[index];
                        
                        // Show category dropdown if no template selected (always visible, not just when empty)
                        if (!hasTemplate) {
                          return (
                          <FormField
                            control={form.control}
                            name={`items.${index}.category`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={(value) => {
                                  field.onChange(value);
                                  handleCategoryChange(value, index);
                                }} value={field.value || undefined}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {Array.from(jobItemCategoriesGrouped.entries()).map(([groupName, items]) => (
                                      <div key={groupName}>
                                        <div className="px-2 py-1.5 text-sm font-semibold">{groupName}</div>
                                        {items.map(cat => (
                                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                        ))}
                                      </div>
                                    ))}
                                    {persistedCustomCategories.length > 0 && (
                                      <>
                                        <div className="px-2 py-1.5 text-sm font-semibold">Custom</div>
                                        {persistedCustomCategories.map(cat => (
                                          <SelectItem key={cat.value} value={cat.value}>{cat.label || cat.value}</SelectItem>
                                        ))}
                                      </>
                                    )}
                                    <div className="px-2 py-1.5 text-sm font-semibold">Other</div>
                                    <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                                  </SelectContent>
                                  </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        );
                      } else {
                        // Category is hidden when template is selected
                        return (
                          <FormField
                            control={form.control}
                            name={`items.${index}.category`}
                            render={({ field }) => <input type="hidden" {...field} />}
                          />
                        );
                      }
                    })()}
                    {categoryOtherInputs[index] !== undefined && (
                      <div className="mt-2">
                        <Label>Enter Category Name</Label>
                        <div className="flex gap-2 mt-2">
                                      <Input
                            className="flex-1"
                                        placeholder="e.g., Custom Service"
                            value={categoryOtherInputs[index] || ''}
                            onChange={(e) => setCategoryOtherInputs(prev => ({ ...prev, [index]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveCustomCategory(categoryOtherInputs[index], index)}
                                      />
                                      <Button
                            type="button"
                            onClick={() => handleSaveCustomCategory(categoryOtherInputs[index], index)}
                            className="w-20"
                                      >
                                        Save
                                      </Button>
                        </div>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name={`items.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item Description</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={getItemDescriptionPlaceholder(
                                (watchedItems || [])[index]?.category
                              )}
                              list="line-item-description-options"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Hidden fields - populated by template */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.paperSize`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.pricingMethod`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemHeight`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemWidth`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemUnit`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.pricePerSquareFoot`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />

                    {/* Only show the 4 essential fields + discount */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="1"
                                min={1}
                                {...field}
                                value={numberInputValue(field.value)}
                                onChange={(e) => {
                                  handleIntegerChange(e, (v) => {
                                    const num = v === '' ? 1 : (typeof v === 'number' ? v : parseInt(String(v), 10) || 1);
                                    handleQuantityChange(index, num);
                                  });
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Price</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">GHS</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="pl-12"
                                  {...field}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, (value) => handleUnitPriceChange(index, value))}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.discountAmount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">GHS</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="pl-12"
                                  {...field}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, (value) => handleDiscountAmountChange(index, value))}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <Label>Total</Label>
                        <div className="h-10 px-3 py-2 border border-input rounded-md bg-background flex items-center text-sm font-semibold">
                          {(() => {
                            const items = watchedItems || [];
                            const currentItem = items[index] || {};
                            return formatAmount(calculateJobLinePricing(currentItem).total);
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Hidden discount metadata fields - populated by template */}
                    <FormField
                      control={form.control}
                      name={`items.${index}.discountPercent`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.discountReason`}
                      render={({ field }) => <input type="hidden" {...field} />}
                    />

                    <Button 
                      type="button"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => remove(index)}
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />
                      Remove Item
                    </Button>
                  </Card>
                ))}
                  <Button 
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => append({ category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 })}
                >
                  <Plus className="h-4 w-4 mr-2" />
                    Add Job Item
                  </Button>
                  <datalist id="line-item-description-options">
                    {lineItemDescriptionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label || option.value}
                      </option>
                    ))}
                  </datalist>
              </div>

              {(() => {
              const { subtotal, totalDiscount, grandTotal } = jobPricingTotals;
              
              return (
                  <div className="bg-muted/50 border border-border rounded-md mb-4 overflow-hidden">
                    <div className="p-3">
                    <div className="flex justify-between mb-1 text-sm text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatAmount(subtotal)}</span>
                    </div>
                  {totalDiscount > 0 && (
                      <div className="flex justify-between mb-1 text-sm text-muted-foreground">
                        <span>Total Discount:</span>
                        <span className="font-medium">-{formatAmount(totalDiscount)}</span>
                      </div>
                    )}
                    </div>
                    <Separator className="w-full" />
                    <div className="p-3 flex justify-between">
                      <span className="text-base font-bold">Grand Total:</span>
                      <span className="text-lg font-bold">{formatAmount(grandTotal)}</span>
                    </div>
                </div>
              );
              })()}

              {!editingJobId && (
                <JobCreatePaymentFields form={form} grandTotal={jobPricingTotals.grandTotal} />
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Instructions (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                  rows={3} 
                  placeholder="Add any special instructions for this job (e.g., Rush order, call before delivery, customer will pick up)" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={assignModalVisible}
        onOpenChange={(open) => { if (!open) closeAssignModal(); }}
        title={jobBeingAssigned ? `Assign ${jobBeingAssigned.jobNumber}` : 'Assign Job'}
        description="Select a team member to assign this job to, or leave it unassigned."
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeAssignModal}>
              Cancel
            </Button>
            <Button form="assign-form" type="submit" loading={updatingAssignment}>
              Save
            </Button>
          </>
        }
      >
          <Form {...assignmentForm}>
            <form id="assign-form" onSubmit={assignmentForm.handleSubmit(handleAssignmentSubmit)} className="space-y-4">
              <FormField
                control={assignmentForm.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Member</FormLabel>
                    <Select onValueChange={(value) => field.onChange(value === "__NONE__" ? null : value)} value={field.value ? String(field.value) : "__NONE__"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {teamMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name} {member.role ? `(${member.role})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
      </MobileFormDialog>

      <MobileFormDialog
        open={statusModalVisible}
        onOpenChange={(open) => { if (!open) closeStatusModal(); }}
        title={jobBeingUpdated ? `Update Status - ${jobBeingUpdated.jobNumber}` : 'Update Status'}
        description="Update the status of this job and optionally add a comment."
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeStatusModal}>
              Cancel
            </Button>
            <Button form="status-form" type="submit" loading={updatingStatus}>
              Update Status
            </Button>
          </>
        }
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
                        {statusOptions.map(option => (
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

      {/* Add New Customer Modal */}
      <MobileFormDialog
        open={customerModalVisible}
        onOpenChange={(open) => {
          if (!open) {
            setCustomerModalVisible(false);
            setShowCustomerSourceOtherInput(false);
            setCustomerSourceOtherValue('');
            setShowRegionOtherInput(false);
            setRegionOtherValue('');
          }
        }}
        title="Add New Customer"
        description="Enter the customer information below to add them to your system."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => {
              setCustomerModalVisible(false);
              setShowCustomerSourceOtherInput(false);
              setCustomerSourceOtherValue('');
              setShowRegionOtherInput(false);
              setRegionOtherValue('');
            }}>
              Cancel
            </Button>
            <Button form="customer-form" type="submit" loading={submittingCustomer}>
              Create Customer
            </Button>
          </>
        }
      >
          <Form {...customerForm}>
            <form id="customer-form" onSubmit={customerForm.handleSubmit(handleCustomerSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <FormField
                  control={customerForm.control}
                name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter company name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <FormField
                  control={customerForm.control}
                name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <PhoneNumberInput placeholder="Enter phone number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={customerForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <FormField
                  control={customerForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Town (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Accra, Kumasi, Takoradi" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region (optional)</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        handleRegionChange(value);
                      }} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                  {getMergedRegionOptions().map((region) => (
                            <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                          <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                        </SelectContent>
                </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {showRegionOtherInput && (
                <div className="flex gap-2">
                    <Input
                    className="flex-1"
                      placeholder="e.g., New Region, District"
                      value={regionOtherValue}
                      onChange={(e) => setRegionOtherValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCustomRegion()}
                    />
                    <Button
                    type="button"
                      onClick={handleSaveCustomRegion}
                    className="w-20"
                    >
                      Save
                    </Button>
                </div>
              )}

              <FormField
                control={customerForm.control}
                name="howDidYouHear" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How did you hear about us? (optional)</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      handleHowDidYouHearChange(value);
                    }} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Array.isArray(customerSourceOptionsApi) ? customerSourceOptionsApi : []).map(source => (
                          <SelectItem key={source.value} value={source.value}>{source.label || source.value}</SelectItem>
                        ))}
                        {customCustomerSources.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-sm font-semibold">Custom Sources</div>
                            {customCustomerSources.map(source => (
                              <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                            ))}
                          </>
                        )}
                        <div className="px-2 py-1.5 text-sm font-semibold">Other</div>
                        <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                      </SelectContent>
                </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showCustomerSourceOtherInput && (
                <div className="flex gap-2">
                    <Input
                    className="flex-1"
                      placeholder="e.g., Billboard, Magazine Ad"
                      value={customerSourceOtherValue}
                      onChange={(e) => setCustomerSourceOtherValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCustomCustomerSource()}
                    />
                    <Button
                    type="button"
                      onClick={handleSaveCustomCustomerSource}
                    className="w-20"
                    >
                      Save
                    </Button>
                </div>
              )}

          {showReferralName && (
                <FormField
                  control={customerForm.control}
                  name="referralName" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referral Name (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter referral name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </form>
          </Form>
      </MobileFormDialog>

      <AlertDialog open={!!jobToDelete} onOpenChange={(open) => !open && setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              {jobToDelete
                ? `Delete "${jobToDelete.jobNumber || jobToDelete.title || 'this job'}"? This permanently removes linked invoices, payments, expenses, and material movements, and cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => jobToDelete && handleDeleteJob(jobToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Jobs;


