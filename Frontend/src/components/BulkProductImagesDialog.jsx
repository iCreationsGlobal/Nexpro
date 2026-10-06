import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Globe, ImagePlus, Loader2, Search, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import productService from '../services/productService';
import { compressProductImageFile, isProductImageFile, PRODUCT_IMAGE_ACCEPT, PRODUCT_IMAGE_MAX_INPUT_BYTES } from '../utils/compressProductImage';
import { resolveImageUrl } from '../utils/fileUtils';
import { existingSlotImage, matchImagesToProducts, planProductImageSaves, PRODUCT_IMAGE_SLOTS } from '../utils/productImageMatching';

const SAVE_CONCURRENCY = 3;
const ROWS_PER_PAGE = 60;

const errorText = (err) => err?.response?.data?.message || err?.message || 'Could not save';

/** Search the catalog to assign a photo the app could not match by name. */
function ProductPicker({ products, suggestions = [], onPick }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return products.filter((p) => [p.name, p.productCode, p.sku, p.barcode]
      .some((value) => String(value || '').toLowerCase().includes(q))).slice(0, 6);
  }, [products, query, suggestions]);

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find product by name or code"
          aria-label="Find product"
          className="h-9 w-full bg-transparent text-sm outline-none"
        />
      </label>
      {results.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => onPick(product)}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <span className="truncate">{product.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{product.productCode || product.sku || product.barcode || ''}</span>
        </button>
      ))}
      {query.trim() && results.length === 0 ? <p className="px-2 text-xs text-muted-foreground">No products found.</p> : null}
    </div>
  );
}

/** One square in a product's A–E photo row. */
function SlotCell({ slot, newUrl, oldUrl, kept }) {
  const src = newUrl && !kept ? newUrl : (oldUrl ? resolveImageUrl(oldUrl) : '');
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground',
          newUrl && !kept ? 'border-2 border-brand' : 'border-border',
          !newUrl && oldUrl ? 'opacity-50' : ''
        )}
      >
        {src ? <img src={src} alt={`Photo ${slot}`} loading="lazy" className="h-full w-full object-cover" /> : '—'}
      </div>
      <span className="text-[11px] text-muted-foreground">{kept ? `${slot} · kept` : slot}</span>
    </div>
  );
}

/**
 * Bulk photo upload: staff name photos after the product code ("00001.jpg", "00001-B.jpg"),
 * drop them all in, check the matches, then save. A = main photo, B–E = extra online store photos.
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, onSaved?: () => void, onPublish?: (productIds: string[]) => void }} props
 */
