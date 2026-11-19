import { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import productService from '../../services/productService';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';

/** Every photo a product has: the main one, then its online-store photos. */
export const productPhotos = (product) => {
  const slots = product?.storeImages ?? product?.metadata?.storeImages;
  const extra = slots && typeof slots === 'object' ? Object.values(slots) : [];
  return [...new Set([product?.imageUrl, ...extra].filter((url) => typeof url === 'string' && url.trim()))];
};

/** "Size: M · Colour: Red" from a size's or colour's attributes. */
const optionText = (variant) => Object.entries(variant?.attributes || {})
  .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
  .map(([key, value]) => `${key.charAt(0).toUpperCase()}${key.slice(1)}: ${value}`)
  .join(' · ');

/**
 * A cart line in full, so the person selling can check it's the right product: photos, name, size or
 * colour, price, quantity (with − / +, the cart's own rules), line total, codes, category, brand, unit,
 * description and stock. The product is fetched when it opens; offline, it shows what the line has.
 * @param {object} props
 * @param {object|null} props.item - the cart line (productId, productVariantId, name, unitPrice, quantity, discount, sku, productCode, unit, trackStock, quantityOnHand)
 * @param {() => void} props.onClose
 * @param {(itemId: string, quantity: number) => void} props.onUpdateQuantity
 * @param {(itemId: string) => void} [props.onRemove]
 */
export default function CartItemDetailsDialog({ item, onClose, onUpdateQuantity, onRemove }) {
  const productId = item?.productId ?? null;
  const [loaded, setLoaded] = useState({ productId: null, product: null, failed: false });
  const [photo, setPhoto] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setPhoto(0);
    setConfirmRemove(false);
    if (!productId) return undefined;
    let active = true;
    productService.getProductById(productId)
      .then((res) => { if (active) setLoaded({ productId, product: res?.data ?? res ?? null, failed: false }); })
      .catch(() => { if (active) setLoaded({ productId, product: null, failed: true }); });
    return () => { active = false; };
  }, [productId]);

  const product = loaded.productId === productId ? loaded.product : null;
  const loading = Boolean(productId) && loaded.productId !== productId;
  const variant = useMemo(
    () => (item?.productVariantId ? (product?.variants || []).find((v) => v.id === item.productVariantId) ?? null : null),
    [product, item?.productVariantId],
  );
  if (!item) return null;

  const photos = productPhotos(product);
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const lineTotal = unitPrice * quantity - (Number(item.discount) || 0);
  const tracked = (variant?.trackStock ?? item.trackStock ?? product?.trackStock) !== false;
  const stock = item.quantityOnHand ?? variant?.quantityOnHand ?? product?.quantityOnHand;
  const rows = [
    ['Size or colour', variant ? [variant.name, optionText(variant)].filter(Boolean).join(' · ') : ''],
    ['Barcode', variant?.barcode || product?.barcode || ''],
    ['Product code', item.productCode && item.productCode !== (variant?.barcode || product?.barcode) ? item.productCode : ''],
    ['SKU', variant?.sku || item.sku || product?.sku || ''],
    ['Category', product?.category?.name || ''],
    ['Brand', product?.brand || ''],
    ['Unit', item.unit || product?.unit || ''],
    ['In stock', tracked && stock !== null && stock !== undefined && stock !== '' ? String(Number(stock)) : ''],
  ].filter(([, value]) => value);
  const name = product?.name || item.name;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:w-[var(--modal-w-md)]">
        <DialogHeader><DialogTitle>{name}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
              {loading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading the product" />
                : photos.length ? <img src={resolveImageUrl(photos[photo] ?? photos[0])} alt={name} className="h-full w-full object-contain" />
                  : <Package className="h-16 w-16 text-muted-foreground" aria-hidden />}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Photos">
                {photos.map((url, index) => (
                  <button key={url} type="button" onClick={() => setPhoto(index)} aria-label={`Photo ${index + 1}`} aria-pressed={index === photo} className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${index === photo ? 'border-green-700' : 'border-transparent'}`}>
                    <img src={resolveImageUrl(url)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {item.name !== name && <p className="font-medium">{item.name}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-2xl font-bold text-green-700">{formatAmount(unitPrice)} <span className="text-sm font-normal text-muted-foreground">each</span></p>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-11 w-11" aria-label={`Decrease ${item.name}`} onClick={() => { if (quantity <= 1 && onRemove) setConfirmRemove(true); else onUpdateQuantity(item.id, quantity - 1); }}><Minus className="h-5 w-5" /></Button>
                <span className="min-w-10 text-center text-xl font-bold" aria-label="Quantity in the cart">{quantity}</span>
                <Button className="h-11 w-11 bg-green-700 hover:bg-green-800" aria-label={`Increase ${item.name}`} onClick={() => onUpdateQuantity(item.id, quantity + 1)}><Plus className="h-5 w-5" /></Button>
              </div>
            </div>
            <p className="flex justify-between border-y border-border py-2 text-lg font-semibold"><span>Total for this item</span><span>{formatAmount(lineTotal)}</span></p>
            {rows.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
              </dl>
            )}
            {product?.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{product.description}</p>}
            {loaded.failed && loaded.productId === productId && <p className="text-sm text-muted-foreground">Couldn&apos;t load the rest of this product&apos;s details. Showing what&apos;s in the cart.</p>}
          </div>
        </DialogBody>
        <DialogFooter className="flex-wrap gap-2">
          {onRemove && (confirmRemove ? (
            <>
              <span className="mr-auto self-center text-sm">Remove {item.name} from this sale?</span>
              <Button variant="outline" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              <Button variant="destructive" onClick={() => { onRemove(item.id); onClose(); }}>Remove</Button>
            </>
          ) : (
            <Button variant="ghost" className="mr-auto gap-2 text-red-700" onClick={() => setConfirmRemove(true)}><Trash2 className="h-4 w-4" />Remove from cart</Button>
          ))}
          {!confirmRemove && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
