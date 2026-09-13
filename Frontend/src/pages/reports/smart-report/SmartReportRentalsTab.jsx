import { Clock, Package, Percent, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from '../overview/overviewUtils';
import SmartReportKpiRow from './SmartReportKpiRow';
import SmartReportSectionHeader from './SmartReportSectionHeader';

const formatInteger = (value) => Number(value || 0).toLocaleString();
const formatDamageType = (type) => String(type || 'other').replace(/_/g, ' ');

const TAB_COPY = {
  'rental-utilization': {
    title: 'Utilization',
    description: 'How much of the fleet was hired in this period.',
  },
  'rental-late-returns': {
    title: 'Late Returns',
    description: 'Returns after the hire end date and related charges.',
  },
  'rental-damage': {
    title: 'Damage',
    description: 'Damage reports and cost recorded in this period.',
  },
};

/**
 * Smart Report rental operations tabs — utilization, late returns, or damage.
 */
export default function SmartReportRentalsTab({ snapshot, periodLabel, tabId = 'rental-utilization' }) {
  const rental = snapshot?.rental || {};
  const copy = TAB_COPY[tabId] || TAB_COPY['rental-utilization'];

  const kpiItems = tabId === 'rental-late-returns'
    ? [
        { label: 'Late returns', value: rental.lateReturnCount || 0, hideTrend: true, valueFormatter: formatInteger, icon: Clock, iconBgColor: '#fef3c7', iconColor: '#b45309' },
        { label: 'Days late', value: rental.totalDaysLate || 0, hideTrend: true, valueFormatter: formatInteger, icon: Clock, iconBgColor: '#ffedd5', iconColor: '#c2410c' },
        { label: 'Late charges', value: rental.totalLateCharges || 0, hideTrend: true, icon: Clock, iconBgColor: '#fee2e2', iconColor: '#b91c1c' },
        { label: 'Pending charges', value: rental.pendingLateCharges || 0, hideTrend: true, icon: Clock, iconBgColor: '#f3e8ff', iconColor: '#7c3aed' },
      ]
    : tabId === 'rental-damage'
      ? [
          { label: 'Damage cost', value: rental.damageCost || 0, hideTrend: true, icon: Wrench, iconBgColor: '#fee2e2', iconColor: '#b91c1c' },
          { label: 'Damage reports', value: rental.damageReports || 0, hideTrend: true, valueFormatter: formatInteger, icon: Wrench, iconBgColor: '#ffedd5', iconColor: '#c2410c' },
        ]
      : [
          { label: 'Fleet utilization', value: rental.utilizationRate || 0, hideTrend: true, valueFormatter: (v) => `${Number(v).toFixed(1)}%`, icon: Percent, iconBgColor: '#dbeafe', iconColor: '#1d4ed8' },
          { label: 'Hire booked', value: rental.hireBooked || 0, hideTrend: true, icon: Package, iconBgColor: '#dcfce7', iconColor: '#166534' },
          { label: 'Hires', value: rental.rentalCount || 0, hideTrend: true, valueFormatter: formatInteger, icon: Package, iconBgColor: '#f3e8ff', iconColor: '#7e22ce' },
          { label: 'Item-days hired', value: rental.rentedDays || 0, hideTrend: true, valueFormatter: formatInteger, icon: Percent, iconBgColor: '#ccfbf1', iconColor: '#0f766e' },
        ];

  const utilizationRows = (rental.utilizationByProduct || []).slice(0, 12);
  const incidents = (rental.incidents || []).slice(0, 12);
  const damageRows = rental.damageByType || [];

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title={copy.title}
        description={copy.description}
        periodLabel={periodLabel}
      />
      <SmartReportKpiRow items={kpiItems} />

      {tabId === 'rental-utilization' && (
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
              <p className="py-10 text-center text-sm text-muted-foreground">No rentable products found</p>
            )}
          </CardContent>
        </Card>
      )}

      {tabId === 'rental-late-returns' && (
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Late return incidents</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {incidents.length > 0 ? (
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
                  {incidents.map((row) => (
                    <TableRow key={row.rentalId || `${row.customerName}-${row.daysLate}`}>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.branchName}</TableCell>
                      <TableCell className="text-right">{row.daysLate}</TableCell>
                      <TableCell className="text-right">{formatOverviewCurrency(row.lateChargeAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No late returns in this period</p>
            )}
          </CardContent>
        </Card>
      )}

      {tabId === 'rental-damage' && (
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Damage by type</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {damageRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Damage type</TableHead>
                    <TableHead className="text-right">Reports</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {damageRows.map((row) => (
                    <TableRow key={row.damageType}>
                      <TableCell className="capitalize">{formatDamageType(row.damageType)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.reportCount)}</TableCell>
                      <TableCell className="text-right">{formatOverviewCurrency(row.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No damage reports in this period</p>
            )}
          </CardContent>
        </Card>
      )}

      {tabId === 'rental-damage' && (rental.damageIncidents || []).length > 0 && (
        <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold">Damage reports</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rental.damageIncidents.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell className="capitalize">{formatDamageType(row.damageType)}</TableCell>
                    <TableCell className="capitalize">{row.severity}</TableCell>
                    <TableCell className="text-right">{formatOverviewCurrency(row.cost)}</TableCell>
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
