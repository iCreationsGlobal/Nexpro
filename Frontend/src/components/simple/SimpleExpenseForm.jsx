import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Calendar, Check, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Picture tiles for the common shop expenses; "Other" asks what it was. */
export const SIMPLE_EXPENSE_CATEGORIES = [
  { key: 'Stock', label: 'Stock', emoji: '📦', tile: 'bg-emerald-50 border-emerald-200', selected: 'ring-emerald-600' },
  { key: 'Transport', label: 'Transport', emoji: '🚐', tile: 'bg-sky-50 border-sky-200', selected: 'ring-sky-600' },
  { key: 'Electricity', label: 'Electricity', emoji: '💡', tile: 'bg-amber-50 border-amber-200', selected: 'ring-amber-500' },
  { key: 'Rent', label: 'Rent', emoji: '🏠', tile: 'bg-rose-50 border-rose-200', selected: 'ring-rose-500' },
  { key: 'Food', label: 'Food', emoji: '🍗', tile: 'bg-orange-50 border-orange-200', selected: 'ring-orange-500' },
  { key: 'Other', label: 'Other', emoji: '•••', tile: 'bg-violet-50 border-violet-200', selected: 'ring-violet-600' },
];

const OTHER_KEY = 'Other';
const tileKeyFor = (category) => {
  if (!category) return null;
  const match = SIMPLE_EXPENSE_CATEGORIES.find((c) => c.key !== OTHER_KEY && c.key.toLowerCase() === String(category).toLowerCase());
  return match ? match.key : OTHER_KEY;
};

/**
 * Simple Mode expense form: pick a picture, type the amount, save. Editing an expense opens the
 * same form with its values (and a Remove link).
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   expense?: { category?: string, amount?: number|string, expenseDate?: string } | null,
 *   saving?: boolean,
 *   onSave: (values: { category: string, amount: number, expenseDate: Date }) => void,
 *   onRemove?: () => void,
 * }} props
 */
export default function SimpleExpenseForm({ open, onOpenChange, expense = null, saving = false, onSave, onRemove }) {
  const [tile, setTile] = useState(null);
  const [otherText, setOtherText] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState('');
  const amountRef = useRef(null);
  const otherRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const key = tileKeyFor(expense?.category);
    setTile(key);
    setOtherText(key === OTHER_KEY ? String(expense?.category || '') : '');
    setAmount(expense?.amount != null && expense?.amount !== '' ? String(Number(expense.amount)) : '');
    setDate(dayjs(expense?.expenseDate || undefined).format('YYYY-MM-DD'));
    setError('');
  }, [open, expense]);

  const chooseTile = (key) => {
    setTile(key);
    setError('');
    window.setTimeout(() => (key === OTHER_KEY ? otherRef.current : amountRef.current)?.focus(), 0);
  };

  const handleSave = () => {
    const category = tile === OTHER_KEY ? otherText.trim() : tile;
    const value = Number(String(amount).replace(/,/g, ''));
    if (!tile) return setError('Tap what you spent money on.');
    if (!category) return setError('Type what you spent money on.');
    if (!Number.isFinite(value) || value <= 0) return setError('Enter the amount you spent.');
    onSave({ category, amount: value, expenseDate: dayjs(date).toDate() });
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] w-[calc(100vw-1.5rem)] max-w-3xl gap-5 overflow-y-auto rounded-3xl p-5 sm:gap-6 sm:p-8">
        <div className="flex items-center gap-3 pr-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Wallet className="h-7 w-7" />
          </span>
          <DialogTitle className="text-2xl font-bold sm:text-3xl">{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">Pick what you spent money on, enter the amount and save.</DialogDescription>

        <p className="mt-1 text-lg font-semibold text-foreground sm:text-xl">What did you spend money on?</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" role="radiogroup" aria-label="What did you spend money on?">
          {SIMPLE_EXPENSE_CATEGORIES.map((c) => {
            const active = tile === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTile(c.key)}
                className={cn(
                  'relative flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border px-4 py-5 transition-shadow sm:min-h-40',
                  c.tile,
                  active ? `ring-4 ${c.selected}` : 'hover:shadow-md'
                )}
              >
                <span
                  aria-hidden
                  className={cn('leading-none', c.key === OTHER_KEY ? 'text-4xl font-black tracking-widest text-violet-800' : 'text-5xl sm:text-6xl')}
                >
                  {c.emoji}
                </span>
                <span className="text-lg font-bold text-foreground sm:text-xl">{c.label}</span>
                {active ? (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {tile === OTHER_KEY ? (
          <label className="block">
            <span className="text-base font-semibold">What was it?</span>
            <input
              ref={otherRef}
              value={otherText}
              onChange={(e) => { setOtherText(e.target.value); setError(''); }}
              placeholder="e.g. Phone credit"
              maxLength={60}
              className="mt-2 h-14 w-full rounded-2xl border border-violet-200 bg-violet-50 px-5 text-lg outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <label className="block">
            <span className="text-base font-semibold">Amount</span>
            <span className="mt-2 flex h-20 items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-5 focus-within:ring-2 focus-within:ring-emerald-600">
              <span className="text-3xl font-bold text-emerald-800">₵</span>
              <input
                ref={amountRef}
                inputMode="decimal"
                value={amount}
                onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, '')); setError(''); }}
                placeholder="0.00"
                aria-label="Amount"
                className="w-full min-w-0 bg-transparent text-4xl font-bold text-emerald-900 outline-none placeholder:text-emerald-800/40"
              />
            </span>
          </label>
          <label className="block">
            <span className="text-base font-semibold">Date</span>
            <span className="mt-2 flex h-20 items-center gap-3 rounded-2xl border-2 border-sky-200 bg-sky-50 px-5 focus-within:ring-2 focus-within:ring-sky-600">
              <Calendar className="h-7 w-7 shrink-0 text-sky-700" />
              <input
                type="date"
                value={date}
                max={dayjs().format('YYYY-MM-DD')}
                onChange={(e) => setDate(e.target.value || dayjs().format('YYYY-MM-DD'))}
                aria-label="Date"
                className="w-full min-w-0 bg-transparent text-xl font-semibold text-sky-900 outline-none"
              />
            </span>
          </label>
        </div>

        {error ? <p role="alert" className="text-base font-semibold text-red-700">{error}</p> : null}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-1 h-20 w-full rounded-2xl bg-emerald-700 px-6 text-2xl font-bold text-white hover:bg-emerald-800"
        >
          {saving ? <Loader2 className="mr-3 h-8 w-8 animate-spin" /> : (
            <span className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-700">
              <Check className="h-6 w-6" />
            </span>
          )}
          Save Expense
        </Button>

        {expense && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="mx-auto block py-2 text-base font-semibold text-red-700 underline-offset-4 hover:underline"
          >
            Remove this expense
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
