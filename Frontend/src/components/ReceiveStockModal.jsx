/**
 * ReceiveStockModal – Receive stock into products via QR code, barcode scan, search, or catalog pick.
 * Flow: Scan/search/select product → if variants, select variant → enter qty → add to stock.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Barcode, ChevronDown, Loader2, Package, Search } from 'lucide-react';
import productService from '../services/productService';
import { parseProductQRPayload } from '../utils/productQR';
import { showSuccess, showError } from '../utils/toast';
import { numberInputValue } from '../utils/formUtils';
import { formatInteger } from '../utils/formatNumber';
import { useScanningEnabled } from '../hooks/usePOSConfig';
import { cn } from '@/lib/utils';

const SCANNER_ID = 'receive-stock-scanner';

/**
 * Normalize product + variants from various API shapes.
 * @param {Object} product
 * @returns {Object}
 */
const normalizeProduct = (product) => {
  if (!product || typeof product !== 'object') return product;
  const variants = Array.isArray(product.variants)
    ? product.variants.filter((v) => v && v.isActive !== false)
    : [];
  return { ...product, variants };
};

/**
 * @param {Object} product
 * @returns {boolean}
 */
const productHasVariants = (product) => {
  if (!product) return false;
  if (Array.isArray(product.variants) && product.variants.length > 0) return true;
  return Boolean(product.hasVariants);
};

/**
 * Sort products by name A–Z (case-insensitive).
 * @param {Object[]} list
 * @returns {Object[]}
 */
const sortProductsByName = (list) =>
  [...(list || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  );

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Object} [initialProduct] – When provided, starts on the confirm step for this product.
 * @param {() => void} [onSuccess] – Called after adding stock (refresh list, etc.)
 */
