import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  FileText,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Tag as TagIcon,
  UserPlus,
  Users,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';

const CARD_BORDER = { border: '1px solid #e5e7eb' };
const DEFAULT_CAMPAIGN_PAGE_SIZE = 10;

const DEFAULT_FORM = {
  name: '',
  goal: 'Promotion',
  audienceType: 'customer',
  activeOnly: true,
  marketingConsentOnly: false,
  lastPurchaseWindowDays: '',
  owingOnly: false,
  inactiveDays: '',
  hasEmail: false,
  hasPhone: false,
  status: '',
  source: '',
  priority: '',
  channels: [],
  subject: '',
  emailBody: '',
  smsBody: '',
  whatsappTemplateName: '',
  whatsappLanguage: 'en',
  whatsappParamsText: '',
  whatsappPrependCustomerName: false,
  customerIds: undefined,
  leadIds: undefined,
  scheduledAt: '',
  tags: [],
};

const LEAD_STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'lost', 'converted'];
const LEAD_PRIORITY_OPTIONS = ['low', 'medium', 'high'];
const GOAL_OPTIONS = ['Promotion', 'Announcement', 'Win-back', 'Re-engagement', 'Product launch', 'Other'];

const AUDIENCE_TYPES = [
  { value: 'customer', label: 'Customers', description: 'Your existing customers', Icon: Users },
  { value: 'lead', label: 'Leads', description: 'People who are not yet customers', Icon: UserPlus },
];

const CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp', description: 'Send via WhatsApp', Icon: WhatsAppIcon, iconClass: 'bg-[#25D366]/15 text-[#25D366]' },
  { value: 'sms', label: 'SMS', description: 'Send text messages', Icon: MessageSquare, iconClass: 'bg-muted text-muted-foreground' },
  { value: 'email', label: 'Email', description: 'Send via email', Icon: Mail, iconClass: 'bg-muted text-muted-foreground' },
];

