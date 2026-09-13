import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  DEFAULT_SCAN_TO_SELL,
  loadScanToSellEnabled,
  saveScanToSellEnabled,
} from '@/utils/scanToSellPreferences';

/**
 * Device-local preference: when true, barcode/QR scans add products directly to cart.
 * Reloaded on focus so a change made in Settings is picked up by an already-mounted
 * tab screen (expo-router keeps tab screens mounted across tab switches).
 */
export function useScanToSell() {
  const [scanToSell, setScanToSellState] = useState(DEFAULT_SCAN_TO_SELL);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadScanToSellEnabled().then((enabled) => {
        if (mounted) {
          setScanToSellState(enabled);
          setIsLoading(false);
        }
      });
      return () => {
        mounted = false;
      };
    }, [])
  );

  const setScanToSell = useCallback((enabled: boolean) => {
    const next = enabled === true;
    setScanToSellState(next);
    void saveScanToSellEnabled(next);
  }, []);

  return { scanToSell, setScanToSell, isLoading };
}
