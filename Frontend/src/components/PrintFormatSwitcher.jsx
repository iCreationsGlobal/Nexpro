const FORMAT_OPTIONS = [
  { value: 'a4', label: 'A4' },
  { value: 'thermal_80', label: '80mm' },
  { value: 'thermal_58', label: '58mm' },
];

/**
 * Segmented control to preview/print/download a document in a different paper format
 * than the tenant's saved default, for this one view only.
 * `size="lg"` renders full-width, touch-friendly buttons (Simple Mode receipt drawer).
 * @param {{ value: string, onChange: (format: string) => void, className?: string, size?: 'sm'|'lg' }} props
 */
export default function PrintFormatSwitcher({ value, onChange, className = '', size = 'sm' }) {
  const large = size === 'lg';
  return (
    <div
      className={`${large ? 'flex w-full rounded-xl' : 'inline-flex rounded-md'} border border-border overflow-hidden shrink-0 ${className}`}
      role="group"
      aria-label="Paper format"
    >
      {FORMAT_OPTIONS.map((opt, index) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`${large ? 'flex-1 px-3 py-3 text-base' : 'px-2.5 py-1.5 text-xs'} font-medium whitespace-nowrap transition-colors ${
            index > 0 ? 'border-l border-border' : ''
          } ${
            value === opt.value
              ? 'bg-brand text-white'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
