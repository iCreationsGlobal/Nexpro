import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import productService from '../services/productService';
import { useDebounce } from '../hooks/useDebounce';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount } from '../utils/formatNumber';

/** A product name as the server compares it: trimmed, single spaces, lower case. */
export const productNameKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The product already there when a create was refused for its name (409 DUPLICATE_PRODUCT_NAME), else null. */
export const duplicateNameConflict = (error) => {
  const body = error?.response?.data;
  return error?.response?.status === 409 && body?.code === 'DUPLICATE_PRODUCT_NAME' && body.data?.id ? body.data : null;
};

const stockText = (product) => {
  if (product?.hasVariants) return 'Sizes & colours';
  if (product?.trackStock === false) return null;
  const qty = Number(product?.quantityOnHand || 0);
  return qty > 0 ? `${qty} in stock` : 'Out of stock';
};

const productSummary = (product) => [
  stockText(product),
  Number(product?.sellingPrice) > 0 ? formatAmount(product.sellingPrice) : null,
].filter(Boolean).join(' · ');

function Thumb({ url, className }) {
  const [failed, setFailed] = useState(false);
  const src = resolveImageUrl(url);
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted', className)}>
      {src && !failed
        ? <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <Package className="h-1/2 w-1/2 text-muted-foreground" />}
    </span>
  );
}

/**
 * Product name box for adding a product. Wrap the name input: as a name is typed it lists the
 * products already there with similar names (closest first), and warns when the exact name is
 * already there, so the same product isn't added twice. Picking one offers to add stock to it
 * or open it instead; "It's a different product" lets the new one through.
 *
 * @param {{
 *   value: string,
 *   enabled?: boolean,
 *   conflict?: object|null,
 *   onAddStock?: (product: object) => void,
 *   onOpen?: (product: object) => void,
 *   onDifferent?: (name: string) => void,
 *   children: import('react').ReactElement,
 * }} props
 *   enabled: off when editing (the list would only show the product being edited).
 *   conflict: the product the server returned when it refused the save for its name; its card
 *     offers "Add it anyway" instead.
 *   onAddStock / onOpen: each button shows only when its handler is given.
 *   onDifferent: the user says this name is a different product; save it without the check.
 */
export default function ProductNameSuggest({
  value,
  enabled = true,
  conflict = null,
  onAddStock,
  onOpen,
  onDifferent,
  children,
}) {
  const listId = useId();
  const cardRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState(null);
  const [dismissedKey, setDismissedKey] = useState(null);
  const key = productNameKey(value);
  const term = useDebounce(String(value ?? '').trim(), 250);

  useEffect(() => {
    if (!enabled || !term) {
      setResults([]);
      return undefined;
    }
    let current = true;
    productService.searchProducts(term, { limit: 6, sort: 'relevance' })
      .then((res) => { if (current) setResults(Array.isArray(res?.data) ? res.data : []); })
      .catch(() => { if (current) setResults([]); });
    return () => { current = false; };
  }, [term, enabled]);

  // A pick belongs to the name it was picked for.
  useEffect(() => {
    setPicked(null);
    setActive(-1);
  }, [key]);

  const serverConflict = enabled && conflict && productNameKey(conflict.name) === key ? conflict : null;
  const exact = key && key !== dismissedKey ? results.find((p) => productNameKey(p.name) === key) : null;
  const card = enabled ? (serverConflict || picked || exact || null) : null;
  const showList = enabled && focused && !card && key && results.length > 0;

  useEffect(() => {
    // The save button is far below the name box in the long form; bring the warning into view.
    if (serverConflict) cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [serverConflict]);

  if (!enabled) return children;

  const different = () => {
    if (productNameKey(card.name) === key) {
      setDismissedKey(key);
      onDifferent?.(value);
    }
    setPicked(null);
  };

  const handleKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === 'Enter' && active >= 0) {
      // Keep Enter from saving the form while an option is highlighted.
      e.preventDefault();
      setPicked(results[active]);
    }
  };

  const input = isValidElement(children)
    ? cloneElement(children, {
      role: 'combobox',
      autoComplete: 'off',
      'aria-autocomplete': 'list',
      'aria-expanded': Boolean(showList),
      'aria-controls': showList ? listId : undefined,
      'aria-activedescendant': showList && active >= 0 ? `${listId}-${active}` : undefined,
    })
    : children;

  return (
    <div
      className="relative"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      onKeyDownCapture={handleKeyDown}
    >
      {input}

      {showList ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Already in your products</p>
          <ul id={listId} role="listbox" aria-label="Products already in your products" className="max-h-72 overflow-y-auto p-1">
            {results.map((product, index) => (
              <li
                key={product.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Keep focus in the name box so the pick isn't lost to its blur.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPicked(product)}
                onMouseEnter={() => setActive(index)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2', index === active && 'bg-muted')}
              >
                <Thumb url={product.imageUrl} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{productSummary(product)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {card ? (
        <div
          ref={cardRef}
          role="alert"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50"
        >
          <div className="flex items-center gap-3">
            <Thumb url={card.imageUrl} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {serverConflict ? 'Already in your products' : 'You already have this product'}
              </p>
              <p className="truncate font-semibold">{card.name}</p>
              <p className="truncate text-sm opacity-80">{productSummary(card)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onAddStock ? (
              <Button type="button" size="sm" onClick={() => onAddStock(card)}>Add stock to it</Button>
            ) : null}
            {onOpen ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpen(card)}>Open it</Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={different}>
              {serverConflict ? 'Add it anyway' : "It's a different product"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
