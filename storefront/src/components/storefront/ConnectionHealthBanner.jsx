import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Loader2, WifiOff } from 'lucide-react';

import { useStorefrontMode } from '../../context/StorefrontModeContext';
import { cn } from '@/lib/utils';

const SLOW_REQUEST_DELAY_MS = 7000;

const isBrowserOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(isBrowserOnline);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default function ConnectionHealthBanner() {
  const isOnline = useOnlineStatus();
  const { isSingleStoreMode } = useStorefrontMode();
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
        className: 'border-red-200 bg-red-50 text-red-800',
        title: "You're offline",
        message: 'Reconnect before checkout, sign-in, or order updates.',
      };
    }

    if (showSlowRequest) {
      return {
        role: 'status',
        icon: Loader2,
        iconClassName: 'animate-spin',
        className: 'border-amber-200 bg-amber-50 text-amber-900',
        title: 'Still loading',
        message: isSingleStoreMode
          ? 'The shop is taking longer than usual. Keep this page open while we finish.'
          : 'The marketplace is taking longer than usual. Keep this page open while we finish.',
      };
    }

    return null;
  }, [isOnline, isSingleStoreMode, showSlowRequest]);

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      role={config.role}
      aria-live={config.role === 'alert' ? 'assertive' : 'polite'}
      className={cn(
        'fixed bottom-[calc(1rem+var(--sf-tab-bar,0px))] left-3 right-3 z-[70] mx-auto max-w-md rounded-2xl border px-4 py-3 text-sm sm:left-auto sm:right-4 sm:mx-0 sm:w-[24rem]',
        config.className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClassName)} />
        <div className="min-w-0">
          <p className="font-bold">{config.title}</p>
          <p className="mt-0.5 text-xs opacity-90 sm:text-sm">{config.message}</p>
        </div>
      </div>
    </div>
  );
}
