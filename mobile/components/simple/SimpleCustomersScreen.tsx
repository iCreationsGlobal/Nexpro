import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { customerService } from '@/services/customerService';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDisplayPhone } from '@/utils/displayPhone';
import { FontFamily } from '@/constants/typography';
import {
  SimpleBigButton, SimpleEmpty, SimpleList, SimplePager, SimpleRow, SimpleSearch, SimpleTitle, simpleStyles,
} from '@/components/simple/SimpleUI';
import { SimpleCustomerSheet } from '@/components/simple/SimpleCustomerSheet';

const PAGE_SIZE = 20;

/** Simple Mode Customers: big Add customer, search, and a list that shows who owes money. */
export function SimpleCustomersScreen() {
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg, mutedColor, borderColor, textColor } = useScreenColors();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['simple', 'customers', activeTenantId, shop?.activeShopId ?? null, debounced, page],
    queryFn: () => customerService.getCustomers({ page, limit: PAGE_SIZE, ...(debounced ? { search: debounced } : {}) }),
    enabled: !!activeTenantId,
  });
  const body = (data || {}) as { data?: any[]; count?: number };
  const customers = Array.isArray(body.data) ? body.data : [];
  const count = Number(body.count ?? customers.length);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={simpleStyles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      <SimpleTitle>Customers</SimpleTitle>
      <SimpleBigButton label="Add customer" icon="user-plus" onPress={() => { setEditing(null); setFormOpen(true); }} />
      <SimpleSearch value={search} onChange={setSearch} placeholder="Search by name or phone" />
      <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>
        {isLoading ? 'Loading…' : `${count} ${count === 1 ? 'customer' : 'customers'}${debounced ? ' found' : ''}`}
      </Text>
      {!isLoading && customers.length === 0 ? (
        <SimpleEmpty text={debounced ? 'No customer matches that search.' : 'No customers yet. Tap Add customer to add one.'} />
      ) : (
        <SimpleList>
          {customers.map((customer) => {
            const owes = Number(customer.balance || 0);
            return (
              <SimpleRow
                key={customer.id}
                leading={(
                  <View style={[styles.avatar, { borderColor }]}>
                    <Text style={[styles.avatarText, { color: textColor }]}>
                      {String(customer.name || '?').trim().charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                title={customer.name || customer.company || 'Customer'}
                subtitle={customer.phone ? formatDisplayPhone(customer.phone) : customer.email || 'No phone'}
                right={owes > 0 ? formatCurrency(owes) : undefined}
                rightNote={owes > 0 ? 'Owes' : undefined}
                onPress={() => { setEditing(customer); setFormOpen(true); }}
              />
            );
          })}
        </SimpleList>
      )}
      <SimplePager page={page} totalPages={Math.max(Math.ceil(count / PAGE_SIZE), 1)} onChange={setPage} />
      <SimpleCustomerSheet visible={formOpen} customer={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontFamily: FontFamily.bold },
});
