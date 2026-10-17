import { Loader2 } from 'lucide-react';
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

const salesLabel = (count) => `${count} ${count === 1 ? 'sale' : 'sales'}`;

/**
 * Shown while signing out with sales still saved on this device (see useSignOut).
 * @param {{ pendingCheck: { step: string, count: number, otherWorkspaces: number }, onConfirm: () => void, onCancel: () => void }} props
 */
export default function SignOutPendingDialog({ pendingCheck, onConfirm, onCancel }) {
  const { step, count, otherWorkspaces } = pendingCheck;
  const open = step === 'syncing' || step === 'confirm';

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && step === 'confirm' && onCancel()}>
      <AlertDialogContent>
        {step === 'syncing' ? (
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
              Sending saved sales…
            </AlertDialogTitle>
            <AlertDialogDescription>
              {salesLabel(count)} taken offline on this device are being sent to ABS before you sign out.
            </AlertDialogDescription>
          </AlertDialogHeader>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{salesLabel(count)} haven&apos;t reached ABS yet</AlertDialogTitle>
              <AlertDialogDescription>
                {count === 1 ? 'It is' : 'They are'} saved on this device.
                {otherWorkspaces > 0
                  ? ` ${otherWorkspaces === count ? 'All of them belong' : `${otherWorkspaces} belong`} to another workspace — switch to it while online to send them.`
                  : ' Connect to the internet and stay signed in to send them now.'}{' '}
                If you sign out, {count === 1 ? 'it stays' : 'they stay'} on this device and will send the next time you
                sign in here. Until then {count === 1 ? 'it is' : 'they are'} not in your sales reports.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={onCancel}>Stay signed in</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>Sign out anyway</AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
