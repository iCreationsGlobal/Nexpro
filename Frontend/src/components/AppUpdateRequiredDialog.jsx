import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Smile } from 'lucide-react';
import { releaseBodyInteractionLocks } from '../utils/releaseBodyInteractionLocks';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { cn } from '@/lib/utils';

export const APP_UPDATE_REQUIRED_EVENT = 'abs:app-update-required';

const SNOOZE_STORAGE_KEY = 'abs-app-update-snooze-until';
/** How long “Remind me later” hides the dialog (4 hours). */
export const APP_UPDATE_SNOOZE_MS = 4 * 60 * 60 * 1000;

/**
 * Ask the app shell to show the “new version” dialog (respects snooze).
 */
export function requestAppUpdateDialog() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APP_UPDATE_REQUIRED_EVENT));
}

/**
 * @returns {boolean} true if the user asked to be reminded later and snooze is still active
 */
export function isAppUpdateSnoozed() {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number(sessionStorage.getItem(SNOOZE_STORAGE_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Hide the update dialog until the snooze window expires.
 */
export function snoozeAppUpdateDialog(ms = APP_UPDATE_SNOOZE_MS) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + ms));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Clear any active snooze (e.g. after a successful update).
 */
export function clearAppUpdateSnooze() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SNOOZE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Friendly dialog when a new ABS version is ready.
 *
 * @param {{
 *   open: boolean,
 *   onUpdate: () => void,
 *   onRemindLater?: () => void,
 *   updating?: boolean,
 * }} props
 */
export default function AppUpdateRequiredDialog({
  open,
  onUpdate,
  onRemindLater,
  updating = false,
}) {
  // A Sheet/Dialog (e.g. the tablet sidebar) can leave `pointer-events: none` / `inert` on
  // <body>; the buttons would then ignore every tap. Clear those locks when we open.
  useEffect(() => {
    if (open) releaseBodyInteractionLocks();
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  // Portal straight onto <body> with pointer events forced on and a z-index above other
  // overlays (tour is 10000), so nothing in the app tree can cover or disable it.
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-4"
      style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="abs-update-title"
      aria-describedby="abs-update-desc"
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-2xl border border-border bg-white p-6 text-center',
          'sm:p-8'
        )}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#dcfce7]">
          <Smile className="h-7 w-7 text-[#166534]" aria-hidden />
        </div>

        <h2 id="abs-update-title" className="text-xl font-semibold text-foreground">
          New version of ABS is available
        </h2>
        <p id="abs-update-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We’ve improved ABS. Update now to keep using the latest version.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {onRemindLater ? (
            <SecondaryButton
              type="button"
              className="h-11 w-full text-base"
              disabled={updating}
              onClick={onRemindLater}
            >
              Remind me later
            </SecondaryButton>
          ) : null}
          <Button
            type="button"
            className="h-11 w-full bg-[#166534] text-base hover:bg-[#14532d]"
            disabled={updating}
            onClick={onUpdate}
          >
            {updating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              'Update now'
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
