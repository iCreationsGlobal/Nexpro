import { useCallback } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import NotificationBell from '@/components/NotificationBell';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { lockSimpleMode } from '@/components/simple/SimpleModePinGate';
import SmartSearchField from './SmartSearchField';
import UserMenu from './UserMenu';

/**
 * Top bar for the sidebar (desktop) layout. Phones and tablets use AppHeader instead.
 */
export function Header() {
  const simpleMode = useSimpleMode();

  const handleHardRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card">
      <div className="flex h-16 items-center justify-between gap-4 px-10">
        {/* Search (hidden in Simple Mode) */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {simpleMode.isRestricted ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1 max-w-md">
                  <SmartSearchField />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">Quick search across customers, products, sales, and more</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Hard refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={handleHardRefresh}
                aria-label="Hard refresh"
                title="Hard refresh"
                className="h-9 w-9 border-border"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Hard refresh</TooltipContent>
          </Tooltip>

          {/* Notification Bell (Simple Mode: no notifications or alerts) */}
          {!simpleMode.isSimple && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div data-tour="header-notifications" className="inline-flex">
                  <NotificationBell />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">View order updates, low stock alerts, and other notifications</TooltipContent>
            </Tooltip>
          )}

          {/* Simple Mode: lock the app until the PIN is entered again */}
          {simpleMode.isSimple && (
            <Button
              variant="outline"
              size="sm"
              onClick={lockSimpleMode}
              aria-label="Lock"
              className="h-9 border-border"
            >
              <Lock className="h-4 w-4 mr-2" />
              <span>Lock</span>
            </Button>
          )}

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
