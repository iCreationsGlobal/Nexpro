import {
  AlertTriangle,
  CircleDollarSign,
  Package,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import OverviewKpiCard from '../overview/OverviewKpiCard';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency, formatPercentChange } from '../overview/overviewUtils';
import SmartReportSectionHeader from './SmartReportSectionHeader';

const formatInteger = (value) => Number(value || 0).toLocaleString();

/**
 * Rental Business Overview — KPIs, stock alerts, top items, categories, branches.
 */
export default function SmartReportRentalOverviewTab({ snapshot, periodLabel }) {
  const rental = snapshot?.rental || {};
  const kpis = snapshot?.kpis || {};
  const hireBooked = rental.hireBooked || 0;
  const expenses = kpis.expenses?.value || 0;
  const netProfit = hireBooked - expenses;
  const profitMargin = hireBooked > 0 ? (netProfit / hireBooked) * 100 : 0;
  const newCustomers = kpis.newCustomers?.value || 0;
  const activeCustomers = kpis.activeCustomers?.value || 0;
  const customerBase = activeCustomers || (Number(kpis.returningCustomers?.value || 0) + newCustomers);
  const totalCustomers = customerBase || newCustomers;
  const newShare = customerBase > 0 ? (newCustomers / customerBase) * 100 : 0;

  const lowStock = (rental.lowStockAlerts || []).slice(0, 10);
  const topItems = (rental.byProduct || []).slice(0, 10);
  const categories = (rental.categoryPerformance || []).slice(0, 10);
  const branches = rental.inventoryByBranch || [];
  const revenueChange = kpis.revenue?.change ?? 0;

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Business Overview"
        description="Hire booked, fleet alerts, and category performance for the period."
        periodLabel={periodLabel}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <OverviewKpiCard
          label="Total Revenue"
          value={hireBooked}
          change={revenueChange}
          comparisonLabel={snapshot.comparisonLabel}
          sourceLabel="Hire booked in this period"
          icon={CircleDollarSign}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewKpiCard
          label="Total Profit"
          value={netProfit}
          hideTrend
          subLabel={`Margin: ${profitMargin.toFixed(1)}%`}
          icon={TrendingUp}
          iconBgColor="#dcfce7"
          iconColor="#166534"
        />
        <OverviewKpiCard
          label="Rental Transactions"
          value={rental.rentalCount || 0}
          hideTrend
          valueFormatter={formatInteger}
          subLabel={`Total Value: ${formatOverviewCurrency(hireBooked)}`}
          icon={Package}
          iconBgColor="#dbeafe"
          iconColor="#1d4ed8"
        />
        <OverviewKpiCard
          label="Total Customers"
          value={totalCustomers || newCustomers}
          hideTrend
          valueFormatter={formatInteger}
          subLabel={newShare > 0 ? `${newShare.toFixed(1)}% new` : 'From customer activity'}
          icon={Users}
          iconBgColor="#ffedd5"
          iconColor="#c2410c"
        />
      </div>

      <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Low Stock Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {lowStock.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {lowStock.map((item) => (
                <div key={item.productId} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{item.productName}</p>
                    <Badge variant="secondary" className={item.status === 'out_of_stock' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                      {item.statusLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.categoryName} • {item.branchName} • Rentals
                  </p>
                  <p className="text-sm mt-2">Qty: {formatInteger(item.quantityOnHand)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No low-stock rentable items</p>
          )}
        </CardContent>
      </Card>

      <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Top 10 Performing Rental Items</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {topItems.length > 0 ? (
            <div className="space-y-3">
              {topItems.map((item) => (
                <div key={item.productId} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.categoryName || 'Uncategorized'} • {item.branchName || 'Unassigned'} • Rentals
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatOverviewCurrency(item.ratePerDay || 0)} × {formatInteger(item.quantityRented)} units × {formatInteger(item.daysRented)} days
                    </p>
                  </div>
                  <p className="font-semibold text-sm shrink-0">{formatOverviewCurrency(item.revenue)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No hire booked in this period</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Category Performance (Actual Rental Revenue)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {categories.length > 0 ? categories.map((row) => (
              <div key={row.categoryName} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{row.categoryName}</p>
                  <p className="text-xs text-muted-foreground">{formatInteger(row.itemCount)} items</p>
                </div>
                <p className="text-sm mt-1">Funds Generated: {formatOverviewCurrency(row.revenue)}</p>
                <p className="text-xs text-muted-foreground">Sold: {formatInteger(row.soldQuantity)} • Rented: {formatInteger(row.rentedQuantity)}</p>
              </div>
            )) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No category hire data</p>
            )}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Branch Distribution (Cost Price × Quantity)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {branches.length > 0 ? branches.map((row) => (
              <div key={row.branchId} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{row.branchName}</p>
                  <p className="text-xs text-muted-foreground">{formatInteger(row.itemCount)} items</p>
                </div>
                <p className="text-sm mt-1">{formatOverviewCurrency(row.inventoryValue)}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(row.percentage || 0).toFixed(1)}% • Sales: {formatInteger(row.salesCount)} • Rentals: {formatInteger(row.rentalCount)}
                </p>
              </div>
            )) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No branch inventory data</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Revenue Growth</p>
              <p className="font-semibold">{formatPercentChange(revenueChange)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Profit Margin</p>
              <p className="font-semibold">{profitMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Customer Acquisition</p>
              <p className="font-semibold">{newShare.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Key Insights</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Revenue Growth.</span> Hire booked changed by {formatPercentChange(revenueChange)} versus the previous period.</p>
            <p><span className="font-medium text-foreground">Rental Transactions.</span> {formatInteger(rental.rentalCount)} hires worth {formatOverviewCurrency(hireBooked)}.</p>
            {newShare > 0 && (
              <p><span className="font-medium text-foreground">Growing Customer Base.</span> {newShare.toFixed(1)}% of active customers in this period are new.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
