import { BellRing, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useWebPush } from '@/hooks/useWebPush';

const STATUS_HINTS = {
  unsupported: "This browser can't show notifications. Use Chrome, Edge, Firefox or Safari, or install the app.",
  install: 'On iPhone and iPad, add ABS to your Home Screen first (Share → Add to Home Screen), then turn this on from the app.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then come back here.',
};

/**
 * "Notifications on this device": web push for the web app, shown once the server sends web push.
 * Which kinds of notification arrive still follows the push choices below.
 */
export default function DevicePushCard() {
  const { status, busy, error, turnOn, turnOff } = useWebPush();
  if (status === 'hidden' || status === 'checking') return null;

  const canToggle = status === 'on' || status === 'off';

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-5 w-5 shrink-0 text-muted-foreground" />
          Notifications on this device
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Get new orders, payments and alerts on this phone, tablet or computer, even when ABS is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {canToggle ? (
          <label className="flex min-h-[44px] items-center justify-between gap-4">
            <span className="text-sm font-medium">{status === 'on' ? 'On for this device' : 'Off for this device'}</span>
            <span className="flex items-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
              <Switch
                checked={status === 'on'}
                disabled={busy}
                onCheckedChange={(checked) => (checked ? turnOn() : turnOff())}
                aria-label="Notifications on this device"
              />
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">{STATUS_HINTS[status]}</p>
        )}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
