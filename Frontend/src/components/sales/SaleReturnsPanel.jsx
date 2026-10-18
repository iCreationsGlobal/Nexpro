import { useState, useCallback, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { usePagedList } from '../../hooks/usePagedList';
import { Loader2, RefreshCw, Undo2 } from 'lucide-react';
import saleReturnService from '../../services/saleReturnService';
import DetailsDrawer from '../DetailsDrawer';
import DrawerSectionCard from '../DrawerSectionCard';
import StatusChip from '../StatusChip';
import DashboardTable from '../DashboardTable';
import TableSkeleton from '../TableSkeleton';
import ActionColumn from '../ActionColumn';
import { showError } from '../../utils/toast';
import { formatAmount } from '../../utils/formatNumber';
import { getSalePartyLabel } from '../../utils/saleParty';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Separator } from '@/components/ui/separator';
import {
  SALE_RETURN_DISPOSITION_LABELS,
  SALE_RETURN_REASON_LABELS,
} from '../../constants';
import { QUERY_STALE } from '../../utils/queryInvalidation';

const paymentLabels = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

/** Returns in one list response (`{ data, pagination: { page, limit, total } }`). */
const returnRowsFromResponse = (response) => (Array.isArray(response?.data) ? response.data : []);

/**
 * Returns history list + detail drawer (under Sales).
 * Pages on desktop; loads as you scroll on phones and tablets.
 */
export default function SaleReturnsPanel() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const debouncedSearch = useDebounce(search, 500);

  const {
    rows,
    total,
    response: data,
    isLoading,
    isFetching,
    refetch,
    infinite,
  } = usePagedList({
    queryKey: (params) => ['sale-returns', params.page, debouncedSearch],
    params: { search: debouncedSearch || undefined },
    fetchPage: (params) => saleReturnService.getReturns(params),
    getRows: returnRowsFromResponse,
    getTotal: (response) => response?.pagination?.total,
    page,
    pageSize: 20,
    staleTime: QUERY_STALE?.SHORT || 30_000,
  });

  const paginationMeta = data?.pagination || {};

  const openDetail = useCallback(async (row) => {
    setLoadingDetail(true);
    try {
      const res = await saleReturnService.getReturnById(row.id);
      setViewing(res?.data ?? res);
    } catch (error) {
      showError(error, 'Failed to load return');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const columns = useMemo(() => [
    {
      key: 'returnNumber',
      label: 'Return #',
      render: (_, record) => (
        <span className="font-medium text-foreground">{record.returnNumber}</span>
      ),
    },
    {
      key: 'sale',
      label: 'Original sale',
      render: (_, record) => (
        <span className="text-foreground">{record.originalSale?.saleNumber || '—'}</span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (_, record) => (
        <span className="text-foreground">
          {record.originalSale ? getSalePartyLabel(record.originalSale) : '—'}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (_, record) => (
        <Badge variant="outline" className="capitalize">{record.type}</Badge>
      ),
    },
    {
      key: 'refundAmount',
      label: 'Refund / Collect',
      render: (_, record) => {
        const refund = Number(record.refundAmount) || 0;
        const collect = Number(record.collectAmount) || 0;
        if (refund > 0) return <span>{formatAmount(refund)} out</span>;
        if (collect > 0) return <span>{formatAmount(collect)} in</span>;
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (_, record) => dayjs(record.createdAt).format('MMM D, YYYY h:mm A'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, record) => <StatusChip status={record.status} />,
    },
    {
      key: 'actions',
      label: '',
      render: (_, record) => (
        <ActionColumn
          record={record}
          onView={openDetail}
        />
      ),
    },
  ], [openDetail]);

  const emptyState = useMemo(
    () => ({
      icon: Undo2,
      title: 'No returns yet',
      description: 'Refunds and exchanges you record from a sale will appear here.',
    }),
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Input
          placeholder="Search return # or reason…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <DashboardTable
          columns={columns}
          data={rows}
          title={null}
          emptyState={emptyState}
          pageSize={20}
          onPageChange={(newPagination) => setPage(newPagination.current)}
          externalPagination={{
            current: paginationMeta.page || page,
            total,
            pageSize: paginationMeta.limit || 20,
          }}
          infinite={infinite}
        />
      )}

      <DetailsDrawer
        open={Boolean(viewing) || loadingDetail}
        onClose={() => setViewing(null)}
        title="Return details"
        width={640}
        primaryAction={null}
      >
        {loadingDetail && !viewing ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : viewing ? (
          <div className="space-y-6 print:p-4" id={`return-print-${viewing.id}`}>
            <DrawerSectionCard title="Summary">
              <Descriptions column={1}>
                <DescriptionItem label="Return #">{viewing.returnNumber}</DescriptionItem>
                <DescriptionItem label="Type">
                  <span className="capitalize">{viewing.type}</span>
                </DescriptionItem>
                <DescriptionItem label="Original sale">
                  {viewing.originalSale?.saleNumber || '—'}
                </DescriptionItem>
                <DescriptionItem label="Date">
                  {dayjs(viewing.createdAt).format('MMM D, YYYY [at] h:mm A')}
                </DescriptionItem>
                <DescriptionItem label="Reason">{viewing.reasonSummary || '—'}</DescriptionItem>
                {(Number(viewing.refundAmount) || 0) > 0 && (
                  <DescriptionItem label="Refund">
                    {formatAmount(viewing.refundAmount)} via {paymentLabels[viewing.refundMethod] || viewing.refundMethod}
                  </DescriptionItem>
                )}
                {(Number(viewing.collectAmount) || 0) > 0 && (
                  <DescriptionItem label="Collected">
                    {formatAmount(viewing.collectAmount)} via {paymentLabels[viewing.collectMethod] || viewing.collectMethod}
                  </DescriptionItem>
                )}
                {viewing.notes && (
                  <DescriptionItem label="Notes">{viewing.notes}</DescriptionItem>
                )}
              </Descriptions>
            </DrawerSectionCard>

            <DrawerSectionCard title="Returned items">
              <div className="space-y-0 text-sm">
                <div className="grid grid-cols-12 gap-2 pb-2 border-b border-border font-semibold">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-3">Disposition</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                {(viewing.items || []).map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 py-2 border-b border-border/80 last:border-0">
                    <div className="col-span-5">
                      <div>{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {SALE_RETURN_REASON_LABELS[item.reasonCode] || item.reasonCode || '—'}
                      </div>
                    </div>
                    <div className="col-span-2 text-right">{item.qtyReturned}</div>
                    <div className="col-span-3 text-xs">
                      {SALE_RETURN_DISPOSITION_LABELS[item.disposition] || item.disposition}
                    </div>
                    <div className="col-span-2 text-right">{formatAmount(item.lineRefundAmount)}</div>
                  </div>
                ))}
              </div>
            </DrawerSectionCard>

            {(viewing.exchangeItems || []).length > 0 && (
              <DrawerSectionCard title="Exchange products given">
                <div className="space-y-0 text-sm">
                  {(viewing.exchangeItems || []).map((item) => (
                    <div key={item.id} className="flex justify-between py-2 border-b border-border/80 last:border-0">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{formatAmount(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              </DrawerSectionCard>
            )}

            <Separator />
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              Print note
            </Button>
          </div>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
