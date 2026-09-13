import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Building2,
  Megaphone,
  Users,
  Wallet,
} from 'lucide-react';
import adminService from '../../services/adminService';
import DashboardStatsCard from '../../components/DashboardStatsCard';
import DashboardTable from '../../components/DashboardTable';
import StatusChip from '../../components/StatusChip';
import SabitoAppAdminChrome, { SABITO_APP_ADMIN_SECTIONS } from '../../components/admin/SabitoAppAdminChrome';
import { useDebounce } from '../../hooks/useDebounce';
import { useSmartSearch } from '../../context/SmartSearchContext';
import { usePlatformAdminPermissions } from '../../context/PlatformAdminPermissionsContext';
import { DEBOUNCE_DELAYS, PAGINATION } from '../../constants';
import { formatAmount } from '../../utils/formatNumber';
import { handleApiError, showSuccess } from '../../utils/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Empty } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const formatMoney = (amount, currency = 'GHS') => formatAmount(amount, `${String(currency || 'GHS').toUpperCase()} `);
const formatDate = (value) => (value ? dayjs(value).format('MMM D, YYYY') : 'N/A');

const listingStatusOptions = ['all', 'draft', 'pending', 'approved', 'rejected', 'suspended'];
const cashoutStatusOptions = ['all', 'pending', 'approved', 'rejected', 'paid'];
const referralStatusOptions = ['all', 'pending', 'matched', 'conflict', 'closed'];

function FilterSelect({ value, onChange, options, label }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option === 'all' ? label : option.replace(/_/g, ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const PermissionDenied = () => (
  <div className="flex min-h-[400px] items-center justify-center">
    <div className="text-center">
      <h3 className="mb-2 text-lg font-semibold text-foreground">Access Denied</h3>
      <p className="text-sm text-muted-foreground">You do not have permission to view this Sabito App Admin page.</p>
    </div>
  </div>
);

function OverviewSection({ data, loading }) {
  const summary = data?.summary || {};
  const currency = summary.currency || 'GHS';

  if (loading && !data) {
    return <Skeleton className="h-[280px] w-full" />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <DashboardStatsCard title="Pending review" value={summary.pendingReview || 0} icon={Building2} iconBgColor="#fef3c7" iconColor="#d97706" />
      <DashboardStatsCard title="Live listings" value={summary.liveListings || 0} icon={Megaphone} iconBgColor="#dcfce7" iconColor="#166534" />
      <DashboardStatsCard title="Marketers" value={summary.marketers || 0} icon={Users} iconBgColor="#dbeafe" iconColor="#2563eb" />
      <DashboardStatsCard title="Open cashouts" value={summary.pendingCashouts || 0} icon={Wallet} iconBgColor="#fce7f3" iconColor="#be185d" />
      <DashboardStatsCard title="Owed to ABS" value={formatMoney(summary.owedAmount || 0, currency)} icon={Banknote} iconBgColor="#fee2e2" iconColor="#dc2626" />
      <DashboardStatsCard title="Collected" value={formatMoney(summary.collectedAmount || 0, currency)} icon={Banknote} iconBgColor="#dcfce7" iconColor="#166534" />
      <DashboardStatsCard title="Platform take" value={formatMoney(summary.platformTake || 0, currency)} icon={Banknote} iconBgColor="#fef3c7" iconColor="#d97706" />
      <DashboardStatsCard title="Platform take %" value={`${summary.platformFeePercent ?? 20}%`} icon={Banknote} iconBgColor="#e0e7ff" iconColor="#4338ca" />
    </div>
  );
}

function BusinessesSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange, onRefresh }) {
  const { hasPermission } = usePlatformAdminPermissions();
  const canModerate = hasPermission('tenants.update');
  const [busyId, setBusyId] = useState(null);

  const runAction = useCallback(async (id, action, promptLabel) => {
    let note;
    if (promptLabel) {
      const entered = window.prompt(promptLabel, '');
      if (entered === null) return;
      note = entered;
    }
    setBusyId(`${id}-${action}`);
    try {
      if (action === 'approve') await adminService.approveSabitoAppBusiness(id, { note });
      if (action === 'reject') await adminService.rejectSabitoAppBusiness(id, { note });
      if (action === 'suspend') await adminService.suspendSabitoAppBusiness(id, { note });
      if (action === 'unsuspend') await adminService.unsuspendSabitoAppBusiness(id, { note });
      showSuccess('Listing updated');
      await onRefresh?.();
    } catch (error) {
      handleApiError(error, { context: 'update Sabito App listing' });
    } finally {
      setBusyId(null);
    }
  }, [onRefresh]);

  const columns = useMemo(() => [
    {
      key: 'displayName',
      label: 'Business',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-xs text-muted-foreground">{record.tenant?.name || record.slug}</div>
        </div>
      ),
    },
    { key: 'category', label: 'Category', render: (value) => value || 'N/A' },
    { key: 'moderationStatus', label: 'Status', render: (value, record) => (
      <StatusChip status={value === 'approved' && record.listed && record.enabled ? 'live' : value === 'pending' ? 'pending_review' : value} />
    ) },
    { key: 'activePartners', label: 'Partners', render: (value) => value ?? 0 },
    { key: 'updatedAt', label: 'Updated', render: formatDate },
    {
      key: 'actions',
      label: '',
      render: (_value, record) => {
        if (!canModerate) return null;
        const status = record.moderationStatus;
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {status === 'pending' || status === 'rejected' ? (
              <>
                <Button type="button" variant="outline" size="sm" disabled={busyId?.startsWith(record.id)} onClick={() => runAction(record.id, 'reject', 'Rejection note (optional)')}>
                  Reject
                </Button>
                <Button type="button" size="sm" disabled={busyId === `${record.id}-approve`} onClick={() => runAction(record.id, 'approve')}>
                  Approve
                </Button>
              </>
            ) : null}
            {status === 'approved' ? (
              <Button type="button" variant="outline" size="sm" disabled={busyId?.startsWith(record.id)} onClick={() => runAction(record.id, 'suspend', 'Suspension note (optional)')}>
                Suspend
              </Button>
            ) : null}
            {status === 'suspended' ? (
              <Button type="button" size="sm" disabled={busyId?.startsWith(record.id)} onClick={() => runAction(record.id, 'unsuspend')}>
                Unsuspend
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ], [busyId, canModerate, runAction]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={listingStatusOptions}
          label="All listing statuses"
        />
      </div>
      <DashboardTable
        title="Partner program listings"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No listings match this view"
      />
    </div>
  );
}

function MarketersSection({ rows, pagination, loading, onPageChange }) {
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Marketer',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-xs text-muted-foreground">{record.email}</div>
        </div>
      ),
    },
    { key: 'phone', label: 'Phone', render: (value) => value || 'N/A' },
    { key: 'isActive', label: 'Status', render: (value) => <StatusChip status={value ? 'active' : 'inactive'} /> },
    { key: 'createdAt', label: 'Joined', render: formatDate },
  ], []);

  return (
    <DashboardTable
      title="Marketers"
      data={rows}
      columns={columns}
      loading={loading}
      pageSize={pagination.pageSize}
      externalPagination={pagination}
      onPageChange={onPageChange}
      emptyDescription="No marketers yet"
    />
  );
}

function ReferralsSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange }) {
  const columns = useMemo(() => [
    { key: 'clientName', label: 'Client', render: (value, record) => (
      <div>
        <div className="font-medium">{value}</div>
        <div className="text-xs text-muted-foreground">{record.email || record.phone || 'No contact'}</div>
      </div>
    ) },
    { key: 'marketer', label: 'Marketer', render: (value) => value?.name || 'N/A' },
    { key: 'tenant', label: 'Business', render: (value) => value?.name || 'N/A' },
    { key: 'status', label: 'Status', render: (value) => <StatusChip status={value} /> },
    { key: 'createdAt', label: 'Created', render: formatDate },
  ], []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={referralStatusOptions}
          label="All referral statuses"
        />
      </div>
      <DashboardTable
        title="Referrals"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No referrals match this view"
      />
    </div>
  );
}

function CollectionsSection({ rows, pagination, loading, onPageChange }) {
  const columns = useMemo(() => [
    { key: 'tenant', label: 'Business', render: (value) => value?.name || 'N/A' },
    { key: 'amount', label: 'Remitted', render: (value, record) => formatMoney(value, record.currency) },
    { key: 'platformFeeAmount', label: 'ABS take', render: (value, record) => formatMoney(value, record.currency) },
    { key: 'marketerShareAmount', label: 'Marketer share', render: (value, record) => formatMoney(value, record.currency) },
    { key: 'status', label: 'Status', render: (value) => <StatusChip status={value} /> },
    { key: 'paidAt', label: 'Paid', render: formatDate },
  ], []);

  return (
    <DashboardTable
      title="Business remittances"
      data={rows}
      columns={columns}
      loading={loading}
      pageSize={pagination.pageSize}
      externalPagination={pagination}
      onPageChange={onPageChange}
      emptyDescription="No remittances yet"
    />
  );
}

function CashoutsSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange, onRefresh }) {
  const { hasPermission } = usePlatformAdminPermissions();
  const canPay = hasPermission('billing.manage');
  const [busyId, setBusyId] = useState(null);

  const runPay = useCallback(async (id) => {
    const reference = window.prompt('Payout reference (optional)', '');
    if (reference === null) return;
    setBusyId(id);
    try {
      await adminService.paySabitoAppCashout(id, { payoutReference: reference || undefined });
      showSuccess('Marketer cashout marked paid');
      await onRefresh?.();
    } catch (error) {
      handleApiError(error, { context: 'pay Sabito App cashout' });
    } finally {
      setBusyId(null);
    }
  }, [onRefresh]);

  const runReject = useCallback(async (id) => {
    const notes = window.prompt('Rejection note (optional)', '');
    if (notes === null) return;
    setBusyId(id);
    try {
      await adminService.rejectSabitoAppCashout(id, { notes: notes || undefined });
      showSuccess('Cashout rejected');
      await onRefresh?.();
    } catch (error) {
      handleApiError(error, { context: 'reject Sabito App cashout' });
    } finally {
      setBusyId(null);
    }
  }, [onRefresh]);

  const columns = useMemo(() => [
    {
      key: 'marketer',
      label: 'Marketer',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value?.name || 'N/A'}</div>
          <div className="text-xs text-muted-foreground">{record.tenant?.name || value?.email}</div>
        </div>
      ),
    },
    { key: 'amount', label: 'Amount', render: (value, record) => formatMoney(value, record.currency) },
    { key: 'status', label: 'Status', render: (value) => <StatusChip status={value} /> },
    { key: 'createdAt', label: 'Requested', render: formatDate },
    {
      key: 'actions',
      label: '',
      render: (_value, record) => {
        if (!canPay || !['pending', 'approved'].includes(record.status)) return null;
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busyId === record.id} onClick={() => runReject(record.id)}>
              Reject
            </Button>
            <Button type="button" size="sm" disabled={busyId === record.id} onClick={() => runPay(record.id)}>
              {busyId === record.id ? 'Paying...' : 'Pay marketer'}
            </Button>
          </div>
        );
      },
    },
  ], [busyId, canPay, runPay, runReject]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={cashoutStatusOptions}
          label="All cashout statuses"
        />
      </div>
      <DashboardTable
        title="Marketer cashouts"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No cashouts match this view"
      />
    </div>
  );
}

