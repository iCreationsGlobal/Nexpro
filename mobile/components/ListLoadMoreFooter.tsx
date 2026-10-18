import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  isLoadingMore: boolean;
  /** The last "load more" failed. */
  isError: boolean;
  onRetry: () => void;
  color: string;
};

/** FlatList footer for lists that load more as they scroll (see useInfiniteList). */
export function ListLoadMoreFooter({ isLoadingMore, isError, onRetry, color }: Props) {
  if (isLoadingMore) return <ActivityIndicator color={color} style={styles.spacing} />;
  if (isError) {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry}>
        <Text style={[styles.spacing, styles.retry, { color }]}>Could not load more. Tap to retry.</Text>
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  spacing: { padding: 16 },
  retry: { textAlign: 'center' },
});

export default ListLoadMoreFooter;
