import { useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Package,
  Percent,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import OverviewHeader from '../overview/OverviewHeader';
import OverviewKpiCard from '../overview/OverviewKpiCard';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from '../overview/overviewUtils';
import { formatAmount } from '../../../utils/formatNumber';
import { getActiveShopIdForScope } from '../../../utils/shopScope';
import { useShopOptional } from '../../../context/ShopContext';
import RentalTableExportButton from './RentalTableExportButton';
import {
  exportDamageByTypeCsv,
  exportLateReturnsCsv,
  exportRevenueByProductCsv,
  exportUtilizationCsv,
} from './rentalReportExports';
import dayjs from 'dayjs';

const formatPeriodLabel = (period) => {
  if (!period) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return dayjs(period).format('MMM D');
  if (/^\d{4}-\d{2}$/.test(period)) return dayjs(`${period}-01`).format('MMM YYYY');
  return period;
};

const formatDamageType = (type) => String(type || 'other').replace(/_/g, ' ');

/**
 * Rental-specific Reports overview: revenue, late returns, utilization, damage trends.
 */
export default function RentalReportsOverview({
  rentalStats,
  dateRange,
  dateFilter,
  onDateRangeSelect,
  onPresetSelect,
  onCustomize,
  onDownload,
  downloading = false,
  embedded = false,
}) {
  const {
    revenue = {},
    lateReturns = {},
    utilization = {},
    damageTrends = {},
  } = rentalStats || {};

  const revenueTrendData = useMemo(
    () => (revenue.byPeriod || []).map((row) => ({
      period: formatPeriodLabel(row.period),
      revenue: Number(row.rentalRevenue || 0),
      rentals: Number(row.rentalCount || 0),
    })),
    [revenue.byPeriod]
  );

  const damageTrendData = useMemo(
    () => (damageTrends.byPeriod || []).map((row) => ({
      period: formatPeriodLabel(row.period),
      totalCost: Number(row.totalCost || 0),
      reports: Number(row.reportCount || 0),
    })),
    [damageTrends.byPeriod]
  );

  const topProducts = useMemo(
    () => (revenue.byProduct || []).slice(0, 8),
    [revenue.byProduct]
  );

  const topBranches = useMemo(
    () => (revenue.byBranch || []).slice(0, 6),
    [revenue.byBranch]
  );

  const utilizationRows = useMemo(
    () => (utilization.byProduct || []).slice(0, 8),
    [utilization.byProduct]
  );

  const lateIncidents = useMemo(
    () => (lateReturns.incidents || []).slice(0, 10),
    [lateReturns.incidents]
  );

  const summary = lateReturns.summary || {};

  const shopContext = useShopOptional();
  const activeShopId = getActiveShopIdForScope();

  const branchScopeLabel = useMemo(() => {
    if (shopContext?.activeShop?.name) return shopContext.activeShop.name;
    const matchedShop = (shopContext?.shops || []).find((shop) => shop.id === activeShopId);
    if (matchedShop?.name) return matchedShop.name;
    if (activeShopId) return `Branch ${activeShopId}`;
    return 'All branches';
  }, [shopContext?.activeShop?.name, shopContext?.shops, activeShopId]);

  const exportScope = useMemo(
    () => ({ dateRange, branchScopeLabel }),
    [dateRange, branchScopeLabel]
  );

  const handleExportRevenueByProduct = useCallback(() => {
    exportRevenueByProductCsv(revenue.byProduct || [], exportScope);
  }, [revenue.byProduct, exportScope]);

  const handleExportLateReturns = useCallback(() => {
    exportLateReturnsCsv(lateReturns.incidents || [], summary, exportScope);
  }, [lateReturns.incidents, summary, exportScope]);

  const handleExportUtilization = useCallback(() => {
    exportUtilizationCsv(utilization.byProduct || [], utilization, exportScope);
  }, [utilization, exportScope]);

  const handleExportDamage = useCallback(() => {
    exportDamageByTypeCsv(damageTrends.byType || [], damageTrends, exportScope);
  }, [damageTrends, exportScope]);

  const revenueByProductRows = revenue.byProduct || [];
  const lateReturnRows = lateReturns.incidents || [];
  const utilizationExportRows = utilization.byProduct || [];
  const damageTypeRows = damageTrends.byType || [];

  return (
    <div id={embedded ? 'rental-operations-report-content' : 'overview-report-content'} className={embedded ? 'mt-8' : undefined}>
      {embedded ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Rental operations</h2>
          <p className="text-sm text-muted-foreground">
            Hire booked is overlapping rental amounts plus late fees — not the same as invoice collections above.
          </p>
        </div>
      ) : (
        <OverviewHeader
          title="Rental Reports"
          dateRange={dateRange}
          onDateRangeSelect={onDateRangeSelect}
          onPresetSelect={onPresetSelect}
          activePreset={dateFilter}
          onCustomize={onCustomize}
          onDownload={onDownload}
          downloading={downloading}
          downloadLabel="Download PDF"
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
        <OverviewKpiCard
          label="Hire booked"
          value={revenue.totalRevenue || 0}
          hideTrend
          subLabel={`${revenue.rentalCount || 0} rentals · ${formatOverviewCurrency(revenue.totalLateCharges || 0)} late fees`}
          icon={Wallet}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewKpiCard
          label="Late Returns"
          value={summary.lateReturnCount || 0}
          hideTrend
          subLabel={`${summary.totalDaysLate || 0} total days late`}
          icon={Clock}
          iconBgColor="#fef3c7"
          iconColor="#b45309"
          valueFormatter={(v) => String(v)}
        />
        <OverviewKpiCard
          label="Fleet Utilization"
          value={utilization.overallUtilizationRate || 0}
          hideTrend
          subLabel={`${utilization.totalRentedDays || 0} / ${utilization.totalAvailableDays || 0} item-days`}
          icon={Percent}
          iconBgColor="#dbeafe"
          iconColor="#1d4ed8"
          valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
        />
        <OverviewKpiCard
          label="Damage Costs"
          value={damageTrends.totalCost || 0}
          hideTrend
          subLabel={`${damageTrends.reportCount || 0} damage reports`}
          icon={Wrench}
          iconBgColor="#fee2e2"
          iconColor="#b91c1c"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Hire booked by Period
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {revenueTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#8c8c8c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8c8c8c', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    formatter={(value) => [formatOverviewCurrency(value), 'Hire booked']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="revenue" fill="#166534" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">No hire booked in this period</div>
            )}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Damage Cost Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {damageTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={damageTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#8c8c8c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8c8c8c', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    formatter={(value) => [formatOverviewCurrency(value), 'Damage cost']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Line type="monotone" dataKey="totalCost" stroke="#b91c1c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">No damage reports in this period</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold">Hire booked by Product</CardTitle>
              <RentalTableExportButton
                onClick={handleExportRevenueByProduct}
                disabled={revenueByProductRows.length === 0}
                label="Export CSV"
              />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {topProducts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Hire booked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{row.quantityRented}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No product rental data</div>
            )}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-semibold">Hire booked by Branch</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {topBranches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Rentals</TableHead>
                    <TableHead className="text-right">Hire booked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topBranches.map((row) => (
                    <TableRow key={row.branchId}>
                      <TableCell>{row.branchName}</TableCell>
                      <TableCell className="text-right">{row.rentalCount}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No branch revenue data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Late Returns &amp; Charges
              </CardTitle>
              <RentalTableExportButton
                onClick={handleExportLateReturns}
                disabled={lateReturnRows.length === 0}
                label="Export CSV"
              />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Late charges (total)</p>
                <p className="font-semibold">{formatAmount(summary.totalLateCharges || 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Pending charges</p>
                <p className="font-semibold">{formatAmount(summary.pendingLateCharges || 0)}</p>
              </div>
            </div>
            {lateIncidents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Days late</TableHead>
                    <TableHead className="text-right">Charge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lateIncidents.map((row) => (
                    <TableRow key={row.rentalId}>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.branchName}</TableCell>
                      <TableCell className="text-right">{row.daysLate}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.lateChargeAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">No late returns in this period</div>
            )}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Utilization by Product
              </CardTitle>
              <RentalTableExportButton
                onClick={handleExportUtilization}
                disabled={utilizationExportRows.length === 0}
                label="Export CSV"
              />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {utilizationRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Rented days</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilizationRows.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{row.rentedDays}</TableCell>
                      <TableCell className="text-right">{Number(row.utilizationRate || 0).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No rentable products found</div>
            )}
          </CardContent>
        </Card>
      </div>

      {(damageTrends.byType || []).length > 0 && (
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold">Damage by Type</CardTitle>
              <RentalTableExportButton
                onClick={handleExportDamage}
                disabled={damageTypeRows.length === 0}
                label="Export CSV"
              />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Damage type</TableHead>
                  <TableHead className="text-right">Reports</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(damageTrends.byType || []).map((row) => (
                  <TableRow key={row.damageType}>
                    <TableCell className="capitalize">{formatDamageType(row.damageType)}</TableCell>
                    <TableCell className="text-right">{row.reportCount}</TableCell>
                    <TableCell className="text-right">{formatAmount(row.totalCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
