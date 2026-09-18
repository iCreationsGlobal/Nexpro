import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  RefreshCw,
  Loader2,
  Filter,
  CalendarPlus,
  CheckCircle2,
  Undo2,
  AlertTriangle,
  Trash2,
  PackageCheck,
  FileText,
  Ban,
  ExternalLink,
  Download,
  Printer,
  Truck,
  Banknote,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useDebounce } from '../hooks/useDebounce';
import { usePOSConfig } from '../hooks/usePOSConfig';
import { usePrintFormatOverride } from '../hooks/usePrintFormatOverride';
import { getContentWidthMm } from '../utils/printStyles';
import PrintFormatSwitcher from '../components/PrintFormatSwitcher';
import { useResponsive } from '../hooks/useResponsive';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import ActionColumn from '../components/ActionColumn';
import DashboardTable from '../components/DashboardTable';
import FileUpload from '../components/FileUpload';
import StatusChip from '../components/StatusChip';
import WelcomeSection from '../components/WelcomeSection';
import rentalService from '../services/rentalService';
import customerService from '../services/customerService';
import productService from '../services/productService';
import expenseService from '../services/expenseService';
import shopService from '../services/shopService';
import { useAuth } from '../context/AuthContext';
import { ACTIVE_SHOP_STORAGE_KEY } from '../context/ShopContext';
import { getActiveShopIdForScope } from '../utils/shopScope';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useWorkspaceProfile } from '../hooks/useWorkspaceProfile';
import { showSuccess, showError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Descriptions, DescriptionItem } from '../components/ui/descriptions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, RENTAL_STATUSES, RENTAL_STATUS_LABELS, RENTAL_OPEN_STATUSES, RENTAL_RETURNABLE_STATUSES, RENTAL_EXTENDABLE_STATUSES, RENTAL_CHECKOUTABLE_STATUSES, PRE_BOOKING_STATUSES, PRE_BOOKING_STATUS_LABELS } from '../constants';
import {
  formatCustomerRentalDeliveryAddress,
  formatRentalDeliveryStatus,
  getRentalDeliveryLegs,
  RENTAL_DELIVERY_LEG_LABELS,
} from '../utils/rentalDelivery';
import { formatAmount } from '../utils/formatNumber';
import { resolveImageUrl } from '../utils/fileUtils';
import { computeRentalFinancials, buildRentalTimelineEvents } from '../utils/rentalDetailUtils';
import { formatDepositStatus, getRentalDeposit } from '../utils/rentalDepositUtils';
import { getRentalDayCount } from '../utils/rentalDayBilling';
import {
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from '@/components/ui/timeline';
import RentalCalendarView from '../components/RentalCalendarView';
import RentalCheckoutDialog from '../components/rental/RentalCheckoutDialog';
import PrintableRentalAgreement from '../components/PrintableRentalAgreement';
import PrintableRentalReturnInspection from '../components/PrintableRentalReturnInspection';
import PrintableInvoice from '../components/PrintableInvoice';
import invoiceService from '../services/invoiceService';
import { generatePDF, openPrintDialog } from '../utils/pdfUtils';

const RENTAL_STATUS_OPTIONS = Object.entries(RENTAL_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PRE_BOOKING_STATUS_OPTIONS = Object.entries(PRE_BOOKING_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const preBookingSchema = z
  .object({
    customerId: z.string().min(1, 'Customer is required'),
    requestedStartDate: z.string().min(1, 'Start date is required'),
    requestedEndDate: z.string().min(1, 'End date is required'),
    notes: z.string().optional(),
  })
  .refine(
    (data) => !dayjs(data.requestedEndDate).isBefore(dayjs(data.requestedStartDate), 'day'),
    { message: 'End date cannot be before the start date', path: ['requestedEndDate'] }
  );

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
  { value: 'other', label: 'Other' },
];

const DAMAGE_TYPE_OPTIONS = [
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'broken', label: 'Broken' },
  { value: 'lost', label: 'Lost' },
  { value: 'stained', label: 'Stained' },
  { value: 'other', label: 'Other' },
];

const DAMAGE_SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

const formatDamageType = (value) =>
  DAMAGE_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;

const formatDamageSeverity = (value) =>
  DAMAGE_SEVERITY_OPTIONS.find((option) => option.value === value)?.label || value;

/** Statuses where the rental is not yet closed out. */
const OPEN_STATUSES = RENTAL_OPEN_STATUSES;

const extendSchema = z.object({
  newEndDate: z.string().min(1, 'New end date is required'),
  reason: z.string().optional(),
});

const checkoutSchema = z.object({
  handoverNotes: z.string().optional(),
  scheduleDelivery: z.boolean().optional().default(false),
});

const returnSchema = z.object({
  actualReturnDate: z.string().min(1, 'Return date is required'),
  inspectionNotes: z.string().optional(),
  scheduleReturnPickup: z.boolean().optional().default(false),
});

/** True when a confirmed rental can be checked out (start date reached, or manager+ early override). */
const isRentalCheckoutEligible = (rental, isManager) => {
  if (!rental || !RENTAL_CHECKOUTABLE_STATUSES.includes(rental.status)) return false;
  const startReached = !dayjs(rental.startDate).isAfter(dayjs(), 'day');
  return startReached || isManager;
};

const damageSchema = z.object({
  rentalItemId: z.string().min(1, 'Item is required'),
  damageType: z.enum(['scratch', 'dent', 'broken', 'lost', 'stained', 'other'], {
    required_error: 'Damage type is required',
  }),
  severity: z.enum(['minor', 'moderate', 'severe']).default('minor'),
  estimatedRepairCost: z.coerce.number().min(0, 'Cost cannot be negative').default(0),
  description: z.string().optional(),
});

const waiveSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

const refundSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Refund amount must be greater than zero'),
  reason: z.string().trim().min(1, 'A reason is required'),
  paymentMethod: z.string().default('cash'),
  referenceNumber: z.string().optional(),
});

const collectDepositSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than zero'),
  paymentMethod: z.string().default('cash'),
  referenceNumber: z.string().optional(),
});

const hirePaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Payment amount must be greater than zero'),
  paymentMethod: z.string().default('cash'),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

/** Billable day count — defaults to end-of-day unless a rental stored its mode. */
const getDayCount = (startDate, endDate, dayBillingMode) => (
  getRentalDayCount(startDate, endDate, dayBillingMode)
);

const productTracksSerialUnits = (product) => (
  product?.metadata?.tracksSerialUnits === true
  || product?.category?.metadata?.tracksSerialUnits === true
  || product?.category?.metadata?.requiresUnitAssignment === true
);

const createEmptyPreBookingLine = () => ({ productId: '', quantity: 1, requestedRatePerDay: 0 });

/** Estimated proforma total for a pre-booking row. */
const getPreBookingEstimatedTotal = (preBooking) => {
  const days = getDayCount(preBooking?.requestedStartDate, preBooking?.requestedEndDate);
  return (preBooking?.items || []).reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.requestedRatePerDay || 0) * days,
    0
  );
};

/** True when rental period overlaps an optional filter date range (inclusive). */
const rentalMatchesDateRange = (rental, startDate, endDate) => {
  if (!rental?.startDate && !rental?.endDate) return true;
  const rentalStart = rental.startDate ? dayjs(rental.startDate).startOf('day') : null;
  const rentalEnd = rental.endDate ? dayjs(rental.endDate).startOf('day') : rentalStart;
  const filterStart = startDate ? dayjs(startDate).startOf('day') : null;
  const filterEnd = endDate ? dayjs(endDate).startOf('day') : null;

  if (filterStart && rentalEnd && rentalEnd.isBefore(filterStart, 'day')) return false;
  if (filterEnd && rentalStart && rentalStart.isAfter(filterEnd, 'day')) return false;
  return true;
};

