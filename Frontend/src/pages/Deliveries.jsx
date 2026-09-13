import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2, Inbox } from 'lucide-react';
import dayjs from 'dayjs';
import deliveryService from '../services/deliveryService';
import userService from '../services/userService';
import { useAuth } from '../context/AuthContext';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import WelcomeSection from '../components/WelcomeSection';
import TableSkeleton from '../components/TableSkeleton';
import { showSuccess, showError, handleApiError } from '../utils/toast';
import { EMPTY_STATES } from '../constants/microcopy';
import { EmptyState, getEmptyStateProps } from '../components/ui/empty-state';
import {
  DEBOUNCE_DELAYS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_ORDER,
  SEARCH_PLACEHOLDERS,
  STUDIO_LIKE_TYPES
} from '../constants';
import { formatAmount } from '../utils/formatNumber';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

function rowKey(row) {
  return `${row.entityType}:${row.deliveryLeg || 'default'}:${row.id}`;
}

function entityTypeLabel(row) {
  if (row.entityType === 'job') return 'Job';
  if (row.entityType === 'rental') return row.deliveryLeg === 'return' ? 'Rental return' : 'Rental';
  return 'Sale';
}

function DeliveryStatusSelect({ row, loading, onChange, isDriver = false }) {
  const value = row.deliveryStatus || '__none__';
  const statusOptions = isDriver
    ? row.deliveryStatus === 'ready_for_delivery'
      ? ['out_for_delivery']
      : row.deliveryStatus === 'out_for_delivery'
        ? ['delivered']
        : []
    : DELIVERY_STATUS_ORDER;
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(row, v)}
      disabled={loading}
    >
      <SelectTrigger className="h-9 w-full max-w-[220px] border border-border" aria-label="Delivery status">
        <SelectValue placeholder="Delivery" />
      </SelectTrigger>
      <SelectContent>
        {!isDriver && <SelectItem value="__none__">Not set</SelectItem>}
        {statusOptions.map((key) => (
          <SelectItem key={key} value={key}>
            {DELIVERY_STATUS_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Deliveries() {
  const { user, activeTenant, isAdmin, isManager, isDriver } = useAuth();
  const queryClient = useQueryClient();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const { isMobile } = useResponsive();
  const [scope, setScope] = useState('active');
  /** Active tab: all | not_set | ready_for_delivery | out_for_delivery | delivered | returned. Done tab: all | delivered | returned */
  const [statusFilter, setStatusFilter] = useState('all');
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const [selected, setSelected] = useState(() => new Set());
  const [updatingKey, setUpdatingKey] = useState(null);

  const tenantId = activeTenant?.id;
  const businessType = activeTenant?.businessType || '';
  const isStudioLike = STUDIO_LIKE_TYPES.includes(businessType);
  const isRentalTenant = businessType === 'rental';

  const isActiveTerminalFilter =
    scope === 'active' && (statusFilter === 'delivered' || statusFilter === 'returned');

  useEffect(() => {
    setPageSearchConfig({
      scope: 'deliveries',
      placeholder: isRentalTenant
        ? SEARCH_PLACEHOLDERS.RENTALS
        : isStudioLike
          ? SEARCH_PLACEHOLDERS.JOBS
          : SEARCH_PLACEHOLDERS.SALES
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig, isStudioLike, isRentalTenant]);

  const activeQueueQuery = useQuery({
    queryKey: ['deliveries-queue', 'active', tenantId, activeShopId, activeStudioLocationId],
    queryFn: async () => {
      const res = await deliveryService.getQueue('active');
      return res?.data ?? res;
    },
    enabled: scopeReady && scope === 'active' && !isActiveTerminalFilter
  });

  const doneQueueQuery = useQuery({
    queryKey: ['deliveries-queue', 'done', tenantId, activeShopId, activeStudioLocationId],
    queryFn: async () => {
      const res = await deliveryService.getQueue('done');
      return res?.data ?? res;
    },
    enabled: scopeReady && (scope === 'done' || isActiveTerminalFilter)
  });

  const queueRes = scope === 'done' || isActiveTerminalFilter ? doneQueueQuery.data : activeQueueQuery.data;
  const isLoading =
    scope === 'done' || isActiveTerminalFilter ? doneQueueQuery.isLoading : activeQueueQuery.isLoading;
  const isFetching = activeQueueQuery.isFetching || doneQueueQuery.isFetching;
  const error = scope === 'done' || isActiveTerminalFilter ? doneQueueQuery.error : activeQueueQuery.error;
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['deliveries-queue'] });
  }, [queryClient]);

  const rows = queueRes?.rows ?? [];

  const { data: driverUsers = [] } = useQuery({
    queryKey: ['delivery-drivers', tenantId],
    queryFn: async () => {
      const response = await userService.getAll({ role: 'driver', isActive: 'true', page: 1, limit: 100 });
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];
      return list;
    },
    enabled: Boolean(tenantId) && !isDriver && (isAdmin || isManager),
  });

  /** Rental: rentals only. Studio-like: jobs only. Shop / pharmacy / other: sales (orders) only. */
  const tenantScopedRows = useMemo(() => {
    if (isRentalTenant) return rows.filter((r) => r.entityType === 'rental');
    if (isStudioLike) return rows.filter((r) => r.entityType === 'job');
    return rows.filter((r) => r.entityType === 'sale');
  }, [rows, isStudioLike, isRentalTenant]);

  const statusFilteredRows = useMemo(() => {
    if (scope === 'active') {
      if (isActiveTerminalFilter) {
        if (statusFilter === 'delivered') {
          return tenantScopedRows.filter((r) => r.deliveryStatus === 'delivered');
        }
        if (statusFilter === 'returned') {
          return tenantScopedRows.filter((r) => r.deliveryStatus === 'returned');
        }
        return tenantScopedRows;
      }
      if (statusFilter === 'all') return tenantScopedRows;
      if (statusFilter === 'not_set') {
        return tenantScopedRows.filter((r) => !r.deliveryStatus);
      }
      if (statusFilter === 'ready_for_delivery') {
        return tenantScopedRows.filter((r) => r.deliveryStatus === 'ready_for_delivery');
      }
      if (statusFilter === 'out_for_delivery') {
        return tenantScopedRows.filter((r) => r.deliveryStatus === 'out_for_delivery');
      }
      return tenantScopedRows;
    }
    if (statusFilter === 'all') return tenantScopedRows;
    if (statusFilter === 'delivered') {
      return tenantScopedRows.filter((r) => r.deliveryStatus === 'delivered');
    }
    if (statusFilter === 'returned') {
      return tenantScopedRows.filter((r) => r.deliveryStatus === 'returned');
    }
    return tenantScopedRows;
  }, [tenantScopedRows, scope, statusFilter, isActiveTerminalFilter]);

  const filteredRows = useMemo(() => {
    const q = (debouncedSearch || '').trim().toLowerCase();
    if (!q) return statusFilteredRows;
    return statusFilteredRows.filter((r) => {
      const blob = [r.reference, r.title, r.customerName, r.customerPhone, r.addressSummary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [statusFilteredRows, debouncedSearch]);

  const mutation = useMutation({
    mutationFn: (updates) => deliveryService.patchStatuses(updates),
    onSuccess: (res) => {
      const results = res?.data?.results ?? [];
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        showError(failed[0]?.message || 'Some updates failed');
      } else {
        showSuccess('Delivery status updated');
      }
      queryClient.invalidateQueries({ queryKey: ['deliveries-queue'] });
      setSelected(new Set());
    },
    onError: (err) => handleApiError(err, { context: 'deliveries' })
  });

  const buildDeliveryUpdate = useCallback((row, patch) => ({
    entityType: row.entityType,
    id: row.id,
    ...(row.entityType === 'rental' ? { deliveryLeg: row.deliveryLeg || 'pickup' } : {}),
    ...patch,
  }), []);

  const handleStatusChange = useCallback(
    (row, selectValue) => {
      const deliveryStatus = selectValue === '__none__' ? null : selectValue;
      const k = rowKey(row);
      setUpdatingKey(k);
      mutation.mutate([buildDeliveryUpdate(row, { deliveryStatus })], {
        onSettled: () => setUpdatingKey(null)
      });
    },
    [mutation, buildDeliveryUpdate]
  );

  const toggleRow = useCallback((row, checked) => {
    const k = rowKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(k);
      else next.delete(k);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked) => {
      if (!checked) {
        setSelected(new Set());
        return;
      }
      setSelected(new Set(filteredRows.map(rowKey)));
    },
    [filteredRows]
  );

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selected.has(rowKey(r))),
    [filteredRows, selected]
  );

  const markSelectedReady = useCallback(() => {
    if (!selectedRows.length) return;
    const updates = selectedRows.map((r) => buildDeliveryUpdate(r, { deliveryStatus: 'ready_for_delivery' }));
    mutation.mutate(updates);
  }, [selectedRows, mutation, buildDeliveryUpdate]);

  const handleAssignDriver = useCallback(
    (row, driverId) => {
      mutation.mutate([
        buildDeliveryUpdate(row, {
          deliveryAssignedTo: driverId === '__none__' ? null : driverId,
        }),
      ]);
    },
    [mutation, buildDeliveryUpdate]
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const welcomeMessage = useMemo(() => {
    const first = user?.name?.split?.(' ')?.[0] || 'there';
    return `Hi ${first}`;
  }, [user?.name]);

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(rowKey(r)));
  const someSelected = selected.size > 0;
  const hasAnyScopedRows = tenantScopedRows.length > 0;
  const filtersExcludeAll =
    hasAnyScopedRows && statusFilteredRows.length === 0 && statusFilter !== 'all';
  const searchFilteredOut =
    statusFilteredRows.length > 0 && filteredRows.length === 0 && Boolean((debouncedSearch || '').trim());

  if (error && !queueRes) {
    return (
      <div className="p-4 md:p-6">
        <WelcomeSection
          welcomeMessage={welcomeMessage}
          subText={
            isRentalTenant
              ? 'Scheduled rental deliveries and return pickups.'
              : isStudioLike
                ? 'Completed jobs ready for delivery.'
                : 'Completed sales and orders ready for delivery.'
          }
        />
        <p className="text-sm text-destructive">Could not load deliveries. Try again.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <WelcomeSection
        welcomeMessage={welcomeMessage}
        subText={
          isRentalTenant
            ? 'Rental handover deliveries and return pickups you can assign and track.'
            : isStudioLike
              ? 'Completed jobs you can move through delivery. Customers see progress when tracking is on.'
              : 'Completed sales and orders you can move through delivery. Customers see progress when tracking is on.'
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tabs
          value={scope}
          onValueChange={(v) => {
            setScope(v);
            setStatusFilter('all');
          }}
          className="w-auto shrink-0"
        >
          <TabsList className="border border-border bg-muted/40">
            <TabsTrigger value="active" className="text-xs sm:text-sm">
              To deliver
            </TabsTrigger>
            <TabsTrigger value="done" className="text-xs sm:text-sm">
              Done (90 days)
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-9 shrink-0 border border-border"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>

        <div className="flex items-center gap-2 min-w-0">
          <Label htmlFor="deliveries-status-filter" className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Delivery status
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="deliveries-status-filter" className="h-9 w-[min(100vw-10rem,13.5rem)] sm:w-[13.5rem] border border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scope === 'active' ? (
                <>
                  <SelectItem value="all">All in queue</SelectItem>
                  {!isDriver && <SelectItem value="not_set">Not set yet</SelectItem>}
                  <SelectItem value="ready_for_delivery">{DELIVERY_STATUS_LABELS.ready_for_delivery}</SelectItem>
                  <SelectItem value="out_for_delivery">{DELIVERY_STATUS_LABELS.out_for_delivery}</SelectItem>
                  {!isDriver && <SelectItem value="delivered">{DELIVERY_STATUS_LABELS.delivered}</SelectItem>}
                  {!isDriver && <SelectItem value="returned">{DELIVERY_STATUS_LABELS.returned}</SelectItem>}
                </>
              ) : (
                <>
                  <SelectItem value="all">All done</SelectItem>
                  <SelectItem value="delivered">{DELIVERY_STATUS_LABELS.delivered}</SelectItem>
                  {!isDriver && <SelectItem value="returned">{DELIVERY_STATUS_LABELS.returned}</SelectItem>}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {!isDriver && scope === 'active' && someSelected && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={clearSelection} className="h-9 shrink-0 border border-border">
              Clear selection
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => markSelectedReady()}
              disabled={mutation.isPending}
              className="h-9 shrink-0 bg-brand hover:bg-brand-dark text-white"
            >
              Mark ready for delivery
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : filteredRows.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="py-4">
            <EmptyState
              {...getEmptyStateProps(EMPTY_STATES.DELIVERIES)}
              size="sm"
              title={
                searchFilteredOut ? 'No matches' : filtersExcludeAll ? 'No matches for filters' : 'Nothing here yet'
              }
              description={
                searchFilteredOut
                  ? 'Try another term in the search box at the top of the page.'
                  : filtersExcludeAll
                    ? 'Change the type or delivery status filters above.'
                    : scope === 'active'
                      ? isRentalTenant
                        ? 'When you schedule delivery on a rental, it appears here so you can set delivery status.'
                        : isStudioLike
                          ? 'When jobs are completed, they appear here so you can set delivery status.'
                          : 'When sales and paid online delivery orders are ready to dispatch, they appear here so you can set delivery status.'
                      : 'Delivered or returned items from the last 90 days will show in this tab.'
              }
            />
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {filteredRows.map((row) => {
            const k = rowKey(row);
            const checked = selected.has(k);
            return (
              <Card key={k} className="border border-border">
                <CardContent className="p-4 space-y-3">
                  {!isDriver && scope === 'active' && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleRow(row, Boolean(v))}
                        aria-label={`Select ${row.reference}`}
                      />
                      <span className="text-sm text-muted-foreground">Select</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="border border-border">
                      {entityTypeLabel(row)}
                    </Badge>
                    <span className="font-medium">{row.reference}</span>
                  </div>
                  {row.title && <p className="text-sm text-muted-foreground line-clamp-2">{row.title}</p>}
                  <p className="text-sm">{row.customerName || '—'}</p>
                  {row.customerPhone && <p className="text-xs text-muted-foreground">{row.customerPhone}</p>}
                  {row.addressSummary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{row.addressSummary}</p>
                  )}
                  {row.total != null && (
                    <p className="text-sm">
                      Total: {formatAmount(row.total)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {row.completedAt ? dayjs(row.completedAt).format('MMM D, YYYY h:mm A') : '—'}
                  </p>
                  <DeliveryStatusSelect
                    row={row}
                    loading={updatingKey === k || mutation.isPending}
                    onChange={handleStatusChange}
                    isDriver={isDriver}
                  />
                  {!isDriver && (isAdmin || isManager) && scope === 'active' && (
                    <Select
                      value={row.deliveryAssignedTo || '__none__'}
                      onValueChange={(v) => handleAssignDriver(row, v)}
                    >
                      <SelectTrigger className="h-9 w-full max-w-[220px] border border-border mt-2" aria-label="Assigned driver">
                        <SelectValue placeholder="Assign driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {driverUsers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name || driver.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                {!isDriver && scope === 'active' && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                      aria-label="Select all visible"
                    />
                  </TableHead>
                )}
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="min-w-[200px]">Delivery</TableHead>
                    {!isDriver && (isAdmin || isManager) && scope === 'active' && (
                      <TableHead className="min-w-[220px]">Driver</TableHead>
                    )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const k = rowKey(row);
                const checked = selected.has(k);
                return (
                  <TableRow key={k} className="border-b border-border">
                    {!isDriver && scope === 'active' && (
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleRow(row, Boolean(v))}
                          aria-label={`Select ${row.reference}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="secondary" className="border border-border">
                        {entityTypeLabel(row)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.reference}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{row.customerName || '—'}</span>
                        {row.title && <span className="text-xs text-muted-foreground line-clamp-1">{row.title}</span>}
                        {row.addressSummary && (
                          <span className="text-xs text-muted-foreground line-clamp-1">{row.addressSummary}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.customerPhone || '—'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {row.completedAt ? dayjs(row.completedAt).format('MMM D, YYYY') : '—'}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusSelect
                        row={row}
                        loading={updatingKey === k || mutation.isPending}
                        onChange={handleStatusChange}
                        isDriver={isDriver}
                      />
                    </TableCell>
                    {!isDriver && (isAdmin || isManager) && scope === 'active' && (
                      <TableCell>
                        <Select
                          value={row.deliveryAssignedTo || '__none__'}
                          onValueChange={(v) => handleAssignDriver(row, v)}
                        >
                          <SelectTrigger className="h-9 w-full max-w-[220px] border border-border" aria-label="Assigned driver">
                            <SelectValue placeholder="Assign driver" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {driverUsers.map((driver) => (
                              <SelectItem key={driver.id} value={driver.id}>
                                {driver.name || driver.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
