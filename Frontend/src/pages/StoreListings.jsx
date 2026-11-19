import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, EyeOff, Loader2, Package, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import productService from '../services/productService';
import storeService from '../services/storeService';
import { useDebounce } from '../hooks/useDebounce';
import { showError, showSuccess, getErrorMessage } from '../utils/toast';
import { formatAmount } from '../utils/formatNumber';
import { resolveImageUrl } from '../utils/fileUtils';
import { DEBOUNCE_DELAYS } from '../constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ScanSearchButton from '@/components/ScanSearchButton';

const StoreListings = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const productSearchInputRef = useRef(null);
  const debouncedProductSearch = useDebounce(productSearch, DEBOUNCE_DELAYS.INPUT);
  const queryParams = useMemo(() => ({
    limit: 100,
    ...(status !== 'all' ? { status } : {}),
  }), [status]);

  const { data: response, isLoading, refetch } = useQuery({
    queryKey: ['store', 'listings', queryParams],
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
    enabled: createDialogOpen,
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

  const productSearchTerm = productSearch.trim();

  useEffect(() => {
    if (!createDialogOpen) {
      setProductSearch('');
      setHighlightedProductIndex(0);
      return;
    }

    const focusTimer = window.setTimeout(() => productSearchInputRef.current?.focus(), 100);
    return () => window.clearTimeout(focusTimer);
  }, [createDialogOpen]);

  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [debouncedProductSearch, products.length]);

  const handlePublishToggle = useCallback(async (listing) => {
    setBusyId(listing.id);
    try {
      if (listing.status === 'published') {
        await storeService.unpublishListing(listing.id);
        showSuccess('Listing hidden from store');
      } else {
        const response = await storeService.publishListing(listing.id);
        const savedListing = response?.data?.data || response?.data || response;
        showSuccess('Listing published');
        navigate(`/store/listings/${listing.productId}/published`, {
          state: { listing: savedListing, product: listing.product },
        });
      }
      refetch();
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to update listing'));
    } finally {
      setBusyId(null);
    }
  }, [navigate, refetch]);

  const handleSelectProduct = useCallback((productId) => {
    if (!productId) return;
    setCreateDialogOpen(false);
    navigate(`/store/listings/${productId}/edit`);
  }, [navigate]);

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
      handleSelectProduct(products[highlightedProductIndex]?.id);
    }
  }, [handleSelectProduct, highlightedProductIndex, products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Store listings</h1>
          <p className="text-muted-foreground">Products prepared for the public online store.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create listing
          </Button>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Package className="mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="font-semibold">No store listings yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Choose a product from your inventory and prepare it for your public store.
            </p>
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create listing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listings.map((listing) => {
            const image = resolveImageUrl(listing.images?.[0] || listing.product?.imageUrl);
            const isPublished = listing.status === 'published';
            return (
              <Card key={listing.id} className="border border-border">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                      {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{listing.title}</CardTitle>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{listing.shortDescription || listing.product?.name || 'No description'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={isPublished ? 'default' : 'outline'}>{listing.status}</Badge>
                        <Badge variant="outline">{formatAmount(listing.publicPrice || 0)}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/store/listings/${listing.productId}/edit`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant={isPublished ? 'outline' : 'default'}
                      disabled={busyId === listing.id}
                      onClick={() => handlePublishToggle(listing)}
                    >
                      {busyId === listing.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isPublished ? <EyeOff className="mr-2 h-4 w-4" /> : null)}
                      {isPublished ? 'Hide' : 'Publish'}
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create store listing</DialogTitle>
            <DialogDescription>
              Select an existing product to continue to the listing editor.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={productSearchInputRef}
                  className={`h-11 rounded-xl pl-9 ${productSearch ? 'pr-20' : 'pr-11'}`}
                  placeholder="Search products by name or SKU..."
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  onKeyDown={handleProductPickerKeyDown}
                />
                <ScanSearchButton onCode={setProductSearch} className={`absolute top-1/2 -translate-y-1/2 ${productSearch ? 'right-10' : 'right-1'}`} />
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
                    : 'Start typing to narrow the product list.'}
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
                      ? 'Try a different name, SKU, or barcode before creating a new product.'
                      : 'Add products first, then come back to create online listings.'}
                  </p>
                  <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                    {productSearchTerm ? (
                      <Button type="button" variant="outline" onClick={() => setProductSearch('')}>
                        Clear search
                      </Button>
                    ) : null}
                    <Button asChild>
                      <Link to="/products">Go to Products</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
                  {products.map((product, index) => {
                    const image = resolveImageUrl(product.imageUrl);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-green-300 hover:bg-green-50/50 ${
                          highlightedProductIndex === index ? 'border-green-500 bg-green-50/70' : 'border-border'
                        }`}
                        aria-selected={highlightedProductIndex === index}
                        onMouseEnter={() => setHighlightedProductIndex(index)}
                        onClick={() => handleSelectProduct(product.id)}
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {[product.sku ? `SKU: ${product.sku}` : null, product.category?.name].filter(Boolean).join(' · ') || 'No SKU'}
                          </p>
                        </div>
                        <Badge variant="outline">{formatAmount(product.sellingPrice || 0)}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreListings;
