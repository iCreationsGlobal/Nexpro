import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Barcode, Camera, ChevronRight, Loader2, Package, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import ProductNameSuggest from '../ProductNameSuggest';
import { PRODUCT_IMAGE_ACCEPT } from '../../utils/compressProductImage';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';
import { barcodeFromScan } from '../../utils/barcodeFromScan';
import { groupOptionsBySize, newOptionCombos, optionListsFromVariants } from '../../utils/productOptions';

// The same camera scanner the till uses (reads shop barcodes and QR labels); loaded only when tapped.
const CameraScanner = lazy(() => import('../pos/POSProductSearch').then((module) => ({ default: module.QRCodeScanner })));

// Re-exported for the tests and older imports.
export { barcodeFromScan };

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
 * stock and an optional barcode (a USB/Bluetooth scanner types straight into it, or Scan uses the phone's camera). Photos go through the Products page's existing upload (so paste works too).
 * Sizes and colours are typed as lists ("Size 5, Size 6"); each new size/colour gets its own stock count
 * and is passed to onSave as newOptions.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   product?: object|null,
 *   imageUrl?: string,
 *   imageUploading?: boolean,
 *   onPickImage: (file: File) => void,
 *   onRemoveImage: () => void,
 *   nameConflict?: object|null,
 *   onOpenExisting?: (product: object) => void,
 *   onDifferentName?: (name: string) => void,
 *   saving?: boolean,
 *   variants?: Array<object>,
 *   onOpenVariant?: (variant: object) => void,
 *   scanningEnabled?: boolean,
 *   onSave: (values: {
 *     name: string, sellingPrice: number, costPrice: number|'', quantityOnHand: number, barcode: string,
 *     newOptions: Array<{ name: string, size: string, color: string, quantityOnHand: number }>,
 *   }) => void,
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
  nameConflict = null,
  onOpenExisting,
  onDifferentName,
  saving = false,
  variants = [],
  onOpenVariant,
  scanningEnabled = true,
  onSave,
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sizes, setSizes] = useState('');
  const [colors, setColors] = useState('');
  const [optionQuantities, setOptionQuantities] = useState({});
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const initializedFor = useRef(null);
  const optionsTyped = useRef(false);
  const variantRows = Array.isArray(variants) ? variants : [];
  const variantKey = variantRows.map((v) => `${v.id}:${v.attributes?.size || ''}:${v.attributes?.color || ''}`).join(',');
  const newOptions = newOptionCombos(sizes, colors, variantRows);
  const hasVariants = Boolean(product?.hasVariants) || variantRows.length > 0 || newOptions.length > 0;
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
    setOptionQuantities({});
    optionsTyped.current = false;
    setError('');
  }, [open, product]);

  // The boxes start with the sizes and colours already added, until the user types in them.
  useEffect(() => {
    if (!open || optionsTyped.current) return;
    const lists = optionListsFromVariants(variantRows);
    setSizes(lists.sizes);
    setColors(lists.colors);
    // variantKey stands for variantRows, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, variantKey]);

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
      newOptions: newOptions.map(({ key, name: optionName, size, color }) => ({
        name: optionName,
        size,
        color,
        quantityOnHand: Math.max(0, Number(optionQuantities[key]) || 0),
      })),
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
                {[cameraRef, fileRef].map((ref) => (
                  <input
                    key={ref === cameraRef ? 'camera' : 'file'}
                    ref={ref}
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    capture={ref === cameraRef ? 'environment' : undefined}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) onPickImage(file);
                    }}
                  />
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-12 rounded-xl text-base" disabled={imageUploading} onClick={() => cameraRef.current?.click()}>
                    <Camera className="mr-2 h-5 w-5" />
                    {previewUrl ? 'Retake' : 'Take photo'}
                  </Button>
                  <Button type="button" variant="outline" className="h-12 rounded-xl text-base" disabled={imageUploading} onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 h-5 w-5" />
                    Upload
                  </Button>
                </div>
                {previewUrl && !imageUploading ? (
                  <button type="button" onClick={onRemoveImage} className="flex items-center text-sm font-medium text-red-700">
                    <X className="mr-1 h-4 w-4" />Remove photo
                  </button>
                ) : null}
                <p className="text-xs text-muted-foreground">You can also paste a picture (Ctrl/Cmd+V).</p>
              </div>
            </div>

            <div>
              <span className="text-base font-semibold">Product name</span>
              {/* Lists products already there as the name is typed, so the same one isn't added twice. */}
              <ProductNameSuggest
                value={name}
                enabled={!product}
                conflict={nameConflict}
                onOpen={onOpenExisting}
                onDifferent={onDifferentName}
              >
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  placeholder="e.g. Bel Aqua 500ml"
                  aria-label="Product name"
                  className="mt-2 h-16 w-full rounded-2xl border-2 border-border bg-card px-5 text-lg outline-none focus:ring-2 focus:ring-brand"
                />
              </ProductNameSuggest>
            </div>

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
              {variantRows.length > 0 ? (
                <>
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
                  <p className="text-sm text-muted-foreground">Tap one to change its price or stock, or to delete it.</p>
                </>
              ) : null}
              {[
                ['Sizes', sizes, setSizes, 'e.g. Size 5, Size 6, Size 7'],
                ['Colours', colors, setColors, 'e.g. Blue, Black, Red'],
              ].map(([label, value, setValue, placeholder]) => (
                <label key={label} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <input
                    value={value}
                    onChange={(e) => { optionsTyped.current = true; setValue(e.target.value); }}
                    placeholder={placeholder}
                    aria-label={label}
                    autoComplete="off"
                    className="mt-1 h-14 w-full rounded-2xl border-2 border-border bg-card px-5 text-lg outline-none focus:ring-2 focus:ring-brand"
                  />
                </label>
              ))}
              <p className="text-sm text-muted-foreground">Put a comma between each one.</p>
              {newOptions.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-base font-semibold">How many of each do you have?</span>
                  {/* Grouped by size (the main option), with its colours under it. */}
                  <div className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border">
                    {groupOptionsBySize(newOptions).map((group) => (
                      <div key={group.size || group.options[0].key}>
                        {group.size ? <p className="bg-muted/60 px-4 py-2 font-semibold">{group.size}</p> : null}
                        <ul className="divide-y divide-border">
                          {group.options.map((option) => (
                            <li key={option.key} className="flex items-center justify-between gap-3 px-4 py-2">
                              <span className="min-w-0 truncate font-medium">{group.size ? option.color : option.name}</span>
                              <input
                                inputMode="numeric"
                                value={optionQuantities[option.key] ?? ''}
                                onChange={(e) => {
                                  const text = cleanNumber(e.target.value);
                                  setOptionQuantities((prev) => ({ ...prev, [option.key]: text }));
                                }}
                                placeholder="0"
                                aria-label={`How many ${option.name}`}
                                className="h-12 w-24 shrink-0 rounded-xl border-2 border-border bg-card px-3 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-brand"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="simple-product-barcode" className="text-base font-semibold">Barcode (optional)</label>
              <div className="mt-2 flex gap-2">
                <span className="flex h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-border bg-card px-5 focus-within:ring-2 focus-within:ring-brand">
                  <Barcode className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <input
                    id="simple-product-barcode"
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
                {scanningEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCameraOpen(true)}
                    className="h-16 shrink-0 gap-2 rounded-2xl border-2 px-4 text-base font-semibold"
                    aria-label="Scan barcode with camera"
                  >
                    <Camera className="h-6 w-6" />
                    Scan
                  </Button>
                ) : null}
              </div>
              <span className="mt-1 block text-sm text-muted-foreground">
                {scanningEnabled
                  ? 'Tap Scan to use the camera, scan into the box with a barcode scanner, or type the number.'
                  : 'Tap the box and scan the product with your barcode scanner, or type the number.'}
              </span>
            </div>

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
        {cameraOpen ? (
          <Suspense fallback={null}>
            <CameraScanner
              isOpen
              cameraEnabled
              onScan={(text) => {
                const code = barcodeFromScan(text);
                if (code) {
                  setBarcode(code);
                  setError('');
                } else {
                  setError('That QR code has no barcode number. Scan the barcode instead.');
                }
              }}
              onClose={() => setCameraOpen(false)}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
