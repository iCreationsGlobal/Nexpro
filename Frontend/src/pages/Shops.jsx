import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Store, Plus, Edit, Trash2, MapPin, RefreshCw, Eye } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useShopOptional } from '../context/ShopContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { usePagedList } from '../hooks/usePagedList';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import DashboardTable from '../components/DashboardTable';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import StatusChip from '../components/StatusChip';
import DashboardStatsCard from '../components/DashboardStatsCard';
import { showSuccess, showError } from '../utils/toast';
import api from '../services/api';
import shopService from '../services/shopService';
import userService from '../services/userService';
import { resolveImageUrl } from '../utils/fileUtils';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, SHOP_TYPE_LABELS } from '../constants';
import {
  CORE_BUSINESS_TYPES,
  getBusinessOptionLabel,
  getBusinessOptionsByCoreType,
} from '@/constants/businessTypes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Validation schema
const shopSchema = z.object({
  name: z.string().min(1, 'Shop name is required'),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default('Ghana'),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  managerUserId: z.string().optional(),
  shopType: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().optional(),
});

/** Shops in one list response (`{ data: [...], count }`; older shapes nest them). */
const shopRowsFromResponse = (response) => {
  if (!response) return [];
  return Array.isArray(response.data)
    ? response.data
    : (response.data?.data || response.data?.shops || []);
};

