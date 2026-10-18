import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AppWindow,
  Plus,
  RefreshCw,
  Inbox,
  AlertTriangle,
  Currency,
  PlusCircle,
  Pencil,
  ArrowUp,
  ArrowDown,
  Loader2,
  Filter,
  Package,
  Upload,
  Download,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { usePagedList } from '../hooks/usePagedList';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import ActionColumn from '../components/ActionColumn';
import StatusChip from '../components/StatusChip';
import TableSkeleton from '../components/TableSkeleton';
import DetailSkeleton from '../components/DetailSkeleton';
import DashboardTable from '../components/DashboardTable';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import materialsService from '../services/materialsService';
import vendorService from '../services/vendorService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useSmartSearch } from '../context/SmartSearchContext';
import { showSuccess, showError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { numberInputValue, handleNumberChange } from '../utils/formUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Timeline, TimelineItem, TimelineIndicator, TimelineContent, TimelineTitle, TimelineDescription, TimelineTime } from '@/components/ui/timeline';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
} from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, getStockStatus, PRODUCT_UNITS, RESTAURANT_UNITS, SHOP_TYPES } from '../constants';
import { formatAmount } from '../utils/formatNumber';

/** Materials in one list response (`{ data: [...], count }`). */
const materialRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const sortCategories = (list = []) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name));

const stockStatus = (item) => {
  const quantity = parseFloat(item.quantityOnHand || 0);
  const reorder = parseFloat(item.reorderLevel || 0);

  if (quantity <= 0) {
    return { color: 'destructive', label: 'Out of stock' };
  }
  if (quantity <= reorder) {
    return { color: 'secondary', label: 'Low stock' };
  }
  return { color: 'default', label: 'In stock' };
};

const valueFormatter = (value) => formatAmount(value);

const numOrEmpty = (min = 0) => z.union([z.number().min(min), z.literal('')]).transform((v) => (v === '' ? (min === 0 ? 0 : undefined) : v));
const itemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  sku: z.string().optional(),
  categoryId: z.string().optional(),
  unit: z.string().min(1, 'Unit is required'),
  quantityOnHand: numOrEmpty(0),
  reorderLevel: numOrEmpty(0),
  preferredVendorId: z.string().optional(),
  unitCost: numOrEmpty(0),
  location: z.string().optional(),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
});

const quickVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  company: z.string().optional(),
  phone: z.string().optional()
});

