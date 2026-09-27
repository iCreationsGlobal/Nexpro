import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { saleService } from '@/services/saleService';
import { formatCurrency } from '@/utils/formatCurrency';
import { simplePeriodRange, type SimplePeriodKey } from '@/utils/simplePeriods';
import { useRefetchOnFocus } from '@/hooks/useScreenFocus';
import {
  SIMPLE_PERIOD_TABS, SimpleBigButton, SimpleEmpty, SimpleList, SimplePager, SimplePeriodTabs,
  SimpleRow, SimpleSummary, SimpleTitle, simpleStyles,
} from '@/components/simple/SimpleUI';
import { PAYMENT_METHOD_LABELS, SimpleReceiptSheet } from '@/components/simple/SimpleReceiptSheet';

const PAGE_SIZE = 20;
const UNPAID = new Set(['pending', 'partially_paid']);

/** Simple Mode Sales: big Sell, a period switch, the period total and a plain list of sales. */
export function SimpleSalesScreen() {
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg } = useScreenColors();
  const [period, setPeriod] = useState<SimplePeriodKey>('today');
  const [page, setPage] = useState(1);
  const [openSale, setOpenSale] = useState<Record<string, any> | null>(null);
  const range = useMemo(() => simplePeriodRange(period), [period]);
  const phrase = SIMPLE_PERIOD_TABS.find((p) => p.key === period)?.phrase || 'today';

  const salesQuery = useQuery({
    queryKey: ['simple', 'sales', activeTenantId, shop?.activeShopId ?? null, range.startDate, range.endDate, page],
    queryFn: () => saleService.getSales({ ...range, page, limit: PAGE_SIZE }),
    enabled: !!activeTenantId,
  });
  const { data, isLoading, refetch, isRefetching } = salesQuery;
  // New sales are made in the Sell flow; refresh when coming back to this tab.
  useRefetchOnFocus(salesQuery);
  const body = (data || {}) as { data?: any[]; count?: number; summary?: { completedRevenue?: number } };
  const sales = Array.isArray(body.data) ? body.data : [];
  const count = Number(body.count ?? sales.length);
  const revenue = Number(body.summary?.completedRevenue || 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={simpleStyles.screen}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      <SimpleTitle>Sales</SimpleTitle>
      <SimpleBigButton label="Sell" icon="shopping-cart" onPress={() => router.push('/simple' as never)} />
      <SimplePeriodTabs value={period} onChange={(key) => { setPeriod(key); setPage(1); }} />
      <SimpleSummary
        caption={isLoading ? 'Loading…' : `${count} ${count === 1 ? 'sale' : 'sales'} ${phrase}`}
        value={formatCurrency(revenue)}
        loading={isLoading}
      />
      {!isLoading && sales.length === 0 ? (
        <SimpleEmpty text={`No sales ${phrase} yet. Tap Sell to make one.`} />
      ) : (
        <SimpleList>
          {sales.map((sale) => {
            const items = Array.isArray(sale.items) ? sale.items : [];
            const qty = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
            const time = sale.createdAt
              ? new Date(sale.createdAt).toLocaleString([], period === 'today'
                ? { hour: 'numeric', minute: '2-digit' }
                : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : '';
            const parts = [time, qty ? `${qty} ${qty === 1 ? 'item' : 'items'}` : '', PAYMENT_METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod]
              .filter(Boolean);
            return (
              <SimpleRow
                key={sale.id}
                title={sale.customer?.name || sale.customer?.company || 'Walk-in customer'}
                subtitle={parts.join(' · ')}
                right={formatCurrency(sale.total)}
                rightNote={UNPAID.has(sale.status) ? 'Unpaid' : undefined}
                onPress={() => setOpenSale(sale)}
              />
            );
          })}
        </SimpleList>
      )}
      <SimplePager page={page} totalPages={Math.max(Math.ceil(count / PAGE_SIZE), 1)} onChange={setPage} />
      <SimpleReceiptSheet sale={openSale} onClose={() => setOpenSale(null)} />
    </ScrollView>
  );
}
