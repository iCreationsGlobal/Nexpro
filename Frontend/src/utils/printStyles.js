/**
 * Resolve print/preview sizing for a printable document (invoice, receipt) based on the
 * workspace's configured paper format (A4 or thermal receipt roll widths).
 * Shared by PrintableInvoice and PrintableReceipt so the three formats stay in sync.
 * @param {{ format?: 'a4'|'thermal_58'|'thermal_80', showLogo?: boolean, fontSize?: 'normal'|'small' }} printConfig
 */
export const getPrintStyles = (printConfig) => {
  const format = printConfig?.format || 'a4';
  const isThermal = format === 'thermal_58' || format === 'thermal_80';
  const pageWidth = format === 'thermal_58' ? '58mm' : format === 'thermal_80' ? '80mm' : 'A4';
  const contentWidth = format === 'thermal_58' ? '52mm' : format === 'thermal_80' ? '72mm' : '210mm';
  // Logo shows on every format (A4, 58mm, 80mm) unless the tenant explicitly turned it off.
  const showLogo = printConfig?.showLogo !== false;
  const fontSize = isThermal ? 'small' : (printConfig?.fontSize || 'normal');
  const titleSize = fontSize === 'small' ? '14px' : '32px';
  const bodySize = fontSize === 'small' ? '10px' : '12px';
  const tableSize = fontSize === 'small' ? '9px' : '11px';
  const grayscale = isThermal ? 'filter: grayscale(100%); -webkit-print-color-adjust: none; print-color-adjust: none;' : '';

  return { format, isThermal, showLogo, titleSize, bodySize, tableSize, grayscale, pageWidth, contentWidth, fontSize };
};

/**
 * Content width in millimetres (numeric), for callers that need to size a canvas/PDF
 * rather than apply CSS (e.g. html2pdf export). Mirrors the contentWidth used on screen.
 * @param {{ format?: 'a4'|'thermal_58'|'thermal_80' }} printConfig
 * @returns {number}
 */
export const getContentWidthMm = (printConfig) => {
  const format = printConfig?.format || 'a4';
  if (format === 'thermal_58') return 52;
  if (format === 'thermal_80') return 72;
  return 190;
};