const restockSchema = z.object({
  quantity: z.union([z.number(), z.literal('')]).transform((v) => (v === '' ? 0 : v)).refine((v) => v >= 0.01, 'Quantity must be greater than 0'),
  unitCost: z.union([z.number().min(0), z.literal('')]).transform((v) => (v === '' ? undefined : v)).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const adjustSchema = z.object({
  adjustmentMode: z.enum(['set', 'delta']),
  newQuantity: z.union([z.number().min(0), z.literal('')]).transform((v) => (v === '' ? undefined : v)).optional(),
  quantityDelta: z.union([z.number(), z.literal('')]).transform((v) => (v === '' ? undefined : v)).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.adjustmentMode === 'set') {
    return data.newQuantity !== undefined && data.newQuantity !== '';
  }
  return data.quantityDelta !== undefined && data.quantityDelta !== '';
}, {
  message: 'Quantity is required',
  path: ['newQuantity'],
});

const Materials = () => {
  const { activeTenant, activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();
  const businessType = activeTenant?.businessType || 'printing_press';
  const shopType =
    activeTenant?.metadata?.businessSubType ||
    activeTenant?.metadata?.shopType ||
    null;
  const isPrintingPress = businessType === 'printing_press';

  const unitOptions = useMemo(() => {
    if (shopType === SHOP_TYPES?.RESTAURANT) {
      return [...PRODUCT_UNITS, ...RESTAURANT_UNITS];
    }
    return PRODUCT_UNITS;
  }, [shopType]);

  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [refreshingMaterials, setRefreshingMaterials] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalContext, setCategoryModalContext] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deactivateItemId, setDeactivateItemId] = useState(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivatingItem, setDeactivatingItem] = useState(false);
  const [filters, setFilters] = useState({
    categoryId: 'all',
    status: 'all',
    lowStock: false,
    outOfStock: false
  });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [vendorAddModalOpen, setVendorAddModalOpen] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [materialVendorSelectOpen, setMaterialVendorSelectOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    setPageSearchConfig({ scope: 'materials', placeholder: SEARCH_PLACEHOLDERS.MATERIALS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  // Clear vendor list when tenant changes so we don't show another tenant's vendors
  useEffect(() => {
    setVendors([]);
  }, [activeTenantId]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (!itemModalVisible) setMaterialVendorSelectOpen(false);
  }, [itemModalVisible]);

  const itemForm = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      sku: '',
      categoryId: '',
      unit: 'pcs',
      quantityOnHand: 0,
      reorderLevel: 0,
      preferredVendorId: '',
      unitCost: 0,
      location: '',
      isActive: true,
      description: '',
    },
  });

  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const restockForm = useForm({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      quantity: 1,
      unitCost: 0,
      reference: '',
      notes: '',
    },
  });

  const adjustForm = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      adjustmentMode: 'set',
      newQuantity: 0,
      quantityDelta: 0,
      reason: '',
      notes: '',
    },
  });

  const vendorForm = useForm({
    resolver: zodResolver(quickVendorSchema),
    defaultValues: { name: '', company: '', phone: '' },
  });

  const adjustmentMode = adjustForm.watch('adjustmentMode');

  useEffect(() => {
    fetchCategories();
    fetchSummary();
  }, []);

  const materialFilterParams = useMemo(() => {
    const params = {
      categoryId: filters.categoryId !== 'all' ? filters.categoryId : undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      lowStock: filters.lowStock,
      outOfStock: filters.outOfStock,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters.categoryId, filters.status, filters.lowStock, filters.outOfStock, debouncedSearch]);

  // Pages on desktop; loads as you scroll on phones and tablets.
  const {
    rows: items,
    total: itemsCount,
    isLoading: loading,
    refetch: refetchItems,
    error: itemsError,
    infinite: itemsInfinite,
  } = usePagedList({
    queryKey: (params) => ['materials', 'items', activeTenantId, activeShopId, activeStudioLocationId, params],
    params: materialFilterParams,
    fetchPage: (params) => materialsService.getItems(params),
    getRows: materialRowsFromResponse,
    getTotal: (response, rows) => response?.count ?? response?.pagination?.total ?? rows.length,
    page: pagination.current,
    pageSize: pagination.pageSize,
    enabled: scopeReady,
    // Always fresh when the page opens, like before it used React Query.
    staleTime: 0,
  });

  useEffect(() => {
    if (!itemsError) return;
    console.error('Failed to load materials', itemsError);
    showError(itemsError, 'Failed to load materials');
  }, [itemsError]);

  useEffect(() => {
    if (!scopeReady) return;
    fetchSummary();
  }, [scopeReady, activeTenantId, activeShopId, activeStudioLocationId, shopContext?.isShopWorkspace]);

  const fetchCategories = async () => {
    try {
      const response = await materialsService.getCategories();
      const data = response?.data || [];
      setCategories(sortCategories(data));
    } catch (error) {
      console.error('Failed to load categories', error);
      showError(error, 'Failed to load categories');
    }
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await materialsService.getSummary();
      setSummary(response?.data || {});
    } catch (error) {
      console.error('Failed to load materials summary', error);
      showError(error, 'Failed to load materials summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  /** Reload the list (every loaded page on phones and tablets); `isRefresh` spins the refresh button. */
  const fetchItems = async (isRefresh = false) => {
    if (isRefresh) setRefreshingMaterials(true);
    try {
      await refetchItems();
    } finally {
      if (isRefresh) setRefreshingMaterials(false);
    }
  };

  // Backend returns paginated data; items is the current page (every loaded row on phones and tablets)
  const paginatedItems = items;

  // Use summary from API (accurate) when available; fallback to 0
  const displayStats = useMemo(() => ({
    totalItems: summary?.totals?.totalItems ?? 0,
    inStock: summary?.totals?.inStockCount ?? 0,
    lowStock: summary?.totals?.lowStockCount ?? 0,
    outOfStock: summary?.totals?.outOfStockCount ?? 0,
  }), [summary?.totals]);

  const loadVendors = async () => {
    try {
      const response = await vendorService.getVendors({ limit: 100 });
      setVendors(response?.data || []);
    } catch (error) {
      console.error('Failed to load vendors', error);
    }
  };

  const openCategoryModal = (context = null) => {
    categoryForm.reset();
    setCategoryModalContext(context);
    setCategoryModalVisible(true);
  };

  const handleAddVendorSubmit = async (values) => {
    setAddingVendor(true);
    try {
      const response = await vendorService.create({ name: values.name, company: values.company || undefined, phone: values.phone || undefined });
      const newVendor = response?.data ?? response;
      if (!newVendor?.id) throw new Error('Invalid vendor response');
      await loadVendors();
      setVendorAddModalOpen(false);
      vendorForm.reset({ name: '', company: '', phone: '' });
      showSuccess('Vendor created successfully');
      itemForm.setValue('preferredVendorId', newVendor.id);
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to create vendor');
    } finally {
      setAddingVendor(false);
    }
  };

  const onCategorySubmit = async (values) => {
    try {
      const payload = await materialsService.createCategory(values);
      const newCategory = payload?.data || payload;
      if (!newCategory?.id) {
        throw new Error('Invalid category response');
      }
      setCategories((prev) => sortCategories([...prev, newCategory]));
      showSuccess('Category added successfully');
      setCategoryModalVisible(false);

      if (categoryModalContext === 'filter') {
        setFilters((prev) => ({ ...prev, categoryId: newCategory.id }));
        setPagination((prev) => ({ ...prev, current: 1 }));
      } else if (categoryModalContext === 'item') {
        itemForm.setValue('categoryId', newCategory.id);
      }

      setCategoryModalContext(null);
      fetchSummary();
    } catch (error) {
      console.error('Failed to create category', error);
      showError(error, error?.response?.data?.message || 'Failed to create category');
    }
  };

  const handleTableChange = useCallback((newPagination) => {
    setPagination((prev) => ({
      ...prev,
      current: newPagination.current,
      pageSize: newPagination.pageSize
    }));
  }, []);

  const handleCategoryChange = useCallback((value) => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    setFilters((prev) => ({ ...prev, categoryId: value }));
  }, []);

  const handleStatusChange = useCallback((value) => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    setFilters((prev) => ({ ...prev, status: value }));
  }, []);

  const handleLowStockToggle = useCallback((checked) => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    setFilters((prev) => ({ ...prev, lowStock: checked }));
  }, []);

  const handleDownloadMaterialsTemplate = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const blob = await materialsService.getImportTemplate();
      const url = URL.createObjectURL(blob?.data ?? blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'materials_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded');
    } catch (err) {
      showError(err?.response?.data?.message ?? err?.message ?? 'Failed to download template');
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  const handleMaterialsImportSubmit = useCallback(async () => {
    if (!importFile) {
      showError('Please select a CSV or Excel file');
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const result = await materialsService.importItems(importFile);
      setImportResult(result);
      const success = result?.successCount ?? 0;
      const failed = result?.errorCount ?? 0;
      if (success > 0) {
        showSuccess(`${success} material(s) imported`);
        fetchItems(true);
        fetchSummary();
      }
      if (failed > 0 && success === 0) {
        showError(`${failed} row(s) failed. Check the errors below.`);
      }
    } catch (err) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Import failed';
      showError(msg);
      setImportResult({ successCount: 0, errorCount: 1, errors: [{ row: 0, message: msg }] });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, fetchItems, fetchSummary]);

  const handleViewItem = useCallback((record) => {
    setViewingItem(record);
    setDrawerVisible(true);
    materialsService.getById(record.id)
      .then((response) => {
        const data = response?.data || response;
        setViewingItem((prev) => (prev?.id === record.id ? data : prev));
      })
      .catch((error) => {
        console.error('Failed to fetch material', error);
        showError(error, 'Failed to load material details');
      });
  }, []);

  const openItemModal = useCallback(async (item = null) => {
    if (!vendors.length) {
      await loadVendors();
    }

    setEditingItem(item);
    if (item) {
      itemForm.reset({
        name: item.name,
        sku: item.sku || '',
        categoryId: item.categoryId || '',
        unit: item.unit,
        quantityOnHand: parseFloat(item.quantityOnHand || 0),
        reorderLevel: parseFloat(item.reorderLevel || 0),
        preferredVendorId: item.preferredVendorId || '',
        unitCost: parseFloat(item.unitCost || 0),
        location: item.location || '',
        isActive: item.isActive,
        description: item.description || '',
      });
    } else {
      itemForm.reset({
        name: '',
        sku: '',
        categoryId: '',
        unit: 'pcs',
        quantityOnHand: 0,
        reorderLevel: 0,
        preferredVendorId: '',
        unitCost: 0,
        location: '',
        isActive: true,
        description: '',
      });
    }

    setItemModalVisible(true);
  }, [vendors, loadVendors, itemForm]);

  const onItemSubmit = useCallback(async (values) => {
    try {
      if (editingItem) {
        await materialsService.updateItem(editingItem.id, values);
        showSuccess('Material updated successfully');
      } else {
        await materialsService.createItem(values);
        showSuccess('Material created successfully');
      }
      setItemModalVisible(false);
      fetchItems();
      fetchSummary();
    } catch (error) {
      console.error('Failed to save material', error);
      showError(error, error?.response?.data?.message || 'Failed to save material');
    }
  }, [editingItem, itemForm, fetchItems, fetchSummary]);

  const handleRestock = useCallback((record) => {
    restockForm.reset({
      quantity: 1,
      unitCost: parseFloat(record.unitCost || 0),
      reference: '',
      notes: '',
    });
    setEditingItem(record);
    setRestockModalVisible(true);
  }, [restockForm]);

  const onRestockSubmit = useCallback(async (values) => {
    try {
      await materialsService.restock(editingItem.id, values);
      showSuccess('Material restocked successfully');
      setRestockModalVisible(false);
      fetchItems();
      fetchSummary();
      if (drawerVisible) {
        handleViewItem(editingItem);
      }
    } catch (error) {
      console.error('Failed to restock material', error);
      showError(error, error?.response?.data?.message || 'Failed to restock material');
    }
  }, [editingItem, drawerVisible, fetchItems, fetchSummary, handleViewItem]);

  const handleAdjust = useCallback((record) => {
    adjustForm.reset({
      adjustmentMode: 'set',
      newQuantity: parseFloat(record.quantityOnHand || 0),
      quantityDelta: 0,
      reason: '',
      notes: '',
    });
    setEditingItem(record);
    setAdjustModalVisible(true);
  }, [adjustForm]);

  const onAdjustSubmit = useCallback(async (values) => {
    try {
      const payload = values.adjustmentMode === 'delta'
        ? { quantityDelta: values.quantityDelta, reason: values.reason, notes: values.notes }
        : { newQuantity: values.newQuantity, reason: values.reason, notes: values.notes };

      await materialsService.adjust(editingItem.id, payload);
      showSuccess('Material adjustment recorded');
      setAdjustModalVisible(false);
      fetchItems();
      fetchSummary();
      if (drawerVisible) {
        handleViewItem(editingItem);
      }
    } catch (error) {
      console.error('Failed to adjust material', error);
      showError(error, error?.response?.data?.message || 'Failed to adjust material');
    }
  }, [editingItem, drawerVisible, fetchItems, fetchSummary, handleViewItem]);

  const handleToggleActive = useCallback(async (record) => {
    if (record.isActive) {
      setDeactivateItemId(record.id);
      setDeactivateDialogOpen(true);
    } else {
      try {
        await materialsService.updateItem(record.id, { isActive: true });
        showSuccess('Material reactivated');
            fetchItems();
            fetchSummary();
          } catch (error) {
        console.error('Failed to activate material', error);
        showError(error, error?.response?.data?.message || 'Failed to activate material');
      }
    }
  }, [fetchItems, fetchSummary]);

  const handleDeactivate = useCallback(async () => {
    if (!deactivateItemId) return;
    try {
      setDeactivatingItem(true);
      await materialsService.deleteItem(deactivateItemId);
      showSuccess('Material deactivated');
        await fetchItems();
        fetchSummary();
      setDeactivateDialogOpen(false);
      setDeactivateItemId(null);
      } catch (error) {
      console.error('Failed to deactivate material', error);
      showError(error, error?.response?.data?.message || 'Failed to deactivate material');
    } finally {
      setDeactivatingItem(false);
    }
  }, [deactivateItemId, fetchItems, fetchSummary]);

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Item',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-foreground">{record?.name || '—'}</div>
          <div className="text-muted-foreground text-sm">{record?.sku || '—'}</div>
        </div>
      )
    },
    {
      key: 'category',
      label: 'Category',
      render: (_, record) => <span className="text-foreground">{record?.category?.name || 'Uncategorized'}</span>
    },
    {
      key: 'quantityOnHand',
      label: 'Quantity',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-foreground">{parseFloat(record?.quantityOnHand || 0).toFixed(2)} {record?.unit || ''}</div>
          <div className="text-muted-foreground text-xs">Reorder at {parseFloat(record?.reorderLevel || 0).toFixed(2)}</div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => {
        const statusKey = getStockStatus(record.quantityOnHand, record.reorderLevel);
        return <StatusChip status={statusKey} />;
      }
    },
    {
      key: 'unitCost',
      label: 'Unit Cost',
      render: (_, record) => <span className="text-foreground">{valueFormatter(record?.unitCost)}</span>
    },
    {
      key: 'location',
      label: 'Location',
      render: (_, record) => <span className="text-foreground">{record?.location || '—'}</span>
    },
    {
      key: 'vendor',
      label: 'Vendor',
      render: (_, record) => <span className="text-foreground">{record?.preferredVendor?.name || '—'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={handleViewItem}
          extraActions={[
            {
              key: 'restock',
              label: 'Restock',
              variant: 'default',
              icon: <PlusCircle className="h-4 w-4" />,
              onClick: () => handleRestock(record)
            },
            {
              key: 'adjust',
              label: 'Adjust',
              variant: 'secondary',
              icon: <Pencil className="h-4 w-4" />,
              onClick: () => handleAdjust(record)
            },
            {
              key: 'toggle',
              label: record.isActive ? 'Deactivate' : 'Activate',
              variant: record.isActive ? 'destructive' : 'secondary',
              icon: record.isActive ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />,
              onClick: () => handleToggleActive(record)
            }
          ]}
        />
      )
    }
  ], [handleViewItem, handleRestock, handleAdjust, handleToggleActive]);

  const handleClearFilters = () => {
    setFilters({
      categoryId: 'all',
      status: 'all',
      lowStock: false,
      outOfStock: false
    });
    setSearchValue('');
    setPagination({ ...pagination, current: 1 });
  };

  const hasActiveFilters = filters.categoryId !== 'all' || filters.status !== 'all' || filters.lowStock || filters.outOfStock || !!debouncedSearch.trim();

  const summaryCards = [
    {
      title: 'Total Items',
      value: summary?.totals?.totalItems || 0,
      prefix: <AppWindow className="h-4 w-4 text-primary" />
    },
    {
      title: 'Total Quantity',
      value: parseFloat(summary?.totals?.totalQuantity || 0).toFixed(2),
      prefix: <Inbox className="h-4 w-4 text-green-500" />
    },
    {
      title: 'Materials Value',
      value: valueFormatter(summary?.totals?.inventoryValue || 0),
      prefix: <Currency className="h-4 w-4 text-yellow-500" />
    },
    {
      title: 'Low Stock Items',
      value: summary?.totals?.lowStockCount || 0,
      prefix: <AlertTriangle className="h-4 w-4 text-red-500" />
    }
  ];

  const drawerTabs = useMemo(() => {
    if (!viewingItem) return [];

    // Sort movements by date (oldest first for chronological timeline)
    const sortedMovements = [...(viewingItem.movements || [])].sort(
      (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
    );

    // Check if the first movement (oldest) is a creation
    const firstMovement = sortedMovements.length > 0 ? sortedMovements[0] : null;
    const isCreationMovement = firstMovement && 
      (firstMovement.reference === 'Item Creation' || 
       (firstMovement.previousQuantity === 0 && firstMovement.type === 'purchase'));

    const movementItems = sortedMovements.map((movement, index) => {
      const isCreation = (index === 0) && isCreationMovement;
      const isLast = index === sortedMovements.length - 1;
      
      return {
        color: movement.type === 'purchase' ? 'green' : movement.type === 'usage' ? 'red' : 'var(--color-primary)',
        children: (
          <TimelineItem key={movement.id} isLast={isLast}>
            <TimelineIndicator />
            <TimelineContent>
              <TimelineTitle className="text-foreground">
                {isCreation 
                  ? `ITEM WAS CREATED ${parseFloat(movement.quantityDelta).toFixed(2)} ${viewingItem.unit} IN STOCK`
                  : `${movement.type.toUpperCase()} ${movement.quantityDelta > 0 ? '+' : ''}${parseFloat(movement.quantityDelta).toFixed(2)} ${viewingItem.unit}`
                }
              </TimelineTitle>
              <TimelineTime className="text-foreground">
                {dayjs(movement.occurredAt).format('MMM DD, YYYY [at] h:mm A')} • New Qty: {parseFloat(movement.newQuantity).toFixed(2)}
              </TimelineTime>
            {!isCreation && movement.reference && (
                <TimelineDescription className="text-foreground">Reference: {movement.reference}</TimelineDescription>
            )}
            {movement.createdByUser && (
                <TimelineDescription className="text-foreground">
                By: {movement.createdByUser.name} ({movement.createdByUser.email})
                </TimelineDescription>
            )}
            {movement.job && isPrintingPress && (
                <TimelineDescription className="text-foreground">
                Job: {movement.job.jobNumber} — {movement.job.title}
                </TimelineDescription>
            )}
            {!isCreation && movement.notes && (
                <TimelineDescription className="text-foreground italic">
                Notes: {movement.notes}
                </TimelineDescription>
            )}
            </TimelineContent>
          </TimelineItem>
        )
      };
    });

    return [
      {
        key: 'summary',
        label: 'Summary',
        content: (
          <DrawerSectionCard title="Item summary">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Quantity on Hand">
                {parseFloat(viewingItem.quantityOnHand || 0).toFixed(2)} {viewingItem.unit}
              </DescriptionItem>
              <DescriptionItem label="Reorder Level">
                {parseFloat(viewingItem.reorderLevel || 0).toFixed(2)} {viewingItem.unit}
              </DescriptionItem>
              <DescriptionItem label="SKU">{viewingItem.sku || '—'}</DescriptionItem>
              <DescriptionItem label="Category">{viewingItem.category?.name || 'Uncategorized'}</DescriptionItem>
              <DescriptionItem label="Preferred Vendor">
                {viewingItem.preferredVendor?.name || '—'}
              </DescriptionItem>
              <DescriptionItem label="Unit Cost">{valueFormatter(viewingItem.unitCost)}</DescriptionItem>
              <DescriptionItem label="Total Value">
                {valueFormatter(parseFloat(viewingItem.unitCost || 0) * parseFloat(viewingItem.quantityOnHand || 0))}
              </DescriptionItem>
              <DescriptionItem label="Location">{viewingItem.location || '—'}</DescriptionItem>
              <DescriptionItem label="Status">
                <StatusChip status={viewingItem.isActive ? 'active_flag' : 'inactive_flag'} />
              </DescriptionItem>
              <DescriptionItem label="Description">{viewingItem.description || '—'}</DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>
        )
      },
      {
        key: 'movements',
        label: 'Movement History',
        content: (
          <DrawerSectionCard title="Movement history">
            {movementItems?.length ? (
              <Timeline>
                {movementItems.map(item => item.children)}
              </Timeline>
            ) : (
              <Alert>
                <AlertDescription>No movement history yet</AlertDescription>
              </Alert>
            )}
          </DrawerSectionCard>
        )
      }
    ];
  }, [viewingItem]);

  const materialsEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(EMPTY_STATES.MATERIALS_FILTERED, {
          primary: handleClearFilters,
        });
      }
      return getEmptyStateProps(EMPTY_STATES.MATERIALS, {
        primary: () => openItemModal(),
      });
    },
    [hasActiveFilters, handleClearFilters, openItemModal]
  );

  return (
    <div className="space-y-4 md:space-y-6" data-tour="materials-items">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Materials"
          subText="Track and manage materials, stock levels, and movements."
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
            <TooltipContent>Filter materials by category, status, or stock level</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={async () => { 
                  await fetchItems(true); 
                  fetchSummary(); 
                }}
                disabled={refreshingMaterials}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingMaterials ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh materials list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => { setImportModalOpen(true); setImportResult(null); setImportFile(null); }}
                size={isMobile ? 'icon' : 'default'}
              >
                <Upload className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Import</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bulk import materials from CSV (download template, fill, then upload)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => openItemModal()} className="flex-1 min-w-0 md:flex-none">
                <Plus className="h-4 w-4" />
                <span className="ml-2">New Item</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new material</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total number of materials"
          title="Total Items"
          value={displayStats.totalItems}
          icon={AppWindow}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Items with sufficient stock"
          title="In Stock"
          value={displayStats.inStock}
          icon={Inbox}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Items below minimum stock level"
          title="Low Stock"
          value={displayStats.lowStock}
          icon={AlertTriangle}
          iconBgColor="rgba(249, 115, 22, 0.1)"
          iconColor="#f97316"
        />
        <DashboardStatsCard
          tooltip="Items with zero stock"
          title="Out of Stock"
          value={displayStats.outOfStock}
          icon={Package}
          iconBgColor="rgba(239, 68, 68, 0.1)"
          iconColor="#ef4444"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedItems}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={materialsEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination((prev) => ({ ...prev, ...newPagination }));
        }}
        externalPagination={{
          current: pagination.current,
          total: itemsCount
        }}
        infinite={itemsInfinite}
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
            <SheetTitle>Filter Materials</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filters.categoryId} onValueChange={(value) => setFilters({ ...filters, categoryId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                  <Separator className="my-2" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => openCategoryModal('filter')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add category
                  </Button>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={filters.lowStock} onCheckedChange={(checked) => setFilters({ ...filters, lowStock: checked, outOfStock: checked ? false : filters.outOfStock })} />
              <Label>Show low stock only</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={filters.outOfStock} onCheckedChange={(checked) => setFilters({ ...filters, outOfStock: checked, lowStock: checked ? false : filters.lowStock })} />
              <Label>Show out of stock only</Label>
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
        onClose={() => setDrawerVisible(false)}
        title={viewingItem ? `${viewingItem.name} (${viewingItem.sku || 'No SKU'})` : 'Item details'}
        width={720}
        onPrint={null}
        extra={
          viewingItem ? (
            <Button
              variant="secondaryStroke"
              size="sm"
              onClick={() => openItemModal(viewingItem)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : null
        }
        extraActions={
          viewingItem
            ? [
                {
                  key: 'restock',
                  label: 'Restock',
                  variant: 'secondary',
                  icon: <PlusCircle className="h-4 w-4" />,
                  onClick: () => {
                    if (viewingItem) {
                      handleRestock(viewingItem);
                    }
                  }
                },
                {
                  key: 'adjust',
                  label: 'Adjust',
                  icon: <Pencil className="h-4 w-4" />,
                  onClick: () => {
                    if (viewingItem) {
                      handleAdjust(viewingItem);
                    }
                  }
                }
              ]
            : []
        }
        showActions
        tabs={drawerTabs}
      />

      <Dialog open={itemModalVisible} onOpenChange={setItemModalVisible}>
        <DialogContent className="sm:w-[var(--modal-w-lg)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${editingItem.name}` : 'New Material'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update material details' : 'Add a new material'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit(onItemSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. A4 Paper Ream" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional SKU" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category (optional)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                          <Separator className="my-2" />
                      <Button
                            variant="ghost"
                            className="w-full justify-start"
                        onClick={() => openCategoryModal('item')}
                      >
                            <Plus className="h-4 w-4 mr-2" />
                        Add category
                      </Button>
                        </SelectContent>
                </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {unitOptions.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                name="quantityOnHand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity on Hand</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                name="reorderLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reorder Level</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                name="unitCost"
                  render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (optional)</FormLabel>
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
                  control={itemForm.control}
                  name="preferredVendorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Vendor (optional)</FormLabel>
                      <Select
                        open={materialVendorSelectOpen}
                        onOpenChange={setMaterialVendorSelectOpen}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                  {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name || vendor.company || vendor.email}
                            </SelectItem>
                  ))}
                  <SelectSeparator className="my-2" />
                  <div className="px-2 py-1.5" onPointerDown={(e) => e.preventDefault()}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setMaterialVendorSelectOpen(false);
                        setVendorAddModalOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create vendor
                    </Button>
                  </div>
                        </SelectContent>
                </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={itemForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Storage Location (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Shelf, warehouse, etc." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Active</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={itemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Optional description or specifications" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setItemModalVisible(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={itemForm.formState.isSubmitting}>
                  {editingItem ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
        </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryModalVisible} onOpenChange={setCategoryModalVisible}>
        <DialogContent className="sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>Add Material Category</DialogTitle>
            <DialogDescription>Create a new category for organizing materials</DialogDescription>
          </DialogHeader>
          <DialogBody>
          
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit(onCategorySubmit)} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Specialty Papers" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Optional description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
          setCategoryModalVisible(false);
          setCategoryModalContext(null);
        }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={categoryForm.formState.isSubmitting}>
                  {categoryForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Category
                </Button>
              </DialogFooter>
            </form>
        </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorAddModalOpen} onOpenChange={setVendorAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Vendor</DialogTitle>
            <DialogDescription>Add a new vendor without leaving the form.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...vendorForm}>
              <form onSubmit={vendorForm.handleSubmit(handleAddVendorSubmit)} className="space-y-4">
                <FormField
                  control={vendorForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Acme Supplies" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={vendorForm.control}
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
                  control={vendorForm.control}
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setVendorAddModalOpen(false); vendorForm.reset({ name: '', company: '', phone: '' }); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addingVendor}>
                    {addingVendor ? 'Creating...' : 'Create Vendor'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={restockModalVisible} onOpenChange={setRestockModalVisible}>
        <DialogContent className="sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Restock ${editingItem.name}` : 'Restock'}</DialogTitle>
            <DialogDescription>Add stock to this item</DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...restockForm}>
            <form onSubmit={restockForm.handleSubmit(onRestockSubmit)} className="space-y-4">
              <FormField
                control={restockForm.control}
            name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity to add</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={numberInputValue(field.value)}
                        onChange={(e) => handleNumberChange(e, field.onChange)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={restockForm.control}
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">GHS</span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="pl-12"
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={restockForm.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Invoice number, supplier reference, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={restockForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Optional notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRestockModalVisible(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={restockForm.formState.isSubmitting}>
                  Restock
                </Button>
              </DialogFooter>
            </form>
        </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustModalVisible} onOpenChange={setAdjustModalVisible}>
        <DialogContent className="sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Adjust ${editingItem.name}` : 'Adjust Material'}</DialogTitle>
            <DialogDescription>Record a material adjustment</DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...adjustForm}>
            <form onSubmit={adjustForm.handleSubmit(onAdjustSubmit)} className="space-y-4">
              <FormField
                control={adjustForm.control}
                name="adjustmentMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjustment Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="set">Set to specific quantity</SelectItem>
                        <SelectItem value="delta">Increase / Decrease by amount</SelectItem>
                      </SelectContent>
            </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {adjustmentMode === 'delta' ? (
                <FormField
                  control={adjustForm.control}
                    name="quantityDelta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Change</FormLabel>
                      <FormControl>
                    <Input
                      type="number"
                      step={0.01}
                      placeholder="Use positive to add, negative to subtract"
                      value={numberInputValue(field.value)}
                      onChange={(e) => handleNumberChange(e, field.onChange)}
                    />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={adjustForm.control}
                  name="newQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={numberInputValue(field.value)}
                          onChange={(e) => handleNumberChange(e, field.onChange)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={adjustForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Damage, audit correction, sample usage" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={adjustForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Optional additional details" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustModalVisible(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={adjustForm.formState.isSubmitting}>
                  Record Adjustment
                </Button>
              </DialogFooter>
            </form>
        </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Material</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate this item? This action can be reversed later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground"
              loading={deactivatingItem}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importModalOpen} onOpenChange={(open) => { setImportModalOpen(open); if (!open) { setImportResult(null); setImportFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import materials</DialogTitle>
            <DialogDescription>
              Download the CSV template, fill in your materials, then upload the file. Max 500 rows per file.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadMaterialsTemplate}
                disabled={templateLoading}
                className="w-full"
              >
                {templateLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Download CSV template
              </Button>
            </div>
            <div>
              <Label htmlFor="materials-import-file">Select CSV or Excel file</Label>
              <Input
                id="materials-import-file"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-2"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              {importFile && <p className="text-sm text-muted-foreground mt-1">{importFile.name}</p>}
            </div>
            {importResult && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-medium">
                  {importResult.successCount ?? 0} imported, {(importResult.errors ?? []).length} error(s)
                </p>
                {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-1">
                    {importResult.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {importResult.errors.length > 20 && <li>… and {importResult.errors.length - 20} more</li>}
                  </ul>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportModalOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleMaterialsImportSubmit} disabled={!importFile || importLoading}>
              {importLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Materials;
