import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Package, Search } from 'lucide-react';
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
import { resolveImageUrl } from '../utils/fileUtils';

const CHUNK_SIZE = 50;
const ROWS_PER_PAGE = 60;

const errorText = (err) => err?.response?.data?.message || err?.message || 'Could not publish';

/** Why a product can't be published yet, or '' when it can. Mirrors the server's publish rules. */
export const publishBlocker = (product) => {
  if (!product?.imageUrl) return 'No photo';
  if (!(Number(product.sellingPrice) > 0)) return 'No price';
  return '';
};

const photoCount = (product) => (product.imageUrl ? 1 : 0) + Object.keys(product.storeImages || {}).length;

/**
 * Publish many products to the online store in one go, each with the photos saved on it (A = cover, B–E = gallery).
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, initialSelectedIds?: string[], onPublished?: () => void }} props
 */
export default function BulkPublishToStoreDialog({ open, onOpenChange, initialSelectedIds = [], onPublished }) {
  const [step, setStep] = useState('select');
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('not_live');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [rowsShown, setRowsShown] = useState(ROWS_PER_PAGE);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ published: [], skipped: [], failed: [] });

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCatalog(await productService.getProductImageIndex());
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setFilter('not_live');
    setSearch('');
    setRowsShown(ROWS_PER_PAGE);
    setSelected(new Set(initialSelectedIds));
    setResult({ published: [], skipped: [], failed: [] });
    loadCatalog();
    // initialSelectedIds is read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadCatalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((p) => (filter === 'all' || !p.liveOnStore)
      && (!q || [p.name, p.productCode, p.sku, p.barcode].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [catalog, filter, search]);

  const eligibleVisible = visible.filter((p) => !publishBlocker(p));
  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((p) => selected.has(p.id));
  const blockedCount = catalog.filter((p) => !p.liveOnStore && publishBlocker(p)).length;
  const selectedIds = catalog.filter((p) => selected.has(p.id) && !publishBlocker(p)).map((p) => p.id);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    eligibleVisible.forEach((p) => (allVisibleSelected ? next.delete(p.id) : next.add(p.id)));
    return next;
  });

  const publish = async () => {
    const chunks = [];
    for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) chunks.push(selectedIds.slice(i, i + CHUNK_SIZE));
    const names = new Map(catalog.map((p) => [p.id, p.name]));
    const published = [];
    const skipped = [];
    const failed = [];
    setStep('publishing');
    setProgress({ done: 0, total: selectedIds.length });
    for (const chunk of chunks) {
      try {
        const res = await productService.bulkPublishToStore(chunk);
        const data = res?.data ?? res;
        published.push(...(data?.published || []));
        skipped.push(...(data?.skipped || []).map((s) => ({ ...s, name: s.name || names.get(s.id) || s.id })));
      } catch (err) {
        failed.push(...chunk.map((id) => ({ id, name: names.get(id) || id, reason: errorText(err) })));
      }
      setProgress((p) => ({ ...p, done: p.done + chunk.length }));
    }
    setResult({ published, skipped, failed });
    setStep('done');
    if (published.length) onPublished?.();
  };

  const busy = step === 'publishing';
  const problems = [...result.skipped, ...result.failed];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish to online store</DialogTitle>
          <DialogDescription>
            Pick the products to publish. Each one goes live with its saved photos, name and selling price; you can edit any listing afterwards.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {loadError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">Could not load products: {loadError}</span>
              <Button type="button" size="sm" variant="outline" onClick={loadCatalog}>Retry</Button>
            </div>
          ) : null}

          {step === 'select' ? (
            loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setRowsShown(ROWS_PER_PAGE); }}
                      placeholder="Search by name or code"
                      aria-label="Search products"
                      className="h-9 w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                  <div className="flex rounded-md border border-border p-0.5 text-sm" role="group" aria-label="Show">
                    {[['not_live', 'Not on store'], ['all', 'All products']].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={filter === value}
                        onClick={() => { setFilter(value); setRowsShown(ROWS_PER_PAGE); }}
                        className={cn('rounded px-3 py-1.5', filter === value ? 'bg-muted font-medium' : 'text-muted-foreground')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {blockedCount > 0 ? (
                  <p className="text-xs text-amber-700">
                    {blockedCount} product{blockedCount === 1 ? '' : 's'} can&apos;t be published yet: they need a photo and a selling price above zero.
                  </p>
                ) : null}

                <label className="flex items-center gap-3 border-b border-border pb-2 text-sm font-medium">
                  <Checkbox checked={allVisibleSelected} disabled={!eligibleVisible.length} onCheckedChange={toggleAllVisible} />
                  Select all {eligibleVisible.length} shown
                  <span className="ml-auto font-normal text-muted-foreground">{selectedIds.length} selected</span>
                </label>

                {visible.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {filter === 'not_live' && !search ? 'Every product is already on your store.' : 'No products found.'}
                  </p>
                ) : null}

                <ul className="space-y-1">
                  {visible.slice(0, rowsShown).map((product) => {
                    const blocker = publishBlocker(product);
                    return (
                      <li key={product.id}>
                        <label className={cn('flex items-center gap-3 rounded-md px-1 py-1.5', blocker ? 'opacity-60' : 'cursor-pointer hover:bg-muted')}>
                          <Checkbox
                            checked={!blocker && selected.has(product.id)}
                            disabled={Boolean(blocker)}
                            onCheckedChange={() => toggle(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                            {product.imageUrl
                              ? <img src={resolveImageUrl(product.imageUrl) || ''} alt="" loading="lazy" className="h-full w-full object-cover" />
                              : <Package className="h-5 w-5 text-muted-foreground" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{product.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[product.productCode || product.sku, product.imageUrl ? `${photoCount(product)} photo${photoCount(product) === 1 ? '' : 's'}` : null]
                                .filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {blocker ? <span className="shrink-0 text-xs text-amber-700">{blocker}</span> : null}
                          {!blocker && product.liveOnStore ? <span className="shrink-0 text-xs text-green-700">Live</span> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {visible.length > rowsShown ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setRowsShown((n) => n + ROWS_PER_PAGE)}>
                    <ChevronDown className="mr-2 h-4 w-4" />Show more ({visible.length - rowsShown} left)
                  </Button>
                ) : null}
              </>
            )
          ) : null}

          {step === 'publishing' ? (
            <div className="space-y-3 py-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
              <p className="text-sm font-medium" role="status" aria-live="polite">Publishing {progress.done} of {progress.total} products</p>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="mx-auto h-2.5 max-w-sm bg-muted" />
              <p className="text-xs text-muted-foreground">Keep this page open until it finishes.</p>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>{result.published.length} product{result.published.length === 1 ? '' : 's'} published to your store.</span>
              </div>
              {problems.length ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">{problems.length} not published</p>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {problems.map((p) => <li key={p.id}>{p.name}: {p.reason}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {step === 'select' ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" disabled={!selectedIds.length || loading} onClick={publish}>
                Publish{selectedIds.length ? ` ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'}` : ''}
              </Button>
            </>
          ) : (
            <Button type="button" variant={step === 'done' ? 'default' : 'outline'} disabled={busy} onClick={() => onOpenChange(false)}>
              {step === 'done' ? 'Done' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
