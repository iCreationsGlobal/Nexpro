import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppLogo from '@/components/AppLogo';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { useBranding } from '@/context/BrandingContext';

const DISMISSED_KEY = 'abs:install-card-dismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * One-time invitation (phones and tablets, dashboard) to add the app to the home screen.
 * Hidden once installed or dismissed; Install app stays in the More menu.
 */
export default function InstallAppCard() {
  const { canInstall, promptInstall } = usePWAInstall();
  const { appName } = useBranding();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!canInstall || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Not remembered without storage; the card shows again next visit.
    }
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3 md:mx-6" role="region" aria-label="Install the app">
      <AppLogo alt="" className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Install {appName}</p>
        <p className="text-xs text-muted-foreground">Open it from your home screen like an app, even with a weak connection.</p>
      </div>
      <Button size="sm" onClick={promptInstall} className="shrink-0">
        <Download className="mr-1.5 h-4 w-4" />
        Install
      </Button>
      <button
        type="button"
        onClick={dismiss}
        className="flex h-9 w-9 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full p-0 text-muted-foreground hover:bg-muted"
        aria-label="Not now"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
