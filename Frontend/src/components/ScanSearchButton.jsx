import { lazy, Suspense, useState } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScanningEnabled } from '../hooks/usePOSConfig';
import { barcodeFromScan } from '../utils/barcodeFromScan';
import { showError } from '../utils/toast';

// The till's camera scanner (shop barcodes and our QR labels), loaded only when tapped.
const CameraScanner = lazy(() => import('./pos/POSProductSearch').then((module) => ({ default: module.QRCodeScanner })));

/**
 * A camera button for the inside of a product search box: one scan puts the code in the box
 * (for one of our QR labels, the barcode inside it). Not shown when the business has switched
 * barcode & camera scanning off (Settings → Inventory).
 * @param {object} props
 * @param {(code: string) => void} props.onCode
 * @param {string} [props.className] - placement inside the box (usually absolute, right)
 */
export default function ScanSearchButton({ onCode, className }) {
  const { scanningEnabled } = useScanningEnabled();
  const [open, setOpen] = useState(false);
  if (!scanningEnabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Scan a barcode to search"
        title="Scan a barcode to search"
        className={cn('flex h-9 w-9 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', className)}
      >
        <Camera className="h-4 w-4" />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <CameraScanner
            isOpen
            cameraEnabled
            onScan={(text) => {
              const code = barcodeFromScan(text);
              if (code) onCode(code);
              else showError('That QR code has no barcode number. Scan the barcode instead.');
            }}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
