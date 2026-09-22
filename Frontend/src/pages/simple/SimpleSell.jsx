import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Calculator, ImageOff, Minus, Plus, ShoppingCart } from 'lucide-react';
import SimpleHeader from '../../components/simple/SimpleHeader';
import NumberPadModal from '../../components/simple/NumberPadModal';
import { useAuth } from '../../context/AuthContext';
import { useSimpleCart } from '../../context/SimpleCartContext';
import productService from '../../services/productService';
import { getOrCreateQuickSaleProduct } from '../../utils/quickSaleProduct';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount } from '../../utils/formatNumber';
import { showError } from '../../utils/toast';

/**
 * Sell home — a photo grid, not a menu. Tapping a tile adds one unit to the running cart at
 * the bottom; the cart, price and quantities are numbers, which this design treats as fine
 * (only text/typing is the literacy barrier being designed around).
 * Mirrors mobile/app/simple/index.tsx.
 */
const SimpleSell = () => {
  const navigate = useNavigate();
  const { activeTenantId } = useAuth();
  const { items, addItem, addCustomAmountItem, updateQuantity, getTotal } = useSimpleCart();
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickSaleBusy, setQuickSaleBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['simple', 'products'],
    queryFn: () => productService.getProducts({ page: 1, limit: 60, isActive: true }),
    staleTime: 30_000,
  });

  const products = useMemo(() => {
    const list = data?.data ?? data ?? [];
    return Array.isArray(list) ? list.filter((p) => !p.hasVariants) : [];
  }, [data]);

  const handleTap = useCallback(
    (product) => {
      const ok = addItem(product);
      if (!ok) showError('Out of stock');
    },
    [addItem]
  );

  const handleQuickSaleConfirm = useCallback(
    async (amount) => {
      setQuickSaleOpen(false);
      if (!activeTenantId) return;
      setQuickSaleBusy(true);
      try {
        const product = await getOrCreateQuickSaleProduct(activeTenantId);
        addCustomAmountItem({ id: product.id, name: product.name, unitPrice: amount });
      } catch {
        showError('Could not add quick sale. Please try again.');
      } finally {
        setQuickSaleBusy(false);
      }
    },
    [activeTenantId, addCustomAmountItem]
  );

  const total = getTotal();

  return (
    <div className="flex min-h-screen flex-col">
      <SimpleHeader>
        <button
          type="button"
          aria-label="Quick sale"
          disabled={quickSaleBusy}
          onClick={() => setQuickSaleOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0fdf4] disabled:opacity-50"
        >
          <Calculator size={22} color="#166534" />
        </button>
        <button
          type="button"
          aria-label="Sell"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#166534]"
        >
          <ShoppingCart size={22} color="#fff" />
        </button>
        <button
          type="button"
          aria-label="Stock"
          onClick={() => navigate('/simple/stock')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0fdf4]"
        >
          <Boxes size={22} color="#166534" />
        </button>
      </SimpleHeader>

      <div className="grid flex-1 grid-cols-3 gap-3 p-2 pb-6 sm:grid-cols-4 md:grid-cols-6">
        {isLoading && products.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-gray-400">Loading products…</p>
        ) : (
          products.map((item) => {
            const uri = resolveImageUrl(item.imageUrl);
            const outOfStock = item.trackStock !== false && Number(item.quantityOnHand ?? 0) <= 0;
            return (
              <button
                key={item.id}
                type="button"
                disabled={outOfStock}
                onClick={() => handleTap(item)}
                className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl bg-gray-100 transition-opacity active:opacity-70 disabled:opacity-35"
              >
                <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
                  {uri ? (
                    <img src={uri} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff size={32} className="text-gray-400" />
                  )}
                </div>
                <p className="py-1.5 text-lg font-bold text-black">{formatAmount(item.sellingPrice)}</p>
              </button>
            );
          })
        )}
      </div>

      {items.length > 0 && (
        <div className="sticky bottom-0 border-t border-gray-200 bg-white pb-2">
          <div className="flex gap-3 overflow-x-auto px-2 pt-2">
            {items.map((item) => {
              const uri = resolveImageUrl(item.imageUrl);
              return (
                <div key={item.id} className="flex w-16 shrink-0 flex-col items-center">
                  {uri ? (
                    <img src={uri} alt="" className="h-12 w-12 rounded-[10px] object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-gray-100">
                      <ImageOff size={18} className="text-gray-400" />
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0fdf4]"
                    >
                      <Minus size={16} color="#166534" />
                    </button>
                    <span className="min-w-[20px] text-center text-base font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0fdf4]"
                    >
                      <Plus size={16} color="#166534" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => navigate('/simple/charge')}
            className="mx-4 mt-2 flex flex-col items-center rounded-2xl bg-[#166534] py-[18px]"
          >
            <span className="text-sm font-semibold tracking-wide text-[#b5ed00]">CHARGE</span>
            <span className="text-[34px] font-bold leading-tight text-white">{formatAmount(total)}</span>
          </button>
        </div>
      )}

      <NumberPadModal
        open={quickSaleOpen}
        title="Quick sale amount"
        onConfirm={handleQuickSaleConfirm}
        onCancel={() => setQuickSaleOpen(false)}
      />
    </div>
  );
};

export default SimpleSell;
