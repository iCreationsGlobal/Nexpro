import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Minimal cart scoped to the /simple route tree (Simple Mode's Sell → Charge flow). Simple Mode
 * only ever adds non-variant products at their catalog price plus one "Quick Sale" custom-amount
 * line, so this is a small subset of the full POS cart logic in usePOS/POSCart — not the shared
 * desktop cart, and not persisted, since it's meant to be cleared after each sale anyway.
 * Mirrors the relevant slice of mobile/context/CartContext.tsx.
 */

const SimpleCartContext = createContext(null);

const isOutOfStock = (product) =>
  product.trackStock !== false && Number(product.quantityOnHand ?? 0) <= 0;

export const SimpleCartProvider = ({ children }) => {
  const [items, setItems] = useState([]);

  const addItem = useCallback((product) => {
    if (isOutOfStock(product)) return false;
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          productId: product.id,
          name: product.name,
          unitPrice: Number(product.sellingPrice) || 0,
          quantity: 1,
          imageUrl: product.imageUrl || null,
        },
      ];
    });
    return true;
  }, []);

  const addCustomAmountItem = useCallback((product) => {
    setItems((prev) => [
      ...prev,
      {
        id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        productId: product.id,
        name: product.name,
        unitPrice: Math.max(0, Number(product.unitPrice) || 0),
        quantity: 1,
        imageUrl: null,
      },
    ]);
  }, []);

  const updateQuantity = useCallback((itemId, quantity) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity } : item)));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const getSubtotal = useCallback(
    () => items.reduce((total, item) => total + Number(item.unitPrice) * item.quantity, 0),
    [items]
  );
  const getTotal = getSubtotal;

  const value = useMemo(
    () => ({ items, addItem, addCustomAmountItem, updateQuantity, clearCart, getTotal, getSubtotal }),
    [items, addItem, addCustomAmountItem, updateQuantity, clearCart, getTotal, getSubtotal]
  );

  return <SimpleCartContext.Provider value={value}>{children}</SimpleCartContext.Provider>;
};

export const useSimpleCart = () => {
  const ctx = useContext(SimpleCartContext);
  if (!ctx) throw new Error('useSimpleCart must be used within SimpleCartProvider');
  return ctx;
};
