/**
 * Device-local scan-to-sell preference (mobile POS).
 * When enabled, camera/barcode scans add matched products directly to the cart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCAN_TO_SELL_STORAGE_KEY = 'scanToSellEnabled';

export const DEFAULT_SCAN_TO_SELL = false;

export function parseScanToSellEnabled(raw: unknown): boolean {
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return DEFAULT_SCAN_TO_SELL;
}

export async function loadScanToSellEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_TO_SELL_STORAGE_KEY);
    if (raw == null) return DEFAULT_SCAN_TO_SELL;
    return parseScanToSellEnabled(raw);
  } catch {
    return DEFAULT_SCAN_TO_SELL;
  }
}

export async function saveScanToSellEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SCAN_TO_SELL_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore storage failures */
  }
}