/** Local datetime-local default value: one hour from now, seconds stripped. */
function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const STEPS = [
  { title: 'Campaign details', subtitle: 'Basic information' },
  { title: 'Audience', subtitle: 'Choose customers' },
  { title: 'Message', subtitle: 'Write your message' },
  { title: 'Review', subtitle: 'Check and send' },
];
const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  scheduled: 'bg-amber-100 text-amber-800 border-amber-200',
  sending: 'bg-sky-100 text-sky-800 border-sky-200',
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
    leadIds: undefined,
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

  const audienceFilter = form.audienceType === 'lead'
    ? {
        activeOnly: form.activeOnly,
        hasEmail: form.hasEmail,
        hasPhone: form.hasPhone,
        status: form.status || null,
        source: form.source ? form.source.trim() : null,
        priority: form.priority || null,
        leadIds: form.leadIds,
      }
    : {
        activeOnly: form.activeOnly,
        marketingConsentOnly: form.marketingConsentOnly,
        lastPurchaseWindowDays: form.lastPurchaseWindowDays ? Number(form.lastPurchaseWindowDays) : null,
        owingOnly: form.owingOnly,
        inactiveDays: form.inactiveDays ? Number(form.inactiveDays) : null,
        hasEmail: form.hasEmail,
        hasPhone: form.hasPhone,
        customerIds: form.customerIds,
      };

  return {
    name: form.name.trim(),
    goal: form.goal.trim() || null,
    audienceType: form.audienceType,
    tags: form.tags,
    channels: form.channels,
    audienceFilter,
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
  const audienceType = campaign?.audienceType === 'lead' ? 'lead' : 'customer';
  return {
    ...DEFAULT_FORM,
    name: campaign?.name || '',
    goal: campaign?.goal || '',
    audienceType,
    tags: Array.isArray(campaign?.tags) ? campaign.tags : [],
    activeOnly: audience.activeOnly !== false,
    marketingConsentOnly: Boolean(audience.marketingConsentOnly),
    lastPurchaseWindowDays: audience.lastPurchaseWindowDays || '',
    owingOnly: Boolean(audience.owingOnly),
    inactiveDays: audience.inactiveDays || '',
    hasEmail: Boolean(audience.hasEmail),
    hasPhone: Boolean(audience.hasPhone),
    status: audience.status || '',
    source: audience.source || '',
    priority: audience.priority || '',
    customerIds: audience.customerIds,
    leadIds: audience.leadIds,
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
    if (form.channels.length === 0) return 'Select at least one channel';
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
        description="Plan, send, and track campaigns to customers or leads across email, SMS, and WhatsApp."
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
            <TableHead className="hidden sm:table-cell">Audience</TableHead>
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
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground capitalize">{campaign.audienceType === 'lead' ? 'Leads' : 'Customers'}</TableCell>
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

function TagsInput({ value = [], onChange }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2">
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length ? '' : 'Select tags'}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
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
  const [contactSearch, setContactSearch] = useState('');
  const [form, setForm] = useState(() => getDefaultForm());
  const recipientIdsField = form.audienceType === 'lead' ? 'leadIds' : 'customerIds';

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
      const nextIdsField = next.audienceType === 'lead' ? 'leadIds' : 'customerIds';
      setForm(next);
      setManualSelection(Array.isArray(next[nextIdsField]) && next[nextIdsField].length > 0);
      setSelectedIds(new Set(next[nextIdsField] || []));
    }
  }, [campaignResponse]);

  const previewParams = useMemo(() => (form.audienceType === 'lead' ? {
    audienceType: 'lead',
    activeOnly: form.activeOnly ? 'true' : 'false',
    hasEmail: form.hasEmail ? 'true' : undefined,
    hasPhone: form.hasPhone ? 'true' : undefined,
    status: form.status || undefined,
    source: form.source || undefined,
    priority: form.priority || undefined,
    channels: form.channels,
  } : {
    audienceType: 'customer',
    activeOnly: form.activeOnly ? 'true' : 'false',
    marketingConsentOnly: form.marketingConsentOnly ? 'true' : 'false',
    lastPurchaseWindowDays: form.lastPurchaseWindowDays || undefined,
    owingOnly: form.owingOnly ? 'true' : undefined,
    inactiveDays: form.inactiveDays || undefined,
    hasEmail: form.hasEmail ? 'true' : undefined,
    hasPhone: form.hasPhone ? 'true' : undefined,
    channels: form.channels,
  }), [form.audienceType, form.activeOnly, form.marketingConsentOnly, form.lastPurchaseWindowDays, form.owingOnly, form.inactiveDays, form.hasEmail, form.hasPhone, form.status, form.source, form.priority, form.channels]);

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
          [recipientIdsField]: manualSelection ? Array.from(selectedIds) : undefined,
        }),
      };
      const saved = isEdit
        ? await marketingService.updateCampaign(id, payload)
        : await marketingService.createCampaign(payload);
      return marketingService.sendCampaign(saved.data.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Sending started. Open the campaign to follow its progress.');
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
          [recipientIdsField]: manualSelection ? Array.from(selectedIds) : undefined,
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

  const selectedCount = manualSelection ? selectedIds.size : Number(preview.batchSize ?? contacts.length);
  // With a hand-picked list, count reachable messages from the picked contacts only.
  const totalEligible = manualSelection
    ? contacts.reduce((sum, contact) => (
      selectedIds.has(contact.id)
        ? sum + form.channels.filter((channel) => contact.eligibleChannels?.[channel]).length
        : sum
    ), 0)
    : form.channels.reduce((sum, channel) => sum + Number(preview.eligible?.[channel] || 0), 0);

  const searchTerm = contactSearch.trim().toLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, '');
  const visibleContacts = useMemo(() => {
    if (!searchTerm) return contacts;
    return contacts.filter((contact) => {
      const text = [contact.name, contact.company, contact.email].filter(Boolean).join(' ').toLowerCase();
      if (text.includes(searchTerm)) return true;
      // Match phone numbers however they are typed (spaces, +233 or leading 0).
      const phoneDigits = String(contact.phone || '').replace(/\D/g, '');
      return searchDigits.length >= 3 && (phoneDigits.includes(searchDigits) || phoneDigits.includes(searchDigits.replace(/^0/, '')));
    });
  }, [contacts, searchDigits, searchTerm]);

  /** Any change to individual ticks switches to a hand-picked list, starting from what is ticked now. */
  const updateSelection = useCallback((updater) => {
    setManualSelection(true);
    setSelectedIds((prev) => updater(new Set(prev)));
  }, []);

  const toggleContact = useCallback((contactId, checked) => {
    updateSelection((next) => {
      if (checked) next.add(contactId);
      else next.delete(contactId);
      return next;
    });
  }, [updateSelection]);

  const allVisibleSelected = visibleContacts.length > 0 && visibleContacts.every((contact) => selectedIds.has(contact.id));
  const toggleAllVisible = useCallback((checked) => {
    updateSelection((next) => {
      visibleContacts.forEach((contact) => {
        if (checked) next.add(contact.id);
        else next.delete(contact.id);
      });
      return next;
    });
  }, [updateSelection, visibleContacts]);

  const selectWholeAudience = useCallback(() => {
    setManualSelection(false);
    setSelectedIds(new Set(contacts.map((contact) => contact.id)));
  }, [contacts]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleNext = () => {
    if (step === 1 && manualSelection && selectedIds.size === 0) {
      showError(`Select at least one ${form.audienceType === 'lead' ? 'lead' : 'customer'}`);
      return;
    }
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
      [recipientIdsField]: manualSelection ? Array.from(selectedIds) : undefined,
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
          <div className="flex items-start overflow-x-auto pb-1">
            {STEPS.map((item, index) => (
              <div key={item.title} className="flex items-start last:flex-none">
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-2.5 rounded-md py-1 pr-2 text-left"
                  onClick={() => setStep(index)}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      index === step ? 'bg-brand text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="hidden sm:block">
                    <span className={`block text-sm font-semibold whitespace-nowrap ${index === step ? 'text-brand' : 'text-foreground'}`}>
                      {item.title}
                    </span>
                    <span className="block text-xs text-muted-foreground whitespace-nowrap">{item.subtitle}</span>
                  </span>
                </button>
                {index < STEPS.length - 1 ? <span className="mt-4 h-px w-6 shrink-0 bg-border sm:w-10" /> : null}
              </div>
            ))}
          </div>

          {step === 0 && (
        <Card style={CARD_BORDER}>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <span className="text-sm font-medium">Who are you messaging?</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {AUDIENCE_TYPES.map(({ value, label, description, Icon }) => {
                  const selected = form.audienceType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                        selected ? 'border-brand bg-brand/5' : 'border-border bg-background hover:bg-muted/40'
                      }`}
                      onClick={() => {
                        setForm((prev) => ({ ...prev, audienceType: value }));
                        setManualSelection(false);
                        setSelectedIds(new Set());
                        setContactSearch('');
                      }}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-xs text-muted-foreground">{description}</span>
                      </span>
                      <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand' : 'border-border'}`}>
                        {selected ? <span className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Campaign name</span>
                <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="June Promotion" />
                <p className="text-xs text-muted-foreground">Give your campaign a name (e.g. June Promo).</p>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Goal (optional)</span>
                <Select value={form.goal || undefined} onValueChange={(value) => setField('goal', value)}>
                  <SelectTrigger>
                    <span className="flex items-center gap-2 text-left">
                      <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <SelectValue placeholder="Select a goal" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">What is the purpose of this campaign?</p>
              </label>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <span className="block text-sm font-semibold">Choose channel(s)</span>
                <span className="block text-xs text-muted-foreground">Select where you want to send the campaign (you can choose more than one).</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {CHANNEL_OPTIONS.map(({ value, label, description, Icon, iconClass }) => {
                  const available = caps[value]?.available;
                  const checked = form.channels.includes(value);
                  return (
                    <label
                      key={value}
                      className={`relative flex items-start gap-3 rounded-lg border p-4 transition ${
                        checked ? 'border-brand bg-brand/5' : 'border-border bg-background'
                      } ${available === false ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40'}`}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1 min-w-0 pr-6">
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {available === false ? 'Configure this channel in Settings first.' : description}
                        </span>
                      </span>
                      <Checkbox
                        className="absolute right-3 top-3"
                        checked={checked}
                        disabled={available === false}
                        onCheckedChange={(value_) => {
                          setForm((prev) => ({
                            ...prev,
                            channels: value_
                              ? [...new Set([...prev.channels, value])]
                              : prev.channels.filter((c) => c !== value),
                          }));
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Schedule (optional)
                </span>
                <Select
                  value={form.scheduledAt ? 'later' : 'now'}
                  onValueChange={(value) => setField('scheduledAt', value === 'now' ? '' : (form.scheduledAt || defaultScheduleValue()))}
                >
                  <SelectTrigger>
                    <span className="flex items-center gap-2 text-left">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Send now</SelectItem>
                    <SelectItem value="later">Schedule for later</SelectItem>
                  </SelectContent>
                </Select>
                {form.scheduledAt ? (
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(event) => setField('scheduledAt', event.target.value)}
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">Choose when to send this campaign.</p>
              </label>
              <label className="space-y-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <TagIcon className="h-4 w-4 text-muted-foreground" />
                  Tags (optional)
                </span>
                <TagsInput value={form.tags} onChange={(next) => setField('tags', next)} />
                <p className="text-xs text-muted-foreground">Use tags to organize your campaigns.</p>
              </label>
            </div>
          </CardContent>
        </Card>
          )}

          {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Smart filters</CardTitle>
              <CardDescription>Start broad, then narrow with consent, contact-info, and behavior filters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.audienceType === 'lead' ? (
                <>
                  <label className="flex items-center justify-between rounded-md border border-border p-3">
                    <span className="text-sm font-medium">Active leads only</span>
                    <Checkbox checked={Boolean(form.activeOnly)} onCheckedChange={(value) => setField('activeOnly', Boolean(value))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Status (optional)</span>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.status}
                      onChange={(event) => setField('status', event.target.value)}
                    >
                      <option value="">Any status</option>
                      {LEAD_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option} className="capitalize">{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Priority (optional)</span>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={form.priority}
                      onChange={(event) => setField('priority', event.target.value)}
                    >
                      <option value="">Any priority</option>
                      {LEAD_PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option} className="capitalize">{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium">Source (optional)</span>
                    <Input value={form.source} onChange={(event) => setField('source', event.target.value)} placeholder="Website" />
                  </label>
                  {[
                    ['hasEmail', 'Has an email address'],
                    ['hasPhone', 'Has a phone number'],
                  ].map(([field, label]) => (
                    <label key={field} className="flex items-center justify-between rounded-md border border-border p-3">
                      <span className="text-sm font-medium">{label}</span>
                      <Checkbox checked={Boolean(form[field])} onCheckedChange={(value) => setField(field, Boolean(value))} />
                    </label>
                  ))}
                </>
              ) : (
                <>
                  {[
                    ['activeOnly', 'Active customers only'],
                    ['marketingConsentOnly', 'Marketing consent only'],
                    ['owingOnly', 'Customers owing money'],
                    ['hasEmail', 'Has an email address'],
                    ['hasPhone', 'Has a phone number'],
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
                </>
              )}
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Audience preview</CardTitle>
                  <CardDescription>
                    {previewLoading
                      ? 'Loading…'
                      : `${Number(preview.batchSize ?? contacts.length).toLocaleString()} ${form.audienceType === 'lead' ? 'leads' : 'customers'}, ${selectedCount.toLocaleString()} selected. Untick anyone you want to leave out.`}
                  </CardDescription>
                </div>
                {manualSelection ? (
                  <Button type="button" variant="outline" size="sm" onClick={selectWholeAudience}>
                    Select everyone
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {contacts.length > 0 ? (
                <Input
                  type="search"
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder={`Search ${form.audienceType === 'lead' ? 'leads' : 'customers'} by name, phone or email`}
                  aria-label="Search contacts"
                />
              ) : null}
              {contacts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {form.audienceType === 'lead' ? 'No leads match these filters.' : 'No customers match these filters.'}
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={(value) => toggleAllVisible(Boolean(value))}
                            aria-label={searchTerm ? 'Select all matching contacts' : 'Select all contacts'}
                            disabled={visibleContacts.length === 0}
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Consent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleContacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                            No contacts match “{contactSearch.trim()}”.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {visibleContacts.map((contact) => (
                        <TableRow
                          key={contact.id}
                          className="cursor-pointer"
                          onClick={() => toggleContact(contact.id, !selectedIds.has(contact.id))}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              onCheckedChange={(value) => toggleContact(contact.id, Boolean(value))}
                              aria-label={`Include ${contact.name || contact.company || 'contact'}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{contact.name || contact.company || (form.audienceType === 'lead' ? 'Lead' : 'Customer')}</div>
                            <div className="text-xs text-muted-foreground">{contact.email || contact.phone || 'No contact info'}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            {form.audienceType === 'lead'
                              ? (contact.consent?.marketing === true ? 'Contactable' : 'Do not contact')
                              : `Marketing ${contact.consent?.marketing === true ? 'yes' : 'missing'}`}
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
                <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Campaign limit</p><p className="text-xl font-semibold">{Number(preview.maxRecipients || 0).toLocaleString()}</p></div>
              </div>
              <Alert className="border-amber-200 bg-amber-50/80">
                <AlertCircle className="h-4 w-4 text-amber-800" />
                <AlertTitle className="text-amber-900">{form.audienceType === 'lead' ? 'Contact warnings' : 'Consent warnings'}</AlertTitle>
                <AlertDescription className="text-sm text-amber-950/90">
                  {form.audienceType === 'lead'
                    ? <>{preview.consentWarnings?.marketingConsentRequired || 0} leads are marked do-not-contact and will be skipped.</>
                    : <>{preview.consentWarnings?.marketingConsentRequired || 0} contacts need marketing consent. SMS opt-outs: {preview.consentWarnings?.smsOptedOut || 0}. WhatsApp opt-outs: {preview.consentWarnings?.whatsappOptedOut || 0}.</>}
                </AlertDescription>
              </Alert>
              {preview.truncated ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Audience too large</AlertTitle>
                  <AlertDescription>
                    This audience has {Number(preview.totalInWorkspace || 0).toLocaleString()} contacts. A campaign can reach at most {Number(preview.maxRecipients || 0).toLocaleString()}. Narrow your filters before sending.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader>
              <CardTitle className="text-base">Ready to send</CardTitle>
              <CardDescription>
                {form.scheduledAt
                  ? `Scheduled for ${formatDate(form.scheduledAt)}. Change this in Campaign details.`
                  : 'Sends immediately. Set a schedule in Campaign details to send later.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Save draft
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" className="bg-brand hover:bg-brand-dark" onClick={handleNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
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
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>{isEdit ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
              <DialogDescription id="create-campaign-dialog-description">
                Send promotions, updates or announcements to your customers.
              </DialogDescription>
            </div>
          </div>
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

const EDITABLE_CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'failed']);
const RECIPIENT_STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  processing: 'bg-sky-100 text-sky-800 border-sky-200',
  sent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};
const RECIPIENT_PAGE_SIZE = 25;

/** Per-recipient send log: who got the message on which channel, and why any failed. */
function CampaignRecipientsCard({ campaignId, isSending }) {
  const { activeTenantId } = useAuth();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['marketing', 'campaign-recipients', activeTenantId, campaignId, status, page],
    queryFn: () => marketingService.getCampaignRecipients(campaignId, {
      status: status === 'all' ? undefined : status,
      page,
      limit: RECIPIENT_PAGE_SIZE,
    }),
    enabled: !!activeTenantId && !!campaignId,
    refetchInterval: isSending ? 4000 : false,
  });
  const result = data?.data || {};
  const recipients = result.recipients || [];
  const totalPages = result.totalPages || 1;

  return (
    <Card style={CARD_BORDER}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Recipients</CardTitle>
          <CardDescription>Every message in this campaign and what happened to it.</CardDescription>
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All messages</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Waiting to send</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading recipients…</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {status === 'all' ? 'No messages have been queued for this campaign yet.' : 'No messages with this status.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell>
                    <div className="font-medium">{recipient.recipientName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{recipient.address}</div>
                  </TableCell>
                  <TableCell className="capitalize">{recipient.channel}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={RECIPIENT_STATUS_STYLES[recipient.status] || RECIPIENT_STATUS_STYLES.pending}>
                      {recipient.status === 'pending' || recipient.status === 'processing' ? 'waiting' : recipient.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-xs text-xs text-muted-foreground md:table-cell">
                    {recipient.status === 'failed'
                      ? recipient.error
                      : recipient.sentAt ? `Sent ${formatDate(recipient.sentAt)}` : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
    // Follow progress while the background worker is sending.
    refetchInterval: (query) => (query.state.data?.data?.status === 'sending' ? 3000 : false),
  });
  const campaign = data?.data;

  const sendMutation = useMutation({
    mutationFn: () => marketingService.sendCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      showSuccess('Sending started');
    },
    onError: (err) => handleApiError(err, { context: 'Send campaign' }),
  });

  const retryMutation = useMutation({
    mutationFn: () => marketingService.retryFailedRecipients(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['marketing'] });
      const count = response?.data?.requeued || 0;
      showSuccess(`Retrying ${count} failed message${count === 1 ? '' : 's'}`);
    },
    onError: (err) => handleApiError(err, { context: 'Retry failed messages' }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  if (!campaign) return <p className="text-sm text-muted-foreground">Campaign not found.</p>;

  const snapshot = campaign.audienceSnapshot || {};
  const stats = campaign.stats || {};
  const isSending = campaign.status === 'sending';
  const hasQueued = Number(stats.totalQueued || 0) > 0;
  const canEdit = EDITABLE_CAMPAIGN_STATUSES.has(campaign.status) && !hasQueued;
  const canRetry = !isSending && Number(stats.totalFailed || 0) > 0;
  const lastError = campaign.metadata?.lastError;

  return (
    <>
      <div className="w-full space-y-4 md:space-y-6">
        <PageHeader
          title={campaign.name}
          description={campaign.goal || 'Campaign details and delivery history.'}
          actions={
            <>
              <Button asChild variant="outline"><Link to="/marketing/campaigns"><ArrowLeft className="mr-2 h-4 w-4" />Campaigns</Link></Button>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
                  Edit draft
                </Button>
              ) : null}
              {canRetry ? (
                <Button type="button" variant="outline" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                  {retryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Retry failed
                </Button>
              ) : null}
              {canEdit ? (
                <Button className="bg-brand hover:bg-brand-dark" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                  {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send now
                </Button>
              ) : null}
            </>
          }
        />

        {lastError && !isSending ? (
          <Alert className="border-red-200 bg-red-50/80">
            <AlertCircle className="h-4 w-4 text-red-800" />
            <AlertTitle className="text-red-900">{hasQueued ? 'Some messages could not be sent' : 'This campaign could not be sent'}</AlertTitle>
            <AlertDescription className="text-sm text-red-950/90">{lastError}</AlertDescription>
          </Alert>
        ) : null}

        {isSending ? (
          <Card style={CARD_BORDER}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending in the background. You can leave this page.
                </span>
                <span className="text-muted-foreground">
                  {Number((stats.totalSent || 0) + (stats.totalFailed || 0)).toLocaleString()} of {Number(stats.totalQueued || 0).toLocaleString()}
                </span>
              </div>
              <Progress value={Number(stats.progress || 0)} className="h-2.5" />
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Status</p><div className="mt-2"><StatusBadge status={campaign.status} /></div></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Messages</p><p className="mt-2 text-2xl font-semibold">{Number(stats.totalQueued || snapshot.batchSize || 0).toLocaleString()}</p></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sent</p><p className="mt-2 text-2xl font-semibold">{Number(stats.totalSent || 0).toLocaleString()}</p></CardContent></Card>
          <Card style={CARD_BORDER}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Failed</p><p className="mt-2 text-2xl font-semibold">{Number(stats.totalFailed || 0).toLocaleString()}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card style={CARD_BORDER}>
            <CardHeader><CardTitle className="text-base">Campaign summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Audience:</span> <span className="capitalize">{campaign.audienceType === 'lead' ? 'Leads' : 'Customers'}</span></p>
              <p><span className="text-muted-foreground">Channels:</span> <span className="capitalize">{channelsLabel(campaign.channels)}</span></p>
              <p><span className="text-muted-foreground">Created:</span> {formatDate(campaign.createdAt)}</p>
              <p><span className="text-muted-foreground">Scheduled:</span> {formatDate(campaign.scheduledAt)}</p>
              <p><span className="text-muted-foreground">Sending started:</span> {formatDate(campaign.sentAt)}</p>
            </CardContent>
          </Card>

          <Card style={CARD_BORDER}>
            <CardHeader><CardTitle className="text-base">Channel stats</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {['email', 'sms', 'whatsapp'].map((channel) => (
                <div key={channel} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="capitalize">{channel}</span>
                  <span className="text-muted-foreground">
                    sent {stats[channel]?.sent || 0}
                    {stats[channel]?.pending ? `, waiting ${stats[channel].pending}` : ''}
                    , failed {stats[channel]?.failed || 0}, skipped {stats[channel]?.skipped || 0}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Skipped contacts had no valid address, no marketing consent, or shared an address with another contact.
              </p>
            </CardContent>
          </Card>
        </div>

        {hasQueued ? <CampaignRecipientsCard campaignId={campaign.id} isSending={isSending} /> : null}
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
