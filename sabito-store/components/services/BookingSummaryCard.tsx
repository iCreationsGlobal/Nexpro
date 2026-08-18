import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { formatCurrency } from '@/utils/format';
import type { MarketplaceService } from '@/services/marketplaceApi';

export function BookingSummaryCard({
  service,
  preferredDate,
  preferredTime,
}: {
  service: MarketplaceService;
  preferredDate?: string;
  preferredTime?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{service.title}</Text>
      {service.studio?.displayName ? <Text style={styles.meta}>{service.studio.displayName}</Text> : null}
      {service.startingPrice ? (
        <Text style={styles.price}>From {formatCurrency(service.startingPrice, service.currency || 'GHS')}</Text>
      ) : null}
      {preferredDate ? <Text style={styles.meta}>Date: {preferredDate}{preferredTime ? ` · ${preferredTime}` : ''}</Text> : null}
      {service.durationMinutes ? <Text style={styles.meta}>Duration: {service.durationMinutes} min</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 6,
  },
  title: { fontSize: 18, fontWeight: '800', color: BRAND.text },
  meta: { color: BRAND.muted },
  price: { color: BRAND.primary, fontWeight: '800', fontSize: 16 },
});