function SettingsSection({ data, loading, onSaved }) {
  const { hasPermission } = usePlatformAdminPermissions();
  const canEdit = hasPermission('settings.manage');
  const [fee, setFee] = useState(String(data?.platformFeePercent ?? 20));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFee(String(data?.platformFeePercent ?? 20));
  }, [data?.platformFeePercent]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminService.updateSabitoAppSettings({ platformFeePercent: Number(fee) });
      showSuccess('Platform take updated');
      await onSaved?.();
    } catch (error) {
      handleApiError(error, { context: 'update Sabito App settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return <Skeleton className="h-[220px] w-full" />;
  }

  if (!data) {
    return <Empty description="Sabito App settings are not available" />;
  }

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">Platform take of marketer commission</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The business remits the full marketer commission to ABS. ABS keeps this percent; the rest is paid to the marketer.
          Example: GHS 1,000 sale, 10% marketer rate, {fee || 20}% platform take → business pays ABS GHS 100, ABS keeps the take, marketer receives the rest.
        </p>
        <div className="max-w-xs space-y-1.5">
          <Label>Platform take %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        {canEdit ? (
          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const initialPagination = {
  current: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 0,
};

function SabitoAppAdmin({ section = 'overview' }) {
  const navigate = useNavigate();
  const activeSection = SABITO_APP_ADMIN_SECTIONS[section] ? section : 'overview';
  const config = SABITO_APP_ADMIN_SECTIONS[activeSection];
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [pagination, setPagination] = useState(initialPagination);
  const [filters, setFilters] = useState({ status: 'all' });

  useEffect(() => {
    setPageSearchConfig({
      scope: `sabito-app-${activeSection}`,
      placeholder: config.searchPlaceholder,
    });
  }, [activeSection, config.searchPlaceholder, setPageSearchConfig]);

  useEffect(() => {
    if (section !== activeSection) {
      navigate('/admin/sabito-app/overview', { replace: true });
    }
  }, [activeSection, navigate, section]);

  const updateFilters = useCallback((nextFilters) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
    setPagination((current) => ({ ...current, current: 1 }));
  }, []);

  const handlePageChange = useCallback((nextPagination) => {
    setPagination((current) => ({
      ...current,
      current: nextPagination.current || current.current,
      pageSize: nextPagination.pageSize || current.pageSize,
    }));
  }, []);

  const loadData = useCallback(async () => {
    if (!hasPermission(config.permission)) return;
    setLoading(true);
    try {
      if (activeSection === 'overview') {
        const response = await adminService.getSabitoAppOverview();
        if (response?.success) setOverview(response.data);
        return;
      }
      if (activeSection === 'settings') {
        const response = await adminService.getSabitoAppSettings();
        if (response?.success) setSettings(response.data);
        return;
      }

      const params = {
        page: pagination.current,
        limit: pagination.pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status && filters.status !== 'all') params.status = filters.status;

      const serviceMap = {
        businesses: adminService.getSabitoAppBusinesses,
        marketers: adminService.getSabitoAppMarketers,
        referrals: adminService.getSabitoAppReferrals,
        collections: adminService.getSabitoAppCollections,
        cashouts: adminService.getSabitoAppCashouts,
      };
      const fetcher = serviceMap[activeSection];
      if (!fetcher) return;
      const response = await fetcher(params);
      if (response?.success) {
        setRows(response.data || []);
        const next = response.pagination || {};
        setPagination((current) => ({
          ...current,
          current: next.page || current.current,
          pageSize: next.limit || current.pageSize,
          total: next.total || 0,
        }));
      }
    } catch (error) {
      handleApiError(error, { context: 'load Sabito App Admin' });
    } finally {
      setLoading(false);
    }
  }, [
    activeSection,
    config.permission,
    debouncedSearch,
    filters.status,
    hasPermission,
    pagination.current,
    pagination.pageSize,
  ]);

  useEffect(() => {
    if (!permissionsLoading) {
      loadData();
    }
  }, [loadData, permissionsLoading]);

  useEffect(() => {
    setPagination(initialPagination);
    setRows([]);
    setOverview(null);
    setSettings(null);
    setFilters({ status: 'all' });
  }, [activeSection]);

  if (!permissionsLoading && !hasPermission(config.permission)) {
    return <PermissionDenied />;
  }

  const tablePagination = {
    ...pagination,
    pageSize: pagination.pageSize || PAGINATION.DEFAULT_PAGE_SIZE,
  };

  return (
    <SabitoAppAdminChrome section={activeSection}>
      {activeSection === 'overview' && <OverviewSection data={overview} loading={loading || permissionsLoading} />}
      {activeSection === 'businesses' && (
        <BusinessesSection
          rows={rows}
          pagination={tablePagination}
          loading={loading || permissionsLoading}
          filters={filters}
          onFiltersChange={updateFilters}
          onPageChange={handlePageChange}
          onRefresh={loadData}
        />
      )}
      {activeSection === 'marketers' && (
        <MarketersSection rows={rows} pagination={tablePagination} loading={loading || permissionsLoading} onPageChange={handlePageChange} />
      )}
      {activeSection === 'referrals' && (
        <ReferralsSection
          rows={rows}
          pagination={tablePagination}
          loading={loading || permissionsLoading}
          filters={filters}
          onFiltersChange={updateFilters}
          onPageChange={handlePageChange}
        />
      )}
      {activeSection === 'collections' && (
        <CollectionsSection
          rows={rows}
          pagination={tablePagination}
          loading={loading || permissionsLoading}
          onPageChange={handlePageChange}
        />
      )}
      {activeSection === 'cashouts' && (
        <CashoutsSection
          rows={rows}
          pagination={tablePagination}
          loading={loading || permissionsLoading}
          filters={filters}
          onFiltersChange={updateFilters}
          onPageChange={handlePageChange}
          onRefresh={loadData}
        />
      )}
      {activeSection === 'settings' && (
        <SettingsSection data={settings} loading={loading || permissionsLoading} onSaved={loadData} />
      )}
    </SabitoAppAdminChrome>
  );
}

export default SabitoAppAdmin;
