import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  Info,
  Loader2,
  QrCode,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import evatService from '../../services/evatService';
import { showError, showSuccess } from '../../utils/toast';

const GRA_EVAT_GUIDE = 'https://gra.gov.gh/e-services/e-vat/';

const SETUP_STEPS = [
  { id: 'connect', label: 'Connect', hint: 'Enter your API details' },
  { id: 'test', label: 'Test stamp', hint: 'Run a test to verify' },
  { id: 'uat', label: 'Joint UAT', hint: 'Complete with GRA' },
  { id: 'live', label: 'Go live', hint: 'Switch to live mode' },
];

const FEATURE_TILES = [
  {
    icon: Stamp,
    title: 'Automatic stamping',
    description: 'ABS sends your invoices to GRA and receives an IRN and QR.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & compliant',
    description: 'Your data is encrypted and shared securely with GRA.',
  },
  {
    icon: BarChart3,
    title: 'Real-time status',
    description: 'Track stamped invoices and errors in real time.',
  },
  {
    icon: Clock,
    title: 'Offline support',
    description: 'Invoices are queued and sent automatically when online.',
  },
];

/**
 * Derive progress stepper index from e-VAT status.
 * @param {object|null} status
 * @returns {number} 0 Connect · 1 Test stamp · 2 Joint UAT · 3 Go live
 */
function getActiveStepIndex(status) {
  if (!status?.enabled || !status?.consentAcceptedAt) return 0;
  if (!status?.lastTestStampOk) return 1;
  if (status?.mode !== 'live') return 2;
  return 3;
}

/**
 * Compliance → e-VAT: Welcome / setup page matching product mockup.
 */
