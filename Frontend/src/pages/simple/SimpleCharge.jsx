import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { useSimpleCart } from '../../context/SimpleCartContext';
import saleService from '../../services/saleService';
import { formatAmount } from '../../utils/formatNumber';
import { showError } from '../../utils/toast';

const generateSaleClientId = () =>
  `web-sale-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const METHODS = [
  { id: 'cash', label: 'Cash', Icon: Banknote },
  { id: 'mobile_money', label: 'Mobile Money', Icon: Smartphone },
  { id: 'card', label: 'Card', Icon: CreditCard },
];

/**
 * Charge screen — payment as icon buttons, one giant CHARGE button. No change calculation or
 * momo-number entry in v1: amountPaid is assumed to equal the total (the common case for these
 * shops); typed exceptions stay in Full Mode's POS. Mirrors mobile/app/simple/charge.tsx.
 */
const SimpleCharge = () => {
  const navigate = useNavigate();
  const { items, getTotal, getSubtotal, clearCart } = useSimpleCart();
  const [method, setMethod] = useState('cash');
  const total = getTotal();

  const createSaleMutation = useMutation({
    mutationFn: () => {
      const saleItems = items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
        tax: 0,
      }));
      return saleService.createSale({
        clientId: generateSaleClientId(),
        items: saleItems,
        total,
        subtotal: getSubtotal(),
        discount: 0,
        paymentMethod: method,
        amountPaid: total,
        status: 'completed',
      });
    },
    onSuccess: (sale) => {
      const saleId = sale?.id ?? sale?.data?.id ?? '';
      clearCart();
      navigate('/simple/receipt', { replace: true, state: { saleId, total } });
    },
    onError: (error) => {
      showError(error, 'Sale failed. Please try again.');
    },
  });

  const handleCharge = useCallback(() => {
    if (items.length === 0) return;
    createSaleMutation.mutate();
  }, [items.length, createSaleMutation]);

  return (
    <div className="flex min-h-screen flex-col items-center pt-6">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate(-1)}
        className="absolute left-4 top-4 p-3 text-3xl font-bold text-[#166534]"
      >
        ‹
      </button>

      <p className="mb-10 mt-12 text-[56px] font-bold text-black">{formatAmount(total)}</p>

      <div className="mb-12 flex gap-4">
        {METHODS.map(({ id, label, Icon }) => {
          const active = method === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMethod(id)}
              className={`flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-2xl ${
                active ? 'bg-[#166534]' : 'bg-[#f0fdf4]'
              }`}
            >
              <Icon size={32} color={active ? '#fff' : '#166534'} />
              <span className={`text-center text-xs font-medium ${active ? 'text-white' : 'text-[#166534]'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={createSaleMutation.isPending}
        onClick={handleCharge}
        className="mb-8 mt-auto w-[88%] rounded-3xl bg-[#166534] py-6 text-2xl font-bold text-white disabled:opacity-60"
      >
        {createSaleMutation.isPending ? 'Charging…' : `CHARGE ${formatAmount(total)}`}
      </button>
    </div>
  );
};

export default SimpleCharge;
