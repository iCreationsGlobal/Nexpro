import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';

export function FoodHero({
  addressLabel,
  title,
  description,
}: {
  addressLabel?: string | null;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.hero}>
      {addressLabel ? (
        <Text style={styles.address}>Delivering to · {addressLabel}</Text>
      ) : (
        <Text style={styles.address}>Discover food near you</Text>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#ecfccb',
    borderWidth: 1,
    borderColor: '#bef264',
  },
  address: { color: BRAND.primary, fontWeight: '700', fontSize: 13 },
  title: { marginTop: 6, color: BRAND.text, fontSize: 22, fontWeight: '900' },
  subtitle: { marginTop: 6, color: BRAND.muted, lineHeight: 20 },
});
