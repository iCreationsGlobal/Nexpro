/** Default barcode/camera scanning settings (on unless a workspace turns it off). */
export const SCANNING_CONFIG_DEFAULTS = {
  enabled: true,
  allowManualBarcodeEntry: true,
  allowExternalScanner: true,
};

/**
 * Merge stored scanning config with defaults.
 * @param {Object} [scanning]
 * @returns {{ enabled: boolean, allowManualBarcodeEntry: boolean, allowExternalScanner: boolean }}
 */
export const mergeScanningConfig = (scanning) => ({
  ...SCANNING_CONFIG_DEFAULTS,
  ...(scanning || {}),
});

/**
 * Whether camera/barcode scanning flows are enabled for the workspace.
 * @param {Object} [posConfig]
 * @returns {boolean}
 */
export const isScanningEnabled = (posConfig) => mergeScanningConfig(posConfig?.scanning).enabled === true;
