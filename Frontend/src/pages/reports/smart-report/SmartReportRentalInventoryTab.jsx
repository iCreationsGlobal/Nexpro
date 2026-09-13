import { AlertTriangle, Package, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from '../overview/overviewUtils';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

const formatInteger = (value) => Number(value || 0).toLocaleString();

/**
 * Inventory Intelligence — low stock, fleet value, utilization.
 */
export default function SmartReportRentalInventoryTab({ snapshot, periodLabel }) {
  const rental = snapshot?.rental || {};
  const alerts = rental.lowStockAlerts || [];
  const utilizationRows = (rental.utilizationByProduct || []).slice(0, 15);
  const branches = rental.inventoryByBranch || [];
  const outOfStock = alerts.filter((item) => item.status === 'out_of_stock').length;
  const critical = alerts.filter((item) => item.status === 'critical_low').length;
  const inventoryValue = branches.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0);

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Inventory Intelligence"
        description="Stock alerts, fleet value, and utilization for rentable items."
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow
        items={[
          { label: 'Out of Stock', value: outOfStock, hideTrend: true, valueFormatter: formatInteger, icon: AlertTriangle, iconBgColor: '#fee2e2', iconColor: '#b91c1c' },
          { label: 'Critical Low', value: critical, hideTrend: true, valueFormatter: formatInteger, icon: AlertTriangle, iconBgColor: '#fef3c7', iconColor: '#b45309' },
          { label: 'Fleet value', value: inventoryValue, hideTrend: true, icon: Package, iconBgColor: '#dcfce7', iconColor: '#166534' },
          { label: 'Fleet utilization', value: rental.utilizationRate || 0, hideTrend: true, valueFormatter: (v) => `${Number(v).toFixed(1)}%`, icon: Percent, iconBgColor: '#dbeafe', iconColor: '#1d4ed8' },
        ]}
      />

      <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Low Stock Alerts</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {alerts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell>{item.branchName}</TableCell>
                    <TableCell className="text-right">{formatInteger(item.quantityOnHand)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={item.status === 'out_of_stock' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                        {item.statusLabel}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No low-stock rentable items</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Utilization by product</CardTitle>
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
                    <TableRow key={row.productId || row.productName}>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.rentedDays)}</TableCell>
                      <TableCell className="text-right">{Number(row.utilizationRate || 0).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No utilization data</p>
            )}
          </CardContent>
        </Card>

        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Branch inventory value</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {branches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((row) => (
                    <TableRow key={row.branchId}>
                      <TableCell>{row.branchName}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.itemCount)}</TableCell>
                      <TableCell className="text-right">{formatOverviewCurrency(row.inventoryValue)}</TableCell>
                      <TableCell className="text-right">{Number(row.percentage || 0).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No branch inventory data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
