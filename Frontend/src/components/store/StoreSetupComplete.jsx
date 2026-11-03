import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Package,
  Pencil,
  ShoppingBag,
  Store,
} from 'lucide-react';

import storeService from '../../services/storeService';
import { buildOnlineStoreUrl } from '../../utils/storefrontUrl';
import { showError, showSuccess } from '../../utils/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConnectDomainDialog, {
  DomainStatusBadge,
  buildDnsRecord,
  getDomainActionLabel,
} from './ConnectDomainDialog';
import OnlineStoreHelpBanner from './OnlineStoreHelpBanner';

const CONFIG_STEPS = [
  { id: 'info', label: 'Store Information' },
  { id: 'branding', label: 'Branding' },
  { id: 'payments', label: 'Payments' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'hero', label: 'Homepage' },
];

/**
 * Post-launch Online Store setup complete screen.
 * @param {{
 *   publicStoreUrl: string,
 *   isStudioStore?: boolean,
 *   onEditStep: (stepId: string) => void,
 * }} props
 */
const StoreSetupComplete = ({ publicStoreUrl, isStudioStore = false, onEditStep }) => {
  const queryClient = useQueryClient();
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  const { data: domainResponse } = useQuery({
    queryKey: ['store', 'domain'],
    queryFn: () => storeService.getDomainSettings(),
  });

  const domainData = domainResponse?.data ?? domainResponse ?? {};
  const customDomain = domainData.customDomain || '';
  const domainStatus = domainData.customDomainStatus || 'none';
  const cnameTarget = domainData.cnameTarget || 'store.absghana.com';
  const storeSlug = domainData.slug || '';

  const preferredStoreUrl = useMemo(() => {
    const fromHelper = buildOnlineStoreUrl(storeSlug || '', {
      customDomain,
      customDomainStatus: domainStatus,
    });
    return fromHelper || publicStoreUrl || '';
  }, [customDomain, domainStatus, publicStoreUrl, storeSlug]);

  const displayUrl = useMemo(() => (
    String(preferredStoreUrl || '').replace(/^https?:\/\//i, '')
  ), [preferredStoreUrl]);

  const dnsRecord = useMemo(
    () => buildDnsRecord(customDomain, cnameTarget, domainData),
    [customDomain, cnameTarget, domainData],
  );

  const productsPath = isStudioStore ? '/store/services' : '/products';
  const productsLabel = isStudioStore ? 'Manage Services' : 'Manage Products';

  useEffect(() => {
    setDomainInput(customDomain);
  }, [customDomain]);

  const saveMutation = useMutation({
    mutationFn: (domain) => storeService.updateDomain(domain),
    onSuccess: () => {
      showSuccess('Domain saved. Add the DNS record below at your domain provider.');
      queryClient.invalidateQueries({ queryKey: ['store', 'domain'] });
    },
    onError: (error) => showError(error, 'Could not save domain'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => storeService.updateDomain(''),
    onSuccess: () => {
      showSuccess('Custom domain disconnected');
      queryClient.invalidateQueries({ queryKey: ['store', 'domain'] });
    },
    onError: (error) => showError(error, 'Could not disconnect domain'),
  });

  const handleCopyLink = useCallback(async () => {
    if (!preferredStoreUrl) {
      showError('Store link is not available yet');
      return;
    }
    try {
      await navigator.clipboard.writeText(preferredStoreUrl);
      showSuccess('Store link copied');
    } catch {
      showError('Could not copy the store link');
    }
  }, [preferredStoreUrl]);

  const handleSaveDomain = useCallback((event) => {
    event.preventDefault();
    saveMutation.mutate(domainInput.trim());
  }, [domainInput, saveMutation]);

  const handleCopyAllRecord = useCallback(async () => {
    if (!dnsRecord) return;
    const text = dnsRecord.records
      .map((record) => `Type: ${record.type}\nHost / Name: ${record.host}\nValue / Target / Points to: ${record.value}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(dnsRecord.records.length > 1 ? 'DNS records copied' : 'DNS record copied');
    } catch {
      showError('Could not copy to clipboard');
    }
  }, [dnsRecord]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <nav className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link to="/online-store" className="hover:text-foreground">
            Online Store
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-foreground">Setup</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Store Setup</h1>
      </div>

      <Card className="border border-green-200 bg-green-50">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-lg font-semibold text-green-900">
              Your store is live! 🎉
            </p>
            <p className="mt-1 text-sm text-green-900/70">
              Customers can visit your storefront and place orders.
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-green-900">Setup progress</span>
              <span className="text-green-900/70">100%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-green-100">
              <div className="h-full w-full rounded-full bg-green-700" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {preferredStoreUrl ? (
            <a
              href={preferredStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 transition-colors hover:border-green-700 hover:bg-green-50/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-green-700">
                <Store className="h-4 w-4" />
              </span>
              <span className="font-medium">Visit Store</span>
              <span className="text-xs text-muted-foreground">Open your live storefront</span>
            </a>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-4 opacity-60">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Store className="h-4 w-4" />
              </span>
              <span className="font-medium">Visit Store</span>
              <span className="text-xs text-muted-foreground">Store URL not ready</span>
            </div>
          )}

          <Link
            to={productsPath}
            className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 transition-colors hover:border-green-700 hover:bg-green-50/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-green-700">
              <Package className="h-4 w-4" />
            </span>
            <span className="font-medium">{productsLabel}</span>
            <span className="text-xs text-muted-foreground">
              {isStudioStore ? 'Update services customers book' : 'Add or update catalog items'}
            </span>
          </Link>

          {!isStudioStore ? (
            <Link
              to="/store/orders"
              className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 transition-colors hover:border-green-700 hover:bg-green-50/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-green-700">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <span className="font-medium">View Orders</span>
              <span className="text-xs text-muted-foreground">Track online store orders</span>
            </Link>
          ) : (
            <Link
              to="/online-store"
              className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 transition-colors hover:border-green-700 hover:bg-green-50/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-green-700">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <span className="font-medium">Online Store</span>
              <span className="text-xs text-muted-foreground">Preview and domain settings</span>
            </Link>
          )}
        </div>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Your Store Link</CardTitle>
            <DomainStatusBadge status={domainStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            Share this URL so customers can shop from your storefront.
            {customDomain ? (
              <>
                {' '}
                Custom domain:{' '}
                <span className="font-medium text-foreground">{customDomain}</span>
              </>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="break-all text-sm font-medium">
              {displayUrl || 'Store URL is not available yet'}
            </p>
          </div>
          <OnlineStoreHelpBanner />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setDomainDialogOpen(true)}
            >
              <Globe className="mr-2 h-4 w-4" />
              {getDomainActionLabel(domainStatus)}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={handleCopyLink}
              disabled={!preferredStoreUrl}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            {preferredStoreUrl ? (
              <Button type="button" asChild className="bg-[#166534] text-white hover:bg-[#14532d]">
                <a href={preferredStoreUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Store
                </a>
              </Button>
            ) : (
              <Button type="button" disabled className="bg-[#166534] text-white hover:bg-[#14532d]">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Store
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Store Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Update any setup step without re-running the full wizard.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {CONFIG_STEPS.map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-green-700">
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Completed
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 bg-background"
                onClick={() => onEditStep(step.id)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Need changes later? Edit a configuration step above, or manage your store from{' '}
            <Link to="/online-store" className="font-medium text-green-700 hover:underline">
              Online Store
            </Link>
            .
          </span>
        </p>
        <Button type="button" variant="outline" className="shrink-0 bg-background" asChild>
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>

      <ConnectDomainDialog
        open={domainDialogOpen}
        onOpenChange={setDomainDialogOpen}
        domainStatus={domainStatus}
        domainInput={domainInput}
        onDomainInputChange={setDomainInput}
        customDomain={customDomain}
        cnameTarget={cnameTarget}
        dnsRecord={dnsRecord}
        onSave={handleSaveDomain}
        onDisconnect={() => disconnectMutation.mutate()}
        onCopyAllRecord={handleCopyAllRecord}
        savePending={saveMutation.isPending}
        disconnectPending={disconnectMutation.isPending}
      />
    </div>
  );
};

export default StoreSetupComplete;
