import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Loader2, WifiOff } from 'lucide-react';

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useDeviceMode } from '../hooks/useDeviceMode';
import { cn } from '@/lib/utils';

const SLOW_REQUEST_DELAY_MS = 7000;

/**
 * Global connection feedback for online-only web workflows.
 * @param {{ className?: string }} props
 */
const ConnectionHealthBanner = ({ className = '' }) => {
  const { isOnline } = useOnlineStatus();
  // Phones and tablets keep fetched data on the device (lib/queryPersistence), so pages still show it.
  const { isAppShell: showsSavedData } = useDeviceMode();
  const fetchingCount = useIsFetching();
  const mutatingCount = useIsMutating();
  const hasNetworkActivity = fetchingCount + mutatingCount > 0;
  const [showSlowRequest, setShowSlowRequest] = useState(false);

  useEffect(() => {
    if (!isOnline || !hasNetworkActivity) {
      setShowSlowRequest(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowSlowRequest(true);
    }, SLOW_REQUEST_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [hasNetworkActivity, isOnline]);

  const config = useMemo(() => {
    if (!isOnline) {
      return {
        role: 'alert',
        icon: WifiOff,
        className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200',
        title: "You're offline",
        message: showsSavedData
          ? "Showing what was last saved on this device. You can still take sales; other changes need a connection."
          : 'Reconnect to continue, or use the mobile app for offline work.',
      };
    }

    if (showSlowRequest) {
      return {
        role: 'status',
        icon: Loader2,
        iconClassName: 'animate-spin',
        className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
        title: 'Still working',
        message: 'This is taking longer than usual. Keep this page open while we finish.',
      };
    }

    return null;
  }, [isOnline, showSlowRequest, showsSavedData]);

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      role={config.role}
      aria-live={config.role === 'alert' ? 'assertive' : 'polite'}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-sm',
        config.className,
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClassName)} />
        <div className="min-w-0">
          <p className="font-medium">{config.title}</p>
          <p className="mt-0.5 text-xs opacity-90 sm:text-sm">{config.message}</p>
        </div>
      </div>
    </div>
  );
};

export default ConnectionHealthBanner;
