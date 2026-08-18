import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants';
import { clampQuantity } from '@/utils/format';
import type { MarketplaceProduct, MarketplaceStore } from '@/services/marketplaceApi';

export type CartItem = {
  listingId: string;
  productSlug: string;
  title: string;
  image?: string | null;
  unitPrice: number;
  quantity: number;
  storeSlug: string;
  storeName: string;
  storeCurrency: string;
  store: {
    slug: string;
    displayName: string;
    currency: string;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFee: number;
    shopType?: string | null;
    freeDeliveryThreshold?: number | null;
  };
};

type AddItemPayload = {
  product: MarketplaceProduct;
  store?: MarketplaceStore | null;
  storeSlug?: string;
  quantity?: number;
};

type CartContextValue = {
  items: CartItem[];
  cartSummary: { itemCount: number; subtotal: number; currency: string; store: CartItem['store'] | null };
  addItem: (payload: AddItemPayload) => { ok: boolean; replacedStore?: boolean };
  updateQuantity: (listingId: string, quantity: number) => void;
  removeItem: (listingId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const normalizeItem = ({ product, store, storeSlug, quantity = 1 }: AddItemPayload): CartItem | null => {
  const listingId = product.id;
  const resolvedSlug = storeSlug || product.store?.slug || store?.slug;
  if (!listingId || !resolvedSlug) return null;
  const storeMeta = store || product.store;
  return {
    listingId,
    productSlug: product.slug || listingId,
    title: product.title || 'Product',
    image: product.images?.[0] || null,
    unitPrice: Number(product.publicPrice) || 0,
    quantity: clampQuantity(quantity),
    storeSlug: resolvedSlug,
    storeName: storeMeta?.displayName || resolvedSlug,
    storeCurrency: storeMeta?.currency || 'GHS',
    store: {
      slug: resolvedSlug,
      displayName: storeMeta?.displayName || resolvedSlug,
      currency: storeMeta?.currency || 'GHS',
      deliveryEnabled: storeMeta?.deliveryEnabled === true,
      pickupEnabled: storeMeta?.pickupEnabled !== false,
      deliveryFee: Number(storeMeta?.deliveryFee || 0),
      shopType: storeMeta?.shopType || null,
      freeDeliveryThreshold: storeMeta?.freeDeliveryThreshold ?? null,
    },
  };
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.cart);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setItems(parsed);
      } catch {
        setItems([]);
      }
    })();
  }, []);

  const persist = useCallback(async (next: CartItem[]) => {
    setItems(next);
    await AsyncStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(next));
  }, []);

  const addItem = useCallback(
    (payload: AddItemPayload) => {
      const nextItem = normalizeItem(payload);
      if (!nextItem) return { ok: false };
      let replacedStore = false;
      const sameStore = items.filter((i) => i.storeSlug === nextItem.storeSlug);
      replacedStore = sameStore.length !== items.length;
      const existing = sameStore.find((i) => i.listingId === nextItem.listingId);
      const next = existing
        ? sameStore.map((i) =>
            i.listingId === nextItem.listingId
              ? { ...i, quantity: clampQuantity(i.quantity + nextItem.quantity) }
              : i,
          )
        : [...sameStore, nextItem];
      persist(next);
      return { ok: true, replacedStore };
    },
    [items, persist],
  );

  const updateQuantity = useCallback(
    (listingId: string, quantity: number) => {
      persist(items.map((i) => (i.listingId === listingId ? { ...i, quantity: clampQuantity(quantity) } : i)));
    },
    [items, persist],
  );

  const removeItem = useCallback(
    (listingId: string) => {
      persist(items.filter((i) => i.listingId !== listingId));
    },
    [items, persist],
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const cartSummary = useMemo(() => {
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    return {
      itemCount,
      subtotal: Number(subtotal.toFixed(2)),
      currency: items[0]?.storeCurrency || 'GHS',
      store: items[0]?.store || null,
    };
  }, [items]);

  const value = useMemo(
    () => ({ items, cartSummary, addItem, updateQuantity, removeItem, clearCart }),
    [items, cartSummary, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
