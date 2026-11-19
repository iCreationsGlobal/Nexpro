import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Package, Plus, Minus, Trash2, Banknote, Users, Search, Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';
import { getCatalogUnitPrice, isProductOutOfStock } from '../../utils/productStock';
import CartItemDetailsDialog from './CartItemDetailsDialog';

function ProductPicture({ product, className = '' }) {
  const [failed, setFailed] = useState(false);
  const url = resolveImageUrl(product?.imageUrl);
  return <div className={`flex items-center justify-center rounded-xl bg-white ${className}`}>
    {url && !failed ? <img src={url} alt={product?.name || ''} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain p-2" /> : <Package className="h-12 w-12 text-slate-400" />}
  </div>;
}

/** A product's own codes: its barcode, its other barcodes, SKU and product code. */
const codesOf = p => [p.barcode, p.sku, p.productCode, ...(Array.isArray(p.barcodes) ? p.barcodes.map(b => b?.barcode) : [])].filter(Boolean).map(String);
/** What a scanner sends: one word with a digit in it, or one of our QR labels. */
const looksLikeCode = text => text.startsWith('{') || (!/\s/.test(text) && /\d/.test(text));

/**
 * @param {(code: string) => void} [onCode] - looks a scanned code up as the full till does (every barcode a product or size has, QR labels)
 * @param {(text: string) => Promise<object[]>} [onSearch] - the full till's product search, for codes no loaded product has
 */
export default function SimplePOS({ products, loading, error, onRetry, cart, totals, onAdd, onQuantity, onClear, onCheckout, customer, onCustomer, isOnline, canCheckoutOffline = false, onScan, scanningEnabled, scanSignal = 0, onCode, onSearch }) {
  const [search, setSearch] = useState('');
  // A barcode scanner types into whatever has focus; after a scan adds the item, clear the
  // digits it left in the search box so the full product list comes back.
  useEffect(() => {
    if (scanSignal) setSearch('');
  }, [scanSignal]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Tapping a cart line shows the product in full, to check it's the right one.
  const [detailsId, setDetailsId] = useState(null);
  const detailsItem = detailsId ? cart.find(line => line.id === detailsId) ?? null : null;
  // Simple Mode keeps selling to pictures and a search box; no category filters.
  // Every typed word must appear somewhere, in any order ("body splash luminous" finds "Luminous Body Splash").
  const text = search.trim();
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = products.filter(p => {
    const words = `${p.name || ''} ${codesOf(p).join(' ')}`.toLowerCase();
    return terms.every(term => words.includes(term));
  });
  // Nothing loaded matches (a size's barcode, a product further down the list): ask the server,
  // as the full till's search does, and show what it finds.
  const [found, setFound] = useState(null);
  const askServer = Boolean(text && !visible.length && onSearch);
  useEffect(() => {
    if (!askServer) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      Promise.resolve(onSearch(text)).then(list => { if (active) setFound({ text, list: Array.isArray(list) ? list : [] }); }).catch(() => { if (active) setFound({ text, list: [] }); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [askServer, text, onSearch]);
  const fromServer = askServer && found?.text === text ? found.list : null;
  const looking = askServer && !fromServer;
  const shown = askServer ? fromServer || [] : visible;
  // Scanners press Enter after the code; so can someone who typed a name.
  const onEnter = e => {
    if (e.key !== 'Enter' || !text) return;
    e.preventDefault();
    const exact = shown.filter(p => codesOf(p).some(c => c.toLowerCase() === text.toLowerCase()));
    if (exact.length === 1) { onAdd(exact[0]); setSearch(''); return; }
    if (onCode && looksLikeCode(text)) { onCode(text); return; }
    if (shown.length === 1) { onAdd(shown[0]); setSearch(''); }
  };
  const quantities = useMemo(() => {
    const result = {};
    cart.forEach(item => { result[item.productId] = (result[item.productId] || 0) + item.quantity; });
    return result;
  }, [cart]);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
    <header className="flex items-center justify-between gap-3 pr-8">
      <h1 className="flex items-center gap-3 text-xl font-bold sm:text-3xl"><span className="rounded-2xl bg-green-700 p-3 text-white"><ShoppingCart className="h-8 w-8" /></span>Point of Sale</h1>
      <span role="status" className={`rounded-full px-3 py-2 font-semibold ${isOnline ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{isOnline ? '● Online' : 'Offline'}</span>
    </header>
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-5">
      <section aria-label="Products" className="flex min-h-0 flex-col gap-3 lg:col-span-3">
        <div className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3"><Search className="h-6 w-6 shrink-0" /><input aria-label="Find a product" placeholder="Find a product or scan a barcode" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onEnter} className="h-12 w-full bg-transparent outline-none" />{scanningEnabled && <button type="button" onClick={onScan} aria-label="Scan barcodes to sell" title="Scan barcodes to sell" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-green-800 transition-colors hover:bg-green-50"><Camera className="h-6 w-6" /></button>}</label></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? <div role="status" className="flex justify-center gap-2 p-10"><Loader2 className="animate-spin" />Loading products…</div> : error ? <div role="alert" className="p-6 text-center"><p>Could not load products.</p><Button onClick={onRetry} variant="outline" className="mt-3">Try again</Button></div> : looking ? <div role="status" className="flex justify-center gap-2 p-10"><Loader2 className="animate-spin" />Looking it up…</div> : shown.length === 0 ? <p className="p-8 text-center text-muted-foreground">No products found.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map(p => { const unavailable = isProductOutOfStock(p); return <button key={p.id} disabled={unavailable} onClick={() => onAdd(p)} className="relative flex min-h-48 items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:border-green-600 focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50" aria-label={`Add ${p.name} to cart`}>
              <ProductPicture product={p} className="h-36 w-2/5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-3"><span className="break-words text-lg font-semibold">{p.name}</span><span className="text-2xl font-bold text-green-700">{formatAmount(getCatalogUnitPrice(p))}</span><span className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-base font-bold ${unavailable ? 'bg-muted' : 'bg-green-700 text-white'}`}><Plus className="h-7 w-7 shrink-0" />{unavailable ? 'Out of stock' : 'Add to cart'}</span></div>
              {quantities[p.id] > 0 && <span className="absolute right-2 top-2 rounded-full bg-green-100 px-2 font-bold text-green-900">{quantities[p.id]} in cart</span>}
            </button>; })}
          </div>}
        </div>
      </section>
      <section aria-label="Cart" className={`${cartOpen ? 'fixed inset-0 z-50 p-3' : 'hidden'} min-h-0 flex-col rounded-2xl border bg-card lg:static lg:col-span-2 lg:flex lg:p-0`} style={cartOpen ? { display: 'flex' } : undefined}>
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl bg-green-50 p-4 text-green-950"><h2 className="flex items-center gap-2 text-2xl font-bold"><ShoppingCart className="h-9 w-9" />Cart <span className="rounded-full bg-green-100 px-3 text-lg" aria-live="polite">{totals.itemCount}</span></h2><div className="flex gap-2"><Button variant="ghost" disabled={!cart.length} onClick={() => setConfirmClear(true)} aria-label="Clear all items" className="h-12 gap-2 text-red-700"><Trash2 className="h-6 w-6" /><span className="hidden xl:inline">Clear All</span></Button><Button variant="outline" className="h-12 w-12 lg:hidden" aria-label="Back to products" onClick={() => setCartOpen(false)}><X /></Button></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {!cart.length && <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground"><ShoppingCart className="h-16 w-16" /><p>Tap a product to start</p></div>}
          {cart.map(item => <div key={item.id} className="flex items-center gap-3 border-b py-4"><button type="button" onClick={() => setDetailsId(item.id)} aria-label={`See the details of ${item.name}`} className="shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-green-600"><ProductPicture product={products.find(p => p.id === item.productId)} className="h-20 w-16" /></button><div className="min-w-0 flex-1"><button type="button" onClick={() => setDetailsId(item.id)} className="break-words text-left text-lg font-semibold underline-offset-4 hover:underline">{item.name}</button><p className="mt-1 font-semibold">{formatAmount(item.unitPrice)}</p><div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" className="h-12 w-12 border-red-200 text-red-700" aria-label={`Decrease ${item.name}`} onClick={() => onQuantity(item.id, item.quantity - 1)}><Minus className="h-6 w-6" /></Button><span className="min-w-10 text-center text-xl font-bold">{item.quantity}</span><Button className="h-12 w-12 bg-green-700 hover:bg-green-800" aria-label={`Increase ${item.name}`} onClick={() => onQuantity(item.id, item.quantity + 1)}><Plus className="h-6 w-6" /></Button><span className="ml-auto text-lg font-bold">{formatAmount(item.unitPrice * item.quantity - (item.discount || 0))}</span></div></div></div>)}
        </div>
        <div className="shrink-0 space-y-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onCustomer} className="h-12 w-full justify-start gap-3"><Users className="h-6 w-6" /><span className="truncate">{customer?.name || customer?.company || 'Customer (optional)'}</span></Button>
          {totals.taxAmount > 0 && <p className="flex justify-between text-sm"><span>{totals.taxLabel}</span><span>{formatAmount(totals.taxAmount)}</span></p>}
          <div className="flex flex-wrap items-center justify-between gap-2 text-2xl font-bold"><span>Total</span><span className="text-green-700">{formatAmount(totals.total)}</span></div>
          <Button disabled={!cart.length || (!isOnline && !canCheckoutOffline)} onClick={onCheckout} className="h-20 w-full gap-3 rounded-xl bg-green-700 text-2xl font-bold hover:bg-green-800"><Banknote className="h-9 w-9" />Take Payment</Button>
        </div>
      </section>
    </div>
    <Button onClick={() => setCartOpen(true)} className="h-16 shrink-0 gap-3 rounded-xl bg-green-700 text-lg hover:bg-green-800 lg:hidden"><ShoppingCart className="h-7 w-7" />Cart · {totals.itemCount} · {formatAmount(totals.total)}</Button>
    {detailsItem && <CartItemDetailsDialog item={detailsItem} onClose={() => setDetailsId(null)} onUpdateQuantity={onQuantity} onRemove={id => onQuantity(id, 0)} />}
    <Dialog open={confirmClear} onOpenChange={setConfirmClear}><DialogContent><DialogHeader><DialogTitle>Remove all items from this sale?</DialogTitle></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmClear(false)}>Keep items</Button><Button variant="destructive" onClick={() => { onClear(); setConfirmClear(false); }}>Clear all</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
