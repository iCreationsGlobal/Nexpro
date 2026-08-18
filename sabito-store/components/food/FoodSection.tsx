import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';

export function FoodSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: BRAND.text, paddingHorizontal: 16, marginBottom: 4 },
  subtitle: { color: BRAND.muted, paddingHorizontal: 16, marginBottom: 10 },
  row: { paddingHorizontal: 16, paddingBottom: 4 },
});
