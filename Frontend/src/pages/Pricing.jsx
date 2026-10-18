import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, MinusCircle, Loader2, Filter, RefreshCw, Currency } from 'lucide-react';
import pricingService from '../services/pricingService';
import jobService from '../services/jobService';
import customDropdownService from '../services/customDropdownService';
import { useAuth } from '../context/AuthContext';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useResponsive } from '../hooks/useResponsive';
import { usePagedList } from '../hooks/usePagedList';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import DashboardTable from '../components/DashboardTable';
import { getEmptyStateProps } from '../components/ui/empty-state';
import ViewToggle from '../components/ViewToggle';
import DashboardStatsCard from '../components/DashboardStatsCard';
import StatusChip from '../components/StatusChip';
import WelcomeSection from '../components/WelcomeSection';
import { showSuccess, showError, showWarning } from '../utils/toast';
import {
  OTHER_DROPDOWN_VALUE,
  resolveOtherDropdownValue,
} from '../utils/customDropdownOther';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
import { numberInputValue, handleNumberChange, handleIntegerChange, numberOrEmptySchema, integerOrEmptySchema } from '../utils/formUtils';
import { EMPTY_STATES } from '../constants/microcopy';
import { QUERY_STALE } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';

/** Pricing templates in one list response (`{ data: [...], count }`). */
const templateRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

// Zod schemas
const discountTierSchema = z.object({
  minQuantity: integerOrEmptySchema(z, 1).refine((v) => v >= 1, 'Min quantity must be at least 1'),
  maxQuantity: z.union([z.number().int().min(1), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v)),
  discountPercent: numberOrEmptySchema(z).refine((v) => v >= 0 && v <= 100, 'Discount must be 0–100'),
});

const additionalOptionSchema = z.object({
  name: z.string().min(1, 'Option name is required'),
  price: z.number().min(0, 'Price must be at least 0'),
});

const optionalNumberOrEmptyNullable = (zod) =>
  zod.union([zod.number(), zod.literal(''), zod.null()]).optional().transform((v) => (v === '' ? null : v));

const pricingTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  category: z.string().min(1, 'Category is required'),
  materialType: z.string().optional(),
  materialSize: z.string().optional(),
  pricingMethod: z.enum(['unit', 'square_foot']).default('unit'),
  pricePerUnit: optionalNumberOrEmptyNullable(z),
  pricePerSquareFoot: optionalNumberOrEmptyNullable(z),
  colorType: z.enum(['black_white', 'color', 'spot_color']).optional(),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
  discountTiers: z.array(discountTierSchema).default([]),
  additionalOptions: z.array(additionalOptionSchema).default([]),
}).refine((data) => {
  // For Design Services, pricePerUnit is required
  if (data.category === 'Design Services') {
    return data.pricePerUnit !== null && data.pricePerUnit !== undefined;
  }
  // For square foot pricing, pricePerSquareFoot is required
  if (data.pricingMethod === 'square_foot' || 
      ['SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision'].includes(data.materialType || '')) {
    return data.pricePerSquareFoot !== null && data.pricePerSquareFoot !== undefined;
  }
  // For unit pricing, pricePerUnit is required
  if (data.pricingMethod === 'unit') {
    return data.pricePerUnit !== null && data.pricePerUnit !== undefined;
  }
  return true;
}, {
  message: 'Price is required',
  path: ['pricePerUnit'],
});

