import { useCallback, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  ShieldOff,
} from 'lucide-react';

import { showError, showSuccess } from '../../utils/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import OnlineStoreHelpBanner from './OnlineStoreHelpBanner';

/**
 * True when a domain has been submitted (awaiting verification or live).
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export const isDomainConfigured = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'pending' || normalized === 'verified';
};

/**
 * Primary CTA / dialog title for domain actions.
 * Avoids "Connect domain" once a domain is pending or verified.
 * @param {string|null|undefined} status
 * @returns {string}
 */
export const getDomainActionLabel = (status) =>
  (isDomainConfigured(status) ? 'Manage domain' : 'Connect domain');

/**
 * Status pill for the connected custom domain (none / pending / verified).
 * @param {{ status: 'none'|'pending'|'verified' }} props
 */
export const DomainStatusBadge = ({ status }) => {
  if (status === 'verified') {
    return (
      <Badge className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Domain Connected
      </Badge>
    );
  }
  if (status === 'pending') {
    return (
      <Badge className="gap-1.5 border-amber-200 bg-amber-50 text-amber-800" variant="outline">
        <Clock className="h-3.5 w-3.5" />
        Pending
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5 border-slate-200 bg-slate-50 text-slate-600" variant="outline">
      <ShieldOff className="h-3.5 w-3.5" />
      Not connected
    </Badge>
  );
};

/** Where a domain itself (no www) points when the server doesn't send its records. */
const DEFAULT_A_RECORD = '216.198.79.1';

/**
 * Builds the DNS records a merchant should add at their registrar. The server sends the exact list (`dnsRecords`: an
 * A record for a domain itself, CNAMEs for www and subdomains, any ownership record) and what its last check found;
 * without them the same records are worked out here.
 * @param {string} customDomain
 * @param {string} cnameTarget
 * @param {{ dnsRecords?: { type: string, host: string, value: string }[], autoConnect?: boolean, hosting?: { state: string, message: string|null } | null }} [domainData]
 * @returns {{ type: string, host: string, value: string, isApex: boolean, fqdn: string, records: { type: string, host: string, value: string }[], autoConnect: boolean, hosting: object|null } | null}
 */
export const buildDnsRecord = (customDomain, cnameTarget, domainData = {}) => {
  const host = String(customDomain || '').trim().toLowerCase();
  const target = String(cnameTarget || '').trim().toLowerCase();
  if (!host || !target) return null;

  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;

  const isApex = labels.length === 2;
  const isWwwOfApex = labels.length === 3 && labels[0] === 'www';
  const fallback = isApex || isWwwOfApex
    ? [{ type: 'A', host: '@', value: DEFAULT_A_RECORD }, { type: 'CNAME', host: 'www', value: target }]
    : [{ type: 'CNAME', host: labels.slice(0, -2).join('.'), value: target }];
  const records = domainData?.dnsRecords?.length ? domainData.dnsRecords : fallback;

  return {
    ...records[0],
    isApex,
    fqdn: host,
    records,
    autoConnect: Boolean(domainData?.autoConnect),
    hosting: domainData?.hosting || null,
  };
};

/**
 * What the last check of the domain found, in a line the merchant can act on.
 * @param {{ status: string, hosting: { state: string, message: string|null } | null }} props
 */
const HostingProgress = ({ status, hosting }) => {
  if (status !== 'pending' || !hosting) return null;
  const problem = hosting.state === 'problem';
  return (
    <p className={`rounded-md border p-3 text-sm ${problem ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      {hosting.message || 'Waiting for your records. This updates by itself.'}
    </p>
  );
};

/**
 * Copyable cell for a DNS record field.
 * @param {{ label: string, value: string }} props
 */
const DnsCopyField = ({ label, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showSuccess(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showError('Could not copy to clipboard');
    }
  }, [label, value]);

  return (
    <div className="flex items-center gap-2">
      <code className="rounded border border-border bg-background px-2 py-1 font-mono text-sm text-foreground">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
};

/**
 * Connect-domain dialog: form, DNS how-to, and record table.
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   domainStatus: 'none'|'pending'|'verified',
 *   domainInput: string,
 *   onDomainInputChange: (value: string) => void,
 *   customDomain: string,
 *   cnameTarget: string,
 *   dnsRecord: ReturnType<typeof buildDnsRecord>,
 *   onSave: (event: import('react').FormEvent) => void,
 *   onDisconnect: () => void,
 *   onCopyAllRecord: () => void,
 *   savePending?: boolean,
 *   disconnectPending?: boolean,
 * }} props
 */
const ConnectDomainDialog = ({
  open,
  onOpenChange,
  domainStatus,
  domainInput,
  onDomainInputChange,
  customDomain,
  cnameTarget,
  dnsRecord,
  onSave,
  onDisconnect,
  onCopyAllRecord,
  savePending = false,
  disconnectPending = false,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className="sm:max-w-xl"
      style={{ '--modal-w': '36rem', '--modal-min-h': 'auto', '--modal-max-h': '90vh' }}
      onInteractOutside={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-700" aria-hidden />
          {getDomainActionLabel(domainStatus)}
        </DialogTitle>
        <DialogDescription>
          {isDomainConfigured(domainStatus)
            ? 'Update DNS, change the domain, or disconnect it. Status: '
            : 'Point a domain you own at your storefront. Status: '}
          <span className="inline-flex align-middle">
            <DomainStatusBadge status={domainStatus} />
          </span>
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <form id="connect-domain-form" onSubmit={onSave} className="space-y-5">
          <OnlineStoreHelpBanner compact />

          <div className="space-y-2">
            <Label htmlFor="custom-domain">Your domain (optional)</Label>
            <Input
              id="custom-domain"
              placeholder="shop.yourbusiness.com"
              value={domainInput}
              onChange={(event) => onDomainInputChange(event.target.value)}
              disabled={savePending}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">How to connect it</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>
                Save your domain above (e.g.{' '}
                <span className="font-mono text-foreground">www.yourbusiness.com</span>).
              </li>
              <li>Go to your domain provider&apos;s DNS settings (Namecheap, GoDaddy, Cloudflare, etc.).</li>
              <li>
                Add {dnsRecord?.records?.length > 1 ? 'both records' : 'the record'} from the table below, then wait for DNS to propagate.
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              {dnsRecord?.autoConnect
                ? 'Once the records are in place we connect your domain and set up HTTPS by ourselves, usually within an hour. The status turns to "Connected" on its own.'
                : 'Note: our team confirms new domains before flipping them to "Connected". HTTPS is provisioned once verified.'}
            </p>
          </div>

          {dnsRecord ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {domainStatus === 'pending' ? 'DNS records to add' : 'DNS records'}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Paste these values at your registrar for{' '}
                    <span className="font-mono text-foreground">{dnsRecord.fqdn}</span>.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={onCopyAllRecord}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy all
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Host / Name</TableHead>
                      <TableHead>Value / Target / Points to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dnsRecord.records.map((record) => (
                      <TableRow key={`${record.type}-${record.host}-${record.value}`}>
                        <TableCell>
                          <DnsCopyField label="Type" value={record.type} />
                        </TableCell>
                        <TableCell>
                          <DnsCopyField label="Host" value={record.host} />
                        </TableCell>
                        <TableCell>
                          <DnsCopyField label="Value" value={record.value} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <HostingProgress status={domainStatus} hosting={dnsRecord.hosting} />

              <p className="text-xs text-muted-foreground">
                &quot;@&quot; means the domain itself. Some providers label Host as &quot;Name&quot; or
                &quot;Hostname&quot;, and Value as &quot;Points to&quot;, &quot;Target&quot;, or
                &quot;Content&quot;. Replace any other A or CNAME record on the same host. TTL can stay
                at the default (or 300 / Automatic).
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Save a domain above to generate the exact DNS records (Type, Host, Value) to add at
              your provider. Target will be{' '}
              <span className="font-mono text-foreground">{cnameTarget}</span>.
            </div>
          )}

          {customDomain ? (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {domainStatus === 'verified' ? 'Connected domain' : 'Saved domain'}:{' '}
                <span className="font-medium text-foreground">{customDomain}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                disabled={disconnectPending}
              >
                {disconnectPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disconnect
              </Button>
            </div>
          ) : null}
        </form>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button
          type="submit"
          form="connect-domain-form"
          disabled={savePending || domainInput.trim() === (customDomain || '')}
          className="bg-[#166534] text-white hover:bg-[#14532d]"
        >
          {savePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save domain
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConnectDomainDialog;
