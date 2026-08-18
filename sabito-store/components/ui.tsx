import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { BRAND } from '@/constants';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      style={[styles.primaryBtn, (disabled || loading) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      style={[styles.secondaryBtn, (disabled || loading) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color={BRAND.text} /> : <Text style={styles.secondaryBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.retryBtn} onPress={onAction}>
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {onRetry ? (
        <Pressable
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try loading again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={BRAND.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ListSkeleton({ rows = 4, label = 'Loading content...' }: { rows?: number; label?: string }) {
  return (
    <View style={styles.skeletonWrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonThumb} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  primaryBtn: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: BRAND.text, fontWeight: '600', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: BRAND.text },
  emptyMessage: { marginTop: 8, color: BRAND.muted, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BRAND.primary,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  loading: { padding: 40, alignItems: 'center', gap: 10 },
  loadingText: { color: BRAND.muted },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: BRAND.text, marginBottom: 12 },
  skeletonWrap: { padding: 16, gap: 10 },
  skeletonCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
  },
  skeletonThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#e2e8f0' },
  skeletonContent: { flex: 1, justifyContent: 'center', gap: 8 },
  skeletonLineWide: { height: 14, width: '75%', borderRadius: 7, backgroundColor: '#e2e8f0' },
  skeletonLine: { height: 12, width: '55%', borderRadius: 6, backgroundColor: '#f1f5f9' },
  skeletonLineShort: { height: 10, width: '35%', borderRadius: 5, backgroundColor: '#f1f5f9' },
});
