import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Compact CSV export button for rental report table cards.
 */
export default function RentalTableExportButton({ onClick, disabled = false, label = 'CSV' }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 border-border bg-card shrink-0"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Export ${label}`}
    >
      <Download className="h-3.5 w-3.5 mr-1.5 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}