export default function BulkProductImagesDialog({ open, onOpenChange, onSaved, onPublish }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState('pick');
  const [catalog, setCatalog] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [manual, setManual] = useState({});
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [updateLive, setUpdateLive] = useState(false);
  const [rowsShown, setRowsShown] = useState(ROWS_PER_PAGE);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ saved: [], failed: [] });

  const previewUrls = useMemo(() => new Map(files.map((file) => [file, URL.createObjectURL(file)])), [files]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  const reset = useCallback(() => {
    setStep('pick');
    setFiles([]);
    setIgnored([]);
    setManual({});
    setReplaceExisting(false);
    setUpdateLive(false);
    setRowsShown(ROWS_PER_PAGE);
    setProgress({ done: 0, total: 0 });
    setResult({ saved: [], failed: [] });
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await productService.getProductImageIndex();
      setCatalog(list);
      return list;
    } catch (err) {
      setLoadError(errorText(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadCatalog();
    else reset();
  }, [open, loadCatalog, reset]);

  const addFiles = (incoming) => {
    const list = Array.from(incoming || []);
    const photos = list.filter((file) => isProductImageFile(file) && file.size <= PRODUCT_IMAGE_MAX_INPUT_BYTES);
    setIgnored(list.filter((file) => !photos.includes(file)).map((file) => file.name));
    setFiles(photos);
    setManual({});
    setRowsShown(ROWS_PER_PAGE);
    if (photos.length) setStep('review');
  };

  // Auto matches by file name, then the photos staff assigned by hand; a second photo for the same slot loses.
  const matches = useMemo(() => {
    const auto = matchImagesToProducts(files, catalog);
    const claimed = new Set();
    return auto.map((match, i) => {
      const pick = manual[i];
      const entry = pick ? { ...match, product: pick.product, slot: pick.slot, status: 'matched', manual: true } : match;
      if (entry.status !== 'matched') return { ...entry, index: i };
      const key = `${entry.product.id}:${entry.slot}`;
      if (claimed.has(key)) return { ...entry, status: 'duplicate', index: i };
      claimed.add(key);
      return { ...entry, index: i };
    });
  }, [files, catalog, manual]);

  const plan = useMemo(() => planProductImageSaves(matches, { replaceExisting }), [matches, replaceExisting]);
  const unresolved = matches.filter((m) => m.status === 'no_match' || m.status === 'ambiguous');
  const leftOut = matches.filter((m) => m.status === 'duplicate' || m.status === 'too_many');
  const toSave = plan.filter((entry) => entry.photos.length > 0);
  const photoCount = toSave.reduce((n, entry) => n + entry.photos.length, 0);
  const existingCount = plan.reduce((n, entry) => n + entry.skipped.length + entry.photos.filter((p) => p.replaces).length, 0);
  const liveCount = toSave.filter((entry) => entry.product.liveOnStore).length;

  const assign = (match, product) => {
    const taken = new Set(matches.filter((m) => m.status === 'matched' && m.product.id === product.id).map((m) => m.slot));
    const slot = PRODUCT_IMAGE_SLOTS.find((s) => !taken.has(s) && !existingSlotImage(product, s))
      || PRODUCT_IMAGE_SLOTS.find((s) => !taken.has(s))
      || 'A';
    setManual((prev) => ({ ...prev, [match.index]: { product, slot } }));
  };

  const save = async () => {
    setStep('saving');
    setProgress({ done: 0, total: toSave.length });
    const queue = [...toSave];
    const failed = [];
    const saved = [];
    const worker = async () => {
      while (queue.length) {
        const entry = queue.shift();
        try {
          const images = {};
          for (const photo of entry.photos) {
            const prepared = await compressProductImageFile(photo.file);
            const res = await productService.uploadProductImage(prepared);
            const url = res?.data?.imageUrl ?? res?.imageUrl;
            if (!url) throw new Error(`Upload of ${photo.file.name} returned no image`);
            images[photo.slot] = url;
          }
          await productService.setProductImages(entry.product.id, images, {
            updateLiveListing: updateLive && entry.product.liveOnStore,
          });
          saved.push(entry.product.id);
        } catch (err) {
          failed.push({ name: entry.product.name, error: errorText(err) });
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(SAVE_CONCURRENCY, queue.length) }, worker));
    setResult({ saved, failed });
    setStep('done');
    if (saved.length > 0) onSaved?.();
  };

  const busy = step === 'saving';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload product images</DialogTitle>
          <DialogDescription>
            Name each photo after its product code, then add them all at once. Photo A is the main photo; B–E are extra photos for the online store.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {loadError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">Could not load products: {loadError}</span>
              <Button type="button" size="sm" variant="outline" onClick={loadCatalog}>Retry</Button>
            </div>
          ) : null}

          {step === 'pick' ? (
            <>
              <div className="overflow-hidden rounded-md border border-border text-sm">
                <table className="w-full">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 font-medium">File name</th><th className="px-3 py-2 font-medium">Becomes</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border"><td className="px-3 py-2 font-mono">00001.jpg</td><td className="px-3 py-2">Product 00001, main photo (A)</td></tr>
                    <tr className="border-t border-border"><td className="px-3 py-2 font-mono">00001-B.jpg</td><td className="px-3 py-2">Product 00001, store photo B</td></tr>
                    <tr className="border-t border-border"><td className="px-3 py-2 font-mono">00001-E.jpg</td><td className="px-3 py-2">Product 00001, store photo E (up to 5 photos)</td></tr>
                  </tbody>
                </table>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={PRODUCT_IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
              <button
                type="button"
                disabled={loading || Boolean(loadError)}
                onClick={() => inputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (!loading && !loadError) addFiles(e.dataTransfer.files); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                className={cn(
                  'flex min-h-[160px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors',
                  dragging ? 'border-brand bg-brand-5' : 'border-border bg-card',
                  (loading || loadError) && 'cursor-not-allowed opacity-70'
                )}
              >
                {loading ? <Loader2 className="mb-3 h-10 w-10 animate-spin text-brand" /> : <UploadCloud className="mb-3 h-10 w-10 text-brand" />}
                <span className="text-sm"><span className="font-medium text-brand">Select photos</span><span className="text-muted-foreground"> or drag them here</span></span>
                <span className="mt-1 text-xs text-muted-foreground">JPG, PNG, WEBP or iPhone HEIC · select many at once</span>
              </button>
              {ignored.length ? (
                <p className="text-sm text-amber-700">{ignored.length} file{ignored.length === 1 ? '' : 's'} skipped: not a photo or larger than {PRODUCT_IMAGE_MAX_INPUT_BYTES / 1024 / 1024}MB.</p>
              ) : null}
            </>
          ) : null}

          {step === 'review' ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-semibold">{toSave.length}</p>
                  <p className="text-xs text-muted-foreground">products get {photoCount} photo{photoCount === 1 ? '' : 's'}</p>
                </div>
                <div className={cn('rounded-md border p-3', unresolved.length ? 'border-amber-300 bg-amber-50' : 'border-border')}>
                  <p className="text-2xl font-semibold">{unresolved.length}</p>
                  <p className="text-xs text-muted-foreground">photos need a product</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-2xl font-semibold">{leftOut.length + ignored.length}</p>
                  <p className="text-xs text-muted-foreground">left out</p>
                </div>
              </div>

              {existingCount > 0 || liveCount > 0 ? (
                <div className="space-y-3 rounded-md border border-border p-3">
                  {existingCount > 0 ? (
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox checked={replaceExisting} onCheckedChange={(v) => setReplaceExisting(v === true)} className="mt-0.5" />
                      <span>
                        <span className="font-medium">Replace photos products already have</span>
                        <span className="block text-muted-foreground">{existingCount} photo{existingCount === 1 ? '' : 's'} would replace an existing one. Off keeps the old photos.</span>
                      </span>
                    </label>
                  ) : null}
                  {liveCount > 0 ? (
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox checked={updateLive} onCheckedChange={(v) => setUpdateLive(v === true)} className="mt-0.5" />
                      <span>
                        <span className="font-medium">Update photos on the online store too</span>
                        <span className="block text-muted-foreground">{liveCount} of these product{liveCount === 1 ? ' is' : 's are'} live on your store. Off changes them only for the next publish.</span>
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}

              {unresolved.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Photos that need a product</h3>
                  <p className="text-xs text-muted-foreground">No product code matched these names. Pick the product, or rename the file and add it again.</p>
                  {unresolved.map((match) => (
                    <div key={match.index} className="flex gap-3 rounded-md border border-amber-300 p-2">
                      <img src={previewUrls.get(match.file)} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{match.file.name}</p>
                        <p className="text-xs text-amber-700">
                          {match.status === 'ambiguous' ? `${match.candidates.length} products share this code. Pick one.` : 'No product has this code.'}
                        </p>
                        <ProductPicker products={catalog} suggestions={match.candidates || []} onPick={(product) => assign(match, product)} />
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {toSave.length || plan.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Matched products</h3>
                  {plan.slice(0, rowsShown).map((entry) => {
                    const fresh = new Map(entry.photos.map((p) => [p.slot, previewUrls.get(p.file)]));
                    const kept = new Map(entry.skipped.map((p) => [p.slot, previewUrls.get(p.file)]));
                    return (
                      <div key={entry.product.id} className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.product.productCode || entry.product.sku || entry.product.barcode}
                            {entry.product.liveOnStore ? ' · live on store' : ''}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          {PRODUCT_IMAGE_SLOTS.map((slot) => (
                            <SlotCell
                              key={slot}
                              slot={slot}
                              newUrl={fresh.get(slot) || kept.get(slot)}
                              oldUrl={existingSlotImage(entry.product, slot)}
                              kept={kept.has(slot)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {plan.length > rowsShown ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRowsShown((n) => n + ROWS_PER_PAGE)}>
                      <ChevronDown className="mr-2 h-4 w-4" />Show more ({plan.length - rowsShown} left)
                    </Button>
                  ) : null}
                </section>
              ) : null}

              {leftOut.length ? (
                <details className="rounded-md border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">{leftOut.length} photo{leftOut.length === 1 ? '' : 's'} left out</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {leftOut.map((match) => (
                      <li key={match.index}>
                        <span className="font-mono">{match.file.name}</span>
                        {match.status === 'too_many'
                          ? ` — ${match.product.name}: only photos A–E are allowed`
                          : ` — ${match.product.name} already gets a photo ${match.slot} from another file`}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                <ImagePlus className="mr-2 h-4 w-4" />Choose different photos
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={PRODUCT_IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </>
          ) : null}

          {step === 'saving' ? (
            <div className="space-y-3 py-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
              <p className="text-sm font-medium" role="status" aria-live="polite">Saving {progress.done} of {progress.total} products</p>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="mx-auto h-2.5 max-w-sm bg-muted" />
              <p className="text-xs text-muted-foreground">Keep this page open. If it closes, add the same photos again: saved ones are skipped.</p>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>Saved photos for {result.saved.length} product{result.saved.length === 1 ? '' : 's'}.</span>
              </div>
              {result.failed.length ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-medium">{result.failed.length} product{result.failed.length === 1 ? '' : 's'} failed. Add those photos again to retry.</p>
                  <ul className="mt-2 space-y-1">
                    {result.failed.map((f) => <li key={f.name}>{f.name}: {f.error}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {step === 'review' ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" disabled={!toSave.length} onClick={save}>
                Save photos{toSave.length ? ` (${toSave.length})` : ''}
              </Button>
            </>
          ) : step === 'done' ? (
            <>
              <Button type="button" variant="outline" onClick={() => { reset(); loadCatalog(); }}>Upload more</Button>
              {onPublish && result.saved.length ? (
                <Button type="button" variant="outline" onClick={() => onPublish(result.saved)}>
                  <Globe className="mr-2 h-4 w-4" />Publish them to the store
                </Button>
              ) : null}
              <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