const Pricing = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({ category: 'all', isActive: 'all' });
  const [tableViewMode, setTableViewMode] = useState('table');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const { isManager, isAdmin, activeTenant, activeTenantId } = useAuth();
  const { isMobile } = useResponsive();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [showCategoryOtherInput, setShowCategoryOtherInput] = useState(false);
  const [categoryOtherValue, setCategoryOtherValue] = useState('');
  const [refreshingTemplates, setRefreshingTemplates] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(null);
  const { scopeReady, activeShopId, activeStudioLocationId, activeStudioLocation } = useWorkspaceScope();
  const effectiveStudioType =
    activeStudioLocation?.studioType ||
    activeTenant?.metadata?.studioType ||
    activeTenant?.businessType;

  const form = useForm({
    resolver: zodResolver(pricingTemplateSchema),
    defaultValues: {
      name: '',
      category: '',
      materialType: '',
      materialSize: '',
      pricingMethod: 'unit',
      pricePerUnit: null,
      pricePerSquareFoot: null,
      colorType: undefined,
      isActive: true,
      description: '',
      discountTiers: [],
      additionalOptions: [],
    },
  });

  const { fields: discountTierFields, append: appendDiscountTier, remove: removeDiscountTier } = useFieldArray({
    control: form.control,
    name: 'discountTiers',
  });

  const { fields: additionalOptionFields, append: appendAdditionalOption, remove: removeAdditionalOption } = useFieldArray({
    control: form.control,
    name: 'additionalOptions',
  });

  const category = form.watch('category');
  const pricingMethod = form.watch('pricingMethod');
  const materialType = form.watch('materialType');

  const templateFilterParams = useMemo(() => {
    const params = {};
    if (filters.category !== 'all') {
      params.category = filters.category;
    }
    if (filters.isActive !== 'all') {
      params.isActive = filters.isActive === 'true';
    }
    return params;
  }, [filters.category, filters.isActive]);

  // Pages on desktop (backend pagination); loads as you scroll on phones and tablets.
  const {
    rows: templates,
    isLoading: loading,
    refetch: refetchTemplates,
    error: templatesError,
    infinite: templatesInfinite,
  } = usePagedList({
    queryKey: (params) => ['pricingTemplates', 'list', activeTenantId, activeShopId, activeStudioLocationId, params],
    params: templateFilterParams,
    fetchPage: (params) => pricingService.getAll(params),
    getRows: templateRowsFromResponse,
    getTotal: (response, rows) => response?.count ?? rows.length,
    page: pagination.current,
    pageSize: pagination.pageSize,
    enabled: scopeReady,
    // Always fresh when the page opens, like before it used React Query.
    staleTime: 0,
  });

  useEffect(() => {
    if (!templatesError) return;
    console.error('Error fetching pricing templates:', templatesError);
    showError(templatesError, 'Failed to load pricing templates');
  }, [templatesError]);

  /** Reload the list (every loaded page on phones and tablets); `isRefresh` spins the refresh button. */
  const fetchTemplates = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingTemplates(true);
    try {
      await refetchTemplates();
    } finally {
      if (isRefresh) setRefreshingTemplates(false);
    }
  }, [refetchTemplates]);

  // Apply client-side filtering
  const filteredTemplates = useMemo(() => {
    return templates; // Backend already filters
  }, [templates, filters]);

  // Paginate filtered templates (phones and tablets: every loaded row)
  const paginatedTemplates = useMemo(() => {
    if (templatesInfinite) return filteredTemplates;
    const start = (pagination.current - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return filteredTemplates.slice(start, end);
  }, [filteredTemplates, pagination.current, pagination.pageSize, templatesInfinite]);

  const templatesCount = filteredTemplates.length;

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalTemplates = templates.length;
    const activeTemplates = templates.filter(t => t.isActive).length;
    const inactiveTemplates = templates.filter(t => !t.isActive).length;
    const categoryCount = new Set(templates.map(t => t.category)).size;
    
    return {
      totals: {
        totalTemplates,
        activeTemplates,
        inactiveTemplates,
        categoryCount
      }
    };
  }, [templates]);

  useEffect(() => {
    const loadCustomCategories = async () => {
      try {
        const options = await customDropdownService.getCustomOptions('job_category');
        setCustomCategories(options || []);
      } catch (error) {
        console.error('Failed to load custom categories:', error);
      }
    };
    loadCustomCategories();
  }, []);

  const { data: jobItemCategoriesApi = [] } = useQuery({
    queryKey: queryKeys.jobs.categories(activeTenantId, activeStudioLocationId, effectiveStudioType),
    queryFn: () => jobService.getCategories(),
    enabled: scopeReady,
    staleTime: QUERY_STALE.METADATA,
  });

  const defaultCategories = useMemo(() => {
    const apiCats = Array.isArray(jobItemCategoriesApi?.data) ? jobItemCategoriesApi.data : (Array.isArray(jobItemCategoriesApi) ? jobItemCategoriesApi : []);
    const mapped = apiCats.map(c => ({ value: c.value, label: c.label || c.value }));
    return mapped.length > 0 ? mapped : [
      { value: 'Services', label: 'Services' },
      { value: 'Materials', label: 'Materials' },
      { value: 'Other', label: 'Other' }
    ];
  }, [jobItemCategoriesApi]);

  const materialTypes = useMemo(() => {
    const fromApi = jobItemCategoriesApi?.materialTypes;
    return Array.isArray(fromApi) && fromApi.length > 0 ? fromApi : [
      'Plain Paper', 'Photo Paper', 'SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision',
      'Canvas', 'Cardstock', 'Sticker Paper', 'Vinyl', 'Foam Board', 'Corrugated Board',
      'Bond Paper', 'Glossy Paper', 'Matte Paper', 'Satin Paper', 'Transparent Vinyl',
      'Mesh Material', 'Fabric', 'Other'
    ];
  }, [jobItemCategoriesApi?.materialTypes]);

  const handleAdd = () => {
    setEditingTemplate(null);
    form.reset({
      name: '',
      category: '',
      materialType: '',
      materialSize: '',
      pricingMethod: 'unit',
      pricePerUnit: null,
      pricePerSquareFoot: null,
      colorType: undefined,
      isActive: true,
      description: '',
      discountTiers: [],
      additionalOptions: [],
    });
    setShowCategoryOtherInput(false);
    setCategoryOtherValue('');
    setModalVisible(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    form.reset({
      ...template,
      discountTiers: template.discountTiers || [],
      additionalOptions: template.additionalOptions || [],
    });
    setModalVisible(true);
  };

  const handleView = (template) => {
    setViewingTemplate(template);
    setDrawerVisible(true);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setViewingTemplate(null);
  };

  const handleDelete = async (id) => {
    try {
      setDeletingTemplate(id);
      await pricingService.delete(id);
      showSuccess('Pricing template deleted successfully');
      fetchTemplates();
    } catch (error) {
      showError(error, 'Failed to delete pricing template');
    } finally {
      setDeletingTemplate(null);
    }
  };

  const onSubmit = async (values) => {
    try {
      const resolvedCategory = resolveOtherDropdownValue(values.category, categoryOtherValue);
      if (values.category === OTHER_DROPDOWN_VALUE && !resolvedCategory) {
        showWarning('Enter a category name for "Other (specify)", or pick a category from the list.');
        return;
      }
      if (resolvedCategory) {
        values.category = resolvedCategory;
        void customDropdownService.saveCustomOption('job_category', resolvedCategory, resolvedCategory);
      }

      // Set deprecated fields for backwards compatibility
      values.basePrice = 0;
      values.setupFee = 0;
      values.minimumQuantity = 1;
      values.maximumQuantity = null;
      
      // Clean up custom dimension fields
      values.customHeight = undefined;
      values.customWidth = undefined;
      values.customUnit = undefined;
      
      // For Design Services, set default values
      if (values.category === 'Design Services') {
        values.pricingMethod = 'unit';
        values.materialSize = 'N/A';
        values.pricePerSquareFoot = 0;
        if (!values.colorType) {
          values.colorType = 'color';
        }
      }
      
      // For square-foot pricing materials
      const isSquareFootPricing = values.pricingMethod === 'square_foot' || 
                                  ['SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision'].includes(values.materialType || '');
      
      if (isSquareFootPricing && values.category !== 'Design Services') {
        values.pricingMethod = 'square_foot';
        values.pricePerUnit = 0;
        if (!values.colorType) {
          values.colorType = 'color';
        }
      }
      
      if (editingTemplate) {
        await pricingService.update(editingTemplate.id, values);
        showSuccess('Pricing template updated successfully');
      } else {
        await pricingService.create(values);
        showSuccess('Pricing template created successfully');
      }
      setModalVisible(false);
      form.reset();
      fetchTemplates();
    } catch (error) {
      showError(error, error.error || 'Operation failed');
    }
  };

  const getMergedCategoryOptions = () => {
    const merged = [...defaultCategories];
    customCategories.forEach(cat => {
      if (!merged.find(c => c.value === cat.value)) {
        merged.push({ value: cat.value, label: cat.label });
      }
    });
    return merged;
  };

  const handleCategoryChange = (value) => {
    form.setValue('category', value);
    if (value === '__OTHER__') {
      setShowCategoryOtherInput(true);
    } else {
      setShowCategoryOtherInput(false);
    }
  };

  const handleSaveCustomCategory = async () => {
    if (!categoryOtherValue || !categoryOtherValue.trim()) {
      showWarning('Please enter a category name');
      return;
    }

    try {
      setSavingCategory(true);
      const saved = await customDropdownService.saveCustomOption('job_category', categoryOtherValue.trim());
      if (saved) {
        setCustomCategories(prev => {
          if (prev.find(c => c.value === saved.value)) {
            return prev;
          }
          return [...prev, saved];
        });
        
        form.setValue('category', saved.value);
        setShowCategoryOtherInput(false);
        setCategoryOtherValue('');
        showSuccess(`"${saved.label}" added to categories`);
      }
    } catch (error) {
      showError(error, error.response?.data?.error || 'Failed to save custom category');
    } finally {
      setSavingCategory(false);
    }
  };

  const materialSizes = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid', 'Custom', 'N/A'];

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => <span className="font-medium text-foreground">{record?.name || '—'}</span>
    },
    {
      key: 'category',
      label: 'Category',
      render: (_, record) => <Badge variant="outline">{record?.category || '—'}</Badge>
    },
    {
      key: 'basePrice',
      label: 'Base Price',
      render: (_, record) => <span className="text-foreground">₵ {parseFloat(record?.basePrice || 0).toFixed(2)}</span>
    },
    {
      key: 'pricePerUnit',
      label: 'Price/Unit',
      render: (_, record) => <span className="text-foreground">{record?.pricePerUnit ? `₵ ${parseFloat(record.pricePerUnit).toFixed(2)}` : '—'}</span>
    },
    {
      key: 'setupFee',
      label: 'Setup Fee',
      render: (_, record) => <span className="text-foreground">₵ {parseFloat(record?.setupFee || 0).toFixed(2)}</span>
    },
    {
      key: 'colorType',
      label: 'Color Type',
      render: (_, record) => {
        const labels = {
          black_white: 'B&W',
          color: 'Color',
          spot_color: 'Spot Color'
        };
        return record?.colorType ? <Badge variant="outline">{labels[record.colorType]}</Badge> : <span className="text-foreground">—</span>;
      }
    },
    {
      key: 'isActive',
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
    setPagination({ ...pagination, current: 1 });
  };

  const hasActiveFilters = filters.category !== 'all' || filters.isActive !== 'all';
  const pricingEmptyState = getEmptyStateProps(
    hasActiveFilters ? EMPTY_STATES.PRICING_FILTERED : EMPTY_STATES.PRICING_TEMPLATES,
    hasActiveFilters
      ? { primary: handleClearFilters }
      : isManager
        ? { primary: handleAdd }
        : {}
  );

  const isDesignService = category === 'Design Services';
  const isSquareFootPricing = pricingMethod === 'square_foot' || 
                              ['SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision'].includes(materialType || '');
  const isPrintingOrPhotocopy = category && (
    category.toLowerCase().includes('printing') ||  
    category.toLowerCase().includes('photocopy')
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Pricing Templates"
          subText="Manage pricing templates for your products and services."
        />
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <ViewToggle value={tableViewMode} onChange={setTableViewMode} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setFilterDrawerOpen(true)} size={isMobile ? "icon" : "default"}>
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Filter</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter templates by category or status</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                onClick={() => fetchTemplates(true)}
                disabled={refreshingTemplates}
                size={isMobile ? "icon" : "default"}
              >
                {refreshingTemplates ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh pricing templates</TooltipContent>
          </Tooltip>
          {isManager && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Template
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a new pricing template</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total number of pricing templates"
          title="Total Templates"
          value={summaryStats?.totals?.totalTemplates || 0}
          icon={Currency}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Active pricing templates"
          title="Active"
          value={summaryStats?.totals?.activeTemplates || 0}
          icon={Currency}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Inactive pricing templates"
          title="Inactive"
          value={summaryStats?.totals?.inactiveTemplates || 0}
          icon={Currency}
          iconBgColor="rgba(107, 114, 128, 0.1)"
          iconColor="#6b7280"
        />
        <DashboardStatsCard
          tooltip="Number of unique pricing categories"
          title="Categories"
          value={summaryStats?.totals?.categoryCount || 0}
          icon={Currency}
          iconBgColor="rgba(59, 130, 246, 0.1)"
          iconColor="#3b82f6"
        />
      </div>

      {/* Main Content Area */}
      <DashboardTable
        data={paginatedTemplates}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={pricingEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: templatesCount
        }}
        infinite={templatesInfinite}
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
            <SheetTitle>Filter Pricing Templates</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={filters.category}
                onValueChange={(value) => setFilters({ ...filters, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {getMergedCategoryOptions().map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
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
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
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

      <Dialog open={modalVisible} onOpenChange={(open) => {
        setModalVisible(open);
        if (!open) {
          setShowCategoryOtherInput(false);
          setCategoryOtherValue('');
        }
      }}>
        <DialogContent className="sm:w-[var(--modal-w-2xl)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Pricing Template' : 'Add Pricing Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update the pricing template details' : 'Create a new pricing template'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter template name" />
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
                      <Select
                        value={field.value}
                        onValueChange={handleCategoryChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getMergedCategoryOptions().map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                          <SelectItem value="__OTHER__">Other (specify)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {showCategoryOtherInput && (
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Custom Service, Design Work"
                    value={categoryOtherValue}
                    onChange={(e) => setCategoryOtherValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCustomCategory();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleSaveCustomCategory}>
                    Save
                  </Button>
                </div>
              )}

              {/* Material Type and Size */}
              {!isDesignService && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="materialType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Type (optional)</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            // Auto-set pricing method
                            if (['SAV (Self-Adhesive Vinyl)', 'Banner', 'One Way Vision'].includes(value)) {
                              form.setValue('pricingMethod', 'square_foot');
                            } else if (value) {
                              const currentPricingMethod = form.getValues('pricingMethod');
                              if (!currentPricingMethod || currentPricingMethod === 'square_foot') {
                                form.setValue('pricingMethod', 'unit');
                              }
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select material type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {materialTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="materialSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Size (optional)</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select material size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {materialSizes.map(size => (
                              <SelectItem key={size} value={size}>{size}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {isDesignService && (
                <FormField
                  control={form.control}
                  name="materialType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Standard">Standard</SelectItem>
                          <SelectItem value="Premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Pricing Fields */}
              {isDesignService ? (
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="pricePerUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Per Unit</FormLabel>
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
                  name="pricingMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pricing Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unit">By Unit (Quantity × Price)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                  <FormField
                  control={form.control}
                  name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Status</FormLabel>
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
              ) : isSquareFootPricing ? (
                <div className={`grid gap-4 ${isPrintingOrPhotocopy ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <FormField
                    control={form.control}
                    name="pricePerSquareFoot"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Per Square Foot (optional)</FormLabel>
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
                    name="pricingMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pricing Method</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="square_foot">By Square Foot (Size × Price/Sqft)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {isPrintingOrPhotocopy && (
                    <FormField
                      control={form.control}
                      name="colorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color Type (optional)</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select color type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="black_white">Black & White</SelectItem>
                              <SelectItem value="color">Color</SelectItem>
                              <SelectItem value="spot_color">Spot Color</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Status</FormLabel>
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
              ) : (
                <div className={`grid gap-4 ${isPrintingOrPhotocopy ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <FormField
                    control={form.control}
                    name="pricePerUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Per Unit</FormLabel>
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
                    name="pricingMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pricing Method</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unit">By Unit (Quantity × Price)</SelectItem>
                            <SelectItem value="square_foot">By Square Foot (Size × Price/Sqft)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {isPrintingOrPhotocopy && (
                    <FormField
                      control={form.control}
                      name="colorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color Type (optional)</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select color type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="black_white">Black & White</SelectItem>
                              <SelectItem value="color">Color</SelectItem>
                              <SelectItem value="spot_color">Spot Color</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Status</FormLabel>
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
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Enter internal notes about this template"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator>Discount Tiers (Optional)</Separator>

              {discountTierFields.map((field, index) => (
                <Card key={field.id} className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`discountTiers.${index}.minQuantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="100"
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
                        name={`discountTiers.${index}.maxQuantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Quantity (optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Optional"
                                min={1}
                                value={field.value == null ? '' : field.value}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    field.onChange(null);
                                    return;
                                  }
                                  const n = parseInt(raw, 10);
                                  field.onChange(Number.isNaN(n) ? null : n);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`discountTiers.${index}.discountPercent`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount %</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="number"
                                  placeholder="10"
                                  min={0}
                                  max={100}
                                  value={numberInputValue(field.value)}
                                  onChange={(e) => handleNumberChange(e, field.onChange)}
                                  className="pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => removeDiscountTier(index)}
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />
                      Remove Tier
                    </Button>
                  </CardContent>
                </Card>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => appendDiscountTier({ minQuantity: 1, maxQuantity: null, discountPercent: 0 })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Discount Tier
              </Button>

              <Separator>Additional Options (Optional)</Separator>

              {additionalOptionFields.map((field, index) => (
                <Card key={field.id} className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`additionalOptions.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Option Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Lamination, Binding" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additionalOptions.${index}.price`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Additional Price</FormLabel>
                            <FormControl>
                              <div className="flex rounded-md border border-input">
                                <span className="inline-flex items-center px-3 text-sm text-muted-foreground border-r border-input bg-muted">₵</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="w-full border-0 rounded-l-none"
                                  value={field.value ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    field.onChange(v === '' ? undefined : parseFloat(v) || 0);
                                  }}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => removeAdditionalOption(index)}
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />
                      Remove Option
                    </Button>
                  </CardContent>
                </Card>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => appendAdditionalOption({ name: '', price: 0 })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Additional Option
              </Button>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setModalVisible(false);
                    setShowCategoryOtherInput(false);
                    setCategoryOtherValue('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  {editingTemplate ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogBody>
        </DialogContent>
      </Dialog>

      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="Pricing Template Details"
        width={720}
        onEdit={isManager && viewingTemplate ? () => {
          handleEdit(viewingTemplate);
          setDrawerVisible(false);
        } : null}
        onDelete={isAdmin && viewingTemplate ? () => {
          handleDelete(viewingTemplate.id);
          setDrawerVisible(false);
        } : null}
        deleteConfirmText="Are you sure you want to delete this pricing template?"
        fields={viewingTemplate ? [
          { label: 'Template Name', value: viewingTemplate.name },
          { 
            label: 'Category', 
            value: viewingTemplate.category,
            render: (cat) => <Badge variant="outline">{cat}</Badge>
          },
          { label: 'Job Type', value: viewingTemplate.jobType || '-' },
          { label: 'Material Type', value: viewingTemplate.materialType || viewingTemplate.paperType || '-' },
          { label: 'Material Size', value: viewingTemplate.materialSize || viewingTemplate.paperSize || '-' },
          ...(viewingTemplate.materialSize === 'Custom' || (viewingTemplate.materialSize === undefined && viewingTemplate.paperSize === 'Custom') ? [
            { label: 'Custom Height', value: viewingTemplate.customHeight ? `${viewingTemplate.customHeight} ${viewingTemplate.customUnit || ''}` : '-' },
            { label: 'Custom Width', value: viewingTemplate.customWidth ? `${viewingTemplate.customWidth} ${viewingTemplate.customUnit || ''}` : '-' },
            { label: 'Price per Square Foot', value: viewingTemplate.pricePerSquareFoot ? `₵ ${parseFloat(viewingTemplate.pricePerSquareFoot).toFixed(2)}` : '-' },
          ] : []),
          { 
            label: 'Color Type', 
            value: viewingTemplate.colorType,
            render: (type) => {
              const labels = {
                black_white: 'Black & White',
                color: 'Color',
                spot_color: 'Spot Color'
              };
              return type ? labels[type] : '-';
            }
          },
          { 
            label: 'Base Price', 
            value: viewingTemplate.basePrice,
            render: (price) => `₵ ${parseFloat(price || 0).toFixed(2)}`
          },
          { 
            label: 'Price Per Unit', 
            value: viewingTemplate.pricePerUnit,
            render: (price) => price ? `₵ ${parseFloat(price).toFixed(2)}` : '-'
          },
          { 
            label: 'Setup Fee', 
            value: viewingTemplate.setupFee,
            render: (fee) => `₵ ${parseFloat(fee || 0).toFixed(2)}`
          },
          { label: 'Min Quantity', value: viewingTemplate.minimumQuantity || 1 },
          { label: 'Max Quantity', value: viewingTemplate.maximumQuantity || 'Unlimited' },
          { label: 'Description', value: viewingTemplate.description || '-' },
          {
            label: 'Discount Tiers',
            value: viewingTemplate.discountTiers,
            render: (tiers) => {
              if (!tiers || tiers.length === 0) return '-';
              return (
                <List
                  size="small"
                  dataSource={tiers}
                  renderItem={(tier) => (
                    <List.Item>
                      <Space>
                        <Badge variant="default">{tier.discountPercent}% off</Badge>
                        <span>
                          for {tier.minQuantity} - {tier.maxQuantity || '∞'} units
                        </span>
                      </Space>
                    </List.Item>
                  )}
                />
              );
            }
          },
          {
            label: 'Additional Options',
            value: viewingTemplate.additionalOptions,
            render: (options) => {
              if (!options || options.length === 0) return '-';
              return (
                <List
                  size="small"
                  dataSource={options}
                  renderItem={(option) => (
                    <List.Item>
                      <Space>
                        <Badge variant="outline">{option.name}</Badge>
                        <span>₵ {parseFloat(option.price || 0).toFixed(2)}</span>
                      </Space>
                    </List.Item>
                  )}
                />
              );
            }
          },
          { 
            label: 'Status', 
            value: viewingTemplate.isActive,
            render: (isActive) => (
              <StatusChip status={isActive ? 'active_flag' : 'inactive_flag'} />
            )
          },
          { 
            label: 'Created At', 
            value: viewingTemplate.createdAt,
            render: (value) => value ? new Date(value).toLocaleString() : '-'
          },
          { 
            label: 'Last Updated', 
            value: viewingTemplate.updatedAt,
            render: (value) => value ? new Date(value).toLocaleString() : '-'
          },
        ] : []}
      />
    </div>
  );
};

export default Pricing;
