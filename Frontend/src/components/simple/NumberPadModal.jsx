import { useCallback, useState } from 'react';
import { Delete, X } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/** Free-length numeric entry (restock quantities, quick-sale amounts) — sheet with a confirm button. */
const NumberPadModal = ({ open, title, onConfirm, onCancel }) => {
  const [digits, setDigits] = useState('');

  const press = useCallback((key) => {
    if (key === '') return;
    if (key === 'del') {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    setDigits((prev) => (prev.length >= 6 ? prev : prev + key));
  }, []);

  const handleConfirm = useCallback(() => {
    const value = Number(digits);
    if (!digits || !Number.isFinite(value) || value <= 0) return;
    onConfirm(value);
    setDigits('');
  }, [digits, onConfirm]);

  const handleCancel = useCallback(() => {
    setDigits('');
    onCancel();
  }, [onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40" onClick={handleCancel}>
      <div
        className="flex w-full max-w-md flex-col items-center rounded-t-3xl bg-white pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Cancel"
          onClick={handleCancel}
          className="absolute right-4 top-4 p-2 text-gray-500"
        >
          <X size={24} />
        </button>
        <p className="mb-2 text-base font-semibold text-black">{title}</p>
        <p className="mb-4 text-[44px] font-bold leading-none text-[#166534]">{digits || '0'}</p>
        <div className="grid w-[280px] grid-cols-3 justify-items-center">
          {KEYS.map((key, i) => (
            <button
              key={i}
              type="button"
              disabled={key === ''}
              onClick={() => press(key)}
              className="flex h-[72px] w-[80px] items-center justify-center rounded-xl text-2xl font-semibold text-black transition-colors active:bg-gray-100 disabled:cursor-default"
              style={{ visibility: key === '' ? 'hidden' : 'visible' }}
            >
              {key === 'del' ? <Delete size={26} color="#166534" /> : key}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!digits}
          onClick={handleConfirm}
          className="mt-4 w-4/5 rounded-2xl bg-[#166534] py-[18px] text-xl font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
};

export default NumberPadModal;
