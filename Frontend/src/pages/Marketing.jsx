import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Megaphone,
  Plus,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import marketingService from '../services/marketingService';
import { handleApiError, showError, showSuccess } from '../utils/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const CARD_BORDER = { border: '1px solid #e5e7eb' };
const DEFAULT_CAMPAIGN_PAGE_SIZE = 10;

const DEFAULT_FORM = {
  name: '',
  goal: 'Promotion',
  activeOnly: true,
  marketingConsentOnly: false,
  lastPurchaseWindowDays: '',
  owingOnly: false,
  inactiveDays: '',
  channels: [],
  subject: '',
  emailBody: '',
  smsBody: '',
  whatsappTemplateName: '',
  whatsappLanguage: 'en',
  whatsappParamsText: '',
  whatsappPrependCustomerName: false,
  customerIds: undefined,
  scheduledAt: '',
};

const STEPS = ['Campaign details', 'Audience', 'Message', 'Review'];
const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  scheduled: 'bg-amber-100 text-amber-800 border-amber-200',
  sent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Megaphone className="h-8 w-8 shrink-0" style={{ color: 'var(--color-primary)' }} aria-hidden />
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">{title}</h1>
        </div>
        <p className="text-muted-foreground mt-2 text-sm md:text-base max-w-3xl">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function getDefaultForm() {
  return {
    ...DEFAULT_FORM,
    channels: [],
    customerIds: undefined,
  };
}

function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] || STATUS_STYLES.draft}>
      {status || 'draft'}
    </Badge>
  );
}

function channelsLabel(channels = []) {
  return Array.isArray(channels) && channels.length > 0 ? channels.join(', ') : 'No channels';
}

function formatDate(value) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}

function statValue(campaign, key) {
  const stats = campaign?.stats || {};
  if (typeof stats[key] === 'number') return stats[key];
  return 0;
}

function toCampaignPayload(form) {
  const whatsappParameters = form.whatsappParamsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    name: form.name.trim(),
    goal: form.goal.trim() || null,
    channels: form.channels,
    audienceFilter: {
      activeOnly: form.activeOnly,
      marketingConsentOnly: form.marketingConsentOnly,
      lastPurchaseWindowDays: form.lastPurchaseWindowDays ? Number(form.lastPurchaseWindowDays) : null,
      owingOnly: form.owingOnly,
      inactiveDays: form.inactiveDays ? Number(form.inactiveDays) : null,
      customerIds: form.customerIds,
    },
    messageContent: {
      subject: form.subject.trim(),
      emailBody: form.emailBody,
      smsBody: form.smsBody.trim(),
      whatsappTemplateName: form.whatsappTemplateName.trim(),
      whatsappLanguage: form.whatsappLanguage.trim() || 'en',
      whatsappParameters,
      whatsappPrependCustomerName: form.whatsappPrependCustomerName,
    },
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
  };
}

function formFromCampaign(campaign) {
  const audience = campaign?.audienceFilter || {};
  const message = campaign?.messageContent || {};
  return {
    ...DEFAULT_FORM,
    name: campaign?.name || '',
    goal: campaign?.goal || '',
    activeOnly: audience.activeOnly !== false,
    marketingConsentOnly: Boolean(audience.marketingConsentOnly),
    lastPurchaseWindowDays: audience.lastPurchaseWindowDays || '',
    owingOnly: Boolean(audience.owingOnly),
    inactiveDays: audience.inactiveDays || '',
    customerIds: audience.customerIds,
    channels: Array.isArray(campaign?.channels) ? campaign.channels : [],
    subject: message.subject || '',
    emailBody: message.emailBody || '',
    smsBody: message.smsBody || '',
    whatsappTemplateName: message.whatsappTemplateName || '',
    whatsappLanguage: message.whatsappLanguage || 'en',
    whatsappParamsText: Array.isArray(message.whatsappParameters) ? message.whatsappParameters.join('\n') : '',
    whatsappPrependCustomerName: Boolean(message.whatsappPrependCustomerName),
    scheduledAt: campaign?.scheduledAt
      ? new Date(campaign.scheduledAt).toISOString().slice(0, 16)
      : '',
  };
}

