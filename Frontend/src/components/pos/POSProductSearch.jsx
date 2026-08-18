/**
 * POSProductSearch Component
 *
 * Product search with text input, barcode and QR scanner.
 * Scan barcode at POS for products that have one; use Generate QR (Products) for items without a barcode.
 * Uses html5-qrcode. Optimized for offline using cached products.
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { Search, Camera, X, Package, AlertCircle, Loader2, List, LayoutGrid, Plus, Minus, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebounce } from '../../hooks/useDebounce';
import { useResponsive } from '../../hooks/useResponsive';
import { DEBOUNCE_DELAYS } from '../../constants';
import { formatAmount } from '../../utils/formatNumber';
import { getProductStockQuantity, getCatalogUnitPrice } from '../../utils/productStock';
import { parseProductQRPayload } from '../../utils/productQR';
import { resolveImageUrl } from '../../utils/fileUtils';
import { getPosProductDisplayName } from '../../utils/posProductDisplayName';
import api from '../../services/api';

/**
 * Retail vs dealer price display for POS product tiles.
 */
const ProductPriceDisplay = memo(function ProductPriceDisplay({
  product,
  dealerPrice,
  className,
}) {
  const retail = Number(getCatalogUnitPrice(product));
  const dealerUnit = dealerPrice?.unitPrice != null ? Number(dealerPrice.unitPrice) : null;
  const showDealer = dealerUnit != null && Number.isFinite(dealerUnit);
  const retailDiffers = showDealer
    && Number.isFinite(retail)
    && Math.abs(retail - dealerUnit) > 0.001;

  if (showDealer) {
    return (
      <div className={cn(className)}>
        <p className="font-semibold text-green-700 text-sm">
          {formatAmount(dealerUnit)}
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-green-800/80">
            Dealer
          </span>
        </p>
        {retailDiffers && (
          <p className="text-xs text-muted-foreground">
            <span className="line-through">{formatAmount(retail)}</span>
            <span className="ml-1">Retail</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <p className={cn('font-semibold text-green-700', className)}>
      {formatAmount(retail)}
    </p>
  );
});

/**
 * Inline +/- stepper for products already in cart (touch-friendly on tablet/mobile).
 */
const CartQuantityStepper = memo(function CartQuantityStepper({
  quantity,
  onAdjustQuantity,
  compact = false,
}) {
  const buttonClass = compact
    ? 'h-10 w-10 min-h-[40px] min-w-[40px]'
    : 'h-11 w-11 min-h-[44px] min-w-[44px]';

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[#166534] bg-[#166534] text-white font-semibold p-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="group"
      aria-label={`Quantity ${quantity}`}
    >
      <button
        type="button"
        className={`${buttonClass} flex items-center justify-center rounded-full bg-[#14532d] hover:bg-[#134e28] transition-colors`}
        onClick={(e) => {
          e.stopPropagation();
          onAdjustQuantity(-1);
        }}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className={`text-center font-semibold ${compact ? 'min-w-[1.5rem] text-sm px-0.5' : 'min-w-[1.75rem] text-sm px-1'}`}>
        {quantity}
      </span>
      <button
        type="button"
        className={`${buttonClass} flex items-center justify-center rounded-full bg-white text-[#166534] hover:bg-green-50 transition-colors`}
        onClick={(e) => {
          e.stopPropagation();
          onAdjustQuantity(1);
        }}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
});

/**
 * Product search result item
 */
const ProductItem = memo(function ProductItem({
  product,
  onSelect,
  quantityInCart = 0,
  onAdjustQuantity,
  showQuantityControls = false,
  dealerPrice = null,
}) {
  const trackStock = product.trackStock !== false;
  const quantityOnHand = getProductStockQuantity(product);
  const reorderLevel = Number(product.reorderLevel);
  const reorder = Number.isFinite(reorderLevel) ? reorderLevel : 5;
  const isLowStock = trackStock && quantityOnHand <= reorder;
  const isOutOfStock = trackStock && quantityOnHand <= 0;
  const inCart = quantityInCart > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border',
            isOutOfStock
              ? 'bg-muted opacity-60 cursor-not-allowed border-muted'
              : inCart
                ? 'bg-green-50 border-green-300 hover:bg-green-100'
                : 'border-transparent hover:bg-green-50 hover:border-green-200'
          )}
          onClick={() => !isOutOfStock && onSelect(product)}
        >
      {/* Product image or placeholder - square */}
      <div className="w-14 aspect-square bg-muted rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-muted pointer-events-none" aria-hidden>
          <Package className="h-6 w-6 text-muted-foreground" />
        </div>
        {product.imageUrl && (
          <img
            src={resolveImageUrl(product.imageUrl) || ''}
            alt={getPosProductDisplayName(product)}
            className="relative z-10 w-full h-full object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {inCart && !showQuantityControls && (
          <span className="absolute -top-1 -right-1 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white font-medium">
            <Plus className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Product details */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{getPosProductDisplayName(product)}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>SKU: {product.sku}</span>
          {product.barcode && (
            <>
              <Circle className="h-1.5 w-1.5 shrink-0" />
              <span>{product.barcode}</span>
            </>
          )}
        </div>
      </div>

      {/* Stock and price */}
      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
        {inCart && showQuantityControls && onAdjustQuantity ? (
          <CartQuantityStepper
            quantity={quantityInCart}
            onAdjustQuantity={onAdjustQuantity}
            compact
          />
        ) : inCart ? (
          <Badge className="text-sm py-1.5 px-3 bg-brand text-white border-0 gap-1.5 min-h-[32px]">
            <Plus className="h-4 w-4" />
            {quantityInCart}
          </Badge>
        ) : null}
        <ProductPriceDisplay product={product} dealerPrice={dealerPrice} />
        <div className="flex items-center gap-1 justify-end">
          {!trackStock ? (
            <span className="text-xs text-muted-foreground">Made to order</span>
          ) : isOutOfStock ? (
            <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
          ) : isLowStock ? (
            <Badge variant="warning" className="text-xs bg-yellow-100 text-yellow-700">
              Low: {quantityOnHand}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              Stock: {quantityOnHand}
            </span>
          )}
        </div>
      </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{isOutOfStock ? 'Out of stock' : 'Add to sale'}</TooltipContent>
    </Tooltip>
  );
});

/**
 * Product card for grid view
 */
const ProductCard = memo(function ProductCard({
  product,
  onSelect,
  quantityInCart = 0,
  onAdjustQuantity,
  showQuantityControls = false,
  dealerPrice = null,
}) {
  const trackStock = product.trackStock !== false;
  const quantityOnHand = getProductStockQuantity(product);
  const reorderLevel = Number(product.reorderLevel);
  const reorder = Number.isFinite(reorderLevel) ? reorderLevel : 5;
  const isLowStock = trackStock && quantityOnHand <= reorder;
  const isOutOfStock = trackStock && quantityOnHand <= 0;
  const inCart = quantityInCart > 0;
  const displayName = getPosProductDisplayName(product);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'rounded-lg border p-3 flex flex-col transition-colors cursor-pointer relative',
            isOutOfStock
              ? 'border-muted bg-muted opacity-60 cursor-not-allowed'
              : inCart
                ? 'border-green-300 bg-green-50'
                : 'border-border hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/30'
          )}
          onClick={() => !isOutOfStock && onSelect(product)}
        >
      {inCart && (
        <div className="absolute top-2 right-2 z-20">
          {showQuantityControls && onAdjustQuantity ? (
            <CartQuantityStepper
              quantity={quantityInCart}
              onAdjustQuantity={onAdjustQuantity}
            />
          ) : (
            <div className="flex h-9 min-w-[36px] items-center justify-center gap-1 rounded-full bg-brand px-2.5 text-white text-sm font-semibold">
              <Plus className="h-4 w-4" />
              {quantityInCart}
            </div>
          )}
        </div>
      )}
      <div className="w-full h-28 sm:h-32 bg-muted rounded-md flex items-center justify-center flex-shrink-0 mb-2 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-muted pointer-events-none" aria-hidden>
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        {product.imageUrl && (
          <img
            src={resolveImageUrl(product.imageUrl) || ''}
            alt={displayName}
            className="relative z-10 w-full h-full object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
      <p className="font-medium text-foreground text-sm leading-5 line-clamp-2 min-h-[2.5rem] shrink-0" title={displayName}>
        {displayName}
      </p>
      <ProductPriceDisplay product={product} dealerPrice={dealerPrice} className="mt-1 text-left shrink-0" />
      <div className="mt-1.5 shrink-0">
        {!trackStock ? (
          <span className="text-xs text-muted-foreground">Made to order</span>
        ) : isOutOfStock ? (
          <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
        ) : isLowStock ? (
          <Badge className="text-xs bg-yellow-100 text-yellow-700 border-0">Low: {quantityOnHand}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Stock: {quantityOnHand}</span>
        )}
      </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{isOutOfStock ? 'Out of stock' : 'Add to sale'}</TooltipContent>
    </Tooltip>
  );
});

/**
 * Scanner component (barcode + QR) using html5-qrcode.
 * Supports product barcodes (EAN-13, UPC-A, etc.) and product QR codes (JSON).
 * Continuous mode for scanning multiple items.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether scanner is open
 * @param {function} props.onClose - Called to close scanner
 * @param {function} props.onScan - Called with decoded text (barcode string or QR JSON)
 * @param {boolean} props.continuousMode - If true, keeps scanning after each scan
 * @param {number} props.scannedCount - Number of items already scanned (for display)
 * @param {string} props.lastScannedItem - Name of last scanned item (for display)
 * @param {boolean} [props.cameraEnabled] - When false, camera UI is not mounted
 */
const QRCodeScanner = ({
  isOpen,
  onClose,
  onScan,
  continuousMode = false,
  scannedCount = 0,
  lastScannedItem = null,
  onDone,
  cameraEnabled = true,
}) => {
  const { isMobile } = useResponsive();
  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);
  const scannerStartedRef = useRef(false);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hasStarted, setHasStarted] = useState(false); // Track if user clicked start button
  const [lastScannedQR, setLastScannedQR] = useState(null);
  const lastScannedQRRef = useRef(null);
  const scanCooldownRef = useRef(false);

  // Reset states when scanner closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setPermissionDenied(false);
      setLastScannedQR(null);
      lastScannedQRRef.current = null;
      setHasStarted(false);
      scannerStartedRef.current = false;
      html5QrcodeRef.current = null;
    }
  }, [isOpen]);

  // Handle starting the scanner (called by button click - user gesture required for permission)
  const handleStartScanner = useCallback(async () => {
    console.log('[SCANNER] ========== START SCAN BUTTON CLICKED ==========');
    console.log('[SCANNER] Timestamp:', new Date().toISOString());
    console.log('[SCANNER] User Agent:', navigator.userAgent);
    console.log('[SCANNER] Current URL:', window.location.href);
    console.log('[SCANNER] Has Started:', hasStarted, 'Is Starting:', isStarting);
    
    if (hasStarted || isStarting) {
      console.log('[SCANNER] Already started or starting, ignoring click');
      return;
    }
    
    // Check if we're in a secure context (required for camera access on mobile)
    // Browsers (especially iOS Chrome/Safari) only expose camera over HTTPS or localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isSecure = window.isSecureContext;
    
    console.log('[SCANNER] Security Check:', {
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      isLocalhost,
      isSecure
    });
    
    if (!isSecure && !isLocalhost) {
      console.error('[SCANNER] ❌ Not in secure context - camera blocked by browser');
      setError('Camera access requires HTTPS on this device. Please open the app via https:// or use localhost for testing.');
      return;
    }

    // Check if mediaDevices API is available
    // On some mobile browsers, mediaDevices might not be immediately available
    // Try multiple ways to access getUserMedia (modern and legacy APIs)
    const hasMediaDevices = !!(navigator.mediaDevices?.getUserMedia || 
                              navigator.getUserMedia || 
                              navigator.webkitGetUserMedia || 
                              navigator.mozGetUserMedia ||
                              navigator.msGetUserMedia);
    
    console.log('[SCANNER] MediaDevices API Check:', {
      hasMediaDevices,
      'navigator.mediaDevices': !!navigator.mediaDevices,
      'navigator.mediaDevices.getUserMedia': !!navigator.mediaDevices?.getUserMedia,
      'navigator.getUserMedia': !!navigator.getUserMedia,
      'navigator.webkitGetUserMedia': !!navigator.webkitGetUserMedia,
      'navigator.mozGetUserMedia': !!navigator.mozGetUserMedia
    });
    
    if (!hasMediaDevices) {
      // Don't block - html5-qrcode will handle the API detection and show appropriate errors
      // Some browsers might have the API but it's not detectable this way
      console.warn('[SCANNER] ⚠️ getUserMedia API not detected, but proceeding - html5-qrcode will handle it');
    }
    
    setHasStarted(true);
    setIsStarting(true);
    setError(null);
    setPermissionDenied(false);
    setLastScannedQR(null);

    let mounted = true;

    const startScanner = async function startScanner() {
      try {
        // Check permission status first (if API is available)
        // This helps us know if permission was previously denied
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            if (permissionStatus.state === 'denied') {
              if (mounted) {
                setPermissionDenied(true);
                setError('Camera permission was denied. Please enable camera access in your browser settings and refresh the page.');
                setIsStarting(false);
                setHasStarted(false);
              }
              return;
            }
          } catch (permQueryErr) {
            // Permissions API might not support 'camera' query on some browsers (e.g., iOS Safari)
            // Continue to try starting the scanner - it will trigger the permission prompt
            console.log('Permissions API not available, proceeding with scanner start');
          }
        }

        // Dynamically import html5-qrcode (QR + barcode support)
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!mounted) return;

        // Don't set formatsToSupport - let library scan all formats for best barcode/QR detection on web
        const html5Qrcode = new Html5Qrcode('pos-qr-scanner');
        html5QrcodeRef.current = html5Qrcode;
        // Don't set scannerStartedRef yet - only set it after successful start

        // Let html5-qrcode handle the permission request directly
        // This will trigger the browser's permission prompt on mobile devices
        // The prompt should appear when start() is called (triggered by user button click)
        // html5-qrcode internally uses getUserMedia which will trigger the permission prompt
        
        // Try to start with back camera first, then fallback to any available camera
        let cameraConfig = { facingMode: 'environment' };
        let startAttempted = false;
        
        // Scan config: no qrbox = scan full frame (better for barcodes on web).
        // Square viewfinder limits barcode detection; full frame improves EAN/UPC/QR scanning.
        const scanConfig = {
          fps: 15,
          aspectRatio: 1.0,
          // Omit qrbox to scan entire video frame - barcodes are rectangular and
          // BarcodeDetector/Zxing work better with full-frame on desktop browsers
        };
        
        try {
          // First attempt: back camera
          console.log('[SCANNER] Attempting to start camera (full-frame scan for QR + barcode):', scanConfig);
          await html5Qrcode.start(
            cameraConfig,
            scanConfig,
          (decodedText) => {
            if (scanCooldownRef.current) return;
            if (continuousMode && decodedText === lastScannedQRRef.current) return;

            scanCooldownRef.current = true;
            lastScannedQRRef.current = decodedText;
            setLastScannedQR(decodedText);

            try {
              const audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
              oscillator.connect(audioContext.destination);
              oscillator.start();
              oscillator.stop(audioContext.currentTime + 0.1);
            } catch (audioErr) {
              console.warn('Audio feedback failed:', audioErr);
            }

            if (navigator.vibrate) navigator.vibrate(100);

            console.log('[SCANNER] ✅ QR code scanned:', decodedText);
            onScan(decodedText);

            if (continuousMode) {
              setTimeout(() => { scanCooldownRef.current = false; }, 1500);
            } else {
              onClose();
            }
          },
          () => {}
          );
          console.log('[SCANNER] ✅ Back camera started successfully!');
          startAttempted = true;
        } catch (backCameraErr) {
          console.warn('[SCANNER] ⚠️ Back camera failed:', {
            error: backCameraErr.message,
            name: backCameraErr.name,
            stack: backCameraErr.stack
          });
            console.log('[SCANNER] Attempting front camera...');
          try {
            await html5Qrcode.start(
              { facingMode: 'user' },
              scanConfig,
              (decodedText) => {
                if (scanCooldownRef.current) return;
                if (continuousMode && decodedText === lastScannedQRRef.current) return;

                scanCooldownRef.current = true;
                lastScannedQRRef.current = decodedText;
                setLastScannedQR(decodedText);

                // Play beep sound on successful scan
                try {
                  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                  const oscillator = audioContext.createOscillator();
                  oscillator.type = 'sine';
                  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                  oscillator.connect(audioContext.destination);
                  oscillator.start();
                  oscillator.stop(audioContext.currentTime + 0.1);
                } catch (audioErr) {
                  console.warn('Audio feedback failed:', audioErr);
                }

                // Vibrate on mobile devices
                if (navigator.vibrate) {
                  navigator.vibrate(100);
                }

                onScan(decodedText);

                if (continuousMode) {
                  // In continuous mode, keep scanning but with cooldown
                  setTimeout(() => {
                    scanCooldownRef.current = false;
                  }, 1500); // 1.5 second cooldown between scans
                } else {
                  // In single mode, close after scan
                  onClose();
                }
              },
              () => {
                // QR code scan failure - ignore, keep scanning
              }
            );
            console.log('[SCANNER] ✅ Front camera started successfully!');
            startAttempted = true;
          } catch (frontCameraErr) {
            // If both fail, try first available camera by ID (html5-qrcode does not accept boolean)
            console.warn('[SCANNER] ⚠️ Front camera also failed:', {
              error: frontCameraErr.message,
              name: frontCameraErr.name,
              stack: frontCameraErr.stack
            });
            console.log('[SCANNER] Attempting first available camera via getCameras()...');
            try {
              const cameras = await Html5Qrcode.getCameras();
              if (cameras && cameras.length > 0) {
                const firstCameraId = cameras[0].id;
                console.log('[SCANNER] Using first camera:', cameras[0].label || firstCameraId);
                await html5Qrcode.start(
                  firstCameraId,
                  scanConfig,
                  (decodedText) => {
                    if (scanCooldownRef.current) return;
                    if (continuousMode && decodedText === lastScannedQRRef.current) return;
                    scanCooldownRef.current = true;
                    lastScannedQRRef.current = decodedText;
                    setLastScannedQR(decodedText);
                    try {
                      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                      const oscillator = audioContext.createOscillator();
                      oscillator.type = 'sine';
                      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                      oscillator.connect(audioContext.destination);
                      oscillator.start();
                      oscillator.stop(audioContext.currentTime + 0.1);
                    } catch (audioErr) {
                      console.warn('Audio feedback failed:', audioErr);
                    }
                    if (navigator.vibrate) navigator.vibrate(100);
                    onScan(decodedText);
                    if (continuousMode) {
                      setTimeout(() => { scanCooldownRef.current = false; }, 1500);
                    } else {
                      onClose();
                    }
                  },
                  () => {}
                );
                console.log('[SCANNER] ✅ First available camera started successfully!');
                startAttempted = true;
              } else {
                throw new Error('No cameras found. Please check camera permissions.');
              }
            } catch (defaultCameraErr) {
              console.error('[SCANNER] ❌ All camera attempts failed:', {
                error: defaultCameraErr.message,
                name: defaultCameraErr.name,
                stack: defaultCameraErr.stack
              });
              throw defaultCameraErr;
            }
          }
        }

        // Only mark as started after successful initialization
        if (mounted && startAttempted) {
          console.log('[SCANNER] ✅ Scanner started successfully!');
          scannerStartedRef.current = true;
          setIsStarting(false);
          
          // Log success to backend
          try {
            await api.post('/scan-logs', {
              event: 'scanner_started',
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent,
              url: window.location.href,
              success: true,
              cameraConfig: { facingMode: 'environment' }
            });
          } catch (logErr) {
            console.warn('[SCANNER] Failed to log to backend:', logErr);
          }
        }
      } catch (err) {
        // Extract all possible error information before any processing
        const errorName = err?.name || err?.constructor?.name || 'UnknownError';
        let errorMessage = '';
        try {
          errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
        } catch (e) {
          errorMessage = 'Error object could not be converted to string';
        }
        const errorString = errorMessage.toLowerCase();
        const errorStack = err?.stack || 'No stack trace available';
        
        // Try to extract all error properties
        const errorDetails = {
          name: errorName,
          message: errorMessage,
          stack: errorStack
        };
        
        // Try to get additional properties from error object
        if (err && typeof err === 'object') {
          try {
            if (err.code !== undefined) errorDetails.code = err.code;
            if (err.constraint !== undefined) errorDetails.constraint = err.constraint;
            if (err.constraintName !== undefined) errorDetails.constraintName = err.constraintName;
            // Try to get all enumerable properties
            Object.keys(err).forEach(key => {
              try {
                const value = err[key];
                if (value !== undefined && typeof value !== 'function') {
                  errorDetails[key] = typeof value === 'object' ? JSON.stringify(value) : value;
                }
              } catch (e) {
                // Skip properties that can't be accessed
              }
            });
          } catch (e) {
            console.warn('[SCANNER] Could not extract all error properties:', e);
          }
        }
        
        console.error('[SCANNER] ❌ Failed to start QR scanner:', {
          errorName,
          errorMessage,
          errorString,
          errorStack,
          errorDetails,
          rawError: err
        });
        
        scannerStartedRef.current = false;
        if (mounted) {
          
          const isPermissionError = 
            errorName === 'NotAllowedError' || 
            errorName === 'PermissionDeniedError' ||
            errorString.includes('permission') ||
            errorString.includes('not allowed') ||
            errorString.includes('denied') ||
            errorString.includes('user denied');
          
          const isDeviceError = 
            errorName === 'NotFoundError' ||
            errorName === 'DevicesNotFoundError' ||
            errorString.includes('no camera') ||
            errorString.includes('device not found') ||
            errorString.includes('no devices found');
          
          const isInUseError = 
            errorName === 'NotReadableError' ||
            errorName === 'TrackStartError' ||
            errorString.includes('in use') ||
            errorString.includes('already in use') ||
            errorString.includes('could not start') ||
            errorString.includes('could not access');
          
          const isConstraintError = 
            errorName === 'OverconstrainedError' ||
            errorName === 'ConstraintNotSatisfiedError' ||
            errorString.includes('constraint') ||
            errorString.includes('not satisfied');
          
          if (isPermissionError) {
            setPermissionDenied(true);
            setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
          } else if (isDeviceError) {
            setError('No camera found. Please make sure your device has a camera and try again.');
          } else if (isInUseError) {
            setError('Camera is in use by another app. Please close other apps using the camera and try again.');
          } else if (isConstraintError) {
            setError('Camera configuration error. Your device may not support the required camera settings.');
          } else {
            // Show more detailed error message
            const detailedError = errorMessage || 'Failed to access camera';
            setError(`Camera error: ${detailedError}. Please check your camera permissions and try again.`);
          }
          setIsStarting(false);
          setHasStarted(false);
          
          // Log error to backend - use the already extracted error details
          try {
            console.log('[SCANNER] Preparing error log for backend:', {
              errorName,
              errorMessage,
              errorDetails
            });
            
            await api.post('/scan-logs', {
              event: 'scanner_start_failed',
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent,
              url: window.location.href,
              success: false,
              error: errorDetails,
              errorName: errorName,
              errorMessage: errorMessage,
              errorString: errorMessage,
              errorStack: errorStack,
              isPermissionError,
              isDeviceError,
              isInUseError,
              isConstraintError,
              // Additional context
              hasMediaDevices: !!(navigator.mediaDevices?.getUserMedia),
              isSecureContext: window.isSecureContext,
              protocol: window.location.protocol,
              hostname: window.location.hostname
            });
          } catch (logErr) {
            console.warn('[SCANNER] Failed to log error to backend:', logErr);
          }
        }
      }
    };

    startScanner();
  }, [hasStarted, isStarting, continuousMode, onScan, onClose]);

  // Auto-start scanner when dialog opens
  useEffect(() => {
    if (!cameraEnabled) return undefined;
    if (isOpen && !hasStarted && !isStarting && !error) {
      const timer = setTimeout(() => {
        handleStartScanner();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hasStarted, isStarting, error, handleStartScanner, cameraEnabled]);

  // Cleanup when component unmounts or scanner closes
  useEffect(() => {
    if (!isOpen) {
      console.log('[SCANNER] Scanner closed, cleaning up...');
      // Scanner is closed, clean up if it was running
      scanCooldownRef.current = false;
      
      if (html5QrcodeRef.current && scannerStartedRef.current) {
        console.log('[SCANNER] Stopping scanner...');
        // Only try to stop if scanner actually started successfully
        const scanner = html5QrcodeRef.current;
        
        // Silently stop and clear without throwing errors
        // Wrap in try-catch to prevent any errors from propagating
        try {
          const stopPromise = scanner.stop();
          if (stopPromise && typeof stopPromise.catch === 'function') {
            stopPromise.catch(() => {
              // Silently ignore all stop errors (including "cannot stop" errors)
            });
          }
        } catch (err) {
          // Silently ignore all stop errors (including "cannot stop" errors)
        }
        
        try {
          const clearPromise = scanner.clear();
          if (clearPromise && typeof clearPromise.catch === 'function') {
            clearPromise.catch(() => {
              // Silently ignore all clear errors
            });
          }
        } catch (err) {
          // Silently ignore all clear errors
        }
      }
      
      // Always reset refs
      html5QrcodeRef.current = null;
      scannerStartedRef.current = false;
    }
    
    // Cleanup on unmount - completely suppress all errors
    return () => {
      console.log('[SCANNER] Component unmounting, cleaning up...');
      scanCooldownRef.current = false;
      
      // Use setTimeout to prevent errors from reaching React's error boundary
      // This ensures cleanup errors don't crash the app
      setTimeout(() => {
        try {
          if (html5QrcodeRef.current && scannerStartedRef.current) {
            console.log('[SCANNER] Stopping scanner on unmount...');
            const scanner = html5QrcodeRef.current;
            
            // Silently stop without throwing errors
            // Wrap in try-catch and also catch promise rejections
            try {
              const stopPromise = scanner.stop();
              if (stopPromise && typeof stopPromise.catch === 'function') {
                stopPromise.catch(() => {
                  // Completely ignore all errors
                });
              }
            } catch (err) {
              // Completely ignore all errors - don't log or throw
            }
            
            // Silently clear without throwing errors
            try {
              const clearPromise = scanner.clear();
              if (clearPromise && typeof clearPromise.catch === 'function') {
                clearPromise.catch(() => {
                  // Completely ignore all errors
                });
              }
            } catch (err) {
              // Completely ignore all errors - don't log or throw
            }
          }
        } catch (err) {
          // Outer try-catch to catch any unexpected errors
          // Completely suppress - don't log or throw
        }
        
        // Always reset refs after cleanup attempt
        html5QrcodeRef.current = null;
        scannerStartedRef.current = false;
      }, 0);
    };
  }, [isOpen]);

  const handleDone = useCallback(() => {
    if (onDone) {
      onDone();
    } else {
      onClose();
    }
  }, [onDone, onClose]);

  if (!isOpen || !cameraEnabled) {
    return null;
  }

  // For mobile in continuous mode, use full-screen layout
  if (isMobile && continuousMode) {
    return (
      <div className={`fixed inset-0 z-50 bg-background flex flex-col ${isOpen ? '' : 'hidden'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} border-b border-border bg-card`}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={`${isMobile ? 'h-11 w-11' : 'h-10 w-10'}`}
          >
            <X className="h-5 w-5" />
          </Button>
          
            <div className="flex items-center gap-2">
              <Camera className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-muted-foreground`} />
              <h1 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-foreground`}>
                Scan Barcode / QR
              </h1>
            </div>
          
          {scannedCount > 0 && (
            <Badge className={`${isMobile ? 'text-xs px-2 py-0.5' : ''} bg-green-600 text-white`}>
              {scannedCount}
            </Badge>
          )}
          {scannedCount === 0 && <div className="w-10" />}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!hasStarted && !error ? (
            // Show start button before scanner starts (triggers permission request)
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="text-center space-y-4 max-w-md">
                <Camera className={`${isMobile ? 'h-16 w-16' : 'h-20 w-20'} text-muted-foreground mx-auto`} />
                <div>
                  <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-foreground mb-2`}>
                    Ready to Scan
                  </h2>
                  <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-600 mb-4`}>
                    Tap the button below to start scanning. You'll be asked to allow camera access.
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleStartScanner}
                      className={`${isMobile ? 'h-12 text-base' : 'h-14 text-lg'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} px-8`}
                      loading={isStarting}
                    >
                      <>
                        <Camera className="h-5 w-5 mr-2" />
                        Start Scanning
                      </>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Scan barcode to add product</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : error ? (
            <div className={`flex-1 flex items-center justify-center ${isMobile ? 'px-4' : 'px-6'}`}>
              <div className={`${isMobile ? 'p-4' : 'p-6'} bg-red-50 border border-red-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} text-center w-full max-w-md`}>
                <AlertCircle className={`${isMobile ? 'h-10 w-10' : 'h-12 w-12'} text-red-500 mx-auto mb-3`} />
                <p className={`${isMobile ? 'text-base' : 'text-lg'} text-red-700 font-medium mb-1`}>
                  {permissionDenied ? 'Camera Permission Required' : 'Camera Error'}
                </p>
                <p className={`${isMobile ? 'text-sm' : 'text-base'} text-red-600 mb-3`}>{error}</p>
                {permissionDenied && (
                  <div className="space-y-2">
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mb-3`}>
                      To scan QR codes, please allow camera access:
                    </p>
                    <ol className={`${isMobile ? 'text-xs' : 'text-sm'} text-left text-foreground space-y-1 mb-3`}>
                      <li>1. Tap the address bar</li>
                      <li>2. Look for the camera icon</li>
                      <li>3. Select "Allow" or "Always"</li>
                      <li>4. Refresh this page</li>
                    </ol>
                    <Button
                      onClick={() => window.location.reload()}
                      className={`${isMobile ? 'h-10 text-sm' : 'h-11'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                    >
                      Try Again
                    </Button>
                  </div>
                )}
                {!permissionDenied && (
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                    Make sure you have granted camera permissions
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                  <div className="text-center">
                    <Loader2 className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} animate-spin text-brand mx-auto`} />
                    <p className={`${isMobile ? 'text-sm' : 'text-base'} text-muted-foreground mt-2`}>Starting camera...</p>
                  </div>
                </div>
              )}
              <div className="flex-1 relative bg-black">
                <div 
                  id="pos-qr-scanner" 
                  ref={scannerRef}
                  className="w-full h-full"
                />
              </div>
              
              {/* Last scanned item feedback */}
              {lastScannedItem && (
                <div className={`${isMobile ? 'p-2 mx-3 my-2' : 'p-3 mx-4 my-3'} bg-green-50 border border-green-200 ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-700 font-medium text-center`}>
                    Added: {lastScannedItem}
                  </p>
                </div>
              )}
              
              <p className={`${isMobile ? 'text-xs px-4 pb-2 mb-2' : 'text-sm px-6 pb-4 mb-2'} text-muted-foreground text-center`}>
                Scan barcode or QR. Tap Done when finished. Hold steady with good lighting.
              </p>
            </>
          )}
        </div>

        {/* Footer Buttons */}
        <div className={`${isMobile ? 'p-3 gap-2 mt-2' : 'p-4 gap-3 mt-2'} border-t border-border bg-card flex`}>
          <Button 
            variant="outline" 
            onClick={onClose}
            className={`flex-1 ${isMobile ? 'h-11' : 'h-12'} border-gray-300 ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
          >
            Cancel
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={handleDone}
                className={`flex-1 ${isMobile ? 'h-11' : 'h-12'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                disabled={scannedCount === 0}
              >
                Done ({scannedCount})
              </Button>
            </TooltipTrigger>
            <TooltipContent>Review cart and go to payment</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  // Desktop/non-continuous mode - use Dialog
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={`${continuousMode ? 'sm:w-[var(--modal-w-md)]' : 'sm:w-[var(--modal-w-sm)]'} sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)] ${isMobile ? 'p-4' : ''}`}>
        <DialogHeader className={isMobile ? 'pb-3' : ''}>
          <DialogTitle className={`flex items-center justify-between ${isMobile ? 'text-base' : ''}`}>
            <div className="flex items-center gap-2">
              <Camera className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
              {continuousMode ? 'Scan Barcode / QR' : 'Scan Barcode or QR'}
            </div>
            {continuousMode && scannedCount > 0 && (
              <Badge className={`${isMobile ? 'text-xs' : ''} bg-green-600 text-white`}>
                {scannedCount} item{scannedCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
        <div className={isMobile ? "space-y-3" : "space-y-4"}>
          {!hasStarted && !error ? (
            // Show start button before scanner starts (triggers permission request)
            <div className="flex flex-col items-center justify-center py-8 px-4 space-y-4">
              <Camera className={`${isMobile ? 'h-16 w-16' : 'h-20 w-20'} text-muted-foreground`} />
              <div className="text-center">
                <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-foreground mb-2`}>
                  Ready to Scan
                </h3>
                <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-600 mb-4`}>
                  Click the button below to start scanning. You'll be asked to allow camera access.
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleStartScanner}
                    className={`${isMobile ? 'h-11 text-sm' : 'h-12 text-base'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} px-6`}
                    loading={isStarting}
                  >
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Start Scanning
                    </>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scan barcode to add product</TooltipContent>
              </Tooltip>
            </div>
          ) : error ? (
            <div className={`${isMobile ? 'p-3' : 'p-4'} bg-red-50 border border-red-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} text-center`}>
              <AlertCircle className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} text-red-500 mx-auto mb-2`} />
              <p className={`${isMobile ? 'text-sm' : 'text-base'} text-red-700 font-medium`}>
                {permissionDenied ? 'Camera Permission Required' : 'Camera Error'}
              </p>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-red-600 mt-1`}>{error}</p>
              {permissionDenied ? (
                <div className="mt-3 space-y-2">
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
                    To scan QR codes, please allow camera access in your browser settings.
                  </p>
                  <Button
                    onClick={() => window.location.reload()}
                    className={`${isMobile ? 'h-9 text-xs' : 'h-10 text-sm'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-gray-500 mt-2`}>
                  Make sure you have granted camera permissions
                </p>
              )}
            </div>
          ) : (
            <>
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                  <div className="text-center">
                    <Loader2 className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} animate-spin text-brand mx-auto`} />
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-muted-foreground mt-2`}>Starting camera...</p>
                  </div>
                </div>
              )}
              <div 
                id="pos-qr-scanner" 
                ref={scannerRef}
                className={`w-full ${isMobile ? 'rounded-md' : 'rounded-lg'} overflow-hidden`}
              />
              
              {/* Last scanned item feedback */}
              {continuousMode && lastScannedItem && (
                <div className={`${isMobile ? 'p-2' : 'p-3'} bg-green-50 border border-green-200 ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-green-700 font-medium text-center`}>
                    Added: {lastScannedItem}
                  </p>
                </div>
              )}
              
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 text-center mb-2`}>
                {continuousMode
                  ? 'Scan barcode or QR. Tap Done when finished. Hold steady with good lighting.'
                  : 'Scan barcode or QR. Hold steady with good lighting.'
                }
              </p>
            </>
          )}
        </div>

        <div className={`flex justify-center ${isMobile ? 'gap-2 pt-2' : 'gap-3'}`}>
          {continuousMode ? (
            <>
              <Button 
                variant="outline" 
                onClick={onClose}
                className={`${isMobile ? 'h-11 flex-1' : 'h-12'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
              >
                Cancel
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleDone}
                    className={`${isMobile ? 'h-11 flex-1' : 'h-12'} bg-brand hover:bg-brand-dark text-white ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
                    disabled={scannedCount === 0}
                  >
                    Done ({scannedCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Review cart and go to payment</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Button 
              variant="outline" 
              onClick={onClose}
              className={`${isMobile ? 'h-11 w-full' : 'h-12'} border-border ${isMobile ? 'rounded-md' : 'rounded-lg'}`}
            >
              Cancel
            </Button>
          )}
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

const BROWSE_LIST_SIZE = 60;
const POS_RESULTS_VIRT_MIN = 32;
const POS_LIST_ROW_EST = 92;
const POS_GRID_ROW_EST = 260;

function POSVirtualProductList({
  scrollRef,
  results,
  onSelect,
  cartQuantityByProductId,
  onAdjustProductQuantity,
  showQuantityControls,
  dealerPriceByProductId = {},
}) {
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => POS_LIST_ROW_EST,
    overscan: 6,
  });
  return (
    <div
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const product = results[vi.index];
        return (
          <div
            key={product.id}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{
              transform: `translateY(${vi.start}px)`,
              height: `${vi.size}px`,
            }}
          >
            <ProductItem
              product={product}
              onSelect={onSelect}
              quantityInCart={cartQuantityByProductId[product.id] || 0}
              showQuantityControls={showQuantityControls}
              dealerPrice={dealerPriceByProductId[product.id] || null}
              onAdjustQuantity={
                onAdjustProductQuantity
                  ? (delta) => onAdjustProductQuantity(product.id, delta)
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function POSVirtualProductGrid({
  scrollRef,
  results,
  columnCount,
  onSelect,
  cartQuantityByProductId,
  onAdjustProductQuantity,
  showQuantityControls,
  dealerPriceByProductId = {},
}) {
  const rowCount = Math.ceil(results.length / columnCount);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => POS_GRID_ROW_EST,
    overscan: 4,
  });
  return (
    <div
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const start = vi.index * columnCount;
        const rowProducts = results.slice(start, start + columnCount);
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full px-0.5"
            style={{
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <div
              className={cn(
                'grid gap-2 pb-2',
                columnCount === 2 && 'grid-cols-2',
                columnCount === 3 && 'grid-cols-3'
              )}
            >
              {rowProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={onSelect}
                  quantityInCart={cartQuantityByProductId[product.id] || 0}
                  showQuantityControls={showQuantityControls}
                  dealerPrice={dealerPriceByProductId[product.id] || null}
                  onAdjustQuantity={
                    onAdjustProductQuantity
                      ? (delta) => onAdjustProductQuantity(product.id, delta)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Main POSProductSearch component
 * @param {Object} props
 * @param {function} props.onSearch - Search function (query) => Promise<products[]>
 * @param {function} props.getProductByBarcode - (barcode) => Promise<product|null> – lookup by barcode (EAN/UPC/etc.)
 * @param {function} props.resolveProductFromQRPayload - (qrData) => Promise<product|null> – resolve product from parsed QR payload
 * @param {function} props.onSelectProduct - Called when a product is selected
 * @param {boolean} props.isOnline - Whether the device is online
 * @param {Array} [props.allProducts] - Full product list to show when search is empty (browse)
 * @param {boolean} [props.productsLoading] - True while products are loading (show loading state)
 * @param {Object} [props.cartQuantityByProductId] - Map of productId -> quantity in cart (for in-cart indicator)
 * @param {boolean} [props.fillHeight] - If true, the results area uses flex-1 to fill available height (e.g. in POS layout)
 * @param {function} [props.onAdjustProductQuantity] - Optional: (productId, delta) => void, for mobile +/- quantity controls
 * @param {function} [props.onAddCustomItem] - Optional: open custom item flow
 * @param {Object} [props.dealerPriceByProductId] - Map of productId -> { unitPrice, source, retailPrice } when selling to a dealer
 * @param {boolean} [props.scanningEnabled] - When false, barcode camera scanner is not available
 */
const POSProductSearch = ({
  onSearch,
  getProductByBarcode,
  resolveProductFromQRPayload,
  onSelectProduct,
  isOnline = true,
  allProducts = [],
  productsLoading = false,
  cartQuantityByProductId = {},
  fillHeight = false,
  onAdjustProductQuantity,
  onAddCustomItem,
  dealerPriceByProductId = {},
  scanningEnabled = false,
}) => {
  const navigate = useNavigate();
  const { isMobile, isDesktop } = useResponsive();
  const showQuantityControls = !isDesktop;
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState('card');
  const inputRef = useRef(null);
  const posResultsScrollRef = useRef(null);

  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_DELAYS.SEARCH);

  const categories = useMemo(() => {
    const list = Array.isArray(allProducts) ? allProducts : [];
    const seen = new Set();
    const out = [];
    list.forEach((p) => {
      const id = p.categoryId ?? p.category?.id;
      const name = p.category?.name ?? 'Uncategorized';
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ id, name });
      } else if (!id && !seen.has('__none__')) {
        seen.add('__none__');
        out.push({ id: '__none__', name: 'Uncategorized' });
      }
    });
    return out.sort((a, b) => (a.name === 'Uncategorized' ? 1 : a.name.localeCompare(b.name)));
  }, [allProducts]);

  const filterByCategory = useCallback((list, categoryId) => {
    if (!categoryId || categoryId === 'all') return list;
    return list.filter((p) => {
      const id = p.categoryId ?? p.category?.id;
      if (categoryId === '__none__') return !id;
      return id === categoryId;
    });
  }, []);

  const browseList = useMemo(() => {
    const list = Array.isArray(allProducts) ? allProducts : [];
    const filtered = filterByCategory(list, categoryFilter);
    return filtered.slice(0, BROWSE_LIST_SIZE);
  }, [allProducts, categoryFilter, filterByCategory]);

  // Perform search when debounced query changes; when empty, show filtered browse list
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery.trim()) {
        console.log('[POSProductSearch] effect: empty query, setting results from browseList', { browseListLength: browseList.length });
        setResults(browseList);
        setSearchError(null);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const products = await onSearch(debouncedQuery);
        const list = Array.isArray(products) ? products : [];
        const filtered = filterByCategory(list, categoryFilter);
        setResults(filtered);
      } catch (error) {
        console.error('[POSProductSearch] Search error:', error);
        setSearchError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedQuery, onSearch, browseList, categoryFilter, filterByCategory]);

  const handleScan = useCallback(async (decodedText) => {
    setSearchError(null);
    setIsSearching(true);

    const text = (decodedText || '').trim();
    const looksLikeQRJson = text.startsWith('{');

    try {
      if (looksLikeQRJson) {
        const result = parseProductQRPayload(text);
        if (!result.success) {
          setSearchError(result.error || 'Invalid QR – use a product QR code');
          setIsSearching(false);
          return;
        }
        const product = await resolveProductFromQRPayload(result.data);
        if (product) {
          onSelectProduct(product);
          setScannerOpen(false);
          setSearchQuery('');
          setResults([]);
        } else {
          setSearchError('Product not found for this QR code');
        }
      } else {
        if (!getProductByBarcode) {
          setSearchError('Barcode lookup not available');
          setIsSearching(false);
          return;
        }
        const product = await getProductByBarcode(text);
        if (product) {
          onSelectProduct(product);
          setScannerOpen(false);
          setSearchQuery('');
          setResults([]);
        } else {
          setSearchError('Product not found for this barcode');
        }
      }
    } catch (error) {
      console.error('Scan resolve error:', error);
      setSearchError(looksLikeQRJson ? 'Could not find product for this QR code' : 'Could not find product for this barcode');
    } finally {
      setIsSearching(false);
    }
  }, [getProductByBarcode, resolveProductFromQRPayload, onSelectProduct]);

  const handleSelectProduct = useCallback((product) => {
    onSelectProduct(product);
    // Do NOT clear results or auto-focus – keep list visible so in-cart indicator updates
  }, [onSelectProduct]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setSearchError(null);
    inputRef.current?.focus();
  }, []);

  return (
    <Card className={cn('border border-border', fillHeight && 'flex flex-col min-h-0 flex-1')}>
      <CardContent className={cn('p-4', fillHeight && 'flex flex-col flex-1 min-h-0')}>
        {/* Search input and category filter (primary Scan button lives in POS header) */}
        <div className="flex gap-2 flex-shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={isMobile ? 'Search' : 'Search by name, SKU, or scan barcode/QR...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-12 text-base sm:text-lg"
                  autoComplete="off"
                />
            {(searchQuery || isSearching) && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
                onClick={handleClearSearch}
              >
                {isSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <X className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>
            )}
              </div>
            </TooltipTrigger>
            <TooltipContent>Type product name or scan barcode</TooltipContent>
          </Tooltip>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="min-w-0 w-[120px] sm:w-[140px] md:w-[160px] h-12 flex-shrink-0 border border-border">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onAddCustomItem && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 flex-shrink-0 border border-[#166534] text-[#166534] hover:bg-green-50 hover:text-[#166534]"
                  onClick={onAddCustomItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Add custom item</span>
                  <span className="sm:hidden">Custom</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a one-off item to this sale</TooltipContent>
            </Tooltip>
          )}
          {!isMobile && (
            <div className="flex items-center border border-border rounded-md overflow-hidden flex-shrink-0">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-12 w-10 rounded-none border-0 border-r border-border"
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List className="h-5 w-5" />
              </Button>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-12 w-10 rounded-none"
                onClick={() => setViewMode('card')}
                title="Card view"
              >
                <LayoutGrid className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Error message */}
        {searchError && (
          <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {searchError}
          </div>
        )}

        {/* Search results / browse list */}
        {results.length > 0 && (
          <div
            ref={posResultsScrollRef}
            className={cn(
              'mt-4 overflow-y-auto overflow-x-hidden rounded-md border border-transparent',
              fillHeight ? 'flex-1 min-h-0' : 'max-h-80',
              isMobile && 'pb-16'
            )}
          >
            {(() => {
              const effectiveMode = (isMobile ? 'card' : viewMode) === 'list' ? 'list' : 'grid';
              const useVirt = results.length >= POS_RESULTS_VIRT_MIN;
              if (useVirt && effectiveMode === 'list') {
                return (
                  <POSVirtualProductList
                    scrollRef={posResultsScrollRef}
                    results={results}
                    onSelect={handleSelectProduct}
                    cartQuantityByProductId={cartQuantityByProductId}
                    onAdjustProductQuantity={onAdjustProductQuantity}
                    showQuantityControls={showQuantityControls}
                    dealerPriceByProductId={dealerPriceByProductId}
                  />
                );
              }
              if (useVirt && effectiveMode === 'grid') {
                return (
                  <POSVirtualProductGrid
                    scrollRef={posResultsScrollRef}
                    results={results}
                    columnCount={isMobile ? 2 : 3}
                    onSelect={handleSelectProduct}
                    cartQuantityByProductId={cartQuantityByProductId}
                    onAdjustProductQuantity={onAdjustProductQuantity}
                    showQuantityControls={showQuantityControls}
                    dealerPriceByProductId={dealerPriceByProductId}
                  />
                );
              }
              return effectiveMode === 'list' ? (
                <div className="space-y-1">
                  {results.map((product) => (
                    <ProductItem
                      key={product.id}
                      product={product}
                      onSelect={handleSelectProduct}
                      quantityInCart={cartQuantityByProductId[product.id] || 0}
                      showQuantityControls={showQuantityControls}
                      dealerPrice={dealerPriceByProductId[product.id] || null}
                      onAdjustQuantity={
                        onAdjustProductQuantity
                          ? (delta) => onAdjustProductQuantity(product.id, delta)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {results.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={handleSelectProduct}
                      quantityInCart={cartQuantityByProductId[product.id] || 0}
                      showQuantityControls={showQuantityControls}
                      dealerPrice={dealerPriceByProductId[product.id] || null}
                      onAdjustQuantity={
                        onAdjustProductQuantity
                          ? (delta) => onAdjustProductQuantity(product.id, delta)
                          : undefined
                      }
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* No results message - only when user has typed a search */}
        {searchQuery.trim() && !isSearching && results.length === 0 && !searchError && (
          <div className="mt-4 text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No products found for &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {/* Loading state only when no products yet (avoid flash when adding to cart / refetch) */}
        {!searchQuery.trim() && productsLoading && (!allProducts || allProducts.length === 0) && (
          <div className="mt-4 text-center py-8 text-gray-500 flex flex-col items-center gap-2">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p>Loading products...</p>
          </div>
        )}

        {/* Empty state when no products at all or no products in selected category */}
        {!searchQuery.trim() && !productsLoading && browseList.length === 0 && !isSearching && (
          <div className="mt-4 text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            {categoryFilter && categoryFilter !== 'all' ? (
              <p>No products in this category.</p>
            ) : allProducts.length === 0 ? (
              <div className="space-y-3">
                <p>You haven't added any products yet.</p>
                <p className="text-sm">Add your products first before you can start selling.</p>
                <Button
                  onClick={() => navigate('/products?add=1')}
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Product
                </Button>
              </div>
            ) : (
              <p>No products to show. Refresh when online.</p>
            )}
          </div>
        )}
      </CardContent>

      {/* Barcode + QR Scanner Modal */}
      {scanningEnabled && (
        <QRCodeScanner
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={handleScan}
          cameraEnabled={scanningEnabled}
        />
      )}
    </Card>
  );
};

export default POSProductSearch;
export { QRCodeScanner };
