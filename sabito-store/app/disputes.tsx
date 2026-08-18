import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { disputesApi } from '@/services/ordersApi';
import { buyerQueryKeys, QUERY_STALE } from '@/utils/queryInvalidation';

export default function DisputesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: buyerQueryKeys.disputes,
    queryFn: () => disputesApi.list(),
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: false,
  });
  const disputes = (data?.data as Array<{ id: string; status: string; reason: string; saleNumber?: string; openedAt?: string }>) || [];

  return (
    <Screen>
      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          isLoading ? <ActivityIndicator color={BRAND.primary} /> : <EmptyState title="No open issues" message="Disputes you open on orders appear here." />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.order}>{item.saleNumber || 'Order issue'}</Text>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  order: { fontWeight: '800', color: BRAND.text },
  status: { marginTop: 4, textTransform: 'capitalize', color: BRAND.primary, fontWeight: '600' },
  reason: { marginTop: 4, color: BRAND.muted },
});