function validateStep(step, form) {
  if (step === 0) {
    if (!form.name.trim()) return 'Campaign name is required';
  }
  if (step === 2 || step === 3) {
    if (form.channels.length === 0) return 'Select at least one channel';
    if (form.channels.includes('email') && (!form.subject.trim() || !form.emailBody.trim())) {
      return 'Email subject and message are required';
    }
    if (form.channels.includes('sms') && !form.smsBody.trim()) return 'SMS message is required';
    if (form.channels.includes('whatsapp') && !form.whatsappTemplateName.trim()) {
      return 'WhatsApp template name is required';
    }
  }
  return null;
}

function MarketingOverview() {
  const { activeTenantId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaignPage, setCampaignPage] = useState(1);
  const campaignModal = searchParams.get('campaign');
  const editCampaignId = searchParams.get('id');
  const isCampaignDialogOpen = campaignModal === 'new' || (campaignModal === 'edit' && Boolean(editCampaignId));
  const campaignDialogMode = campaignModal === 'edit' && editCampaignId ? 'edit' : 'create';
  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'overview', activeTenantId],
    queryFn: () => marketingService.getOverview(),
    enabled: !!activeTenantId,
  });
  const { data: campaignResponse, isLoading: campaignsLoading } = useQuery({
    queryKey: ['marketing', 'campaigns', 'overview', activeTenantId, campaignPage],
    queryFn: () => marketingService.listCampaigns({ page: campaignPage, limit: DEFAULT_CAMPAIGN_PAGE_SIZE }),
    enabled: !!activeTenantId,
  });
  const overview = data?.data || {};
  const stats = overview.stats || {};
  const campaignData = campaignResponse?.data || {};
  const campaigns = Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [];

  const openCreateDialog = useCallback(() => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('campaign', 'new');
      next.delete('id');
      return next;
    });
  }, [setSearchParams]);

  const closeCampaignDialog = useCallback(() => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('campaign');
      next.delete('id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleCampaignComplete = useCallback(() => {
    setCampaignPage(1);
    closeCampaignDialog();
  }, [closeCampaignDialog]);

  return (
    <div className="w-full space-y-4 md:space-y-6" data-tour="marketing-main">
      <PageHeader
        title="Marketing"
        description="Plan, send, and track consent-aware customer campaigns across email, SMS, and WhatsApp."
        actions={
          <>
            <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New campaign
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          ['Total campaigns', stats.total || 0],
          ['Drafts', stats.draft || 0],
          ['Scheduled', stats.scheduled || 0],
          ['Sent', stats.sent || 0],
        ].map(([label, value]) => (
          <Card key={label} style={CARD_BORDER}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{isLoading ? '…' : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CampaignListCard
        title="All campaigns"
        description="Every saved broadcast and draft, newest first."
        campaigns={campaigns}
        pagination={campaignData}
        isLoading={campaignsLoading}
        emptyMessage="Create a draft, preview your audience, then send when ready."
        onPageChange={setCampaignPage}
      />

      <CreateCampaignDialog
        open={isCampaignDialogOpen}
        mode={campaignDialogMode}
        campaignId={campaignDialogMode === 'edit' ? editCampaignId : undefined}
        onOpenChange={(open) => {
          if (!open) closeCampaignDialog();
        }}
        onComplete={handleCampaignComplete}
      />
    </div>
  );
}

function CampaignTable({ campaigns }) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Channels</TableHead>
            <TableHead className="hidden lg:table-cell">Sent</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>
                <Link to={`/marketing/campaigns/${campaign.id}`} className="font-medium text-foreground hover:underline">
                  {campaign.name}
                </Link>
                {campaign.goal ? <div className="text-xs text-muted-foreground">{campaign.goal}</div> : null}
              </TableCell>
              <TableCell><StatusBadge status={campaign.status} /></TableCell>
              <TableCell className="hidden md:table-cell capitalize">{channelsLabel(campaign.channels)}</TableCell>
              <TableCell className="hidden lg:table-cell">{statValue(campaign, 'totalSent')}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{formatDate(campaign.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CampaignPagination({ pagination = {}, isLoading, onPageChange }) {
  const total = Number(pagination.total || 0);
  const limit = Number(pagination.limit || DEFAULT_CAMPAIGN_PAGE_SIZE);
  const totalPages = Math.max(Number(pagination.totalPages || Math.ceil(total / limit) || 1), 1);
  const currentPage = Math.min(Math.max(Number(pagination.currentPage || 1), 1), totalPages);
  const start = total > 0 ? (currentPage - 1) * limit + 1 : 0;
  const end = total > 0 ? Math.min(currentPage * limit, total) : 0;

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {start}-{end} of {total} campaigns
      </span>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isLoading || currentPage <= 1}
        >
          Previous
        </Button>
        <span className="px-2 text-xs">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isLoading || currentPage >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function CampaignListCard({
  title,
  description,
  campaigns,
  pagination,
  isLoading,
  emptyTitle = 'No campaigns yet',
  emptyMessage,
  toolbar,
  onPageChange,
}) {
  return (
    <Card style={CARD_BORDER}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {toolbar}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <p className="font-medium">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <>
            <CampaignTable campaigns={campaigns} />
            <CampaignPagination pagination={pagination} isLoading={isLoading} onPageChange={onPageChange} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignList() {
  const { activeTenantId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const campaignModal = searchParams.get('campaign');
  const editCampaignId = searchParams.get('id');
  const isCampaignDialogOpen = campaignModal === 'new' || (campaignModal === 'edit' && Boolean(editCampaignId));
  const campaignDialogMode = campaignModal === 'edit' && editCampaignId ? 'edit' : 'create';
  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'campaigns', activeTenantId, status, page],
    queryFn: () => marketingService.listCampaigns({
      ...(status ? { status } : {}),
      page,
      limit: DEFAULT_CAMPAIGN_PAGE_SIZE,
    }),
    enabled: !!activeTenantId,
  });
  const campaignData = data?.data || {};
  const campaigns = campaignData.campaigns || [];

  const handleStatusChange = useCallback((event) => {
    setStatus(event.target.value);
    setPage(1);
  }, []);

  const openCreateDialog = useCallback(() => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('campaign', 'new');
      next.delete('id');
      return next;
    });
  }, [setSearchParams]);

  const closeCampaignDialog = useCallback(() => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('campaign');
      next.delete('id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleCampaignComplete = useCallback(() => {
    setPage(1);
    closeCampaignDialog();
  }, [closeCampaignDialog]);

  return (
    <div className="w-full space-y-4 md:space-y-6">
      <PageHeader
        title="Campaigns"
        description="Browse drafts, scheduled campaigns, sent history, and failed sends."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/marketing">Overview</Link>
            </Button>
            <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New campaign
            </Button>
          </>
        }
      />

      <CampaignListCard
        title="All campaigns"
        description="Browse every campaign in this workspace."
        campaigns={campaigns}
        pagination={campaignData}
        isLoading={isLoading}
        emptyTitle="No campaigns match this view"
        emptyMessage="No campaigns match this view."
        onPageChange={setPage}
        toolbar={(
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={handleStatusChange}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        )}
      />

      <CreateCampaignDialog
        open={isCampaignDialogOpen}
        mode={campaignDialogMode}
        campaignId={campaignDialogMode === 'edit' ? editCampaignId : undefined}
        onOpenChange={(open) => {
          if (!open) closeCampaignDialog();
        }}
        onComplete={handleCampaignComplete}
      />
    </div>
  );
}

