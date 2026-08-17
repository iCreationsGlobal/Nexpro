import { forwardRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useSmartSearch } from '../context/SmartSearchContext';
import {
  Plus,
  FileText,
  FilePlus,
  CheckCircle,
  Printer,
  Download,
  Loader2,
  X,
  Filter,
  RefreshCw,
  Receipt,
  MessageSquare,
  Send,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
} from 'lucide-react';
import { generatePDF, openPrintDialog } from '../utils/pdfUtils';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import quoteService from '../services/quoteService';
import jobService from '../services/jobService';
import { guardOnline } from '../utils/onlineRequired';
import customerService from '../services/customerService';
import productService from '../services/productService';
import settingsService from '../services/settingsService';
import userService from '../services/userService';
import customDropdownService from '../services/customDropdownService';
import { mergeBranchOrganization } from '../utils/branchOrganization';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_STALE, refreshAfterQuoteChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import FileUpload from '../components/FileUpload';
import FilePreview from '../components/FilePreview';
import PrintableInvoice from '../components/PrintableInvoice';
import PrintableQuotation from '../components/PrintableQuotation';
import { buildQuotePrintModel, DEFAULT_STUDIO_QUOTE_TERMS } from '../utils/buildQuotePrintModel';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DetailSkeleton from '../components/DetailSkeleton';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { showSuccess, showError, showWarning } from '../utils/toast';
import {
  hasUnresolvedOtherCategory,
  resolveOtherCategoryItems,
  collectResolvedCategories,
} from '../utils/customDropdownOther';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import {
  numberInputValue,
  handleNumberChange,
  handleIntegerChange,
  numberOrEmptySchema,
  integerOrEmptySchema,
} from '../utils/formUtils';

const uploadMaxSizeMb = Number.parseFloat(import.meta.env.VITE_UPLOAD_MAX_SIZE_MB ?? '') || 20;

const QUOTE_ATTACHMENT_TYPE_OPTIONS = [
  { value: 'proposal', label: 'Proposal' },
  { value: 'requirements', label: 'Requirements / SOW' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'other', label: 'Other' },
];

const quoteAttachmentTypeLabel = (type) => (
  QUOTE_ATTACHMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Other'
);
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import MobileFormDialog from '../components/MobileFormDialog';
import JobCreatePaymentFields from '../components/JobCreatePaymentFields';
import {
  JOB_CREATE_PAYMENT_DEFAULTS,
  buildJobCreatePaymentPayload,
} from '../utils/jobCreatePayment';
import FormFieldGrid from '../components/FormFieldGrid';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Switch } from '@/components/ui/switch';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS } from '../constants';

/**
 * GET /customers returns `{ success, data: Customer[] }` after the API interceptor unwraps axios.
 * Normalize so the list is always an array even if shape varies.
 */
function normalizeCustomersList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  return [];
}

const DEFAULT_QUOTE_SEND_MESSAGE = 'Please find your quote below. Click the button to view the full details and accept when you are ready.';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' }
];

const quoteItemSchema = z.object({
  productId: z.string().optional().or(z.literal('')),
  category: z.string().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required'),
  quantity: integerOrEmptySchema(z, 1).refine((v) => v >= 1, 'Quantity must be at least 1'),
  unitPrice: numberOrEmptySchema(z),
  discountAmount: numberOrEmptySchema(z),
  metadata: z.record(z.any()).optional(),
});

const quickCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  company: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const paymentScheduleItemSchema = z.object({
  label: z.string().optional().or(z.literal('')),
  amount: numberOrEmptySchema(z),
  percent: numberOrEmptySchema(z),
});

const quoteSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  title: z.string().min(1, 'Quote title is required'),
  description: z.string().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'declined', 'expired']).default('draft'),
  validUntil: z.date().optional().nullable(),
  notes: z.string().optional(),
  scopeOfWork: z.string().optional(),
  termsAndConditions: z.string().optional(),
  paymentSchedule: z.array(paymentScheduleItemSchema).optional(),
  items: z.array(quoteItemSchema).min(1, 'At least one item is required'),
  autoSendToCustomer: z.boolean().optional(),
  sendMessage: z.string().optional(),
  taxRate: z
    .any()
    .optional()
    .transform((v) => {
      if (v === '' || v === undefined || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    })
    .refine((v) => v === undefined || (v >= 0 && v <= 100), { message: 'Tax rate must be between 0 and 100' }),
});

const convertToJobSchema = z.object({
  startDate: z.date().optional().nullable(),
  dueDate: z.date().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
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
  if (!(amount > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Deposit amount must be greater than 0',
      path: ['paymentAmount'],
    });
  }
});

const QUOTE_PRODUCT_PICKER_LIMIT = 100;

function normalizeProductsList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  if (Array.isArray(res.products)) return res.products;
  return [];
}

const EMPTY_QUOTES_SUMMARY = {
  totalQuotes: 0,
  draftQuotes: 0,
  sentQuotes: 0,
  acceptedQuotes: 0,
};

const normalizeQuotesResponse = (response) => {
  const payload = response?.data?.data != null ? response.data : response;
  const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
  const summary = payload?.summary || {};

  return {
    quotes: data,
    total: Number(payload?.count ?? payload?.total ?? data.length),
    summary: {
      totalQuotes: Number(summary.totalQuotes ?? summary.total ?? data.length ?? EMPTY_QUOTES_SUMMARY.totalQuotes),
      draftQuotes: Number(summary.draftQuotes ?? data.filter((quote) => quote.status === 'draft').length),
      sentQuotes: Number(summary.sentQuotes ?? data.filter((quote) => quote.status === 'sent').length),
      acceptedQuotes: Number(summary.acceptedQuotes ?? data.filter((quote) => quote.status === 'accepted').length),
    },
  };
};

