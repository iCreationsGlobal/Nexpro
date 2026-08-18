import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/constants';
import { getVariantLabel, isProductOutOfStock, isVariantOutOfStock } from '@/utils/productStock';

export type CartItem = {
  id: string;
  productId: string;
  productVariantId?: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  discount?: number;
  imageUrl?: string;
  sku?: string;
  barcode?: string;
  productCode?: string;
  trackStock?: boolean;
  quantityOnHand?: number | null;
};

export type AddCartProductInput = {
  id: string;
  name: string;
  sellingPrice?: number;
  price?: number;
  costPrice?: number;
  imageUrl?: string;
  sku?: string;
  barcode?: string;
  productCode?: string;
  alternateBarcode?: string;
  barcodeAliases?: string[];
  barcodes?: Array<{ barcode?: string; isActive?: boolean }>;
  trackStock?: boolean;
  quantityOnHand?: number | null;
  hasVariants?: boolean;
  variants?: Array<{
    id?: string;
    name?: string;
    sku?: string;
    barcode?: string;
    sellingPrice?: number | null;
    quantityOnHand?: number | null;
    trackStock?: boolean | null;
    isActive?: boolean;
    attributes?: Record<string, string | undefined> | null;
  }>;
  productVariantId?: string | null;
  variantName?: string;
  selectedVariant?: {
    id?: string;
    name?: string;
    sku?: string;
    barcode?: string;
    sellingPrice?: number | null;
    quantityOnHand?: number | null;
    trackStock?: boolean | null;
    isActive?: boolean;
    attributes?: Record<string, string | undefined> | null;
  } | null;
};

type CartContextType = {
  items: CartItem[];
  addItem: (product: AddCartProductInput) => boolean;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateDiscount: (itemId: string, discount: number) => void;
  updateUnitPrice: (itemId: string, unitPrice: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getItemCount: () => number;
};

const CartContext = createContext<CartContextType | null>(null);

const getCartStorageKey = (tenantId: string | null) =>
  tenantId ? `${STORAGE_KEYS.CART_PREFIX}${tenantId}` : null;

const resolveProductCode = (product: AddCartProductInput, variantBarcode?: string | null) =>
  variantBarcode
  || product.productCode
  || product.alternateBarcode
  || product.barcodeAliases?.[0]
  || product.barcodes?.find((barcode) => barcode?.isActive !== false)?.barcode
  || '';

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeTenantId } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const hasLoadedCartRef = useRef(false);

  // Load cart from tenant-specific storage when tenant changes
  useEffect(() => {
    const key = getCartStorageKey(activeTenantId);
    if (!key) {
      setItems([]);
      hasLoadedCartRef.current = true;
      return;
    }
    const loadCart = async () => {
      try {
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored) as CartItem[];
          const normalized = parsed.map((item) => ({
            ...item,
            productVariantId: item.productVariantId || null,
            unitPrice: Number(item.unitPrice) || Number((item as any).price) || Number((item as any).sellingPrice) || 0,
          }));
          setItems(normalized);
        } else {
          setItems([]);
        }
      } catch (error) {
        console.error('Failed to load cart from storage:', error);
        setItems([]);
      } finally {
        hasLoadedCartRef.current = true;
      }
    };
    hasLoadedCartRef.current = false;
    loadCart();
  }, [activeTenantId]);

  // Save cart to tenant-specific storage after brief idle time to keep scanning responsive.
  useEffect(() => {
    const key = getCartStorageKey(activeTenantId);
    if (!key || !hasLoadedCartRef.current) return;
    const timeoutId = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(key, JSON.stringify(items));
      } catch (error) {
        console.error('Failed to save cart to storage:', error);
      }
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [items, activeTenantId]);

  const addItem = useCallback((product: AddCartProductInput): boolean => {
    const variant = product.selectedVariant?.id
      ? product.selectedVariant
      : product.productVariantId
        ? {
            id: product.productVariantId,
            name: product.variantName,
            sku: product.sku,
            barcode: product.barcode,
            sellingPrice: product.sellingPrice,
            quantityOnHand: product.quantityOnHand,
            trackStock: product.trackStock,
          }
        : null;

    if (variant?.id) {
      if (isVariantOutOfStock(product, variant)) {
        return false;
      }
    } else if (isProductOutOfStock(product)) {
      return false;
    }

    setItems((prev) => {
      const variantId = variant?.id || null;
      const unitPrice = Number(
        variant?.sellingPrice ?? product.sellingPrice ?? product.price ?? product.costPrice ?? 0
      ) || 0;
      const existingItem = prev.find(
        (item) => item.productId === product.id && (item.productVariantId || null) === variantId
      );
      if (existingItem) {
        return prev.map((item) =>
          item.id === existingItem.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      const variantLabel = getVariantLabel(variant) || product.variantName || '';
      const displayName = variantId && variantLabel
        ? `${product.name} - ${variantLabel}`
        : product.name;

      const newItem: CartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        productId: product.id,
        productVariantId: variantId,
        name: displayName,
        unitPrice,
        quantity: 1,
        discount: 0,
        imageUrl: product.imageUrl,
        sku: variant?.sku || product.sku,
        barcode: variant?.barcode || product.barcode,
        productCode: resolveProductCode(product, variant?.barcode),
        trackStock: variant?.trackStock ?? product.trackStock,
        quantityOnHand: variant?.quantityOnHand ?? product.quantityOnHand,
      };
      return [...prev, newItem];
    });
    return true;
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    );
  }, [removeItem]);

  const updateDiscount = useCallback((itemId: string, discount: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, discount: Math.max(0, discount) } : item))
    );
  }, []);

  const updateUnitPrice = useCallback((itemId: string, unitPrice: number) => {
    const next = Math.max(0, Number(unitPrice) || 0);
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, unitPrice: next } : item))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    const key = getCartStorageKey(activeTenantId);
    if (key) AsyncStorage.removeItem(key);
  }, [activeTenantId]);

  const getSubtotal = useCallback(() => {
    return items.reduce((total, item) => {
      const unitPrice = Number(item.unitPrice) || 0;
      return total + unitPrice * item.quantity;
    }, 0);
  }, [items]);

  const getTotalDiscount = useCallback(() => {
    return items.reduce((total, item) => {
      return total + (item.discount || 0);
    }, 0);
  }, [items]);

  const getTotal = useCallback(() => {
    return getSubtotal() - getTotalDiscount();
  }, [getSubtotal, getTotalDiscount]);

  const getItemCount = useCallback(() => {
    return items.reduce((count, item) => count + item.quantity, 0);
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      updateDiscount,
      updateUnitPrice,
      clearCart,
      getTotal,
      getSubtotal,
      getTotalDiscount,
      getItemCount,
    }),
    [
      items,
      addItem,
      removeItem,
      updateQuantity,
      updateDiscount,
      updateUnitPrice,
      clearCart,
      getTotal,
      getSubtotal,
      getTotalDiscount,
      getItemCount,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