function ChannelToggle({ channel, label, available, form, setForm }) {
  const checked = form.channels.includes(channel);
  return (
    <label className="flex items-start gap-3 rounded-md border border-border p-3">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={!available}
        onCheckedChange={(value) => {
          setForm((prev) => ({
            ...prev,
            channels: value
              ? [...new Set([...prev.channels, channel])]
              : prev.channels.filter((item) => item !== channel),
          }));
        }}
      />
      <span>
        <span className="block font-medium">{label}</span>
        {!available ? <span className="text-xs text-muted-foreground">Configure this channel in Settings first.</span> : null}
      </span>
    </label>
  );
}

function CampaignWizardContent({ campaignId, mode = 'create', onCancel, onComplete }) {
  const id = campaignId;
  const isEdit = mode === 'edit' && Boolean(id);
  const { activeTenantId } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [manualSelection, setManualSelection] = useState(false);
  const [form, setForm] = useState(() => getDefaultForm());

  const { data: campaignResponse, isLoading: campaignLoading } = useQuery({
    queryKey: ['marketing', 'campaign', activeTenantId, id],
    queryFn: () => marketingService.getCampaign(id),
    enabled: !!activeTenantId && isEdit && !!id,
  });

  useEffect(() => {
    setStep(0);
    setSelectedIds(new Set());
    setManualSelection(false);
    setForm(getDefaultForm());
  }, [id, isEdit]);

  useEffect(() => {
    if (campaignResponse?.data) {
      const next = formFromCampaign(campaignResponse.data);
      setForm(next);
      setManualSelection(Array.isArray(next.customerIds) && next.customerIds.length > 0);
      setSelectedIds(new Set(next.customerIds || []));
    }
  }, [campaignResponse]);

  const previewParams = useMemo(() => ({
    activeOnly: form.activeOnly ? 'true' : 'false',
    marketingConsentOnly: form.marketingConsentOnly ? 'true' : 'false',
    lastPurchaseWindowDays: form.lastPurchaseWindowDays || undefined,
    owingOnly: form.owingOnly ? 'true' : undefined,
    inactiveDays: form.inactiveDays || undefined,
    channels: form.channels,
    customerIds: manualSelection ? Array.from(selectedIds) : undefined,
  }), [form.activeOnly, form.marketingConsentOnly, form.lastPurchaseWindowDays, form.owingOnly, form.inactiveDays, form.channels, manualSelection, selectedIds]);

  const { data: previewResponse, isLoading: previewLoading } = useQuery({
    queryKey: ['marketing', 'preview', activeTenantId, previewParams],
    queryFn: () => marketingService.getPreview(previewParams),
    enabled: !!activeTenantId,
  });

  const { data: capResponse } = useQuery({
    queryKey: ['marketing', 'capabilities', activeTenantId],
    queryFn: () => marketingService.getCapabilities(),
    enabled: !!activeTenantId,
  });

  const preview = previewResponse?.data || {};
  const contacts = Array.isArray(preview.contacts) ? preview.contacts : [];
  const caps = capResponse?.data || {};

  useEffect(() => {
    if (!manualSelection && contacts.length > 0) {
      setSelectedIds(new Set(contacts.map((contact) => contact.id)));
    }
  }, [contacts, manualSelection]);

  const saveMutation = useMutation({
    mutationFn: (payload) => isEdit ? marketingService.updateCampaign(id, payload) : marketingService.createCampaign(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Campaign draft saved');
      onComplete?.();
    },
    onError: (err) => handleApiError(err, { context: 'Save campaign' }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...toCampaignPayload({
          ...form,
          customerIds: manualSelection ? Array.from(selectedIds) : undefined,
        }),
      };
      const saved = isEdit
        ? await marketingService.updateCampaign(id, payload)
        : await marketingService.createCampaign(payload);
      return marketingService.sendCampaign(saved.data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Campaign sent');
      onComplete?.();
    },
    onError: (err) => handleApiError(err, { context: 'Send campaign' }),
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!form.scheduledAt) {
        throw new Error('Pick a date and time to schedule');
      }
      const payload = {
        ...toCampaignPayload({
          ...form,
          customerIds: manualSelection ? Array.from(selectedIds) : undefined,
        }),
      };
      const saved = isEdit
        ? await marketingService.updateCampaign(id, payload)
        : await marketingService.createCampaign(payload);
      return marketingService.scheduleCampaign(saved.data.id, {
        scheduledAt: payload.scheduledAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Campaign scheduled');
      onComplete?.();
    },
    onError: (err) => handleApiError(err, { context: 'Schedule campaign' }),
  });

  const selectedCount = manualSelection ? selectedIds.size : contacts.length;
  const totalEligible = form.channels.reduce((sum, channel) => sum + Number(preview.eligible?.[channel] || 0), 0);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleNext = () => {
    const error = validateStep(step, form);
    if (error) {
      showError(error);
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const saveDraft = () => {
    const error = validateStep(0, form);
    if (error) {
      showError(error);
      return;
    }
    saveMutation.mutate(toCampaignPayload({
      ...form,
      customerIds: manualSelection ? Array.from(selectedIds) : undefined,
    }));
  };

  const sendNow = () => {
    const error = validateStep(3, form);
    if (error) {
      showError(error);
      return;
    }
    if (selectedCount === 0) {
      showError('Select at least one recipient');
      return;
    }
    sendMutation.mutate();
  };

  if (campaignLoading) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  }

  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`rounded-md border px-3 py-2 text-left text-sm ${index === step ? 'border-brand bg-brand/10 text-brand' : 'border-border bg-background'}`}
                onClick={() => setStep(index)}
              >
                <span className="block text-xs text-muted-foreground">Step {index + 1}</span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>

          {step === 0 && (
        <Card style={CARD_BORDER}>
          <CardHeader>
            <CardTitle className="text-base">Campaign details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Campaign name</span>
              <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="June promo" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Goal (optional)</span>
              <Input value={form.goal} onChange={(event) => setField('goal', event.target.value)} placeholder="Win back inactive customers" />
            </label>
          </CardContent>
        </Card>
          )}

          {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Smart filters</CardTitle>
              <CardDescription>Start broad, then narrow with consent and behavior filters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ['activeOnly', 'Active customers only'],
                ['marketingConsentOnly', 'Marketing consent only'],
                ['owingOnly', 'Customers owing money'],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="text-sm font-medium">{label}</span>
                  <Checkbox checked={Boolean(form[field])} onCheckedChange={(value) => setField(field, Boolean(value))} />
                </label>
              ))}
              <label className="space-y-2">
                <span className="text-sm font-medium">Purchased in last N days (optional)</span>
                <Input type="number" min="1" value={form.lastPurchaseWindowDays} onChange={(event) => setField('lastPurchaseWindowDays', event.target.value)} placeholder="30" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Inactive for N days (optional)</span>
                <Input type="number" min="1" value={form.inactiveDays} onChange={(event) => setField('inactiveDays', event.target.value)} placeholder="90" />
              </label>
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Audience preview</CardTitle>
                  <CardDescription>{previewLoading ? 'Loading…' : `${contacts.length} contacts in preview, ${selectedCount} selected`}</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setManualSelection((prev) => !prev)}>
                  {manualSelection ? 'Use smart audience' : 'Select manually'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No customers match these filters.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Consent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              disabled={!manualSelection}
                              onCheckedChange={(value) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (value) next.add(contact.id);
                                  else next.delete(contact.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{contact.name || contact.company || 'Customer'}</div>
                            <div className="text-xs text-muted-foreground">{contact.email || contact.phone || 'No contact info'}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            Marketing {contact.consent?.marketing === true ? 'yes' : 'missing'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
          )}

          {step === 2 && (
        <div className="space-y-4">
          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Channels</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <ChannelToggle channel="email" label="Email" available={caps.email?.available} form={form} setForm={setForm} />
              <ChannelToggle channel="sms" label="SMS" available={caps.sms?.available} form={form} setForm={setForm} />
              <ChannelToggle channel="whatsapp" label="WhatsApp" available={caps.whatsapp?.available} form={form} setForm={setForm} />
            </CardContent>
          </Card>

          {form.channels.includes('email') && (
            <Card style={CARD_BORDER}>
              <CardHeader><CardTitle className="text-base">Email message</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input value={form.subject} onChange={(event) => setField('subject', event.target.value)} placeholder="Subject" />
                <Textarea rows={5} value={form.emailBody} onChange={(event) => setField('emailBody', event.target.value)} placeholder="Plain text email message" />
              </CardContent>
            </Card>
          )}

          {form.channels.includes('sms') && (
            <Card style={CARD_BORDER}>
              <CardHeader><CardTitle className="text-base">SMS message</CardTitle></CardHeader>
              <CardContent>
                <Textarea rows={4} maxLength={480} value={form.smsBody} onChange={(event) => setField('smsBody', event.target.value)} placeholder="Hi {{name}}, thanks for being a customer of {{businessName}}!" />
                <p className="text-xs text-muted-foreground">Use {'{{name}}'} and {'{{businessName}}'} — each recipient gets a personalized SMS.</p>
              </CardContent>
            </Card>
          )}

          {form.channels.includes('whatsapp') && (
            <Card style={CARD_BORDER}>
              <CardHeader>
                <CardTitle className="text-base">WhatsApp template</CardTitle>
                <CardDescription>Use a Meta-approved template name. Variables are one per line.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input value={form.whatsappTemplateName} onChange={(event) => setField('whatsappTemplateName', event.target.value)} placeholder="seasonal_promo" />
                  <Input value={form.whatsappLanguage} onChange={(event) => setField('whatsappLanguage', event.target.value)} placeholder="Language code (optional)" />
                </div>
                <label className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="text-sm font-medium">Prepend customer name as first variable</span>
                  <Checkbox checked={form.whatsappPrependCustomerName} onCheckedChange={(value) => setField('whatsappPrependCustomerName', Boolean(value))} />
                </label>
                <Textarea rows={3} value={form.whatsappParamsText} onChange={(event) => setField('whatsappParamsText', event.target.value)} placeholder="More variables (optional)" />
              </CardContent>
            </Card>
          )}
        </div>
          )}

          {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Review campaign</CardTitle>
              <CardDescription>Confirm audience, channels, and consent before sending.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Recipients</p><p className="text-xl font-semibold">{selectedCount}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Eligible sends</p><p className="text-xl font-semibold">{totalEligible}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Channels</p><p className="text-sm font-semibold capitalize">{channelsLabel(form.channels)}</p></div>
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Batch limit</p><p className="text-xl font-semibold">{preview.maxRecipients || 500}</p></div>
              </div>
              <Alert className="border-amber-200 bg-amber-50/80">
                <AlertCircle className="h-4 w-4 text-amber-800" />
                <AlertTitle className="text-amber-900">Consent warnings</AlertTitle>
                <AlertDescription className="text-sm text-amber-950/90">
                  {preview.consentWarnings?.marketingConsentRequired || 0} contacts need marketing consent. SMS opt-outs: {preview.consentWarnings?.smsOptedOut || 0}. WhatsApp opt-outs: {preview.consentWarnings?.whatsappOptedOut || 0}.
                </AlertDescription>
              </Alert>
              {preview.truncated ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Audience capped</AlertTitle>
                  <AlertDescription>Only the newest {preview.maxRecipients || 500} matching customers are included in this send batch.</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Ready to send</CardTitle>
              <CardDescription>Send now, or schedule for later. Scheduled campaigns dispatch automatically within about 5 minutes of the chosen time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                <label className="text-sm font-medium">Schedule for (optional)</label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt || ''}
                  onChange={(event) => setField('scheduledAt', event.target.value)}
                />
              </div>
              <p className="text-muted-foreground">Use Save draft to keep editing, Schedule if you set a time, or Send now.</p>
            </CardContent>
          </Card>
        </div>
          )}
        </div>
      </DialogBody>

      <DialogFooter className="gap-2 sm:space-x-0 sm:justify-between">
        <div>
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((prev) => Math.max(prev - 1, 0))}>
              Back
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saveMutation.isPending || sendMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={saveDraft} disabled={saveMutation.isPending || sendMutation.isPending || scheduleMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Save draft
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => scheduleMutation.mutate()}
                disabled={!form.scheduledAt || scheduleMutation.isPending || sendMutation.isPending || saveMutation.isPending}
              >
                {scheduleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Schedule
              </Button>
              <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={sendNow} disabled={sendMutation.isPending || saveMutation.isPending || scheduleMutation.isPending}>
                {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send now
              </Button>
            </>
          )}
        </div>
      </DialogFooter>
    </>
  );
}

