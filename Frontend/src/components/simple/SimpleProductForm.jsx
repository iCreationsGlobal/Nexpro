import { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, ChevronRight, Loader2, Package, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PRODUCT_IMAGE_ACCEPT } from '../../utils/compressProductImage';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';

const toNumberText = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)));
const cleanNumber = (text) => String(text).replace(/[^\d.]/g, '');

const MoneyField = ({ label, value, onChange, hint }) => (
  <label className="block">
    <span className="text-base font-semibold">{label}</span>
    <span className="mt-2 flex h-16 items-center gap-2 rounded-2xl border-2 border-border bg-card px-5 focus-within:ring-2 focus-within:ring-brand">
      <span className="text-2xl font-bold text-muted-foreground">₵</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(cleanNumber(e.target.value))}
        placeholder="0.00"
        aria-label={label}
        className="h-full w-full min-w-0 bg-transparent text-2xl font-bold outline-none"
      />
    </span>
    {hint ? <span className="mt-1 block text-sm text-muted-foreground">{hint}</span> : null}
  </label>
);

/**
 * Simple Mode product form: photo, name, selling price, what it cost (optional), how many are in
 * stock and an optional barcode (a USB/Bluetooth scanner types straight into it). Photos go through the Products page's existing upload (so paste works too).
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   product?: object|null,
 *   imageUrl?: string,
 *   imageUploading?: boolean,
 *   onPickImage: (file: File) => void,
 *   onRemoveImage: () => void,
 *   saving?: boolean,
 *   variants?: Array<object>,
 *   onAddVariant?: () => void,
 *   onOpenVariant?: (variant: object) => void,
 *   onSave: (values: { name: string, sellingPrice: number, costPrice: number|'', quantityOnHand: number, barcode: string }) => void,
 * }} props
 */
export default function SimpleProductForm({
  open,
  onOpenChange,
  product = null,
  imageUrl = '',
  imageUploading = false,
  onPickImage,
  onRemoveImage,
  saving = false,
  variants = [],
  onAddVariant,
  onOpenVariant,
  onSave,
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('');
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const initializedFor = useRef(null);
  const variantRows = Array.isArray(variants) ? variants : [];
  const hasVariants = Boolean(product?.hasVariants) || variantRows.length > 0;
  const previewUrl = resolveImageUrl(imageUrl);

  useEffect(() => {
    if (!open) {
      // A real close clears the product. Pausing for the variant dialog keeps it, so typed values stay.
      if (!product?.id) initializedFor.current = null;
      return;
    }
    const key = product?.id ?? 'new';
    if (initializedFor.current === key) return;
    initializedFor.current = key;
    setName(product?.name || '');
    setPrice(toNumberText(product?.sellingPrice));
    setCost(product?.costPrice && Number(product.costPrice) > 0 ? toNumberText(product.costPrice) : '');
    setQuantity(product ? toNumberText(product.quantityOnHand ?? 0) : '');
    setBarcode(product?.barcode || '');
    setError('');
  }, [open, product]);

  const handleSave = () => {
    const sellingPrice = Number(price);
    if (name.trim().length < 2) return setError('Enter the product name.');
    if (!price || !Number.isFinite(sellingPrice) || sellingPrice < 0) return setError('Enter the selling price.');
    onSave({
      name: name.trim(),
      sellingPrice,
      costPrice: cost === '' ? '' : Number(cost),
      quantityOnHand: quantity === '' ? 0 : Math.max(0, Number(quantity)),
      barcode: barcode.trim(),
    });
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] w-[calc(100vw-1.5rem)] max-w-xl gap-5 overflow-y-auto rounded-3xl p-5 sm:gap-6 sm:p-8">
        <DialogTitle className="pr-8 text-2xl font-bold sm:text-3xl">{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogDescription className="sr-only">Photo, name, price and stock.</DialogDescription>

        <>
            <div className="flex items-center gap-4">
              <span className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted">
                {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-10 w-10 text-muted-foreground" />}
                {imageUploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </span>
                ) : null}
              </span>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onPickImage(file);
                  }}
                />
                <Button type="button" variant="outline" className="h-12 rounded-xl text-base" disabled={imageUploading} onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-2 h-5 w-5" />
                  {previewUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {previewUrl && !imageUploading ? (
                  <button type="button" onClick={onRemoveImage} className="flex items-center text-sm font-medium text-red-700">
                    <X className="mr-1 h-4 w-4" />Remove photo
                  </button>
                ) : null}
                <p className="text-xs text-muted-foreground">You can also paste a picture (Ctrl/Cmd+V).</p>
              </div>
            </div>

            <label className="block">
              <span className="text-base font-semibold">Product name</span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="e.g. Bel Aqua 500ml"
                aria-label="Product name"
                className="mt-2 h-16 w-full rounded-2xl border-2 border-border bg-card px-5 text-lg outline-none focus:ring-2 focus:ring-brand"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField label="Selling price" value={price} onChange={(v) => { setPrice(v); setError(''); }} />
              <MoneyField label="What it cost you" value={cost} onChange={setCost} hint="Optional. Used to work out profit." />
            </div>

            {hasVariants ? (
              <p className="text-sm text-muted-foreground">Stock is counted on each size or colour.</p>
            ) : (
              <label className="block">
                <span className="text-base font-semibold">How many do you have?</span>
                <input
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(cleanNumber(e.target.value))}
                  placeholder="0"
                  aria-label="Quantity in stock"
                  className="mt-2 h-16 w-full rounded-2xl border-2 border-border bg-card px-5 text-2xl font-bold outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
            )}

            <div className="space-y-3">
              <span className="text-base font-semibold">Sizes and colours (optional)</span>
              {product?.id ? (
                <>
                  {variantRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No sizes or colours yet. Add one if this product comes in different options.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border">
                      {variantRows.map((variant) => (
                        <li key={variant.id}>
                          <button
                            type="button"
                            onClick={() => onOpenVariant?.(variant)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{variant.name}</span>
                              <span className="block text-sm text-muted-foreground">Stock: {variant.quantityOnHand ?? 0}</span>
                            </span>
                            <span className="text-lg font-bold">{formatAmount(variant.sellingPrice ?? product?.sellingPrice)}</span>
                            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" variant="outline" className="h-12 w-full rounded-xl text-base" onClick={onAddVariant}>
                    <Plus className="mr-2 h-5 w-5" />
                    Add size or colour
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Save the product first, then you can add sizes or colours.</p>
              )}
            </div>

            <label className="block">
              <span className="text-base font-semibold">Barcode (optional)</span>
              <span className="mt-2 flex h-16 items-center gap-3 rounded-2xl border-2 border-border bg-card px-5 focus-within:ring-2 focus-within:ring-brand">
                <Barcode className="h-6 w-6 shrink-0 text-muted-foreground" />
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  // Scanners finish with Enter; keep it from doing anything else here.
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder="Tap here, then scan"
                  aria-label="Barcode"
                  autoComplete="off"
                  className="h-full w-full min-w-0 bg-transparent text-lg tracking-wide outline-none"
                />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Tap the box and scan the product with your barcode scanner, or type the number.
              </span>
            </label>

            {error ? <p role="alert" className="text-base font-semibold text-red-700">{error}</p> : null}

            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-1 h-16 w-full rounded-2xl bg-brand px-6 text-xl font-bold text-white hover:bg-brand-dark"
            >
              {saving ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : null}
              {product ? 'Save changes' : 'Save product'}
            </Button>
        </>
      </DialogContent>
    </Dialog>
  );
}
