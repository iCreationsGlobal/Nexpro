import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Start loading the next rows while they're still this far below the screen. */
const PRELOAD_MARGIN = '0px 0px 600px 0px';

/**
 * Bottom of a list that loads as you scroll (phones and tablets). Loads the next rows when it
 * comes near the screen; the button is there for anyone who'd rather tap.
 * @param {{
 *   hasMore: boolean,
 *   loadMore: () => void,
 *   isLoadingMore: boolean,
 *   count?: number,
 *   noun?: string,
 *   className?: string,
 * }} props
 */
export default function InfiniteListFooter({ hasMore, loadMore, isLoadingMore, count, noun = 'items', className }) {
  const sentinelRef = useRef(null);
  const nearScreen = useRef(false);
  const latest = useRef({ hasMore, loadMore, isLoadingMore });
  latest.current = { hasMore, loadMore, isLoadingMore };

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      nearScreen.current = entry.isIntersecting;
      const state = latest.current;
      if (entry.isIntersecting && state.hasMore && !state.isLoadingMore) state.loadMore();
    }, { rootMargin: PRELOAD_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A short page can leave the footer on screen; keep going until it scrolls away or the list ends.
  useEffect(() => {
    if (nearScreen.current && hasMore && !isLoadingMore) loadMore();
  }, [hasMore, isLoadingMore, loadMore, count]);

  return (
    <div ref={sentinelRef} className={cn('flex min-h-14 items-center justify-center py-3', className)}>
      {isLoadingMore ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading more…
        </span>
      ) : hasMore ? (
        <Button type="button" variant="ghost" size="sm" onClick={loadMore}>
          Show more
        </Button>
      ) : count > 0 ? (
        <span className="text-sm text-muted-foreground">
          {count === 1 ? `1 ${noun.replace(/s$/, '')}` : `All ${count} ${noun}`}
        </span>
      ) : null}
    </div>
  );
}
