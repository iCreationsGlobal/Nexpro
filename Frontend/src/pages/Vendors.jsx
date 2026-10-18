import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Eye, Upload as UploadIcon, Loader2, Filter, RefreshCw, Building2, CheckCircle, XCircle, Users } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { usePagedList } from '../hooks/usePagedList';
import vendorService from '../services/vendorService';
import vendorPriceListService from '../services/vendorPriceListService';
import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import PhoneNumberInput from '../components/PhoneNumberInput';
import DashboardTable from '../components/DashboardTable';
import StatusChip from '../components/StatusChip';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import TableSkeleton from '../components/TableSkeleton';
import FileUpload from '../components/FileUpload';
import FilePreview from '../components/FilePreview';
import { showSuccess, showError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { API_BASE_URL } from '../services/api';
import { PRODUCT_UNITS } from '../constants';
import { numberInputValue, handleNumberChange } from '../utils/formUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import MobileFormDialog from '../components/MobileFormDialog';
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
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS } from '../constants';

const vendorSchema = z.object({
  name: z.string().min(1, 'Enter vendor name'),
  company: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  category: z.string().min(1, 'Select a category'),
  address: z.string().optional(),
});

const priceListItemSchema = z.object({
  itemType: z.enum(['service', 'product']),
  name: z.string().min(1, 'Enter a name'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be 0 or more'),
  unit: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
});

/** Vendors in one list response (`{ data: [...], count }`, or a bare array). */
const vendorRowsFromResponse = (response) => {
  const result = response?.data || response || [];
  return Array.isArray(result) ? result : [];
};

// Helper function to resolve file URLs (handles base64, relative paths, and absolute URLs)
const resolveFileUrl = (url) => {
  if (!url) return '';
  // Base64 data URLs (data:image/png;base64,...)
  if (url.startsWith('data:')) return url;
  // Absolute URLs (http:// or https://)
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Relative paths - prepend API base URL
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  // Return as-is for other cases
  return url;
};

const Vendors = () => {
  const { isManager, activeTenantId } = useAuth();
  const shopContext = useShopOptional();
  const activeShopId = shopContext?.activeShopId ?? null;
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({
    category: 'all',
    isActive: 'all'
  });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingVendor, setViewingVendor] = useState(null);
  const [priceList, setPriceList] = useState([]);
  const [loadingPriceList, setLoadingPriceList] = useState(false);
  const [priceListModalVisible, setPriceListModalVisible] = useState(false);
  const [editingPriceItem, setEditingPriceItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [deletePriceItemId, setDeletePriceItemId] = useState(null);
  const [deletePriceItemDialogOpen, setDeletePriceItemDialogOpen] = useState(false);
  const [deletingPriceItem, setDeletingPriceItem] = useState(false);

  // Fetch vendor categories (business-type and shop-type specific)
  const { data: vendorCategories = [] } = useQuery({
    queryKey: ['vendors', 'categories', activeTenantId],
    queryFn: () => vendorService.getCategories(),
    enabled: !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId),
    staleTime: 5 * 60 * 1000,
  });

  const vendorFilterParams = useMemo(() => {
    const params = {};
    if (filters.category !== 'all') params.category = filters.category;
    if (filters.isActive !== 'all') params.isActive = filters.isActive === 'true';
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters.category, filters.isActive, debouncedSearch]);

  // Pages on desktop; loads as you scroll on phones and tablets.
  const {
    rows: vendors,
    total: vendorsCount,
    isLoading: vendorsLoading,
    error: vendorsError,
    refetch: refetchVendors,
    isFetching: vendorsRefetching,
    infinite: vendorsInfinite,
  } = usePagedList({
    queryKey: ({ page, limit }) => ['vendors', activeTenantId, activeShopId, page, limit, filters, debouncedSearch],
    params: vendorFilterParams,
    fetchPage: (params) => vendorService.getAll(params),
    getRows: vendorRowsFromResponse,
    getTotal: (response, rows) => response?.count || rows.length,
    page: pagination.current,
    pageSize: pagination.pageSize,
    enabled: !!activeTenantId && (!shopContext?.isShopWorkspace || !!activeShopId),
    staleTime: 60 * 1000, // 1 minute
    queryOptions: { refetchOnWindowFocus: false },
  });
  // Loading the next rows on scroll isn't a refresh.
  const vendorsRefreshing = vendorsRefetching && !vendorsInfinite?.isLoadingMore;

  // Invalidate vendors query
  const invalidateVendors = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
  }, [queryClient]);

  const form = useForm({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      company: '',
      email: '',
      phone: '',
      website: '',
      category: '',
      address: '',
    },
  });

  const priceListForm = useForm({
    resolver: zodResolver(priceListItemSchema),
    defaultValues: {
      itemType: 'service',
      name: '',
      description: '',
      price: 0,
      unit: 'unit',
      imageUrl: null,
    },
  });

  useEffect(() => {
    setPageSearchConfig({ scope: 'vendors', placeholder: SEARCH_PLACEHOLDERS.VENDORS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (vendorsError) {
      console.error('Failed to load vendors:', vendorsError);
      showError('Failed to load vendors');
    }
  }, [vendorsError]);

  // Backend already handles filtering, no need for client-side filtering
  const paginatedVendors = vendors;

  const onSubmit = async (values) => {
    try {
      let response;
      if (editingVendor) {
        response = await vendorService.update(editingVendor.id, values);
      } else {
        response = await vendorService.create(values);
      }
      
      // Check if response indicates success
      if (response && (response.success === true || response.data)) {
        showSuccess(editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully');
        setModalVisible(false);
        form.reset();
        invalidateVendors();
      } else if (response && response.success === false) {
        // Explicit failure response
        const errorMessage = response.error || response.message || 'Operation failed';
        showError(errorMessage);
      } else {
        // Unexpected response structure
        console.warn('Unexpected response structure:', response);
        showSuccess(editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully');
        setModalVisible(false);
        form.reset();
        invalidateVendors();
      }
    } catch (error) {
      // Only show error if it's a real error (not a false positive from interceptor)
      console.error('Vendor operation error:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Operation failed';
      showError(errorMessage);
    }
  };

  const handleDelete = async (id) => {
    try {
      await vendorService.delete(id);
      showSuccess('Vendor deleted successfully');
      invalidateVendors();
    } catch (error) {
      showError(error, 'Failed to delete vendor');
    }
  };

  const handleView = (vendor) => {
    setViewingVendor(vendor);
    setDrawerVisible(true);
    setLoadingPriceList(true);
    vendorPriceListService.getAll(vendor.id)
      .then((response) => setPriceList(response?.data || []))
      .catch((error) => {
        console.error('Failed to load vendor price list:', error);
        setPriceList([]);
      })
      .finally(() => setLoadingPriceList(false));
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setViewingVendor(null);
    setPriceList([]);
  };

  const printingItems = [
    'Black & White Printing',
    'Color Printing',
    'Large Format Printing',
    'Photocopying',
    'Digital Printing',
    'Offset Printing',
    'Screen Printing',
    '3D Printing',
    'DTF',
    'Business Cards',
    'Brochures',
    'Flyers',
    'Posters',
    'Banners',
    'Booklets',
    'Letterhead',
    'Envelopes',
    'Invitations',
    'Calendars',
    'Labels',
    'Stickers',
    'Signage',
    'Vehicle Wraps',
    'Window Graphics',
    'Floor Graphics',
    'One Way Vision Sticker',
    'Binding',
    'Lamination',
    'Scanning',
    'Cutting',
    'Folding',
    'Stapling',
    'Perforation',
    'Die Cutting',
    'Embossing',
    'Foil Stamping',
    'UV Coating',
    'Varnishing',
    'Design Services',
    'Pre-Press Services',
    'Color Correction',
    'Image Editing',
    'Layout Design',
    'Proofing',
  ];

  const isPrintingVendor = viewingVendor && (
    viewingVendor.category === 'Printing Services' ||
    viewingVendor.category === 'Printing Equipment' ||
    viewingVendor.category === 'Pre-Press Services' ||
    viewingVendor.category === 'Binding & Finishing' ||
    viewingVendor.category === 'Design Services'
  );

  const handleAddPriceItem = () => {
    setEditingPriceItem(null);
    priceListForm.reset({
      itemType: 'service',
      name: '',
      description: '',
      price: 0,
      unit: 'unit',
      imageUrl: null,
    });
    setImagePreview(null);
    setPriceListModalVisible(true);
  };

  const handleEditPriceItem = (item) => {
    setEditingPriceItem(item);
    priceListForm.reset({
      ...item,
      imageUrl: item.imageUrl || null,
    });
    setImagePreview(item.imageUrl || null);
    setPriceListModalVisible(true);
  };

  const handleImageUpload = async (file) => {
    try {
      setUploadingImage(true);
      
      if (editingPriceItem && editingPriceItem.id) {
        const response = await vendorPriceListService.uploadImage(
          viewingVendor.id,
          editingPriceItem.id,
          file
        );
        
        if (response.data?.imageUrl) {
          setImagePreview(response.data.imageUrl);
          priceListForm.setValue('imageUrl', response.data.imageUrl);
          showSuccess('Image uploaded successfully');
        } else {
          throw new Error('Upload failed - no image URL in response');
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target.result);
          priceListForm.setValue('imageUrl', e.target.result);
        };
        reader.onerror = (error) => {
          showError(error, 'Failed to read image file');
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      showError(error, error?.response?.data?.message || error?.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageRemove = () => {
    setImagePreview(null);
    priceListForm.setValue('imageUrl', null);
  };

  const handleDeletePriceItem = async () => {
    if (!deletePriceItemId) return;
    try {
      setDeletingPriceItem(true);
      await vendorPriceListService.delete(viewingVendor.id, deletePriceItemId);
      showSuccess('Price item deleted successfully');
      const response = await vendorPriceListService.getAll(viewingVendor.id);
      setPriceList(response.data || []);
      setDeletePriceItemDialogOpen(false);
      setDeletePriceItemId(null);
    } catch (error) {
      showError(error, 'Failed to delete price item');
    } finally {
      setDeletingPriceItem(false);
    }
  };

  const onPriceListSubmit = async (values) => {
    try {
      if (editingPriceItem) {
        await vendorPriceListService.update(viewingVendor.id, editingPriceItem.id, values);
        showSuccess('Price item updated successfully');
      } else {
        await vendorPriceListService.create(viewingVendor.id, values);
        showSuccess('Price item added successfully');
      }
      setPriceListModalVisible(false);
      setImagePreview(null);
      const response = await vendorPriceListService.getAll(viewingVendor.id);
      setPriceList(response.data || []);
    } catch (error) {
      showError(error, error.error || 'Operation failed');
    }
  };

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalVendors = vendors.length;
    const activeVendors = vendors.filter(v => v.isActive).length;
    const inactiveVendors = vendors.filter(v => !v.isActive).length;
    const uniqueCategories = new Set(vendors.map(v => v.category).filter(Boolean)).size;
    
    return {
      totals: {
        totalVendors,
        activeVendors,
        inactiveVendors,
        uniqueCategories
      }
    };
  }, [vendors]);

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => <span className="font-medium text-foreground">{record?.name || '—'}</span>
    },
    {
      key: 'company',
      label: 'Company',
      render: (_, record) => <span className="text-foreground">{record?.company || '—'}</span>
    },
    {
      key: 'email',
      label: 'Email',
      render: (_, record) => <span className="text-foreground">{record?.email || '—'}</span>
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (_, record) => <span className="text-foreground">{record?.phone || '—'}</span>
    },
    {
      key: 'category',
      label: 'Category',
      render: (_, record) => record?.category ? <Badge variant="outline">{record.category}</Badge> : <span>—</span>
    },
    {
      key: 'status',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => (
        <StatusChip status={record?.isActive ? 'active_flag' : 'inactive_flag'} />
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => <ActionColumn onView={handleView} record={record} />
    }
  ], [handleView]);

  const handleClearFilters = () => {
    setFilters({
      category: 'all',
      isActive: 'all'
    });
    setSearchValue('');
    setPagination({ ...pagination, current: 1 });
  };

  const hasActiveFilters = filters.category !== 'all' || filters.isActive !== 'all' || !!debouncedSearch.trim();

  // Merge API categories with existing vendor categories (for filter dropdown)
  const uniqueCategories = useMemo(() => {
    const fromVendors = new Set(vendors.map(v => v.category).filter(Boolean));
    const fromApi = new Set(Array.isArray(vendorCategories) ? vendorCategories : []);
    const merged = new Set([...fromApi, ...fromVendors]);
    return Array.from(merged).sort();
  }, [vendors, vendorCategories]);

  const openAddVendor = useCallback(() => {
    setEditingVendor(null);
    form.reset();
    setModalVisible(true);
  }, [form]);

  const vendorsEmptyState = useMemo(
    () => {
      if (hasActiveFilters) {
        return getEmptyStateProps(EMPTY_STATES.VENDORS_FILTERED, {
          primary: handleClearFilters,
        });
      }
      return getEmptyStateProps(EMPTY_STATES.VENDORS, {
        primary: openAddVendor,
      });
    },
    [hasActiveFilters, handleClearFilters, openAddVendor]
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:gap-4">
        <WelcomeSection
          welcomeMessage="Vendors"
          subText="Manage your vendor relationships and price lists."
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
            <TooltipContent>Filter vendors by category or status</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={() => refetchVendors()}
                disabled={vendorsRefreshing}
                size={isMobile ? "icon" : "default"}
              >
                {vendorsRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh vendors list</TooltipContent>
          </Tooltip>
          {isManager && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingVendor(null);
                    form.reset();
                    setModalVisible(true);
                  }}
                  className="flex-1 min-w-0 md:flex-none"
                >
                  <Plus className="h-4 w-4" />
                  <span className="ml-2">New Vendor</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a new vendor</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Total Vendors Card */}
        <DashboardStatsCard
          tooltip="Total number of vendors in your directory"
          title="Total Vendors"
          value={summaryStats?.totals?.totalVendors || 0}
          icon={Building2}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />

        {/* Active Vendors Card */}
        <DashboardStatsCard
          tooltip="Vendors currently active and available"
          title="Active"
          value={summaryStats?.totals?.activeVendors || 0}
          icon={CheckCircle}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />

        {/* Inactive Vendors Card */}
        <DashboardStatsCard
          tooltip="Vendors that are no longer active"
          title="Inactive"
          value={summaryStats?.totals?.inactiveVendors || 0}
          icon={XCircle}
          iconBgColor="rgba(239, 68, 68, 0.1)"
          iconColor="#ef4444"
        />

        {/* Categories Card */}
        <DashboardStatsCard
          tooltip="Number of unique vendor categories"
          title="Categories"
          value={summaryStats?.totals?.uniqueCategories || 0}
          icon={Users}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#166534"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedVendors}
        columns={tableColumns}
        loading={vendorsLoading}
        title={null}
        emptyState={vendorsEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: vendorsCount
        }}
        infinite={vendorsInfinite}
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
            <SheetTitle>Filter Vendors</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 md:space-y-6 mt-4 md:mt-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={filters.category}
                onValueChange={(value) => setFilters({ ...filters, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.isActive}
                onValueChange={(value) => setFilters({ ...filters, isActive: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
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

      <MobileFormDialog
        open={modalVisible}
        onOpenChange={setModalVisible}
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        description={editingVendor ? 'Update vendor information' : 'Add a new vendor to your system'}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalVisible(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="vendor-form" loading={form.formState.isSubmitting}>
              {editingVendor ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form id="vendor-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormFieldGrid columns={2}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter vendor name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter company name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGrid>

            <FormFieldGrid columns={2}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="vendor@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://www.example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Array.isArray(vendorCategories) ? vendorCategories : []).map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                    )}
                  />
            </FormFieldGrid>

            <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} placeholder="Enter address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </form>
        </Form>
      </MobileFormDialog>

      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="Vendor Details"
        width={720}
        onEdit={isManager && viewingVendor ? () => {
          setEditingVendor(viewingVendor);
          form.reset(viewingVendor);
          setModalVisible(true);
          setDrawerVisible(false);
        } : null}
        onDelete={isManager && viewingVendor ? () => {
          handleDelete(viewingVendor.id);
          setDrawerVisible(false);
        } : null}
        deleteConfirmText="Are you sure you want to delete this vendor?"
        tabs={viewingVendor ? [
          {
            key: 'details',
            label: 'Details',
            content: (
              <div className="space-y-6">
                <DrawerSectionCard title="Contact details">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Name">{viewingVendor.name || '—'}</DescriptionItem>
                    <DescriptionItem label="Company">{viewingVendor.company || '—'}</DescriptionItem>
                    <DescriptionItem label="Email">
                      {viewingVendor.email ? (
                        <a href={`mailto:${viewingVendor.email}`} className="text-primary hover:underline">
                          {viewingVendor.email}
                        </a>
                      ) : '—'}
                    </DescriptionItem>
                    <DescriptionItem label="Phone">
                      {viewingVendor.phone ? (
                        <a href={`tel:${viewingVendor.phone}`} className="text-primary hover:underline">
                          {viewingVendor.phone}
                        </a>
                      ) : '—'}
                    </DescriptionItem>
                    <DescriptionItem label="Website">
                      {viewingVendor.website ? (
                        <a href={viewingVendor.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {viewingVendor.website}
                        </a>
                      ) : '—'}
                    </DescriptionItem>
                    <DescriptionItem label="Category">
                      {viewingVendor.category ? (
                        <Badge variant="outline">{viewingVendor.category}</Badge>
                      ) : '—'}
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>
                <DrawerSectionCard title="Address & status">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Address">{viewingVendor.address || '—'}</DescriptionItem>
                    <DescriptionItem label="Status">
                      <StatusChip status={viewingVendor.isActive ? 'active_flag' : 'inactive_flag'} />
                    </DescriptionItem>
                    <DescriptionItem label="Created At">
                      {viewingVendor.createdAt ? new Date(viewingVendor.createdAt).toLocaleString() : '—'}
                    </DescriptionItem>
                    <DescriptionItem label="Last Updated">
                      {viewingVendor.updatedAt ? new Date(viewingVendor.updatedAt).toLocaleString() : '—'}
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>
              </div>
            )
          },
          {
            key: 'pricelist',
            label: 'Price Lists',
            content: (
              <DrawerSectionCard title="Services & products">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">({priceList.length} items)</span>
                    {isManager && (
                      <Button onClick={handleAddPriceItem}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    )}
                  </div>
                  {loadingPriceList ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : priceList.length > 0 ? (
                    <div className="space-y-3">
                      {priceList.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-4 p-4 border border-border/50 rounded-md bg-background"
                        >
                          {item.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => setImagePreviewUrl(resolveFileUrl(item.imageUrl))}
                              className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                            >
                              <img
                                src={resolveFileUrl(item.imageUrl)}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground text-center">
                              No Image
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold">{item.name}</span>
                              <Badge variant={item.itemType === 'service' ? 'default' : 'secondary'}>
                                {item.itemType}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {item.description || 'No description'}
                            </p>
                            <div className="flex items-center gap-4">
                              <span className="text-lg font-bold text-primary">
                                ₵ {parseFloat(item.price || 0).toFixed(2)}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                per {item.unit || 'unit'}
                              </span>
                            </div>
                          </div>
                          {isManager && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditPriceItem(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeletePriceItemId(item.id);
                                  setDeletePriceItemDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                      No price list items found
                    </div>
                  )}
                </div>
              </DrawerSectionCard>
            )
          }
        ] : null}
      />

      <Dialog open={priceListModalVisible} onOpenChange={setPriceListModalVisible}>
        <DialogContent className="sm:w-[var(--modal-w-lg)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingPriceItem ? 'Edit Price Item' : 'Add Price Item'}</DialogTitle>
            <DialogDescription>
              {editingPriceItem ? 'Update price item details' : 'Add a new service or product to the price list'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...priceListForm}>
            <form onSubmit={priceListForm.handleSubmit(onPriceListSubmit)} className="space-y-4">
              <FormField
                control={priceListForm.control}
                name="itemType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="product">Product</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceListForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    {isPrintingVendor ? (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select service item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {printingItems.map(item => (
                            <SelectItem key={item} value={item}>{item}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input {...field} placeholder="Enter item name" />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceListForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Enter description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={priceListForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
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
                control={priceListForm.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit (optional)</FormLabel>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRODUCT_UNITS.map((u) => (
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

              <div className="space-y-2">
                <Label>Image (Optional)</Label>
                <FileUpload
                  onFileSelect={handleImageUpload}
                  disabled={false}
                  uploading={uploadingImage}
                  accept="image/*"
                  maxSizeMB={10}
                  uploadedFiles={imagePreview ? [{
                    id: 'price-item-image',
                    fileUrl: imagePreview,
                    originalName: 'Price Item Image',
                    name: 'Price Item Image',
                    url: resolveFileUrl(imagePreview)
                  }] : []}
                  onFilePreview={() => setImagePreviewVisible(true)}
                  onFileRemove={handleImageRemove}
                  showFileList={true}
                  emptyMessage="No image uploaded yet."
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPriceListModalVisible(false);
                    setImagePreview(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={priceListForm.formState.isSubmitting}>
                  {priceListForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingPriceItem ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => !open && setImagePreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt="Preview"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletePriceItemDialogOpen} onOpenChange={setDeletePriceItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the price item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeletePriceItem} 
              className="bg-destructive text-destructive-foreground"
              loading={deletingPriceItem}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FilePreview
        open={imagePreviewVisible}
        onClose={() => setImagePreviewVisible(false)}
        file={imagePreview ? {
          fileUrl: imagePreview,
          title: 'Price Item Image',
          metadata: {}
        } : null}
      />
    </div>
  );
};

export default Vendors;
