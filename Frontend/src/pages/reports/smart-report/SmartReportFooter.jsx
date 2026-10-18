import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Report footer with helpful feedback.
 */
export default function SmartReportFooter({
  feedback,
  onFeedback,
  className,
}) {
  return (
    <div className={cn('mt-8', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground border-t border-border pt-4">
        <p>This report is built from your business data for the selected period.</p>
        <div className="flex items-center gap-2">
          <span>Report helpful?</span>
          <Button
            type="button"
            variant={feedback === 'up' ? 'default' : 'outline'}
            size="icon"
            className="h-8 w-8"
            aria-label="Helpful"
            onClick={() => onFeedback?.('up')}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={feedback === 'down' ? 'default' : 'outline'}
            size="icon"
            className="h-8 w-8"
            aria-label="Not helpful"
            onClick={() => onFeedback?.('down')}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
