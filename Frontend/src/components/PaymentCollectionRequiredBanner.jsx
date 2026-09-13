/**
 * When automatic invoice sending is enabled but payment collection is not set up,
 * show a persistent banner prompting the user to set up payment collection.
 * Re-checks every 10 minutes and on window focus so the banner appears/updates
 * as soon as auto-send is turned on or payment is not configured.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import usePaymentSettings from '@/hooks/usePaymentSettings';
import { Button } from '@/components/ui/button';

const REFETCH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes – force check for payment collection

export default function PaymentCollectionRequiredBanner({
  dismissible = false,
  dismissed = false,
  onDismiss,
}) {
  const navigate = useNavigate();
  const { activeTenant, isManager } = useAuth();
  const tenantId = activeTenant?.id;
  const paymentQueryOptions = useMemo(
    () => ({
      refetchInterval: REFETCH_INTERVAL_MS,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
    }),
    []
  );
  const {
    paymentCollectionConfigured,
    onlinePaymentRequired,
  } = usePaymentSettings(paymentQueryOptions);

  if (!tenantId || !onlinePaymentRequired || paymentCollectionConfigured || dismissed) {
    return null;
  }

  return (
    <div className="relative mx-4 sm:mx-4 lg:mx-6 mt-2 rounded-lg border border-amber-600/50 bg-amber-500/10 px-3 py-2.5 pr-11 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <CreditCard className="h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-foreground">
          {isManager
            ? 'Online payments are enabled, but payment collection is not set up. Customers cannot pay online. Set up payment collection so payment links work.'
            : 'Online payments are enabled, but payment collection is not configured. Ask a workspace manager to set this up in Settings.'}
        </p>
      </div>
      {(isManager || dismissible) && (
        <div className="flex w-full sm:w-auto items-center gap-2">
          {isManager && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none shrink-0 border-amber-600/50 text-amber-700 hover:bg-amber-500/20"
              onClick={() => navigate('/settings/payments?subtab=merchant-id')}
            >
              Set up payment collection
            </Button>
          )}
        </div>
      )}
      {dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-8 w-8 shrink-0 text-amber-700 hover:bg-amber-500/20"
          aria-label="Hide payment collection banner on dashboard"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
