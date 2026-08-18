import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';

const DEFAULT_STEPS = [
  { key: 'received', label: 'Order received' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

type TimelineStep = { label?: string; status?: string; at?: string; completed?: boolean };

const normalizeStatus = (value?: string) => String(value || '').toLowerCase().replace(/\s+/g, '_');

export function OrderTimeline({ timeline, orderStatus }: { timeline?: TimelineStep[]; orderStatus?: string | null }) {
  const normalizedStatus = normalizeStatus(orderStatus || '');
  const statusIndex = DEFAULT_STEPS.findIndex((step) => normalizedStatus.includes(step.key.replace('_', '')));

  const steps = DEFAULT_STEPS.map((step, index) => {
    const match = (timeline || []).find((entry) => {
      const key = normalizeStatus(entry.status || entry.label);
      return key.includes(step.key) || step.key.includes(key);
    });
    const completed = Boolean(match?.at) || (statusIndex >= 0 && index <= statusIndex);
    return { ...step, at: match?.at, completed };
  });

  return (
    <View style={styles.block}>
      {steps.map((step, index) => (
        <View key={step.key} style={styles.row}>
          <View style={styles.track}>
            <View style={[styles.dot, step.completed && styles.dotDone]} />
            {index < steps.length - 1 ? <View style={[styles.line, step.completed && styles.lineDone]} /> : null}
          </View>
          <View style={styles.content}>
            <Text style={[styles.label, step.completed && styles.labelDone]}>{step.label}</Text>
            {step.at ? <Text style={styles.time}>{new Date(step.at).toLocaleString()}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 0 },
  row: { flexDirection: 'row', minHeight: 52 },
  track: { width: 24, alignItems: 'center' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    borderWidth: 2,
    borderColor: BRAND.border,
  },
  dotDone: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  line: { flex: 1, width: 2, backgroundColor: '#e2e8f0', marginVertical: 2 },
  lineDone: { backgroundColor: BRAND.primaryLight },
  content: { flex: 1, paddingBottom: 12 },
  label: { color: BRAND.muted, fontWeight: '600' },
  labelDone: { color: BRAND.text, fontWeight: '800' },
  time: { marginTop: 2, fontSize: 12, color: BRAND.muted },
});
