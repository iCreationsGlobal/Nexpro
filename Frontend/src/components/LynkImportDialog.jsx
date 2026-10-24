import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import productService from '../services/productService';

/**
 * Bring in products with Lynk AI: Lynk's own screen inside ABS. The owner gives any file (Excel, PDF, Word, a photo
 * of their book) or says what they sell; Lynk asks about what's missing, then sends the products to ABS's server,
 * which adds them like its own import. This waits until they're in, then hands back the batch (for Undo).
 */
export default function LynkImportDialog({ open, onOpenChange, onSaved }) {
  const [screen, setScreen] = useState(null);
  const [state, setState] = useState('starting');
  const [error, setError] = useState(null);
  const importId = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let stopped = false;
    setState('starting');
    setError(null);
    setScreen(null);
    productService.startLynkImport()
      .then((res) => {
        if (stopped) return;
        importId.current = res.importId;
        setScreen(res.screenUrl);
        setState('open');
      })
      .catch((err) => {
        if (stopped) return;
        setError(err?.response?.data?.message ?? 'Lynk AI isn\'t available right now. Try again in a moment.');
        setState('error');
      });
    return () => { stopped = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !screen) return undefined;
    const origin = new URL(screen).origin;
    let polling = 0;
    const onMessage = async (event) => {
      if (event.origin !== origin || event.data?.source !== 'lynk-import') return;
      if (event.data.event === 'closed') { onOpenChange(false); return; }
      if (event.data.event !== 'finished' || polling) return;
      // Lynk sends the products to ABS's server; wait until they're in (up to a minute and a half).
      setState('saving');
      polling = 1;
      for (let i = 0; i < 45; i += 1) {
        try {
          const status = await productService.lynkImportStatus(importId.current);
          if (status?.finished) {
            onSaved?.({
              batchId: status.batchId,
              addedCount: status.addedCount ?? 0,
              updatedCount: status.updatedCount ?? 0,
              notIn: [...(status.leftOut ?? []), ...(status.skipped ?? []), ...(status.failed ?? [])],
            });
            onOpenChange(false);
            return;
          }
        } catch { /* try again */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setError('Lynk sent the products, but they aren\'t in ABS yet. Check Products in a few minutes.');
      setState('error');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, screen, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Bring in products with Lynk AI</DialogTitle>
          <DialogDescription className="sr-only">Give Lynk AI your products in any form; it arranges them and asks about anything missing.</DialogDescription>
        </DialogHeader>
        <div className="relative flex-1 min-h-0">
          {screen && <iframe title="Bring in products" src={screen} allow="microphone; autoplay; clipboard-write" className="h-full w-full border-0" />}
          {state !== 'open' && (
            <div className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center">
              {state === 'error' ? (
                <div className="max-w-sm space-y-3">
                  <p className="text-sm">{error}</p>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {state === 'saving' ? 'Adding your products to ABS…' : 'Opening Lynk AI…'}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