function CreateCampaignDialog({ open, mode = 'create', campaignId, onOpenChange, onComplete }) {
  const isEdit = mode === 'edit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="[--modal-w:min(1100px,94vw)] [--modal-min-h:720px] [--modal-max-h:95dvh]"
        aria-describedby="create-campaign-dialog-description"
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit campaign' : 'Create campaign'}</DialogTitle>
          <DialogDescription id="create-campaign-dialog-description">
            Build a campaign in four steps: details, audience, message, and review.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CampaignWizardContent
            mode={mode}
            campaignId={campaignId}
            onCancel={() => onOpenChange(false)}
            onComplete={onComplete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetail() {
  const { id } = useParams();
  const { activeTenantId } = useAuth();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'campaign', activeTenantId, id],
    queryFn: () => marketingService.getCampaign(id),
    enabled: !!activeTenantId && !!id,
  });
  const campaign = data?.data;

  const sendMutation = useMutation({
    mutationFn: () => marketingService.sendCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Campaign sent');
    },
    onError: (err) => handleApiError(err, { context: 'Send campaign' }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  if (!campaign) return <p className="text-sm text-muted-foreground">Campaign not found.</p>;

  const snapshot = campaign.audienceSnapshot || {};
  const stats = campaign.stats || {};

  return (
    <>
      <div className="w-full space-y-4 md:space-y-6">
        <PageHeader
          title={campaign.name}
          description={campaign.goal || 'Campaign details and delivery history.'}
          actions={
            <>
              <Button asChild variant="outline"><Link to="/marketing/campaigns"><ArrowLeft className="mr-2 h-4 w-4" />Campaigns</Link></Button>
              {campaign.status !== 'sent' ? (
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                  Edit draft
                </Button>
              ) : null}
              {campaign.status !== 'sent' ? (
                <Button className="bg-brand hover:bg-brand-dark" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                  {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send now
                </Button>
              ) : null}
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Status</p><div className="mt-2"><StatusBadge status={campaign.status} /></div></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recipients</p><p className="mt-2 text-2xl font-semibold">{snapshot.batchSize || 0}</p></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sent</p><p className="mt-2 text-2xl font-semibold">{stats.totalSent || 0}</p></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Failed</p><p className="mt-2 text-2xl font-semibold">{stats.totalFailed || 0}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card style={CARD_BORDER}>
            <CardHeader><CardTitle className="text-base">Campaign summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Channels:</span> <span className="capitalize">{channelsLabel(campaign.channels)}</span></p>
              <p><span className="text-muted-foreground">Created:</span> {formatDate(campaign.createdAt)}</p>
              <p><span className="text-muted-foreground">Scheduled:</span> {formatDate(campaign.scheduledAt)}</p>
              <p><span className="text-muted-foreground">Sent:</span> {formatDate(campaign.sentAt)}</p>
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader><CardTitle className="text-base">Channel stats</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {['email', 'sms', 'whatsapp'].map((channel) => (
                <div key={channel} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="capitalize">{channel}</span>
                  <span className="text-muted-foreground">
                    sent {stats[channel]?.sent || 0}, skipped {stats[channel]?.skipped || 0}, failed {stats[channel]?.failed || 0}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <CreateCampaignDialog
        open={isEditDialogOpen}
        mode="edit"
        campaignId={campaign.id}
        onOpenChange={setIsEditDialogOpen}
        onComplete={() => setIsEditDialogOpen(false)}
      />
    </>
  );
}

export default function Marketing() {
  const { pathname } = useLocation();

  if (pathname.endsWith('/campaigns/new')) {
    return <Navigate to="/marketing?campaign=new" replace />;
  }
  if (pathname.endsWith('/edit')) {
    const editMatch = pathname.match(/\/marketing\/campaigns\/([^/]+)\/edit$/);
    return <Navigate to={`/marketing?campaign=edit&id=${encodeURIComponent(editMatch?.[1] || '')}`} replace />;
  }
  if (/\/marketing\/campaigns\/[^/]+$/.test(pathname)) {
    return <CampaignDetail />;
  }
  if (pathname.endsWith('/campaigns')) {
    return <CampaignList />;
  }
  return <MarketingOverview />;
}
