import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** True while this screen is the one on display (tabs keep hidden screens mounted). */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  return focused;
}

/**
 * Refresh a query when its screen comes back into view, but only if the data is older than
 * `minAgeMs` — so switching tabs back and forth doesn't fire a request every time.
 */
export function useRefetchOnFocus(
  query: { dataUpdatedAt: number; refetch: () => unknown },
  minAgeMs = 30 * 1000
) {
  const { dataUpdatedAt, refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (dataUpdatedAt && Date.now() - dataUpdatedAt > minAgeMs) void refetch();
    }, [dataUpdatedAt, minAgeMs, refetch])
  );
}
