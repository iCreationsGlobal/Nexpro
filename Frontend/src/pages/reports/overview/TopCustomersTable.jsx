import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from './overviewUtils';

/**
 * Ranked top customers table.
 */
export default function TopCustomersTable({
  customers = [],
  totalRevenue = 0,
  title = 'Top Customers by Revenue',
  amountColumnLabel = 'Revenue',
}) {
  return (
    <Card style={OVERVIEW_CARD_BORDER} className="bg-card h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {customers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">{amountColumnLabel}</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.slice(0, 5).map((item, idx) => {
                const rev = parseFloat(item.totalRevenue || 0);
                const pct = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : '0.0';
                const name = item.customer?.company || item.customer?.name || 'Unknown';
                return (
                  <TableRow key={item.customerId || idx}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">{formatOverviewCurrency(rev)}</TableCell>
                    <TableCell className="text-right text-primary">{pct}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No customer data for this period</div>
        )}
      </CardContent>
    </Card>
  );
}
