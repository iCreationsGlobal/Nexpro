import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, Minus, Package, Plus, Search, X } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import productService from '../services/productService';
import { useHardwareBarcodeScanner } from '../hooks/useHardwareBarcodeScanner';
import { useScanningEnabled } from '../hooks/usePOSConfig';
import useDebounce from '../hooks/useDebounce';
import { parseProductQRPayload } from '../utils/productQR';
import { getActiveVariants, getProductStockQuantity } from '../utils/productStock';
import { getActiveShopIdForScope } from '../utils/shopScope';
import { resolveImageUrl } from '../utils/fileUtils';
import { NUMBER_LOCALE, parseDecimalInput, toNumber } from '../utils/formatNumber';
import { getErrorMessage, showSuccess } from '../utils/toast';

// The camera scanner lives with the POS; load it only when someone opens the camera.
const CameraScanner = lazy(() => import('./pos/POSProductSearch').then((module) => ({ default: module.QRCodeScanner })));

const PAGE_SIZE = 30;
const SEARCH_DELAY_MS = 250;
const STOCK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

const unwrap = (r) => r?.data?.product ?? r?.data?.data ?? r?.data ?? r;
const listOf = (r) => {
  const data = unwrap(r);
  return Array.isArray(data) ? data : r?.products ?? [];
};

const lineKey = (productId, variantId = null) => `${productId}:${variantId || ''}`;
const toQuantity = (value) => {
  const quantity = parseDecimalInput(value);
  return Number.isFinite(quantity) ? quantity : 0;
};
const formatQuantity = (value) => toNumber(value).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 2 });
const isVariantProduct = (product) => Boolean(product?.hasVariants) || getActiveVariants(product).length > 0;
const isUntracked = (product, variant = null) => product?.trackStock === false || variant?.trackStock === false;

/** A delivery line for a product or one of its variants. */
const newLine = (product, variant = null, quantity = '') => ({
  key: lineKey(product.id, variant?.id),
  productId: product.id,
  variantId: variant?.id || null,
  name: variant ? `${product.name} — ${variant.name}` : product.name,
  quantity,
});

// Unsaved deliveries are kept per workspace and shop, so closing the dialog or losing signal keeps them.
const currentDraftKey = () => {
  try {
    return `receiveStockDraft:${localStorage.getItem('activeTenantId') || ''}:${getActiveShopIdForScope() || ''}`;
  } catch {
    return null;
  }
};
const readDraft = (key) => {
  try {
    const saved = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
    return Array.isArray(saved) ? saved.filter((line) => line?.key && line.productId && line.name) : [];
  } catch {
    return [];
  }
};
const writeDraft = (key, lines) => {
  try {
    if (!key) return;
    if (lines.length) localStorage.setItem(key, JSON.stringify(lines));
    else localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode); the delivery still works without a draft.
  }
};

