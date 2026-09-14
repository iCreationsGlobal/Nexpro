import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Currency, FileText, Clock, CheckCircle, Printer, Download, Loader2, Share2, Copy, Archive, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import invoiceService from '../services/invoiceService';
import { guardOnline } from '../utils/onlineRequired';
import { QUERY_STALE, refreshAfterInvoiceChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import settingsService from '../services/settingsService';
import customerService from '../services/customerService';
import customDropdownService from '../services/customDropdownService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { usePOSConfig } from '../hooks/usePOSConfig';
import { getContentWidthMm } from '../utils/printStyles';
import ActionColumn from '../components/ActionColumn';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import DetailsDrawer from '../components/DetailsDrawer';
import InvoiceDetailsDrawerContent from '../components/InvoiceDetailsDrawerContent';
import MobileFormDialog from '../components/MobileFormDialog';
import PrintableInvoice from '../components/PrintableInvoice';
import StatusChip from '../components/StatusChip';
import DetailSkeleton from '../components/DetailSkeleton';
import { showSuccess, showError } from '../utils/toast';
import { generatePDF, openPrintDialog } from '../utils/pdfUtils';
import { resolvePaymentNotePayload } from '../utils/paymentNotes';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { DEBOUNCE_DELAYS, INVOICE_STATUSES, SEARCH_PLACEHOLDERS, STUDIO_LIKE_TYPES } from '../constants';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { numberInputValue, handleNumberChange, numberOrEmptySchema } from '../utils/formUtils';
import { useResponsive } from '../hooks/useResponsive';

const getInvoiceStatus = (invoice) => String(invoice?.status || '').toLowerCase();
const hasCancellationMarker = (invoice) => Boolean(
  invoice?.cancelledAt ||
  invoice?.canceledAt ||
  invoice?.isCancelled ||
  invoice?.isCanceled ||
  invoice?.metadata?.cancelled ||
  invoice?.metadata?.canceled
);
const isCancelledInvoice = (invoice) => (
  getInvoiceStatus(invoice) === INVOICE_STATUSES.CANCELLED ||
  hasCancellationMarker(invoice)
);
const getInvoiceDisplayStatus = (invoice) => (
  isCancelledInvoice(invoice) ? INVOICE_STATUSES.CANCELLED : getInvoiceStatus(invoice)
);
const isDraftInvoice = (invoice) => getInvoiceStatus(invoice) === INVOICE_STATUSES.DRAFT;
const canDeleteInvoice = (invoice) => isDraftInvoice(invoice) || isCancelledInvoice(invoice);
const canCancelInvoice = (invoice) => [
  INVOICE_STATUSES.SENT,
  INVOICE_STATUSES.PARTIAL,
  INVOICE_STATUSES.OVERDUE,
].includes(getInvoiceStatus(invoice)) && !isCancelledInvoice(invoice);

const normalizeInvoicesResponse = (response) => {
  const payload = response?.data?.data != null ? response.data : response;
  const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);

  return {
    invoices: data,
    total: Number(payload?.count ?? payload?.total ?? data.length),
  };
};

const normalizeInvoiceStatsResponse = (response) => {
  const payload = response?.data?.data != null ? response.data : response;
  return payload?.data || payload || null;
};

const paymentSchema = z.object({
  amount: numberOrEmptySchema(z).refine((v) => v >= 0.01, 'Payment amount must be greater than 0'),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

const markAsPaidSchema = z.object({
  paymentType: z.enum(['full', 'partial']),
  paymentDate: z.date(),
  partialAmount: numberOrEmptySchema(z).optional(),
  notes: z.string().optional(),
}).superRefine((values, ctx) => {
  if (values.paymentType === 'partial') {
    if (values.partialAmount == null || values.partialAmount < 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partialAmount'],
        message: 'Part payment amount must be greater than 0',
      });
    }
  }
});

