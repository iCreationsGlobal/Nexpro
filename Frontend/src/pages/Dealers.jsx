import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Loader2, RefreshCw, Building2, Wallet, CreditCard, Pencil, Printer, Download, ShoppingCart, Trash2,
} from 'lucide-react';
import dealerService from '../services/dealerService';
import settingsService from '../services/settingsService';
import { mergeBranchOrganization } from '../utils/branchOrganization';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DashboardTable from '../components/DashboardTable';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { showSuccess, showError, handleApiError } from '../utils/toast';
import { getEmptyStateProps } from '../components/ui/empty-state';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import MobileFormDialog from '../components/MobileFormDialog';
import FormFieldGrid from '../components/FormFieldGrid';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, CURRENCY } from '../constants';
import { numberInputValue, handleNumberChange } from '../utils/formUtils';
import { generatePDF, openPrintDialog } from '../utils/pdfUtils';
import { QUERY_STALE } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import { usePagedList } from '../hooks/usePagedList';
import { formatAmount } from '../utils/formatNumber';
import PrintableDealerStatement from '../components/PrintableDealerStatement';

/** Dealers in one list response (`{ data: [...], count }`). */
const dealerRowsFromResponse = (response) => {
  const rows = response?.data || [];
  return Array.isArray(rows) ? rows : [];
};

const optionalString = z.preprocess(
  (val) => (val === null || val === undefined ? '' : val),
  z.string()
);

const dealerSchema = z.object({
  businessName: z.string().min(1, 'Enter business name'),
  contactName: optionalString,
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: optionalString,
  creditTerms: optionalString,
  creditLimit: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().min(0, 'Credit limit cannot be negative')
  ),
  openingBalance: z.preprocess(
    (val) => (val === '' || val == null ? 0 : Number(val)),
    z.number().min(0, 'Opening balance cannot be negative')
  ),
  notes: optionalString,
});

const paymentSchema = z.object({
  amount: z.preprocess(
    (val) => Number(val),
    z.number().positive('Enter a valid payment amount')
  ),
  paymentMethod: z.string().min(1),
  referenceNumber: optionalString,
  notes: optionalString,
});

