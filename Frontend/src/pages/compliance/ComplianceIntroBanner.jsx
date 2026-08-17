import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Dismissible first-run intro for Compliance pages.
 * @param {{ storageKey: string, title: string, bullets: string[], ctaLabel?: string, onCta?: () => void }} props
 */
export default function ComplianceIntroBanner({
  storageKey,
  title,
  bullets = [],
  ctaLabel = 'Got it',
  onCta,
}) {
  const key = `compliance.intro.${storageKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    onCta?.();
  }, [key, onCta]);

  if (dismissed) return null;

  return (
    <div className="mb-6 rounded-lg border border-[#166534]/30 bg-green-50 p-4 md:p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {bullets.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="bg-brand hover:bg-brand-dark text-white"
          onClick={dismiss}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