const createInvoicePaymentClientRequestId = (prefix, invoiceId) => {
  const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${invoiceId}-${randomId}`;
};

const Invoices = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({ status: '' });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [markAsPaidModalVisible, setMarkAsPaidModalVisible] = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const { isAdmin, isManager, activeTenant, activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const queryClient = useQueryClient();
  const { activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { isMobile } = useResponsive();
  const businessType = activeTenant?.businessType || 'printing_press';
  const isPrintingPress = businessType === 'printing_press';
  const isStudioLike = STUDIO_LIKE_TYPES.includes(businessType);
  const canCreateManualInvoice = businessType !== 'shop';
  const [tableViewMode, setTableViewMode] = useState('table');
  const [markingAsPaid, setMarkingAsPaid] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [invoiceToCancel, setInvoiceToCancel] = useState(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [newInvoice, setNewInvoice] = useState({
    customerId: '',
    items: [{ description: '', quantity: 1, unitPrice: '', discountAmount: 0 }],
    dueDate: null,
    paymentTerms: 'Net 30',
    notes: '',
  });
  const [lineItemDescriptionOptions, setLineItemDescriptionOptions] = useState([]);
  const paymentSubmitInFlightRef = useRef(false);
  const markAsPaidSubmitInFlightRef = useRef(false);
  const paymentClientRequestIdRef = useRef(null);
  const markAsPaidClientRequestIdRef = useRef(null);
  const printPreviewRef = useRef(null);
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const invoicesQueryEnabled = scopeReady && !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId);

  const invoicesQueryParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };
    if (filters.status) params.status = filters.status;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [pagination.current, pagination.pageSize, filters.status, debouncedSearch]);

  const {
    data: invoicesQueryResponse,
    error: invoicesQueryError,
    isError: invoicesQueryIsError,
    isLoading: loading,
    refetch: refetchInvoicesQuery,
  } = useQuery({
    queryKey: queryKeys.invoices.list(activeTenantId, activeShopId, activeStudioLocationId, invoicesQueryParams),
    queryFn: () => invoiceService.getAll(invoicesQueryParams),
    enabled: invoicesQueryEnabled,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const {
    data: invoiceStatsResponse,
    error: invoiceStatsError,
    isError: invoiceStatsIsError,
  } = useQuery({
    queryKey: queryKeys.invoices.stats(activeTenantId, activeShopId, activeStudioLocationId),
    queryFn: () => invoiceService.getStats(),
    enabled: invoicesQueryEnabled,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const invoicesQueryData = useMemo(() => normalizeInvoicesResponse(invoicesQueryResponse), [invoicesQueryResponse]);
  const invoices = invoicesQueryData.invoices;
  const totalInvoicesCount = invoicesQueryData.total;
  const stats = useMemo(() => normalizeInvoiceStatsResponse(invoiceStatsResponse), [invoiceStatsResponse]);

  const refetchInvoices = useCallback(async () => {
    await refetchInvoicesQuery();
  }, [refetchInvoicesQuery]);

  // Organization branding for printable invoices
  const { data: organizationData } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganization(),
    staleTime: 5 * 60 * 1000,
  });

  const organization = organizationData?.data?.data || organizationData?.data || {};

  const printOrganization = useMemo(() => {
    if (viewingInvoice?.organization && typeof viewingInvoice.organization === 'object') {
      return viewingInvoice.organization;
    }
    return organization;
  }, [viewingInvoice, organization]);

  const { posConfig } = usePOSConfig();
  const invoicePrintConfig = posConfig?.print || { format: 'a4' };

  const paymentForm = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: 0,
      paymentMethod: 'cash',
      paymentDate: new Date(),
      referenceNumber: '',
      notes: '',
    },
  });

  const markAsPaidForm = useForm({
    resolver: zodResolver(markAsPaidSchema),
    defaultValues: {
      paymentType: 'full',
      paymentDate: new Date(),
      partialAmount: 0,
      notes: '',
    },
  });

  useEffect(() => {
    if (invoicesQueryIsError) {
      showError(invoicesQueryError, 'Failed to load invoices');
    }
  }, [invoicesQueryIsError, invoicesQueryError]);

  useEffect(() => {
    if (invoiceStatsIsError) {
      console.error('Failed to load invoice stats:', invoiceStatsError);
    }
  }, [invoiceStatsIsError, invoiceStatsError]);

  useEffect(() => {
    setPageSearchConfig({ scope: 'invoices', placeholder: SEARCH_PLACEHOLDERS.INVOICES });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (location.state?.openInvoiceId && invoices.length > 0) {
      const invoiceToOpen = invoices.find(inv => inv.id === location.state.openInvoiceId);
      if (invoiceToOpen) {
        navigate(location.pathname, { replace: true, state: {} });
        handleView(invoiceToOpen);
      } else {
        const fetchSpecificInvoice = async () => {
          try {
            const response = await invoiceService.getById(location.state.openInvoiceId);
            if (response.data) {
              navigate(location.pathname, { replace: true, state: {} });
              handleView(response.data);
            }
          } catch (error) {
            console.error('Failed to load specific invoice:', error);
            navigate(location.pathname, { replace: true, state: {} });
          }
        };
        fetchSpecificInvoice();
      }
      return;
    }

    // Legacy deep-link: /invoices?openInvoiceId=...
    const queryInvoiceId = new URLSearchParams(location.search).get('openInvoiceId');
    if (queryInvoiceId && invoices.length > 0) {
      const invoiceToOpen = invoices.find((inv) => inv.id === queryInvoiceId);
      navigate(location.pathname, { replace: true });
      if (invoiceToOpen) {
        handleView(invoiceToOpen);
      } else {
        invoiceService.getById(queryInvoiceId)
          .then((response) => {
            if (response?.data) handleView(response.data);
          })
          .catch((error) => {
            console.error('Failed to load specific invoice:', error);
          });
      }
    }
  }, [location.state, location.search, invoices]);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await customerService.getAll({ limit: 200 });
      setCustomers(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      showError(error, 'Failed to load customers');
    }
  }, []);

  const loadLineItemDescriptionOptions = useCallback(async () => {
    if (!activeTenant?.id) return;
    try {
      const options = await customDropdownService.getCustomOptions('line_item_description');
      setLineItemDescriptionOptions(Array.isArray(options) ? options : []);
    } catch (error) {
      console.error('Failed to load line item description options:', error);
      setLineItemDescriptionOptions([]);
    }
  }, [activeTenant?.id]);

  useEffect(() => {
    loadLineItemDescriptionOptions();
  }, [loadLineItemDescriptionOptions]);

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

  const resetCreateInvoiceForm = useCallback(() => {
    setNewInvoice({
      customerId: '',
      items: [{ description: '', quantity: 1, unitPrice: '', discountAmount: '' }],
      dueDate: null,
      paymentTerms: 'Net 30',
      notes: '',
    });
  }, []);

  const handleOpenCreateModal = useCallback(async () => {
    if (customers.length === 0) {
      await loadCustomers();
    }
    resetCreateInvoiceForm();
    setCreateModalVisible(true);
  }, [customers.length, loadCustomers, resetCreateInvoiceForm]);

  const handleInvoiceItemChange = useCallback((index, field, value) => {
    setNewInvoice((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...prev, items: nextItems };
    });
  }, []);

  const handleAddInvoiceItem = useCallback(() => {
    setNewInvoice((prev) => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unitPrice: '', discountAmount: '' }],
    }));
  }, []);

  const handleRemoveInvoiceItem = useCallback((index) => {
    setNewInvoice((prev) => {
      if (prev.items.length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      };
    });
  }, []);

  const createInvoiceSubtotal = useMemo(
    () => (newInvoice.items || []).reduce((sum, item) => {
      const qty = parseFloat(item.quantity || 0);
      const unit = parseFloat(item.unitPrice || 0);
      return sum + (qty * unit);
    }, 0),
    [newInvoice.items]
  );

  const createInvoiceDiscountTotal = useMemo(
    () => (newInvoice.items || []).reduce((sum, item) => {
      const qty = parseFloat(item.quantity || 0);
      const unitDiscount = parseFloat(item.discountAmount || 0);
      return sum + (qty * unitDiscount);
    }, 0),
    [newInvoice.items]
  );

  const createInvoiceGrandTotal = useMemo(
    () => Math.max(0, createInvoiceSubtotal - createInvoiceDiscountTotal),
    [createInvoiceSubtotal, createInvoiceDiscountTotal]
  );

  const handleCreateInvoice = useCallback(async () => {
    if (!newInvoice.customerId) {
      showError(null, 'Select a customer');
      return;
    }

    const normalizedItems = (newInvoice.items || []).map((item) => {
      const quantity = parseFloat(item.quantity || 0);
      const unitPrice = parseFloat(item.unitPrice || 0);
      const unitDiscountAmount = parseFloat(item.discountAmount || 0);
      const lineDiscountAmount = quantity * unitDiscountAmount;
      const total = Math.max(0, (quantity * unitPrice) - lineDiscountAmount);
      return {
        description: String(item.description || '').trim(),
        quantity,
        unitPrice,
        discountAmount: unitDiscountAmount,
        discountScope: 'unit',
        total,
      };
    });

    if (normalizedItems.length === 0) {
      showError(null, 'Add at least one item');
      return;
    }

    const invalidItem = normalizedItems.find((item) => !item.description || item.quantity <= 0 || item.unitPrice < 0 || item.discountAmount < 0);
    if (invalidItem) {
      showError(null, 'Each item must have description, quantity > 0, and valid prices');
      return;
    }

    setCreatingInvoice(true);
    try {
      await invoiceService.create({
        customerId: newInvoice.customerId,
        items: normalizedItems,
        dueDate: newInvoice.dueDate || undefined,
        paymentTerms: newInvoice.paymentTerms || 'Net 30',
        notes: newInvoice.notes?.trim() || undefined,
      });
      await persistLineItemDescriptions(normalizedItems);
      showSuccess('Invoice created');
      setCreateModalVisible(false);
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
      resetCreateInvoiceForm();
    } catch (error) {
      showError(error, 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  }, [newInvoice, resetCreateInvoiceForm, persistLineItemDescriptions, queryClient, refetchInvoices]);

  const handleView = useCallback(async (invoice) => {
    setDrawerVisible(true);
    setViewingInvoice(invoice);
    try {
      const response = await invoiceService.getById(invoice.id);
      const full = response?.data ?? response;
      if (full) setViewingInvoice(full);
    } catch (error) {
      console.error('Failed to load invoice details:', error);
    }
  }, []);

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setViewingInvoice(null);
  };

  const handlePrint = useCallback(async (invoice) => {
    setViewingInvoice(invoice);
    setPrintModalVisible(true);
    try {
      const response = await invoiceService.getById(invoice.id);
      const full = response?.data ?? response;
      if (full) setViewingInvoice(full);
    } catch (error) {
      console.error('Failed to load invoice for print:', error);
      showError(error, 'Failed to load invoice for printing');
    }
  }, []);

  const handlePrintInvoice = () => {
    if (!viewingInvoice) return;
    const wrapper = printPreviewRef.current;
    if (wrapper) {
      openPrintDialog(wrapper, `Invoice-${viewingInvoice.invoiceNumber}`);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!viewingInvoice) return;

    try {
      const invoiceElement = printPreviewRef.current?.querySelector('.printable-invoice');

      if (!invoiceElement) {
        showError(null, 'Invoice not found');
        return;
      }

      const isThermal = invoicePrintConfig.format === 'thermal_58' || invoicePrintConfig.format === 'thermal_80';

      await generatePDF(invoiceElement, {
        margin: isThermal ? [0, 0, 0, 0] : (isMobile ? [4, 4, 4, 4] : [0, 0, 0, 0]),
        filename: `Invoice_${viewingInvoice.invoiceNumber}.pdf`,
        format: 'a4',
        orientation: 'portrait',
        contentWidthMm: isThermal ? getContentWidthMm(invoicePrintConfig) : null,
        dynamicHeight: isThermal,
      });

      showSuccess('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError(error, 'Failed to generate PDF. Please try again.');
    }
  };

  const handleRecordPayment = (invoice) => {
    setViewingInvoice(invoice);
    paymentClientRequestIdRef.current = null;
    paymentForm.reset({
      amount: parseFloat(invoice.balance),
      paymentMethod: 'cash',
      paymentDate: new Date(),
      referenceNumber: '',
      notes: '',
    });
    setPaymentModalVisible(true);
  };

  const handleOpenMarkAsPaid = (invoice) => {
    setViewingInvoice(invoice);
    markAsPaidClientRequestIdRef.current = null;
    const balance = parseFloat(invoice?.balance || 0);
    markAsPaidForm.reset({
      paymentType: 'full',
      paymentDate: new Date(),
      partialAmount: balance > 0 ? balance : 0,
      notes: '',
    });
    setMarkAsPaidModalVisible(true);
  };

  const handleMarkAsPaid = async (values) => {
    if (!viewingInvoice) return;
    if (markAsPaidSubmitInFlightRef.current) return;
    markAsPaidSubmitInFlightRef.current = true;
    try {
      setMarkingAsPaid(true);
      let response;
      const selectedPaymentDate = dayjs(values.paymentDate).format('YYYY-MM-DD');
      if (values.paymentType === 'partial') {
        const partialAmount = parseFloat(values.partialAmount || 0);
        const currentBalance = parseFloat(viewingInvoice.balance || 0);
        if (partialAmount > currentBalance) {
          showError(null, 'Part payment cannot be greater than the current balance');
          return;
        }
        if (!markAsPaidClientRequestIdRef.current) {
          markAsPaidClientRequestIdRef.current = createInvoicePaymentClientRequestId('INV-PAY', viewingInvoice.id);
        }
        response = await invoiceService.recordPayment(viewingInvoice.id, {
          amount: partialAmount,
          paymentMethod: 'cash',
          paymentDate: selectedPaymentDate,
          clientRequestId: markAsPaidClientRequestIdRef.current,
          notes: resolvePaymentNotePayload(values),
        });
      } else {
        if (!markAsPaidClientRequestIdRef.current) {
          markAsPaidClientRequestIdRef.current = createInvoicePaymentClientRequestId('INV-MARK-PAID', viewingInvoice.id);
        }
        response = await invoiceService.markAsPaid(viewingInvoice.id, {
          paymentDate: selectedPaymentDate,
          clientRequestId: markAsPaidClientRequestIdRef.current,
          notes: resolvePaymentNotePayload(values),
        });
      }
      const updatedInvoice = response?.data;

      if (updatedInvoice && viewingInvoice?.id === updatedInvoice.id) {
        setViewingInvoice(updatedInvoice);
      }

      showSuccess(
        values.paymentType === 'partial'
          ? 'Part payment recorded successfully'
          : (response?.message || 'Invoice marked as paid')
      );
      markAsPaidClientRequestIdRef.current = null;
      setMarkAsPaidModalVisible(false);
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.error ||
        error?.message ||
        'Failed to mark invoice as paid';
      showError(error, errorMessage);
    } finally {
      markAsPaidSubmitInFlightRef.current = false;
      setMarkingAsPaid(false);
    }
  };

  const onPaymentSubmit = async (values) => {
    if (!viewingInvoice) return;
    if (paymentSubmitInFlightRef.current) return;
    paymentSubmitInFlightRef.current = true;
    try {
      if (!paymentClientRequestIdRef.current) {
        paymentClientRequestIdRef.current = createInvoicePaymentClientRequestId('INV-PAY', viewingInvoice.id);
      }
      const response = await invoiceService.recordPayment(viewingInvoice.id, {
        ...values,
        paymentDate: dayjs(values.paymentDate).format('YYYY-MM-DD'),
        clientRequestId: paymentClientRequestIdRef.current,
        notes: resolvePaymentNotePayload(values),
      });
      const updatedInvoice = response?.data;
      if (updatedInvoice && viewingInvoice?.id === updatedInvoice.id) {
        setViewingInvoice(updatedInvoice);
      }
      showSuccess('Payment recorded successfully');
      paymentClientRequestIdRef.current = null;
      setPaymentModalVisible(false);
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
    } catch (error) {
      showError(error, error.error || 'Failed to record payment');
    } finally {
      paymentSubmitInFlightRef.current = false;
    }
  };

  const handleSendInvoice = async (id) => {
    try {
      setSendingInvoice(true);
      await invoiceService.send(id);
      showSuccess('Invoice sent. Payment link is ready to share.');
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
      if (viewingInvoice?.id === id) {
        const updated = await invoiceService.getById(id);
        const inv = updated?.data ?? updated;
        if (inv) setViewingInvoice(inv);
      }
    } catch (error) {
      showError(error, 'Failed to send invoice');
    } finally {
      setSendingInvoice(false);
    }
  };

  const paymentLink = useMemo(() => {
    if (!viewingInvoice?.paymentToken) return null;
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/pay-invoice/${viewingInvoice.paymentToken}`;
  }, [viewingInvoice?.paymentToken]);

  const handleCopyPaymentLink = useCallback(() => {
    if (!paymentLink) return;
    navigator.clipboard.writeText(paymentLink).then(() => showSuccess('Payment link copied to clipboard')).catch(() => showError('Could not copy link'));
  }, [paymentLink]);

  const handleRequestDrawerInvoiceCancel = useCallback((invoice) => {
    setInvoiceToCancel(invoice);
    setDrawerVisible(false);
  }, []);

  const handleRequestDrawerInvoiceDelete = useCallback((invoice) => {
    setInvoiceToDelete(invoice);
    setDrawerVisible(false);
  }, []);

  const invoiceDrawerPrimaryAction = useMemo(() => {
    if (!viewingInvoice) return null;
    return {
      label: 'View PDF',
      icon: <FileText className="h-4 w-4" />,
      onClick: () => handlePrint(viewingInvoice),
      disabled: false,
    };
  }, [viewingInvoice]);

  const invoiceDrawerMoreMenuItems = useMemo(() => {
    if (!viewingInvoice || !isManager) return [];
    const status = getInvoiceStatus(viewingInvoice);
    const unpaid = status !== INVOICE_STATUSES.PAID && !isCancelledInvoice(viewingInvoice);
    const items = [];
    if (unpaid) {
      items.push({
        key: 'share',
        label: sendingInvoice ? 'Sending...' : 'Share invoice',
        icon: <Share2 className="h-4 w-4" />,
        onClick: () => handleSendInvoice(viewingInvoice.id),
        disabled: sendingInvoice,
      });
    }
    if (paymentLink) {
      items.push({
        key: 'copyLink',
        label: 'Copy payment link',
        icon: <Copy className="h-4 w-4" />,
        onClick: handleCopyPaymentLink,
      });
    }
    if (unpaid) {
      items.push({
        key: 'markPaid',
        label: 'Mark as Paid',
        icon: <CheckCircle className="h-4 w-4" />,
        onClick: () => handleOpenMarkAsPaid(viewingInvoice),
        disabled: markingAsPaid,
      });
    }
    if (canCancelInvoice(viewingInvoice)) {
      items.push({
        key: 'cancel',
        label: 'Cancel Invoice',
        icon: <Archive className="h-4 w-4" />,
        onClick: () => handleRequestDrawerInvoiceCancel(viewingInvoice),
        destructive: true,
      });
    }
    if (isAdmin && isDraftInvoice(viewingInvoice)) {
      items.push({
        key: 'delete',
        label: 'Delete draft',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => handleRequestDrawerInvoiceDelete(viewingInvoice),
        destructive: true,
      });
    }
    if (isAdmin && isCancelledInvoice(viewingInvoice)) {
      items.push({
        key: 'delete-cancelled',
        label: 'Delete cancelled invoice',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => handleRequestDrawerInvoiceDelete(viewingInvoice),
        destructive: true,
      });
    }
    return items;
  }, [viewingInvoice, isAdmin, isManager, paymentLink, sendingInvoice, markingAsPaid, handleSendInvoice, handleCopyPaymentLink, handleRequestDrawerInvoiceCancel, handleRequestDrawerInvoiceDelete]);

  const handleCancelInvoice = async (id) => {
    try {
      await invoiceService.cancel(id);
      setInvoiceToCancel(null);
      showSuccess('Invoice cancelled');
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
      if (drawerVisible) handleCloseDrawer();
    } catch (error) {
      showError(error, 'Failed to cancel invoice');
    }
  };

  const handleDeleteInvoice = async (id) => {
    try {
      if (!guardOnline(showError)) return;
      if (isCancelledInvoice(invoiceToDelete)) {
        await invoiceService.deleteCancelled(id);
        showSuccess('Cancelled invoice deleted');
      } else {
        await invoiceService.delete(id);
        showSuccess('Draft invoice deleted');
      }
      setInvoiceToDelete(null);
      await refreshAfterInvoiceChange(queryClient);
      refetchInvoices();
      if (viewingInvoice?.id === id) handleCloseDrawer();
    } catch (error) {
      showError(error, 'Failed to delete invoice');
    }
  };

  const tableColumns = useMemo(() => [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (_, record) => record.invoiceNumber,
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (_, record) => (
        <div>
          <div>{record.customer?.name}</div>
          {record.customer?.company && (
            <div className="text-muted-foreground text-xs">{record.customer.company}</div>
          )}
        </div>
      ),
    },
    ...(isPrintingPress ? [{
      key: 'job',
      label: 'Job',
      render: (_, record) => record.job?.jobNumber || '-',
    }] : []),
    {
      key: 'invoiceDate',
      label: 'Invoice Date',
      render: (_, record) => dayjs(record.invoiceDate).format('MMM DD, YYYY'),
    },
    {
      key: 'dueDate',
      label: 'Due Date',
      render: (_, record) => dayjs(record.dueDate).format('MMM DD, YYYY'),
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (_, record) => `₵ ${parseFloat(record.totalAmount || 0).toFixed(2)}`,
    },
    {
      key: 'balance',
      label: 'Balance',
      render: (_, record) => {
        const balance = parseFloat(record.balance || 0);
        return (
          <span className={`font-bold ${balance > 0 ? 'text-orange-500' : 'text-green-500'}`}>
            ₵ {balance.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => <StatusChip status={getInvoiceDisplayStatus(record)} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          onView={handleView}
          record={record}
          extraActions={[
            isAdmin && canDeleteInvoice(record) && {
              key: 'delete',
              label: isCancelledInvoice(record) ? 'Delete cancelled invoice' : 'Delete draft invoice',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => setInvoiceToDelete(record),
              destructive: true,
            },
          ].filter(Boolean)}
        />
      ),
    },
  ], [isPrintingPress, handleView, isAdmin]);

  const invoicesEmptyState = useMemo(() => {
    if (filters.status || debouncedSearch.trim()) {
      return getEmptyStateProps(EMPTY_STATES.INVOICES_FILTERED, {
        primary: () => {
          setFilters({ status: '' });
          setSearchValue('');
          setPagination((prev) => ({ ...prev, current: 1 }));
        },
      });
    }
    if (isStudioLike) {
      const actions = { primary: () => navigate('/jobs') };
      if (canCreateManualInvoice) actions.secondary = handleOpenCreateModal;
      return getEmptyStateProps(EMPTY_STATES.INVOICES, actions);
    }
    return getEmptyStateProps(EMPTY_STATES.INVOICES_SHOP, {
      ...(canCreateManualInvoice ? { primary: handleOpenCreateModal } : {}),
    });
  }, [filters.status, debouncedSearch, isStudioLike, canCreateManualInvoice, navigate, handleOpenCreateModal, setSearchValue]);

  return (
    <div className="space-y-6">
      <WelcomeSection
        welcomeMessage="Invoices"
        subText="Create, send, and track invoice payments."
      />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardStatsCard
            tooltip="Total amount received from paid invoices"
            title="Total Revenue"
            value={parseFloat(stats.totalRevenue || 0).toFixed(2)}
            valuePrefix="₵ "
            icon={CheckCircle}
            iconBgColor="rgba(34, 197, 94, 0.12)"
            iconColor="#16a34a"
          />
          <DashboardStatsCard
            tooltip="Amount still owed by customers"
            title="Outstanding"
            value={parseFloat(stats.outstandingAmount || 0).toFixed(2)}
            valuePrefix="₵ "
            icon={Clock}
            iconBgColor="rgba(249, 115, 22, 0.12)"
            iconColor="#ea580c"
          />
          <DashboardStatsCard
            tooltip="Invoices that have been fully paid"
            title="Paid Invoices"
            value={stats.paidInvoices || 0}
            icon={FileText}
            iconBgColor="rgba(34, 197, 94, 0.12)"
            iconColor="#16a34a"
          />
          <DashboardStatsCard
            tooltip="Invoices past due date"
            title="Overdue"
            value={stats.overdueInvoices || 0}
            icon={FileText}
            iconBgColor="rgba(239, 68, 68, 0.12)"
            iconColor="#dc2626"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Select
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value || '' })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {canCreateManualInvoice && (
            <Button onClick={handleOpenCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          )}
        </div>
      </div>

      <DashboardTable
        data={invoices}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={invoicesEmptyState}
        pageSize={pagination.pageSize}
        externalPagination={{ current: pagination.current, total: totalInvoicesCount }}
        onPageChange={(newPagination) => setPagination(prev => ({ ...prev, ...newPagination }))}
        viewMode={tableViewMode}
        onViewModeChange={setTableViewMode}
      />

      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="Invoice Details"
        description="View and manage invoice information"
        width={900}
        primaryAction={invoiceDrawerPrimaryAction}
        moreMenuItems={invoiceDrawerMoreMenuItems}
      >
        {viewingInvoice ? (
          <InvoiceDetailsDrawerContent invoice={viewingInvoice} />
        ) : null}
      </DetailsDrawer>


      <MobileFormDialog
        open={createModalVisible}
        onOpenChange={setCreateModalVisible}
        title="New Invoice"
        description="Create an invoice directly without linking a job."
        footer={(
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] touch-manipulation"
              onClick={() => setCreateModalVisible(false)}
              disabled={creatingInvoice}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateInvoice} disabled={creatingInvoice}>
              {creatingInvoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </>
        )}
        className="w-full max-w-[calc(100vw-1rem)] sm:w-[var(--modal-w-2xl)]"
      >
        <div className="space-y-4">
          <div>
            <Label>Customer</Label>
            <Select
              value={newInvoice.customerId}
              onValueChange={(value) => setNewInvoice((prev) => ({ ...prev, customerId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}{customer.company ? ` - ${customer.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-3">
              <div className="pt-1 pb-1">
                <Separator className="mb-3" />
                <div className="text-sm font-medium text-muted-foreground">Invoice Items</div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" onClick={handleAddInvoiceItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
              {(newInvoice.items || []).map((item, index) => (
                <Card key={`new-invoice-item-${index}`}>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base">Item {index + 1}</CardTitle>
                    {newInvoice.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveInvoiceItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Description</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => handleInvoiceItemChange(index, 'description', e.target.value)}
                        placeholder="Item description"
                        list="line-item-description-options"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 md:gap-4">
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={numberInputValue(item.quantity)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            handleInvoiceItemChange(index, 'quantity', raw === '' ? '' : Math.max(0, Number(raw)));
                          }}
                        />
                      </div>
                      <div>
                        <Label>Unit Price</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">GHS</span>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="pl-12"
                            value={numberInputValue(item.unitPrice)}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleInvoiceItemChange(index, 'unitPrice', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Unit Discount (optional)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">GHS</span>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="pl-12"
                            value={numberInputValue(item.discountAmount)}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              handleInvoiceItemChange(index, 'discountAmount', raw === '' ? '' : Math.max(0, Number(raw)));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end justify-end">
                      <div className="text-sm text-muted-foreground">
                        Line Total: ₵ {Math.max(0, (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)) - (parseFloat(item.quantity || 0) * parseFloat(item.discountAmount || 0))).toFixed(2)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button type="button" variant="dashed" onClick={handleAddInvoiceItem} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            <div>
              <Label>Due Date (optional)</Label>
              <DatePicker
                date={newInvoice.dueDate}
                onSelect={(date) => setNewInvoice((prev) => ({ ...prev, dueDate: date || null }))}
              />
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Input
                value={newInvoice.paymentTerms}
                onChange={(e) => setNewInvoice((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                placeholder="Net 30"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Input
                value={newInvoice.notes}
                onChange={(e) => setNewInvoice((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Any extra notes"
              />
            </div>
            <div className="sm:col-span-2 p-3 rounded-md border bg-muted/30 space-y-1">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>₵ {createInvoiceSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span>Total Discount</span><span>-₵ {createInvoiceDiscountTotal.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold"><span>Grand Total</span><span>₵ {createInvoiceGrandTotal.toFixed(2)}</span></div>
            </div>
            <datalist id="line-item-description-options">
              {lineItemDescriptionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label || option.value}
                </option>
              ))}
            </datalist>
          </div>
        </div>
      </MobileFormDialog>

      <MobileFormDialog
        open={markAsPaidModalVisible}
        onOpenChange={setMarkAsPaidModalVisible}
        title="Mark Invoice Payment"
        description="Choose full payment or record a part payment."
        footer={
          viewingInvoice ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] touch-manipulation"
                onClick={() => setMarkAsPaidModalVisible(false)}
              >
                Cancel
              </Button>
              <Button form="mark-as-paid-form" type="submit" disabled={markingAsPaid} className="min-h-[44px] touch-manipulation">
                {markingAsPaid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </>
          ) : null
        }
        className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md"
      >
        {viewingInvoice && (
          <Form {...markAsPaidForm}>
            <form id="mark-as-paid-form" onSubmit={markAsPaidForm.handleSubmit(handleMarkAsPaid)} className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                Balance Due: <strong>₵ {parseFloat(viewingInvoice.balance || 0).toFixed(2)}</strong>
              </div>

              <FormField
                control={markAsPaidForm.control}
                name="paymentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="full">Fully Paid</SelectItem>
                        <SelectItem value="partial">Partially Paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={markAsPaidForm.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
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

              {markAsPaidForm.watch('paymentType') === 'partial' && (
                <FormField
                  control={markAsPaidForm.control}
                  name="partialAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Payment Amount</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₵ </span>
                          <Input
                            type="number"
                            min={0}
                            max={parseFloat(viewingInvoice.balance || 0)}
                            step={0.01}
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
              )}

              <FormField
                control={markAsPaidForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
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
            </form>
          </Form>
        )}
      </MobileFormDialog>

      <MobileFormDialog
        open={paymentModalVisible}
        onOpenChange={setPaymentModalVisible}
        title="Record Payment"
        description="Record a payment for this invoice"
        footer={
          viewingInvoice ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] touch-manipulation"
                onClick={() => setPaymentModalVisible(false)}
              >
                Cancel
              </Button>
              <Button form="payment-form" type="submit" disabled={paymentForm.formState.isSubmitting} className="min-h-[44px] touch-manipulation">
                {paymentForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </>
          ) : null
        }
        className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md"
      >
        {viewingInvoice && (
          <>
            <Descriptions column={2} className="mb-6">
              <DescriptionItem label="Invoice">{viewingInvoice.invoiceNumber}</DescriptionItem>
              <DescriptionItem label="Customer">{viewingInvoice.customer?.name}</DescriptionItem>
              <DescriptionItem label="Total Amount">₵ {parseFloat(viewingInvoice.totalAmount).toFixed(2)}</DescriptionItem>
              <DescriptionItem label="Amount Paid">₵ {parseFloat(viewingInvoice.amountPaid || 0).toFixed(2)}</DescriptionItem>
              <DescriptionItem label="Balance Due" className="col-span-2">
                <strong className="text-lg text-orange-500">
                  ₵ {parseFloat(viewingInvoice.balance).toFixed(2)}
                </strong>
              </DescriptionItem>
            </Descriptions>

            <Form {...paymentForm}>
              <form id="payment-form" onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={paymentForm.control}
                    name="amount"
                    rules={[
                      {
                        validate: (value) => {
                          if (value > parseFloat(viewingInvoice.balance || 0)) {
                            return 'Amount exceeds balance due';
                          }
                          return true;
                        }
                      }
                    ]}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Amount</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₵ </span>
                            <Input
                              type="number"
                              min={0}
                              max={parseFloat(viewingInvoice.balance)}
                              step={0.01}
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
                    control={paymentForm.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="momo">Mobile Money</SelectItem>
                            <SelectItem value="credit_card">Card</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={paymentForm.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Date</FormLabel>
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
                    control={paymentForm.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Number (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Transaction ref. number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={paymentForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
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
              </form>
            </Form>
          </>
        )}
      </MobileFormDialog>

      <Dialog open={printModalVisible} onOpenChange={setPrintModalVisible}>
        <DialogContent className="max-w-[100vw] sm:max-w-6xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button]:no-print">
          <DialogHeader className="px-3 sm:px-6 py-3 border-b flex-shrink-0 text-left no-print">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <DialogTitle>Print Invoice</DialogTitle>
                <DialogDescription className="sr-only sm:not-sr-only">
                  Preview, download, or print this invoice
                </DialogDescription>
              </div>
              <div className="flex gap-2 w-full sm:w-auto no-print">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                  onClick={handleDownloadInvoice}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button className="flex-1 sm:flex-initial" onClick={handlePrintInvoice}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </DialogHeader>
          {viewingInvoice && (
            <div className="print-invoice-preview flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-2 sm:p-4">
              <div
                ref={printPreviewRef}
                className="print-invoice-preview-inner w-full max-w-full sm:max-w-[900px] sm:mx-auto"
              >
                <PrintableInvoice
                  invoice={viewingInvoice}
                  organization={printOrganization}
                  screenLayout={isMobile ? 'mobile' : 'auto'}
                  printConfig={invoicePrintConfig}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isCancelledInvoice(invoiceToDelete) ? 'Delete cancelled invoice?' : 'Delete draft invoice?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {invoiceToDelete
                ? `Are you sure you want to delete ${isCancelledInvoice(invoiceToDelete) ? 'cancelled' : 'draft'} invoice "${invoiceToDelete.invoiceNumber || invoiceToDelete.id}"? This cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => invoiceToDelete && handleDeleteInvoice(invoiceToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!invoiceToCancel} onOpenChange={(open) => !open && setInvoiceToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {invoiceToCancel
                ? `Are you sure you want to cancel invoice "${invoiceToCancel.invoiceNumber || invoiceToCancel.id}"?`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => invoiceToCancel && handleCancelInvoice(invoiceToCancel.id)}
            >
              Cancel Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Invoices;
