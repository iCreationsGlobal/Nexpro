import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Monitor,
  Plus,
  RefreshCw,
  Loader2,
  Filter,
  Pencil,
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
import DashboardTable from '../components/DashboardTable';
import StatusChip from '../components/StatusChip';
import WelcomeSection from '../components/WelcomeSection';
import equipmentService from '../services/equipmentService';
import vendorService from '../services/vendorService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { showSuccess, showError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Descriptions, DescriptionItem } from '../components/ui/descriptions';
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
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS } from '../constants';
import { formatAmount } from '../utils/formatNumber';

/** Equipment in one list response (`{ data: [...], count }`). */
const equipmentRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

const sortCategories = (list = []) =>
  [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

const valueFormatter = (value) => formatAmount(value);

const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'disposed', label: 'Disposed' },
  { value: 'sold', label: 'Sold' }
];

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseValue: z.union([z.number().min(0), z.literal('')]).transform((v) => (v === '' ? 0 : v)),
  location: z.string().optional(),
  serialNumber: z.string().optional(),
  status: z.enum(['active', 'disposed', 'sold']).default('active'),
  vendorId: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true)
});

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional()
});

const quickVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  company: z.string().optional(),
  phone: z.string().optional()
});

const Equipment = () => {
  const { activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();

  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalContext, setCategoryModalContext] = useState(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filters, setFilters] = useState({ categoryId: 'all', status: 'all' });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [vendorAddModalOpen, setVendorAddModalOpen] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [equipmentVendorSelectOpen, setEquipmentVendorSelectOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    setPageSearchConfig({ scope: 'equipment', placeholder: SEARCH_PLACEHOLDERS.EQUIPMENT });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setVendors([]);
  }, [activeTenantId]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (!itemModalVisible) setEquipmentVendorSelectOpen(false);
  }, [itemModalVisible]);

  const itemForm = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      description: '',
      purchaseDate: '',
      purchaseValue: 0,
      location: '',
      serialNumber: '',
      status: 'active',
      vendorId: '',
      notes: '',
      isActive: true
    }
  });

  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' }
  });

  const vendorForm = useForm({
    resolver: zodResolver(quickVendorSchema),
    defaultValues: { name: '', company: '', phone: '' }
  });

  const fetchCategories = useCallback(async () => {
    try {
      const response = await equipmentService.getCategories();
      const data = response?.data ?? [];
      setCategories(sortCategories(Array.isArray(data) ? data : [data]));
    } catch (error) {
      console.error('Failed to load categories', error);
      showError(error, 'Failed to load categories');
    }
  }, []);

  const equipmentFilterParams = useMemo(() => {
    const params = {
      categoryId: filters.categoryId !== 'all' ? filters.categoryId : undefined,
      status: filters.status !== 'all' ? filters.status : undefined
    };
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters.categoryId, filters.status, debouncedSearch]);

  // Pages on desktop; loads as you scroll on phones and tablets.
  const {
    rows: items,
    total: itemsTotal,
    isLoading: loading,
    refetch: refetchItems,
    error: itemsError,
    infinite: itemsInfinite,
  } = usePagedList({
    queryKey: (params) => ['equipment', 'items', activeTenantId, activeShopId, activeStudioLocationId, params],
    params: equipmentFilterParams,
    fetchPage: (params) => equipmentService.getItems(params),
    getRows: equipmentRowsFromResponse,
    getTotal: (response, rows) => response?.count ?? response?.pagination?.total ?? rows.length,
    page: pagination.current,
    pageSize: pagination.pageSize,
    enabled: scopeReady,
    // Always fresh when the page opens, like before it used React Query.
    staleTime: 0,
  });

  useEffect(() => {
    if (!itemsError) return;
    console.error('Failed to load equipment', itemsError);
    showError(itemsError, 'Failed to load equipment');
  }, [itemsError]);

  /** Reload the list (every loaded page on phones and tablets); `isRefresh` spins the refresh button. */
  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      await refetchItems();
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, [refetchItems]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const loadVendors = useCallback(async () => {
    try {
      const response = await vendorService.getVendors({ limit: 100 });
      setVendors(response?.data || []);
    } catch (error) {
      console.error('Failed to load vendors', error);
    }
  }, []);

  const handleViewItem = useCallback((record) => {
    setViewingItem(record);
    setDrawerVisible(true);
    equipmentService
      .getById(record.id)
      .then((res) => {
        const data = res?.data || res;
        setViewingItem((prev) => (prev?.id === record.id ? data : prev));
      })
      .catch((err) => {
        console.error('Failed to fetch equipment', err);
        showError(err, 'Failed to load equipment details');
      });
  }, []);

  const openItemModal = useCallback(
    async (item = null) => {
      if (!vendors.length) await loadVendors();
      setEditingItem(item);
      if (item) {
        itemForm.reset({
          name: item.name,
          categoryId: item.categoryId || '',
          description: item.description || '',
          purchaseDate: item.purchaseDate ? dayjs(item.purchaseDate).format('YYYY-MM-DD') : '',
          purchaseValue: parseFloat(item.purchaseValue || 0),
          location: item.location || '',
          serialNumber: item.serialNumber || '',
          status: item.status || 'active',
          vendorId: item.vendorId || '',
          notes: item.notes || '',
          isActive: item.isActive !== false
        });
      } else {
        itemForm.reset({
          name: '',
          categoryId: '',
          description: '',
          purchaseDate: '',
          purchaseValue: 0,
          location: '',
          serialNumber: '',
          status: 'active',
          vendorId: '',
          notes: '',
          isActive: true
        });
      }
      setItemModalVisible(true);
    },
    [vendors.length, loadVendors, itemForm]
  );

  const onItemSubmit = useCallback(
    async (values) => {
      try {
        const payload = {
          name: values.name,
          categoryId: values.categoryId || null,
          description: values.description || null,
          purchaseDate: values.purchaseDate || null,
          purchaseValue: values.purchaseValue,
          location: values.location || null,
          serialNumber: values.serialNumber || null,
          status: values.status,
          vendorId: values.vendorId || null,
          notes: values.notes || null,
          isActive: values.isActive
        };
        if (editingItem) {
          await equipmentService.updateItem(editingItem.id, payload);
          showSuccess('Equipment updated successfully');
        } else {
          await equipmentService.createItem(payload);
          showSuccess('Equipment added successfully');
        }
        setItemModalVisible(false);
        fetchItems();
        if (drawerVisible && viewingItem?.id === editingItem?.id) {
          handleViewItem({ ...viewingItem, ...payload });
        }
      } catch (error) {
        showError(error, error?.response?.data?.message || 'Failed to save equipment');
      }
    },
    [editingItem, drawerVisible, viewingItem, fetchItems, handleViewItem]
  );

  const handleDownloadEquipmentTemplate = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const blob = await equipmentService.getImportTemplate();
      const url = URL.createObjectURL(blob?.data ?? blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'equipment_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded');
    } catch (err) {
      showError(err?.response?.data?.message ?? err?.message ?? 'Failed to download template');
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  const handleEquipmentImportSubmit = useCallback(async () => {
    if (!importFile) {
      showError('Please select a CSV or Excel file');
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const result = await equipmentService.importItems(importFile);
      setImportResult(result);
      const success = result?.successCount ?? 0;
      const failed = result?.errorCount ?? 0;
      if (success > 0) {
        showSuccess(`${success} equipment item(s) imported`);
        fetchItems(true);
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
  }, [importFile, fetchItems]);

  const openCategoryModal = (context = null) => {
    categoryForm.reset();
    setCategoryModalContext(context);
    setCategoryModalVisible(true);
  };

  const onCategorySubmit = async (values) => {
    try {
      const payload = await equipmentService.createCategory(values);
      const newCategory = payload?.data || payload;
      if (!newCategory?.id) throw new Error('Invalid category response');
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
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to create category');
    }
  };

  const handleAddVendorSubmit = useCallback(async (values) => {
    setAddingVendor(true);
    try {
      const response = await vendorService.create({ name: values.name, company: values.company || undefined, phone: values.phone || undefined });
      const newVendor = response?.data ?? response;
      if (!newVendor?.id) throw new Error('Invalid vendor response');
      await loadVendors();
      setVendorAddModalOpen(false);
      vendorForm.reset({ name: '', company: '', phone: '' });
      showSuccess('Vendor created successfully');
      itemForm.setValue('vendorId', newVendor.id);
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to create vendor');
    } finally {
      setAddingVendor(false);
    }
  }, [itemForm, loadVendors, vendorForm]);

  const handleDeleteClick = (record) => {
    setDeleteItemId(record.id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteItemId) return;
    try {
      setDeleting(true);
      await equipmentService.deleteItem(deleteItemId);
      showSuccess('Equipment deleted');
      fetchItems();
      setDeleteDialogOpen(false);
      setDeleteItemId(null);
      if (viewingItem?.id === deleteItemId) setDrawerVisible(false);
    } catch (error) {
      showError(error, error?.response?.data?.message || 'Failed to delete equipment');
    } finally {
      setDeleting(false);
    }
  }, [deleteItemId, fetchItems, viewingItem?.id]);

  const tableColumns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        render: (_, record) => (
          <div>
            <div className="font-semibold text-foreground">{record?.name || '—'}</div>
            {record?.serialNumber && (
              <div className="text-muted-foreground text-sm">SN: {record.serialNumber}</div>
            )}
          </div>
        )
      },
      {
        key: 'category',
        label: 'Category',
        render: (_, record) => (
          <span className="text-foreground">{record?.category?.name || '—'}</span>
        )
      },
      {
        key: 'purchaseDate',
        label: 'Purchase Date',
        render: (_, record) => (
          <span className="text-foreground">
            {record?.purchaseDate
              ? dayjs(record.purchaseDate).format('MMM DD, YYYY')
              : '—'}
          </span>
        )
      },
      {
        key: 'purchaseValue',
        label: 'Value',
        render: (_, record) => (
          <span className="text-foreground">{valueFormatter(record?.purchaseValue)}</span>
        )
      },
      {
        key: 'location',
        label: 'Location',
        render: (_, record) => (
          <span className="text-foreground">{record?.location || '—'}</span>
        )
      },
      {
        key: 'status',
        label: 'Status',
        mobileDashboardPlacement: 'headerEnd',
        render: (_, record) => {
          const status = record?.status || 'active';
          return <StatusChip status={status} />;
        }
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
                key: 'edit',
                label: 'Edit',
                variant: 'secondary',
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => openItemModal(record)
              }
            ]}
          />
        )
      }
    ],
    [handleViewItem, openItemModal]
  );

  const drawerTabs = useMemo(() => {
    if (!viewingItem) return [];
    return [
      {
        key: 'summary',
        label: 'Summary',
        content: (
          <DrawerSectionCard title="Equipment details">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Name">{viewingItem.name || '—'}</DescriptionItem>
              <DescriptionItem label="Category">
                {viewingItem.category?.name || '—'}
              </DescriptionItem>
              <DescriptionItem label="Purchase Date">
                {viewingItem.purchaseDate
                  ? dayjs(viewingItem.purchaseDate).format('MMM DD, YYYY')
                  : '—'}
              </DescriptionItem>
              <DescriptionItem label="Purchase Value">
                {valueFormatter(viewingItem.purchaseValue)}
              </DescriptionItem>
              <DescriptionItem label="Location">
                {viewingItem.location || '—'}
              </DescriptionItem>
              <DescriptionItem label="Serial Number">
                {viewingItem.serialNumber || '—'}
              </DescriptionItem>
              <DescriptionItem label="Status">
                <StatusChip status={viewingItem.status || 'active'} />
              </DescriptionItem>
              <DescriptionItem label="Vendor">
                {viewingItem.vendor?.name || viewingItem.vendor?.company || '—'}
              </DescriptionItem>
              <DescriptionItem label="Notes">
                {viewingItem.notes || '—'}
              </DescriptionItem>
              <DescriptionItem label="Description">
                {viewingItem.description || '—'}
              </DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>
        )
      }
    ];
  }, [viewingItem]);

  const handleClearFilters = useCallback(() => {
    setFilters({ categoryId: 'all', status: 'all' });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveFilters = filters.categoryId !== 'all' || filters.status !== 'all' || !!debouncedSearch.trim();

  const equipmentEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(EMPTY_STATES.EQUIPMENT_FILTERED, {
          primary: handleClearFilters,
        });
      }
      return getEmptyStateProps(EMPTY_STATES.EQUIPMENT, {
        primary: () => openItemModal(),
      });
    },
    [hasActiveFilters, handleClearFilters, openItemModal]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Equipment"
          subText="Track fixed assets: laptops, furniture, vehicles."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end sm:ml-auto">
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
            onClick={() => fetchItems(true)}
            disabled={refreshing}
            size={isMobile ? 'icon' : 'default'}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setImportModalOpen(true); setImportResult(null); setImportFile(null); }}
            size={isMobile ? 'icon' : 'default'}
          >
            <Upload className="h-4 w-4" />
            {!isMobile && <span className="ml-2">Import</span>}
          </Button>
          <Button onClick={() => openItemModal()} className="flex-1 min-w-0 md:flex-none">
            <Plus className="h-4 w-4" />
            <span className="ml-2">Add Equipment</span>
          </Button>
        </div>
      </div>

      <DashboardTable
        data={items}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={equipmentEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination((prev) => ({ ...prev, ...newPagination }));
        }}
        externalPagination={{
          current: pagination.current,
          total: itemsTotal
        }}
        infinite={itemsInfinite}
      />

      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] overflow-y-auto"
        >
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Equipment</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={filters.categoryId}
                onValueChange={(v) => {
                  setFilters((prev) => ({ ...prev, categoryId: v }));
                  setPagination((prev) => ({ ...prev, current: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  <Button
                    variant="ghost"
                    className="w-full justify-start mt-2"
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
                  {EQUIPMENT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="w-full"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <DetailsDrawer
        open={drawerVisible}
        onOpenChange={setDrawerVisible}
        onClose={() => setDrawerVisible(false)}
        title={viewingItem ? viewingItem.name : 'Equipment details'}
        width={720}
        onPrint={null}
        onEdit={viewingItem ? () => openItemModal(viewingItem) : undefined}
        onDelete={viewingItem ? () => handleDeleteClick(viewingItem) : undefined}
        deleteConfirmTitle="Delete this equipment?"
        deleteConfirmText="This can't be undone."
        deleteButtonLabel="Delete"
        showActions
        tabs={drawerTabs}
      />

      <Dialog open={itemModalVisible} onOpenChange={setItemModalVisible}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? `Edit ${editingItem.name}` : 'Add Equipment'}
            </DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update equipment details' : 'Add a new equipment item'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...itemForm}>
              <form
                onSubmit={itemForm.handleSubmit(onItemSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={itemForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Dell Laptop" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category (optional)</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            type="button"
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={itemForm.control}
                    name="purchaseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Date (optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={itemForm.control}
                    name="purchaseValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Value (₵)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === '' ? '' : parseFloat(e.target.value)
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={itemForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Office, Warehouse" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serial Number (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Serial or asset tag" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EQUIPMENT_STATUS_OPTIONS.map((o) => (
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
                  control={itemForm.control}
                  name="vendorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor (optional)</FormLabel>
                      <Select
                        open={equipmentVendorSelectOpen}
                        onOpenChange={setEquipmentVendorSelectOpen}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name || v.company || v.email}
                            </SelectItem>
                          ))}
                          <SelectSeparator className="my-2" />
                          <div className="px-2 py-1.5" onPointerDown={(e) => e.preventDefault()}>
                            <Button
                              type="button"
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => {
                                setEquipmentVendorSelectOpen(false);
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
                <FormField
                  control={itemForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={itemForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} />
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
                  <Button type="submit" disabled={itemForm.formState.isSubmitting}>
                    {editingItem ? 'Update' : 'Add'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryModalVisible} onOpenChange={setCategoryModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Equipment Category</DialogTitle>
            <DialogDescription>
              Create a category for organizing equipment (e.g. IT, Furniture, Vehicles)
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...categoryForm}>
              <form
                onSubmit={categoryForm.handleSubmit(onCategorySubmit)}
                className="space-y-4"
              >
                <FormField
                  control={categoryForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. IT Equipment" />
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
                        <Textarea {...field} rows={2} />
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this equipment? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground"
              loading={deleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importModalOpen} onOpenChange={(open) => { setImportModalOpen(open); if (!open) { setImportResult(null); setImportFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import equipment</DialogTitle>
            <DialogDescription>
              Download the CSV template, fill in your equipment, then upload the file. Max 500 rows per file.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadEquipmentTemplate}
                disabled={templateLoading}
                className="w-full"
              >
                {templateLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Download CSV template
              </Button>
            </div>
            <div>
              <Label htmlFor="equipment-import-file">Select CSV or Excel file</Label>
              <Input
                id="equipment-import-file"
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
            <Button type="button" onClick={handleEquipmentImportSubmit} disabled={!importFile || importLoading}>
              {importLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Equipment;