const Dealers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearchText = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const navigate = useNavigate();
  const { activeTenantId, isManager, isAdmin, hasFeature } = useAuth();
  const dealersAccountEnabled = hasFeature('dealersAccount');
  const shopContext = useShopOptional();
  const queryClient = useQueryClient();

  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingDealer, setViewingDealer] = useState(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDealerTarget, setDeleteDealerTarget] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [statementData, setStatementData] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [statementStart, setStatementStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [statementEnd, setStatementEnd] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [isDownloadingStatementPdf, setIsDownloadingStatementPdf] = useState(false);
  const [filters, setFilters] = useState({ isActive: 'all' });
  const statementPreviewRef = useRef(null);
  const statementModalRef = useRef(null);

  const form = useForm({
    resolver: zodResolver(dealerSchema),
    defaultValues: {
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      creditTerms: '',
      creditLimit: 0,
      openingBalance: 0,
      notes: '',
    },
  });

  const paymentForm = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: '',
      paymentMethod: 'cash',
      referenceNumber: '',
      notes: '',
    },
  });

  useEffect(() => {
    setPageSearchConfig({ scope: 'dealers', placeholder: SEARCH_PLACEHOLDERS.CUSTOMERS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditingDealer(null);
      form.reset();
      setModalVisible(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, form]);

  const listFilterParams = useMemo(() => ({
    search: debouncedSearchText,
    ...(filters.isActive !== 'all' ? { isActive: filters.isActive === 'true' } : {}),
  }), [debouncedSearchText, filters.isActive]);

  const { data: statsResponse, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.dealers.stats(activeTenantId),
    queryFn: () => dealerService.getStats(),
    staleTime: QUERY_STALE.DEFAULT,
    enabled: !!activeTenantId,
  });

  // Pages on desktop; loads as you scroll on phones and tablets.
  const {
    rows: dealers,
    total: dealersTotal,
    isLoading,
    refetch,
    infinite: dealersInfinite,
  } = usePagedList({
    queryKey: (params) => queryKeys.dealers.list(activeTenantId, params),
    params: listFilterParams,
    fetchPage: (params) => dealerService.getAll(params),
    getRows: dealerRowsFromResponse,
    getTotal: (response, rows) => response?.count ?? response?.pagination?.total ?? rows.length,
    page: pagination.current,
    pageSize: pagination.pageSize,
    staleTime: QUERY_STALE.DEFAULT,
    enabled: !!activeTenantId,
  });

  const { data: ledgerResponse, isLoading: ledgerLoading } = useQuery({
    queryKey: queryKeys.dealers.ledger(viewingDealer?.id, { page: 1, limit: 50 }),
    queryFn: () => dealerService.getLedger(viewingDealer.id, { page: 1, limit: 50 }),
    enabled: drawerVisible && !!viewingDealer?.id,
    staleTime: QUERY_STALE.SHORT,
  });

  const ledgerEntries = ledgerResponse?.data || [];

  const saveMutation = useMutation({
    mutationFn: async (values) => {
      if (editingDealer?.id) {
        const { openingBalance, ...payload } = values;
        return dealerService.update(editingDealer.id, payload);
      }
      return dealerService.create(values);
    },
    onSuccess: () => {
      showSuccess(editingDealer ? 'Dealer updated' : 'Dealer created');
      setModalVisible(false);
      setEditingDealer(null);
      form.reset();
      queryClient.invalidateQueries({ queryKey: queryKeys.dealers.all });
    },
    onError: (err) => handleApiError(err, 'Failed to save dealer'),
  });

  const openPaymentDialog = useCallback(() => {
    paymentForm.reset({
      amount: '',
      paymentMethod: 'cash',
      referenceNumber: '',
      notes: '',
    });
    setPaymentDialogOpen(true);
  }, [paymentForm]);

  const handleSellToDealer = useCallback(() => {
    if (!viewingDealer?.id) return;
    setDrawerVisible(false);
    navigate(`/sales?openPOS=1&mode=dealer&dealerId=${viewingDealer.id}`);
  }, [viewingDealer?.id, navigate]);

  const paymentMutation = useMutation({
    mutationFn: (values) => dealerService.recordPayment(viewingDealer.id, values),
    onSuccess: (res) => {
      showSuccess('Payment recorded');
      setPaymentDialogOpen(false);
      paymentForm.reset();
      const updated = res?.data?.dealer || res?.dealer;
      if (updated) setViewingDealer(updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.dealers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dealers.ledger(viewingDealer.id) });
    },
    onError: (err) => handleApiError(err, 'Failed to record payment'),
  });

  const openDeleteDealerDialog = useCallback(async (dealer) => {
    if (!dealer?.id) return;
    setDeleteDealerTarget(dealer);
    setDeleteConfirmName('');
    setDeleteImpact(null);
    setDeleteImpactLoading(true);
    try {
      const res = await dealerService.getDeleteImpact(dealer.id);
      setDeleteImpact(res?.data?.data || res?.data || res);
    } catch (err) {
      handleApiError(err, 'Failed to load delete impact');
      setDeleteDealerTarget(null);
    } finally {
      setDeleteImpactLoading(false);
    }
  }, []);

  const deleteDealerMutation = useMutation({
    mutationFn: ({ id, confirmName }) => dealerService.delete(id, { confirmName }),
    onSuccess: () => {
      showSuccess('Dealer permanently deleted');
      setDeleteDealerTarget(null);
      setDeleteConfirmName('');
      setDeleteImpact(null);
      setDrawerVisible(false);
      setViewingDealer(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.dealers.all });
    },
    onError: (err) => handleApiError(err, 'Failed to delete dealer'),
  });

  const deleteConfirmMatches = useMemo(() => {
    const expected = String(deleteDealerTarget?.businessName || '').trim().toLowerCase();
    const typed = String(deleteConfirmName || '').trim().toLowerCase();
    return Boolean(expected) && expected === typed;
  }, [deleteDealerTarget?.businessName, deleteConfirmName]);

  const loadStatement = useCallback(async () => {
    if (!viewingDealer?.id) return;
    try {
      const res = await dealerService.getStatement(viewingDealer.id, {
        startDate: statementStart,
        endDate: statementEnd,
      });
      setStatementData(res?.data || res);
    } catch (err) {
      handleApiError(err, 'Failed to load statement');
    }
  }, [viewingDealer?.id, statementStart, statementEnd]);

  useEffect(() => {
    if (drawerVisible && viewingDealer?.id) {
      loadStatement();
    }
  }, [drawerVisible, viewingDealer?.id, statementStart, statementEnd, loadStatement]);

  useEffect(() => {
    settingsService.getOrganization().then((org) => {
      setOrganization(mergeBranchOrganization(org, shopContext?.activeShop));
    }).catch(() => {});
  }, [shopContext?.activeShop]);

  const statementPdfFilename = useMemo(() => {
    const dealerSlug = (viewingDealer?.businessName || 'dealer').replace(/[^\w-]+/g, '-');
    return `dealer-statement-${dealerSlug}-${statementStart}-to-${statementEnd}.pdf`;
  }, [viewingDealer?.businessName, statementStart, statementEnd]);

  const getStatementPrintWrapper = useCallback(() => {
    if (printModalOpen && statementModalRef.current) return statementModalRef.current;
    return statementPreviewRef.current;
  }, [printModalOpen]);

  const getStatementPrintElement = useCallback(() => {
    const wrapper = getStatementPrintWrapper();
    if (!wrapper) return null;
    const printableId = printModalOpen
      ? 'printable-dealer-statement-modal'
      : 'printable-dealer-statement';
    return wrapper.querySelector(`#${printableId}`);
  }, [getStatementPrintWrapper, printModalOpen]);

  const handleDownloadStatementPdf = useCallback(async () => {
    const element = getStatementPrintElement();
    if (!element || !statementData) {
      showError(null, 'Generate a statement before downloading');
      return;
    }
    setIsDownloadingStatementPdf(true);
    try {
      await generatePDF(element, {
        filename: statementPdfFilename,
        format: 'a4',
        orientation: 'portrait',
      });
      showSuccess('Statement downloaded successfully');
    } catch (error) {
      console.error('PDF generation error:', error);
      handleApiError(error, 'Failed to download statement PDF');
    } finally {
      setIsDownloadingStatementPdf(false);
    }
  }, [getStatementPrintElement, statementData, statementPdfFilename]);

  const handlePrintStatement = useCallback(() => {
    const wrapper = getStatementPrintWrapper();
    if (!wrapper || !statementData) return;
    openPrintDialog(wrapper, `Dealer-Statement-${viewingDealer?.businessName || 'dealer'}`);
  }, [statementData, viewingDealer?.businessName, getStatementPrintWrapper]);

  const openCreate = () => {
    setEditingDealer(null);
    form.reset();
    setModalVisible(true);
  };

  const openEdit = (dealer) => {
    setEditingDealer(dealer);
    form.reset({
      businessName: dealer.businessName || '',
      contactName: dealer.contactName || '',
      email: dealer.email || '',
      phone: dealer.phone || '',
      creditTerms: dealer.creditTerms || '',
      creditLimit: parseFloat(dealer.creditLimit || 0),
      openingBalance: 0,
      notes: dealer.notes || '',
    });
    setModalVisible(true);
  };

  const openDrawer = (dealer) => {
    setViewingDealer(dealer);
    setDrawerVisible(true);
  };

  const handleClearFilters = useCallback(() => {
    setFilters({ isActive: 'all' });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveFilters = filters.isActive !== 'all' || !!debouncedSearchText.trim();

  const dealersEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(
          {
            icon: 'Users',
            title: 'No matching dealers',
            description: 'Try adjusting your filters or search terms.',
            primaryAction: 'Clear Filters',
          },
          { primary: handleClearFilters }
        );
      }
      return getEmptyStateProps(
        { title: 'No dealers yet', description: 'Add your first dealer account to track wholesale balances.', primaryAction: 'Add dealer' },
        { primary: openCreate }
      );
    },
    [hasActiveFilters, handleClearFilters, openCreate]
  );

  const stats = statsResponse?.data || statsResponse || {};

  const columns = useMemo(() => [
    {
      key: 'businessName',
      label: 'Dealer',
      render: (_, row) => (
        <div>
          <div className="font-medium">{row.businessName}</div>
          {row.contactName && <div className="text-xs text-muted-foreground">{row.contactName}</div>}
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (value) => value || '—',
    },
    {
      key: 'balance',
      label: 'Outstanding',
      render: (value) => (
        <span className={parseFloat(value || 0) > 0 ? 'font-semibold text-amber-700' : ''}>
          {formatAmount(value)}
        </span>
      ),
    },
    {
      key: 'availableCredit',
      label: 'Available credit',
      render: (_, row) => formatAmount(row.availableCredit ?? Math.max(parseFloat(row.creditLimit || 0) - parseFloat(row.balance || 0), 0)),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (value) => (
        <StatusChip status={value ? 'active' : 'inactive'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <Button variant="outline" size="sm" onClick={() => openDrawer(row)}>View</Button>
      ),
    },
  ], []);

  const drawerTabs = useMemo(() => [
    {
      key: 'overview',
      label: 'Overview',
      content: viewingDealer ? (
        <div className="space-y-4">
          <DrawerSectionCard title="Account">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Outstanding</span><div className="font-semibold">{formatAmount(viewingDealer.balance)}</div></div>
              <div><span className="text-muted-foreground">Credit limit</span><div>{formatAmount(viewingDealer.creditLimit)}</div></div>
              <div><span className="text-muted-foreground">Available credit</span><div>{formatAmount(viewingDealer.availableCredit)}</div></div>
              <div><span className="text-muted-foreground">Terms</span><div>{viewingDealer.creditTerms || '—'}</div></div>
            </div>
          </DrawerSectionCard>
          <DrawerSectionCard title="Contact">
            <div className="text-sm space-y-1">
              <div>{viewingDealer.contactName || '—'}</div>
              <div>{viewingDealer.phone || '—'}</div>
              <div>{viewingDealer.email || '—'}</div>
            </div>
          </DrawerSectionCard>
          {viewingDealer.notes && (
            <DrawerSectionCard title="Notes"><p className="text-sm whitespace-pre-wrap">{viewingDealer.notes}</p></DrawerSectionCard>
          )}
        </div>
      ) : null,
    },
    {
      key: 'activity',
      label: 'Activity',
      content: ledgerLoading ? <TableSkeleton rows={5} cols={4} /> : (
        <div className="space-y-2">
          {ledgerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger activity yet.</p>
          ) : ledgerEntries.map((entry) => (
            <Card key={entry.id} className="border border-[#e5e7eb]">
              <CardContent className="p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{entry.description || entry.entryType}</div>
                    <div className="text-xs text-muted-foreground">{dayjs(entry.entryDate).format('DD MMM YYYY HH:mm')}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">{entry.direction === 'debit' ? '+' : '−'}{formatAmount(entry.amount)}</Badge>
                    <div className="text-xs mt-1">Bal {formatAmount(entry.balanceAfter)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'statements',
      label: 'Statements',
      content: (
        <div className="space-y-4">
          <FormFieldGrid columns={2}>
            <div>
              <label className="text-sm font-medium">From</label>
              <Input type="date" value={statementStart} onChange={(e) => setStatementStart(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">To</label>
              <Input type="date" value={statementEnd} onChange={(e) => setStatementEnd(e.target.value)} />
            </div>
          </FormFieldGrid>
          <p className="text-xs text-muted-foreground">
            Defaults to the current month. Adjust dates for a custom period.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadStatement}>Refresh</Button>
            <Button variant="outline" onClick={() => setPrintModalOpen(true)} disabled={!statementData}>
              <Printer className="h-4 w-4 mr-2" />Preview
            </Button>
            <Button variant="outline" onClick={handlePrintStatement} disabled={!statementData}>
              <Printer className="h-4 w-4 mr-2" />Print
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadStatementPdf}
              disabled={!statementData || isDownloadingStatementPdf}
            >
              {isDownloadingStatementPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          </div>
          {statementData && (
            <div
              ref={statementPreviewRef}
              className="border border-[#e5e7eb] rounded-lg overflow-hidden max-h-[420px] overflow-y-auto"
            >
              <PrintableDealerStatement
                statement={statementData}
                organization={organization}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'settings',
      label: 'Settings',
      content: viewingDealer ? (
        <div className="space-y-4">
          <Alert className="border border-[#e5e7eb]">
            <AlertDescription className="text-sm">
              Update dealer profile, credit limit, and terms. Ledger adjustments require a manager.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => openEdit(viewingDealer)}>
            <Pencil className="h-4 w-4 mr-2" />Edit dealer
          </Button>
          {(isManager || isAdmin) && (
            <Button variant="outline" onClick={openPaymentDialog}>
              Record payment
            </Button>
          )}
          {isAdmin && (
            <div className="pt-2 border-t border-[#e5e7eb] space-y-2">
              <Alert className="border border-[#e5e7eb]">
                <AlertDescription className="text-sm">
                  Permanent delete removes this dealer, all related sales (stock restored), payments, ledger entries, and prices. ABS does not refund cash or MoMo.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => openDeleteDealerDialog(viewingDealer)}
              >
                <Trash2 className="h-4 w-4 mr-2" />Delete dealer
              </Button>
            </div>
          )}
        </div>
      ) : null,
    },
  ], [
    viewingDealer,
    ledgerEntries,
    ledgerLoading,
    statementStart,
    statementEnd,
    statementData,
    organization,
    isManager,
    isAdmin,
    openPaymentDialog,
    openDeleteDealerDialog,
    loadStatement,
    handlePrintStatement,
    handleDownloadStatementPdf,
    isDownloadingStatementPdf,
  ]);

  return (
    <div className="space-y-6">
      <WelcomeSection
        welcomeMessage="Dealers"
        subText="Manage wholesale dealer accounts, balances, and statements across your organisation."
      />

      <div className="flex justify-end -mt-2 mb-4">
        <Button onClick={openCreate} className="bg-[#166534] hover:bg-[#14532d]">
          <Plus className="h-4 w-4 mr-2" />Add dealer
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardStatsCard title="Total dealers" value={stats.totalDealers ?? 0} icon={Building2} iconBgColor="#dcfce7" iconColor="#166534" loading={statsLoading} />
        <DashboardStatsCard title="Total outstanding" value={formatAmount(stats.totalOutstanding ?? 0)} icon={Wallet} iconBgColor="#fef3c7" iconColor="#b45309" loading={statsLoading} />
        <DashboardStatsCard title="Available credit" value={formatAmount(stats.totalAvailableCredit ?? 0)} icon={CreditCard} iconBgColor="#dbeafe" iconColor="#1d4ed8" loading={statsLoading} />
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={filters.isActive} onValueChange={(value) => setFilters({ isActive: value })}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <DashboardTable
          columns={columns}
          data={dealers}
          loading={isLoading}
          emptyState={dealersEmptyState}
          pageSize={pagination.pageSize}
          externalPagination={{ current: pagination.current, total: dealersTotal }}
          onPageChange={(newPagination) => setPagination((prev) => ({ ...prev, ...newPagination }))}
          infinite={dealersInfinite}
        />
      )}

      <MobileFormDialog
        open={modalVisible}
        onOpenChange={setModalVisible}
        title={editingDealer ? 'Edit dealer' : 'Add dealer'}
        description="Dealer accounts are shared across all branches. Wholesale prices are still set per branch catalogue."
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4">
            <FormField control={form.control} name="businessName" render={({ field }) => (
              <FormItem><FormLabel>Business name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="contactName" render={({ field }) => (
              <FormItem><FormLabel>Contact name (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormFieldGrid columns={2}>
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
              )} />
            </FormFieldGrid>
            <FormFieldGrid columns={2}>
              <FormField control={form.control} name="creditLimit" render={({ field }) => (
                <FormItem><FormLabel>Credit limit (optional)</FormLabel><FormControl><Input {...field} type="number" min="0" step="0.01" /></FormControl><FormMessage /></FormItem>
              )} />
              {!editingDealer && (
                <FormField control={form.control} name="openingBalance" render={({ field }) => (
                  <FormItem><FormLabel>Opening balance (optional)</FormLabel><FormControl><Input {...field} type="number" min="0" step="0.01" /></FormControl><FormMessage /></FormItem>
                )} />
              )}
            </FormFieldGrid>
            <FormField control={form.control} name="creditTerms" render={({ field }) => (
              <FormItem><FormLabel>Credit terms (optional)</FormLabel><FormControl><Input {...field} placeholder="e.g. Net 30" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-[#166534] hover:bg-[#14532d]">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingDealer ? 'Save changes' : 'Create dealer')}
              </Button>
            </div>
          </form>
        </Form>
      </MobileFormDialog>

      <DetailsDrawer
        open={drawerVisible}
        onOpenChange={setDrawerVisible}
        onClose={() => setDrawerVisible(false)}
        title={viewingDealer?.businessName || 'Dealer'}
        description={viewingDealer?.contactName || 'Dealer account details'}
        tabs={drawerTabs}
        onEdit={() => openEdit(viewingDealer)}
        secondaryAction={dealersAccountEnabled && viewingDealer?.isActive !== false ? {
          label: 'Sell to dealer',
          onClick: handleSellToDealer,
          icon: <ShoppingCart className="h-4 w-4" />,
        } : null}
        primaryAction={{
          label: 'Record payment',
          onClick: openPaymentDialog,
        }}
      />

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Payment reduces {viewingDealer?.businessName}&apos;s outstanding balance immediately.</DialogDescription>
          </DialogHeader>
          <Form {...paymentForm}>
            <form id="dealer-payment-form" onSubmit={paymentForm.handleSubmit((values) => paymentMutation.mutate(values))}>
              <DialogBody>
                <div className="space-y-4">
                  <FormField
                    control={paymentForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <div className="relative">
                          <span
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          >
                            {CURRENCY.SYMBOL}
                          </span>
                          <FormControl>
                            <Input
                              type="number"
                              min={0.01}
                              step={0.01}
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0.00"
                              className="pl-8"
                              value={numberInputValue(field.value)}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => handleNumberChange(e, field.onChange)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={paymentForm.control} name="paymentMethod" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="mobile_money">Mobile money</SelectItem>
                          <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={paymentForm.control} name="referenceNumber" render={({ field }) => (
                    <FormItem><FormLabel>Reference (optional)</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={paymentForm.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea {...field} rows={2} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={paymentMutation.isPending} className="bg-[#166534] hover:bg-[#14532d]">
                  {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record payment'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        {printModalOpen && statementData && (
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Statement preview</DialogTitle>
              <DialogDescription>
                Review the dealer account statement before printing or downloading.
              </DialogDescription>
            </DialogHeader>
            <div ref={statementModalRef}>
              <PrintableDealerStatement
                statement={statementData}
                organization={organization}
                printableId="printable-dealer-statement-modal"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrintModalOpen(false)}>Close</Button>
              <Button variant="outline" onClick={handlePrintStatement}>
                <Printer className="h-4 w-4 mr-2" />Print
              </Button>
              <Button
                className="bg-[#166534] hover:bg-[#14532d]"
                onClick={handleDownloadStatementPdf}
                disabled={isDownloadingStatementPdf}
              >
                {isDownloadingStatementPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog
        open={!!deleteDealerTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDealerTarget(null);
            setDeleteConfirmName('');
            setDeleteImpact(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dealer permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This permanently removes{' '}
                  <span className="font-medium text-foreground">
                    {deleteDealerTarget?.businessName || 'this dealer'}
                  </span>{' '}
                  and all related records. It cannot be undone.
                </p>
                {deleteImpactLoading ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading impact…
                  </p>
                ) : deleteImpact ? (
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{deleteImpact.salesCount ?? 0} sale{(deleteImpact.salesCount === 1) ? '' : 's'} (stock restored where applicable)</li>
                    <li>{deleteImpact.paymentsCount ?? 0} payment{(deleteImpact.paymentsCount === 1) ? '' : 's'}</li>
                    <li>Outstanding balance {formatAmount(deleteImpact.balance ?? deleteDealerTarget?.balance ?? 0)}</li>
                  </ul>
                ) : null}
                <p>
                  ABS removes accounting records but does not refund cash or MoMo already collected.
                  Sales with returns or exchanges will block this delete.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-dealer-confirm-name">
              Type <span className="font-medium text-foreground">{deleteDealerTarget?.businessName}</span> to confirm
            </Label>
            <Input
              id="delete-dealer-confirm-name"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder="Dealer business name"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteDealerMutation.isPending
                || deleteImpactLoading
                || !deleteConfirmMatches
              }
              onClick={(e) => {
                e.preventDefault();
                if (!deleteDealerTarget || !deleteConfirmMatches) return;
                deleteDealerMutation.mutate({
                  id: deleteDealerTarget.id,
                  confirmName: deleteConfirmName.trim(),
                });
              }}
            >
              {deleteDealerMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
              ) : (
                'Delete permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dealers;
