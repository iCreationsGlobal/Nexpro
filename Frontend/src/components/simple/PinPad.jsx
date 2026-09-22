import { useCallback, useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/**
 * Big-target numeric keypad for PIN entry — no typing, just taps.
 * Mirrors mobile/components/simple/PinPad.tsx.
 */
const PinPad = ({ onComplete, resetSignal, dotColor = '#fff', keyColor = '#fff' }) => {
  const [digits, setDigits] = useState('');

  useEffect(() => {
    setDigits('');
  }, [resetSignal]);

  const press = useCallback(
    (key) => {
      if (key === '') return;
      if (key === 'del') {
        setDigits((prev) => prev.slice(0, -1));
        return;
      }
      setDigits((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + key;
        if (next.length === PIN_LENGTH) {
          setTimeout(() => onComplete(next), 80);
        }
        return next;
      });
    },
    [onComplete]
  );

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-10 flex gap-5">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className="h-5 w-5 rounded-full border-2"
            style={{
              borderColor: dotColor,
              backgroundColor: i < digits.length ? dotColor : 'transparent',
            }}
          />
        ))}
      </div>
      <div className="grid w-[300px] grid-cols-3 justify-items-center gap-3">
        {KEYS.map((key, i) => (
          <button
            key={i}
            type="button"
            disabled={key === ''}
            aria-label={key === 'del' ? 'Delete' : key === '' ? undefined : `Digit ${key}`}
            onClick={() => press(key)}
            className="flex h-[88px] w-[88px] items-center justify-center rounded-full text-3xl font-semibold transition-colors active:bg-white/15 disabled:cursor-default"
            style={{ color: keyColor, visibility: key === '' ? 'hidden' : 'visible' }}
          >
            {key === 'del' ? <Delete size={28} color={keyColor} /> : key}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PinPad;