export default function ReceiveStockModal({ open, onClose, onSuccess, initialProduct = null }) {
  const { scanningEnabled } = useScanningEnabled();
  const html5QrcodeRef = useRef(null);
  const [step, setStep] = useState('scan');
  const [product, setProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [qtyReceived, setQtyReceived] = useState(1);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState('');

  const resetToScan = useCallback(() => {
    setStep('scan');
    setProduct(null);
    setSelectedVariantId(null);
    setVariantsLoading(false);
    setQtyReceived(1);
    setScanError(null);
    setSearchQuery('');
    setSearchResults([]);
    setBarcodeInput('');
    setProductPickerOpen(false);
    setCatalogFilter('');
  }, []);

  /**
   * Load full product (with variants) and open confirm step.
   * @param {Object} rawProduct
   * @param {Object} [preferredVariant] - Preselected variant (e.g. from barcode match)
   */
  const openProductConfirm = useCallback(async (rawProduct, preferredVariant = null) => {
    if (!rawProduct?.id) return;

    let nextProduct = normalizeProduct(rawProduct);
    const preferredId = preferredVariant?.id || rawProduct.selectedVariant?.id || null;

    setProduct(nextProduct);
    setSelectedVariantId(preferredId);
    setQtyReceived(1);
    setStep('confirm');
    setScanError(null);

    const needsVariants =
      nextProduct.hasVariants ||
      preferredId ||
      !Array.isArray(nextProduct.variants) ||
      nextProduct.variants.length === 0;

    if (!needsVariants && Array.isArray(nextProduct.variants) && nextProduct.variants.length > 0) {
      if (!preferredId && nextProduct.variants.length === 1) {
        setSelectedVariantId(nextProduct.variants[0].id);
      }
      return;
    }

    // Always refresh variants when product claims to have them or list is missing.
    if (nextProduct.hasVariants || preferredId || !nextProduct.variants?.length) {
      setVariantsLoading(true);
      try {
        const [detailRes, variantsRes] = await Promise.all([
          productService.getProductById(nextProduct.id).catch(() => null),
          productService.getProductVariants(nextProduct.id).catch(() => null),
        ]);

        const detail =
          detailRes?.data?.data ?? detailRes?.data?.product ?? detailRes?.data ?? detailRes;
        const fromDetail = Array.isArray(detail?.variants) ? detail.variants : null;
        const fromListRaw = variantsRes?.data?.data ?? variantsRes?.data ?? variantsRes;
        const fromList = Array.isArray(fromListRaw)
          ? fromListRaw
          : Array.isArray(fromListRaw?.variants)
            ? fromListRaw.variants
            : null;

        const variants = (fromList || fromDetail || nextProduct.variants || []).filter(
          (v) => v && v.isActive !== false
        );

        nextProduct = normalizeProduct({
          ...(detail?.id ? detail : nextProduct),
          variants,
          hasVariants: variants.length > 0 || Boolean(detail?.hasVariants || nextProduct.hasVariants),
          selectedVariant: preferredVariant || rawProduct.selectedVariant || null,
        });

        setProduct(nextProduct);

        if (preferredId && variants.some((v) => v.id === preferredId)) {
          setSelectedVariantId(preferredId);
        } else if (variants.length === 1) {
          setSelectedVariantId(variants[0].id);
        } else if (preferredId) {
          setSelectedVariantId(preferredId);
        }
      } catch (e) {
        showError(e, 'Failed to load product variants');
      } finally {
        setVariantsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      resetToScan();
      return;
    }

    if (initialProduct?.id) {
      openProductConfirm(initialProduct);
      setSearchQuery('');
      setSearchResults([]);
      setBarcodeInput('');
      return;
    }

    resetToScan();
  }, [open, initialProduct, resetToScan, openProductConfirm]);

  /**
   * Load all active products A–Z for the catalog dropdown (paginated).
   */
  const loadProductCatalog = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const pageSize = 100;
      const allProducts = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await productService.getProducts({
          isActive: true,
          page,
          limit: pageSize,
          sort: 'name_asc',
        });
        const list = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.products)
            ? response.products
            : [];
        allProducts.push(...list);
        totalPages = Number(response?.pagination?.totalPages || totalPages);
        if (list.length < pageSize && !response?.pagination?.totalPages) break;
        page += 1;
      } while (page <= totalPages);

      setProductOptions(sortProductsByName(allProducts));
    } catch (error) {
      showError(error, 'Failed to load products');
      setProductOptions([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== 'scan' || initialProduct?.id) return;
    loadProductCatalog();
  }, [open, step, initialProduct?.id, loadProductCatalog]);

  const filteredCatalogProducts = useMemo(() => {
    const query = catalogFilter.trim().toLowerCase();
    const stockTracked = productOptions.filter((p) => p?.trackStock !== false);
    if (!query) return stockTracked;
    return stockTracked.filter((p) => {
      const haystack = [p.name, p.sku, p.barcode, p.category?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [productOptions, catalogFilter]);

  useEffect(() => {
    if (!open || step !== 'scan' || !scanningEnabled) return;

    let mounted = true;
    setCameraError(null);
    setIsStarting(true);

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!mounted) return;

        const el = document.getElementById(SCANNER_ID);
        if (!el) {
          setCameraError('Scanner element not found');
          setIsStarting(false);
          return;
        }

        const html5Qrcode = new Html5Qrcode(SCANNER_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
        });
        html5QrcodeRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            setScanError(null);
            const result = parseProductQRPayload(decodedText);
            let productResolved = null;
            if (result.success && result.data) {
              try {
                productResolved = await productService.resolveProductFromQRPayload(result.data);
              } catch (_) {}
            }
            if (!productResolved?.id) {
              try {
                const res = await productService.getProductByBarcode(decodedText.trim());
                productResolved = res?.data?.product ?? res?.product ?? res?.data ?? null;
              } catch (_) {}
            }
            if (!productResolved?.id) {
              setScanError(result.success ? 'Product not found for this QR code' : 'Product not found for this barcode');
              return;
            }
            if (navigator.vibrate) navigator.vibrate(100);
            const preferred = productResolved.selectedVariant || null;
            await openProductConfirm(productResolved, preferred);
            if (html5QrcodeRef.current) {
              html5QrcodeRef.current.stop().catch(() => {});
              html5QrcodeRef.current = null;
            }
          },
          () => {}
        );

        setIsStarting(false);
      } catch (err) {
        if (!mounted) return;
        setCameraError(err?.message || 'Failed to access camera');
        setIsStarting(false);
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop().catch(() => {});
        html5QrcodeRef.current = null;
      }
    };
  }, [open, step, scanningEnabled, openProductConfirm]);

  const handleSearch = useCallback(async () => {
    const q = (searchQuery || '').trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setScanError(null);
    try {
      const res = await productService.getProducts({ search: q, limit: 20 });
      const body = res && typeof res === 'object' ? res : {};
      const list = Array.isArray(body.data) ? body.data : Array.isArray(body.products) ? body.products : [];
      setSearchResults(list);
    } catch (e) {
      showError(e, 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleBarcodeLookup = useCallback(async () => {
    const code = (barcodeInput || '').trim();
    if (!code) return;
    setBarcodeLookupLoading(true);
    setScanError(null);
    try {
      const res = await productService.getProductByBarcode(code);
      const p = res?.data?.product ?? res?.product ?? res?.data;
      if (p?.id) {
        if (navigator.vibrate) navigator.vibrate(100);
        await openProductConfirm(p, p.selectedVariant || null);
        setBarcodeInput('');
      } else {
        setScanError('No product found for this barcode');
      }
    } catch (e) {
      setScanError('No product found for this barcode');
    } finally {
      setBarcodeLookupLoading(false);
    }
  }, [barcodeInput, openProductConfirm]);

  const selectProduct = useCallback((p) => {
    openProductConfirm(p);
    setSearchQuery('');
    setSearchResults([]);
    setProductPickerOpen(false);
    setCatalogFilter('');
  }, [openProductConfirm]);

  const variants = useMemo(
    () => (Array.isArray(product?.variants) ? product.variants.filter((v) => v?.isActive !== false) : []),
    [product]
  );
  const requiresVariant = productHasVariants(product) || variants.length > 0;
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  const displayQty = useMemo(() => {
    if (requiresVariant) {
      const n = parseFloat(selectedVariant?.quantityOnHand);
      return Number.isFinite(n) ? n : 0;
    }
    const n = parseFloat(product?.quantityOnHand);
    return Number.isFinite(n) ? n : 0;
  }, [requiresVariant, selectedVariant, product?.quantityOnHand]);

  const canAddStock =
    product?.trackStock !== false &&
    (!requiresVariant || Boolean(selectedVariantId)) &&
    !variantsLoading;

  const handleAddToStock = useCallback(async () => {
    const qty = qtyReceived === '' ? 1 : Number(qtyReceived);
    if (!product?.id || !Number.isFinite(qty) || qty < 1) return;

    if (requiresVariant && !selectedVariantId) {
      showError('Select a variant before adding stock');
      return;
    }

    setLoading(true);
    try {
      if (requiresVariant) {
        const variant =
          selectedVariant ||
          variants.find((v) => v.id === selectedVariantId) ||
          { id: selectedVariantId, quantityOnHand: 0 };
        await productService.adjustVariantStock(
          selectedVariantId,
          qty,
          'delta',
          { ...variant, productId: product.id },
          { productId: product.id, reason: 'Receive stock', type: 'receive' }
        );
        const updated = parseFloat(variant.quantityOnHand || 0) + qty;
        const label = variant.name ? `${product.name} — ${variant.name}` : product.name;
        showSuccess(
          `Added ${qty} to ${label}. Stock now ${updated} ${product.unit || 'units'}.`
        );

        // Keep product open so user can receive another variant quickly.
        setProduct((prev) => {
          if (!prev) return prev;
          const nextVariants = (prev.variants || []).map((v) =>
            v.id === selectedVariantId
              ? { ...v, quantityOnHand: Math.max(0, parseFloat(v.quantityOnHand || 0) + qty) }
              : v
          );
          return { ...prev, variants: nextVariants };
        });
        setQtyReceived(1);
      } else {
        await productService.adjustStock(product.id, qty, 'delta', 'Receive stock');
        const updated = parseFloat(product.quantityOnHand || 0) + qty;
        showSuccess(`Added ${qty} to ${product.name}. Stock now ${updated} ${product.unit || 'units'}.`);
        resetToScan();
        setStep('scan');
      }
      onSuccess?.();
    } catch (e) {
      showError(e, 'Failed to add stock');
    } finally {
      setLoading(false);
    }
  }, [
    product,
    qtyReceived,
    onSuccess,
    resetToScan,
    requiresVariant,
    selectedVariantId,
    selectedVariant,
    variants,
  ]);

  const handleAddAnother = useCallback(() => {
    resetToScan();
    setStep('scan');
  }, [resetToScan]);

  const handleDone = useCallback(() => {
    onClose();
  }, [onClose]);

  const variantLabel = (variant) => {
    const stock = formatInteger(parseFloat(variant.quantityOnHand) || 0);
    const bits = [variant.name || 'Variant'];
    if (variant.sku) bits.push(`SKU ${variant.sku}`);
    bits.push(`Stock ${stock}`);
    return bits.join(' · ');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:w-[var(--modal-w-sm)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {step === 'scan' ? 'Receive stock' : 'Confirm & add'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
        {step === 'scan' && (
          <div className="space-y-4">
            {scanningEnabled && (
              cameraError ? (
                <div className="p-4 bg-red-50 rounded-lg text-center border border-red-200">
                  <p className="text-red-700 font-medium">Camera error</p>
                  <p className="text-sm text-red-600 mt-1">{cameraError}</p>
                </div>
              ) : (
                <>
                  <div className="relative w-full rounded-lg overflow-hidden min-h-[200px] bg-muted border border-border">
                    {isStarting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-brand mx-auto" />
                          <p className="text-sm text-gray-600 mt-2">Starting camera...</p>
                        </div>
                      </div>
                    )}
                    <div id={SCANNER_ID} className="w-full min-h-[200px]" />
                  </div>
                  {scanError && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
                      <p className="text-sm text-amber-800">{scanError}</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 text-center">
                    Scan product or variant QR/barcode, or select / search below.
                  </p>
                </>
              )
            )}

            {!scanningEnabled && (
              <p className="text-sm text-gray-500 text-center">
                Camera scanning is disabled for this workspace. Select a product from the list, enter a barcode, or search below.
              </p>
            )}

            <div className={`border-t border-gray-200 pt-4 space-y-3${scanningEnabled ? '' : ' border-t-0 pt-0'}`}>
                  <div className="space-y-2">
                    <Label>Select product</Label>
                    <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-between font-normal"
                        >
                          <span className="truncate text-muted-foreground">
                            {loadingProducts
                              ? 'Loading products…'
                              : 'Choose from product list (A–Z)'}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-3rem)] p-0"
                        align="start"
                      >
                        <div className="border-b border-border p-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={catalogFilter}
                              onChange={(e) => setCatalogFilter(e.target.value)}
                              placeholder="Filter list…"
                              className="pl-9"
                              autoFocus
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {loadingProducts
                              ? 'Loading products…'
                              : `${filteredCatalogProducts.length} product${filteredCatalogProducts.length === 1 ? '' : 's'} (A–Z)`}
                          </p>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-1">
                          {loadingProducts ? (
                            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Loading products
                            </div>
                          ) : filteredCatalogProducts.length > 0 ? (
                            filteredCatalogProducts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                onClick={() => selectProduct(p)}
                              >
                                <span className="block truncate font-medium">{p.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {p.sku ? `SKU: ${p.sku}` : null}
                                  {p.sku && (p.barcode || p.quantityOnHand != null) ? ' · ' : null}
                                  {p.barcode ? p.barcode : null}
                                  {p.barcode && p.quantityOnHand != null ? ' · ' : null}
                                  {p.quantityOnHand != null
                                    ? `Stock ${formatInteger(p.quantityOnHand)} ${p.unit || 'pcs'}`
                                    : null}
                                  {(p.hasVariants || (Array.isArray(p.variants) && p.variants.length > 0))
                                    ? ' · Has variants'
                                    : null}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              No products found.
                            </p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Barcode className="h-4 w-4" />
                      Enter barcode
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type or paste barcode number..."
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleBarcodeLookup())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleBarcodeLookup}
                        loading={barcodeLookupLoading}
                        disabled={!barcodeInput.trim()}
                      >
                        Look up
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Search by name or SKU</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search product..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                      />
                      <SecondaryButton type="button" size="icon" onClick={handleSearch} loading={searching}>
                        <Search className="h-4 w-4" />
                      </SecondaryButton>
                    </div>
                    {searchResults.length > 0 && (
                      <ul className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
                        {searchResults.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                              onClick={() => selectProduct(p)}
                            >
                              <span className="font-medium">{p.name}</span>
                              {p.sku && <span className="text-gray-500 ml-2">({p.sku})</span>}
                              {p.barcode && <span className="text-gray-400 ml-2">· {p.barcode}</span>}
                              {(p.hasVariants || (Array.isArray(p.variants) && p.variants.length > 0)) && (
                                <span className="text-[#166534] ml-2 text-xs">Has variants</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
            <div className="flex justify-end">
              <SecondaryButton onClick={onClose}>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        )}

        {step === 'confirm' && product && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-border bg-muted">
              <p className="font-medium">{product.name}</p>
              {product.sku && <p className="text-sm text-gray-500">SKU: {product.sku}</p>}
              {product.barcode && <p className="text-sm text-gray-500">Barcode: {product.barcode}</p>}
              {product.trackStock === false ? (
                <p className="text-sm mt-1 text-amber-700">
                  Made to order – stock is not tracked. Cannot receive stock.
                </p>
              ) : (
                <p className="text-sm mt-1">
                  {requiresVariant
                    ? selectedVariant
                      ? `Current stock (${selectedVariant.name}): ${formatInteger(displayQty)} ${product.unit || 'units'}`
                      : 'Select a variant to see current stock'
                    : `Current stock: ${formatInteger(displayQty)} ${product.unit || 'units'}`}
                </p>
              )}
            </div>

            {product.trackStock !== false && requiresVariant && (
              <div className="space-y-2">
                <Label htmlFor="receive-variant">Variant</Label>
                {variantsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading variants…
                  </div>
                ) : variants.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    This product is marked as having variants, but none were found. Add variants on the product first.
                  </p>
                ) : (
                  <>
                    <Select
                      value={selectedVariantId || undefined}
                      onValueChange={setSelectedVariantId}
                    >
                      <SelectTrigger id="receive-variant" className="w-full">
                        <SelectValue placeholder="Select variant to receive" />
                      </SelectTrigger>
                      <SelectContent>
                        {variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variantLabel(variant)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {variants.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {variants.map((variant) => (
                          <button
                            key={`chip-${variant.id}`}
                            type="button"
                            onClick={() => setSelectedVariantId(variant.id)}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs transition-colors',
                              selectedVariantId === variant.id
                                ? 'border-[#166534] bg-[#f0fdf4] text-[#166534]'
                                : 'border-border bg-white text-foreground hover:bg-muted'
                            )}
                          >
                            {variant.name || 'Variant'}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {product.trackStock !== false && (
            <div className="space-y-2">
              <Label htmlFor="receive-qty">Quantity received</Label>
              <Input
                id="receive-qty"
                type="number"
                min={1}
                value={numberInputValue(qtyReceived)}
                disabled={requiresVariant && !selectedVariantId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || v === null) {
                    setQtyReceived('');
                    return;
                  }
                  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''), 10);
                  setQtyReceived(Number.isFinite(n) && n >= 1 ? n : '');
                }}
              />
            </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <SecondaryButton onClick={handleAddAnother} disabled={loading}>
                Add another product
              </SecondaryButton>
              <SecondaryButton onClick={handleDone} disabled={loading}>
                Done
              </SecondaryButton>
              {product.trackStock !== false && (
              <Button onClick={handleAddToStock} loading={loading} disabled={!canAddStock}>
                Add to stock
              </Button>
              )}
            </div>
          </div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
