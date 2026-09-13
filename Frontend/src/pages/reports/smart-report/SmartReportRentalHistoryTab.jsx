import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from '../overview/overviewUtils';
import SmartReportSectionHeader from './SmartReportSectionHeader';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const formatInteger = (value) => Number(value || 0).toLocaleString();

/**
 * Product Rental History table for the selected period.
 */
export default function SmartReportRentalHistoryTab({ snapshot, periodLabel }) {
  const rows = snapshot?.rental?.productHistory || [];

  return (
    <div className="space-y-6">
      <SmartReportSectionHeader
        title="Product Rental History"
        description={`Showing rental history for ${formatInteger(rows.length)} products`}
        periodLabel={periodLabel}
      />
      <Card style={OVERVIEW_CARD_BORDER} className="bg-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Hire activity by product</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Times rented</TableHead>
                  <TableHead className="text-right">Total quantity</TableHead>
                  <TableHead className="text-right">Total revenue</TableHead>
                  <TableHead className="text-right">Avg. per rental</TableHead>
                  <TableHead>Last rented</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell>
                      <p className="font-medium">{row.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.categoryName} • {formatOverviewCurrency(row.ratePerDay)}/rental day
                      </p>
                    </TableCell>
                    <TableCell className="text-right">{formatInteger(row.timesRented)}</TableCell>
                    <TableCell className="text-right">{formatInteger(row.totalQuantity)}</TableCell>
                    <TableCell className="text-right">{formatOverviewCurrency(row.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{formatOverviewCurrency(row.avgPerRental)}</TableCell>
                    <TableCell>
                      {row.lastRented ? (
                        <div>
                          <p>{dayjs(row.lastRented).format('MMM D, YYYY')}</p>
                          <p className="text-xs text-muted-foreground">{dayjs(row.lastRented).fromNow()}</p>
                        </div>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No product hire history in this period</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
