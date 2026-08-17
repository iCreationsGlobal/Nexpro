import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import productService from '../services/productService';
import { getErrorMessage, showError, showSuccess } from '../utils/toast';

const EMPTY_VARIANT_VALUE = '__none__';

export default function StockTransferModal({
  open,
  onClose,
  onSuccess,
  initialProduct = null,
  bulkMode = 'single', // single | selected | all
  sourceShopId = null,
  availableShops = [],
  activeShopId = null,
}) {
  const [sourceProduct, setSourceProduct] = useState(initialProduct);
  const [productQuery, setProductQuery] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const [selectedSourceProductIds, setSelectedSourceProductIds] = useState([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [destinationShopId, setDestinationShopId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceVariantId, setSourceVariantId] = useState(EMPTY_VARIANT_VALUE);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSourceProduct(initialProduct || null);
    setSelectedSourceProductIds(initialProduct?.id ? [initialProduct.id] : []);
    setProductQuery('');
    setProductOptions([]);
    setProductPickerOpen(false);
    setDestinationShopId('');
    setQuantity('1');
    setReason('');
    setNotes('');
    setSourceVariantId(EMPTY_VARIANT_VALUE);
  }, [open, initialProduct]);

  const isBulkMode = bulkMode !== 'single';
  const usesProductPicker = !initialProduct?.id || isBulkMode;
  const usesBulkSubmission = usesProductPicker;

  const loadSourceProducts = useCallback(async () => {
    const resolvedSourceShopId = sourceShopId || activeShopId || initialProduct?.shopId || null;
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
          ...(resolvedSourceShopId ? { shopId: resolvedSourceShopId } : {}),
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

      setProductOptions(allProducts);
    } catch (error) {
      showError(error, 'Failed to load products');
      setProductOptions([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [activeShopId, initialProduct?.shopId, sourceShopId]);

  useEffect(() => {
    if (!open || !usesProductPicker) return;
    loadSourceProducts();
  }, [loadSourceProducts, open, usesProductPicker]);

  const filteredProductOptions = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return productOptions;
    return productOptions.filter((product) => {
      const haystack = [
        product.name,
        product.sku,
        product.barcode,
        product.category?.name,
        product.shop?.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [productOptions, productQuery]);

  const eligibleProductOptions = useMemo(
    () => productOptions.filter((product) => product.trackStock !== false),
    [productOptions]
  );

  const selectedSourceProducts = useMemo(
    () => productOptions.filter((product) => selectedSourceProductIds.includes(product.id)),
    [productOptions, selectedSourceProductIds]
  );

  const toggleSourceProduct = useCallback((productId, checked) => {
    setSelectedSourceProductIds((prev) => {
      if (checked) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.filter((id) => id !== productId);
    });
  }, []);

  const selectAllFilteredProducts = useCallback(() => {
    const ids = filteredProductOptions
      .filter((product) => product.trackStock !== false)
      .map((product) => product.id);
    setSelectedSourceProductIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, [filteredProductOptions]);

  const deselectAllProducts = useCallback(() => {
    setSelectedSourceProductIds([]);
  }, []);

  const sourceVariants = useMemo(() => {
    if (usesBulkSubmission) return [];
    if (!Array.isArray(sourceProduct?.variants)) return [];
    return sourceProduct.variants.filter((variant) => variant?.isActive !== false);
  }, [sourceProduct, usesBulkSubmission]);

  const sourceStock = useMemo(() => {
    if (usesBulkSubmission) return 0;
    if (!sourceProduct) return 0;
    if (sourceVariantId !== EMPTY_VARIANT_VALUE) {
      const variant = sourceVariants.find((v) => v.id === sourceVariantId);
      return Number.parseFloat(variant?.quantityOnHand || 0);
    }
    return Number.parseFloat(sourceProduct?.quantityOnHand || 0);
  }, [sourceProduct, sourceVariantId, sourceVariants, usesBulkSubmission]);

  const destinationOptions = useMemo(() => {
    const resolvedSourceShopId = sourceShopId || sourceProduct?.shopId || activeShopId || null;
    return (availableShops || []).filter((shop) => shop.id !== resolvedSourceShopId);
  }, [availableShops, sourceShopId, sourceProduct?.shopId, activeShopId]);

  const handleSubmit = useCallback(async () => {
    if (!usesBulkSubmission && !sourceProduct?.id) {
      showError('Select a source product first');
      return;
    }
    if (usesBulkSubmission && selectedSourceProductIds.length === 0) {
      showError('Select at least one source product');
      return;
    }
    if (!destinationShopId) {
      showError('Select a destination shop');
      return;
    }

    const parsedQty = Number.parseFloat(quantity);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      showError('Enter a valid quantity greater than zero');
      return;
    }
    if (!usesBulkSubmission && parsedQty > sourceStock) {
      showError(`Transfer quantity cannot exceed source stock (${sourceStock})`);
      return;
    }

    setSubmitting(true);
    try {
      if (usesBulkSubmission) {
        const resolvedSourceShopId = sourceShopId || sourceProduct?.shopId || activeShopId;
        if (!resolvedSourceShopId) {
          showError('Select a source shop before transferring stock');
          return;
        }
        const payload = {
          sourceShopId: resolvedSourceShopId,
          destinationShopId,
          quantity: parsedQty,
          mode: 'selected',
          productIds: selectedSourceProductIds,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
          sharedCatalog: true,
        };

        const response = await productService.createBulkStockTransfer(payload);
        const summary = response?.data ?? response;
        showSuccess(
          `Transfer complete: ${summary?.transferredCount || 0} transferred, ${summary?.skippedCount || 0} skipped`
        );
      } else {
        await productService.createStockTransfer({
          sourceShopId: sourceShopId || sourceProduct.shopId || activeShopId,
          destinationShopId,
          sourceProductId: sourceProduct.id,
          sourceVariantId: sourceVariantId === EMPTY_VARIANT_VALUE ? undefined : sourceVariantId,
          quantity: parsedQty,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
          sharedCatalog: true,
        });
        showSuccess('Stock transferred successfully');
      }
      onSuccess?.();
      onClose?.();
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to transfer stock'));
    } finally {
      setSubmitting(false);
    }
  }, [
    sourceProduct,
    destinationShopId,
    quantity,
    sourceStock,
    sourceVariantId,
    reason,
    notes,
    activeShopId,
    sourceShopId,
    usesBulkSubmission,
    selectedSourceProductIds,
    onSuccess,
    onClose,
  ]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="sm:w-[var(--modal-w-sm)]">
        <DialogHeader>
          <DialogTitle>Transfer Stock</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {usesProductPicker && (
              <div className="space-y-2">
                <Label>Source products</Label>
                <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {selectedSourceProductIds.length
                          ? `${selectedSourceProductIds.length} product(s) selected`
                          : 'Select products to transfer'}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
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
                          value={productQuery}
                          onChange={(event) => setProductQuery(event.target.value)}
                          placeholder="Search product name, SKU, or barcode"
                          className="pl-9"
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {loadingProducts
                            ? 'Loading products...'
                            : `${filteredProductOptions.length} shown, ${selectedSourceProductIds.length} selected`}
                        </p>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={selectAllFilteredProducts}>
                            Select all
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={deselectAllProducts}>
                            Deselect all
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      {loadingProducts ? (
                        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading products
                        </div>
                      ) : filteredProductOptions.length ? (
                        filteredProductOptions.map((product) => {
                          const disabled = product.trackStock === false;
                          return (
                            <label
                              key={product.id}
                              className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                              <Checkbox
                                checked={selectedSourceProductIds.includes(product.id)}
                                disabled={disabled}
                                onCheckedChange={(checked) => toggleSourceProduct(product.id, Boolean(checked))}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{product.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {product.sku ? `SKU: ${product.sku} · ` : ''}
                                  Stock: {product.quantityOnHand || 0} {product.unit || 'pcs'}
                                  {product.shop?.name ? ` · ${product.shop.name}` : ''}
                                  {disabled ? ' · not stock-tracked' : ''}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          No products found.
                        </p>
                      )}
                    </div>
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Select one or more products. Use “Select all” here when transferring many products.
                    </div>
                  </PopoverContent>
                </Popover>
                {!loadingProducts && eligibleProductOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No stock-tracked products are available in the source shop.</p>
                ) : null}
              </div>
            )}

            {usesBulkSubmission ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">
                  {selectedSourceProductIds.length} selected product(s)
                </p>
                <p className="text-muted-foreground">
                  Shared quantity will be applied per product. If stock is lower, available quantity is transferred.
                </p>
                {selectedSourceProducts.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedSourceProducts.slice(0, 3).map((product) => product.name).join(', ')}
                    {selectedSourceProducts.length > 3 ? ` +${selectedSourceProducts.length - 3} more` : ''}
                  </p>
                )}
              </div>
            ) : sourceProduct?.id ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{sourceProduct.name}</p>
                <p className="text-muted-foreground">
                  Source shop: {sourceProduct.shop?.name || 'Current shop'}
                </p>
              </div>
            ) : null}

            {sourceVariants.length > 0 && !usesBulkSubmission && (
              <div className="space-y-2">
                <Label>Variant (optional)</Label>
                <Select value={sourceVariantId} onValueChange={setSourceVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VARIANT_VALUE}>No variant (base product)</SelectItem>
                    {sourceVariants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.name} ({variant.quantityOnHand || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Destination shop</Label>
              <Select value={destinationShopId} onValueChange={setDestinationShopId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination shop" />
                </SelectTrigger>
                <SelectContent>
                  {destinationOptions.map((shop) => (
                    <SelectItem key={shop.id} value={shop.id}>
                      {shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {usesBulkSubmission
                  ? 'Applied per product in this batch.'
                  : `Available in source: ${sourceStock} ${sourceProduct?.unit || 'pcs'}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Restock branch, demand balancing..."
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra details for audit trail"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                disabled={(usesBulkSubmission ? selectedSourceProductIds.length === 0 : !sourceProduct?.id) || !destinationShopId}
              >
                Transfer
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
