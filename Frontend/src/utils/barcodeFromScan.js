/**
 * The barcode number from a camera scan. Our own QR labels hold JSON with the barcode inside.
 * @param {string} text
 * @returns {string} '' when a QR label has no barcode
 */
export function barcodeFromScan(text) {
  const code = String(text ?? '').trim();
  if (!code.startsWith('{')) return code;
  try {
    const data = JSON.parse(code);
    return String(data?.barcode ?? data?.product?.barcode ?? '').trim();
  } catch {
    return code;
  }
}
