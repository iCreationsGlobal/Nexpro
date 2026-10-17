import { useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, UploadCloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { discardPendingSale, offlineSaleReference } from '@/services/offlineSalesQueue';
import { formatAmount } from '@/utils/formatNumber';
import { DATE_FORMATS } from '@/constants';
import { cn } from '@/lib/utils';

const salesLabel = (count) => `${count} ${count === 1 ? 'sale' : 'sales'}`;

/**
 * Phones/tablets: sales saved offline that have not reached ABS yet, like the native app's
 * OfflineQueueBanner. Opens a list to retry or discard (e.g. a sale the server rejected).
 * @param {{ pending: Array, syncing: boolean, onSyncNow: () => void }} props
 */
export default function PendingSalesBanner({ pending, syncing, onSyncNow }) {
  const { isOnline } = useOnlineStatus();
  const [listOpen, setListOpen] = useState(false);
  const [discarding, setDiscarding] = useState(null);
  if (!pending.length) return null;

  const failed = pending.filter((entry) => entry.lastError).length;
  const message = syncing
    ? `Syncing ${salesLabel(pending.length)}…`
    : !isOnline
      ? `${salesLabel(pending.length)} saved on this device · ${pending.length === 1 ? "it'll" : "they'll"} sync when you're back online`
      : failed > 0
        ? `${salesLabel(failed)} couldn't sync`
        : `${salesLabel(pending.length)} waiting to sync`;
  const Icon = syncing ? Loader2 : failed > 0 && isOnline ? AlertTriangle : UploadCloud;

  return (
    <>
      <div
        role="status"
        className={cn(
          'mx-4 mt-2 flex items-center gap-3 rounded-lg border px-3 py-2 text-sm md:mx-6',
          failed > 0 && isOnline && !syncing
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', syncing && 'animate-spin')} aria-hidden />
        <span className="min-w-0 flex-1">{message}</span>
        <Button size="sm" variant="outline" className="h-8 shrink-0 bg-white/70" onClick={() => setListOpen(true)}>
          View
        </Button>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0 shell:mx-auto shell:max-w-2xl">
          <SheetHeader className="flex-shrink-0 border-b border-border px-5 pb-3 pt-5 text-left">
            <SheetTitle>Sales saved on this device</SheetTitle>
            <SheetDescription>
              Taken without a connection. They're sent to ABS automatically; nothing is lost if you close the app.
            </SheetDescription>
          </SheetHeader>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-5">
            {pending.map((entry) => (
              <li key={entry.clientId} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {formatAmount(entry.total)} · {entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dayjs(entry.createdAt).format(DATE_FORMATS.DISPLAY_WITH_TIME)} · Receipt ref.{' '}
                    {entry.reference || offlineSaleReference(entry.clientId)}
                  </p>
                  {entry.lastError ? <p className="mt-1 text-xs text-destructive">{entry.lastError}</p> : null}
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 text-destructive" onClick={() => setDiscarding(entry)}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex-shrink-0 border-t border-border px-5 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <Button className="w-full" disabled={syncing || !isOnline} onClick={onSyncNow}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {isOnline ? 'Sync now' : "Waiting for a connection"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(discarding)} onOpenChange={(open) => !open && setDiscarding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {discarding ? `${formatAmount(discarding.total)} from ${dayjs(discarding.createdAt).format(DATE_FORMATS.DISPLAY_WITH_TIME)}` : ''} will
              not be recorded in ABS. Record it again from the point of sale if the customer paid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (discarding) discardPendingSale(discarding.clientId);
                setDiscarding(null);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
