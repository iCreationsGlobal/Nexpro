import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { formatAmount } from '../../utils/formatNumber';

/**
 * Nothing to read to know it worked: big checkmark + big total. Printing and WhatsApp/SMS share
 * are deliberately out of v1, same as mobile. Mirrors mobile/app/simple/receipt.tsx.
 */
const SimpleReceipt = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const amount = Number(state?.total) || 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <CheckCircle2 size={120} color="#166534" strokeWidth={1.5} />
      <p className="mb-14 mt-6 text-5xl font-bold text-black">{formatAmount(amount)}</p>
      <button
        type="button"
        onClick={() => navigate('/simple', { replace: true })}
        className="w-4/5 rounded-3xl bg-[#166534] py-[22px] text-xl font-bold text-white"
      >
        New sale
      </button>
    </div>
  );
};

export default SimpleReceipt;
