import { Download, Share, PlusSquare, Bookmark, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { usePWAInstall } from '../context/PWAInstallContext';
import { useSimpleMode } from '../hooks/useSimpleMode';

/**
 * PWA Install Banner Component
 * Shows install prompt for Android/Chrome, iOS instructions, or browser-specific messages
 * (Safari desktop, Firefox, Edge, Opera Mini).
 */
export const PWAInstallBanner = () => {
  const { isSimple } = useSimpleMode();
  const {
    canInstall,
    showInstallBanner,
    installVariant,
    isIOSDevice,
    showIOSInstructions,
    promptInstall,
    closeIOSInstructions,
  } = usePWAInstall();

  if (isSimple || !showInstallBanner) return null;

  // Opera Mini: message only, no install button
  if (installVariant === 'opera-mini') {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
        <Info className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          Install isn&apos;t supported in Opera Mini. For the best experience, open this app in Chrome or Safari and use &quot;Install app&quot; there. You can bookmark this page for quick access.
        </span>
      </div>
    );
  }

  // Safari desktop: manual instructions
  if (installVariant === 'safari-desktop') {
    return (
      <div className="bg-muted/80 border border-border px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap">
        <span>Add this app: use <strong>File → Add to Dock</strong> or bookmark this page for quick access.</span>
      </div>
    );
  }

  // Firefox: bookmark message
  if (installVariant === 'firefox') {
    return (
      <div className="bg-muted/80 border border-border px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
        <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>Bookmark or pin this page for quick access (Firefox does not support &quot;Install app&quot; for this site).</span>
      </div>
    );
  }

  // Edge without native prompt
  if (installVariant === 'edge-manual') {
    return (
      <div className="bg-muted/80 border border-border px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
        <span>Install via browser menu: <strong>Apps → Install this site as an app</strong>.</span>
      </div>
    );
  }

  // Native (Chrome/Android) or iOS: show install button that opens prompt or iOS modal
  if (!canInstall) return null;

  return (
    <>
      {/* iOS Instructions Modal */}
      <Dialog open={showIOSInstructions} onOpenChange={closeIOSInstructions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-green-700" />
              Install ABS
            </DialogTitle>
            <DialogDescription>
              Add ABS to your home screen for quick access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold">
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Tap the Share button</p>
                <p className="text-sm text-gray-500 mt-1">
                  Look for the <Share className="inline h-4 w-4" /> icon at the bottom of Safari
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold">
                2
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Scroll and tap &quot;Add to Home Screen&quot;</p>
                <p className="text-sm text-gray-500 mt-1">
                  Look for <PlusSquare className="inline h-4 w-4" /> Add to Home Screen in the menu
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold">
                3
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Tap &quot;Add&quot; to confirm</p>
                <p className="text-sm text-gray-500 mt-1">
                  ABS will appear on your home screen
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={closeIOSInstructions} variant="outline">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * Install App Button Component
 * Can be used in sidebar or other locations
 */
export const InstallAppButton = ({ className = '', variant = 'ghost', showLabel = true }) => {
  const { canInstall, promptInstall, isIOSDevice } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <Button
      variant={variant}
      className={className}
      onClick={promptInstall}
      title={isIOSDevice ? 'Add to Home Screen' : 'Install App'}
    >
      <Download className="h-4 w-4" />
      {showLabel && <span className="ml-2">Install App</span>}
    </Button>
  );
};

export default PWAInstallBanner;
