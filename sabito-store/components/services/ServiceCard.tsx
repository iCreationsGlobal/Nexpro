import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import type { MarketplaceService } from '@/services/marketplaceApi';
import { formatCurrency, resolveImageUrl } from '@/utils/format';

export function ServiceCard({ service, onPress }: { service: MarketplaceService; onPress: () => void }) {
  const image = resolveImageUrl(service.images?.[0]);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {image ? <Image source={{ uri: image }} style={styles.image} contentFit="cover" /> : <View style={[styles.image, styles.placeholder]} />}
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>{service.title}</Text>
        {service.studio?.displayName ? <Text style={styles.studio}>{service.studio.displayName}</Text> : null}
        <View style={styles.footer}>
          {service.startingPrice ? (
            <Text style={styles.price}>From {formatCurrency(service.startingPrice, service.currency || 'GHS')}</Text>
          ) : (
            <Text style={styles.price}>Quote on request</Text>
          )}
          {service.canBookOnline ? <Text style={styles.badge}>Book online</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 240,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND.border,
    marginRight: 12,
  },
  image: { width: '100%', height: 110 },
  placeholder: { backgroundColor: '#e2e8f0' },
  body: { padding: 12 },
  title: { fontSize: 15, fontWeight: '800', color: BRAND.text, minHeight: 40 },
  studio: { marginTop: 4, color: BRAND.primary, fontWeight: '700', fontSize: 12 },
  footer: { marginTop: 10, gap: 6 },
  price: { color: BRAND.text, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#ecfccb', color: BRAND.primary, fontWeight: '700', fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
});
