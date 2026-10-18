import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStudioLocation } from '../context/StudioLocationContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { usePagedList } from '../hooks/usePagedList';
import studioLocationService from '../services/studioLocationService';
import userService from '../services/userService';
import { resolveImageUrl } from '../utils/fileUtils';
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
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import DashboardTable from '../components/DashboardTable';
import StatusChip from '../components/StatusChip';
import DashboardStatsCard from '../components/DashboardStatsCard';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { showSuccess, showError } from '../utils/toast';
import { DEBOUNCE_DELAYS } from '../constants';
import { EMPTY_STATES } from '../constants/microcopy';

const locationSchema = z.object({
  name: z.string().min(1, 'Studio name is required'),
  studioType: z.string().optional(),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default('Ghana'),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  managerUserId: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().optional(),
});

/** Studios in one list response (`{ data: [...], count }`). */
const locationRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

/** Cached studio lists (one page on desktop; `{ pages, pageParams }` on phones and tablets). */
const LOCATION_LIST_KEY = ['studio-locations', 'list'];

const StudioLocations = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTenant, isManager } = useAuth();
  const { refreshLocations } = useStudioLocation();
  const { isMobile } = useResponsive();
  const queryClient = useQueryClient();
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);

  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const logoInputRef = useRef(null);
  const studioTypeOptions = useMemo(
    () => getBusinessOptionsByCoreType(CORE_BUSINESS_TYPES.STUDIO),
    []
  );

  const form = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: '',
      studioType: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'Ghana',
      postalCode: '',
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

  // Pages on desktop; loads as you scroll on phones and tablets.
  const locationFilterParams = useMemo(() => ({ search: debouncedSearch }), [debouncedSearch]);
  const {
    rows: locations,
    total: locationsTotal,
    response: locationsResponse,
    isLoading: locationsLoading,
    isFetching: locationsFetching,
    refetch: refetchLocations,
    error: locationsError,
    infinite: locationsInfinite,
  } = usePagedList({
    queryKey: (params) => [...LOCATION_LIST_KEY, activeTenant?.id, params],
    params: locationFilterParams,
    fetchPage: (params) => studioLocationService.getAll(params),
    getRows: locationRowsFromResponse,
    getTotal: (response, rows) => response?.count ?? rows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
    // Fetched fresh each time the page opens, as before.
    staleTime: 0,
    queryOptions: { retry: false },
  });
  // Desktop shows the skeleton on every fetch, as before; loading more on phones keeps the rows.
  const loading = locationsLoading || (locationsFetching && !locationsInfinite);
  const fetchLocations = useCallback(() => refetchLocations(), [refetchLocations]);

  useEffect(() => {
    if (locationsError) showError(locationsError?.response?.data?.message || 'Failed to load studio locations');
  }, [locationsError]);

  useEffect(() => {
    setPageSearchConfig({ scope: 'studio-locations', placeholder: 'Search studios by name or city…' });
  }, [setPageSearchConfig]);

  // Counts from the current page (the first page on phones and tablets)
  const stats = useMemo(() => {
    const pageLocations = locationRowsFromResponse(locationsResponse);
    const active = pageLocations.filter((l) => l.isActive).length;
    return {
      total: locationsTotal,
      active,
      inactive: pageLocations.length - active,
      cities: [...new Set(pageLocations.map((l) => l.city).filter(Boolean))].length,
    };
  }, [locationsResponse, locationsTotal]);

  const handleEdit = useCallback(
    (row) => {
      setEditing(row);
      form.reset({
        name: row.name || '',
        studioType: row.studioType || row.metadata?.studioType || '',
        code: row.code || '',
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        country: row.country || 'Ghana',
        postalCode: row.postalCode || '',
        phone: row.phone || '',
        email: row.email || '',
        managerUserId: row.managerUserId || row.manager?.id || '',
        isActive: row.isActive ?? true,
        isDefault: row.isDefault ?? false,
      });
      setLogoPreview(row.logoUrl ? resolveImageUrl(row.logoUrl) : '');
      setLogoFile(null);
      setIsModalOpen(true);
    },
    [form]
  );

  const getStudioTypeLabel = useCallback(
    (studioType) => getBusinessOptionLabel(studioType) || studioType || '—',
    []
  );

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Studio',
        render: (_, record) => (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <div className="font-medium">{record?.name || '—'}</div>
              {record?.code && <div className="text-xs text-gray-500">{record.code}</div>}
            </div>
          </div>
        ),
      },
      {
        key: 'studioType',
        label: 'Business type',
        render: (_, record) => (
          <span className="text-sm text-muted-foreground">
            {getStudioTypeLabel(record?.studioType || record?.metadata?.studioType)}
          </span>
        ),
      },
      {
        key: 'city',
        label: 'City',
        render: (_, record) => (
          <span className="flex items-center gap-1 text-gray-600">
            <MapPin className="h-3 w-3" />
            {record?.city || '—'}
          </span>
        ),
      },
      {
        key: 'manager',
        label: 'Manager',
        render: (_, record) => record?.manager?.name || record?.manager?.email || '—',
      },
      {
        key: 'isActive',
        label: 'Status',
        render: (_, record) => (
          <StatusChip status={record?.isActive ? 'active_flag' : 'inactive_flag'} />
        ),
      },
      ...(isManager
        ? [
            {
              key: 'actions',
              label: 'Actions',
              render: (_, record) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(record)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(record)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]
        : []),
    ],
    [handleEdit, isManager, getStudioTypeLabel]
  );

  const handleCreate = useCallback(() => {
    setEditing(null);
    form.reset({
      name: '',
      studioType: activeTenant?.metadata?.studioType || activeTenant?.metadata?.businessSubType || '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'Ghana',
      postalCode: '',
      phone: '',
      email: '',
      managerUserId: '',
      isActive: true,
      isDefault: false,
    });
    setLogoPreview('');
    setLogoFile(null);
    setIsModalOpen(true);
  }, [form, activeTenant?.metadata?.studioType, activeTenant?.metadata?.businessSubType]);

  const locationsEmptyState = useMemo(
    () =>
      getEmptyStateProps(
        debouncedSearch ? EMPTY_STATES.STUDIO_LOCATIONS_FILTERED : EMPTY_STATES.STUDIO_LOCATIONS,
        isManager && !debouncedSearch ? { primary: handleCreate } : {}
      ),
    [debouncedSearch, handleCreate, isManager]
  );

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    handleCreate();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('add');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, handleCreate]);

  /** Show a saved studio straight away (new ones at the top) until the list refetches. */
  const applySavedLocationToList = useCallback((saved) => {
    if (!saved?.id) return;
    const isListed = (response) => locationRowsFromResponse(response).some((row) => row.id === saved.id);
    const withSaved = (response, addIfMissing) => {
      if (!Array.isArray(response?.data)) return response;
      if (!isListed(response)) return addIfMissing ? { ...response, data: [saved, ...response.data] } : response;
      return { ...response, data: response.data.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)) };
    };
    queryClient.setQueriesData({ queryKey: LOCATION_LIST_KEY }, (data) => {
      if (!data) return data;
      if (!Array.isArray(data.pages)) return withSaved(data, true);
      const listedSomewhere = data.pages.some(isListed);
      return {
        ...data,
        pages: data.pages.map((response, index) => withSaved(response, !listedSomewhere && index === 0)),
      };
    });
  }, [queryClient]);

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      const payload = {
        ...data,
        name: data.name?.trim(),
        studioType: data.studioType || null,
        managerUserId: data.managerUserId || null,
        email: data.email || null,
        phone: data.phone || null,
      };
      let savedId = editing?.id;
      let savedLocation = null;
      if (editing) {
        const res = await studioLocationService.update(editing.id, payload);
        savedLocation = res?.data || res;
        savedId = savedLocation?.id || editing.id;
        applySavedLocationToList(savedLocation);
        showSuccess('Studio updated');
      } else {
        const res = await studioLocationService.create(payload);
        savedLocation = res?.data || res;
        savedId = savedLocation?.id;
        applySavedLocationToList(savedLocation);
        showSuccess('Studio added');
      }
      if (logoFile && savedId) {
        await studioLocationService.uploadLogo(savedId, logoFile);
      }
      setIsModalOpen(false);
      setLogoFile(null);
      // Invalidates every ['studio-locations', …] query, this list included.
      refreshLocations();
    } catch (error) {
      showError(error?.response?.data?.message || 'Failed to save studio');
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
    if (!deleteTarget) return;
    try {
      await studioLocationService.remove(deleteTarget.id);
      showSuccess('Studio removed');
      setDeleteTarget(null);
      // Invalidates every ['studio-locations', …] query, this list included.
      refreshLocations();
    } catch (error) {
      showError(error?.response?.data?.message || 'Failed to delete studio');
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Studios</h1>
          <p className="text-muted-foreground mt-1">
            Manage branches like Accra or Kumasi. Customers and jobs are scoped to the active studio.
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <SecondaryButton onClick={fetchLocations} size={isMobile ? 'icon' : 'default'}>
              <RefreshCw className="h-4 w-4" />
            </SecondaryButton>
            <Button onClick={handleCreate} className="bg-brand hover:bg-brand-dark">
              <Plus className="h-4 w-4 mr-2" />
              Add studio
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardStatsCard title="Total" value={stats.total} icon={Building2} />
        <DashboardStatsCard title="Active" value={stats.active} icon={Building2} />
        <DashboardStatsCard title="Inactive" value={stats.inactive} icon={Building2} />
        <DashboardStatsCard title="Cities" value={stats.cities} icon={MapPin} />
      </div>

      <DashboardTable
        data={locations}
        columns={columns}
        loading={loading}
        emptyState={locationsEmptyState}
        pageSize={pagination.pageSize}
        externalPagination={{ current: pagination.page, total: locationsTotal }}
        infinite={locationsInfinite}
        onPageChange={(p) =>
          setPagination((prev) => ({
            ...prev,
            page: typeof p === 'number' ? p : p?.current ?? prev.page,
            pageSize: typeof p === 'object' ? p?.pageSize ?? prev.pageSize : prev.pageSize,
          }))
        }
      />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit studio' : 'Add studio'}</DialogTitle>
            <DialogDescription>
              Each studio has its own customers and jobs. Choose the business type that best matches this location.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...form}>
              <form id="studio-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Studio name</FormLabel>
                      <FormControl>
                        <Input placeholder="Accra Branch" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="studioType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business type (optional)</FormLabel>
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select what best matches this studio" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {studioTypeOptions.map((option) => (
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
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="ACC-01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <Label>Studio logo (optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Used on invoices and customer documents for this studio.
                  </p>
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Studio logo"
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
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Street address" {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business email (optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="studio@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                            <SelectValue placeholder="Select team member" />
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

                {editing && !editing.isDefault ? (
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between border rounded-lg p-4">
                        <FormLabel>Default studio</FormLabel>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormItem>
                    )}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between border rounded-lg p-4">
                      <FormLabel>Active</FormLabel>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="studio-form" loading={isSubmitting} className="bg-brand hover:bg-brand-dark">
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete studio</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? Existing customers and jobs remain linked to this studio.
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

export default StudioLocations;
