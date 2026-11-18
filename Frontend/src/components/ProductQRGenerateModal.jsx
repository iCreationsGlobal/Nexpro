/**
 * ProductQRGenerateModal – QR code and barcode for one product: download them, or print one sticker
 * in the same layout and size as Generate labels (the saved printer profile, 40 × 30 mm by default).
 *
 * Only a saved barcode is printed. A product without one gets a "Create barcode" button that saves a
 * new in-store code first, because the till can only look up codes that are saved on the product.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Package, Download, Printer, Loader2, Barcode as BarcodeIcon } from 'lucide-react';
import QRCode from 'qrcode';
import productService from '../services/productService';
import { buildProductQRPayload } from '../utils/productQR';
import { barcodeFits, barcodePngDataUrl, barcodeSvg, generateInStoreBarcode } from '../utils/barcodeImage';
import { DEFAULT_LABEL_SETTINGS, barcodeAreaWidth, labelDocument, labelTextFor } from '../utils/productLabels';

const fileSlug = (name) => (name || 'product').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();

/** The printer profile saved in Generate labels, for printing this product's single sticker. */
function readPrinterSettings(profileKey) {
  let saved = {};
  try {
    saved = profileKey ? JSON.parse(localStorage.getItem(profileKey) || '{}') : {};
  } catch {
    saved = {};
  }
  const settings = { ...DEFAULT_LABEL_SETTINGS, ...saved, start: 0 };
  // This screen is for codes; a price-only profile still prints the barcode.
  if (settings.design === 'price') settings.design = 'barcode-price';
  return settings;
}

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Object} product - Product (name, sku, barcode, sellingPrice, labelName …)
 * @param {string} [profileKey] - localStorage key of the Generate labels printer profile
 * @param {() => void} [onSaved] - after a new barcode is saved
 */
export default function ProductQRGenerateModal({ open, onClose, product, profileKey, onSaved }) {
  const [barcode, setBarcode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setBarcode(String(product?.barcode || '').trim());
    setError(null);
  }, [product]);

  const productWithCode = useMemo(() => (product ? { ...product, barcode } : null), [product, barcode]);

  useEffect(() => {
    if (!open || !productWithCode?.name) {
      setQrDataUrl(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    QRCode.toDataURL(buildProductQRPayload(productWithCode), { width: 280, margin: 2 })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch((err) => { if (active) setError(err?.message || 'Failed to generate the QR code'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, productWithCode]);

  const barcodeArt = useMemo(() => {
    if (!barcode) return null;
    try {
      return barcodeSvg(barcode);
    } catch {
      return null;
    }
  }, [barcode]);

  const handleCreateBarcode = useCallback(async () => {
    if (!product?.id) return;
    setCreating(true);
    setError(null);
    try {
      // Someone may have added a code since this list loaded; never replace it.
      const fresh = (await productService.getProductById(product.id))?.data;
      const existing = String(fresh?.barcode || '').trim();
      const code = existing || generateInStoreBarcode();
      if (!existing) {
        const saved = await productService.updateProduct(product.id, { barcode: code });
        if (saved?.data?.barcode !== code) throw new Error('The barcode was not saved. Check that you can edit products.');
      }
      setBarcode(code);
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Could not create a barcode.');
    } finally {
      setCreating(false);
    }
  }, [product, onSaved]);

  const handleDownload = useCallback((type) => {
    if (!product?.name) return;
    try {
      const href = type === 'barcode' ? barcodePngDataUrl(barcode) : qrDataUrl;
      if (!href) return;
      const a = document.createElement('a');
      a.href = href;
      a.download = `${type}-${fileSlug(product.name)}.png`;
      a.click();
    } catch (err) {
      setError(err?.message || 'Could not download the code.');
    }
  }, [barcode, product, qrDataUrl]);

  const handlePrintLabel = useCallback(async () => {
    if (!productWithCode || !barcode) return;
    setError(null);
    try {
      const settings = readPrinterSettings(profileKey);
      let image;
      if (settings.design.startsWith('qr')) {
        // Same QR content as Generate labels: barcode lookup keeps the right product in the till.
        image = await QRCode.toDataURL(JSON.stringify({ name: String(productWithCode.name).slice(0, 60), barcode }), { width: 400, margin: 4, errorCorrectionLevel: 'M' });
      } else {
        if (!barcodeArt) throw new Error('This barcode number cannot be printed.');
        if (!barcodeFits(barcodeArt.units, barcodeAreaWidth(settings))) {
          throw new Error(`This barcode needs a sticker wider than ${settings.width} mm. Change the size in Generate labels.`);
        }
        image = barcodeArt.dataUrl;
      }
      const html = labelDocument([{ ...productWithCode, image, labelName: labelTextFor(productWithCode), quantity: 1 }], settings);
      const w = window.open('', '_blank');
      if (!w) {
        setError('Allow pop-ups to open the print preview.');
        return;
      }
      w.opener = null;
      w.document.open();
      w.document.write(html);
      w.document.close();
      Promise.all(Array.from(w.document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))))
        .then(() => { w.focus(); w.print(); });
    } catch (err) {
      setError(err?.message || 'Could not prepare the sticker.');
    }
  }, [barcode, barcodeArt, productWithCode, profileKey]);

  const stickerName = productWithCode ? labelTextFor(productWithCode) : '';
  const printer = readPrinterSettings(profileKey);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:w-[var(--modal-w-sm)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product QR & Barcode
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {product?.name && (
            <div className="p-3 rounded-lg border border-border bg-muted">
              <p className="font-medium">{product.name}</p>
              {stickerName && stickerName !== product.name && (
                <p className="text-sm text-muted-foreground">On the sticker: {stickerName}</p>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <BarcodeIcon className="h-3.5 w-3.5" />
              Barcode
            </div>
            {barcode ? (
              <>
                {barcodeArt ? (
                  <img src={barcodeArt.dataUrl} alt="Barcode" className="h-24 w-full max-w-[280px] rounded border border-gray-200 bg-white" />
                ) : (
                  <p className="text-sm text-red-700">This barcode number cannot be drawn as a barcode.</p>
                )}
                <p className="text-sm tracking-wide text-gray-600">{barcode}</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  This product has no barcode yet. Create one so the till can find it when you scan the sticker.
                </p>
                <Button type="button" onClick={handleCreateBarcode} disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarcodeIcon className="h-4 w-4 mr-2" />}
                  Create barcode
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-sm text-gray-500 mt-2">Generating QR code...</p>
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                QR code
              </div>
              <img src={qrDataUrl} alt="QR code" className="rounded border border-gray-200" width={180} height={180} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 justify-end">
            {qrDataUrl && (
              <SecondaryButton onClick={() => handleDownload('qr')}>
                <Download className="h-4 w-4 mr-2" />
                Download QR
              </SecondaryButton>
            )}
            {barcodeArt && (
              <SecondaryButton onClick={() => handleDownload('barcode')}>
                <Download className="h-4 w-4 mr-2" />
                Download Barcode
              </SecondaryButton>
            )}
            {barcode && (
              <SecondaryButton onClick={handlePrintLabel}>
                <Printer className="h-4 w-4 mr-2" />
                Print sticker
              </SecondaryButton>
            )}
          </div>
          {barcode && (
            <p className="text-xs text-muted-foreground text-right">
              Prints one sticker with your Generate labels printer settings ({printer.width} × {printer.height} mm).
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
