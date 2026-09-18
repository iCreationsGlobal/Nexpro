import { useEffect, useState } from 'react';

/**
 * Per-view override of a printable document's paper format (A4 / 58mm / 80mm) for preview,
 * print, and download. Never writes back to the tenant's saved print setting — it's a one-time
 * "view/download as..." choice that resets to the saved default whenever `resetKey` changes
 * (e.g. a different invoice/receipt is opened in the same modal).
 *
 * @param {{ format?: string, showLogo?: boolean, fontSize?: string }} [savedConfig] - Tenant's saved print config (e.g. posConfig.print)
 * @param {string|number|null} [resetKey] - Changing this clears the override
 * @returns {{ printConfig: object, format: string, setFormat: (format: string) => void, isOverridden: boolean }}
 */
export function usePrintFormatOverride(savedConfig, resetKey) {
  const [overrideFormat, setOverrideFormat] = useState(null);

  useEffect(() => {
    setOverrideFormat(null);
  }, [resetKey]);

  const baseConfig = savedConfig || { format: 'a4' };
  const format = overrideFormat || baseConfig.format || 'a4';
  const printConfig = overrideFormat ? { ...baseConfig, format: overrideFormat } : baseConfig;

  return {
    printConfig,
    format,
    setFormat: setOverrideFormat,
    isOverridden: Boolean(overrideFormat),
  };
}

export default usePrintFormatOverride;
