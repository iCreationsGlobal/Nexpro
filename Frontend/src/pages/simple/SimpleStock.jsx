import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ImageOff, ShoppingCart } from 'lucide-react';
import SimpleHeader from '../../components/simple/SimpleHeader';
import NumberPadModal from '../../components/simple/NumberPadModal';
import productService from '../../services/productService';
import { resolveImageUrl } from '../../utils/fileUtils';

/**
 * Stock — same photo grid as Sell, but each tile shows quantity on hand instead of price.
 * Tapping opens the number pad to add received stock. Transfers, stock-takes and suppliers
 * stay in Full Mode. Mirrors mobile/app/simple/stock.tsx.
 */
const SimpleStock = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['simple', 'products'],
    queryFn: () => productService.getProducts({ page: 1, limit: 60, isActive: true }),
    staleTime: 30_000,
  });

  const products = useMemo(() => {
    const list = data?.data ?? data ?? [];
    return Array.isArray(list) ? list.filter((p) => !p.hasVariants && p.trackStock !== false) : [];
  }, [data]);

  const restockMutation = useMutation({
    mutationFn: ({ id, quantity }) =>
      productService.adjustStock(id, quantity, 'delta', 'Restock', { type: 'receive' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple', 'products'] });
    },
  });

  const handleConfirm = useCallback(
    (quantity) => {
      if (!selected) return;
      restockMutation.mutate({ id: selected.id, quantity });
      setSelected(null);
    },
    [selected, restockMutation]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SimpleHeader>
        <button
          type="button"
          aria-label="Sell"
          onClick={() => navigate('/simple')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0fdf4]"
        >
          <ShoppingCart size={22} color="#166534" />
        </button>
        <button
          type="button"
          aria-label="Stock"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#166534]"
        >
          <Boxes size={22} color="#fff" />
        </button>
      </SimpleHeader>

      <div className="grid flex-1 grid-cols-3 gap-3 p-2 pb-6 sm:grid-cols-4 md:grid-cols-6">
        {isLoading && products.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-gray-400">Loading products…</p>
        ) : (
          products.map((item) => {
            const uri = resolveImageUrl(item.imageUrl);
            const qty = Number(item.quantityOnHand ?? 0);
            const reorderLevel = Number(item.reorderLevel ?? 10);
            const low = qty <= (Number.isFinite(reorderLevel) && reorderLevel > 0 ? reorderLevel : 10);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl bg-gray-100"
              >
                <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
                  {uri ? (
                    <img src={uri} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff size={32} className="text-gray-400" />
                  )}
                </div>
                <p className={`py-1.5 text-xl font-bold ${low ? 'text-red-600' : 'text-black'}`}>{qty}</p>
              </button>
            );
          })
        )}
      </div>

      <NumberPadModal
        open={!!selected}
        title="Add stock received"
        onConfirm={handleConfirm}
        onCancel={() => setSelected(null)}
      />
    </div>
  );
};

export default SimpleStock;