const QuoteProductPicker = forwardRef(({
  value,
  disabled,
  activeTenantId,
  activeShopId,
  onChange,
  onProductSelect,
  ...triggerProps
}, ref) => {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const debouncedProductSearch = useDebounce(searchText, DEBOUNCE_DELAYS.SEARCH);

  const { data: productResponse, isFetching } = useQuery({
    queryKey: ['products', 'quote-picker', activeTenantId, activeShopId, debouncedProductSearch],
    queryFn: () => productService.searchProducts(debouncedProductSearch, {
      limit: QUOTE_PRODUCT_PICKER_LIMIT,
      includeVariants: true,
    }),
    enabled: !disabled && !!activeTenantId,
    staleTime: 60 * 1000,
  });

  const { data: selectedProductResponse } = useQuery({
    queryKey: ['products', 'quote-picker-selected', activeTenantId, activeShopId, value],
    queryFn: () => productService.getProductById(value),
    enabled: !disabled && !!activeTenantId && !!value && !selectedProduct,
    staleTime: 2 * 60 * 1000,
  });

  const products = useMemo(() => normalizeProductsList(productResponse), [productResponse]);
  const selectedProductFromResponse = useMemo(() => {
    const product = selectedProductResponse?.data?.data
      ?? selectedProductResponse?.data
      ?? selectedProductResponse?.product
      ?? selectedProductResponse;
    return product?.id ? product : null;
  }, [selectedProductResponse]);
  const currentProduct = useMemo(() => {
    if (!value) return null;
    return products.find((product) => product.id === value)
      || (selectedProduct?.id === value ? selectedProduct : null)
      || (selectedProductFromResponse?.id === value ? selectedProductFromResponse : null);
  }, [products, selectedProduct, selectedProductFromResponse, value]);

  useEffect(() => {
    if (!value) {
      setSelectedProduct(null);
    } else if (selectedProduct && selectedProduct.id !== value) {
      setSelectedProduct(null);
    }
  }, [selectedProduct, value]);

  const handleSelectProduct = useCallback((product) => {
    setSelectedProduct(product);
    onChange(product.id);
    onProductSelect(product);
    setOpen(false);
  }, [onChange, onProductSelect]);

  const handleClear = useCallback(() => {
    setSelectedProduct(null);
    onChange('');
    setOpen(false);
  }, [onChange]);

  const triggerLabel = currentProduct
    ? `${currentProduct.name} — ₵${parseFloat(currentProduct.sellingPrice || 0).toFixed(2)}`
    : 'Search or select product';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          {...triggerProps}
        >
          <span className={currentProduct ? 'truncate text-foreground' : 'truncate text-muted-foreground'}>
            {triggerLabel}
          </span>
          <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search product name, SKU, or barcode"
              className="h-9 pl-9"
              autoFocus
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Searches the full active shop catalog.
          </p>
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            <button
              type="button"
              className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={handleClear}
            >
              None
            </button>
            {isFetching ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching products...
              </div>
            ) : products.length ? (
              products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full flex-col rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => handleSelectProduct(product)}
                >
                  <span className="truncate font-medium text-foreground">{product.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {product.sku ? `SKU: ${product.sku} · ` : ''}
                    ₵{parseFloat(product.sellingPrice || 0).toFixed(2)}
                    {product.trackStock !== false ? ` · Stock: ${Number(product.quantityOnHand || 0)}` : ''}
                  </span>
                </button>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {searchText ? 'No products found' : 'No active products found'}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});
QuoteProductPicker.displayName = 'QuoteProductPicker';

const Quotes = () => {
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { activeTenantId, activeTenant, isAdmin } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { activeStudioLocationId, activeStudioLocation, scopeReady } = useWorkspaceScope();
  const businessType = activeTenant?.businessType || 'printing_press';
  const effectiveStudioType =
    activeStudioLocation?.studioType ||
    activeTenant?.metadata?.studioType ||
    activeTenant?.metadata?.businessSubType ||
    businessType;
  const isShop = businessType === 'shop';
  const isPharmacy = businessType === 'pharmacy';
  const isRetailQuote = isShop || isPharmacy;
  const { isMobile } = useResponsive();
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({ status: 'all', customerId: 'all' });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingQuote, setViewingQuote] = useState(null);
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [converting, setConverting] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [quotePrintable, setQuotePrintable] = useState(null);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [deleteQuoteId, setDeleteQuoteId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteActivities, setQuoteActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [customerAddModalOpen, setCustomerAddModalOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [convertJobModalOpen, setConvertJobModalOpen] = useState(false);
  const [quoteToConvert, setQuoteToConvert] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentType, setAttachmentType] = useState('proposal');
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [attachmentPreviewVisible, setAttachmentPreviewVisible] = useState(false);
  const [lineItemDescriptionOptions, setLineItemDescriptionOptions] = useState([]);
  const [categoryOtherInputs, setCategoryOtherInputs] = useState({});
  const quotesQueryEnabled = scopeReady && !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId);

  const quotesQueryParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };

    if (filters.status && filters.status !== 'all') {
      params.status = filters.status;
    }
    if (filters.customerId && filters.customerId !== 'all') {
      params.customerId = filters.customerId;
    }
    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }

    return params;
  }, [
    pagination.current,
    pagination.pageSize,
    filters.status,
    filters.customerId,
    debouncedSearch,
  ]);

  const {
    data: quotesQueryResponse,
    error: quotesQueryError,
    isError: quotesQueryIsError,
    isFetching: quotesIsFetching,
    isLoading: loading,
    refetch: refetchQuotesQuery,
  } = useQuery({
    queryKey: queryKeys.quotes.list(activeTenantId, activeShopId, activeStudioLocationId, quotesQueryParams),
    queryFn: () => quoteService.getAll(quotesQueryParams),
    enabled: quotesQueryEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const quotesQueryData = useMemo(() => normalizeQuotesResponse(quotesQueryResponse), [quotesQueryResponse]);
  const quotes = quotesQueryData.quotes;
  const quotesCount = quotesQueryData.total;
  const refreshingQuotes = quotesIsFetching && !loading;

  const refetchQuotes = useCallback(async () => {
    await refetchQuotesQuery();
  }, [refetchQuotesQuery]);

  // Organization branding for printable quotes
  const { data: organizationData } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganization(),
    staleTime: 5 * 60 * 1000,
  });

  const organization = organizationData?.data?.data || organizationData?.data || {};

  const { data: customCategories = [] } = useQuery({
    queryKey: ['customCategories', activeTenantId, activeStudioLocationId],
    queryFn: async () => customDropdownService.getCustomOptions('job_category') || [],
    enabled: scopeReady && !isRetailQuote,
    staleTime: QUERY_STALE.SLOW,
  });

  const { data: jobItemCategoriesApi = [] } = useQuery({
    queryKey: queryKeys.jobs.categories(activeTenantId, activeStudioLocationId, effectiveStudioType),
    queryFn: () => jobService.getCategories(),
    enabled: scopeReady && !isRetailQuote,
    staleTime: QUERY_STALE.METADATA,
  });

  const jobItemCategoriesGrouped = useMemo(() => {
    const apiCats = Array.isArray(jobItemCategoriesApi?.data)
      ? jobItemCategoriesApi.data
      : (Array.isArray(jobItemCategoriesApi) ? jobItemCategoriesApi : []);
    const byGroup = new Map();
    apiCats.forEach((cat) => {
      const group = cat.group || 'Other';
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push({ value: cat.value, label: cat.label });
    });
    return byGroup;
  }, [jobItemCategoriesApi]);

  /** Tenant-saved Other values that are not already in the branch catalog */
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

  const quotePrintOrganization = useMemo(() => {
    const branch = quotePrintable?.shop || quotePrintable?.studioLocation || null;
    return mergeBranchOrganization(branch, organization);
  }, [quotePrintable, organization]);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers', 'active'],
    queryFn: async () => {
      const response = await userService.getAll({ limit: 100, isActive: 'true' });
      const data = response?.data || response;
      return data?.data || data || [];
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });

  const { data: notificationChannels } = useQuery({
    queryKey: queryKeys.settings.notificationChannels,
    queryFn: () => settingsService.getNotificationChannels(),
    enabled: quoteModalVisible && !editingQuote,
    staleTime: 60 * 1000,
  });

  const form = useForm({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerId: '',
      title: '',
      description: '',
      status: 'draft',
      validUntil: null,
      notes: '',
      scopeOfWork: '',
      termsAndConditions: '',
      paymentSchedule: [],
      items: [{ productId: '', category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 }],
      autoSendToCustomer: false,
      sendMessage: DEFAULT_QUOTE_SEND_MESSAGE,
      taxRate: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const {
    fields: paymentScheduleFields,
    append: appendPaymentSchedule,
    remove: removePaymentSchedule,
  } = useFieldArray({
    control: form.control,
    name: 'paymentSchedule',
  });

  const customerForm = useForm({
    resolver: zodResolver(quickCustomerSchema),
    defaultValues: { name: '', company: '', email: '', phone: '' },
  });

  const convertJobForm = useForm({
    resolver: zodResolver(convertToJobSchema),
    defaultValues: {
      startDate: null,
      dueDate: null,
      assignedTo: null,
      ...JOB_CREATE_PAYMENT_DEFAULTS,
    },
  });

  const { data: customersQueryData, refetch: refetchCustomers } = useQuery({
    queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, activeStudioLocationId, 'quotes-picker'),
    queryFn: () => customerService.getAll({ limit: 200, page: 1 }),
    enabled: scopeReady,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (customersQueryData) {
      setCustomers(normalizeCustomersList(customersQueryData));
    }
  }, [customersQueryData]);

  const loadLineItemDescriptionOptions = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const options = await customDropdownService.getCustomOptions('line_item_description');
      setLineItemDescriptionOptions(Array.isArray(options) ? options : []);
    } catch (error) {
      console.error('Failed to load line item description options:', error);
      setLineItemDescriptionOptions([]);
    }
  }, [activeTenantId]);

  useEffect(() => {
    loadLineItemDescriptionOptions();
  }, [loadLineItemDescriptionOptions]);

  const handleQuoteCategoryChange = useCallback((value, itemIndex) => {
    if (value === '__OTHER__') {
      setCategoryOtherInputs((prev) => ({ ...prev, [itemIndex]: '' }));
      return;
    }
    setCategoryOtherInputs((prev) => {
      const next = { ...prev };
      delete next[itemIndex];
      return next;
    });
  }, []);

  const handleSaveQuoteCustomCategory = useCallback(async (customValue, itemIndex) => {
    if (!customValue || !customValue.trim()) {
      showWarning('Please enter a category name');
      return;
    }

    try {
      const trimmed = customValue.trim();
      const saved = await customDropdownService.saveCustomOption('job_category', trimmed, trimmed);
      if (!saved) return;

      queryClient.invalidateQueries({ queryKey: ['customCategories'] });
      const currentItems = form.getValues('items') || [];
      const nextItems = currentItems.map((row, i) =>
        i === itemIndex ? { ...row, category: saved.value } : row
      );
      form.setValue('items', nextItems, { shouldDirty: true, shouldValidate: true });
      setCategoryOtherInputs((prev) => {
        const next = { ...prev };
        delete next[itemIndex];
        return next;
      });
      showSuccess(`"${saved.label || trimmed}" added to categories`);
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save custom category');
    }
  }, [form, queryClient]);

  const persistQuoteCustomCategories = useCallback(async (items = []) => {
    const uniqueCategories = collectResolvedCategories(items);
    if (uniqueCategories.length === 0) return;

    const builtIn = new Set();
    jobItemCategoriesGrouped.forEach((groupItems) => {
      groupItems.forEach((cat) => builtIn.add(String(cat.value || '').toLowerCase()));
    });
    const customOnly = uniqueCategories.filter(
      (category) => !builtIn.has(String(category).toLowerCase())
    );
    if (customOnly.length === 0) return;

    await Promise.allSettled(
      customOnly.map((category) =>
        customDropdownService.saveCustomOption('job_category', category, category)
      )
    );
    queryClient.invalidateQueries({ queryKey: ['customCategories'] });
  }, [jobItemCategoriesGrouped, queryClient]);

  const persistLineItemDescriptions = useCallback(async (items = []) => {
    const uniqueDescriptions = [...new Set(
      (items || [])
        .map((item) => String(item?.description || '').trim())
        .filter(Boolean)
    )];

    if (uniqueDescriptions.length === 0) return;

    await Promise.allSettled(
      uniqueDescriptions.map((description) =>
        customDropdownService.saveCustomOption('line_item_description', description, description)
      )
    );
    await loadLineItemDescriptionOptions();
  }, [loadLineItemDescriptionOptions]);

  const handleAddCustomerSubmit = useCallback(async (values) => {
    setAddingCustomer(true);
    try {
      const response = await customerService.create({
        name: values.name,
        company: values.company || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
      });
      const newCustomer = response?.data ?? response;
      if (!newCustomer?.id) throw new Error('Invalid customer response');
      await refetchCustomers();
      setCustomerAddModalOpen(false);
      customerForm.reset({ name: '', company: '', email: '', phone: '' });
      showSuccess('Customer created successfully');
      form.setValue('customerId', String(newCustomer.id));
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to create customer');
    } finally {
      setAddingCustomer(false);
    }
  }, [form, refetchCustomers, customerForm]);

  const buildPrintableQuote = (quote) => {
    if (!quote) return null;
    return buildQuotePrintModel(quote, {
      businessType: businessType || activeTenant?.businessType,
      organization: quotePrintOrganization,
    });
  };

  const quotePrintModel = useMemo(
    () => (quotePrintable ? buildPrintableQuote(quotePrintable) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when quote / org / type change
    [quotePrintable, quotePrintOrganization, businessType, activeTenant?.businessType]
  );

  useEffect(() => {
    setPageSearchConfig({ scope: 'quotes', placeholder: SEARCH_PLACEHOLDERS.QUOTES });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  // Handle ?add=1 query param from quick actions
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditingQuote(null);
      form.reset({
        customerId: '',
        title: '',
        description: '',
        status: 'draft',
        validUntil: null,
        notes: '',
        scopeOfWork: '',
        termsAndConditions: !isRetailQuote
          ? (organization?.defaultTermsAndConditions || DEFAULT_STUDIO_QUOTE_TERMS.join('\n'))
          : '',
        paymentSchedule: [],
        items: [{ productId: '', category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 }],
        taxRate: '',
      });
      void refetchCustomers();
      setQuoteModalVisible(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('add');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams, form, refetchCustomers]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (quotesQueryIsError) {
      showError(quotesQueryError, 'Failed to load quotes');
    }
  }, [quotesQueryIsError, quotesQueryError]);

  const filteredQuotes = useMemo(() => {
    return quotes;
  }, [quotes]);

  const paginatedQuotes = useMemo(() => {
    return filteredQuotes;
  }, [filteredQuotes]);

  const summaryStats = useMemo(() => {
    return {
      totals: quotesQueryData.summary,
    };
  }, [quotesQueryData.summary]);

  const fetchQuoteDetails = async (quoteId) => {
    try {
      const response = await quoteService.getById(quoteId);
      const data = response?.data ?? response;
      setViewingQuote((prev) => (prev?.id === quoteId ? data : prev));
      try {
        setLoadingActivities(true);
        const activitiesResponse = await quoteService.getActivities(quoteId);
        const activitiesData = activitiesResponse?.data ?? activitiesResponse;
        setQuoteActivities(Array.isArray(activitiesData) ? activitiesData : []);
      } catch (activityError) {
        console.error('Failed to fetch quote activities:', activityError);
        setQuoteActivities([]);
      } finally {
        setLoadingActivities(false);
      }
      // Return full quote details so callers (e.g. edit flow) can use them
      return data;
    } catch (error) {
      console.error(`Failed to fetch quote ${quoteId}:`, error);
      showError(error, 'Failed to fetch quote details');
      return null;
    }
  };

  const nextStatusMap = { draft: 'sent', sent: 'accepted' };
  const nextStatusLabel = (status) => (status === 'sent' ? 'Sent' : status === 'accepted' ? 'Accepted' : status);

  const handleMarkStatus = async (quote, newStatus) => {
    setUpdatingStatus(true);
    try {
      await quoteService.updateStatus(quote.id, newStatus);
      showSuccess(`Quote marked as ${nextStatusLabel(newStatus)}`);
      await refreshAfterQuoteChange(queryClient);
      refetchQuotes();
      if (viewingQuote?.id === quote.id) {
        const res = await quoteService.getById(quote.id);
        setViewingQuote(res?.data ?? res);
      }
    } catch (err) {
      showError(err, 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleView = (quote) => {
    setViewingQuote(quote);
    setDrawerVisible(true);
    fetchQuoteDetails(quote.id);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setViewingQuote(null);
    setAttachmentPreview(null);
    setAttachmentPreviewVisible(false);
  };

  const handleAttachmentUpload = useCallback(async ({ file, onSuccess, onError }) => {
    if (!viewingQuote?.id) {
      onError?.(new Error('No quote selected'));
      return;
    }
    try {
      setUploadingAttachment(true);
      await quoteService.uploadAttachment(viewingQuote.id, file, attachmentType);
      await fetchQuoteDetails(viewingQuote.id);
      showSuccess(`${file.name} uploaded successfully`);
      onSuccess?.('ok', file);
    } catch (error) {
      const errMsg = error?.response?.data?.message || 'Failed to upload attachment';
      showError(errMsg);
      onError?.(error);
    } finally {
      setUploadingAttachment(false);
    }
  }, [viewingQuote?.id, attachmentType]);

  const handleAttachmentRemove = useCallback(async (attachment) => {
    if (!viewingQuote?.id) return;
    try {
      await quoteService.deleteAttachment(viewingQuote.id, attachment.id);
      await fetchQuoteDetails(viewingQuote.id);
      showSuccess('Attachment removed');
    } catch (error) {
      const errMsg = error?.response?.data?.message || 'Failed to remove attachment';
      showError(errMsg);
    }
  }, [viewingQuote?.id]);

  const handleAttachmentPreview = useCallback((attachment) => {
    setAttachmentPreview(attachment);
    setAttachmentPreviewVisible(true);
  }, []);

  const attachmentList = useMemo(
    () => (Array.isArray(viewingQuote?.attachments) ? viewingQuote.attachments : []),
    [viewingQuote?.attachments]
  );

  const canEditAttachments = viewingQuote && ['draft', 'sent'].includes(viewingQuote.status);

  const handleAddQuote = async () => {
    form.reset({
      customerId: '',
      title: '',
      description: '',
      status: 'draft',
      validUntil: null,
      notes: '',
      scopeOfWork: '',
      termsAndConditions: !isRetailQuote
        ? (organization?.defaultTermsAndConditions || DEFAULT_STUDIO_QUOTE_TERMS.join('\n'))
        : '',
      paymentSchedule: [],
      items: [{ productId: '', category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 }],
      autoSendToCustomer: false,
      sendMessage: DEFAULT_QUOTE_SEND_MESSAGE,
      taxRate: '',
    });
    setCategoryOtherInputs({});
    setEditingQuote(null);
    setQuoteModalVisible(true);
    void refetchCustomers();
  };

  const handleEditQuote = async (quote) => {
    setEditingQuote(quote);
    const details = await fetchQuoteDetails(quote.id);
    if (!details) {
      return;
    }
    void refetchCustomers();

    form.reset({
      // Prefer explicit customerId from API; fall back to nested customer.id
      customerId: String(details.customerId || details.customer?.id || ''),
      title: details.title,
      description: details.description || '',
      status: details.status,
      validUntil: details.validUntil ? new Date(details.validUntil) : null,
      notes: details.notes || '',
      scopeOfWork: details.scopeOfWork || '',
      termsAndConditions: details.termsAndConditions
        || organization?.defaultTermsAndConditions
        || (!isRetailQuote ? DEFAULT_STUDIO_QUOTE_TERMS.join('\n') : ''),
      paymentSchedule: Array.isArray(details.paymentSchedule)
        ? details.paymentSchedule.map((row) => ({
            label: row?.label || '',
            amount: row?.amount != null ? Number(row.amount) : '',
            percent: row?.percent != null ? Number(row.percent) : '',
          }))
        : [],
      items: (details.items || []).map((item) => ({
        productId: item.productId || '',
        category: item.metadata?.category || '',
        description: item.description,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice),
        discountAmount: parseFloat(item.discountAmount || 0)
      })),
      taxRate:
        details.taxRate !== undefined && details.taxRate !== null && details.taxRate !== ''
          ? parseFloat(details.taxRate)
          : ''
    });
    setCategoryOtherInputs({});
    setQuoteModalVisible(true);
  };

  const handleDeleteQuote = useCallback((quote) => {
    setDeleteQuoteId(quote.id);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteQuoteId) return;
    try {
      if (!guardOnline(showError)) return;
      await quoteService.delete(deleteQuoteId);
      showSuccess('Quote deleted successfully');
      await refreshAfterQuoteChange(queryClient);
      refetchQuotes();
      if (viewingQuote?.id === deleteQuoteId) {
        handleCloseDrawer();
      }
      setDeleteDialogOpen(false);
      setDeleteQuoteId(null);
    } catch (error) {
      showError(error, error.error || 'Failed to delete quote');
    }
  };

  const onSubmit = async (values) => {
    let items = values.items || [];
    if (!isRetailQuote) {
      items = resolveOtherCategoryItems(items, categoryOtherInputs);
      if (hasUnresolvedOtherCategory(items)) {
        showWarning('Enter a category name for each "Other (specify)" line item, or pick a category from the list.');
        return;
      }
      const missingCategory = items.some((item) => !String(item.category || '').trim());
      if (missingCategory) {
        showWarning('Select a category for each quote line item.');
        return;
      }
    }

    const payload = {
      customerId: values.customerId,
      title: values.title,
      description: values.description,
      status: values.status,
      validUntil: values.validUntil ? dayjs(values.validUntil).format('YYYY-MM-DD') : null,
      notes: values.notes,
      items: items.map((item) => {
        const category = String(item.category || '').trim();
        const metadata = {
          ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
          ...(category ? { category } : {}),
        };
        return {
          ...(item.productId && { productId: item.productId }),
          description: item.description,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          discountAmount: Number(item.discountAmount || 0),
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        };
      })
    };
    if (!isRetailQuote) {
      payload.scopeOfWork = values.scopeOfWork || null;
      payload.termsAndConditions = values.termsAndConditions || null;
      payload.paymentSchedule = (values.paymentSchedule || [])
        .map((row) => ({
          label: String(row?.label || '').trim(),
          amount: row?.amount === '' || row?.amount == null ? null : Number(row.amount),
          percent: row?.percent === '' || row?.percent == null ? null : Number(row.percent),
        }))
        .filter((row) => row.label);
    }
    if (organization.tax?.enabled && values.taxRate !== undefined && values.taxRate !== '') {
      payload.taxRate = Number(values.taxRate);
    }
    if (!editingQuote) {
      payload.autoSendToCustomer = values.autoSendToCustomer === true;
      if (values.sendMessage && String(values.sendMessage).trim()) {
        payload.sendMessage = String(values.sendMessage).trim();
      }
      if (payload.autoSendToCustomer) {
        try {
          // Prefer already-fetched channels (loaded when modal opens) so create isn't delayed.
          const channels =
            notificationChannels != null
              ? notificationChannels
              : await settingsService.getNotificationChannels();
          const data = channels?.data ?? channels;
          const hasChannel = !!(data?.email || data?.whatsapp || data?.sms);
          if (!hasChannel) {
            showError('Configure at least one of Email, WhatsApp, or SMS in Settings to auto-send quotes to customers.');
            return;
          }
          const selectedCustomer = customers.find((c) => c.id === values.customerId);
          const customerHasEmail = selectedCustomer?.email?.trim?.();
          const customerHasPhone = selectedCustomer?.phone?.trim?.();
          if (data?.email && (!selectedCustomer || !customerHasEmail)) {
            showError('Selected customer has no email address. Add email in Customers to send the quote via email, or turn off auto-send.');
            return;
          }
          if ((data?.whatsapp || data?.sms) && (!selectedCustomer || !customerHasPhone)) {
            showError('Selected customer has no phone number. Add phone in Customers to send the quote via WhatsApp or SMS, or turn off auto-send.');
            return;
          }
        } catch (err) {
          showError(err, 'Could not check notification settings.');
          return;
        }
      }
    }

    try {
      if (!guardOnline(showError)) return;
      if (editingQuote) {
        await quoteService.update(editingQuote.id, payload);
        void Promise.all([
          persistLineItemDescriptions(payload.items),
          persistQuoteCustomCategories(items),
        ]);
        showSuccess('Quote updated successfully');
      } else {
        const createRes = await quoteService.create(payload);
        void Promise.all([
          persistLineItemDescriptions(payload.items),
          persistQuoteCustomCategories(items),
        ]);
        const delivery = createRes?.data?.delivery ?? createRes?.delivery;
        if (delivery?.queued) {
          showSuccess('Quote created successfully. Sending notifications…');
        } else {
          showSuccess('Quote created successfully');
        }
      }
      setQuoteModalVisible(false);
      setCategoryOtherInputs({});
      form.reset();
      await refreshAfterQuoteChange(queryClient);
      refetchQuotes();
    } catch (error) {
      console.error('Failed to save quote:', error);
      showError(error, error.error || 'Failed to save quote');
    }
  };

  const quoteProductPickerDisabled = !isRetailQuote || !activeTenantId || (shopContext?.isShopWorkspace && !activeShopId);

  const openConvertToJobModal = useCallback((quote) => {
    if (!quote) return;
    setQuoteToConvert(quote);
    convertJobForm.reset({
      startDate: null,
      dueDate: null,
      assignedTo: null,
      ...JOB_CREATE_PAYMENT_DEFAULTS,
    });
    setConvertJobModalOpen(true);
  }, [convertJobForm]);

  const handleConvertToJob = useCallback(async (values) => {
    if (!quoteToConvert) return;
    setConverting(true);
    try {
      const quoteTotal = parseFloat(quoteToConvert.totalAmount) || 0;
      if (values.paymentStatus === 'deposit') {
        const amount = parseFloat(values.paymentAmount);
        if (quoteTotal > 0 && amount >= quoteTotal - 0.01) {
          convertJobForm.setError('paymentAmount', {
            message: 'Deposit must be less than the quote total. Choose Paid in full instead.',
          });
          return;
        }
      }
      const payload = {
        assignedTo: values.assignedTo || null,
        startDate: values.startDate ? dayjs(values.startDate).format('YYYY-MM-DD') : null,
        dueDate: values.dueDate ? dayjs(values.dueDate).format('YYYY-MM-DD') : null,
        ...buildJobCreatePaymentPayload(values),
      };
      const response = await quoteService.convertToJob(quoteToConvert.id, payload);
      const data = response?.data ?? response;
      const job = data?.data?.job ?? data?.job ?? data;
      showSuccess(`Quote converted to job ${job?.jobNumber || ''}`.trim());
      await refreshAfterQuoteChange(queryClient);
      refetchQuotes();
      setConvertJobModalOpen(false);
      setQuoteToConvert(null);
      convertJobForm.reset();
      if (job) {
        navigate('/jobs');
      }
    } catch (error) {
      console.error('Failed to convert quote to job:', error);
      showError(error, error.error || 'Failed to convert quote to job');
    } finally {
      setConverting(false);
    }
  }, [quoteToConvert, queryClient, refetchQuotes, navigate, convertJobForm]);

  const handleConvertToSale = async (quote) => {
    setConverting(true);
    try {
      const response = await quoteService.convertToSale(quote.id, 'credit');
      const data = response?.data ?? response;
      const sale = data?.data?.sale ?? data?.sale ?? data;
      showSuccess(`Quote converted to sale ${sale?.saleNumber || ''}`.trim());
      await refreshAfterQuoteChange(queryClient);
      refetchQuotes();
      if (sale) {
        navigate('/sales');
      }
    } catch (error) {
      console.error('Failed to convert quote to sale:', error);
      showError(error, error.error || 'Failed to convert quote to sale');
    } finally {
      setConverting(false);
    }
  };

  const openPrintableQuote = (quote, { autoDownload = false } = {}) => {
    setQuotePrintable(quote);
    setPrintModalVisible(true);
    if (autoDownload) {
      setPendingDownload(true);
    }
  };

  const closePrintableQuote = () => {
    setPrintModalVisible(false);
    setQuotePrintable(null);
    setPendingDownload(false);
  };

  const handleDownloadQuote = useCallback(async (quote, { silent = false } = {}) => {
    const target = quote || quotePrintable;
    if (!target) return;
    try {
      const element = document.querySelector('.printable-quotation')
        || document.querySelector('.printable-invoice');
      if (!element) {
        if (!silent) {
          showError(null, 'Preview the quote before downloading');
        }
        return;
      }
      await generatePDF(element, {
        filename: `Quote-${target.quoteNumber}.pdf`,
        format: 'a4',
        orientation: 'portrait',
      });
      if (!silent) {
        showSuccess('Quote PDF downloaded successfully');
      }
    } catch (error) {
      console.error('Error generating quote PDF:', error);
      if (!silent) {
        showError(error, 'Failed to download quote');
      }
    } finally {
      setPendingDownload(false);
    }
  }, [quotePrintable]);

  const handlePrintQuote = () => {
    if (!quotePrintable) return;
    const element = document.querySelector('.printable-quotation')
      || document.querySelector('.printable-invoice');
    const wrapper = element?.parentElement;
    if (wrapper) {
      openPrintDialog(wrapper, `Quote-${quotePrintable.quoteNumber}`);
    }
  };

  useEffect(() => {
    if (printModalVisible && pendingDownload && quotePrintable) {
      const timer = setTimeout(() => {
        handleDownloadQuote(quotePrintable, { silent: true });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [printModalVisible, pendingDownload, quotePrintable, handleDownloadQuote]);

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'quoteNumber',
      label: 'Quote #',
      render: (_, record) => <span className="font-medium text-foreground">{record?.quoteNumber || '—'}</span>
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
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={record?.status} />
    },
    {
      key: 'validUntil',
      label: 'Valid Until',
      render: (_, record) => <span className="text-foreground">{record?.validUntil ? dayjs(record.validUntil).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (_, record) => <span className="text-foreground font-medium">₵ {parseFloat(record?.totalAmount || 0).toFixed(2)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleView}
          extraActions={[
            isAdmin && record.status !== 'accepted' && {
              key: 'delete',
              label: 'Delete quote',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => handleDeleteQuote(record),
              destructive: true
            }
          ].filter(Boolean)}
        />
      )
    }
  ], [handleView, handleDeleteQuote, isAdmin]);

  const handleClearFilters = () => {
    setFilters({
      status: 'all',
      customerId: 'all'
    });
    setSearchValue('');
    setPagination({ ...pagination, current: 1 });
  };

  const hasActiveFilters = filters.status !== 'all' || filters.customerId !== 'all' || !!debouncedSearch.trim();

  const drawerFields = useMemo(() => viewingQuote ? [
    { label: 'Quote Number', value: viewingQuote.quoteNumber },
    { label: 'Title', value: viewingQuote.title },
    {
      label: 'Customer',
      value: (
        <div>
          <div>{viewingQuote.customer?.name}</div>
          {viewingQuote.customer?.company && (
            <div className="text-muted-foreground text-sm">{viewingQuote.customer.company}</div>
          )}
        </div>
      )
    },
    {
      label: 'Status',
      value: (
        <StatusChip status={viewingQuote.status} />
      )
    },
    {
      label: 'Valid Until',
      value: viewingQuote.validUntil ? dayjs(viewingQuote.validUntil).format('MMM DD, YYYY') : '—'
    },
    ...(parseFloat(viewingQuote.taxAmount || 0) > 0
      ? [
          {
            label: 'Tax rate',
            value: `${parseFloat(viewingQuote.taxRate || 0).toFixed(2)}%`
          },
          {
            label: organization.tax?.displayLabel || 'Tax',
            value: `₵ ${parseFloat(viewingQuote.taxAmount || 0).toFixed(2)}`
          }
        ]
      : []),
    {
      label: 'Total Amount',
      value: (
        <strong className="text-lg text-primary">
          ₵ {parseFloat(viewingQuote.totalAmount || 0).toFixed(2)}
        </strong>
      )
    },
    {
      label: 'Created By',
      value: viewingQuote.creator
        ? `${viewingQuote.creator.name} (${viewingQuote.creator.email})`
        : 'System'
    },
    viewingQuote.description && { label: 'Description', value: viewingQuote.description },
    viewingQuote.notes && { label: 'Notes', value: viewingQuote.notes }
  ].filter(Boolean) : [], [viewingQuote, organization]);

  const isQuoteAlreadyConvertedToJob = useMemo(() => {
    if (!viewingQuote) return false;
    if (viewingQuote.convertedJobId) return true;
    const conversionFromActivity = (quoteActivities || []).find(
      (activity) => activity?.type === 'conversion' && activity?.metadata?.jobId
    );
    return Boolean(conversionFromActivity);
  }, [viewingQuote, quoteActivities]);

  const quotesEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(EMPTY_STATES.QUOTES_FILTERED, {
          primary: handleClearFilters,
        });
      }
      return getEmptyStateProps(EMPTY_STATES.QUOTES, {
        primary: handleAddQuote,
      });
    },
    [hasActiveFilters, handleClearFilters, handleAddQuote]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <WelcomeSection
          welcomeMessage="Quotes"
          subText="Create quotes, attach proposal documents, and share them with customers."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setFilterDrawerOpen(true)} size={isMobile ? "icon" : "default"}>
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter quotes by status or customer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={refetchQuotes}
                disabled={refreshingQuotes}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingQuotes ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh quotes list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleAddQuote} className="flex-1 min-w-0 md:flex-none min-h-[44px] touch-manipulation">
                <Plus className="h-4 w-4" />
                <span className="ml-2">New Quote</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new quote</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Total Quotes Card */}
        <DashboardStatsCard
          tooltip="Total number of quotes created"
          title="Total Quotes"
          value={summaryStats?.totals?.totalQuotes || 0}
          icon={FileText}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />

        {/* Draft Card */}
        <DashboardStatsCard
          tooltip="Quotes that are still in draft"
          title="Draft"
          value={summaryStats?.totals?.draftQuotes || 0}
          icon={FilePlus}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#166534"
        />

        {/* Sent Card */}
        <DashboardStatsCard
          tooltip="Quotes sent to customers"
          title="Sent"
          value={summaryStats?.totals?.sentQuotes || 0}
          icon={CheckCircle}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />

        {/* Accepted Card */}
        <DashboardStatsCard
          tooltip="Quotes accepted by customers"
          title="Accepted"
          value={summaryStats?.totals?.acceptedQuotes || 0}
          icon={Receipt}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedQuotes}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={quotesEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: quotesCount
        }}
        viewMode={tableViewMode}
        onViewModeChange={setTableViewMode}
      />

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto"
          style={{ top: 8, bottom: 8, right: 8, height: 'calc(100dvh - 16px)', borderRadius: 8 }}
        >
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Quotes</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 md:space-y-6 mt-4 md:mt-6">
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
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
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
        title="Quote Details"
        width={720}
        primaryAction={viewingQuote ? {
          label: isRetailQuote ? 'Convert to Sale' : 'Convert to Job',
          icon: <FilePlus className="h-4 w-4" />,
          onClick: () => (isRetailQuote ? handleConvertToSale(viewingQuote) : openConvertToJobModal(viewingQuote)),
          disabled: converting || (!isRetailQuote && isQuoteAlreadyConvertedToJob)
        } : null}
        moreMenuItems={viewingQuote ? [
          { key: 'view-pdf', label: 'View PDF', icon: <FileText className="h-4 w-4" />, onClick: () => openPrintableQuote(viewingQuote) },
          ...(nextStatusMap[viewingQuote.status] ? [{
            key: 'mark-status',
            label: `Mark as ${nextStatusLabel(nextStatusMap[viewingQuote.status])}`,
            icon: viewingQuote.status === 'draft' ? <Send className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />,
            onClick: () => handleMarkStatus(viewingQuote, nextStatusMap[viewingQuote.status]),
            disabled: updatingStatus
          }] : []),
          { key: 'edit', label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => handleEditQuote(viewingQuote) },
          ...(isAdmin && viewingQuote.status !== 'accepted' ? [
            { key: 'delete', label: 'Delete quote', icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDeleteQuote(viewingQuote), destructive: true }
          ] : [])
        ] : []}
        tabs={viewingQuote ? [
          {
            key: 'details',
            label: 'Summary',
            content: (
              <div className="space-y-6">
                <DrawerSectionCard title="Quote summary">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{viewingQuote.title}</div>
                      <div className="text-muted-foreground text-sm">{viewingQuote.quoteNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Total Amount</div>
                      <div className="text-2xl font-bold text-primary">
                        ₵ {parseFloat(viewingQuote.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <Descriptions column={1} className="space-y-0">
                    {drawerFields.map((field) => (
                      <DescriptionItem key={field.label} label={field.label}>
                        {field.value || '—'}
                      </DescriptionItem>
                    ))}
                  </Descriptions>
                </DrawerSectionCard>
              </div>
            )
          },
          {
            key: 'items',
            label: 'Line Items',
            content: (
              <DrawerSectionCard title="Line items">
                {(viewingQuote.items || []).length ? (
                  <div className="space-y-0">
                    <div className="grid grid-cols-12 gap-2 pb-2 border-b border-gray-200 text-sm font-semibold text-foreground">
                      {!isRetailQuote && <div className="col-span-3">Category</div>}
                      <div className={!isRetailQuote ? 'col-span-3' : 'col-span-6'}>Description</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">Unit price (₵)</div>
                      <div className="col-span-2 text-right">Total (₵)</div>
                    </div>
                    {viewingQuote.items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 py-3 border-b border-gray-200/80 last:border-b-0 text-sm"
                      >
                        {!isRetailQuote && (
                          <div className="col-span-3 text-foreground">
                            {item.metadata?.category || '—'}
                          </div>
                        )}
                        <div className={!isRetailQuote ? 'col-span-3' : 'col-span-6'}>
                          <div className="font-medium text-foreground">{item.description}</div>
                          {item.metadata && Object.keys(item.metadata || {}).filter((key) => key !== 'category').length > 0 && (
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {JSON.stringify(
                                Object.fromEntries(
                                  Object.entries(item.metadata || {}).filter(([key]) => key !== 'category')
                                )
                              )}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-right text-gray-700">{item.quantity}</div>
                        <div className="col-span-2 text-right text-gray-700">{parseFloat(item.unitPrice || 0).toFixed(2)}</div>
                        <div className="col-span-2 text-right font-medium text-foreground">{parseFloat(item.total || 0).toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="pt-3 mt-2 border-t border-gray-200 space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="text-foreground font-medium">₵ {parseFloat(viewingQuote.subtotal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total Discount</span>
                        <span className="text-foreground">-₵ {parseFloat(viewingQuote.discountTotal || 0).toFixed(2)}</span>
                      </div>
                      {parseFloat(viewingQuote.taxAmount || 0) > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            {organization.tax?.displayLabel || 'Tax'} (
                            {parseFloat(viewingQuote.taxRate || 0).toFixed(2)}%)
                          </span>
                          <span className="text-foreground">₵ {parseFloat(viewingQuote.taxAmount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-semibold text-foreground pt-2">
                        <span>Grand Total</span>
                        <span>₵ {parseFloat(viewingQuote.totalAmount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>No line items found for this quote.</AlertDescription>
                  </Alert>
                )}
              </DrawerSectionCard>
            )
          },
          {
            key: 'attachments',
            label: 'Attachments',
            content: (
              <DrawerSectionCard title="Proposal documents">
                <p className="text-sm text-muted-foreground mb-3">
                  Attach proposal PDFs, requirements, agreements, or other supporting files.
                </p>
                {canEditAttachments && (
                  <div className="mb-4 space-y-2">
                    <Label>Document type</Label>
                    <Select value={attachmentType} onValueChange={setAttachmentType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTE_ATTACHMENT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <FileUpload
                  onFileSelect={({ file }) => handleAttachmentUpload({ file, onSuccess: () => {}, onError: () => {} })}
                  disabled={!canEditAttachments || uploadingAttachment}
                  uploading={uploadingAttachment}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
                  maxSizeMB={uploadMaxSizeMb}
                  uploadedFiles={attachmentList.map((file) => ({
                    ...file,
                    originalName: `[${quoteAttachmentTypeLabel(file.type)}] ${file.originalName || file.name || 'Attachment'}`,
                  }))}
                  onFilePreview={handleAttachmentPreview}
                  onFileRemove={canEditAttachments ? handleAttachmentRemove : undefined}
                />
                {!canEditAttachments && attachmentList.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">No attachments on this quote.</p>
                )}
              </DrawerSectionCard>
            )
          },
          {
            key: 'activities',
            label: 'Activity',
            content: (() => {
              const activities = quoteActivities || [];
              
              const creationActivity = viewingQuote ? {
                id: 'creation',
                type: 'creation',
                createdAt: viewingQuote.createdAt,
                createdByUser: viewingQuote.creator || null
              } : null;

              // API returns activities newest-first; synthetic creation was prepended unconditionally,
              // which broke order (e.g. 9:52 row before 9:58). Merge then sort by time descending.
              const merged = creationActivity ? [creationActivity, ...activities] : [...activities];
              const allActivities = merged.slice().sort((a, b) => {
                const diff = dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
                if (diff !== 0) return diff;
                return String(b.id ?? '').localeCompare(String(a.id ?? ''));
              });
              
              if (loadingActivities) {
                return (
                  <DrawerSectionCard title="Activity">
                    <div className="text-center py-8 text-muted-foreground text-sm">Loading activities...</div>
                  </DrawerSectionCard>
                );
              }
              
              if (allActivities.length === 0) {
                return (
                  <DrawerSectionCard title="Activity">
                    <Alert>
                      <AlertTitle>No activity logged yet.</AlertTitle>
                    </Alert>
                  </DrawerSectionCard>
                );
              }
              
              const timelineItems = allActivities.map((activity, index) => {
                const isLast = index === allActivities.length - 1;
                
                if (activity.type === 'creation') {
                  return (
                    <TimelineItem key={activity.id} isLast={isLast}>
                      <TimelineIndicator />
                      <TimelineContent>
                        <TimelineTitle className="text-foreground">
                          {activity.createdByUser 
                            ? `${activity.createdByUser.name} created quote ${viewingQuote.quoteNumber}`
                            : `Quote ${viewingQuote.quoteNumber} created`}
                        </TimelineTitle>
                        <TimelineTime className="text-foreground">
                          {dayjs(activity.createdAt).format('MMM DD, YYYY [at] h:mm A')}
                        </TimelineTime>
                      </TimelineContent>
                    </TimelineItem>
                  );
                }
                
                const activityTypeLabels = {
                  note: 'Note',
                  status_change: 'Status Changed',
                  conversion: 'Conversion'
                };
                
                return (
                  <TimelineItem key={activity.id} isLast={isLast}>
                    <TimelineIndicator />
                    <TimelineContent>
                      <TimelineTitle className="text-foreground">
                        {activityTypeLabels[activity.type] || activity.type.toUpperCase()} {activity.subject ? `- ${activity.subject}` : ''}
                      </TimelineTitle>
                      <TimelineTime className="text-foreground">
                        {dayjs(activity.createdAt).format('MMM DD, YYYY [at] h:mm A')}
                        {activity.createdByUser ? ` • ${activity.createdByUser.name}` : ''}
                      </TimelineTime>
                      {activity.notes && (
                        <TimelineDescription className="text-foreground">{activity.notes}</TimelineDescription>
                      )}
                      {activity.metadata?.oldStatus && activity.metadata?.newStatus && (
                        <TimelineDescription className="text-foreground">
                          Status: {activity.metadata.oldStatus} → {activity.metadata.newStatus}
                        </TimelineDescription>
                      )}
                      {activity.metadata?.jobNumber && (
                        <TimelineDescription className="text-foreground">
                          Converted to job: {activity.metadata.jobNumber}
                          {activity.metadata?.jobId && (
                            <Link to={`/jobs?highlight=${activity.metadata.jobId}`} className="ml-2 text-brand hover:underline">
                              View job
                            </Link>
                          )}
                        </TimelineDescription>
                      )}
                      {activity.metadata?.saleNumber && (
                        <TimelineDescription className="text-foreground">
                          Converted to sale: {activity.metadata.saleNumber}
                        </TimelineDescription>
                      )}
                    </TimelineContent>
                  </TimelineItem>
                );
              });
              
              return (
                <DrawerSectionCard title="Activity">
                  <Timeline>
                    {timelineItems}
                  </Timeline>
                </DrawerSectionCard>
              );
            })()
          }
        ] : []}
      />

      <MobileFormDialog
        open={quoteModalVisible}
        onOpenChange={setQuoteModalVisible}
        title={editingQuote ? `Edit Quote (${editingQuote.quoteNumber})` : 'Create Quote'}
        description={editingQuote ? 'Update quote details' : 'Create a new quote for a customer'}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] touch-manipulation"
              onClick={() => {
                setQuoteModalVisible(false);
                setEditingQuote(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="quote-form" loading={form.formState.isSubmitting} className="min-h-[44px] touch-manipulation">
              {editingQuote ? 'Update Quote' : 'Create Quote'}
            </Button>
          </>
        }
        className="w-full max-w-[calc(100vw-1rem)] sm:w-[var(--modal-w-2xl)]"
      >
        <Form {...form}>
          <form id="quote-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormFieldGrid columns={2}>
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (value === '__create_customer__') {
                          setCustomerAddModalOpen(true);
                          return;
                        }
                        field.onChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={String(customer.id)}>
                            {customer.name} {customer.company ? `(${customer.company})` : ''}
                          </SelectItem>
                        ))}
                        <SelectSeparator className="my-2" />
                        <SelectItem value="__create_customer__">
                          <div className="flex items-center">
                            <Plus className="h-4 w-4 mr-2" />
                            Create customer
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
                        {statusOptions.map((option) => (
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
            </FormFieldGrid>

            <FormFieldGrid columns={2}>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRetailQuote ? 'Quote Title' : 'Project Summary'}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={isRetailQuote ? 'Quote title' : 'Short project summary'} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="validUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid Until (optional)</FormLabel>
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
            </FormFieldGrid>

            <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isRetailQuote ? 'Description (optional)' : 'Project Description (optional)'}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={isRetailQuote ? 'Describe the work or specifications' : 'Brief project overview'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            {!isRetailQuote && (
              <>
                <FormField
                  control={form.control}
                  name="scopeOfWork"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope of Work (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={4}
                          placeholder="Detailed deliverables and what is included in this quotation"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="termsAndConditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms &amp; Conditions (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={5}
                          placeholder="One term per line"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Payment Schedule (optional)</div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendPaymentSchedule({ label: '', amount: '', percent: '' })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add milestone
                    </Button>
                  </div>
                  {paymentScheduleFields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Add milestones (e.g. Advance, Delivery) to show a payment schedule on the PDF.
                    </p>
                  )}
                  {paymentScheduleFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-border rounded-md p-3">
                      <FormField
                        control={form.control}
                        name={`paymentSchedule.${index}.label`}
                        render={({ field: f }) => (
                          <FormItem className="sm:col-span-5">
                            <FormLabel>Milestone</FormLabel>
                            <FormControl>
                              <Input {...f} placeholder="e.g. Advance payment" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`paymentSchedule.${index}.percent`}
                        render={({ field: f }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>% (optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numberInputValue(f.value)}
                                onChange={(e) => handleNumberChange(e, f.onChange)}
                                placeholder="20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`paymentSchedule.${index}.amount`}
                        render={({ field: f }) => (
                          <FormItem className="sm:col-span-3">
                            <FormLabel>Amount (optional)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">GH₵</span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="pl-12"
                                  value={numberInputValue(f.value)}
                                  onChange={(e) => handleNumberChange(e, f.onChange)}
                                  placeholder="0.00"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="sm:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePaymentSchedule(index)}
                          aria-label="Remove milestone"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {organization.tax?.enabled && (
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax rate % (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        name={field.name}
                        ref={field.ref}
                        placeholder={`Default: ${parseFloat(organization.tax?.defaultRatePercent || 0).toFixed(2)}%`}
                        value={
                          field.value === '' || field.value === undefined || field.value === null
                            ? ''
                            : String(field.value)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            field.onChange('');
                            return;
                          }
                          if (/^\d*\.?\d*$/.test(raw)) {
                            field.onChange(raw);
                          }
                        }}
                        onBlur={() => {
                          field.onBlur();
                          const v = field.value;
                          if (v === '' || v === undefined || v === null) {
                            field.onChange('');
                            return;
                          }
                          const n = parseFloat(String(v));
                          field.onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : '');
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

              <div className="pt-2 pb-1">
                <Separator className="mb-3" />
                <div className="text-sm font-medium text-muted-foreground">Quote Items</div>
              </div>

              {fields.map((field, index) => (
                <Card key={field.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle className="text-base">Item {index + 1}</CardTitle>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isRetailQuote && (
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product (optional)</FormLabel>
                            <FormControl>
                              <QuoteProductPicker
                                value={field.value || ''}
                                disabled={quoteProductPickerDisabled}
                                activeTenantId={activeTenantId}
                                activeShopId={activeShopId}
                                onChange={field.onChange}
                                onProductSelect={(product) => {
                                  form.setValue(`items.${index}.description`, product.name || '');
                                  form.setValue(`items.${index}.unitPrice`, parseFloat(product.sellingPrice || 0));
                                  if (product.unit) {
                                    form.setValue(`items.${index}.metadata`, {
                                      ...(form.getValues(`items.${index}.metadata`) || {}),
                                      unit: product.unit,
                                    });
                                  }
                                }}
                              />
                            </FormControl>
                            {quoteProductPickerDisabled && shopContext?.isShopWorkspace && !activeShopId && (
                              <p className="text-xs text-muted-foreground">
                                Select a shop first to pick products on quotes.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {!isRetailQuote && (
                      <>
                        <FormField
                          control={form.control}
                          name={`items.${index}.category`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category / job type</FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  handleQuoteCategoryChange(value, index);
                                }}
                                value={field.value || undefined}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.from(jobItemCategoriesGrouped.entries()).map(([groupName, groupItems]) => (
                                    <div key={groupName}>
                                      <div className="px-2 py-1.5 text-sm font-semibold">{groupName}</div>
                                      {groupItems.map((cat) => (
                                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                      ))}
                                    </div>
                                  ))}
                                  {persistedCustomCategories.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-sm font-semibold">Custom</div>
                                      {persistedCustomCategories.map((cat) => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                          {cat.label || cat.value}
                                        </SelectItem>
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
                        {categoryOtherInputs[index] !== undefined && (
                          <div>
                            <Label>Enter category name</Label>
                            <div className="flex gap-2 mt-2">
                              <Input
                                className="flex-1"
                                placeholder="e.g., Custom Service"
                                value={categoryOtherInputs[index] || ''}
                                onChange={(e) => setCategoryOtherInputs((prev) => ({ ...prev, [index]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveQuoteCustomCategory(categoryOtherInputs[index], index);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                onClick={() => handleSaveQuoteCustomCategory(categoryOtherInputs[index], index)}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <FormField
                      control={form.control}
                      name={`items.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Item description" list="line-item-description-options" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-3 gap-2 md:gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                value={numberInputValue(field.value)}
                                onChange={(e) => handleIntegerChange(e, field.onChange)}
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
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">GHS</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, field.onChange)}
                                  className="pl-12"
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
                            <FormLabel>Discount (optional)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">GHS</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, field.onChange)}
                                  className="pl-12"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                type="button"
                variant="dashed"
                onClick={() => append({ productId: '', category: '', description: '', quantity: 1, unitPrice: 0, discountAmount: 0 })}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Notes for internal reference" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!editingQuote && (
                <>
                  <Separator />
                  <FormField
                    control={form.control}
                    name="autoSendToCustomer"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Auto send to customer on creation</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Send quote via Email, WhatsApp, or SMS when created. At least one must be configured in Settings.
                          </p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch('autoSendToCustomer') === true && (() => {
                    const ch = notificationChannels?.data ?? notificationChannels ?? {};
                    const hasChannel = ch.email || ch.whatsapp || ch.sms;
                    if (notificationChannels != null && !hasChannel) {
                      return (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription>
                            Configure at least one of Email, WhatsApp, or SMS in Settings to auto-send quotes.
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    const selectedCustomerId = form.watch('customerId');
                    const selectedCustomer = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;
                    const customerHasEmail = selectedCustomer?.email?.trim?.();
                    const customerHasPhone = selectedCustomer?.phone?.trim?.();
                    if (ch?.email && selectedCustomer && !customerHasEmail) {
                      return (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription>
                            Selected customer has no email address. Quote will not be sent via email. Add email in Customers to enable email delivery.
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    if ((ch?.whatsapp || ch?.sms) && selectedCustomer && !customerHasPhone) {
                      return (
                        <Alert variant="destructive" className="mt-2">
                          <AlertDescription>
                            Selected customer has no phone number. Quote will not be sent via WhatsApp or SMS. Add phone in Customers to enable delivery.
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    return null;
                  })()}
                  <FormField
                    control={form.control}
                    name="sendMessage"
                    render={({ field }) => (
                      <FormItem className={form.watch('autoSendToCustomer') !== true ? 'hidden' : ''}>
                        <FormLabel>Message to customer (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            placeholder={DEFAULT_QUOTE_SEND_MESSAGE}
                            className="resize-none"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Suggested text for SMS. A link to view the quote will be appended. Leave blank to use the default.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <datalist id="line-item-description-options">
                {lineItemDescriptionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label || option.value}
                  </option>
                ))}
              </datalist>

          </form>
        </Form>
      </MobileFormDialog>

      {/* Convert Quote to Job - collect start date, due date, and assignment (like Jobs) */}
      <MobileFormDialog
        open={convertJobModalOpen}
        onOpenChange={setConvertJobModalOpen}
        title="Convert Quote to Job"
        description="Set job dates, assignment, and payment before creating the job."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConvertJobModalOpen(false);
                setQuoteToConvert(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="convert-job-form"
              loading={converting}
            >
              Create Job
            </Button>
          </>
        }
      >
        <Form {...convertJobForm}>
          <form
            id="convert-job-form"
            onSubmit={convertJobForm.handleSubmit(handleConvertToJob)}
            className="space-y-4"
          >
            <FormField
              control={convertJobForm.control}
              name="assignedTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To (optional)</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === '__NONE__' ? null : value)
                    }
                    value={field.value || '__NONE__'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__NONE__">None</SelectItem>
                      {teamMembers.map((member) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={convertJobForm.control}
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
                control={convertJobForm.control}
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
            <JobCreatePaymentFields
              form={convertJobForm}
              grandTotal={parseFloat(quoteToConvert?.totalAmount) || 0}
            />
          </form>
        </Form>
      </MobileFormDialog>

      <Dialog open={printModalVisible} onOpenChange={setPrintModalVisible}>
        <DialogContent className="max-w-[100vw] sm:max-w-6xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-14 sm:pt-1 pb-3 pr-14 border-b flex-shrink-0 no-print text-left">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-left text-base sm:text-lg leading-snug">
                Quote Preview
              </DialogTitle>
              <DialogDescription className="text-left text-xs sm:text-sm">
                Review the quote before printing or downloading
              </DialogDescription>
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-initial h-10 touch-manipulation"
                onClick={() => handleDownloadQuote(quotePrintable)}
                disabled={!quotePrintable}
                aria-label="Download quote PDF"
              >
                <Download className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
                <span>Download</span>
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-initial h-10 touch-manipulation"
                onClick={handlePrintQuote}
                disabled={!quotePrintable}
                aria-label="Print quote"
              >
                <Printer className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
                <span>Print</span>
              </Button>
            </div>
            </div>
          </DialogHeader>
          {quotePrintable && quotePrintModel && (
            <div className="print-invoice-preview flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-muted/30 p-2 sm:p-4 print-content-wrapper">
              <div className="print-invoice-preview-inner w-full min-w-0 max-w-full sm:max-w-[900px] sm:mx-auto">
                {quotePrintModel.templateKind === 'project' ? (
                  <PrintableQuotation
                    model={quotePrintModel}
                    organization={quotePrintOrganization}
                  />
                ) : (
                  <PrintableInvoice
                    invoice={quotePrintModel.invoicePayload}
                    documentTitle={quotePrintModel.documentTitle}
                    documentSubtitle={quotePrintModel.documentSubtitle}
                    organization={quotePrintOrganization}
                    screenLayout={isMobile ? 'mobile' : 'auto'}
                    showProductCode={quotePrintModel.sections.items.showProductCode}
                    showBalanceDue={false}
                    showJobDetails={false}
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={customerAddModalOpen} onOpenChange={(open) => {
        if (!open) { setCustomerAddModalOpen(false); customerForm.reset({ name: '', company: '', email: '', phone: '' }); }
      }}>
        <DialogContent>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleAddCustomerSubmit)} className="flex flex-col min-h-0 flex-1">
              <DialogHeader>
                <DialogTitle>Create Customer</DialogTitle>
                <DialogDescription>Add a new customer without leaving the form.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-4">
                  <FormField
                    control={customerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. John Doe" />
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
                          <Input {...field} placeholder="Company name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={customerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (optional)</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} placeholder="email@example.com" />
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
                          <Input {...field} placeholder="Phone number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCustomerAddModalOpen(false); customerForm.reset({ name: '', company: '', email: '', phone: '' }); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addingCustomer}>
                  {addingCustomer ? 'Creating...' : 'Create Customer'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FilePreview
        open={attachmentPreviewVisible}
        onClose={() => {
          setAttachmentPreviewVisible(false);
          setAttachmentPreview(null);
        }}
        file={attachmentPreview ? {
          fileUrl: attachmentPreview.fileUrl || attachmentPreview.url,
          title: attachmentPreview.originalName || attachmentPreview.filename || attachmentPreview.name || 'Attachment',
          type: attachmentPreview.mimeType || attachmentPreview.type,
          metadata: attachmentPreview.metadata || {},
        } : null}
      />
    </div>
  );
};

export default Quotes;
