import { useState } from 'react';
import { ChevronRight, Loader2, Package, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';

/** Stock label for a product row; products that don't track stock show nothing. */
export const getSimpleStockLabel = (product) => {
  if (product?.trackStock === false || product?.hasVariants) return null;
  const qty = Number(product?.quantityOnHand || 0);
  const reorder = Number(product?.reorderLevel || 0);
  if (qty <= 0) return { text: 'Out of stock', tone: 'text-red-700' };
  if (reorder > 0 && qty <= reorder) return { text: `Low · ${qty} left`, tone: 'text-amber-700' };
  return { text: `${qty} in stock`, tone: 'text-muted-foreground' };
};

const ProductThumb = ({ product }) => {
  const [failed, setFailed] = useState(false);
  const url = resolveImageUrl(product?.imageUrl);
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
      {url && !failed
        ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <Package className="h-6 w-6 text-muted-foreground" />}
    </span>
  );
};

/**
 * Simple Mode products page: a big Add product button, a search box and a list with photo,
 * price and how many are left. Tapping a product opens it.
 */
export default function SimpleProductsList({
  products,
  loading,
  totalCount,
  search,
  onSearchChange,
  onAdd,
  onOpenProduct,
  page,
  totalPages,
  onPageChange,
}) {
  const searching = Boolean(String(search || '').trim());
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Products</h1>

      <Button
        type="button"
        onClick={onAdd}
        className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white hover:bg-brand-dark sm:h-20 sm:text-2xl"
      >
        <Plus className="mr-3 h-7 w-7" />
        Add product
      </Button>

      <label className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 focus-within:ring-2 focus-within:ring-brand">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="h-full w-full min-w-0 bg-transparent text-base outline-none"
        />
      </label>

      <p className="text-sm text-muted-foreground">
        {loading ? 'Loading…' : `${totalCount} ${totalCount === 1 ? 'product' : 'products'}${searching ? ' found' : ''}`}
      </p>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground" role="status">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          {searching ? 'No product matches that search.' : 'No products yet. Tap Add product to add one.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {products.map((product) => {
            const stock = getSimpleStockLabel(product);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onOpenProduct(product)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <ProductThumb product={product} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{product.name}</p>
                    {stock ? <p className={`mt-0.5 text-sm font-medium ${stock.tone}`}>{stock.text}</p> : null}
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatAmount(product.sellingPrice)}</p>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
