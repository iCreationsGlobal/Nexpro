import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const POS = lazy(() => import('./POS'));
import { useDebounce } from '../hooks/useDebounce';
import { usePOSConfig } from '../hooks/usePOSConfig';
import { usePrintFormatOverride } from '../hooks/usePrintFormatOverride';
import { getContentWidthMm } from '../utils/printStyles';
import PrintFormatSwitcher from '../components/PrintFormatSwitcher';
import { useResponsive } from '../hooks/useResponsive';
import { ShoppingCart, Filter, RefreshCw, Printer, Receipt, FileText, Loader2, X, CheckCircle, Clock, XCircle, Download, Plus, Trash2, Undo2 } from 'lucide-react';
import { generatePDF, openPrintDialog } from '../utils/pdfUtils';
import saleService from '../services/saleService';
import customerService from '../services/customerService';
import invoiceService from '../services/invoiceService';
import settingsService from '../services/settingsService';
import { mergeBranchOrganization } from '../utils/branchOrganization';
import { getSalePartyLabel, getSalePartyDetails, isDealerSale } from '../utils/saleParty';
import productService from '../services/productService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import PrintableReceipt from '../components/PrintableReceipt';
import PrintableInvoice from '../components/PrintableInvoice';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import FeatureNotAvailable from '../components/FeatureNotAvailable';
import SaleReturnWizard from '../components/sales/SaleReturnWizard';
import SaleReturnsPanel from '../components/sales/SaleReturnsPanel';
import { getSaleReturnBadgeStatuses, canStartSaleReturn } from '../utils/saleReturnBadges';
import { showSuccess, showError } from '../utils/toast';
import { resolvePaymentNotePayload } from '../utils/paymentNotes';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount } from '../utils/formatNumber';
import { QUERY_STALE, refreshAfterSale } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { DatePicker } from '@/components/ui/date-picker';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { numberInputValue, handleNumberChange, numberOrEmptySchema } from '../utils/formUtils';
import { DELIVERY_STATUS_ORDER, DELIVERY_STATUS_LABELS, ORDER_STATUSES, SHOP_TYPES } from '../constants';
import { EMPTY_STATES, FEATURE_NOT_AVAILABLE } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';

const ACTIVE_KITCHEN_ORDER_STATUSES = [
  ORDER_STATUSES.RECEIVED,
  ORDER_STATUSES.PREPARING,
  ORDER_STATUSES.READY,
];