const Shops = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenant } = useAuth();
  const shopContext = useShopOptional();
  const { isMobile } = useResponsive();
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);

  // State
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState(null);
  const [viewingShop, setViewingShop] = useState(null);
  const [deleteShop, setDeleteShop] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const logoInputRef = useRef(null);
  const shopTypeOptions = useMemo(
    () => getBusinessOptionsByCoreType(CORE_BUSINESS_TYPES.SHOP),
    []
  );

  // Form
  const form = useForm({
    resolver: zodResolver(shopSchema),
    defaultValues: {
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'Ghana',
      postalCode: '',
      shopType: '',
      phone: '',
      email: '',
      managerUserId: '',
      isActive: true,
      isDefault: false,
    },
  });

  const loadTeamMembers = useCallback(async () => {
    try {
      const response = await userService.getAll({ limit: 200, isActive: 'true' });
      const list = Array.isArray(response?.data) ? response.data : response?.data?.data || [];
      setTeamMembers(list.filter((u) => u.isActive !== false));
    } catch {
      setTeamMembers([]);
    }
  }, []);

  useEffect(() => {
    if (isModalOpen) loadTeamMembers();
  }, [isModalOpen, loadTeamMembers]);
  
  // Fetch shops: pages on desktop; loads as you scroll on phones and tablets.
  const shopFilterParams = useMemo(() => ({ search: debouncedSearch }), [debouncedSearch]);
  const {
    rows: shops,
    total: shopsTotal,
    response: shopsResponse,
    isLoading: shopsLoading,
    isFetching: shopsFetching,
    refetch: refetchShops,
    error: shopsError,
    infinite: shopsInfinite,
  } = usePagedList({
    queryKey: (params) => ['shops', 'list', activeTenant?.id, params],
    params: shopFilterParams,
    fetchPage: (params) => api.get('/shops', { params }),
    getRows: shopRowsFromResponse,
    getTotal: (response, rows) => response?.data?.count ?? response?.count ?? rows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
    // Fetched fresh each time the page opens, as before.
    staleTime: 0,
    queryOptions: { retry: false },
  });
  // Desktop shows the skeleton on every fetch, as before; loading more on phones keeps the rows.
  const loading = shopsLoading || (shopsFetching && !shopsInfinite);
  const fetchShops = useCallback(() => refetchShops(), [refetchShops]);

  useEffect(() => {
    if (!shopsError) return;
    console.error('Error fetching shops:', shopsError);
    showError('Failed to fetch shops');
  }, [shopsError]);
  
  useEffect(() => {
    setPageSearchConfig({ scope: 'shops', placeholder: SEARCH_PLACEHOLDERS.SHOPS });
  }, [setPageSearchConfig]);

  // Stats (counts from the current page — the first page on phones and tablets)
  const stats = useMemo(() => {
    const pageShops = shopRowsFromResponse(shopsResponse);
    const total = shopsTotal;
    const active = pageShops.filter(s => s.isActive).length;
    const inactive = pageShops.filter(s => !s.isActive).length;
    const cities = [...new Set(pageShops.map(s => s.city).filter(Boolean))].length;
    
    return { total, active, inactive, cities };
  }, [shopsResponse, shopsTotal]);

  const getShopTypeLabel = useCallback(
    (shopType) => getBusinessOptionLabel(shopType) || SHOP_TYPE_LABELS[shopType] || shopType || '—',
    []
  );

  // Handlers (must be defined before columns that reference them)
  const handleEdit = useCallback((shop) => {
    setEditingShop(shop);
    form.reset({
      name: shop.name || '',
      code: shop.code || '',
      address: shop.address || '',
      city: shop.city || '',
      state: shop.state || '',
      country: shop.country || 'Ghana',
      postalCode: shop.postalCode || '',
      shopType: shop.shopType || shop.metadata?.shopType || '',
      phone: shop.phone || '',
      email: shop.email || '',
      managerUserId: shop.managerUserId || shop.manager?.id || '',
      isActive: shop.isActive ?? true,
      isDefault: shop.isDefault ?? false,
    });
    setLogoPreview(shop.logoUrl ? resolveImageUrl(shop.logoUrl) : '');
    setLogoFile(null);
    setIsModalOpen(true);
  }, [form]);
  
  // Table columns - DashboardTable format: { key, label, render }
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Shop Name',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Store className="h-4 w-4 text-green-700" />
          </div>
          <div>
            <div className="font-medium flex items-center gap-2 flex-wrap">
              <span>{record?.name || '—'}</span>
              {record?.isDefault && (
                <Badge variant="outline" className="text-xs font-normal border-[#166534] text-[#166534]">
                  Main shop
                </Badge>
              )}
            </div>
            {record?.code && (
              <div className="text-xs text-gray-500">{record.code}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'shopType',
      label: 'Business type',
      render: (_, record) => (
        <span className="text-sm text-muted-foreground">
          {getShopTypeLabel(record?.shopType)}
        </span>
      ),
    },
    {
      key: 'city',
      label: 'Location',
      render: (_, record) => (
        <div className="flex items-center gap-1 text-gray-600">
          <MapPin className="h-3 w-3" />
          <span>{record?.city || '—'}</span>
        </div>
      ),
    },
    {
      key: 'manager',
      label: 'Manager',
      render: (_, record) => (
        <span className="text-sm text-muted-foreground">
          {record?.manager?.name || record?.manager?.email || '—'}
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => (
        <StatusChip status={record?.isActive ? 'active_flag' : 'inactive_flag'} />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        <SecondaryButton size="sm" onClick={() => setViewingShop(record)}>
          <Eye className="h-4 w-4" />
          <span className="ml-2">View</span>
        </SecondaryButton>
      ),
    },
  ], [getShopTypeLabel]);
  
  const handleCreate = useCallback(() => {
    setEditingShop(null);
    form.reset({
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'Ghana',
      postalCode: '',
      shopType: activeTenant?.metadata?.shopType || activeTenant?.metadata?.businessSubType || '',
      phone: '',
      email: '',
      managerUserId: '',
      isActive: true,
      isDefault: false,
    });
    setLogoPreview('');
    setLogoFile(null);
    setIsModalOpen(true);
  }, [form, activeTenant?.metadata?.shopType]);

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    handleCreate();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('add');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, handleCreate]);
  
  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      const payload = {
        ...data,
        managerUserId: data.managerUserId || null,
        email: data.email || null,
        phone: data.phone || null,
      };

      let savedId = editingShop?.id;
      if (editingShop) {
        const res = await api.put(`/shops/${editingShop.id}`, payload);
        savedId = res?.data?.data?.id || res?.data?.id || editingShop.id;
        showSuccess('Shop updated successfully');
      } else {
        const res = await api.post('/shops', payload);
        savedId = res?.data?.data?.id || res?.data?.id;
        showSuccess('Shop created successfully');
      }

      if (logoFile && savedId) {
        await shopService.uploadLogo(savedId, logoFile);
      }

      setIsModalOpen(false);
      setLogoFile(null);
      // refreshShops invalidates every ['shops', …] query, this list included.
      if (shopContext?.refreshShops) shopContext.refreshShops();
      else fetchShops();
    } catch (error) {
      console.error('Error saving shop:', error);
      showError(error.response?.data?.message || 'Failed to save shop');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Please choose an image file');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };
  
  const handleDelete = async () => {
    if (!deleteShop) return;
    
    try {
      await api.delete(`/shops/${deleteShop.id}`);
      showSuccess('Shop deleted successfully');
      setDeleteShop(null);
      fetchShops();
    } catch (error) {
      console.error('Error deleting shop:', error);
      showError(error.response?.data?.message || 'Failed to delete shop');
    }
  };
  
  const handlePageChange = (newPagination) => {
    // DashboardTable passes { current, pageSize } or just a number
    if (typeof newPagination === 'number') {
      setPagination(prev => ({ ...prev, page: newPagination }));
    } else {
      setPagination(prev => ({
        ...prev,
        page: newPagination.current ?? prev.page,
        pageSize: newPagination.pageSize ?? prev.pageSize,
      }));
    }
  };
  
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Shops</h1>
          <p className="text-gray-600 mt-1">Manage your shop locations and branches</p>
        </div>
        <div className="flex flex-row gap-2 w-full md:w-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <SecondaryButton onClick={fetchShops} size={isMobile ? 'icon' : 'default'}>
                <RefreshCw className="h-4 w-4" />
              </SecondaryButton>
            </TooltipTrigger>
            <TooltipContent>Refresh shops list</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleCreate}
                className="bg-green-700 hover:bg-green-800 flex-1 md:flex-none"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Shop
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new shop location</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardStatsCard
          tooltip="Total number of shop locations"
          title="Total Shops"
          value={stats.total}
          subtitle={`${stats.total} locations`}
          icon={Store}
        />
        <DashboardStatsCard
          tooltip="Operational shop locations"
          title="Active"
          value={stats.active}
          subtitle={`${stats.active} operational`}
          icon={Store}
        />
        <DashboardStatsCard
          tooltip="Closed shop locations"
          title="Inactive"
          value={stats.inactive}
          subtitle={`${stats.inactive} closed`}
          icon={Store}
        />
        <DashboardStatsCard
          tooltip="Number of cities with shops"
          title="Cities"
          value={stats.cities}
          subtitle={`${stats.cities} locations`}
          icon={MapPin}
        />
      </div>
      
      {/* Data Table */}
      <DashboardTable
        data={shops}
        columns={columns}
        loading={loading}
        title={null}
        emptyDescription="No shop locations yet. Set up your shop locations to manage inventory and sales."
        emptyAction={
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Shop
          </Button>
        }
        pageSize={pagination.pageSize}
        externalPagination={{ current: pagination.page, total: shopsTotal }}
        onPageChange={handlePageChange}
        infinite={shopsInfinite}
      />

      {/* View Shop Details */}
      <DetailsDrawer
        open={!!viewingShop}
        onClose={() => setViewingShop(null)}
        title={viewingShop?.name || 'Shop Details'}
        description="Review this shop’s location, manager, and operating status."
        width={520}
        primaryAction={viewingShop ? {
          label: 'Edit shop',
          icon: <Edit className="h-4 w-4 mr-2" />,
          onClick: () => {
            const shop = viewingShop;
            setViewingShop(null);
            handleEdit(shop);
          },
        } : null}
        moreMenuItems={viewingShop ? [
          {
            label: 'Delete shop',
            icon: <Trash2 className="h-4 w-4 mr-2" />,
            destructive: true,
            onClick: () => {
              setDeleteShop(viewingShop);
              setViewingShop(null);
            },
          },
        ] : []}
      >
        {viewingShop ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                {viewingShop.logoUrl ? (
                  <img
                    src={resolveImageUrl(viewingShop.logoUrl)}
                    alt={`${viewingShop.name || 'Shop'} logo`}
                    className="h-8 w-8 rounded-full object-contain"
                  />
                ) : (
                  <Store className="h-5 w-5 text-green-700" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{viewingShop.name || '—'}</h3>
                  {viewingShop.isDefault ? (
                    <Badge variant="outline" className="border-[#166534] text-[#166534]">
                      Main shop
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {getShopTypeLabel(viewingShop.shopType)}
                </p>
              </div>
              <StatusChip status={viewingShop.isActive ? 'active_flag' : 'inactive_flag'} />
            </div>

            <DrawerSectionCard title="Contact and manager">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Code</p>
                  <p className="font-medium">{viewingShop.code || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Manager</p>
                  <p className="font-medium">{viewingShop.manager?.name || viewingShop.manager?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{viewingShop.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Business email</p>
                  <p className="font-medium break-all">{viewingShop.email || '—'}</p>
                </div>
              </div>
            </DrawerSectionCard>

            <DrawerSectionCard title="Location">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">City</p>
                  <p className="font-medium">{viewingShop.city || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">State/Region</p>
                  <p className="font-medium">{viewingShop.state || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{viewingShop.country || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Postal code</p>
                  <p className="font-medium">{viewingShop.postalCode || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Address</p>
                  <p className="font-medium">{viewingShop.address || '—'}</p>
                </div>
              </div>
            </DrawerSectionCard>
          </div>
        ) : null}
      </DetailsDrawer>
      
      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:w-[var(--modal-w-md)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>{editingShop ? 'Edit Shop' : 'Add New Shop'}</DialogTitle>
            <DialogDescription>
              {editingShop
                ? 'Update this shop’s location details and business type.'
                : 'Add the shop’s name, type, and address. Invite managers and staff from Team and choose which shops they can access.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <Form {...form}>
            <form id="shop-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shop Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Main Branch" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="shopType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business type (optional)</FormLabel>
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select what best matches this shop" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {shopTypeOptions.map((option) => (
                          <div key={option.id} className="px-1 py-0.5">
                            <SelectItem value={option.id} className="!items-start !py-1.5">
                              <span className="font-medium text-sm">{option.label}</span>
                            </SelectItem>
                            {option.description ? (
                              <div className="pl-8 pr-2 pt-0.5 text-xs text-muted-foreground leading-snug">
                                {option.description}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg border border-border p-4 space-y-3">
                <Label>Shop logo (optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Shown on invoices and receipts for this shop. Leave empty to use workspace branding.
                </p>
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Shop logo preview"
                    className="max-h-20 max-w-[180px] object-contain border border-border rounded-md p-2"
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    {logoPreview ? 'Change logo' : 'Upload logo'}
                  </Button>
                  {logoPreview ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview('');
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shop Code (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="MAIN-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Business Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Accra" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State/Region (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Greater Accra" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="+233..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business email (optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="shop@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="managerUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manager (optional)</FormLabel>
                    <Select
                      value={field.value || '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No manager assigned</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name || member.email}
                            {member.role ? ` (${member.role})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Ghana" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="00233" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {editingShop && !editingShop.isDefault ? (
                <FormField
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <FormItem className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Main shop</FormLabel>
                        <p className="text-sm text-gray-500">Use as the default shop for this workspace</p>
                      </div>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <FormLabel className="text-base">Active Status</FormLabel>
                      <p className="text-sm text-gray-500">
                        Set whether this shop is currently operational
                      </p>
                    </div>
                    <FormControl>
                      <div className="min-h-[44px] min-w-[44px] flex items-center justify-end shrink-0">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
          </DialogBody>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              form="shop-form"
              className="bg-green-700 hover:bg-green-800"
              loading={isSubmitting}
            >
              {editingShop ? 'Update Shop' : 'Create Shop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteShop} onOpenChange={() => setDeleteShop(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shop</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteShop?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Shops;
