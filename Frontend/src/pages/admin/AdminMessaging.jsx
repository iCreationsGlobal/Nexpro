import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Phone, Users, AlertTriangle } from 'lucide-react';
import adminService from '../../services/adminService';
import { usePlatformAdminPermissions } from '../../context/PlatformAdminPermissionsContext';
import { formatInteger } from '../../utils/formatNumber';
import { showError, showSuccess, handleApiError } from '../../utils/toast';
import DashboardStatsCard from '../../components/DashboardStatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const providerLabel = (provider) => {
  if (provider === 'mnotify') return 'Mnotify';
  if (provider === 'arkesel') return 'Arkesel';
  return provider || 'SMS provider';
};

const AdminMessaging = () => {
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const [usageLoading, setUsageLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const canView = hasPermission('messaging.view');

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const response = await adminService.getMessagingUsage({ includeBalance: 0 });
      if (response?.success) setUsage(response.data);
    } catch (error) {
      console.error('Failed to load messaging usage', error);
      handleApiError(error, 'Failed to load messaging usage');
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permissionsLoading || !canView) return;
    loadUsage();
  }, [permissionsLoading, canView, loadUsage]);

  const refreshBalance = async () => {
    setBalanceLoading(true);
    try {
      const response = await adminService.getMessagingUsage({ includeBalance: 1 });
      if (response?.success) {
        setUsage(response.data);
        if (response.data?.balance?.ok) {
          showSuccess(`${providerLabel(response.data.balance.provider)} balance refreshed`);
        } else {
          showError(response.data?.balance?.message || 'Could not refresh SMS provider balance');
        }
      }
    } catch (error) {
      handleApiError(error, 'Failed to refresh SMS provider balance');
    } finally {
      setBalanceLoading(false);
    }
  };

  if (!permissionsLoading && !canView) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You don&apos;t have permission to view Messaging.
          </p>
        </div>
      </div>
    );
  }

  if (permissionsLoading && !usage) {
    return (
      <div className="flex justify-center py-20">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  const platformSms = usage?.platformSms || null;
  const balance = usage?.balance?.balance;
  const smsRows = platformSms?.byTenant || [];
  const yearMonth = platformSms?.yearMonth || usage?.yearMonth;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Messaging</h2>
          <p className="text-sm text-muted-foreground">
            Platform SMS usage by tenant and the SMS provider balance. Message contents are not shown.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => loadUsage()} disabled={usageLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${usageLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={refreshBalance}
            disabled={balanceLoading}
            className="bg-[#166534] hover:bg-[#14532d] text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${balanceLoading ? 'animate-spin' : ''}`} />
            Refresh provider balance
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <DashboardStatsCard
          title="Platform SMS (month)"
          value={platformSms?.totals?.sentCount ?? 0}
          subtitle={`${formatInteger(platformSms?.totals?.remaining ?? 0)} remaining · limit ${formatInteger(platformSms?.monthlyLimit ?? 0)}/tenant`}
          icon={Phone}
          iconBgColor="#fef3c7"
          iconColor="#d97706"
          loading={usageLoading}
        />
        <DashboardStatsCard
          title="Tenants sending (month)"
          value={platformSms?.totals?.tenantCount ?? smsRows.length}
          subtitle={yearMonth ? `Usage for ${yearMonth}` : 'Usage this month'}
          icon={Users}
          iconBgColor="#dcfce7"
          iconColor="#166534"
          loading={usageLoading}
        />
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Provider balance
              {usage?.balance?.provider ? (
                <Badge variant="outline" className="font-normal">
                  {providerLabel(usage.balance.provider)}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {balance ? (
              <>
                <p>
                  SMS balance:{' '}
                  <span className="font-semibold">{balance.smsBalance ?? '—'}</span>
                </p>
                <p>
                  Main balance:{' '}
                  <span className="font-semibold">{balance.mainBalance ?? '—'}</span>
                </p>
                {balance.bonus != null && (
                  <p>
                    Bonus:{' '}
                    <span className="font-semibold">{balance.bonus}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Click &quot;Refresh provider balance&quot; to check platform SMS credit.
              </p>
            )}
            {usage?.balance && !usage.balance.ok && (
              <p className="text-red-600">{usage.balance.message}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Platform SMS usage
            {yearMonth ? ` · ${yearMonth}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : smsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No platform SMS usage recorded this month.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Monthly limit</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">% used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsRows.map((row) => (
                    <TableRow key={row.tenantId}>
                      <TableCell className="font-medium">{row.tenantName}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.sentCount)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.monthlyLimit)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.remaining)}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.percentUsed >= 90 ? 'text-red-600 font-medium' : ''}>
                          {row.percentUsed}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMessaging;
