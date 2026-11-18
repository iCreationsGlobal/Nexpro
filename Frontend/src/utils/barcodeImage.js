import JsBarcode from 'jsbarcode';

/** Blank space kept on each side of the bars (in bar widths), so scanners can find the start and end. */
export const BARCODE_QUIET_ZONE_MODULES = 10;

/** Thinnest bar most scanners and phone cameras read reliably. */
export const MIN_BARCODE_MODULE_MM = 0.25;

/** @param {string} code 13 digits */
export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/**
 * A new 13-digit in-store barcode (EAN-13 with the 20 prefix, which is set aside for codes a shop
 * makes for itself). EAN-13 prints with wider bars than the same digits in CODE128.
 * @returns {string}
 */
export function generateInStoreBarcode() {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  const body = `20${String(bytes[0] % 100000).padStart(5, '0')}${String(bytes[1] % 100000).padStart(5, '0')}`;
  const sum = body.split('').map(Number).reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

const barcodeFormat = (code) => (isValidEan13(code) ? 'EAN13' : 'CODE128');

/**
 * The barcode as a stretchable SVG image for printing: vector bars stay sharp at any printer
 * resolution and stretch to fill the space on the sticker.
 * @param {string} value
 * @returns {{ dataUrl: string, units: number }} units = bar widths across, including the quiet zones
 */
export function barcodeSvg(value) {
  const code = String(value ?? '').trim();
  if (!code) throw new Error('No barcode number.');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: barcodeFormat(code),
    flat: true,
    width: 1,
    height: 40,
    margin: 0,
    marginLeft: BARCODE_QUIET_ZONE_MODULES,
    marginRight: BARCODE_QUIET_ZONE_MODULES,
    displayValue: false,
    background: '#ffffff',
    lineColor: '#000000',
  });
  const viewBoxWidth = Number(String(svg.getAttribute('viewBox') || '').split(/\s+/)[2]);
  const units = viewBoxWidth || parseFloat(svg.getAttribute('width')) || 0;
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const markup = new XMLSerializer().serializeToString(svg);
  return { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`, units };
}

/**
 * Whether bars of this barcode are thick enough when it fills `widthMm` (quiet zones included).
 * @param {number} units from barcodeSvg
 * @param {number} widthMm
 */
export function barcodeFits(units, widthMm) {
  return units > 0 && widthMm / units >= MIN_BARCODE_MODULE_MM;
}

/**
 * A large PNG of the barcode with its number underneath, for downloading.
 * @param {string} value
 * @returns {string} data URL
 */
export function barcodePngDataUrl(value) {
  const code = String(value ?? '').trim();
  if (!code) throw new Error('No barcode number.');
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, {
    format: barcodeFormat(code),
    flat: true,
    width: 4,
    height: 160,
    margin: 40,
    displayValue: true,
    fontSize: 32,
    background: '#ffffff',
    lineColor: '#000000',
  });
  return canvas.toDataURL('image/png');
}
