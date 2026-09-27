import PartnerPortalDesk from '../../components/admin/PartnerPortalDesk';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '../../hooks/useDebounce';
import { useSmartSearch } from '../../context/SmartSearchContext';
import { usePlatformAdminPermissions } from '../../context/PlatformAdminPermissionsContext';
import adminService from '../../services/adminService';
import { showSuccess, handleApiError } from '../../utils/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import DashboardTable from '../../components/DashboardTable';
import DetailsDrawer from '../../components/DetailsDrawer';
import StatusChip from '../../components/StatusChip';
import { Plus, Loader2, Eye, Check, Ban } from 'lucide-react';
import dayjs from 'dayjs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { DEBOUNCE_DELAYS } from '../../constants';

const agentSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  status: z.enum(['pending', 'active', 'disabled']).default('active'),
  commissionPercent: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().min(0).max(100).multipleOf(0.01, 'Use at most two decimal places')), 
  notes: z.string().optional().or(z.literal('')),
  code: z.string().optional().or(z.literal('')),
});

const formatGhs = (pesewas) => {
  const amount = (Number(pesewas) || 0) / 100;
  return `GHS ${amount.toFixed(2)}`;
};

const AdminSalesAgents = () => {
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newCode, setNewCode] = useState('');

  const canCreate = hasPermission('tenants.create');
  const canUpdate = hasPermission('tenants.update');
  const canManageBilling = hasPermission('billing.manage') || hasPermission('tenants.update');

  const form = useForm({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      status: 'active',
      commissionPercent: '',
      notes: '',
      code: '',
    },
  });

  useEffect(() => {
    setPageSearchConfig({
      scope: 'admin-sales-agents',
      placeholder: 'Search agents by name, email, phone...',
    });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  const fetchAgents = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const response = await adminService.getSalesAgents({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      if (response?.success) {
        setAgents(response.data || []);
        setPagination({
          current: page,
          pageSize,
          total: response.count ?? 0,
        });
      }
    } catch (error) {
      handleApiError(error, { context: 'load sales agents' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    setPagination((p) => ({ ...p, current: 1 }));
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!hasPermission('tenants.view')) return;
    fetchAgents(pagination.current, pagination.pageSize);
  }, [fetchAgents, hasPermission, permissionsLoading, pagination.current, pagination.pageSize]);

  const openDetail = useCallback(async (agentId) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    try {
      const response = await adminService.getSalesAgent(agentId);
      if (response?.success) setDetail(response.data);
    } catch (error) {
      handleApiError(error, { context: 'load sales agent' });
      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const onCreate = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        status: values.status,
        commissionPercent: values.commissionPercent,
        notes: values.notes?.trim() || undefined,
        code: values.code?.trim() || undefined,
        createCode: values.status === 'active',
      };
      const response = await adminService.createSalesAgent(payload);
      if (response?.success) {
        showSuccess('Sales agent created');
        setFormOpen(false);
        form.reset();
        fetchAgents(1, pagination.pageSize);
      }
    } catch (error) {
      handleApiError(error, { context: 'create sales agent' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (agentId) => {
    try {
      await adminService.approveSalesAgent(agentId);
      showSuccess('Agent approved');
      fetchAgents(pagination.current, pagination.pageSize);
      if (detail?.id === agentId) openDetail(agentId);
    } catch (error) {
      handleApiError(error, { context: 'approve sales agent' });
    }
  };

  const handleStatusChange = async (agentId, status) => {
    try {
      await adminService.updateSalesAgent(agentId, { status });
      showSuccess(status === 'disabled' ? 'Agent disabled' : 'Agent updated');
      fetchAgents(pagination.current, pagination.pageSize);
      if (detail?.id === agentId) openDetail(agentId);
    } catch (error) {
      handleApiError(error, { context: 'update sales agent' });
    }
  };

  const handleCreateCode = async () => {
    if (!detail?.id) return;
    try {
      await adminService.createSalesAgentCode(detail.id, {
        code: newCode.trim() || undefined,
        label: 'Additional',
      });
      showSuccess('Code created');
      setNewCode('');
      openDetail(detail.id);
    } catch (error) {
      handleApiError(error, { context: 'create agent code' });
    }
  };

  const handleCodeStatus = async (codeId, status) => {
    try {
      await adminService.updateSalesAgentCode(codeId, { status });
      showSuccess(status === 'disabled' ? 'Code disabled' : 'Code activated');
      if (detail?.id) openDetail(detail.id);
    } catch (error) {
      handleApiError(error, { context: 'update agent code' });
    }
  };

  const handleCommissionStatus = async (commissionId, status) => {
    try {
      await adminService.updateSalesAgentCommission(commissionId, { status });
      showSuccess(status === 'paid' ? 'Marked paid' : 'Marked due');
      if (detail?.id) openDetail(detail.id);
      fetchAgents(pagination.current, pagination.pageSize);
    } catch (error) {
      handleApiError(error, { context: 'update commission' });
    }
  };

  const columns = useMemo(
    () => [
      {
        label: 'Agent',
        key: 'name',
        render: (_, row) => (
          <div>
            <div className="font-medium text-foreground">{row.name}</div>
            <div className="text-xs text-muted-foreground">{row.email || row.phone || '—'}</div>
          </div>
        ),
      },
      {
        label: 'Status',
        key: 'status',
        render: (_, row) => <StatusChip status={row.status} />,
      },
      {
        label: 'Codes',
        key: 'codes',
        render: (_, row) => (
          <div className="flex flex-wrap gap-1">
            {(row.codes || []).slice(0, 3).map((c) => (
              <Badge key={c.id} variant="outline" className="font-mono text-xs">
                {c.code}
              </Badge>
            ))}
            {(row.codes || []).length === 0 && <span className="text-muted-foreground text-sm">—</span>}
          </div>
        ),
      },
      {
        label: 'Attributed',
        key: 'attributed',
        render: (_, row) => row.stats?.attributedTenants ?? 0,
      },
      {
        label: 'Commissions',
        key: 'commissions',
        render: (_, row) => {
          const c = row.stats?.commissions || {};
          return (
            <div className="text-sm">
              <div>Due: {formatGhs(c.dueAmount)} ({c.dueCount || 0})</div>
              <div className="text-muted-foreground">Paid: {formatGhs(c.paidAmount)} ({c.paidCount || 0})</div>
            </div>
          );
        },
      },
      {
        label: 'Actions',
        key: 'actions',
        render: (_, row) => (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openDetail(row.id)}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            {canUpdate && row.status === 'pending' && (
              <Button type="button" size="sm" onClick={() => handleApprove(row.id)}>
                <Check className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canUpdate, openDetail]
  );

  if (!permissionsLoading && !hasPermission('tenants.view')) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You do not have permission to view sales agents.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sales Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approve agents, manage codes, track attributed businesses, and mark commissions paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          {canCreate && (
            <Button type="button" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add agent
            </Button>
          )}
        </div>
      </div>

      <PartnerPortalDesk agents={agents} canInvite={canUpdate} canManageBilling={hasPermission('billing.manage')} />

      <DashboardTable
        data={agents}
        columns={columns}
        loading={loading}
        title={null}
        pageSize={pagination.pageSize}
        externalPagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
        }}
        onPageChange={(next) => setPagination((p) => ({ ...p, ...next }))}
        emptyDescription="No sales agents yet. Create or approve an agent to get a referral code."
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create sales agent</SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onCreate)} className="mt-6 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Agent full name" />
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
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="agent@example.com" />
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
                      <Input {...field} placeholder="WhatsApp / phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commissionPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission per subscription payment (%)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} max={100} step="0.01" placeholder="Enter percentage" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Percentage of the amount the client actually pays. For example, 10% of GHS 200 earns GHS 20. Applies to up to 3 successful subscription payments.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
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
                    <FormLabel>Agent code (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Leave blank to auto-generate" className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDetail(null);
        }}
        title={detail?.name || 'Sales agent'}
        showActions={false}
      >
        {detailLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {!detailLoading && detail && (
          <div className="space-y-6">
            <Descriptions>
              <DescriptionItem label="Status">
                <StatusChip status={detail.status} />
              </DescriptionItem>
              <DescriptionItem label="Email">{detail.email || '—'}</DescriptionItem>
              <DescriptionItem label="Phone">{detail.phone || '—'}</DescriptionItem>
              <DescriptionItem label="Commission">{detail.metadata?.commissionPercent != null ? `${detail.metadata.commissionPercent}% of each payment` : `Percentage not set (existing fixed rate: ${formatGhs(detail.commissionAmount)})`}</DescriptionItem>
              <DescriptionItem label="Created">{dayjs(detail.createdAt).format('MMM D, YYYY')}</DescriptionItem>
            </Descriptions>

            {canUpdate && (
              <form key={detail.id} className="space-y-2 rounded-lg border p-3" onSubmit={async event => {
                event.preventDefault();
                const commissionPercent = Number(new FormData(event.currentTarget).get('commissionPercent'));
                setSubmitting(true);
                try {
                  await adminService.updateSalesAgent(detail.id, { commissionPercent });
                  setDetail(current => ({ ...current, metadata: { ...current.metadata, commissionPercent } }));
                  showSuccess('Commission percentage saved. Applies to future payments.');
                  fetchAgents(pagination.current, pagination.pageSize);
                } catch (error) { handleApiError(error, { context: 'update commission percentage' }); }
                finally { setSubmitting(false); }
              }}>
                <label htmlFor="agent-commission-percent" className="text-sm font-medium">Commission percentage (%)</label>
                <div className="flex gap-2"><Input id="agent-commission-percent" name="commissionPercent" type="number" min="0" max="100" step="0.01" required defaultValue={detail.metadata?.commissionPercent ?? ''} placeholder="Enter percentage" /><Button disabled={submitting}>Save percentage</Button></div>
                <p className="text-xs text-muted-foreground">Applies to future successful subscription payments. Existing earned commissions stay unchanged.</p>
              </form>
            )}

            {canUpdate && (
              <div className="flex flex-wrap gap-2">
                {detail.status === 'pending' && (
                  <Button type="button" size="sm" onClick={() => handleApprove(detail.id)}>
                    Approve
                  </Button>
                )}
                {detail.status === 'active' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => handleStatusChange(detail.id, 'disabled')}>
                    <Ban className="h-4 w-4 mr-1" />
                    Disable
                  </Button>
                )}
                {detail.status === 'disabled' && (
                  <Button type="button" size="sm" onClick={() => handleStatusChange(detail.id, 'active')}>
                    Re-activate
                  </Button>
                )}
              </div>
            )}

            <div>
              <h3 className="font-medium mb-2">Codes</h3>
              <div className="space-y-2">
                {(detail.codes || []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                    <div>
                      <span className="font-mono font-medium">{c.code}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.label || ''}</span>
                      <StatusChip status={c.status} className="ml-2" />
                    </div>
                    {canUpdate && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCodeStatus(c.id, c.status === 'active' ? 'disabled' : 'active')}
                      >
                        {c.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {canUpdate && detail.status === 'active' && (
                <div className="flex gap-2 mt-3">
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="New code (optional)"
                    className="uppercase"
                  />
                  <Button type="button" variant="outline" onClick={handleCreateCode}>
                    Add code
                  </Button>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-medium mb-2">Attributed businesses ({(detail.tenants || []).length})</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(detail.tenants || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No businesses attributed yet.</p>
                )}
                {(detail.tenants || []).map((t) => (
                  <div key={t.id} className="border border-border rounded-md px-3 py-2 text-sm">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-muted-foreground">
                      Code {t.referredByAgentCode || '—'} · Trial ends{' '}
                      {t.trialEndsAt ? dayjs(t.trialEndsAt).format('MMM D, YYYY') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-2">Commissions ({(detail.commissions || []).length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(detail.commissions || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No commissions yet. Created when an attributed business has a successful paid subscription (max 3).
                  </p>
                )}
                {(detail.commissions || []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">
                        {c.tenant?.name || 'Business'} · Period {c.periodNumber}/3
                      </div>
                      <div className="text-muted-foreground">
                        {formatGhs(c.amount)} · {dayjs(c.createdAt).format('MMM D, YYYY')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip status={c.status} />
                      {canManageBilling && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCommissionStatus(c.id, c.status === 'paid' ? 'due' : 'paid')}
                        >
                          {c.status === 'paid' ? 'Mark due' : 'Mark paid'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DetailsDrawer>
    </div>
  );
};

export default AdminSalesAgents;
