import { useQuery } from '@tanstack/react-query';
import settingsService from '../services/settingsService';
import { mergeScanningConfig, isScanningEnabled, SCANNING_CONFIG_DEFAULTS } from '../utils/posScanningConfig';

const POS_CONFIG_DEFAULTS = {
  receipt: { mode: 'ask', channels: ['sms', 'print'] },
  print: { format: 'a4', showLogo: true, color: true, fontSize: 'normal' },
  customer: { phoneRequired: false, nameRequired: false },
  scanning: SCANNING_CONFIG_DEFAULTS,
};

const DEFAULT_AUTOMATION_COVERAGE = { sms: false, email: false, whatsapp: false };

/**
 * Fetches POS/checkout configuration from settings
 * @returns {{ posConfig: Object, isLoading: boolean }}
 */
export const usePOSConfig = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'pos-config'],
    queryFn: settingsService.getPOSConfig,
    staleTime: 5 * 60 * 1000,
  });

  const posConfig = data?.data
    ? {
        receipt: { ...POS_CONFIG_DEFAULTS.receipt, ...(data.data.receipt || {}) },
        print: { ...POS_CONFIG_DEFAULTS.print, ...(data.data.print || {}) },
        customer: { ...POS_CONFIG_DEFAULTS.customer, ...(data.data.customer || {}) },
        scanning: mergeScanningConfig(data.data.scanning),
        receiptChannelsAvailable: data.data.receiptChannelsAvailable || { sms: false, whatsapp: false, email: false },
        automationReceiptCoverage: {
          ...DEFAULT_AUTOMATION_COVERAGE,
          ...(data.data.automationReceiptCoverage || {}),
        },
      }
    : {
        ...POS_CONFIG_DEFAULTS,
        scanning: mergeScanningConfig(),
        receiptChannelsAvailable: { sms: false, whatsapp: false, email: false },
        automationReceiptCoverage: DEFAULT_AUTOMATION_COVERAGE,
      };

  return { posConfig, isLoading };
};

/**
 * Whether barcode/camera scanning is enabled for the workspace (opt-in).
 * @returns {{ scanningEnabled: boolean, allowExternalScanner: boolean, allowManualBarcodeEntry: boolean, isLoading: boolean }}
 */
export const useScanningEnabled = () => {
  const { posConfig, isLoading } = usePOSConfig();
  const scanning = mergeScanningConfig(posConfig?.scanning);

  return {
    scanningEnabled: isScanningEnabled(posConfig),
    allowExternalScanner: scanning.allowExternalScanner === true,
    allowManualBarcodeEntry: scanning.allowManualBarcodeEntry,
    isLoading,
  };
};