function QuantityStepper({ line, disabled, onStep, onChange }) {
  const amount = toQuantity(line.quantity);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10"
        aria-label={`One less ${line.name}`}
        disabled={disabled || amount <= 0}
        onClick={() => onStep(line, -1)}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        data-receiving-key={line.key}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        placeholder="0"
        aria-label={`Quantity received for ${line.name}`}
        className="h-10 w-16 px-1 text-center"
        value={line.quantity}
        disabled={disabled}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(line, event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10"
        aria-label={`One more ${line.name}`}
        disabled={disabled}
        onClick={() => onStep(line, 1)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProductPhoto({ product }) {
  const src = resolveImageUrl(product?.imageUrl);
  return src ? (
    <img src={src} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md border object-cover" />
  ) : (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <Package className="h-5 w-5" />
    </div>
  );
}

/**
 * Receive a delivery: browse, search or scan products (barcode scanner or phone camera), set how
 * many arrived with +/− or by typing, then save the whole delivery in one request.
 * @param {{ open: boolean, onClose: () => void, onSuccess?: () => void, initialProduct?: object|null }} props
 */
export default function ReceiveStockModal({ open, onClose, onSuccess, initialProduct = null }) {
  const { scanningEnabled } = useScanningEnabled();
  const [lines, setLines] = useState([]);
  const [restoredCount, setRestoredCount] = useState(0);
  const [view, setView] = useState('browse');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), SEARCH_DELAY_MS);
  const [filter, setFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [pinned, setPinned] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastScanned, setLastScanned] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);

  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const saving = useRef(false);
  const draftKey = useRef(null);
  const scanProducts = useRef(new Map());
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  // Declared before the open/reset effect so a restored draft's notice survives the first render.
  useEffect(() => {
    if (!lines.length) setRestoredCount(0);
  }, [lines.length]);

  useEffect(() => {
    generation.current += 1;
    scanProducts.current.clear();
    setQuery('');
    setFilter('all');
    setPage(1);
    setView('browse');
    setPinned([]);
    setCatalog([]);
    setExpanded(new Set());
    setError('');
    setNotice('');
    setLastScanned(null);
    setPending(0);
    setCameraOpen(false);
    if (!open) {
      draftKey.current = null;
      setLines([]);
      return undefined;
    }
    draftKey.current = currentDraftKey();
    const draft = readDraft(draftKey.current);
    setLines(draft);
    setRestoredCount(draft.length);
    if (initialProduct) enqueue((token) => showProduct(initialProduct, token));
    return () => { generation.current += 1; };
    // enqueue/showProduct only read refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProduct]);

  useEffect(() => {
    if (draftKey.current) writeDraft(draftKey.current, lines);
  }, [lines]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    productService.getCategories()
      .then((response) => { if (active) setCategories(listOf(response).filter((category) => category?.id)); })
      .catch(() => { if (active) setCategories([]); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const params = { page, limit: PAGE_SIZE, search: debouncedQuery, isActive: true, includeVariants: true, sort: 'name_asc' };
    if (filter === 'low') params.lowStock = true;
    else if (filter === 'out') params.outOfStock = true;
    else if (filter !== 'all') params.categoryId = filter;
    setLoadingList(true);
    productService.getProducts(params)
      .then((response) => {
        if (!active) return;
        const rows = listOf(response).filter((product) => product?.id);
        setCatalog((old) => (page === 1 ? rows : [...old, ...rows.filter((row) => !old.some((item) => item.id === row.id))]));
        setHasMore(page < (Number(response?.pagination?.totalPages) || 1));
      })
      .catch((err) => { if (active) setError(getErrorMessage(err, 'Could not load products.')); })
      .finally(() => { if (active) setLoadingList(false); });
    return () => { active = false; };
  }, [open, debouncedQuery, filter, page]);

  /** Set a line's quantity as typed. Clearing the box removes the line. */
  function changeLine(template, value) {
    setLines((old) => {
      if (value === '' || value == null) return old.filter((line) => line.key !== template.key);
      return old.some((line) => line.key === template.key)
        ? old.map((line) => (line.key === template.key ? { ...line, quantity: value } : line))
        : [...old, { ...template, quantity: value }];
    });
  }

  /** Add or take away units with the +/− buttons. Reaching 0 removes the line. */
  function stepLine(template, delta) {
    setLines((old) => {
      const existing = old.find((line) => line.key === template.key);
      const next = Math.max(0, toQuantity(existing?.quantity) + delta);
      if (next <= 0) return old.filter((line) => line.key !== template.key);
      return existing
        ? old.map((line) => (line.key === template.key ? { ...line, quantity: next } : line))
        : [...old, { ...template, quantity: next }];
    });
  }

  function lineFor(product, variant = null) {
    return lines.find((line) => line.key === lineKey(product.id, variant?.id)) || newLine(product, variant);
  }

  function pinProduct(product) {
    setPinned((old) => [product, ...old.filter((item) => item.id !== product.id)]);
    if (isVariantProduct(product)) setExpanded((old) => new Set(old).add(product.id));
  }

  async function withVariants(product, token) {
    if (getActiveVariants(product).length || !product.hasVariants) return product;
    const variants = listOf(await productService.getProductVariants(product.id));
    return token === generation.current ? { ...product, variants } : null;
  }

  /** Bring a product to the top of the list (opened from a product, or a scanned variant product). */
  async function showProduct(product, token) {
    const loaded = await withVariants(product, token);
    if (loaded) pinProduct(loaded);
  }

  async function receiveScanned(product, token) {
    if (!product?.id) throw new Error('No matching product found.');
    const chosen = product.selectedVariant?.id ? product.selectedVariant : null;
    if (isUntracked(product, chosen)) throw new Error(`${product.name}: stock is not tracked for this item.`);
    if (chosen) {
      addOne(product, chosen);
      return;
    }
    if (!isVariantProduct(product)) {
      addOne(product);
      return;
    }
    const loaded = await withVariants(product, token);
    if (!loaded) return;
    const variants = getActiveVariants(loaded);
    if (!variants.length) throw new Error(`${product.name} has no active variants.`);
    if (variants.length === 1) {
      addOne(loaded, variants[0]);
      return;
    }
    // Several sizes/colours share this code: show them all so the right ones can be counted.
    pinProduct(loaded);
    setCameraOpen(false);
    setView('browse');
    setNotice(`Set how many of each ${product.name} option arrived.`);
  }

  function addOne(product, variant = null) {
    const template = newLine(product, variant);
    stepLine(template, 1);
    setLastScanned(template.name);
    setNotice(`Added ${template.name}.`);
    setQuery('');
  }

  function enqueue(work) {
    if (saving.current) return;
    const token = generation.current;
    setPending((n) => n + 1);
    queue.current = queue.current.then(async () => {
      if (token !== generation.current) return;
      try {
        await work(token);
      } catch (err) {
        if (token === generation.current) setError(err?.message || 'Could not find product.');
      } finally {
        if (token === generation.current) setPending((n) => Math.max(0, n - 1));
      }
    });
  }

  // A hardware scanner types into whatever is focused. When that is a quantity box, remember the
  // quantity it had before the burst so the scan does not change it.
  const scanEdit = useRef(null);
  const lastKey = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const capture = (event) => {
      if (event.key.length !== 1) return;
      const now = Date.now();
      if (now - lastKey.current > 50) {
        const key = event.target?.dataset?.receivingKey;
        const line = linesRef.current.find((item) => item.key === key);
        scanEdit.current = key ? { key, quantity: line ? line.quantity : null } : null;
      }
      lastKey.current = now;
    };
    document.addEventListener('keydown', capture, true);
    return () => document.removeEventListener('keydown', capture, true);
  }, [open]);

  function scan(code, { hardware = false, typed = false } = {}) {
    if (hardware && scanEdit.current) {
      const original = scanEdit.current;
      setLines((old) => (original.quantity === null
        ? old.filter((line) => line.key !== original.key)
        : old.map((line) => (line.key === original.key ? { ...line, quantity: original.quantity } : line))));
      scanEdit.current = null;
    }
    setError('');
    enqueue(async (token) => {
      let product = scanProducts.current.get(code);
      if (!product) {
        if (code.startsWith('{')) {
          const parsed = parseProductQRPayload(code);
          if (!parsed.success) throw new Error(parsed.error);
          product = await productService.resolveProductFromQRPayload(parsed.data);
        } else {
          try {
            product = unwrap(await productService.getProductByBarcode(code));
          } catch (err) {
            if (err?.response?.status !== 404) throw err;
            product = null;
          }
        }
        if (token !== generation.current) return;
        if (product?.id) scanProducts.current.set(code, product);
      }
      if (!product?.id && typed) {
        // Enter after typing a name: the list below already shows the matches.
        if (catalogRef.current.length) return;
        throw new Error(`No product has the barcode “${code}”. Search by name or pick it from the list.`);
      }
      await receiveScanned(product, token);
    });
  }

  useHardwareBarcodeScanner((code) => scan(code, { hardware: true }), { enabled: open && !busy });

  // The camera keeps the callbacks it started with, so hand it stable ones.
  const scanRef = useRef(scan);
  scanRef.current = scan;
  const cameraScan = useMemo(() => (code) => scanRef.current(code), []);
  const closeCamera = useMemo(() => () => setCameraOpen(false), []);

  const toReceive = useMemo(() => lines.filter((line) => toQuantity(line.quantity) > 0), [lines]);
  const totalUnits = toReceive.reduce((sum, line) => sum + toQuantity(line.quantity), 0);
  const visibleProducts = useMemo(() => {
    const pinnedIds = new Set(pinned.map((product) => product.id));
    return [...pinned, ...catalog.filter((product) => !pinnedIds.has(product.id))];
  }, [pinned, catalog]);

  function chooseFilter(value) {
    setFilter(value);
    setPage(1);
  }

  function toggleExpanded(productId) {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function startOver() {
    setLines([]);
    setRestoredCount(0);
    setView('browse');
  }

  async function receiveAll() {
    if (saving.current || pending || !toReceive.length) return;
    if (lines.some((line) => toQuantity(line.quantity) < 0)) {
      setError('Quantities cannot be below zero.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await productService.receiveStock(toReceive.map((line) => ({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        quantity: toQuantity(line.quantity),
      })));
      writeDraft(draftKey.current, []);
      setLines([]);
      showSuccess(`Received ${formatQuantity(totalUnits)} units across ${toReceive.length} item${toReceive.length === 1 ? '' : 's'}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(`Nothing was saved. ${getErrorMessage(err, 'Check your connection and try again.')}`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const renderProduct = (product) => {
    const stock = getProductStockQuantity(product);
    const variants = getActiveVariants(product);
    const hasOptions = isVariantProduct(product);
    const isOpen = expanded.has(product.id);
    const addedUnits = lines
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + Math.max(0, toQuantity(line.quantity)), 0);

    return (
      <li key={product.id} className="py-2">
        <div className="flex items-center gap-3">
          <ProductPhoto product={product} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{product.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isUntracked(product) ? 'Stock not tracked' : `In stock ${formatQuantity(stock)}`}
              {addedUnits > 0 ? ` · +${formatQuantity(addedUnits)} arriving` : ''}
            </p>
          </div>
          {isUntracked(product) ? null : hasOptions ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 gap-1 px-3"
              aria-expanded={isOpen}
              onClick={() => toggleExpanded(product.id)}
            >
              {variants.length ? `${variants.length} options` : 'Options'}
              <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
            </Button>
          ) : (
            <QuantityStepper line={lineFor(product)} disabled={busy} onStep={stepLine} onChange={changeLine} />
          )}
        </div>
        {hasOptions && isOpen && (
          <ul className="mt-2 space-y-1 border-l-2 pl-3 sm:ml-14">
            {!variants.length && <li className="py-1 text-sm text-muted-foreground">No active options.</li>}
            {variants.map((variant) => (
              <li key={variant.id} className="flex items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{variant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isUntracked(product, variant) ? 'Stock not tracked' : `In stock ${formatQuantity(variant.quantityOnHand)}`}
                  </p>
                </div>
                {!isUntracked(product, variant) && (
                  <QuantityStepper line={lineFor(product, variant)} disabled={busy} onStep={stepLine} onChange={changeLine} />
                )}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const emptyMessage = debouncedQuery
    ? `No products match “${debouncedQuery}”.`
    : filter === 'low'
      ? 'Nothing is low on stock.'
      : filter === 'out'
        ? 'Nothing is out of stock.'
        : 'No products here yet.';

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            Tap + or type how many arrived. Search, scan, or pick from the list.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            {view === 'browse' ? (
              <>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Scan or search products"
                      placeholder="Search name, SKU or barcode"
                      className="h-11 pl-9"
                      value={query}
                      disabled={busy}
                      onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (query.trim()) scan(query.trim(), { typed: true });
                      }}
                    />
                  </div>
                  {scanningEnabled && (
                    <Button type="button" variant="outline" className="h-11 shrink-0 gap-2 px-3" disabled={busy} onClick={() => setCameraOpen(true)}>
                      <Camera className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">Scan with camera</span>
                    </Button>
                  )}
                </div>

                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter products">
                  {[...STOCK_FILTERS, ...categories.map((category) => ({ value: category.id, label: category.name }))].map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={filter === option.value ? 'default' : 'outline'}
                      className="h-8 shrink-0 rounded-full"
                      aria-pressed={filter === option.value}
                      onClick={() => chooseFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm font-medium">This delivery</p>
            )}

            {restoredCount > 0 && lines.length > 0 && (
              <div role="status" className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <span>We kept {restoredCount} item{restoredCount === 1 ? '' : 's'} you had not received yet.</span>
                <Button type="button" variant="ghost" size="sm" className="shrink-0" disabled={busy} onClick={startOver}>Start over</Button>
              </div>
            )}
            {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {!error && (notice || pending > 0) && (
              <p role="status" className="text-sm text-muted-foreground">{pending > 0 ? 'Finding product…' : notice}</p>
            )}

            {view === 'browse' ? (
              <>
                <ul className="divide-y">{visibleProducts.map(renderProduct)}</ul>
                {loadingList && <p className="py-4 text-center text-sm text-muted-foreground">Loading products…</p>}
                {!loadingList && !visibleProducts.length && (
                  <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
                )}
                {!loadingList && hasMore && (
                  <Button type="button" variant="outline" className="w-full" onClick={() => setPage((n) => n + 1)}>
                    Show more products
                  </Button>
                )}
              </>
            ) : lines.length ? (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 truncate font-medium">{line.name}</p>
                    <div className="flex items-center justify-between gap-2">
                      <QuantityStepper line={line} disabled={busy} onStep={stepLine} onChange={changeLine} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        aria-label={`Remove ${line.name}`}
                        disabled={busy}
                        onClick={() => changeLine(line, '')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing added yet. Tap + beside a product.</p>
            )}
          </div>
        </DialogBody>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t bg-background px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm" aria-live="polite">
            {toReceive.length} item{toReceive.length === 1 ? '' : 's'} · {formatQuantity(totalUnits)} unit{totalUnits === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => setView((current) => (current === 'browse' ? 'review' : 'browse'))}
            >
              {view === 'browse' ? `Review (${toReceive.length})` : 'Add more'}
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 sm:flex-none"
              disabled={busy || pending > 0 || !toReceive.length}
              onClick={receiveAll}
            >
              {busy ? 'Receiving…' : 'Receive stock'}
            </Button>
          </div>
        </div>

        {cameraOpen && (
          <Suspense fallback={null}>
            <CameraScanner
              isOpen
              continuousMode
              cameraEnabled
              scannedCount={toReceive.length}
              lastScannedItem={lastScanned}
              onScan={cameraScan}
              onClose={closeCamera}
              onDone={closeCamera}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