export default function ComplianceEvat() {
  const testSectionRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [confirmApiKey, setConfirmApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [mode, setMode] = useState('sandbox');
  const [enabled, setEnabled] = useState(false);
  const [acceptConsent, setAcceptConsent] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showConfirmApiKey, setShowConfirmApiKey] = useState(false);
  const [pendingUnstamped, setPendingUnstamped] = useState(null);
  const [scrollToTestAfterSave, setScrollToTestAfterSave] = useState(false);

  const applyStatusToForm = useCallback((data) => {
    setEnabled(data?.enabled === true);
    setMode(data?.mode === 'live' ? 'live' : 'sandbox');
    setApiBaseUrl(data?.apiBaseUrl || '');
    setApiKey('');
    setConfirmApiKey('');
    setAcceptConsent(false);
    setShowApiKey(false);
    setShowConfirmApiKey(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await evatService.getStatus();
      const data = res?.data?.data ?? res?.data ?? res;
      setStatus(data);
      applyStatusToForm(data);
    } catch (e) {
      showError(e, 'Failed to load e-VAT status');
    } finally {
      setLoading(false);
    }
  }, [applyStatusToForm]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!status?.enabled) {
      setPendingUnstamped(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const end = now.toISOString().slice(0, 10);
        const res = await evatService.getFilingSummary(start, end);
        const data = res?.data?.data ?? res?.data ?? res;
        if (!cancelled) setPendingUnstamped(data?.unstampedCount ?? 0);
      } catch {
        if (!cancelled) setPendingUnstamped(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.enabled]);

  const checklist = status?.checklist || [];
  const doneCount = useMemo(
    () => checklist.filter((item) => item.done).length,
    [checklist]
  );

  const basicsReady = useMemo(() => {
    const byId = Object.fromEntries(checklist.map((item) => [item.id, item.done]));
    return Boolean(
      byId.vat_registered && byId.tin_set && byId.levies_configured
    );
  }, [checklist]);

  const activeStep = getActiveStepIndex(status);
  const isFullyLive = status?.enabled && status?.mode === 'live' && status?.consentAcceptedAt;
  const pageTitle = isFullyLive ? 'e-VAT' : 'Welcome to e-VAT';
  const consentAlreadyAccepted = Boolean(status?.consentAcceptedAt);
  const consentChecked = consentAlreadyAccepted || acceptConsent;

  const handleCancel = useCallback(() => {
    applyStatusToForm(status);
  }, [applyStatusToForm, status]);

  const handleTestStamp = useCallback(async () => {
    setTesting(true);
    try {
      const res = await evatService.testStamp();
      const body = res?.data ?? res;
      if (body?.success === false) {
        showError(body?.message || 'Test stamp failed');
      } else {
        showSuccess('Test stamp succeeded');
      }
      await load();
    } catch (e) {
      showError(e, 'Test stamp failed');
      await load();
    } finally {
      setTesting(false);
    }
  }, [load]);

  useEffect(() => {
    if (!scrollToTestAfterSave || activeStep !== 1) return undefined;
    const id = window.requestAnimationFrame(() => {
      testSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollToTestAfterSave(false);
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollToTestAfterSave, activeStep]);

  const handleSave = useCallback(async () => {
    const keyTrimmed = apiKey.trim();
    if (keyTrimmed) {
      if (keyTrimmed !== confirmApiKey.trim()) {
        showError('API key and confirmation do not match');
        return;
      }
    }

    if (enabled && !consentAlreadyAccepted && !acceptConsent) {
      showError('Please confirm taxpayer consent before enabling e-VAT');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        enabled,
        mode,
        apiBaseUrl: apiBaseUrl.trim(),
        ...(keyTrimmed ? { apiKey: keyTrimmed } : {}),
        ...(acceptConsent && !consentAlreadyAccepted ? { acceptConsent: true } : {}),
      };
      const res = await evatService.updateSettings(payload);
      const data = res?.data?.data ?? res?.data ?? res;
      setStatus(data);
      applyStatusToForm(data);
      showSuccess('e-VAT settings saved');

      if (getActiveStepIndex(data) === 1) {
        setScrollToTestAfterSave(true);
      }
    } catch (e) {
      showError(e, 'Failed to save e-VAT settings');
    } finally {
      setSaving(false);
    }
  }, [
    acceptConsent,
    apiBaseUrl,
    apiKey,
    applyStatusToForm,
    confirmApiKey,
    consentAlreadyAccepted,
    enabled,
    mode,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="font-bold text-2xl md:text-3xl lg:text-4xl text-foreground m-0">
                  {pageTitle}
                </h1>
                {basicsReady && (
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#166534] text-white shrink-0"
                    title="VAT basics ready"
                    aria-label="VAT basics ready"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-sm md:text-base text-muted-foreground m-0">
                Connect to GRA to stamp your receipts and invoices with an IRN and QR.
              </p>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 shrink-0 rounded-lg border border-border bg-card px-4 py-3">
          <div className="h-10 w-10 rounded-md bg-green-50 flex items-center justify-center">
            <FileCheck2 className="h-5 w-5 text-[#166534]" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-none">e-VAT</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <QrCode className="h-3 w-3" />
              IRN &amp; QR ready
            </p>
          </div>
          {status?.lastTestStampOk && (
            <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#166534] text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>

      {/* Progress stepper */}
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0">
          {SETUP_STEPS.map((step, index) => {
            const isActive = index === activeStep;
            const isComplete = index < activeStep;
            return (
              <li
                key={step.id}
                className={`relative flex items-start gap-3 lg:px-3 ${
                  isActive ? 'lg:border-b-2 lg:border-[#166534] lg:pb-3' : 'lg:pb-3'
                }`}
              >
                {index < SETUP_STEPS.length - 1 && (
                  <span
                    className="hidden lg:block absolute top-4 left-[calc(50%+1.25rem)] right-[-50%] border-t border-dashed border-border"
                    aria-hidden
                  />
                )}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium border ${
                    isActive || isComplete
                      ? 'bg-[#166534] border-[#166534] text-white'
                      : 'bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p
                    className={`text-sm font-medium ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Main two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left: Configure */}
        <div className="lg:col-span-3 rounded-lg border border-border bg-card p-4 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Configure e-VAT connection
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your GRA credentials to enable e-VAT stamping.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <Label htmlFor="evat-enabled" className="text-sm font-medium cursor-pointer">
              Enable e-VAT stamping
            </Label>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">
                {enabled ? 'On' : 'Off'}
              </span>
              <Switch
                id="evat-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="evat-mode" className="inline-flex items-center gap-1.5">
                Mode
                <Info
                  className="h-3.5 w-3.5 text-muted-foreground"
                  title="Use Sandbox until GRA joint UAT is complete"
                />
              </Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger id="evat-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evat-api-base-url">API base URL (optional)</Label>
              <Input
                id="evat-api-base-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://sandboxapi.gra.gov.gh/evat"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evat-api-key" className="inline-flex items-center gap-1.5">
                API key
                {status?.hasApiKey ? (
                  <span className="text-xs font-normal text-muted-foreground">(saved)</span>
                ) : null}
                <Info
                  className="h-3.5 w-3.5 text-muted-foreground"
                  title="Leave blank to keep the saved key"
                />
              </Label>
              <div className="relative">
                <Input
                  id="evat-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={status?.hasApiKey ? '••••••••' : 'Paste GRA API key'}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evat-confirm-api-key">Confirm API key</Label>
              <div className="relative">
                <Input
                  id="evat-confirm-api-key"
                  type={showConfirmApiKey ? 'text' : 'password'}
                  value={confirmApiKey}
                  onChange={(e) => setConfirmApiKey(e.target.value)}
                  placeholder={
                    apiKey.trim()
                      ? 'Re-enter API key'
                      : status?.hasApiKey
                        ? '••••••••'
                        : 'Confirm API key'
                  }
                  autoComplete="new-password"
                  className="pr-10"
                  disabled={!apiKey.trim() && status?.hasApiKey}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={() => setShowConfirmApiKey((v) => !v)}
                  aria-label={showConfirmApiKey ? 'Hide confirmation' : 'Show confirmation'}
                  disabled={!apiKey.trim() && status?.hasApiKey}
                >
                  {showConfirmApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[#166534]/25 bg-green-50 px-3 py-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="evat-consent"
                checked={consentChecked}
                disabled={consentAlreadyAccepted}
                onCheckedChange={(v) => setAcceptConsent(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="evat-consent"
                className="text-sm font-normal leading-snug text-foreground cursor-pointer"
              >
                I confirm this business is the taxpayer of record. Invoice data may be sent to GRA
                for e-VAT stamping.
              </Label>
            </div>
          </div>

          {/* Test stamp action when on that step */}
          {activeStep === 1 && (
            <div
              ref={testSectionRef}
              className="rounded-md border border-border bg-muted/20 px-3 py-3 space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Test stamp</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Run a sandbox stamp to verify your connection before joint UAT.
                  </p>
                </div>
                <Button
                  type="button"
                  className="bg-brand hover:bg-brand-dark text-white shrink-0"
                  onClick={handleTestStamp}
                  loading={testing}
                  disabled={!status?.enabled || !status?.consentAcceptedAt}
                >
                  Run test stamp
                </Button>
              </div>
            </div>
          )}

          {activeStep >= 2 && status?.lastTestStampOk && (
            <p className="text-xs text-muted-foreground">
              Last test stamp succeeded
              {status.lastTestStampAt
                ? ` on ${new Date(status.lastTestStampAt).toLocaleString()}`
                : ''}
              .
              {activeStep === 2 && ' Complete joint UAT with GRA, then switch Mode to Live.'}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <SecondaryButton type="button" onClick={handleCancel} disabled={saving}>
              Cancel
            </SecondaryButton>
            <Button
              type="button"
              className="bg-brand hover:bg-brand-dark text-white"
              onClick={handleSave}
              loading={saving}
            >
              Save &amp; continue
            </Button>
          </div>
        </div>

        {/* Right: Readiness checklist */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Readiness checklist</h2>
            <Badge
              variant="secondary"
              className="bg-green-50 text-[#166534] border border-[#166534]/20 hover:bg-green-50"
            >
              {doneCount} of {checklist.length || 0} completed
            </Badge>
          </div>

          {checklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checklist items available.</p>
          ) : (
            <ul className="space-y-3">
              {checklist.map((item, index) => (
                <li key={item.id} className="flex items-start gap-2.5">
                  {item.done ? (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#166534] text-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-muted-foreground bg-background">
                      {index + 1}
                    </span>
                  )}
                  <span
                    className={`text-sm leading-snug pt-0.5 ${
                      item.done ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <a
            href={GRA_EVAT_GUIDE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-[#166534]/20 bg-green-50 px-3 py-2.5 text-sm text-[#166534] hover:underline"
          >
            <span className="flex-1">Need help? View the e-VAT setup guide.</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>

          <p className="text-xs text-muted-foreground">
            Need TIN or levy setup?{' '}
            <Link to="/settings/organization" className="text-[#166534] hover:underline">
              Organization settings
            </Link>
            {pendingUnstamped != null && pendingUnstamped > 0 && status?.enabled ? (
              <>
                {' · '}
                <Link to="/compliance/vat" className="text-[#166534] hover:underline">
                  {pendingUnstamped} unstamped this month
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Feature strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {FEATURE_TILES.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-lg border border-border bg-card p-4">
            <div className="h-9 w-9 rounded-md bg-green-50 flex items-center justify-center mb-3">
              <Icon className="h-4 w-4 text-[#166534]" />
            </div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
