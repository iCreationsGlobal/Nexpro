import { useEffect, useState } from 'react';
import { Heart, Loader2, Monitor, Smartphone } from 'lucide-react';

import {
  COMPUTER_COLUMNS,
  PHONE_COLUMNS,
  sanitizeProductGrid,
  TEMPLATE_COMPUTER_COLUMNS,
} from '../../utils/productGrid';
import { Button } from '@/components/ui/button';

const PHONE_LABELS = { 1: { title: '1 per row', text: 'Large cards' }, 2: { title: '2 per row', text: 'Compact cards' } };
const CARD_STYLES = [
  { id: 'large', title: 'Large', text: 'Category and buttons' },
  { id: 'compact', title: 'Compact', text: 'Image, name and price' },
];

const Choice = ({ selected, title, text, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
      selected
        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    }`}
  >
    <span className="block font-medium">{title}</span>
    {text ? <span className="mt-0.5 block text-xs opacity-75">{text}</span> : null}
  </button>
);

const ChoiceGroup = ({ legend, hint, className, children }) => (
  <fieldset>
    <legend className="text-sm font-semibold text-slate-900">{legend}</legend>
    {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
    <div className={`mt-2 grid gap-2 ${className}`}>{children}</div>
  </fieldset>
);

const SampleCard = ({ compact, accent }) => (
  <div className="overflow-clip rounded-md border border-slate-200 bg-white">
    <div className="relative aspect-square bg-slate-100">
      <Heart className="absolute right-1 top-1 h-2 w-2 text-slate-400" aria-hidden />
    </div>
    <div className="space-y-1 p-1">
      {compact ? null : <div className="h-1 w-1/2 rounded bg-slate-200" />}
      <div className="h-1 w-full rounded bg-slate-300" />
      {compact ? null : <div className="h-1.5 w-2/3 rounded-full bg-slate-100" />}
      <div className="h-1.5 w-3/5 rounded" style={{ backgroundColor: accent }} />
      {compact ? null : (
        <div className="grid grid-cols-2 gap-0.5 pt-0.5">
          <div className="h-2 rounded-full border border-slate-200" />
          <div className="h-2 rounded-full" style={{ backgroundColor: accent }} />
        </div>
      )}
    </div>
  </div>
);

const SampleGrid = ({ columns, count, compact, accent }) => (
  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {Array.from({ length: count }, (_, index) => <SampleCard key={index} compact={compact} accent={accent} />)}
  </div>
);

/**
 * How many products shoppers see per row.
 * @param {{
 *   value?: object | null,
 *   templateId?: string | null,
 *   saving?: boolean,
 *   accentColor?: string,
 *   onSave: (grid: object) => void | Promise<void>,
 * }} props
 */
const StoreProductLayoutPanel = ({ value = null, templateId = null, saving = false, accentColor = '#166534', onSave }) => {
  const [draft, setDraft] = useState(() => sanitizeProductGrid(value));

  useEffect(() => {
    setDraft(sanitizeProductGrid(value));
  }, [value]);

  const change = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const accent = String(accentColor || '').trim() || '#166534';
  const templateColumns = TEMPLATE_COMPUTER_COLUMNS[templateId] || TEMPLATE_COMPUTER_COLUMNS.classic;
  const computerColumns = draft.computer || templateColumns;
  const compactOnComputer = draft.computerCards === 'compact';

  return (
    <div className="space-y-6">
      <ChoiceGroup legend="Phones" className="grid-cols-2">
        {PHONE_COLUMNS.map((columns) => (
          <Choice
            key={columns}
            selected={draft.phone === columns}
            title={PHONE_LABELS[columns].title}
            text={PHONE_LABELS[columns].text}
            onClick={() => change({ phone: columns })}
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup legend="Computers" hint="Tablets always show 3 per row." className="grid-cols-3 sm:grid-cols-5">
        <Choice
          selected={draft.computer === null}
          title="Template"
          text={`${templateColumns} per row`}
          onClick={() => change({ computer: null })}
        />
        {COMPUTER_COLUMNS.map((columns) => (
          <Choice
            key={columns}
            selected={draft.computer === columns}
            title={String(columns)}
            text="per row"
            onClick={() => change({ computer: columns })}
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup
        legend="Cards on computers"
        hint={computerColumns > 4 && !compactOnComputer ? 'Compact cards fit best with 5 or 6 per row.' : ''}
        className="grid-cols-2"
      >
        {CARD_STYLES.map((style) => (
          <Choice
            key={style.id}
            selected={draft.computerCards === style.id}
            title={style.title}
            text={style.text}
            onClick={() => change({ computerCards: style.id })}
          />
        ))}
      </ChoiceGroup>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="product-layout-preview">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="flex items-start gap-4">
          <div className="w-20 shrink-0">
            <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-500"><Smartphone className="h-3.5 w-3.5" aria-hidden /> Phone</p>
            <div className="h-48 overflow-clip rounded-xl border border-slate-300 bg-white p-1.5" aria-label={`Phone: ${draft.phone} per row`}>
              <SampleGrid columns={draft.phone} count={draft.phone === 1 ? 2 : 6} compact={draft.phone === 2} accent={accent} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-500"><Monitor className="h-3.5 w-3.5" aria-hidden /> Computer</p>
            <div className="h-48 overflow-clip rounded-xl border border-slate-300 bg-white p-2" aria-label={`Computer: ${computerColumns} per row`}>
              <SampleGrid columns={computerColumns} count={computerColumns * 2} compact={compactOnComputer} accent={accent} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={saving}
          className="bg-[#166534] text-white hover:bg-[#14532d]"
          onClick={() => onSave(draft)}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save layout
        </Button>
      </div>
    </div>
  );
};

export default StoreProductLayoutPanel;
