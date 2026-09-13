/**
 * ProductQRGenerateModal – Generate QR + barcode labels for a product,
 * then download or print them as a single label sheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Package, Download, Printer, Loader2, Barcode as BarcodeIcon } from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { buildProductQRPayload } from '../utils/productQR';

const resolveProductBarcodeValue = (product) => {
  const value = product?.barcode || product?.sku || product?.id || product?.name || 'PRODUCT';
  return String(value).trim() || 'PRODUCT';
};

const generateBarcodeDataUrl = (value) => new Promise((resolve, reject) => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 1,
      height: 90,
      margin: 12,
      displayValue: true,
      fontSize: 14,
      background: '#ffffff',
      lineColor: '#111827',
      fontOptions: 'bold',
    });
    resolve(canvas.toDataURL('image/png'));
  } catch (error) {
    reject(error);
  }
});

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Object} product - Product (name, sku, barcode, etc.)
 */
export default function ProductQRGenerateModal({ open, onClose, product }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !product?.name) {
      setQrDataUrl(null);
      setBarcodeDataUrl(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const payload = buildProductQRPayload(product);
    const barcodeValue = resolveProductBarcodeValue(product);

    Promise.all([
      QRCode.toDataURL(payload, { width: 280, margin: 2 }),
      generateBarcodeDataUrl(barcodeValue),
    ])
      .then(([qrUrl, barcodeUrl]) => {
        setQrDataUrl(qrUrl);
        setBarcodeDataUrl(barcodeUrl);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to generate product code label');
        setLoading(false);
      });
  }, [open, product]);

  const handleDownload = useCallback((type) => {
    const imageUrl = type === 'barcode' ? barcodeDataUrl : qrDataUrl;
    if (!imageUrl || !product?.name) return;

    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${type}-${(product.name || 'product').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}.png`;
    a.click();
  }, [barcodeDataUrl, product, qrDataUrl]);

  const handlePrintLabel = useCallback(() => {
    if (!qrDataUrl && !barcodeDataUrl || !product) return;

    const w = window.open('', '_blank');
    if (!w) return;

    const name = product.name || 'Product';
    const sku = product.sku ? `SKU: ${product.sku}` : '';
    const barcodeValue = resolveProductBarcodeValue(product);
    const shouldShowQr = Boolean(qrDataUrl);
    const shouldShowBarcode = Boolean(barcodeDataUrl);

    w.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Label - ${name}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: system-ui, sans-serif;
              padding: 24px;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100dvh;
              background: #fff;
              color: #111827;
            }
            .label {
              width: 320px;
              padding: 20px 18px;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 14px;
            }
            .name {
              font-size: 18px;
              font-weight: 700;
              text-align: center;
              line-height: 1.3;
            }
            .sku {
              font-size: 12px;
              color: #4b5563;
              text-align: center;
            }
            .code-block {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
            }
            img {
              display: block;
              max-width: 100%;
              height: auto;
              border-radius: 8px;
            }
            .barcode-label {
              font-size: 12px;
              letter-spacing: 0.08em;
              color: #374151;
              word-break: break-all;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="name">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${sku ? `<div class="sku">${sku.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            ${shouldShowQr ? `<div class="code-block"><img src="${qrDataUrl}" alt="QR code" width="180" height="180" /></div>` : ''}
            ${shouldShowBarcode ? `<div class="code-block"><img src="${barcodeDataUrl}" alt="Barcode" style="max-width:180px;width:auto;height:auto;" /><div class="barcode-label">${barcodeValue.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>` : ''}
          </div>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.onafterprint = () => w.close();
    }, 300);
  }, [barcodeDataUrl, product, qrDataUrl]);

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
              {product.sku && <p className="text-sm text-gray-500">SKU: {product.sku}</p>}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-sm text-gray-500 mt-2">Generating QR and barcode...</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-5">
              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Package className="h-3.5 w-3.5" />
                    QR code
                  </div>
                  <img src={qrDataUrl} alt="QR code" className="rounded border border-gray-200" width={180} height={180} />
                </div>
              )}

              {barcodeDataUrl && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <BarcodeIcon className="h-3.5 w-3.5" />
                    Barcode
                  </div>
                  <img
                    src={barcodeDataUrl}
                    alt="Barcode"
                    className="rounded border border-gray-200 w-auto h-auto"
                    style={{ maxWidth: 200, maxHeight: 100 }}
                  />
                  <p className="text-xs text-gray-500">{resolveProductBarcodeValue(product)}</p>
                </div>
              )}
            </div>
          )}

          {!loading && (qrDataUrl || barcodeDataUrl) && (
            <div className="flex flex-wrap gap-2 justify-end">
              {qrDataUrl && (
                <SecondaryButton onClick={() => handleDownload('qr')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download QR
                </SecondaryButton>
              )}
              {barcodeDataUrl && (
                <SecondaryButton onClick={() => handleDownload('barcode')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Barcode
                </SecondaryButton>
              )}
              <SecondaryButton onClick={handlePrintLabel}>
                <Printer className="h-4 w-4 mr-2" />
                Print label
              </SecondaryButton>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
