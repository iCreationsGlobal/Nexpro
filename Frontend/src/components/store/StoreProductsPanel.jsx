import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CornerDownLeft,
  EyeOff,
  Loader2,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react';

import productService from '../../services/productService';
import storeService from '../../services/storeService';
import { useDebounce } from '../../hooks/useDebounce';
import { DEBOUNCE_DELAYS } from '../../constants';
import { formatAmount } from '../../utils/formatNumber';
import { getCatalogUnitPrice } from '../../utils/productStock';
import { resolveImageUrl } from '../../utils/fileUtils';
import { getErrorMessage, showError, showSuccess } from '../../utils/toast';
import PublishToOnlineStoreDialog from './PublishToOnlineStoreDialog';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Manage Online Store listings from Edit store → Products.
 * @param {{
 *   homeSections?: Array<{ id: string, title: string, enabled?: boolean }> | null,
 * }} props
 */
const StoreProductsPanel = ({ homeSections = [] }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'picker'
  const [productSearch, setProductSearch] = useState('');
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishProduct, setPublishProduct] = useState(null);
  const productSearchInputRef = useRef(null);
  const debouncedProductSearch = useDebounce(productSearch, DEBOUNCE_DELAYS.INPUT);

  const queryParams = useMemo(() => ({
    limit: 100,
    ...(status !== 'all' ? { status } : {}),
  }), [status]);

  const { data: response, isLoading, refetch } = useQuery({
    queryKey: ['store', 'listings', 'edit-store', queryParams],
    queryFn: () => storeService.getListings(queryParams),
  });

  const { data: productsResponse, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'store-listing-picker', debouncedProductSearch],
    queryFn: () => productService.getProducts({
      isActive: true,
      includeVariants: true,
      search: debouncedProductSearch.trim(),
      limit: 50,
    }),
    enabled: view === 'picker',
  });

  const listings = useMemo(() => {
    const body = response?.data ? response : response || {};
    return Array.isArray(body.data) ? body.data : [];
  }, [response]);

  const products = useMemo(() => {
    const body = productsResponse?.data ? productsResponse : productsResponse || {};
    const rawProducts = body.products || body.data?.products || body.data || [];
    return Array.isArray(rawProducts) ? rawProducts : [];
  }, [productsResponse]);

  const listedProductIds = useMemo(
    () => new Set(listings.map((listing) => listing.productId).filter(Boolean)),
    [listings],
  );

  const productSearchTerm = productSearch.trim();

  useEffect(() => {
    if (view !== 'picker') {
      setProductSearch('');
      setHighlightedProductIndex(0);
      return undefined;
    }
    const focusTimer = window.setTimeout(() => productSearchInputRef.current?.focus(), 100);
    return () => window.clearTimeout(focusTimer);
  }, [view]);

  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [debouncedProductSearch, products.length]);

  const openPublishForProduct = useCallback((product) => {
    if (!product?.id) return;
    setPublishProduct(product);
    setPublishOpen(true);
  }, []);

  const handleRemoveFromStore = useCallback(async (listing) => {
    if (!listing?.id || listing.status !== 'published') return;
    setBusyId(listing.id);
    try {
      await storeService.unpublishListing(listing.id);
      showSuccess('Removed from store');
      refetch();
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to remove listing from store'));
    } finally {
      setBusyId(null);
    }
  }, [refetch]);

  const handleSelectProduct = useCallback((product) => {
    if (!product?.id) return;
    setView('list');
    openPublishForProduct(product);
  }, [openPublishForProduct]);

  const handleEditListing = useCallback((listing) => {
    const product = listing?.product
      ? { ...listing.product, id: listing.productId || listing.product.id }
      : {
        id: listing.productId,
        name: listing.title,
        sellingPrice: listing.publicPrice,
        imageUrl: listing.images?.[0],
      };
    openPublishForProduct(product);
  }, [openPublishForProduct]);

  const handleProductPickerKeyDown = useCallback((event) => {
    if (!products.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedProductIndex((current) => (current + 1) % products.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedProductIndex((current) => (current <= 0 ? products.length - 1 : current - 1));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleSelectProduct(products[highlightedProductIndex]);
    }
  }, [handleSelectProduct, highlightedProductIndex, products]);

  const handlePublishSuccess = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['store', 'listings'] });
  }, [queryClient, refetch]);

  const publishDialog = (
    <PublishToOnlineStoreDialog
      open={publishOpen}
      onOpenChange={(open) => {
        setPublishOpen(open);
        if (!open) setPublishProduct(null);
      }}
      product={publishProduct}
      homeSections={homeSections}
      onSuccess={handlePublishSuccess}
    />
  );

  if (view === 'picker') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setView('list')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <p className="text-sm text-muted-foreground">Pick a product from inventory</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={productSearchInputRef}
            className="h-11 rounded-xl pl-9"
            placeholder="Search products by name or SKU..."
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            onKeyDown={handleProductPickerKeyDown}
          />
          {productSearch ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
              aria-label="Clear product search"
              onClick={() => {
                setProductSearch('');
                productSearchInputRef.current?.focus();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {productSearchTerm
              ? `Showing matches for "${productSearchTerm}"`
              : 'Search inventory to add a product.'}
          </span>
          <span className="inline-flex items-center gap-1">
            Use arrows and Enter <CornerDownLeft className="h-3.5 w-3.5" />
          </span>
        </div>
        {productsLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {productSearchTerm ? `No products match "${productSearchTerm}"` : 'No products found'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {productSearchTerm
                ? 'Try a different name or SKU.'
                : 'Add products in inventory first.'}
            </p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              {productSearchTerm ? (
                <Button type="button" variant="outline" onClick={() => setProductSearch('')}>
                  Clear search
                </Button>
              ) : null}
              <Button asChild className="bg-[#166534] text-white hover:bg-[#14532d]">
                <Link to="/products">Go to Products</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid max-h-[min(50vh,28rem)] gap-3 overflow-y-auto pr-1">
            {products.map((product, index) => {
              const image = resolveImageUrl(product.imageUrl);
              const alreadyListed = listedProductIds.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-green-300 hover:bg-green-50/50 ${
                    highlightedProductIndex === index ? 'border-green-500 bg-green-50/70' : 'border-border'
                  }`}
                  aria-selected={highlightedProductIndex === index}
                  onMouseEnter={() => setHighlightedProductIndex(index)}
                  onClick={() => handleSelectProduct(product)}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[product.sku ? `SKU: ${product.sku}` : null, product.category?.name].filter(Boolean).join(' · ') || 'No SKU'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline">{formatAmount(getCatalogUnitPrice(product))}</Badge>
                    {alreadyListed ? (
                      <Badge variant="outline">On store</Badge>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {publishDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" onClick={() => setView('picker')} className="bg-[#166534] text-white hover:bg-[#14532d]">
          <Plus className="mr-2 h-4 w-4" />
          Add product
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No products on your store yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a product from inventory to publish it.
          </p>
          <Button type="button" className="mt-4 bg-[#166534] text-white hover:bg-[#14532d]" onClick={() => setView('picker')}>
            <Plus className="mr-2 h-4 w-4" />
            Add product
          </Button>
        </div>
      ) : (
        <div className="grid max-h-[min(60vh,32rem)] gap-3 overflow-y-auto pr-1">
          {listings.map((listing) => {
            const image = resolveImageUrl(listing.images?.[0] || listing.product?.imageUrl);
            const isPublished = listing.status === 'published';
            return (
              <div
                key={listing.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{listing.title}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {listing.shortDescription || listing.product?.name || 'No description'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Badge variant={isPublished ? 'default' : 'outline'}>{listing.status}</Badge>
                      {listing.metadata?.isSample === true ? (
                        <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                          Sample
                        </Badge>
                      ) : null}
                      <Badge variant="outline">{formatAmount(listing.publicPrice || 0)}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <Button type="button" size="sm" variant="outline" onClick={() => handleEditListing(listing)}>
                    Edit
                  </Button>
                  {isPublished ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === listing.id}
                      onClick={() => handleRemoveFromStore(listing)}
                    >
                      {busyId === listing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <EyeOff className="mr-2 h-4 w-4" />
                      )}
                      Remove from store
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {publishDialog}
    </div>
  );
};

export default StoreProductsPanel;