const recordPaymentSchema = z.object({
  amount: numberOrEmptySchema(z).refine((v) => v >= 0.01, 'Payment amount must be greater than 0'),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

const getSaleItemVariantLabel = (item) => {
  const variant = item?.variant;
  if (!variant) return '';
  const attributeText = Object.values(variant.attributes || {})
    .filter(Boolean)
    .join(' / ');
  return variant.name || attributeText || variant.sku || '';
};

const getSaleItemCatalogUnitPrice = (item) => {
  const value = item?.metadata?.catalogUnitPrice
    ?? item?.metadata?.originalUnitPrice
    ?? item?.catalogUnitPrice
    ?? item?.originalUnitPrice
    ?? null;
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
};

const isSaleItemPriceOverridden = (item) => item?.metadata?.priceOverridden === true || item?.priceOverridden === true;

const getSaleDelivery = (sale) => {
  const metadataDelivery = sale?.metadata?.delivery || {};
  const fee = Number(sale?.deliveryFee ?? metadataDelivery.fee ?? 0);
  const required = sale?.deliveryRequired === true || metadataDelivery.required === true || fee > 0;
  if (!required) return null;
  return {
    fee: Number.isFinite(fee) ? fee : 0,
    bandId: sale?.deliveryBandId || metadataDelivery.bandId || '',
    label: metadataDelivery.label || sale?.deliveryBand?.label || '',
    minKm: metadataDelivery.minKm,
    maxKm: metadataDelivery.maxKm,
  };
};

const getKitchenQueueStatus = (sale) => {
  if (sale?.kitchenQueueStatus && ACTIVE_KITCHEN_ORDER_STATUSES.includes(sale.kitchenQueueStatus)) {
    return sale.kitchenQueueStatus;
  }
  if (sale?.isActiveKitchenOrder === true && ACTIVE_KITCHEN_ORDER_STATUSES.includes(sale.orderStatus)) {
    return sale.orderStatus;
  }
  return null;
};

const EMPTY_SALES_SUMMARY = {
  completedCount: 0,
  pendingCount: 0,
  kitchenPendingCount: 0,
  completedRevenue: 0,
};

const normalizeSalesResponse = (response) => {
  const payload = response?.data?.data != null ? response.data : response;
  const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
  const summary = payload?.summary || {};

  return {
    sales: data,
    total: Number(payload?.count ?? data.length),
    summary: {
      completedCount: Number(summary.completedCount || EMPTY_SALES_SUMMARY.completedCount),
      pendingCount: Number(summary.pendingCount || EMPTY_SALES_SUMMARY.pendingCount),
      kitchenPendingCount: Number(summary.kitchenPendingCount || EMPTY_SALES_SUMMARY.kitchenPendingCount),
      completedRevenue: Number(summary.completedRevenue || EMPTY_SALES_SUMMARY.completedRevenue),
    },
  };
};

const Sales = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { isMobile } = useResponsive();
  const salesTab = location.pathname.endsWith('/returns') ? 'returns' : 'sales';
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [saleForPayment, setSaleForPayment] = useState(null);
  const [filters, setFilters] = useState({ 
    status: 'all',
    customerId: 'all',
    paymentMethod: 'all',
    startDate: null,
    endDate: null
  });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingSale, setViewingSale] = useState(null);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [saleActivities, setSaleActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingSaleDetails, setLoadingSaleDetails] = useState(false);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState(null);
  const [deleteSaleReason, setDeleteSaleReason] = useState('');
  const [deletingSale, setDeletingSale] = useState(false);
  const [updatingSaleDelivery, setUpdatingSaleDelivery] = useState(false);
  const [returnSale, setReturnSale] = useState(null);
  const { activeTenant, activeTenantId, isAdmin, isManager } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const queryClient = useQueryClient();
  const businessType = activeTenant?.businessType || 'printing_press';
  const isShop = businessType === 'shop' || businessType === 'rental';
  const isRestaurant =
    isShop &&
    (activeTenant?.metadata?.businessSubType ||
      activeTenant?.metadata?.shopType) === SHOP_TYPES.RESTAURANT;
  const salesQueryEnabled = !!activeTenantId && isShop && (!shopContext?.isShopWorkspace || !!activeShopId) && salesTab === 'sales';

  const salesQueryParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };
    if (filters.status !== 'all') params.status = filters.status;
    if (filters.customerId !== 'all') params.customerId = filters.customerId;
    if (filters.startDate) params.startDate = dayjs(filters.startDate).format('YYYY-MM-DD');
    if (filters.endDate) params.endDate = dayjs(filters.endDate).format('YYYY-MM-DD');
    return params;
  }, [
    pagination.current,
    pagination.pageSize,
    filters.status,
    filters.customerId,
    filters.startDate,
    filters.endDate,
  ]);

  const {
    data: salesQueryResponse,
    error: salesQueryError,
    isError: salesQueryIsError,
    isFetching: salesIsFetching,
    isLoading: loading,
    refetch: refetchSalesQuery,
  } = useQuery({
    queryKey: queryKeys.sales.list(activeTenantId, activeShopId, salesQueryParams),
    queryFn: () => saleService.getSales(salesQueryParams),
    enabled: salesQueryEnabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const salesQueryData = useMemo(() => normalizeSalesResponse(salesQueryResponse), [salesQueryResponse]);
  const sales = salesQueryData.sales;
  const totalSalesCount = salesQueryData.total;
  const salesSummary = salesQueryData.summary;
  const refreshingSales = salesIsFetching && !loading;

  const { data: customersResponse } = useQuery({
    queryKey: queryKeys.customers.picker(activeTenantId, activeShopId, null, 'sales-filter'),
    queryFn: () => customerService.getAll({ limit: 100 }),
    enabled: salesQueryEnabled,
    staleTime: QUERY_STALE.LIST,
  });

  const customers = useMemo(
    () => customersResponse?.data || [],
    [customersResponse]
  );

  const refetchSales = useCallback(async () => {
    await refetchSalesQuery();
  }, [refetchSalesQuery]);

  useEffect(() => {
    if (salesQueryIsError) {
      showError(salesQueryError, 'Failed to load sales');
    }
  }, [salesQueryIsError, salesQueryError]);

  const recordPaymentForm = useForm({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: 'cash',
      paymentDate: new Date(),
      referenceNumber: '',
      notes: '',
    },
  });

  // Check if tenant has products (to show appropriate empty state)
  const { data: productsData } = useQuery({
    queryKey: queryKeys.products.active(activeTenantId, activeShopId),
    queryFn: () => productService.getAllActiveProducts(),
    enabled: !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId),
    staleTime: QUERY_STALE.LIST,
  });
  const hasProducts = useMemo(() => {
    const products = Array.isArray(productsData) ? productsData : (productsData?.products ?? []);
    return products.length > 0;
  }, [productsData]);

  const handleClearFilters = useCallback(() => {
    setFilters({
      status: 'all',
      customerId: 'all',
      paymentMethod: 'all',
      startDate: null,
      endDate: null,
    });
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.status !== 'all' ||
      filters.customerId !== 'all' ||
      filters.paymentMethod !== 'all' ||
      !!filters.startDate ||
      !!filters.endDate,
    [filters]
  );

  const salesEmptyState = useMemo(() => {
    if (!hasProducts) {
      return getEmptyStateProps(EMPTY_STATES.SALES_NO_PRODUCTS, {
        primary: () => navigate('/products?add=1'),
      });
    }
    if (hasActiveFilters) {
      return getEmptyStateProps(EMPTY_STATES.SALES_FILTERED, {
        primary: handleClearFilters,
      });
    }
    return getEmptyStateProps(EMPTY_STATES.SALES, {
      primary: () => setPosModalOpen(true),
    });
  }, [hasProducts, hasActiveFilters, navigate, handleClearFilters]);

  // Stats use API summary across the full filtered result set (not the current table page).
  // Completed/revenue follow sale.status. Restaurant kitchen pending follows the active Kitchen Orders queue.
  const completedCount = useMemo(
    () => Number(salesSummary.completedCount || 0),
    [salesSummary.completedCount]
  );
  const pendingCount = useMemo(
    () => Number(isRestaurant ? salesSummary.kitchenPendingCount : salesSummary.pendingCount) || 0,
    [isRestaurant, salesSummary.kitchenPendingCount, salesSummary.pendingCount]
  );
  const totalRevenueCompleted = useMemo(
    () => Number(salesSummary.completedRevenue || 0),
    [salesSummary.completedRevenue]
  );

  const fetchSaleDetails = useCallback(async (saleId) => {
    setLoadingSaleDetails(true);
    try {
      const response = await saleService.getSaleById(saleId);
      const sale = response?.data?.data || response?.data || response;
      setViewingSale((prev) => (prev?.id === saleId ? sale : prev));
    } catch (error) {
      showError(error, 'Failed to load sale details');
    } finally {
      setLoadingSaleDetails(false);
    }
  }, []);

  const fetchSaleActivities = useCallback(async (saleId) => {
    setLoadingActivities(true);
    try {
      const response = await saleService.getActivities(saleId);
      const activities = response?.data?.data || response?.data || [];
      setSaleActivities(activities);
    } catch (error) {
      console.error('Failed to load sale activities:', error);
      setSaleActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  // Fetch organization settings for receipt branding
  const { data: organizationData } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganization(),
    staleTime: QUERY_STALE.METADATA,
  });

  const organization = organizationData?.data?.data || organizationData?.data || {};

  const receiptOrganization = useMemo(() => {
    if (!receiptData) return organization;
    if (receiptData.invoice?.organization) return receiptData.invoice.organization;
    return mergeBranchOrganization(receiptData.shop, organization);
  }, [receiptData, organization]);
  const { posConfig } = usePOSConfig();
  const {
    printConfig,
    format: receiptPrintFormat,
    setFormat: setReceiptPrintFormat,
  } = usePrintFormatOverride(posConfig.print, receiptData?.id || receiptData?.invoice?.id);

  useEffect(() => {
    if (viewingSale?.id) {
      fetchSaleActivities(viewingSale.id);
    }
  }, [viewingSale?.id, fetchSaleActivities]);

  useEffect(() => {
    if (searchParams.get('openPOS') === '1') {
      setPosModalOpen(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('openPOS');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleView = useCallback((sale) => {
    setViewingSale(sale);
    setDrawerVisible(true);
    fetchSaleDetails(sale.id);
  }, [fetchSaleDetails]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false);
    setViewingSale(null);
    setSaleActivities([]);
  }, []);

  const handleSaleDeliveryChange = useCallback(
    async (value) => {
      if (!viewingSale) return;
      const val = value === '__none__' ? null : value;
      try {
        setUpdatingSaleDelivery(true);
        await saleService.updateDeliveryStatus(viewingSale.id, val);
        await refreshAfterSale(queryClient);
        await fetchSaleDetails(viewingSale.id);
        showSuccess('Delivery status updated');
        refetchSales();
      } catch (error) {
        showError(error?.response?.data?.message || error?.message || 'Failed to update delivery status');
      } finally {
        setUpdatingSaleDelivery(false);
      }
    },
    [viewingSale, fetchSaleDetails, refetchSales, queryClient]
  );

  const handlePrintReceipt = useCallback(async (sale) => {
    // Use already-loaded viewingSale when drawer is open (avoids redundant fetch)
    if (viewingSale?.id === sale.id && viewingSale.items && (!sale.invoiceId || viewingSale.invoice?.customer)) {
      let printableSale = viewingSale;
      if (printableSale.invoice?.id && !printableSale.invoice?.organization) {
        try {
          const invoiceResponse = await invoiceService.getById(printableSale.invoice.id);
          const invoice = invoiceResponse?.data?.data || invoiceResponse?.data || invoiceResponse;
          printableSale = { ...printableSale, invoice };
        } catch (error) {
          console.error('Failed to load invoice organization for receipt:', error);
        }
      }
      setReceiptData(printableSale);
      setPrintModalVisible(true);
      return;
    }
    setLoadingReceipt(true);
    try {
      const response = await saleService.getSaleById(sale.id);
      let saleData = response?.data?.data || response?.data || response;
      if (saleData.invoice?.id && !saleData.invoice?.organization) {
        const invoiceResponse = await invoiceService.getById(saleData.invoice.id);
        const invoice = invoiceResponse?.data?.data || invoiceResponse?.data || invoiceResponse;
        saleData = { ...saleData, invoice };
      }
      setReceiptData(saleData);
      setPrintModalVisible(true);
    } catch (error) {
      showError(error, 'Failed to load receipt data');
    } finally {
      setLoadingReceipt(false);
    }
  }, [viewingSale]);

  const handleViewInvoice = useCallback((sale) => {
    if (!sale.invoiceId) return;
    // Close the sale drawer first so Radix Sheet can release body pointer-events
    // before we navigate to Invoices (otherwise sidebar clicks stop working).
    setDrawerVisible(false);
    setViewingSale(null);
    const invoiceId = sale.invoiceId;
    window.setTimeout(() => {
      navigate('/invoices', { state: { openInvoiceId: invoiceId } });
    }, 0);
  }, [navigate]);

  const handleDeleteSale = useCallback(async (id, reason) => {
    setDeletingSale(true);
    try {
      await saleService.deleteSale(id, reason);
      showSuccess('Sale deleted successfully');
      await refreshAfterSale(queryClient);
      refetchSales();
      setSaleToDelete(null);
      setDeleteSaleReason('');
      if (viewingSale?.id === id) {
        setDrawerVisible(false);
        setViewingSale(null);
        setSaleActivities([]);
      }
    } catch (error) {
      showError(error, 'Failed to delete sale');
    } finally {
      setDeletingSale(false);
    }
  }, [viewingSale?.id, refetchSales, queryClient]);

  const handleStatusUpdate = useCallback(async (sale, newStatus) => {
    try {
      await saleService.updateSale(sale.id, { status: newStatus });
      showSuccess('Sale status updated successfully');
      await refreshAfterSale(queryClient);
      refetchSales();
      if (viewingSale?.id === sale.id) {
        await fetchSaleDetails(sale.id);
      }
    } catch (error) {
      showError(error, 'Failed to update sale status');
    }
  }, [fetchSaleDetails, queryClient, refetchSales, viewingSale?.id]);

  const handleOpenRecordPayment = useCallback((sale) => {
    const total = parseFloat(sale.total || 0);
    const amountPaid = parseFloat(sale.amountPaid || 0);
    const balanceDue = Math.max(total - amountPaid, 0);
    if (balanceDue <= 0) {
      showSuccess('This sale is already fully paid.');
      return;
    }
    setSaleForPayment(sale);
    recordPaymentForm.reset({
      amount: balanceDue,
      paymentMethod: sale.paymentMethod || 'cash',
      paymentDate: new Date(),
      referenceNumber: '',
      notes: '',
    });
  }, [recordPaymentForm]);

  const handleRecordPaymentSubmit = useCallback(async (values) => {
    if (!saleForPayment) return;
    try {
      await saleService.recordPayment(saleForPayment.id, {
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        referenceNumber: values.referenceNumber || undefined,
        paymentDate: values.paymentDate,
        notes: resolvePaymentNotePayload(values),
      });
      showSuccess('Payment recorded successfully');
      setSaleForPayment(null);
      await refreshAfterSale(queryClient);
      refetchSales();
      if (viewingSale?.id === saleForPayment.id) {
        await fetchSaleDetails(saleForPayment.id);
      }
    } catch (error) {
      showError(error, 'Failed to record payment');
    }
  }, [saleForPayment, viewingSale?.id, refetchSales, fetchSaleDetails, queryClient]);

  const paymentMethodLabels = {
    cash: 'Cash',
    card: 'Card',
    mobile_money: 'Mobile Money',
    bank_transfer: 'Bank Transfer',
    credit: 'Credit',
    other: 'Other'
  };

  const statusLabels = {
    pending: 'Pending',
    partially_paid: 'Partially paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded'
  };

  const tableColumns = useMemo(() => [
    {
      key: 'saleNumber',
      label: 'Sale Number',
      render: (_, record) => <span className="text-foreground font-medium">{record.saleNumber}</span>
    },
    {
      key: 'customer',
      label: 'Customer / Dealer',
      render: (_, record) => (
        <span className="text-foreground">
          {getSalePartyLabel(record)}
        </span>
      )
    },
    {
      key: 'total',
      label: 'Total',
      render: (_, record) => (
        <span className="text-foreground font-medium">
          {formatAmount(record.total)}
        </span>
      )
    },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      render: (_, record) => (
        <Badge variant="outline" className="text-foreground">
          {paymentMethodLabels[record.paymentMethod] || record.paymentMethod}
        </Badge>
      )
    },
    {
      key: 'status',
      label: isRestaurant ? 'Payment' : 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => {
        const returnBadges = getSaleReturnBadgeStatuses(record).filter((b) => b !== record.status);
        return (
          <div className="flex flex-wrap gap-1 items-center">
            <StatusChip status={record.status} />
            {returnBadges.map((badge) => (
              <StatusChip key={badge} status={badge} />
            ))}
          </div>
        );
      }
    },
    ...(isRestaurant ? [{
      key: 'orderStatus',
      label: 'Kitchen',
      render: (_, record) => {
        const queueStatus = getKitchenQueueStatus(record);
        return queueStatus ? (
          <StatusChip status={queueStatus} />
        ) : record.orderStatus ? (
          <span className="text-muted-foreground text-sm">Not in queue</span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        );
      }
    }] : []),
    {
      key: 'createdAt',
      label: 'Date',
      render: (_, record) => (
        <span className="text-foreground">
          {dayjs(record.createdAt).format('MMM DD, YYYY')}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleView}
          extraActions={
            canStartSaleReturn(record, { isManager })
              ? [{
                  label: 'Return / Exchange',
                  icon: <Undo2 className="h-4 w-4" />,
                  onClick: () => setReturnSale(record),
                }]
              : []
          }
        />
      )
    }
  ], [handleView, isRestaurant, isManager]);

  const drawerFields = useMemo(() => viewingSale ? [
    { label: 'Sale Number', value: viewingSale.saleNumber },
    {
      label: isDealerSale(viewingSale) ? 'Dealer' : 'Customer',
      value: (() => {
        const party = getSalePartyDetails(viewingSale);
        if (party.type === 'walk_in') return 'Walk-in Customer';
        return (
          <div>
            <div className="font-medium">{party.name}</div>
            {party.company && (
              <div className="text-muted-foreground text-sm">{party.company}</div>
            )}
            {party.phone && (
              <div className="text-muted-foreground text-sm">{party.phone}</div>
            )}
            {party.email && (
              <div className="text-muted-foreground text-sm">{party.email}</div>
            )}
          </div>
        );
      })()
    },
    {
      label: 'Status',
      value: (
        <div className="flex flex-wrap gap-1 items-center justify-end">
          <StatusChip status={viewingSale.status} />
          {getSaleReturnBadgeStatuses(viewingSale)
            .filter((b) => b !== viewingSale.status)
            .map((badge) => (
              <StatusChip key={badge} status={badge} />
            ))}
        </div>
      )
    },
    {
      label: 'Payment Method',
      value: <Badge variant="outline">{paymentMethodLabels[viewingSale.paymentMethod] || viewingSale.paymentMethod}</Badge>
    },
    {
      label: 'Subtotal',
      value: formatAmount(viewingSale.subtotal)
    },
    {
      label: 'Discount',
      value: formatAmount(viewingSale.discount)
    },
    {
      label: 'Tax',
      value: formatAmount(viewingSale.tax)
    },
    getSaleDelivery(viewingSale) && {
      label: 'Delivery',
      value: (() => {
        const delivery = getSaleDelivery(viewingSale);
        return (
          <div>
            <div className="font-medium">{formatAmount(delivery.fee)}</div>
            <div className="text-muted-foreground text-sm">
              {delivery.label || delivery.bandId || 'Delivery band'}
              {delivery.minKm != null && delivery.maxKm != null ? ` (${delivery.minKm}-${delivery.maxKm} km)` : ''}
            </div>
          </div>
        );
      })()
    },
    {
      label: 'Total',
      value: (
        <strong className="text-lg text-primary">
          {formatAmount(viewingSale.total)}
        </strong>
      )
    },
    {
      label: 'Amount Paid',
      value: formatAmount(viewingSale.amountPaid)
    },
    viewingSale.change > 0 && {
      label: 'Change',
      value: formatAmount(viewingSale.change)
    },
    viewingSale.shop && {
      label: 'Shop',
      value: viewingSale.shop.name
    },
    viewingSale.seller && {
      label: 'Sold By',
      value: viewingSale.seller.name
    },
    {
      label: 'Date',
      value: dayjs(viewingSale.createdAt).format('MMM DD, YYYY [at] h:mm A')
    },
    viewingSale.invoiceId && {
      label: 'Invoice',
      value: (
        <Button
          variant="link"
          onClick={() => handleViewInvoice(viewingSale)}
          className="p-0 h-auto"
        >
          View Invoice
        </Button>
      )
    },
    viewingSale.notes && { label: 'Notes', value: viewingSale.notes }
  ].filter(Boolean) : [], [viewingSale, handleViewInvoice]);

  if (!isShop) {
    return (
      <div className="px-6 py-4 md:p-6 space-y-4 md:space-y-6">
        <WelcomeSection
          welcomeMessage="Sales"
          subText="Track and manage your sales transactions."
        />
        <FeatureNotAvailable
          icon="ShoppingCart"
          title={FEATURE_NOT_AVAILABLE.SHOP_ONLY.title}
          description={FEATURE_NOT_AVAILABLE.SHOP_ONLY.description}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Sales"
          subText="Track and manage your sales transactions."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          {salesTab === 'sales' && (
            <>
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setFilterDrawerOpen(true)} size={isMobile ? "icon" : "default"}>
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter sales by status, customer, or date</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={refetchSales}
                disabled={refreshingSales}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingSales ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload sales list</TooltipContent>
          </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => setPosModalOpen(true)} className="flex-1 min-w-0 md:flex-none">
                <ShoppingCart className="h-4 w-4" />
                <span className="ml-2">Point of Sale</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Point of Sale to record a new sale or scan products</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Tabs
        value={salesTab}
        onValueChange={(value) => {
          navigate(value === 'returns' ? '/sales/returns' : '/sales');
        }}
      >
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
      </Tabs>

      {salesTab === 'returns' ? (
        <SaleReturnsPanel />
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total sales matching your current filters, across all pages"
          title="Total Sales"
          value={totalSalesCount}
          subtitle="All filtered sales"
          icon={ShoppingCart}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
          loading={loading}
        />
        <DashboardStatsCard
          tooltip={isRestaurant ? 'Paid sales (Payment column). Counts completed sales matching your filters, across all pages.' : 'Sales that have been paid and completed across all filtered results'}
          title="Completed"
          value={completedCount}
          subtitle="Completed filtered sales"
          icon={CheckCircle}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
          loading={loading}
        />
        <DashboardStatsCard
          tooltip={isRestaurant ? 'Active kitchen orders today (Received, Preparing, or Ready). Matches Kitchen Orders — not payment status or list filters.' : 'Sales with no payment received yet, across all filtered results'}
          title={isRestaurant ? 'Pending (in kitchen)' : 'Pending'}
          value={pendingCount}
          subtitle={isRestaurant ? 'Active kitchen orders today' : 'Unpaid filtered sales'}
          icon={Clock}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
          loading={loading}
        />
        <DashboardStatsCard
          tooltip="Revenue from completed sales only (matches Dashboard). Counts all matching sales, not only this page."
          title="Total Revenue"
          value={formatAmount(totalRevenueCompleted)}
          subtitle="Completed sales only"
          icon={Receipt}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
          loading={loading}
        />
      </div>

      <DashboardTable
        data={sales}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={salesEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination((prev) => ({
            ...prev,
            current: newPagination.current,
            pageSize: newPagination.pageSize,
          }));
        }}
        externalPagination={{
          current: pagination.current,
          total: totalSalesCount
        }}
        viewMode={tableViewMode}
        onViewModeChange={setTableViewMode}
        getCardImage={(sale) => {
          const firstItemWithImage = sale?.items?.find(
            (i) => i?.product?.imageUrl
          );
          const url = firstItemWithImage?.product?.imageUrl;
          return url ? resolveImageUrl(url) : null;
        }}
      />
      </>
      )}

      <Dialog
        open={posModalOpen}
        onOpenChange={(open) => {
          setPosModalOpen(open);
          if (!open) refetchSales();
        }}
      >
        <DialogContent
          className="!left-0 !top-0 !translate-x-0 !translate-y-0 !w-[100vw] !h-[100dvh] !max-w-[100vw] !max-h-[100dvh] !min-h-0 !p-0 !gap-0 overflow-hidden flex flex-col rounded-none border-0"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Point of Sale</DialogTitle>
          <DialogDescription className="sr-only">
            Quick checkout and sales processing
          </DialogDescription>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-10 w-10 animate-spin text-brand" />
                </div>
              }
            >
              {posModalOpen && <POS />}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Sales</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6 pb-4">
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
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partially_paid">Partially paid</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
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
                  {customers.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={filters.paymentMethod}
                onValueChange={(value) => setFilters({ ...filters, paymentMethod: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <DatePicker
                date={filters.startDate}
                onDateChange={(date) => setFilters({ ...filters, startDate: date })}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <DatePicker
                date={filters.endDate}
                onDateChange={(date) => setFilters({ ...filters, endDate: date })}
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setFilters({
                  status: 'all',
                  customerId: 'all',
                  paymentMethod: 'all',
                  startDate: null,
                  endDate: null
                });
              }}
            >
              Clear Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!saleForPayment} onOpenChange={(open) => !open && setSaleForPayment(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Enter the amount received (partial or full). Sale will be marked completed when fully paid.
            </DialogDescription>
          </DialogHeader>
          {saleForPayment && (() => {
            const total = parseFloat(saleForPayment.total || 0);
            const amountPaid = parseFloat(saleForPayment.amountPaid || 0);
            const balanceDue = Math.max(total - amountPaid, 0);
            const isFullyPaid = balanceDue <= 0;
            return (
              <>
                <DialogBody>
                  <div className="space-y-6">
                    {/* Sale summary — clear card with balance due prominent */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-muted-foreground">Sale</span>
                        <span className="font-medium text-right">{saleForPayment.saleNumber}</span>
                      </div>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-muted-foreground">Customer</span>
                        <span className="font-medium text-right">{saleForPayment.customer?.name || 'Walk-in'}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Total</span>
                        <span>{formatAmount(total)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Amount paid</span>
                        <span>{formatAmount(amountPaid)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-4 pt-1">
                        <span className="font-medium text-foreground">Balance due</span>
                        <span className={`text-lg font-semibold ${balanceDue > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatAmount(balanceDue)}
                        </span>
                      </div>
                    </div>

                    {isFullyPaid ? (
                      <p className="text-sm text-muted-foreground py-2">
                        This sale is already fully paid. No payment to record.
                      </p>
                    ) : (
                      <Form {...recordPaymentForm}>
                        <form
                          id="record-payment-form"
                          onSubmit={recordPaymentForm.handleSubmit(handleRecordPaymentSubmit)}
                          className="space-y-5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                            <FormField
                              control={recordPaymentForm.control}
                              name="amount"
                              rules={[
                                {
                                  validate: (value) => {
                                    if (value > balanceDue) return 'Amount exceeds balance due';
                                    return true;
                                  },
                                },
                              ]}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Payment amount</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">₵</span>
                                      <Input
                                        type="number"
                                        min={0.01}
                                        max={balanceDue}
                                        step={0.01}
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="pl-8"
                                        value={numberInputValue(field.value)}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleNumberChange(e, field.onChange)}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={recordPaymentForm.control}
                              name="paymentMethod"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Payment method</FormLabel>
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="cash">Cash</SelectItem>
                                      <SelectItem value="card">Card</SelectItem>
                                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                            <FormField
                              control={recordPaymentForm.control}
                              name="paymentDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Payment date</FormLabel>
                                  <FormControl>
                                    <DatePicker date={field.value} onDateChange={field.onChange} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={recordPaymentForm.control}
                              name="referenceNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Reference (optional)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. receipt or transfer ref" {...field} value={field.value || ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={recordPaymentForm.control}
                              name="notes"
                              render={({ field }) => (
                                <FormItem className="sm:col-span-2">
                                  <FormLabel>Payment note (optional)</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      {...field}
                                      placeholder="Add an internal note about this payment"
                                      rows={3}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </form>
                      </Form>
                    )}
                  </div>
                </DialogBody>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => setSaleForPayment(null)}>
                    Cancel
                  </Button>
                  {!isFullyPaid && (
                    <Button form="record-payment-form" type="submit" disabled={recordPaymentForm.formState.isSubmitting}>
                      {recordPaymentForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record payment
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="Sale Details"
        width={720}
        onDelete={null}
        primaryAction={viewingSale ? (() => {
          const canPrint = viewingSale.status === 'completed' && ((viewingSale.invoiceId && viewingSale.invoice?.status === 'paid') || (viewingSale.paymentMethod !== 'credit' && !viewingSale.invoiceId));
          const hasInvoice = !!viewingSale.invoiceId;
          const isPending = viewingSale.status === 'pending' || viewingSale.status === 'partially_paid';
          if (hasInvoice) {
            return { label: 'View Invoice', icon: <FileText className="h-4 w-4" />, onClick: () => handleViewInvoice(viewingSale) };
          }
          if (canPrint) {
            return {
              label: loadingReceipt ? 'Loading...' : 'Print Receipt',
              icon: loadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />,
              onClick: () => handlePrintReceipt(viewingSale),
              disabled: loadingReceipt
            };
          }
          if (isPending) {
            return { label: 'Record payment', icon: <CheckCircle className="h-4 w-4" />, onClick: () => handleOpenRecordPayment(viewingSale) };
          }
          return null;
        })() : null}
        moreMenuItems={viewingSale ? (() => {
          const canPrint = viewingSale.status === 'completed' && ((viewingSale.invoiceId && viewingSale.invoice?.status === 'paid') || (viewingSale.paymentMethod !== 'credit' && !viewingSale.invoiceId));
          const hasInvoice = !!viewingSale.invoiceId;
          const isPending = viewingSale.status === 'pending' || viewingSale.status === 'partially_paid';
          const primaryIsViewInvoice = hasInvoice;
          const primaryIsPrintReceipt = !hasInvoice && canPrint;
          const primaryIsRecordPayment = !hasInvoice && !canPrint && isPending;
          const items = [];
          if (canPrint) {
            items.push({
              key: 'view-pdf',
              label: 'View PDF',
              icon: <FileText className="h-4 w-4" />,
              onClick: () => handlePrintReceipt(viewingSale),
              disabled: loadingReceipt
            });
          }
          if (hasInvoice && !primaryIsViewInvoice) {
            items.push({
              key: 'view-invoice',
              label: 'View Invoice',
              icon: <FileText className="h-4 w-4" />,
              onClick: () => handleViewInvoice(viewingSale)
            });
          }
          if (canPrint && !primaryIsPrintReceipt) {
            items.push({
              key: 'print-receipt',
              label: loadingReceipt ? 'Loading...' : 'Print Receipt',
              icon: loadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />,
              onClick: () => handlePrintReceipt(viewingSale),
              disabled: loadingReceipt
            });
          }
          if (isPending && !primaryIsRecordPayment) {
            items.push({
              key: 'record-payment',
              label: 'Record payment',
              icon: <CheckCircle className="h-4 w-4" />,
              onClick: () => handleOpenRecordPayment(viewingSale)
            });
          }
          if (canStartSaleReturn(viewingSale, { isManager })) {
            items.push({
              key: 'return-exchange',
              label: 'Return / Exchange',
              icon: <Undo2 className="h-4 w-4" />,
              onClick: () => setReturnSale(viewingSale),
            });
          }
          if (isAdmin || parseFloat(viewingSale?.amountPaid || 0) > 0) {
            items.push({
              key: 'delete',
              label: 'Delete sale',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => setSaleToDelete(viewingSale),
              destructive: true
            });
          }
          return items;
        })() : []}
        tabs={viewingSale ? [
          {
            key: 'details',
            label: 'Summary',
            content: (
              <div className="space-y-6">
                <DrawerSectionCard title="Sale summary">
                  {(viewingSale.items || []).some((i) => i?.product?.imageUrl) && (
                    <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border">
                      {viewingSale.items
                        .filter((i) => i?.product?.imageUrl)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0"
                          >
                            <img
                              src={resolveImageUrl(item.product.imageUrl)}
                              alt={item.name || item.product?.name || ''}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{viewingSale.saleNumber}</div>
                      <div className="text-muted-foreground text-sm">
                        {dayjs(viewingSale.createdAt).format('MMM DD, YYYY [at] h:mm A')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Total Amount</div>
                      <div className="text-2xl font-bold text-primary">
                        {formatAmount(viewingSale.total)}
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
                <DrawerSectionCard title="Delivery tracking (optional)">
                  <div className="space-y-2">
                    <Label htmlFor="sale-delivery-status">Delivery status</Label>
                    <Select
                      value={viewingSale.deliveryStatus || '__none__'}
                      onValueChange={handleSaleDeliveryChange}
                      disabled={updatingSaleDelivery}
                    >
                      <SelectTrigger id="sale-delivery-status" className="max-w-md">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {DELIVERY_STATUS_ORDER.map((key) => (
                          <SelectItem key={key} value={key}>
                            {DELIVERY_STATUS_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DrawerSectionCard>
              </div>
            )
          },
          {
            key: 'items',
            label: 'Items',
            content: (
              <DrawerSectionCard title="Itemized charges">
                {(viewingSale.items || []).length ? (
                  <div className="space-y-0">
                    <div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-sm font-semibold text-foreground">
                      <div className="col-span-6">Item</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">Unit price</div>
                      <div className="col-span-2 text-right">Total</div>
                    </div>
                    {viewingSale.items.map((item) => {
                      const variantLabel = getSaleItemVariantLabel(item);
                      const catalogUnitPrice = getSaleItemCatalogUnitPrice(item);
                      const priceOverridden = isSaleItemPriceOverridden(item) && catalogUnitPrice !== null;
                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-12 gap-2 py-3 border-b border-border/80 last:border-b-0 text-sm items-center"
                        >
                        <div className="col-span-6 flex items-center gap-3">
                          {item?.product?.imageUrl ? (
                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0">
                              <img
                                src={resolveImageUrl(item.product.imageUrl)}
                                alt={item.name || item.product?.name || ''}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-border bg-muted flex-shrink-0 flex items-center justify-center">
                              <ShoppingCart className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{item.name || item.product?.name || 'Product'}</div>
                            {variantLabel && (
                              <div className="text-muted-foreground text-xs mt-0.5">Variant: {variantLabel}</div>
                            )}
                            {item.sku && (
                              <div className="text-muted-foreground text-xs mt-0.5">SKU: {item.sku}</div>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 text-right text-muted-foreground">{item.quantity}</div>
                        <div className="col-span-2 text-right text-muted-foreground">
                          <div>{formatAmount(item.unitPrice)}</div>
                          {priceOverridden && (
                            <div className="text-xs text-amber-700">
                              Catalog {formatAmount(catalogUnitPrice)}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-right font-medium text-foreground">{formatAmount(item.total)}</div>
                        </div>
                      );
                    })}
                    <div className="pt-3 mt-2 border-t border-border space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="text-foreground font-medium">{formatAmount(viewingSale.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Discount</span>
                        <span className="text-foreground">-{formatAmount(viewingSale.discount)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tax</span>
                        <span className="text-foreground">{formatAmount(viewingSale.tax)}</span>
                      </div>
                      {getSaleDelivery(viewingSale) && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            Delivery
                            {getSaleDelivery(viewingSale)?.label ? ` - ${getSaleDelivery(viewingSale).label}` : ''}
                          </span>
                          <span className="text-foreground">{formatAmount(getSaleDelivery(viewingSale).fee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-semibold text-foreground pt-2">
                        <span>Total</span>
                        <span>{formatAmount(viewingSale.total)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>No items found for this sale.</AlertDescription>
                  </Alert>
                )}
              </DrawerSectionCard>
            )
          },
          {
            key: 'activities',
            label: 'Activity',
            content: (() => {
              const activities = saleActivities || [];
              
              const creationActivity = viewingSale ? {
                id: 'creation',
                type: 'creation',
                createdAt: viewingSale.createdAt,
                createdByUser: viewingSale.seller || null
              } : null;
              
              const allActivities = creationActivity ? [creationActivity, ...activities] : activities;
              
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
                            ? `${activity.createdByUser.name} created sale ${viewingSale.saleNumber}`
                            : `Sale ${viewingSale.saleNumber} created`}
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
                  payment: 'Payment',
                  refund: 'Refund'
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

      <Dialog open={printModalVisible} onOpenChange={setPrintModalVisible}>
        <DialogContent className="max-w-[95vw] sm:max-w-[920px] max-h-[90vh] flex flex-col p-0 rounded-2xl">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b flex-shrink-0 text-left no-print">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div>
                <DialogTitle>Receipt Preview</DialogTitle>
                <DialogDescription>
                  Review the receipt before downloading
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <PrintFormatSwitcher value={receiptPrintFormat} onChange={setReceiptPrintFormat} />
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                  onClick={() => {
                    const wrapper = document.querySelector(
                      receiptData?.invoice ? '.printable-invoice' : '.printable-receipt'
                    )?.parentElement;
                    if (wrapper && receiptData) {
                      openPrintDialog(wrapper, `Receipt-${receiptData.saleNumber || 'receipt'}`);
                    }
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button
                  className="flex-1 sm:flex-initial"
                  onClick={async () => {
                    const element = document.querySelector(
                      receiptData?.invoice ? '.printable-invoice' : '.printable-receipt'
                    );
                    if (element && receiptData) {
                      try {
                        const isThermal = printConfig.format === 'thermal_58' || printConfig.format === 'thermal_80';
                        await generatePDF(element, {
                          filename: `Receipt-${receiptData.saleNumber || 'receipt'}.pdf`,
                          format: 'a4',
                          orientation: 'portrait',
                          margin: isThermal ? [0, 0, 0, 0] : [10, 10, 10, 10],
                          contentWidthMm: isThermal ? getContentWidthMm(printConfig) : null,
                          dynamicHeight: isThermal,
                        });
                        showSuccess('Receipt downloaded successfully');
                      } catch (error) {
                        console.error('PDF generation error:', error);
                        showError(null, 'Failed to generate PDF');
                      }
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/50 p-2 sm:p-4 md:p-8">
            <div className="max-w-full sm:max-w-[900px] mx-auto w-full" id="receipt-pdf-content">
              {receiptData && (
                receiptData.invoice ? (
                  <PrintableInvoice
                    key={receiptData.invoice.id || 'receipt'}
                    invoice={receiptData.invoice}
                    documentTitle="RECEIPT"
                    saleNumber={receiptData.saleNumber}
                    organization={receiptOrganization}
                    printConfig={printConfig}
                  />
                ) : (
                  <PrintableReceipt
                    key={receiptData.id || 'receipt'}
                    sale={receiptData}
                    organization={receiptOrganization}
                    printConfig={printConfig}
                  />
                )
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!saleToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setSaleToDelete(null);
            setDeleteSaleReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {saleToDelete
                ? isAdmin
                  ? (() => {
                      const saleLabel = saleToDelete.saleNumber || saleToDelete.id;
                      const paid = parseFloat(saleToDelete.amountPaid || 0) > 0;
                      if (isDealerSale(saleToDelete)) {
                        return `Permanently delete dealer sale "${saleLabel}"? This removes related payments, invoices, accounting entries, and dealer ledger charges for this sale. ABS does not refund cash or MoMo already collected. Only admins can do this. It cannot be undone.`;
                      }
                      if (String(saleToDelete.paymentMethod || '').toLowerCase() === 'credit' || paid) {
                        return `Permanently delete sale "${saleLabel}"? This removes related payments, invoices, and accounting entries. ABS removes records but does not refund cash or MoMo. Only admins can do this. It cannot be undone.`;
                      }
                      return `Permanently delete sale "${saleLabel}"? This also removes related payments, invoices, and accounting entries. Only admins can do this. It cannot be undone.`;
                    })()
                  : `Sale "${saleToDelete.saleNumber || saleToDelete.id}" will be removed from the sales list. It stays on record for audit purposes. Please provide a reason.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {saleToDelete && !isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="delete-sale-reason">Reason for deletion</Label>
              <Textarea
                id="delete-sale-reason"
                value={deleteSaleReason}
                onChange={(e) => setDeleteSaleReason(e.target.value)}
                placeholder="e.g. Duplicate sale entered by mistake"
                rows={3}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingSale || (!isAdmin && !deleteSaleReason.trim())}
              onClick={(e) => {
                if (!isAdmin && !deleteSaleReason.trim()) {
                  e.preventDefault();
                  return;
                }
                if (saleToDelete) handleDeleteSale(saleToDelete.id, isAdmin ? undefined : deleteSaleReason.trim());
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaleReturnWizard
        open={Boolean(returnSale)}
        onOpenChange={(open) => {
          if (!open) setReturnSale(null);
        }}
        saleId={returnSale?.id}
        saleNumber={returnSale?.saleNumber}
        onCompleted={async () => {
          await refreshAfterSale(queryClient);
          refetchSales();
          if (returnSale?.id && viewingSale?.id === returnSale.id) {
            await fetchSaleDetails(returnSale.id);
          }
          setReturnSale(null);
        }}
      />
    </div>
  );
};

export default Sales;
