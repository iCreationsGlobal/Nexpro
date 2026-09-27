import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { dashboardService } from '@/services/dashboardService';
import { expenseService } from '@/services/expenseService';
import { formatCurrency } from '@/utils/formatCurrency';
import { simplePeriodRange, type SimplePeriodKey } from '@/utils/simplePeriods';
import { useRefetchOnFocus } from '@/hooks/useScreenFocus';
import {
  SIMPLE_PERIOD_TABS, SimpleBigButton, SimpleEmpty, SimpleList, SimplePager, SimplePeriodTabs,
  SimpleRow, SimpleSummary, SimpleTitle, simpleStyles,
} from '@/components/simple/SimpleUI';
import { SimpleExpenseSheet } from '@/components/simple/SimpleExpenseSheet';

const PAGE_SIZE = 20;

/**
 * Simple Mode Expenses: big Add expense, a period switch, the period total (same figure as the
 * Home Expenses card) and a plain list. `?new=1` (Home's Add expense) opens the form directly.
 */
export function SimpleExpensesScreen() {
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg } = useScreenColors();
  const params = useLocalSearchParams<{ new?: string }>();
  const [period, setPeriod] = useState<SimplePeriodKey>('today');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const range = useMemo(() => simplePeriodRange(period), [period]);
  const tab = SIMPLE_PERIOD_TABS.find((p) => p.key === period) || SIMPLE_PERIOD_TABS[0];
  const scope = [activeTenantId, shop?.activeShopId ?? null, range.startDate, range.endDate];

  useEffect(() => {
    if (params.new !== '1') return;
    setEditing(null);
    setFormOpen(true);
    router.setParams({ new: undefined } as never);
  }, [params.new]);

  const listQuery = useQuery({
    queryKey: ['simple', 'expenses', ...scope, page],
    queryFn: () => expenseService.getExpenses({ ...range, page, limit: PAGE_SIZE }),
    enabled: !!activeTenantId,
  });
  const totalQuery = useQuery({
    queryKey: ['simple', 'overview', ...scope],
    queryFn: () => dashboardService.getOverview(range.startDate, range.endDate, tab.filterType),
    enabled: !!activeTenantId,
  });
  useRefetchOnFocus(listQuery);
  useRefetchOnFocus(totalQuery);
  const body = (listQuery.data || {}) as { data?: any[]; count?: number };
  const expenses = Array.isArray(body.data) ? body.data : [];
  const count = Number(body.count ?? expenses.length);
  const overview = ((totalQuery.data as any)?.data ?? totalQuery.data ?? {}) as { thisMonth?: { expenses?: number } };
  const total = Number(overview.thisMonth?.expenses || 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={simpleStyles.screen}
      refreshControl={<RefreshControl refreshing={listQuery.isRefetching} onRefresh={() => { listQuery.refetch(); totalQuery.refetch(); }} />}
    >
      <SimpleTitle>Expenses</SimpleTitle>
      <SimpleBigButton label="Add expense" icon="plus" onPress={() => { setEditing(null); setFormOpen(true); }} />
      <SimplePeriodTabs value={period} onChange={(key) => { setPeriod(key); setPage(1); }} />
      <SimpleSummary
        caption={listQuery.isLoading ? 'Loading…' : `${count} ${count === 1 ? 'expense' : 'expenses'} ${tab.phrase}`}
        value={formatCurrency(total)}
        loading={totalQuery.isLoading}
      />
      {!listQuery.isLoading && expenses.length === 0 ? (
        <SimpleEmpty text={`No expenses ${tab.phrase} yet. Tap Add expense to record one.`} />
      ) : (
        <SimpleList>
          {expenses.map((expense) => {
            const date = expense.expenseDate || expense.createdAt;
            const when = date ? new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
            return (
              <SimpleRow
                key={expense.id}
                title={expense.category || 'Expense'}
                subtitle={[when, expense.description].filter(Boolean).join(' · ')}
                right={formatCurrency(expense.amount)}
                rightNote={expense.approvalStatus === 'pending_approval' ? 'Awaiting approval' : undefined}
                onPress={() => { setEditing(expense); setFormOpen(true); }}
              />
            );
          })}
        </SimpleList>
      )}
      <SimplePager page={page} totalPages={Math.max(Math.ceil(count / PAGE_SIZE), 1)} onChange={setPage} />
      <SimpleExpenseSheet visible={formOpen} expense={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    </ScrollView>
  );
}