const Rentals = () => {
  const { activeTenantId, activeTenant, isManager } = useAuth();
  const { isRental: isRentalTenant, defaultBranchId: workspaceDefaultBranchId } = useWorkspaceProfile();
  const { activeShopId, scopeReady } = useWorkspaceScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab');
  const activeTab =
    tabParam === 'pre-bookings'
      ? 'pre-bookings'
      : tabParam === 'calendar'
        ? 'calendar'
        : 'rentals';
  const [defaultBranchId, setDefaultBranchId] = useState(null);
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();

  const [rentals, setRentals] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingRental, setViewingRental] = useState(null);
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [rentalPrefillProductId, setRentalPrefillProductId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendPreview, setExtendPreview] = useState(null);
  const [extendPreviewLoading, setExtendPreviewLoading] = useState(false);
  const [extendPreviewError, setExtendPreviewError] = useState(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnPreview, setReturnPreview] = useState(null);
  const [returnPreviewLoading, setReturnPreviewLoading] = useState(false);
  const [returnPreviewError, setReturnPreviewError] = useState(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [damagePhotoUrls, setDamagePhotoUrls] = useState([]);
  const [damagePhotoUploading, setDamagePhotoUploading] = useState(false);
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [waiveCharge, setWaiveCharge] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundMaxAmount, setRefundMaxAmount] = useState(0);
  const [collectDepositModalOpen, setCollectDepositModalOpen] = useState(false);
  const [collectMaxAmount, setCollectMaxAmount] = useState(0);
  const [hirePaymentModalOpen, setHirePaymentModalOpen] = useState(false);
  const [hirePaymentMaxAmount, setHirePaymentMaxAmount] = useState(0);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [actionRental, setActionRental] = useState(null);
  const [filters, setFilters] = useState(() => ({
    status: 'all',
    customerId: searchParams.get('customerId') || 'all',
    startDate: null,
    endDate: null,
  }));
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [checkoutUnitAssignments, setCheckoutUnitAssignments] = useState({});
  const [checkoutAvailableUnits, setCheckoutAvailableUnits] = useState({});

  const [preBookings, setPreBookings] = useState([]);
  const [preBookingsLoading, setPreBookingsLoading] = useState(false);
  const [preBookingsRefreshing, setPreBookingsRefreshing] = useState(false);
  const [preBookingModalOpen, setPreBookingModalOpen] = useState(false);
  const [preBookingLineItems, setPreBookingLineItems] = useState([createEmptyPreBookingLine()]);
  const [preBookingLineItemsError, setPreBookingLineItemsError] = useState('');
  const [preBookingAvailabilityLoading, setPreBookingAvailabilityLoading] = useState(false);
  const [preBookingAvailabilityResults, setPreBookingAvailabilityResults] = useState([]);
  const [viewingPreBooking, setViewingPreBooking] = useState(null);
  const [preBookingDrawerVisible, setPreBookingDrawerVisible] = useState(false);
  const [confirmPreBookingOpen, setConfirmPreBookingOpen] = useState(false);
  const [cancelPreBookingOpen, setCancelPreBookingOpen] = useState(false);
  const [actionPreBooking, setActionPreBooking] = useState(null);
  const [preBookingFilters, setPreBookingFilters] = useState({
    status: 'all',
    customerId: 'all',
    startDate: null,
    endDate: null,
  });
  const [preBookingFilterDrawerOpen, setPreBookingFilterDrawerOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pdfDocumentType, setPdfDocumentType] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [invoiceForPrint, setInvoiceForPrint] = useState(null);
  const { posConfig } = usePOSConfig();
  const {
    printConfig: rentalInvoicePrintConfig,
    format: rentalInvoicePrintFormat,
    setFormat: setRentalInvoicePrintFormat,
  } = usePrintFormatOverride(posConfig?.print, invoiceForPrint?.id || pdfDocument?.id);
  const printPreviewRef = useRef(null);

  useEffect(() => {
    setPageSearchConfig({
      scope:
        activeTab === 'pre-bookings'
          ? 'pre-bookings'
          : activeTab === 'calendar'
            ? 'calendar'
            : 'rentals',
      placeholder:
        activeTab === 'pre-bookings'
          ? SEARCH_PLACEHOLDERS.PRE_BOOKINGS
          : activeTab === 'calendar'
            ? SEARCH_PLACEHOLDERS.RENTALS
            : SEARCH_PLACEHOLDERS.RENTALS,
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig, activeTab]);

  useEffect(() => {
    setCustomers([]);
    setProducts([]);
  }, [activeTenantId]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue, filters.status, filters.customerId, filters.startDate, filters.endDate]);

  useEffect(() => {
    if (activeTab !== 'pre-bookings') return;
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [
    activeTab,
    searchValue,
    preBookingFilters.status,
    preBookingFilters.customerId,
    preBookingFilters.startDate,
    preBookingFilters.endDate,
  ]);

  const effectiveBranchId = useMemo(
    () => activeShopId || defaultBranchId || getActiveShopIdForScope(),
    [activeShopId, defaultBranchId]
  );

  /** Resolve default branch for rental workspaces without an active shop switcher. */
  useEffect(() => {
    if (activeShopId) {
      setDefaultBranchId(null);
      return undefined;
    }
    if (!activeTenantId || !isRentalTenant) return undefined;

    if (workspaceDefaultBranchId) {
      setDefaultBranchId(workspaceDefaultBranchId);
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_SHOP_STORAGE_KEY, workspaceDefaultBranchId);
      }
      return undefined;
    }

    let cancelled = false;
    const resolveBranch = async () => {
      try {
        const response = await shopService.getAll({ limit: 20 });
        const shops = Array.isArray(response?.data) ? response.data : [];
        const branch = shops.find((shop) => shop.isDefault) || shops[0];
        if (cancelled || !branch?.id) return;
        setDefaultBranchId(branch.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(ACTIVE_SHOP_STORAGE_KEY, branch.id);
        }
      } catch (error) {
        console.error('Failed to resolve rental branch', error);
      }
    };

    resolveBranch();
    return () => {
      cancelled = true;
    };
  }, [activeShopId, activeTenantId, isRentalTenant, workspaceDefaultBranchId]);

  const extendForm = useForm({
    resolver: zodResolver(extendSchema),
    defaultValues: { newEndDate: '', reason: '' },
  });

  const returnForm = useForm({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      actualReturnDate: dayjs().format('YYYY-MM-DD'),
      inspectionNotes: '',
      scheduleReturnPickup: false,
    },
  });
  const watchedReturnDate = returnForm.watch('actualReturnDate');
  const debouncedReturnDate = useDebounce(watchedReturnDate, DEBOUNCE_DELAYS.SEARCH);
  const watchedExtendDate = extendForm.watch('newEndDate');
  const debouncedExtendDate = useDebounce(watchedExtendDate, DEBOUNCE_DELAYS.SEARCH);

  const checkoutForm = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { handoverNotes: '', scheduleDelivery: false },
  });

  const damageForm = useForm({
    resolver: zodResolver(damageSchema),
    defaultValues: {
      rentalItemId: '',
      damageType: 'other',
      severity: 'minor',
      estimatedRepairCost: 0,
      description: '',
    },
  });

  const waiveForm = useForm({
    resolver: zodResolver(waiveSchema),
    defaultValues: { reason: '' },
  });

  const refundForm = useForm({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      amount: 0,
      reason: '',
      paymentMethod: 'cash',
      referenceNumber: '',
    },
  });

  const collectDepositForm = useForm({
    resolver: zodResolver(collectDepositSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: 'cash',
      referenceNumber: '',
    },
  });

  const hirePaymentForm = useForm({
    resolver: zodResolver(hirePaymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: 'cash',
      referenceNumber: '',
      notes: '',
    },
  });

  const preBookingForm = useForm({
    resolver: zodResolver(preBookingSchema),
    defaultValues: {
      customerId: '',
      requestedStartDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
      requestedEndDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
      notes: '',
    },
  });

  const fetchRentals = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params = {};
        if (filters.status !== 'all') params.status = filters.status;
        if (filters.customerId !== 'all') params.customerId = filters.customerId;

        const response = await rentalService.getRentals(params);
        const list = Array.isArray(response?.data) ? response.data : [];

        const term = debouncedSearch.trim().toLowerCase();
        const filtered = list.filter((rental) => {
          if (!rentalMatchesDateRange(rental, filters.startDate, filters.endDate)) {
            return false;
          }

          if (!term) return true;

          const customer = rental?.customer?.name || '';
          const productNames = (rental?.items || [])
            .map((item) => item?.product?.name || '')
            .join(' ');
          return (
            customer.toLowerCase().includes(term) ||
            productNames.toLowerCase().includes(term) ||
            String(rental?.status || '').toLowerCase().includes(term)
          );
        });

        setRentals(filtered);
        setPagination((prev) => ({ ...prev, total: filtered.length }));
      } catch (error) {
        console.error('Failed to load rentals', error);
        showError(error, 'Failed to load rentals');
        setRentals([]);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [
      filters.status,
      filters.customerId,
      filters.startDate,
      filters.endDate,
      debouncedSearch,
    ]
  );

  const fetchPreBookings = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setPreBookingsRefreshing(true);
      else setPreBookingsLoading(true);

      try {
        const params = {};
        if (preBookingFilters.status !== 'all') params.status = preBookingFilters.status;
        if (preBookingFilters.customerId !== 'all') params.customerId = preBookingFilters.customerId;

        const response = await rentalService.getPreBookings(params);
        const list = Array.isArray(response?.data) ? response.data : [];

        const term = debouncedSearch.trim().toLowerCase();
        const filtered = list.filter((preBooking) => {
          if (
            preBookingFilters.startDate &&
            preBooking.requestedEndDate &&
            dayjs(preBooking.requestedEndDate).isBefore(dayjs(preBookingFilters.startDate), 'day')
          ) {
            return false;
          }
          if (
            preBookingFilters.endDate &&
            preBooking.requestedStartDate &&
            dayjs(preBooking.requestedStartDate).isAfter(dayjs(preBookingFilters.endDate), 'day')
          ) {
            return false;
          }

          if (!term) return true;

          const customer = preBooking?.customer?.name || '';
          const productNames = (preBooking?.items || [])
            .map((item) => item?.product?.name || '')
            .join(' ');
          return (
            customer.toLowerCase().includes(term) ||
            productNames.toLowerCase().includes(term) ||
            String(preBooking?.status || '').toLowerCase().includes(term)
          );
        });

        setPreBookings(filtered);
        setPagination((prev) => ({ ...prev, total: filtered.length }));
      } catch (error) {
        console.error('Failed to load pre-bookings', error);
        showError(error, 'Failed to load pre-bookings');
        setPreBookings([]);
      } finally {
        setPreBookingsRefreshing(false);
        setPreBookingsLoading(false);
      }
    },
    [
      preBookingFilters.status,
      preBookingFilters.customerId,
      preBookingFilters.startDate,
      preBookingFilters.endDate,
      debouncedSearch,
    ]
  );

  useEffect(() => {
    if (!scopeReady) return;
    fetchRentals();
  }, [fetchRentals, scopeReady, effectiveBranchId]);

  useEffect(() => {
    if (!scopeReady || activeTab !== 'pre-bookings') return;
    fetchPreBookings();
  }, [fetchPreBookings, scopeReady, effectiveBranchId, activeTab]);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await customerService.getCustomers({ limit: 100 });
      const list = response?.data?.customers || response?.data || [];
      const arr = Array.isArray(list) ? list : [];
      setCustomers(arr);
      return arr;
    } catch (error) {
      console.error('Failed to load customers', error);
      return [];
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const response = await productService.getProducts({ limit: 100, isRentable: true });
      const list = response?.data?.products || response?.data || [];
      const arr = Array.isArray(list) ? list : [];
      setProducts(arr);
      return arr;
    } catch (error) {
      console.error('Failed to load products', error);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!scopeReady) return;
    loadCustomers();
  }, [scopeReady, loadCustomers]);

  useEffect(() => {
    if (!scopeReady || activeTab !== 'pre-bookings' || products.length) return;
    loadProducts();
  }, [scopeReady, activeTab, products.length, loadProducts]);

  const handleViewRental = useCallback((record) => {
    setViewingRental(record);
    setDrawerVisible(true);
    rentalService
      .getById(record.id)
      .then((res) => {
        const data = res?.data || res;
        setViewingRental((prev) => (prev?.id === record.id ? data : prev));
      })
      .catch((err) => {
        console.error('Failed to fetch rental', err);
        showError(err, 'Failed to load rental details');
      });
  }, []);

  useEffect(() => {
    const rentalId = searchParams.get('rentalId');
    if (!rentalId || !scopeReady) return;

    rentalService
      .getById(rentalId)
      .then((res) => {
        const data = res?.data || res;
        if (data) handleViewRental(data);
      })
      .catch((err) => {
        console.error('Failed to open rental from link', err);
        showError(err, 'Failed to load rental');
      });

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('rentalId');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, scopeReady, handleViewRental, setSearchParams]);

  const handleViewInvoice = useCallback((rental) => {
    const invoiceId = rental?.metadata?.invoiceId;
    if (!invoiceId) return;
    setDrawerVisible(false);
    setViewingRental(null);
    window.setTimeout(() => {
      navigate('/invoices', { state: { openInvoiceId: invoiceId } });
    }, 0);
  }, [navigate]);

  const closePdfModal = useCallback(() => {
    setPdfModalOpen(false);
    setPdfDocument(null);
    setPdfDocumentType(null);
    setInvoiceForPrint(null);
  }, []);

  const openRentalDocument = useCallback(async (rental, type) => {
    if (!rental?.id) return;
    setPdfLoading(true);
    setPdfDocumentType(type);
    setInvoiceForPrint(null);
    setPdfDocument(null);

    try {
      const response = type === 'agreement'
        ? await rentalService.getAgreementDocument(rental.id)
        : await rentalService.getReturnInspectionDocument(rental.id);
      const document = response?.data || response;
      if (!document?.rental) {
        showError(null, 'Failed to load document');
        return;
      }
      setPdfDocument(document);
      setPdfModalOpen(true);
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to load document');
    } finally {
      setPdfLoading(false);
    }
  }, []);

  const openInvoicePdf = useCallback(async (rental) => {
    const invoiceId = rental?.metadata?.invoiceId;
    if (!invoiceId) return;

    setPdfLoading(true);
    setPdfDocumentType('invoice');
    setPdfDocument(null);
    setInvoiceForPrint(null);

    try {
      const response = await invoiceService.getById(invoiceId);
      const invoice = response?.data || response;
      if (!invoice?.id) {
        showError(null, 'Failed to load invoice');
        return;
      }
      setInvoiceForPrint({
        ...invoice,
        sourceType: invoice.sourceType || 'rental',
        metadata: {
          ...(invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {}),
          generatedFrom: 'rental',
          rentalId: rental.id,
          startDate: invoice.metadata?.startDate || rental.startDate,
          endDate: invoice.metadata?.endDate || rental.endDate,
          rentalDurationDays: invoice.metadata?.rentalDurationDays || rental.rentalDurationDays,
        },
      });
      setPdfModalOpen(true);
    } catch (error) {
      showError(error, 'Failed to load invoice for PDF');
    } finally {
      setPdfLoading(false);
    }
  }, []);

  const handleDownloadRentalPdf = useCallback(async () => {
    const selector = pdfDocumentType === 'agreement'
      ? '.printable-rental-agreement'
      : pdfDocumentType === 'return_inspection'
        ? '.printable-rental-return'
        : '.printable-invoice';

    const element = printPreviewRef.current?.querySelector(selector);
    if (!element) {
      showError(null, 'Document preview not ready');
      return;
    }

    const filename = pdfDocumentType === 'agreement'
      ? `Rental_Agreement_${pdfDocument?.documentNumber || 'document'}.pdf`
      : pdfDocumentType === 'return_inspection'
        ? `Return_Inspection_${pdfDocument?.documentNumber || 'document'}.pdf`
        : `Invoice_${invoiceForPrint?.invoiceNumber || 'document'}.pdf`;

    // Only the invoice document respects the A4/thermal switcher — agreements and return
    // inspections are always full-page legal-style documents.
    const isThermal = pdfDocumentType === 'invoice'
      && (rentalInvoicePrintConfig.format === 'thermal_58' || rentalInvoicePrintConfig.format === 'thermal_80');

    try {
      await generatePDF(element, {
        margin: isThermal ? [0, 0, 0, 0] : (isMobile ? [4, 4, 4, 4] : [0, 0, 0, 0]),
        filename,
        format: 'a4',
        orientation: 'portrait',
        contentWidthMm: isThermal ? getContentWidthMm(rentalInvoicePrintConfig) : null,
        dynamicHeight: isThermal,
      });
      showSuccess('PDF downloaded successfully');
    } catch (error) {
      showError(error, 'Failed to generate PDF');
    }
  }, [pdfDocumentType, pdfDocument, invoiceForPrint, isMobile, rentalInvoicePrintConfig]);

  const handlePrintRentalPdf = useCallback(() => {
    const wrapper = printPreviewRef.current;
    if (!wrapper) return;

    const title = pdfDocumentType === 'agreement'
      ? `Rental-Agreement-${pdfDocument?.documentNumber || ''}`
      : pdfDocumentType === 'return_inspection'
        ? `Return-Inspection-${pdfDocument?.documentNumber || ''}`
        : `Invoice-${invoiceForPrint?.invoiceNumber || ''}`;

    openPrintDialog(wrapper, title);
  }, [pdfDocumentType, pdfDocument, invoiceForPrint]);

  const canDownloadAgreement = useCallback((rental) => {
    const status = rental?.status || RENTAL_STATUSES.PENDING;
    return status !== RENTAL_STATUSES.CANCELLED;
  }, []);

  const canDownloadReturnInspection = useCallback((rental) => {
    const status = rental?.status;
    const hasReturn = Boolean(rental?.metadata?.return?.returnedAt || rental?.actualReturnDate);
    return hasReturn || status === RENTAL_STATUSES.RETURNED || status === RENTAL_STATUSES.COMPLETED;
  }, []);

  const openRentalModal = useCallback(
    ({ productId: prefillProductId } = {}) => {
      setRentalPrefillProductId(prefillProductId || null);
      setRentalModalOpen(true);
      void loadCustomers();
      if (!products.length) void loadProducts();
    },
    [products.length, loadCustomers, loadProducts]
  );

  const openPreBookingModal = useCallback(
    async ({ productId: prefillProductId } = {}) => {
      await loadCustomers();
      const productList = products.length ? products : await loadProducts();

      preBookingForm.reset({
        customerId: '',
        requestedStartDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        requestedEndDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
        notes: '',
      });

      if (prefillProductId) {
        const product = productList.find((p) => p.id === prefillProductId);
        const suggestedRate = Number(product?.rentalRatePerDay ?? product?.sellingPrice ?? 0);
        setPreBookingLineItems([
          {
            productId: prefillProductId,
            quantity: 1,
            requestedRatePerDay: suggestedRate,
          },
        ]);
      } else {
        setPreBookingLineItems([createEmptyPreBookingLine()]);
      }

      setPreBookingLineItemsError('');
      setPreBookingAvailabilityResults([]);
      setPreBookingModalOpen(true);
    },
    [products, loadCustomers, loadProducts, preBookingForm]
  );

  const handleTabChange = useCallback(
    (value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 'pre-bookings') {
            next.set('tab', 'pre-bookings');
          } else if (value === 'calendar') {
            next.set('tab', 'calendar');
          } else {
            next.delete('tab');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const shouldOpen = searchParams.get('add') === '1';
    const prefillProductId = searchParams.get('productId');
    if ((!shouldOpen && !prefillProductId) || !scopeReady) return;

    void openRentalModal({ productId: prefillProductId || undefined });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('add');
        next.delete('productId');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, scopeReady, openRentalModal, setSearchParams]);

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (!customerId) return;

    setFilters((prev) => (
      prev.customerId === customerId ? prev : { ...prev, customerId }
    ));
    setPagination((prev) => ({ ...prev, current: 1 }));
    void loadCustomers();
  }, [searchParams, loadCustomers]);

  const updatePreBookingLineItem = useCallback(
    (index, patch) => {
      setPreBookingLineItems((prev) =>
        prev.map((line, i) => {
          if (i !== index) return line;
          const next = { ...line, ...patch };
          if (patch.productId) {
            const product = products.find((p) => p.id === patch.productId);
            next.requestedRatePerDay = Number(
              product?.rentalRatePerDay ?? product?.sellingPrice ?? 0
            );
          }
          return next;
        })
      );
      setPreBookingLineItemsError('');
    },
    [products]
  );

  const addPreBookingLineItem = useCallback(() => {
    setPreBookingLineItems((prev) => [...prev, createEmptyPreBookingLine()]);
  }, []);

  const removePreBookingLineItem = useCallback((index) => {
    setPreBookingLineItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index)
    );
  }, []);

  const watchedPreBookingStart = preBookingForm.watch('requestedStartDate');
  const watchedPreBookingEnd = preBookingForm.watch('requestedEndDate');

  const validPreBookingLineItems = useMemo(
    () => preBookingLineItems.filter((line) => line.productId && Number(line.quantity) > 0),
    [preBookingLineItems]
  );

  const preBookingAvailabilityRequestKey = useMemo(
    () =>
      JSON.stringify({
        startDate: watchedPreBookingStart,
        endDate: watchedPreBookingEnd,
        branchId: effectiveBranchId,
        items: validPreBookingLineItems.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity || 0),
        })),
      }),
    [watchedPreBookingStart, watchedPreBookingEnd, effectiveBranchId, validPreBookingLineItems]
  );

  const debouncedPreBookingAvailabilityKey = useDebounce(
    preBookingAvailabilityRequestKey,
    DEBOUNCE_DELAYS.SEARCH
  );

  useEffect(() => {
    if (!preBookingModalOpen) return undefined;

    let cancelled = false;
    const parsed = JSON.parse(debouncedPreBookingAvailabilityKey);

    if (
      !parsed.branchId ||
      !parsed.startDate ||
      !parsed.endDate ||
      !parsed.items?.length ||
      dayjs(parsed.endDate).isBefore(dayjs(parsed.startDate), 'day')
    ) {
      setPreBookingAvailabilityResults([]);
      setPreBookingAvailabilityLoading(false);
      return undefined;
    }

    const checkAvailability = async () => {
      setPreBookingAvailabilityLoading(true);
      try {
        const response = await rentalService.checkAvailability({
          branchId: parsed.branchId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          items: parsed.items,
        });
        if (cancelled) return;
        const rows = response?.data?.items || [];
        setPreBookingAvailabilityResults(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to check pre-booking availability', error);
        setPreBookingAvailabilityResults([]);
      } finally {
        if (!cancelled) setPreBookingAvailabilityLoading(false);
      }
    };

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [preBookingModalOpen, debouncedPreBookingAvailabilityKey]);

  const preBookingAvailabilityByProductId = useMemo(() => {
    const map = new Map();
    preBookingAvailabilityResults.forEach((row) => {
      if (row?.productId) map.set(row.productId, row);
    });
    return map;
  }, [preBookingAvailabilityResults]);

  const aggregatedPreBookingRequestedQty = useMemo(() => {
    const totals = new Map();
    validPreBookingLineItems.forEach((line) => {
      const qty = Number(line.quantity || 0);
      totals.set(line.productId, (totals.get(line.productId) || 0) + qty);
    });
    return totals;
  }, [validPreBookingLineItems]);

  const getPreBookingLineAvailabilityMessage = useCallback(
    (line) => {
      if (!line.productId || Number(line.quantity) <= 0) return '';
      const result = preBookingAvailabilityByProductId.get(line.productId);
      if (!result) return preBookingAvailabilityLoading ? 'Checking availability…' : '';

      const requestedTotal = aggregatedPreBookingRequestedQty.get(line.productId) || 0;
      if (!result.isRentable) return `${result.productName || 'Product'} is not rentable`;
      if (result.notFound) return `${result.productName || 'Product'} was not found`;
      if (result.availableQty < requestedTotal) {
        return `Only ${result.availableQty} available (${requestedTotal} requested across lines)`;
      }
      return '';
    },
    [preBookingAvailabilityByProductId, aggregatedPreBookingRequestedQty, preBookingAvailabilityLoading]
  );

  const hasPreBookingAvailabilityIssues = useMemo(() => {
    if (!validPreBookingLineItems.length || preBookingAvailabilityLoading) return false;
    if (!preBookingAvailabilityResults.length) return false;
    return preBookingAvailabilityResults.some((row) => !row.canFulfill);
  }, [validPreBookingLineItems.length, preBookingAvailabilityLoading, preBookingAvailabilityResults]);

  const preBookingAvailabilityReady = useMemo(() => {
    if (!validPreBookingLineItems.length || preBookingAvailabilityLoading) return false;
    const productIds = new Set(validPreBookingLineItems.map((line) => line.productId));
    if (!productIds.size) return false;
    if (preBookingAvailabilityResults.length !== productIds.size) return false;
    return preBookingAvailabilityResults.every((row) => row.productId && productIds.has(row.productId));
  }, [validPreBookingLineItems, preBookingAvailabilityLoading, preBookingAvailabilityResults]);

  const canSubmitPreBooking =
    !!effectiveBranchId && preBookingAvailabilityReady && !hasPreBookingAvailabilityIssues;

  const preBookingDays = useMemo(
    () => getDayCount(watchedPreBookingStart, watchedPreBookingEnd),
    [watchedPreBookingStart, watchedPreBookingEnd]
  );

  const preBookingEstimatedTotal = useMemo(
    () =>
      preBookingLineItems.reduce(
        (sum, line) =>
          sum +
          Number(line.quantity || 0) * Number(line.requestedRatePerDay || 0) * preBookingDays,
        0
      ),
    [preBookingLineItems, preBookingDays]
  );

  const actionCustomerDeliveryAddress = useMemo(
    () => formatCustomerRentalDeliveryAddress(actionRental?.customer),
    [actionRental?.customer]
  );

  const actionRentalDepositRemaining = useMemo(
    () => (actionRental ? computeRentalFinancials(actionRental).depositRemaining : 0),
    [actionRental]
  );

  const onPreBookingSubmit = useCallback(
    async (values) => {
      const items = preBookingLineItems.filter(
        (line) => line.productId && Number(line.quantity) > 0
      );
      if (!items.length) {
        setPreBookingLineItemsError('Add at least one product with a quantity.');
        return;
      }

      if (!effectiveBranchId) {
        showError(null, 'No branch is configured. Add a location in Settings before creating a pre-booking.');
        return;
      }

      if (hasPreBookingAvailabilityIssues) {
        setPreBookingLineItemsError('One or more items are unavailable for the selected dates.');
        return;
      }

      setSubmitting(true);
      try {
        await rentalService.createPreBooking({
          customerId: values.customerId,
          branchId: effectiveBranchId,
          requestedStartDate: values.requestedStartDate,
          requestedEndDate: values.requestedEndDate,
          notes: values.notes || null,
          items: items.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            requestedRatePerDay: Number(line.requestedRatePerDay || 0),
          })),
        });
        showSuccess('Pre-booking created successfully');
        setPreBookingModalOpen(false);
        fetchPreBookings();
      } catch (error) {
        console.error('Failed to create pre-booking', error);
        showError(error, 'Failed to create pre-booking');
      } finally {
        setSubmitting(false);
      }
    },
    [preBookingLineItems, effectiveBranchId, fetchPreBookings, hasPreBookingAvailabilityIssues]
  );

  const handleViewPreBooking = useCallback((record) => {
    setViewingPreBooking(record);
    setPreBookingDrawerVisible(true);
  }, []);

  const openConfirmPreBookingModal = useCallback((preBooking) => {
    setActionPreBooking(preBooking);
    setConfirmPreBookingOpen(true);
  }, []);

  const openCancelPreBookingModal = useCallback((preBooking) => {
    setActionPreBooking(preBooking);
    setCancelPreBookingOpen(true);
  }, []);

  const handleConfirmPreBooking = useCallback(async () => {
    if (!actionPreBooking) return;
    setSubmitting(true);
    try {
      const res = await rentalService.confirmPreBooking(actionPreBooking.id);
      const rental = res?.data?.rental;
      showSuccess('Pre-booking converted to rental');
      setConfirmPreBookingOpen(false);
      setPreBookingDrawerVisible(false);
      setViewingPreBooking(null);
      fetchPreBookings();
      fetchRentals();
      if (rental?.id) {
        handleTabChange('rentals');
        handleViewRental(rental);
      }
    } catch (error) {
      console.error('Failed to confirm pre-booking', error);
      showError(error, 'Failed to confirm pre-booking');
    } finally {
      setSubmitting(false);
    }
  }, [actionPreBooking, fetchPreBookings, fetchRentals, handleTabChange, handleViewRental]);

  const handleCancelPreBooking = useCallback(async () => {
    if (!actionPreBooking) return;
    setSubmitting(true);
    try {
      await rentalService.cancelPreBooking(actionPreBooking.id);
      showSuccess('Pre-booking cancelled');
      setCancelPreBookingOpen(false);
      if (viewingPreBooking?.id === actionPreBooking.id) {
        setPreBookingDrawerVisible(false);
        setViewingPreBooking(null);
      }
      fetchPreBookings();
    } catch (error) {
      console.error('Failed to cancel pre-booking', error);
      showError(error, 'Failed to cancel pre-booking');
    } finally {
      setSubmitting(false);
    }
  }, [actionPreBooking, fetchPreBookings, viewingPreBooking?.id]);

  const openExtendModal = useCallback(
    (rental) => {
      setActionRental(rental);
      setExtendPreview(null);
      setExtendPreviewError(null);
      extendForm.reset({
        newEndDate: dayjs(rental.endDate).add(1, 'day').format('YYYY-MM-DD'),
        reason: '',
      });
      setExtendModalOpen(true);
    },
    [extendForm]
  );

  useEffect(() => {
    if (!extendModalOpen || !actionRental?.id || !debouncedExtendDate) {
      return undefined;
    }

    let cancelled = false;
    setExtendPreviewLoading(true);
    setExtendPreviewError(null);

    rentalService
      .previewExtend(actionRental.id, { newEndDate: debouncedExtendDate })
      .then((res) => {
        if (cancelled) return;
        setExtendPreview(res?.data ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        setExtendPreview(null);
        setExtendPreviewError(
          error?.response?.data?.message || 'Could not preview extension cost'
        );
      })
      .finally(() => {
        if (!cancelled) setExtendPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [extendModalOpen, actionRental?.id, debouncedExtendDate]);

  const canConfirmExtend = useMemo(() => {
    if (!extendPreview || extendPreviewLoading || extendPreviewError) return false;
    if (extendPreview.extensionDays <= 0) return false;
    return extendPreview.availability?.ok !== false;
  }, [extendPreview, extendPreviewLoading, extendPreviewError]);

  const onExtendSubmit = useCallback(
    async (values) => {
      if (!actionRental || !canConfirmExtend) return;
      setSubmitting(true);
      try {
        const res = await rentalService.extendRental(actionRental.id, {
          newEndDate: values.newEndDate,
          reason: values.reason || null,
        });
        const additionalCharge = res?.data?.extension?.additionalCharge;
        showSuccess(
          additionalCharge && Number(additionalCharge) > 0
            ? `Rental extended. Additional charge: ${formatAmount(additionalCharge)}`
            : 'Rental extended successfully'
        );
        setExtendModalOpen(false);
        if (viewingRental?.id === actionRental.id && res?.data?.rental) {
          setViewingRental(res.data.rental);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to extend rental', error);
        showError(error, 'Failed to extend rental');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, canConfirmExtend, fetchRentals, viewingRental?.id]
  );

  const openReturnModal = useCallback(
    async (rental) => {
      setReturnPreview(null);
      setReturnPreviewError(null);
      returnForm.reset({
        actualReturnDate: dayjs().format('YYYY-MM-DD'),
        inspectionNotes: '',
        scheduleReturnPickup: false,
      });
      setReturnModalOpen(true);

      try {
        const response = await rentalService.getById(rental.id);
        const fullRental = response?.data?.data ?? response?.data ?? rental;
        setActionRental(fullRental);
      } catch (error) {
        console.error('Failed to load rental for return', error);
        setActionRental(rental);
      }
    },
    [returnForm]
  );

  useEffect(() => {
    if (!returnModalOpen || !actionRental?.id || !debouncedReturnDate) {
      return undefined;
    }

    let cancelled = false;
    setReturnPreviewLoading(true);
    setReturnPreviewError(null);

    rentalService
      .previewReturn(actionRental.id, { actualReturnDate: debouncedReturnDate })
      .then((res) => {
        if (cancelled) return;
        setReturnPreview(res?.data ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        setReturnPreview(null);
        setReturnPreviewError(
          error?.response?.data?.message || 'Could not preview return details'
        );
      })
      .finally(() => {
        if (!cancelled) setReturnPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [returnModalOpen, actionRental?.id, debouncedReturnDate]);

  const onReturnSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      setSubmitting(true);
      try {
        const res = await rentalService.returnRental(actionRental.id, {
          actualReturnDate: values.actualReturnDate,
          inspectionNotes: values.inspectionNotes?.trim() || null,
          ...(values.scheduleReturnPickup ? { scheduleReturnPickup: true } : {}),
        });
        const lateTotal = res?.lateCharge?.totalCharge;
        showSuccess(
          res?.invoiceCreated
            ? 'Return recorded and invoice generated'
            : lateTotal && Number(lateTotal) > 0
              ? `Return recorded. Estimated late charge: ${formatAmount(lateTotal)}`
              : 'Return recorded successfully'
        );
        setReturnModalOpen(false);
        if (viewingRental?.id === actionRental.id && res?.data) {
          setViewingRental(res.data);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to record return', error);
        showError(error, 'Failed to record return');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, fetchRentals, viewingRental?.id]
  );

  const openCheckoutModal = useCallback(
    async (rental) => {
      setActionRental(rental);
      checkoutForm.reset({ handoverNotes: '', scheduleDelivery: false });
      setCheckoutUnitAssignments({});
      setCheckoutAvailableUnits({});
      setCheckoutModalOpen(true);

      try {
        const response = await rentalService.getById(rental.id);
        const fullRental = response?.data?.data ?? response?.data ?? rental;
        setActionRental(fullRental);

        const serialItems = (fullRental.items || []).filter((item) => productTracksSerialUnits(item.product));
        if (!serialItems.length || !fullRental.branchId) return;

        const unitEntries = await Promise.all(
          serialItems.map(async (item) => {
            try {
              const unitsResponse = await rentalService.getAvailableUnits({
                productId: item.productId,
                branchId: fullRental.branchId,
                startDate: fullRental.startDate,
                endDate: fullRental.endDate,
                excludeRentalId: fullRental.id,
              });
              const units = unitsResponse?.data?.data?.units ?? unitsResponse?.data?.units ?? [];
              const available = Array.isArray(units) ? units : [];
              if (item.rentalUnit && !available.some((unit) => unit.id === item.rentalUnit.id)) {
                available.unshift(item.rentalUnit);
              }
              return [item.id, available];
            } catch (error) {
              console.error('Failed to load checkout units', error);
              return [item.id, item.rentalUnit ? [item.rentalUnit] : []];
            }
          })
        );
        setCheckoutAvailableUnits(Object.fromEntries(unitEntries));
        const initialAssignments = {};
        serialItems.forEach((item) => {
          if (item.rentalUnitId) initialAssignments[item.id] = item.rentalUnitId;
        });
        setCheckoutUnitAssignments(initialAssignments);
      } catch (error) {
        console.error('Failed to load rental for checkout', error);
      }
    },
    [checkoutForm]
  );

  const onCheckoutSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      setSubmitting(true);
      try {
        const unitAssignments = Object.entries(checkoutUnitAssignments)
          .filter(([, rentalUnitId]) => rentalUnitId)
          .map(([rentalItemId, rentalUnitId]) => ({ rentalItemId, rentalUnitId }));

        const res = await rentalService.checkoutRental(actionRental.id, {
          handoverNotes: values.handoverNotes || null,
          ...(values.scheduleDelivery ? { scheduleDelivery: true } : {}),
          ...(unitAssignments.length ? { unitAssignments } : {}),
        });
        showSuccess('Rental handed over successfully');
        setCheckoutModalOpen(false);
        const updated = res?.data || res;
        if (viewingRental?.id === actionRental.id) {
          setViewingRental(updated);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to check out rental', error);
        showError(error, 'Failed to hand over rental');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, checkoutUnitAssignments, fetchRentals, viewingRental?.id]
  );

  const openWaiveModal = useCallback(
    (rental, charge) => {
      setActionRental(rental);
      setWaiveCharge(charge);
      waiveForm.reset({ reason: '' });
      setWaiveModalOpen(true);
    },
    [waiveForm]
  );

  const onWaiveSubmit = useCallback(
    async (values) => {
      if (!actionRental || !waiveCharge) return;
      setSubmitting(true);
      try {
        const res = await rentalService.waiveLateCharge(actionRental.id, waiveCharge.id, {
          reason: values.reason.trim(),
        });
        const message = res?.invoiceUpdated
          ? 'Late charge waived and invoice updated'
          : 'Late charge waived';
        showSuccess(message);
        setWaiveModalOpen(false);
        setWaiveCharge(null);
        if (viewingRental?.id === actionRental.id && res?.data) {
          setViewingRental(res.data);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to waive late charge', error);
        showError(error, 'Failed to waive late charge');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, waiveCharge, fetchRentals, viewingRental?.id]
  );

  const openRefundModal = useCallback(
    (rental, maxAmount) => {
      setActionRental(rental);
      setRefundMaxAmount(maxAmount);
      refundForm.reset({
        amount: maxAmount,
        reason: '',
        paymentMethod: rental?.metadata?.deposit?.refundMethod
          || rental?.metadata?.deposit?.paymentMethod
          || rental?.paymentMethod
          || 'cash',
        referenceNumber: '',
      });
      setRefundModalOpen(true);
    },
    [refundForm]
  );

  const onRefundSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      if (values.amount > refundMaxAmount) {
        refundForm.setError('amount', {
          message: `Cannot refund more than ${formatAmount(refundMaxAmount)}`,
        });
        return;
      }

      setSubmitting(true);
      try {
        const res = await rentalService.refundDeposit(actionRental.id, {
          amount: Number(values.amount),
          reason: values.reason.trim(),
          paymentMethod: values.paymentMethod,
          referenceNumber: values.referenceNumber?.trim() || undefined,
        });
        showSuccess(`Deposit refund of ${formatAmount(res?.refundAmount ?? values.amount)} recorded`);
        setRefundModalOpen(false);
        if (viewingRental?.id === actionRental.id && res?.data) {
          setViewingRental(res.data);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to refund deposit', error);
        showError(error, 'Failed to refund deposit');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, refundMaxAmount, fetchRentals, viewingRental?.id, refundForm]
  );

  const handleApplyDeposit = useCallback(
    async (rental) => {
      setSubmitting(true);
      try {
        const res = await rentalService.applyDeposit(rental.id);
        const applied = res?.appliedAmount ?? 0;
        showSuccess(
          applied > 0
            ? `Deposit of ${formatAmount(applied)} applied to invoice`
            : 'Deposit already applied to invoice'
        );
        if (viewingRental?.id === rental.id && res?.data) {
          setViewingRental(res.data);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to apply deposit', error);
        showError(error, 'Failed to apply deposit');
      } finally {
        setSubmitting(false);
      }
    },
    [fetchRentals, viewingRental?.id]
  );

  const openHirePaymentModal = useCallback(
    (rental, balance) => {
      setActionRental(rental);
      setHirePaymentMaxAmount(balance);
      hirePaymentForm.reset({
        amount: balance,
        paymentMethod: rental?.paymentMethod === 'credit' ? 'cash' : (rental?.paymentMethod || 'cash'),
        referenceNumber: '',
        notes: '',
      });
      setHirePaymentModalOpen(true);
    },
    [hirePaymentForm]
  );

  const onHirePaymentSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      if (values.amount > hirePaymentMaxAmount) {
        hirePaymentForm.setError('amount', {
          message: `Cannot record more than ${formatAmount(hirePaymentMaxAmount)} due`,
        });
        return;
      }

      setSubmitting(true);
      try {
        const res = await rentalService.recordPayment(actionRental.id, {
          amount: values.amount,
          paymentMethod: values.paymentMethod,
          referenceNumber: values.referenceNumber?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        });
        showSuccess(`Recorded payment of ${formatAmount(values.amount)}`);
        setHirePaymentModalOpen(false);
        if (viewingRental?.id === actionRental.id && res?.data) {
          setViewingRental(res.data);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to record rental payment', error);
        showError(error, 'Failed to record payment');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, hirePaymentMaxAmount, hirePaymentForm, viewingRental?.id, fetchRentals]
  );

  const handleSendInvoice = useCallback(
    async (rental) => {
      const invoiceId = rental?.metadata?.invoiceId;
      if (!invoiceId) return;
      setSendingInvoice(true);
      try {
        await invoiceService.send(invoiceId);
        showSuccess('Invoice sent');
      } catch (error) {
        console.error('Failed to send rental invoice', error);
        showError(error, 'Failed to send invoice');
      } finally {
        setSendingInvoice(false);
      }
    },
    []
  );

  const openCollectDepositModal = useCallback(
    (rental, remaining) => {
      setActionRental(rental);
      setCollectMaxAmount(remaining);
      const method = rental?.metadata?.deposit?.paymentMethod || rental?.paymentMethod || 'cash';
      collectDepositForm.reset({
        amount: remaining,
        paymentMethod: method === 'credit' ? 'cash' : method,
        referenceNumber: '',
      });
      setCollectDepositModalOpen(true);
    },
    [collectDepositForm]
  );

  const onCollectDepositSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      if (values.amount > collectMaxAmount) {
        collectDepositForm.setError('amount', {
          message: `Cannot collect more than ${formatAmount(collectMaxAmount)} remaining`,
        });
        return;
      }

      const existingPaid = getRentalDeposit(actionRental).paid;
      const nextPaid = Number((existingPaid + Number(values.amount)).toFixed(2));

      setSubmitting(true);
      try {
        await rentalService.updateRental(actionRental.id, {
          depositPaid: nextPaid,
          collectDeposit: true,
          depositPaymentMethod: values.paymentMethod,
          depositReferenceNumber: values.referenceNumber?.trim() || undefined,
        });
        showSuccess(`Collected ${formatAmount(values.amount)} of remaining deposit`);
        setCollectDepositModalOpen(false);
        if (viewingRental?.id === actionRental.id) {
          const fresh = await rentalService.getById(actionRental.id);
          setViewingRental(fresh?.data || fresh);
        }
        fetchRentals();
      } catch (error) {
        console.error('Failed to collect remaining deposit', error);
        showError(error, 'Failed to collect remaining deposit');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, collectMaxAmount, collectDepositForm, fetchRentals, viewingRental?.id]
  );

  const openDamageModal = useCallback(
    async (rental) => {
      // The list payload may omit items, so load the full rental first.
      let full = rental;
      try {
        const res = await rentalService.getById(rental.id);
        full = res?.data || res || rental;
      } catch (error) {
        console.error('Failed to load rental items', error);
      }
      setActionRental(full);
      damageForm.reset({
        rentalItemId: '',
        damageType: 'other',
        severity: 'minor',
        estimatedRepairCost: 0,
        description: '',
      });
      setDamagePhotoUrls([]);
      setDamageModalOpen(true);
    },
    [damageForm]
  );

  const onDamageSubmit = useCallback(
    async (values) => {
      if (!actionRental) return;
      const item = (actionRental.items || []).find((i) => i.id === values.rentalItemId);
      if (!item) {
        showError(null, 'Select a rental item to report damage against');
        return;
      }

      setSubmitting(true);
      try {
        await rentalService.recordDamage(actionRental.id, {
          rentalItemId: values.rentalItemId,
          productId: item.productId,
          damageType: values.damageType,
          severity: values.severity,
          estimatedRepairCost: Number(values.estimatedRepairCost || 0),
          description: values.description || null,
          photos: damagePhotoUrls,
        });
        showSuccess('Damage recorded. An expense was created for approval.');
        setDamageModalOpen(false);
        setDamagePhotoUrls([]);
        fetchRentals();
        if (viewingRental?.id === actionRental.id) {
          const res = await rentalService.getById(actionRental.id);
          setViewingRental(res?.data || res);
        }
      } catch (error) {
        console.error('Failed to record damage', error);
        showError(error, 'Failed to record damage');
      } finally {
        setSubmitting(false);
      }
    },
    [actionRental, damagePhotoUrls, fetchRentals, viewingRental?.id]
  );

  const handleDamagePhotoSelect = useCallback(async ({ file }) => {
    if (!file) return;
    setDamagePhotoUploading(true);
    try {
      const res = await expenseService.uploadReceipt(file);
      const photoUrl = res?.receiptUrl;
      if (!photoUrl) {
        showError('Upload succeeded but no photo URL was returned');
        return;
      }
      setDamagePhotoUrls((prev) => [...prev, photoUrl]);
      showSuccess('Photo uploaded');
    } catch (error) {
      showError(error, 'Failed to upload photo');
    } finally {
      setDamagePhotoUploading(false);
    }
  }, []);

  const handleDamagePhotoRemove = useCallback((file) => {
    const url = file?.url || file?.receiptUrl;
    if (!url) return;
    setDamagePhotoUrls((prev) => prev.filter((item) => item !== url));
  }, []);

  const handleViewDamageExpense = useCallback((expenseId) => {
    if (!expenseId) return;
    navigate(`/expenses?open=${expenseId}`);
  }, [navigate]);

  const tableColumns = useMemo(
    () => [
      {
        key: 'customer',
        label: 'Customer',
        render: (_, record) => (
          <div>
            <div className="font-semibold text-foreground">
              {record?.customer?.name || '—'}
            </div>
            <div className="text-muted-foreground text-sm">
              {(record?.items || []).length} item
              {(record?.items || []).length === 1 ? '' : 's'}
            </div>
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Rental Period',
        render: (_, record) => (
          <span className="text-foreground">
            {record?.startDate ? dayjs(record.startDate).format('MMM DD, YYYY') : '—'}
            {' → '}
            {record?.endDate ? dayjs(record.endDate).format('MMM DD, YYYY') : '—'}
          </span>
        ),
      },
      {
        key: 'rentalDurationDays',
        label: 'Days',
        render: (_, record) => (
          <span className="text-foreground">{record?.rentalDurationDays || 0}</span>
        ),
      },
      {
        key: 'totalDue',
        label: 'Total Due',
        render: (_, record) => (
          <span className="text-foreground">{formatAmount(record?.totalDue)}</span>
        ),
      },
      {
        key: 'dueDate',
        label: 'Due date',
        render: (_, record) => {
          const dueDate = record?.endDate;
          if (!dueDate) {
            return <span className="text-muted-foreground">—</span>;
          }
          const due = dayjs(dueDate).endOf('day');
          const formatted = dayjs(dueDate).format('MMM DD, YYYY');
          const status = record?.status || RENTAL_STATUSES.PENDING;
          const isOverdue = (
            status === RENTAL_STATUSES.OVERDUE
            || ([
              RENTAL_STATUSES.CONFIRMED,
              RENTAL_STATUSES.ACTIVE,
            ].includes(status) && due.isBefore(dayjs()))
          );
          return (
            <span className={isOverdue ? 'font-medium text-destructive' : 'text-foreground'}>
              {formatted}
            </span>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        mobileDashboardPlacement: 'headerEnd',
        render: (_, record) => <StatusChip status={record?.status || RENTAL_STATUSES.PENDING} />,
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_, record) => (
          <ActionColumn
            record={record}
            onView={handleViewRental}
          />
        ),
      },
    ],
    [handleViewRental]
  );

  const preBookingTableColumns = useMemo(
    () => [
      {
        key: 'customer',
        label: 'Customer',
        render: (_, record) => (
          <div>
            <div className="font-semibold text-foreground">
              {record?.customer?.name || '—'}
            </div>
            <div className="text-muted-foreground text-sm">
              {(record?.items || []).length} item
              {(record?.items || []).length === 1 ? '' : 's'}
            </div>
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Requested Period',
        render: (_, record) => (
          <span className="text-foreground">
            {record?.requestedStartDate
              ? dayjs(record.requestedStartDate).format('MMM DD, YYYY')
              : '—'}
            {' → '}
            {record?.requestedEndDate
              ? dayjs(record.requestedEndDate).format('MMM DD, YYYY')
              : '—'}
          </span>
        ),
      },
      {
        key: 'estimatedTotal',
        label: 'Est. Total',
        render: (_, record) => (
          <span className="text-foreground">{formatAmount(getPreBookingEstimatedTotal(record))}</span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        mobileDashboardPlacement: 'headerEnd',
        render: (_, record) => (
          <StatusChip status={record?.status || PRE_BOOKING_STATUSES.PENDING} />
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_, record) => {
          const isPending = record?.status === PRE_BOOKING_STATUSES.PENDING;
          return (
            <ActionColumn
              record={record}
              onView={handleViewPreBooking}
              extraActions={[
                ...(isPending && isManager
                  ? [
                      {
                        key: 'confirm',
                        label: 'Confirm',
                        variant: 'secondary',
                        icon: <CheckCircle2 className="h-4 w-4" />,
                        onClick: () => openConfirmPreBookingModal(record),
                      },
                      {
                        key: 'cancel',
                        label: 'Cancel',
                        variant: 'secondary',
                        icon: <Ban className="h-4 w-4" />,
                        onClick: () => openCancelPreBookingModal(record),
                      },
                    ]
                  : []),
              ]}
            />
          );
        },
      },
    ],
    [handleViewPreBooking, openConfirmPreBookingModal, openCancelPreBookingModal, isManager]
  );

  const preBookingDrawerTabs = useMemo(() => {
    if (!viewingPreBooking) return [];

    const items = viewingPreBooking.items || [];
    const estimatedTotal = getPreBookingEstimatedTotal(viewingPreBooking);
    const days = getDayCount(viewingPreBooking.requestedStartDate, viewingPreBooking.requestedEndDate);
    const isPending = viewingPreBooking.status === PRE_BOOKING_STATUSES.PENDING;

    return [
      {
        key: 'summary',
        label: 'Summary',
        content: (
          <DrawerSectionCard title="Pre-booking details">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Customer">
                {viewingPreBooking.customer?.name || '—'}
              </DescriptionItem>
              <DescriptionItem label="Status">
                <StatusChip status={viewingPreBooking.status || PRE_BOOKING_STATUSES.PENDING} />
              </DescriptionItem>
              <DescriptionItem label="Start Date">
                {viewingPreBooking.requestedStartDate
                  ? dayjs(viewingPreBooking.requestedStartDate).format('MMM DD, YYYY')
                  : '—'}
              </DescriptionItem>
              <DescriptionItem label="End Date">
                {viewingPreBooking.requestedEndDate
                  ? dayjs(viewingPreBooking.requestedEndDate).format('MMM DD, YYYY')
                  : '—'}
              </DescriptionItem>
              <DescriptionItem label="Duration">
                {days} day{days === 1 ? '' : 's'}
              </DescriptionItem>
              <DescriptionItem label="Estimated Total">
                {formatAmount(estimatedTotal)}
              </DescriptionItem>
              <DescriptionItem label="Notes">{viewingPreBooking.notes || '—'}</DescriptionItem>
              {viewingPreBooking.convertedToRentalId ? (
                <DescriptionItem label="Converted Rental">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-primary"
                    onClick={() => {
                      setPreBookingDrawerVisible(false);
                      navigate(`/rentals?rentalId=${viewingPreBooking.convertedToRentalId}`);
                    }}
                  >
                    View rental
                  </Button>
                </DescriptionItem>
              ) : null}
            </Descriptions>
            {isPending && isManager ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openCancelPreBookingModal(viewingPreBooking)}
                >
                  <Ban className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
                <Button type="button" onClick={() => openConfirmPreBookingModal(viewingPreBooking)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Confirm & convert
                </Button>
              </div>
            ) : null}
          </DrawerSectionCard>
        ),
      },
      {
        key: 'items',
        label: `Items (${items.length})`,
        content: (
          <DrawerSectionCard title="Reserved items">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items on this pre-booking.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {item.product?.name || 'Rental item'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.quantity} × {formatAmount(item.requestedRatePerDay)}/day
                      </div>
                    </div>
                    <div className="text-foreground font-medium">
                      {formatAmount(
                        Number(item.quantity || 0) *
                          Number(item.requestedRatePerDay || 0) *
                          days
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DrawerSectionCard>
        ),
      },
    ];
  }, [
    viewingPreBooking,
    navigate,
    openCancelPreBookingModal,
    openConfirmPreBookingModal,
    isManager,
  ]);

  const rentalDrawerPrimaryAction = useMemo(() => {
    if (!viewingRental) return null;
    const invoiceId = viewingRental.metadata?.invoiceId;
    if (invoiceId) {
      return {
        label: 'View invoice',
        icon: <FileText className="h-4 w-4" />,
        onClick: () => handleViewInvoice(viewingRental),
      };
    }
    if (isRentalCheckoutEligible(viewingRental, isManager)) {
      return {
        label: 'Hand over',
        icon: <PackageCheck className="h-4 w-4" />,
        onClick: () => openCheckoutModal(viewingRental),
      };
    }
    if (RENTAL_RETURNABLE_STATUSES.includes(viewingRental.status)) {
      return {
        label: 'Record return',
        icon: <Undo2 className="h-4 w-4" />,
        onClick: () => openReturnModal(viewingRental),
      };
    }
    if (RENTAL_EXTENDABLE_STATUSES.includes(viewingRental.status)) {
      return {
        label: 'Extend',
        icon: <CalendarPlus className="h-4 w-4" />,
        onClick: () => openExtendModal(viewingRental),
      };
    }
    return null;
  }, [
    viewingRental,
    isManager,
    openCheckoutModal,
    openReturnModal,
    openExtendModal,
    handleViewInvoice,
  ]);

  const rentalDrawerMoreMenuItems = useMemo(() => {
    if (!viewingRental) return [];

    const status = viewingRental.status || RENTAL_STATUSES.PENDING;
    const isCheckoutEligible = isRentalCheckoutEligible(viewingRental, isManager);
    const isExtendable = RENTAL_EXTENDABLE_STATUSES.includes(status);
    const isReturnable = RENTAL_RETURNABLE_STATUSES.includes(status);
    const isOpen = OPEN_STATUSES.includes(status);
    const hasInvoice = !!viewingRental.metadata?.invoiceId;
    const hireBalance = computeRentalFinancials(viewingRental).balance;
    const primaryIsCheckout = isCheckoutEligible;
    const primaryIsReturn = !primaryIsCheckout && isReturnable;
    const primaryIsExtend =
      !primaryIsCheckout && !primaryIsReturn && isExtendable;

    const items = [];

    if (isCheckoutEligible && !primaryIsCheckout) {
      items.push({
        key: 'checkout',
        label: 'Hand over',
        icon: <PackageCheck className="h-4 w-4" />,
        onClick: () => openCheckoutModal(viewingRental),
      });
    }
    if (isExtendable && !primaryIsExtend) {
      items.push({
        key: 'extend',
        label: 'Extend rental',
        icon: <CalendarPlus className="h-4 w-4" />,
        onClick: () => openExtendModal(viewingRental),
      });
    }
    if (isReturnable && !primaryIsReturn) {
      items.push({
        key: 'return',
        label: 'Record return',
        icon: <Undo2 className="h-4 w-4" />,
        onClick: () => openReturnModal(viewingRental),
      });
    }
    if (isOpen) {
      items.push({
        key: 'damage',
        label: 'Report damage',
        icon: <AlertTriangle className="h-4 w-4" />,
        onClick: () => openDamageModal(viewingRental),
      });
    }
    if (hasInvoice && hireBalance > 0.01 && viewingRental.status !== RENTAL_STATUSES.CANCELLED) {
      items.push({
        key: 'record-payment',
        label: 'Record payment',
        icon: <Banknote className="h-4 w-4" />,
        onClick: () => openHirePaymentModal(viewingRental, hireBalance),
      });
    }
    if (hasInvoice) {
      items.push({
        key: 'send-invoice',
        label: 'Send invoice',
        icon: <FileText className="h-4 w-4" />,
        onClick: () => handleSendInvoice(viewingRental),
      });
    }

    return items;
  }, [
    viewingRental,
    isManager,
    openCheckoutModal,
    openExtendModal,
    openReturnModal,
    openDamageModal,
    openHirePaymentModal,
    handleSendInvoice,
  ]);

  const drawerTabs = useMemo(() => {
    if (!viewingRental) return [];

    const items = viewingRental.items || [];
    const lateCharges = viewingRental.lateCharges || [];
    const damageReports = viewingRental.damageReports || [];
    const extensions = viewingRental.extensions || [];
    const financials = computeRentalFinancials(viewingRental);
    const timelineEvents = buildRentalTimelineEvents(viewingRental);

    const renderLateCharges = () => (
      <DrawerSectionCard title={`Late charges (${lateCharges.length})`}>
        {lateCharges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No late charges.</p>
        ) : (
          <div className="space-y-3">
            {lateCharges.map((charge) => (
              <div
                key={charge.id}
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {charge.daysLate} day{charge.daysLate === 1 ? '' : 's'} late
                    </span>
                    <StatusChip status={charge.status || 'pending'} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatAmount(charge.chargePerDay)}/day
                  </div>
                  {charge.status === 'waived' && charge.metadata?.waiveReason ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      Waived: {charge.metadata.waiveReason}
                      {charge.metadata.waivedAt
                        ? ` · ${dayjs(charge.metadata.waivedAt).format('MMM DD, YYYY h:mm A')}`
                        : ''}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={
                      charge.status === 'waived'
                        ? 'font-medium text-muted-foreground line-through'
                        : 'font-medium text-foreground'
                    }
                  >
                    {formatAmount(charge.totalCharge)}
                  </span>
                  {isManager && charge.status === 'pending' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openWaiveModal(viewingRental, charge)}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      Waive
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerSectionCard>
    );

    const renderDamageReports = () => (
      <DrawerSectionCard title={`Damage reports (${damageReports.length})`}>
        {damageReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No damage reported.</p>
        ) : (
          <div className="space-y-3">
            {damageReports.map((report) => (
              <div
                key={report.id}
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    {formatDamageType(report.damageType || 'other')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDamageSeverity(report.severity || 'minor')}
                    {report.description ? ` — ${report.description}` : ''}
                  </div>
                  {Array.isArray(report.photos) && report.photos.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {report.photos.map((photoUrl) => (
                        <a
                          key={photoUrl}
                          href={resolveImageUrl(photoUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded border border-border"
                        >
                          <img
                            src={resolveImageUrl(photoUrl)}
                            alt="Damage"
                            className="h-12 w-12 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {report.expenseId || report.expense?.id ? (
                    <Button
                      type="button"
                      variant="link"
                      className="mt-1 h-auto p-0 text-sm"
                      onClick={() => handleViewDamageExpense(report.expenseId || report.expense?.id)}
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      {report.expense?.expenseNumber
                        ? `Expense ${report.expense.expenseNumber}`
                        : 'View linked expense'}
                    </Button>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-foreground font-medium">
                    {formatAmount(report.actualRepairCost ?? report.estimatedRepairCost)}
                  </div>
                  {report.status ? (
                    <div className="text-xs text-muted-foreground capitalize">
                      {String(report.status).replace(/_/g, ' ')}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerSectionCard>
    );

    const renderExtensions = () => (
      <DrawerSectionCard title={`Extensions (${extensions.length})`}>
        {extensions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extensions.</p>
        ) : (
          <div className="space-y-3">
            {extensions.map((extension) => (
              <div
                key={extension.id}
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <div className="font-medium text-foreground">
                    To {dayjs(extension.newEndDate).format('MMM DD, YYYY')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {extension.extensionDays} extra day
                    {extension.extensionDays === 1 ? '' : 's'}
                    {extension.reason ? ` · ${extension.reason}` : ''}
                  </div>
                  {extension.createdAt ? (
                    <div className="text-xs text-muted-foreground">
                      {dayjs(extension.createdAt).format('MMM DD, YYYY h:mm A')}
                    </div>
                  ) : null}
                </div>
                <div className="text-foreground font-medium">
                  {formatAmount(extension.additionalCharge)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerSectionCard>
    );

    return [
      {
        key: 'overview',
        label: 'Overview',
        content: (
          <div className="space-y-4">
            <DrawerSectionCard title="Rental details">
              <Descriptions column={1} className="space-y-0">
                <DescriptionItem label="Customer">
                  {viewingRental.customer?.name || '—'}
                </DescriptionItem>
                <DescriptionItem label="Status">
                  <StatusChip status={viewingRental.status || RENTAL_STATUSES.PENDING} />
                </DescriptionItem>
                <DescriptionItem label="Start Date">
                  {viewingRental.startDate
                    ? dayjs(viewingRental.startDate).format('MMM DD, YYYY')
                    : '—'}
                </DescriptionItem>
                <DescriptionItem label="End Date">
                  {viewingRental.endDate
                    ? dayjs(viewingRental.endDate).format('MMM DD, YYYY')
                    : '—'}
                </DescriptionItem>
                <DescriptionItem label="Actual Return">
                  {viewingRental.actualReturnDate
                    ? dayjs(viewingRental.actualReturnDate).format('MMM DD, YYYY')
                    : '—'}
                </DescriptionItem>
                <DescriptionItem label="Duration">
                  {viewingRental.rentalDurationDays || 0} day
                  {viewingRental.rentalDurationDays === 1 ? '' : 's'}
                </DescriptionItem>
                {viewingRental.metadata?.operationalLocation ? (
                  <DescriptionItem label="Operational location">
                    {viewingRental.metadata.operationalLocation}
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label="Payment Method">
                  {viewingRental.paymentMethod || '—'}
                </DescriptionItem>
                {viewingRental.metadata?.promisedPaymentDate ? (
                  <DescriptionItem label="Promised payment date">
                    {dayjs(viewingRental.metadata.promisedPaymentDate).format('MMM DD, YYYY')}
                  </DescriptionItem>
                ) : null}
                <DescriptionItem label="Notes">{viewingRental.notes || '—'}</DescriptionItem>
              </Descriptions>
            </DrawerSectionCard>

            {getRentalDeliveryLegs(viewingRental).length > 0 ? (
              <DrawerSectionCard title="Delivery">
                <div className="space-y-3">
                  {getRentalDeliveryLegs(viewingRental).map((leg) => (
                    <div
                      key={leg.leg}
                      className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground">
                          {RENTAL_DELIVERY_LEG_LABELS[leg.leg] || leg.leg}
                        </div>
                        {leg.address ? (
                          <div className="text-sm text-muted-foreground">
                            {[leg.address.line1, leg.address.city, leg.address.state]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        ) : null}
                        {leg.scheduledDate ? (
                          <div className="text-xs text-muted-foreground">
                            Scheduled: {dayjs(leg.scheduledDate).format('MMM DD, YYYY')}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant="secondary" className="border border-border">
                          {formatRentalDeliveryStatus(leg.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/deliveries')}
                  >
                    <Truck className="mr-1 h-3.5 w-3.5" />
                    Open deliveries
                  </Button>
                </div>
              </DrawerSectionCard>
            ) : null}

            <DrawerSectionCard title="Financial summary">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Rental amount</span>
                  <span className="font-medium text-foreground">{formatAmount(financials.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Late charges</span>
                  <span className="font-medium text-foreground">
                    {formatAmount(financials.lateChargeTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Damage</span>
                  <span className="font-medium text-foreground">
                    {formatAmount(financials.damageTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-foreground">
                    −{formatAmount(financials.discountAmount)}
                  </span>
                </div>
                <div className="my-2 border-t border-border" />
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-foreground">Total due</span>
                  <span className="font-semibold text-foreground">
                    {formatAmount(financials.totalDue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-medium text-foreground">
                    {formatAmount(financials.amountPaid)}
                  </span>
                </div>
                {(financials.depositAmount > 0 || financials.depositPaid > 0) ? (
                  <>
                    <div className="my-2 border-t border-border" />
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Security deposit</span>
                      <span className="font-medium text-foreground">
                        {formatAmount(financials.depositAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Deposit collected</span>
                      <span className="font-medium text-foreground">
                        {formatAmount(financials.depositPaid)}
                      </span>
                    </div>
                    {financials.depositHeld > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Deposit held</span>
                        <span className="font-medium text-foreground">
                          {formatAmount(financials.depositHeld)}
                        </span>
                      </div>
                    ) : null}
                    {financials.depositApplied > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Deposit applied</span>
                        <span className="font-medium text-foreground">
                          −{formatAmount(financials.depositApplied)}
                        </span>
                      </div>
                    ) : null}
                    {financials.depositRefunded > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Deposit refunded</span>
                        <span className="font-medium text-foreground">
                          {formatAmount(financials.depositRefunded)}
                        </span>
                      </div>
                    ) : null}
                    {financials.depositRefundable > 0 && financials.depositStatus !== 'held' ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Deposit refundable</span>
                        <span className="font-medium text-foreground">
                          {formatAmount(financials.depositRefundable)}
                        </span>
                      </div>
                    ) : null}
                    {financials.depositRemaining > 0
                      && viewingRental.status !== RENTAL_STATUSES.CANCELLED
                      && financials.depositStatus !== 'refunded' ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Still to collect</span>
                        <span className="font-medium text-foreground">
                          {formatAmount(financials.depositRemaining)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Deposit status</span>
                      <span className="font-medium text-foreground">
                        {formatDepositStatus(financials.depositStatus)}
                      </span>
                    </div>
                    {(
                      (financials.depositRemaining > 0
                        && viewingRental.status !== RENTAL_STATUSES.CANCELLED
                        && financials.depositStatus !== 'refunded')
                      || (isManager && financials.depositRefundable > 0)
                    ) ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {financials.depositRemaining > 0
                          && viewingRental.status !== RENTAL_STATUSES.CANCELLED
                          && financials.depositStatus !== 'refunded' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openCollectDepositModal(viewingRental, financials.depositRemaining)}
                          >
                            <Banknote className="mr-1 h-3.5 w-3.5" />
                            Collect remaining deposit
                          </Button>
                        ) : null}
                        {isManager && financials.depositRefundable > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openRefundModal(viewingRental, financials.depositRefundable)}
                          >
                            <Banknote className="mr-1 h-3.5 w-3.5" />
                            Refund deposit
                          </Button>
                        ) : null}
                        {isManager && financials.depositRefundable > 0 && financials.depositStatus === 'held'
                          && viewingRental.metadata?.invoiceId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleApplyDeposit(viewingRental)}
                          >
                            Apply deposit to invoice
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-foreground">Balance</span>
                  <span
                    className={
                      financials.netBalance > 0
                        ? 'font-semibold text-destructive'
                        : 'font-semibold text-foreground'
                    }
                  >
                    {formatAmount(financials.netBalance)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {financials.balance > 0.01 && viewingRental.status !== RENTAL_STATUSES.CANCELLED ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openHirePaymentModal(viewingRental, financials.balance)}
                    >
                      <Banknote className="mr-1 h-3.5 w-3.5" />
                      Record payment
                    </Button>
                  ) : null}
                  {viewingRental.metadata?.invoiceId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewInvoice(viewingRental)}
                    >
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      View invoice
                    </Button>
                  ) : null}
                  {viewingRental.metadata?.invoiceId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={sendingInvoice}
                      onClick={() => handleSendInvoice(viewingRental)}
                    >
                      {sendingInvoice ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="mr-1 h-3.5 w-3.5" />
                      )}
                      Send invoice
                    </Button>
                  ) : null}
                </div>
              </div>
            </DrawerSectionCard>

            <DrawerSectionCard title="Documents">
              <div className="flex flex-wrap gap-2">
                {canDownloadAgreement(viewingRental) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pdfLoading}
                    onClick={() => openRentalDocument(viewingRental, 'agreement')}
                  >
                    {pdfLoading && pdfDocumentType === 'agreement' ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3.5 w-3.5" />
                    )}
                    Agreement PDF
                  </Button>
                ) : null}
                {canDownloadReturnInspection(viewingRental) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pdfLoading}
                    onClick={() => openRentalDocument(viewingRental, 'return_inspection')}
                  >
                    {pdfLoading && pdfDocumentType === 'return_inspection' ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3.5 w-3.5" />
                    )}
                    Return inspection PDF
                  </Button>
                ) : null}
                {viewingRental.metadata?.invoiceId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pdfLoading}
                    onClick={() => openInvoicePdf(viewingRental)}
                  >
                    {pdfLoading && pdfDocumentType === 'invoice' ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3.5 w-3.5" />
                    )}
                    Invoice PDF
                  </Button>
                ) : null}
              </div>
              {!canDownloadAgreement(viewingRental)
                && !canDownloadReturnInspection(viewingRental)
                && !viewingRental.metadata?.invoiceId ? (
                  <p className="text-sm text-muted-foreground">No documents available yet.</p>
              ) : null}
            </DrawerSectionCard>
          </div>
        ),
      },
      {
        key: 'items',
        label: `Items (${items.length})`,
        content: (
          <DrawerSectionCard title="Rented items">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items on this rental.</p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {item.product?.name || 'Rental item'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.quantity} × {formatAmount(item.rentalRatePerDay)}/day
                        {item.rentalUnit?.serialNumber ? ` · ${item.rentalUnit.serialNumber}` : ''}
                      </div>
                    </div>
                    <div className="text-foreground font-medium">
                      {formatAmount(item.subtotal)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DrawerSectionCard>
        ),
      },
      {
        key: 'activity',
        label: 'Activity',
        content: (
          <div className="space-y-4">
            {renderLateCharges()}
            {renderDamageReports()}
            {renderExtensions()}
            <DrawerSectionCard title="Activity timeline">
              {timelineEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <Timeline>
                  {timelineEvents.map((event, index) => (
                    <TimelineItem
                      key={event.id}
                      isLast={index === timelineEvents.length - 1}
                    >
                      <TimelineIndicator />
                      <TimelineContent>
                        <TimelineTitle className="text-foreground">{event.title}</TimelineTitle>
                        <TimelineTime className="text-foreground">
                          {dayjs(event.at).format('MMM DD, YYYY h:mm A')}
                        </TimelineTime>
                        {event.description ? (
                          <TimelineDescription className="text-foreground">
                            {event.description}
                          </TimelineDescription>
                        ) : null}
                      </TimelineContent>
                    </TimelineItem>
                  ))}
                </Timeline>
              )}
            </DrawerSectionCard>
          </div>
        ),
      },
    ];
  }, [viewingRental, handleViewInvoice, handleViewDamageExpense, isManager, openWaiveModal, openRefundModal, openCollectDepositModal, handleApplyDeposit, submitting, pdfLoading, pdfDocumentType, canDownloadAgreement, canDownloadReturnInspection, openRentalDocument, openInvoicePdf]);

  const handleClearFilters = useCallback(() => {
    setFilters({
      status: 'all',
      customerId: 'all',
      startDate: null,
      endDate: null,
    });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.customerId !== 'all' ||
    !!filters.startDate ||
    !!filters.endDate ||
    !!debouncedSearch.trim();

  const rentalsEmptyState = useMemo(() => {
    if (hasActiveFilters) {
      return getEmptyStateProps(EMPTY_STATES.RENTALS_FILTERED, {
        primary: handleClearFilters,
      });
    }
    return getEmptyStateProps(EMPTY_STATES.RENTALS, {
      primary: () => openRentalModal(),
    });
  }, [hasActiveFilters, handleClearFilters, openRentalModal]);

  const handleClearPreBookingFilters = useCallback(() => {
    setPreBookingFilters({
      status: 'all',
      customerId: 'all',
      startDate: null,
      endDate: null,
    });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActivePreBookingFilters =
    preBookingFilters.status !== 'all' ||
    preBookingFilters.customerId !== 'all' ||
    !!preBookingFilters.startDate ||
    !!preBookingFilters.endDate ||
    !!debouncedSearch.trim();

  const preBookingsEmptyState = useMemo(() => {
    if (hasActivePreBookingFilters) {
      return getEmptyStateProps(EMPTY_STATES.PRE_BOOKINGS_FILTERED, {
        primary: handleClearPreBookingFilters,
      });
    }
    return getEmptyStateProps(EMPTY_STATES.PRE_BOOKINGS, {
      primary: () => openPreBookingModal(),
    });
  }, [hasActivePreBookingFilters, handleClearPreBookingFilters, openPreBookingModal]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Rentals"
          subText="Hire out stock, track returns, late charges, and damage."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          {activeTab === 'calendar' ? null : activeTab === 'pre-bookings' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setPreBookingFilterDrawerOpen(true)}
                size={isMobile ? 'icon' : 'default'}
              >
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
              <Button
                variant="outline"
                onClick={() => fetchPreBookings(true)}
                disabled={preBookingsRefreshing}
                size={isMobile ? 'icon' : 'default'}
              >
                {preBookingsRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button onClick={() => openPreBookingModal()} className="flex-1 min-w-0 md:flex-none">
                <Plus className="h-4 w-4" />
                <span className="ml-2">New Pre-booking</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setFilterDrawerOpen(true)}
                size={isMobile ? 'icon' : 'default'}
              >
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
              <Button
                variant="outline"
                onClick={() => fetchRentals(true)}
                disabled={refreshing}
                size={isMobile ? 'icon' : 'default'}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button onClick={() => openRentalModal()} className="flex-1 min-w-0 md:flex-none">
                <Plus className="h-4 w-4" />
                <span className="ml-2">New Rental</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="rentals">Rentals</TabsTrigger>
          <TabsTrigger value="pre-bookings">Pre-bookings</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="rentals" className="mt-4">
          <DashboardTable
            data={rentals}
            columns={tableColumns}
            loading={loading}
            title={null}
            emptyState={rentalsEmptyState}
            pageSize={pagination.pageSize}
            onPageChange={(newPagination) => {
              setPagination((prev) => ({ ...prev, ...newPagination }));
            }}
            externalPagination={{
              current: pagination.current,
              total: pagination.total ?? rentals.length,
            }}
          />
        </TabsContent>

        <TabsContent value="pre-bookings" className="mt-4">
          <DashboardTable
            data={preBookings}
            columns={preBookingTableColumns}
            loading={preBookingsLoading}
            title={null}
            emptyState={preBookingsEmptyState}
            pageSize={pagination.pageSize}
            onPageChange={(newPagination) => {
              setPagination((prev) => ({ ...prev, ...newPagination }));
            }}
            externalPagination={{
              current: pagination.current,
              total: pagination.total ?? preBookings.length,
            }}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <RentalCalendarView
            branchId={effectiveBranchId}
            onRentalClick={handleViewRental}
            onPreBookingClick={handleViewPreBooking}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Rentals</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => {
                  setFilters((prev) => ({ ...prev, status: v }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {RENTAL_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={filters.customerId}
                onValueChange={(v) => {
                  setFilters((prev) => ({ ...prev, customerId: v }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <DatePicker
                date={filters.startDate}
                onDateChange={(date) => {
                  setFilters((prev) => ({ ...prev, startDate: date }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <DatePicker
                date={filters.endDate}
                onDateChange={(date) => {
                  setFilters((prev) => ({ ...prev, endDate: date }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              />
            </div>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters} className="w-full">
                Clear Filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={preBookingFilterDrawerOpen} onOpenChange={setPreBookingFilterDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Pre-bookings</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={preBookingFilters.status}
                onValueChange={(v) => {
                  setPreBookingFilters((prev) => ({ ...prev, status: v }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {PRE_BOOKING_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={preBookingFilters.customerId}
                onValueChange={(v) => {
                  setPreBookingFilters((prev) => ({ ...prev, customerId: v }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <DatePicker
                date={preBookingFilters.startDate}
                onDateChange={(date) => {
                  setPreBookingFilters((prev) => ({ ...prev, startDate: date }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <DatePicker
                date={preBookingFilters.endDate}
                onDateChange={(date) => {
                  setPreBookingFilters((prev) => ({ ...prev, endDate: date }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              />
            </div>
            {hasActivePreBookingFilters && (
              <Button variant="outline" onClick={handleClearPreBookingFilters} className="w-full">
                Clear Filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <DetailsDrawer
        open={preBookingDrawerVisible}
        onOpenChange={setPreBookingDrawerVisible}
        onClose={() => setPreBookingDrawerVisible(false)}
        title={
          viewingPreBooking
            ? `Pre-booking — ${viewingPreBooking.customer?.name || 'Customer'}`
            : 'Pre-booking details'
        }
        width={720}
        onPrint={null}
        showActions={false}
        tabs={preBookingDrawerTabs}
      />

      <DetailsDrawer
        open={drawerVisible}
        onOpenChange={setDrawerVisible}
        onClose={() => setDrawerVisible(false)}
        title={
          viewingRental
            ? `Rental — ${viewingRental.customer?.name || 'Customer'}`
            : 'Rental details'
        }
        width={720}
        onPrint={null}
        primaryAction={rentalDrawerPrimaryAction}
        moreMenuItems={rentalDrawerMoreMenuItems}
        moreMenuLabel="More options"
        showActions={!!rentalDrawerPrimaryAction || rentalDrawerMoreMenuItems.length > 0}
        tabs={drawerTabs}
      />

      <RentalCheckoutDialog
        open={rentalModalOpen}
        onOpenChange={(open) => {
          setRentalModalOpen(open);
          if (!open) setRentalPrefillProductId(null);
        }}
        products={products}
        customers={customers}
        loadCustomers={loadCustomers}
        effectiveBranchId={effectiveBranchId}
        initialProductId={rentalPrefillProductId}
        onCreated={fetchRentals}
      />

      <Dialog open={extendModalOpen} onOpenChange={setExtendModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Rental</DialogTitle>
            <DialogDescription>
              Current end date:{' '}
              {actionRental?.endDate
                ? dayjs(actionRental.endDate).format('MMM DD, YYYY')
                : '—'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...extendForm}>
              <form
                id="extend-form"
                onSubmit={extendForm.handleSubmit(onExtendSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={extendForm.control}
                  name="newEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={extendForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {extendPreviewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating extension cost…
                  </div>
                ) : null}

                {extendPreviewError ? (
                  <p className="text-sm text-destructive">{extendPreviewError}</p>
                ) : null}

                {extendPreview && !extendPreviewError ? (
                  <div className="rounded-md border border-border p-3 text-sm space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Extension period</span>
                      <span className="text-foreground font-medium">
                        {extendPreview.extensionDays} day
                        {extendPreview.extensionDays === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">New rental duration</span>
                      <span className="text-foreground font-medium">
                        {extendPreview.newDurationDays} day
                        {extendPreview.newDurationDays === 1 ? '' : 's'}
                        {extendPreview.previousDurationDays !== extendPreview.newDurationDays
                          ? ` (was ${extendPreview.previousDurationDays})`
                          : ''}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-border pt-2">
                      <span className="text-muted-foreground">Additional charge</span>
                      <span className="text-foreground font-semibold">
                        {formatAmount(extendPreview.additionalCharge)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">New total due</span>
                      <span className="text-foreground font-medium">
                        {formatAmount(extendPreview.newTotalDue)}
                      </span>
                    </div>
                    {extendPreview.availability?.ok === false ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">Insufficient stock for extension dates</p>
                            {(extendPreview.availability.failures || []).slice(0, 3).map((failure) => (
                              <p key={failure.productId} className="text-xs mt-1">
                                {failure.productName || failure.productId}: requested{' '}
                                {failure.requestedQty}, available {failure.availableQty}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtendModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="extend-form" disabled={submitting || !canConfirmExtend}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Return</DialogTitle>
            <DialogDescription>
              Confirm items are back and note their condition. Late charges apply automatically
              when the return is after the due date (including grace period).
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {actionRental ? (
              <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Scheduled end</span>
                  <span className="text-foreground font-medium">
                    {actionRental.endDate
                      ? dayjs(actionRental.endDate).format('MMM DD, YYYY')
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Rental start</span>
                  <span className="text-foreground font-medium">
                    {actionRental.startDate
                      ? dayjs(actionRental.startDate).format('MMM DD, YYYY')
                      : '—'}
                  </span>
                </div>
              </div>
            ) : null}
            <Form {...returnForm}>
              <form
                id="return-form"
                onSubmit={returnForm.handleSubmit(onReturnSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={returnForm.control}
                  name="actualReturnDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Return Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {returnPreviewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating duration and late charge…
                  </div>
                ) : null}

                {returnPreviewError ? (
                  <p className="text-sm text-destructive">{returnPreviewError}</p>
                ) : null}

                {returnPreview && !returnPreviewError ? (
                  <div className="rounded-md border border-border p-3 text-sm space-y-2">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Actual duration</span>
                      <span className="text-foreground font-medium">
                        {returnPreview.rentalDurationDays} day
                        {returnPreview.rentalDurationDays === 1 ? '' : 's'}
                        {returnPreview.scheduledDurationDays !== returnPreview.rentalDurationDays
                          ? ` (scheduled: ${returnPreview.scheduledDurationDays})`
                          : ''}
                      </span>
                    </div>
                    {returnPreview.isLate ? (
                      <>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Days late</span>
                          <span className="text-amber-700 font-medium">
                            {returnPreview.lateCharge?.daysLate ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Late charge rate</span>
                          <span className="text-foreground">
                            {returnPreview.lateChargeRatePercent}% of daily rate
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-border pt-2">
                          <span className="text-muted-foreground">Estimated late charge</span>
                          <span className="text-foreground font-semibold">
                            {formatAmount(returnPreview.lateCharge?.totalCharge ?? 0)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        No late charge — return is on or before the due date
                        {returnPreview.gracePeriodValue > 0
                          ? ` (${returnPreview.gracePeriodValue} ${returnPreview.gracePeriodUnit} grace)`
                          : ''}
                        .
                      </p>
                    )}
                  </div>
                ) : null}

                <FormField
                  control={returnForm.control}
                  name="scheduleReturnPickup"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={field.onChange}
                          disabled={!actionCustomerDeliveryAddress}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Schedule return pickup (optional)
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {actionCustomerDeliveryAddress
                            ? `Pick up from: ${actionCustomerDeliveryAddress}`
                            : 'Customer has no delivery address on file.'}
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={returnForm.control}
                  name="inspectionNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inspection / Condition Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Overall condition at return — scratches, missing accessories, cleanliness, etc. Use Report damage for itemized repair costs."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="return-form"
              disabled={submitting || returnPreviewLoading || Boolean(returnPreviewError)}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Record Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hand Over Rental</DialogTitle>
            <DialogDescription>
              Confirm items are being handed to the customer. This marks the rental as active.
              {actionRental && dayjs(actionRental.startDate).isAfter(dayjs(), 'day') ? (
                <span className="mt-2 block text-amber-700">
                  Start date is in the future — early handover requires manager access.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...checkoutForm}>
              <form
                id="checkout-form"
                onSubmit={checkoutForm.handleSubmit(onCheckoutSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={checkoutForm.control}
                  name="handoverNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Handover Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Condition at pickup, accessories included, etc."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {actionRentalDepositRemaining > 0
                  && actionRental?.status !== RENTAL_STATUSES.CANCELLED ? (
                  <p className="text-sm text-muted-foreground rounded-md border border-border p-3">
                    Deposit owed: {formatAmount(actionRentalDepositRemaining)}. Collect remaining from rental details after handover.
                  </p>
                ) : null}

                <FormField
                  control={checkoutForm.control}
                  name="scheduleDelivery"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={field.onChange}
                          disabled={!actionCustomerDeliveryAddress}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Schedule delivery (optional)
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          {actionCustomerDeliveryAddress
                            ? `Deliver to: ${actionCustomerDeliveryAddress}`
                            : 'Customer has no delivery address on file.'}
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                {(actionRental?.items || [])
                  .filter((item) => productTracksSerialUnits(item.product))
                  .map((item) => (
                    <div key={item.id} className="space-y-1 border border-border rounded-md p-3">
                      <Label className="text-sm">
                        {item.product?.name || 'Product'} — unit (optional)
                      </Label>
                      <Select
                        value={checkoutUnitAssignments[item.id] || 'none'}
                        onValueChange={(value) => {
                          setCheckoutUnitAssignments((prev) => ({
                            ...prev,
                            [item.id]: value === 'none' ? '' : value,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select at handover</SelectItem>
                          {(checkoutAvailableUnits[item.id] || []).map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.serialNumber}
                              {unit.metadata?.plateNumber ? ` (${unit.metadata.plateNumber})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="checkout-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Hand Over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={damageModalOpen} onOpenChange={setDamageModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Damage</DialogTitle>
            <DialogDescription>
              This creates an expense awaiting approval for the repair cost.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...damageForm}>
              <form
                id="damage-form"
                onSubmit={damageForm.handleSubmit(onDamageSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={damageForm.control}
                  name="rentalItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select the damaged item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(actionRental?.items || []).map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.product?.name || 'Rental item'} × {item.quantity}
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
                    control={damageForm.control}
                    name="damageType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Damage Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select damage type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DAMAGE_TYPE_OPTIONS.map((option) => (
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
                    control={damageForm.control}
                    name="severity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Severity</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DAMAGE_SEVERITY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={damageForm.control}
                  name="estimatedRepairCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Repair Cost</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={damageForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel>Photos (optional)</FormLabel>
                  <FileUpload
                    accept="image/*"
                    maxSizeMB={10}
                    uploading={damagePhotoUploading}
                    disabled={submitting}
                    onFileSelect={handleDamagePhotoSelect}
                    onFileRemove={handleDamagePhotoRemove}
                    uploadedFiles={damagePhotoUrls.map((url, index) => ({
                      url,
                      originalName: `Damage photo ${index + 1}`,
                    }))}
                    emptyMessage="No damage photos uploaded yet."
                  />
                </FormItem>
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDamageModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="damage-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Report Damage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund Security Deposit</DialogTitle>
            <DialogDescription>
              Refund up to {formatAmount(refundMaxAmount)} to the customer. A refund payment
              record is created in Payments for reconciliation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...refundForm}>
              <form
                id="refund-form"
                onSubmit={refundForm.handleSubmit(onRefundSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={refundForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refund amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0.01}
                          max={refundMaxAmount}
                          step="0.01"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={refundForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refund method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.filter((o) => o.value !== 'credit').map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={refundForm.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference number (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MoMo transaction ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={refundForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="e.g. No damage on return, customer pickup refund"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="refund-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Refund deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hirePaymentModalOpen} onOpenChange={setHirePaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record rental payment</DialogTitle>
            <DialogDescription>
              Record up to {formatAmount(hirePaymentMaxAmount)} toward this rental invoice.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...hirePaymentForm}>
              <form
                id="hire-payment-form"
                onSubmit={hirePaymentForm.handleSubmit(onHirePaymentSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={hirePaymentForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0.01}
                          max={hirePaymentMaxAmount}
                          step="0.01"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={hirePaymentForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.filter((option) => option.value !== 'credit').map((option) => (
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
                  control={hirePaymentForm.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference number (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MoMo transaction ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={hirePaymentForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHirePaymentModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="hire-payment-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={collectDepositModalOpen} onOpenChange={setCollectDepositModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Collect Remaining Deposit</DialogTitle>
            <DialogDescription>
              Collect up to {formatAmount(collectMaxAmount)} still owed on this rental.
              A held deposit payment is recorded for reconciliation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...collectDepositForm}>
              <form
                id="collect-deposit-form"
                onSubmit={collectDepositForm.handleSubmit(onCollectDepositSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={collectDepositForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount collected now</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0.01}
                          max={collectMaxAmount}
                          step="0.01"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Balance due: {formatAmount(Math.max(0, collectMaxAmount - Number(field.value || 0)))}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={collectDepositForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.filter((option) => option.value !== 'credit').map((option) => (
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
                  control={collectDepositForm.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference number (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MoMo transaction ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollectDepositModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="collect-deposit-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Collect deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waiveModalOpen} onOpenChange={setWaiveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Waive Late Charge</DialogTitle>
            <DialogDescription>
              {waiveCharge ? (
                <>
                  Waive {formatAmount(waiveCharge.totalCharge)} for{' '}
                  {waiveCharge.daysLate} day{waiveCharge.daysLate === 1 ? '' : 's'} late. This
                  updates the rental total and syncs the invoice when one exists.
                </>
              ) : (
                'Provide a reason for waiving this late charge.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...waiveForm}>
              <form
                id="waive-form"
                onSubmit={waiveForm.handleSubmit(onWaiveSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={waiveForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="e.g. Customer called ahead, first-time grace, equipment issue on our side"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWaiveModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="waive-form" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Waive Charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preBookingModalOpen} onOpenChange={setPreBookingModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Pre-booking</DialogTitle>
            <DialogDescription>
              Reserve inventory for a future rental. Confirm when the customer is ready to hire.
              {!effectiveBranchId ? (
                <span className="mt-2 block text-destructive">
                  No branch is configured yet. Complete workspace setup or add a location before creating pre-bookings.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...preBookingForm}>
              <form
                id="pre-booking-form"
                onSubmit={preBookingForm.handleSubmit(onPreBookingSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={preBookingForm.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
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
                    control={preBookingForm.control}
                    name="requestedStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={preBookingForm.control}
                    name="requestedEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addPreBookingLineItem}>
                      <Plus className="h-4 w-4" />
                      <span className="ml-2">Add item</span>
                    </Button>
                  </div>

                  {preBookingLineItems.map((line, index) => {
                    const availabilityMessage = getPreBookingLineAvailabilityMessage(line);
                    const availabilityResult = line.productId
                      ? preBookingAvailabilityByProductId.get(line.productId)
                      : null;

                    return (
                      <div
                        key={index}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px_auto] gap-2 items-end border border-border rounded-md p-3"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Product</Label>
                          <Select
                            value={line.productId}
                            onValueChange={(v) => updatePreBookingLineItem(index, { productId: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {availabilityResult && !availabilityMessage && line.productId ? (
                            <p className="text-xs text-muted-foreground">
                              {availabilityResult.availableQty} available for these dates
                            </p>
                          ) : null}
                          {availabilityMessage ? (
                            <p className="text-xs text-destructive">{availabilityMessage}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updatePreBookingLineItem(index, { quantity: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Rate/day</Label>
                          <p className="h-10 flex items-center text-sm font-medium tabular-nums">
                            {line.productId
                              ? `${formatAmount(line.requestedRatePerDay)}/day`
                              : '—'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePreBookingLineItem(index)}
                          disabled={preBookingLineItems.length === 1}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}

                  {preBookingLineItemsError && (
                    <p className="text-sm text-destructive">{preBookingLineItemsError}</p>
                  )}
                  {hasPreBookingAvailabilityIssues && !preBookingLineItemsError ? (
                    <p className="text-sm text-destructive">
                      Adjust quantities or dates — insufficient stock for one or more items.
                    </p>
                  ) : null}
                </div>

                <FormField
                  control={preBookingForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {preBookingDays} day{preBookingDays === 1 ? '' : 's'} · estimated proforma
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatAmount(preBookingEstimatedTotal)}
                  </span>
                </div>
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreBookingModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="pre-booking-form"
              disabled={submitting || !canSubmitPreBooking}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {preBookingAvailabilityLoading ? 'Checking availability…' : 'Create Pre-booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPreBookingOpen} onOpenChange={setConfirmPreBookingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Pre-booking</DialogTitle>
            <DialogDescription>
              This converts the pre-booking into a rental and releases the reservation hold onto an
              active rental record. Availability is checked again before confirming.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {actionPreBooking ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="text-foreground font-medium">
                    {actionPreBooking.customer?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Period</span>
                  <span className="text-foreground font-medium">
                    {actionPreBooking.requestedStartDate
                      ? dayjs(actionPreBooking.requestedStartDate).format('MMM DD, YYYY')
                      : '—'}
                    {' → '}
                    {actionPreBooking.requestedEndDate
                      ? dayjs(actionPreBooking.requestedEndDate).format('MMM DD, YYYY')
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Estimated total</span>
                  <span className="text-foreground font-semibold">
                    {formatAmount(getPreBookingEstimatedTotal(actionPreBooking))}
                  </span>
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmPreBookingOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmPreBooking} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm & convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelPreBookingOpen} onOpenChange={setCancelPreBookingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Pre-booking</DialogTitle>
            <DialogDescription>
              This releases the reserved inventory. Cancelled pre-bookings cannot be confirmed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelPreBookingOpen(false)}
              disabled={submitting}
            >
              Keep pre-booking
            </Button>
            <Button onClick={handleCancelPreBooking} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel pre-booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfModalOpen} onOpenChange={(open) => { if (!open) closePdfModal(); else setPdfModalOpen(true); }}>
        <DialogContent className="max-w-[100vw] sm:max-w-6xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button]:no-print">
          <DialogHeader className="px-3 sm:px-6 py-3 border-b flex-shrink-0 text-left no-print">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <DialogTitle>
                  {pdfDocumentType === 'agreement'
                    ? 'Rental Agreement'
                    : pdfDocumentType === 'return_inspection'
                      ? 'Return Inspection'
                      : 'Invoice'}
                </DialogTitle>
                <DialogDescription className="sr-only sm:not-sr-only">
                  Preview, download, or print this document
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto no-print">
                {pdfDocumentType === 'invoice' && (
                  <PrintFormatSwitcher value={rentalInvoicePrintFormat} onChange={setRentalInvoicePrintFormat} />
                )}
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                  onClick={handleDownloadRentalPdf}
                  disabled={!pdfDocument && !invoiceForPrint}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  className="flex-1 sm:flex-initial"
                  onClick={handlePrintRentalPdf}
                  disabled={!pdfDocument && !invoiceForPrint}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-2 sm:p-4">
            <div
              ref={printPreviewRef}
              className="w-full max-w-full sm:max-w-[900px] sm:mx-auto"
            >
              {pdfDocumentType === 'agreement' && pdfDocument ? (
                <PrintableRentalAgreement document={pdfDocument} />
              ) : null}
              {pdfDocumentType === 'return_inspection' && pdfDocument ? (
                <PrintableRentalReturnInspection document={pdfDocument} />
              ) : null}
              {pdfDocumentType === 'invoice' && invoiceForPrint ? (
                <PrintableInvoice
                  invoice={invoiceForPrint}
                  organization={invoiceForPrint.organization || {}}
                  screenLayout={isMobile ? 'mobile' : 'auto'}
                  printConfig={rentalInvoicePrintConfig}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Rentals;

