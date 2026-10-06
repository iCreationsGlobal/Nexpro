import { describe, it, expect } from 'vitest';
import {
  SCANNING_CONFIG_DEFAULTS,
  mergeScanningConfig,
  isScanningEnabled,
} from '../../utils/posScanningConfig';

describe('posScanningConfig', () => {
  it('defaults scanning to enabled', () => {
    expect(SCANNING_CONFIG_DEFAULTS.enabled).toBe(true);
    expect(SCANNING_CONFIG_DEFAULTS.allowManualBarcodeEntry).toBe(true);
    expect(SCANNING_CONFIG_DEFAULTS.allowExternalScanner).toBe(true);
  });

  it('mergeScanningConfig fills missing keys from defaults', () => {
    expect(mergeScanningConfig({ enabled: true })).toEqual({
      enabled: true,
      allowManualBarcodeEntry: true,
      allowExternalScanner: true,
    });
  });

  it('isScanningEnabled is true unless explicitly turned off', () => {
    expect(isScanningEnabled({ scanning: { enabled: false } })).toBe(false);
    expect(isScanningEnabled({ scanning: { enabled: true } })).toBe(true);
    expect(isScanningEnabled({})).toBe(true);
    expect(isScanningEnabled()).toBe(true);
  });
});
