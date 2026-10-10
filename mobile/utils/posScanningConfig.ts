export const SCANNING_CONFIG_DEFAULTS = {
  enabled: true,
  allowManualBarcodeEntry: true,
  allowExternalScanner: true,
};

export const mergeScanningConfig = (scanning?: Record<string, unknown> | null) => ({
  ...SCANNING_CONFIG_DEFAULTS,
  ...(scanning || {}),
});

export const isScanningEnabled = (posConfig?: { scanning?: Record<string, unknown> } | null) =>
  mergeScanningConfig(posConfig?.scanning).enabled === true;
