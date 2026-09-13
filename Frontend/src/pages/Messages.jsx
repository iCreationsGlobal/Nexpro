import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Coins,
  History,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Users,
  FileText,
  Megaphone,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import messagesService from '../services/messagesService';
import { handleApiError, showError, showSuccess } from '../utils/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CARD_BORDER = { border: '1px solid #e5e7eb' };

const TABS = [
  { id: 'compose', label: 'Compose', path: '/messages/compose', icon: Send },
  { id: 'templates', label: 'Templates', path: '/messages/templates', icon: FileText },
  { id: 'groups', label: 'Groups', path: '/messages/groups', icon: Users },
  { id: 'campaigns', label: 'Campaigns', path: '/marketing', icon: Megaphone },
  { id: 'scheduled', label: 'Scheduled', path: '/marketing/campaigns?status=scheduled', icon: CalendarClock },
  { id: 'credits', label: 'Credits', path: '/messages/credits', icon: Coins },
  { id: 'history', label: 'History', path: '/messages/history', icon: History },
];

function tabFromPath(pathname) {
  if (pathname.includes('/templates')) return 'templates';
  if (pathname.includes('/groups')) return 'groups';
  if (pathname.includes('/credits')) return 'credits';
  if (pathname.includes('/history')) return 'history';
  return 'compose';
}

function PageHeader({ title, description }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-8 w-8 shrink-0" style={{ color: 'var(--color-primary)' }} aria-hidden />
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-muted-foreground mt-2 text-sm md:text-base max-w-3xl">{description}</p>
    </div>
  );
}

function MessagesNav({ active }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        const className = isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-foreground border border-border';
        if (tab.id === 'campaigns' || tab.id === 'scheduled') {
          return (
            <Button key={tab.id} asChild variant={isActive ? 'default' : 'outline'} size="sm" className={className}>
              <Link to={tab.path}>
                <Icon className="h-4 w-4 mr-1.5" />
                {tab.label}
              </Link>
            </Button>
          );
        }
        return (
          <Button key={tab.id} asChild variant={isActive ? 'default' : 'outline'} size="sm">
            <Link to={tab.path}>
              <Icon className="h-4 w-4 mr-1.5" />
              {tab.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function CreditsBanner({ summary, senderId }) {
  if (!summary) return null;
  const free = summary.freeQuota || {};
  return (
    <Alert>
      <Coins className="h-4 w-4" />
      <AlertTitle>ABS Credits</AlertTitle>
      <AlertDescription>
        <span className="font-medium">{summary.balance ?? 0}</span> paid credits
        {free.monthlyLimitEnabled !== false ? (
          <>
            {' · '}
            Free this month: {free.remaining ?? 0}/{free.monthlyLimit ?? 0}
          </>
        ) : null}
        {senderId ? <> · Sender ID: <span className="font-medium">{senderId}</span></> : null}
        {' · '}
        <Link to="/messages/credits" className="underline underline-offset-2">
          Buy credits
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function ComposePanel() {
  const queryClient = useQueryClient();
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('Hi {{name}}, ');
  const [groupId, setGroupId] = useState('');
  const [preview, setPreview] = useState(null);

  const { data: overviewResponse } = useQuery({
    queryKey: ['messages', 'overview'],
    queryFn: () => messagesService.getOverview(),
  });
  const { data: groupsResponse } = useQuery({
    queryKey: ['messages', 'groups'],
    queryFn: () => messagesService.listGroups(),
  });

  const overview = overviewResponse?.data;
  const groups = groupsResponse?.data?.groups || [];

  const birthdayMutation = useMutation({
    mutationFn: () => messagesService.setupBirthdayMessaging(),
    onSuccess: (response) => {
      showSuccess(response?.message || 'Birthday SMS enabled');
    },
    onError: (error) => handleApiError(error, 'Could not enable birthday SMS'),
  });

  const dryRunMutation = useMutation({
    mutationFn: () =>
      messagesService.composeSms({
        recipients,
        groupId: groupId || undefined,
        message,
        dryRun: true,
      }),
    onSuccess: (response) => {
      setPreview(response?.data || null);
    },
    onError: (error) => handleApiError(error, 'Could not preview message'),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      messagesService.composeSms({
        recipients,
        groupId: groupId || undefined,
        message,
        dryRun: false,
      }),
    onSuccess: (response) => {
      showSuccess(response?.message || 'Messages sent');
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
    onError: (error) => handleApiError(error, 'Could not send SMS'),
  });

  const charCount = message.length;

  return (
    <div className="space-y-4">
      <CreditsBanner summary={overview?.credits} senderId={overview?.senderId} />
      <Alert>
        <Megaphone className="h-4 w-4" />
        <AlertTitle>Birthday messages</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            One-click setup creates an automation that texts customers on their birthday using {'{{name}}'}.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={birthdayMutation.isPending}
            onClick={() => birthdayMutation.mutate()}
          >
            {birthdayMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enable birthday SMS
          </Button>
        </AlertDescription>
      </Alert>
      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Compose SMS</CardTitle>
          <CardDescription>
            Paste numbers or pick a group. Use {'{{name}}'} and {'{{businessName}}'} to personalize each recipient.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Recipients</label>
            <Textarea
              rows={3}
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="0241234567, 0201234567 or one number per line"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Group (optional)</label>
            <Select value={groupId || '__none__'} onValueChange={(value) => setGroupId(value === '__none__' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No group</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name} ({group.memberCount || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Message</label>
              <span className="text-xs text-muted-foreground">{charCount} characters</span>
            </div>
            <Textarea
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Hi {{name}}, thanks for shopping with {{businessName}}!"
            />
          </div>
          {preview ? (
            <Alert>
              <AlertTitle>Preview</AlertTitle>
              <AlertDescription className="space-y-1">
                <div>{preview.recipientCount} recipients · ~{preview.estimatedCredits} credits</div>
                <div className="rounded border border-border bg-muted/40 p-2 text-sm">{preview.sampleBody}</div>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={dryRunMutation.isPending || !message.trim()}
              onClick={() => dryRunMutation.mutate()}
            >
              {dryRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Preview
            </Button>
            <Button
              type="button"
              disabled={sendMutation.isPending || !message.trim()}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplatesPanel() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'templates'],
    queryFn: () => messagesService.listTemplates(),
  });
  const templates = data?.data?.templates || [];

  const createMutation = useMutation({
    mutationFn: () => messagesService.createTemplate({ title, content }),
    onSuccess: () => {
      showSuccess('Template saved');
      setTitle('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['messages', 'templates'] });
    },
    onError: (error) => handleApiError(error, 'Could not save template'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => messagesService.deleteTemplate(id),
    onSuccess: () => {
      showSuccess('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['messages', 'templates'] });
    },
    onError: (error) => handleApiError(error, 'Could not delete template'),
  });

  return (
    <div className="space-y-4">
      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Create template</CardTitle>
          <CardDescription>Reusable marketing SMS bodies with {'{{name}}'} placeholders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
          <Textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Hi {{name}}, ..." />
          <div className="flex justify-end">
            <Button
              disabled={!title.trim() || !content.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Save template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Saved templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No message templates found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.title}</TableCell>
                    <TableCell className="max-w-md truncate">{template.content}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GroupsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phones, setPhones] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'groups'],
    queryFn: () => messagesService.listGroups(),
  });
  const groups = data?.data?.groups || [];

  const createMutation = useMutation({
    mutationFn: () => messagesService.createGroup({ name }),
    onSuccess: (response) => {
      showSuccess('Group created');
      setName('');
      setSelectedGroupId(response?.data?.id || '');
      queryClient.invalidateQueries({ queryKey: ['messages', 'groups'] });
    },
    onError: (error) => handleApiError(error, 'Could not create group'),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      const members = phones
        .split(/[\s,;]+/)
        .map((phone) => phone.trim())
        .filter(Boolean)
        .map((phone) => ({ phone }));
      return messagesService.addGroupMembers(selectedGroupId, { members });
    },
    onSuccess: (response) => {
      showSuccess(response?.message || 'Members imported');
      setPhones('');
      queryClient.invalidateQueries({ queryKey: ['messages', 'groups'] });
    },
    onError: (error) => handleApiError(error, 'Could not import members'),
  });

  return (
    <div className="space-y-4">
      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Create group</CardTitle>
          <CardDescription>Named lists for compose and campaigns.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="VIP customers" />
          <Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create
          </Button>
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Import phone numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedGroupId || undefined} onValueChange={setSelectedGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name} ({group.memberCount || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            rows={4}
            value={phones}
            onChange={(event) => setPhones(event.target.value)}
            placeholder="One phone per line or comma-separated"
          />
          <div className="flex justify-end">
            <Button
              disabled={!selectedGroupId || !phones.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Your groups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No groups yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>{group.name}</TableCell>
                    <TableCell>{group.memberCount || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreditsPanel() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [senderId, setSenderId] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['credits', 'summary'],
    queryFn: () => messagesService.getCredits(),
  });
  const { data: overviewResponse } = useQuery({
    queryKey: ['messages', 'overview'],
    queryFn: () => messagesService.getOverview(),
  });
  const summary = data?.data;
  const packs = summary?.packs || [];

  useEffect(() => {
    if (overviewResponse?.data?.senderId) {
      setSenderId(overviewResponse.data.senderId);
    }
  }, [overviewResponse?.data?.senderId]);

  const senderMutation = useMutation({
    mutationFn: () => messagesService.updateSenderId(senderId),
    onSuccess: (response) => {
      showSuccess(response?.message || 'Sender ID saved');
      queryClient.invalidateQueries({ queryKey: ['messages', 'overview'] });
    },
    onError: (error) => handleApiError(error, 'Could not save Sender ID'),
  });

  const verifyReference = searchParams.get('reference') || searchParams.get('trxref');

  useEffect(() => {
    if (!verifyReference) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await messagesService.verifyCreditPurchase(verifyReference);
        if (cancelled) return;
        showSuccess(response?.message || 'Credits added');
        queryClient.invalidateQueries({ queryKey: ['credits'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      } catch (error) {
        if (!cancelled) handleApiError(error, 'Could not verify payment');
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete('reference');
          next.delete('trxref');
          next.delete('paystack');
          setSearchParams(next, { replace: true });
          refetch();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [verifyReference, queryClient, refetch, searchParams, setSearchParams]);

  const buyMutation = useMutation({
    mutationFn: (packId) => messagesService.initializeCreditPurchase({ packId, paymentMethod }),
    onSuccess: (response) => {
      const url = response?.data?.authorization_url;
      if (url) {
        window.location.href = url;
        return;
      }
      showError('Payment could not be started');
    },
    onError: (error) => handleApiError(error, 'Could not start checkout'),
  });

  const formatGhs = useCallback((pesewas) => {
    const cedis = (Number(pesewas) || 0) / 100;
    return `GHS ${cedis.toFixed(2)}`;
  }, []);

  return (
    <div className="space-y-4">
      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Your balance</CardTitle>
          <CardDescription>Paid ABS Credits are used after your free monthly platform SMS grant.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div className="flex flex-wrap gap-4">
              <div className="rounded border border-border px-4 py-3">
                <div className="text-xs text-muted-foreground">Paid credits</div>
                <div className="text-2xl font-semibold">{summary?.balance ?? 0}</div>
              </div>
              <div className="rounded border border-border px-4 py-3">
                <div className="text-xs text-muted-foreground">Free remaining</div>
                <div className="text-2xl font-semibold">
                  {summary?.freeQuota?.remaining ?? 0}
                  <span className="text-sm text-muted-foreground font-normal">
                    /{summary?.freeQuota?.monthlyLimit ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Sender ID</CardTitle>
          <CardDescription>
            Brand name shown on SMS (max 11 characters). Networks in Ghana must approve this ID with the SMS provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 max-w-md">
          <Input
            value={senderId}
            maxLength={11}
            onChange={(event) => setSenderId(event.target.value)}
            placeholder="YourBrand"
          />
          <Button
            type="button"
            disabled={!senderId.trim() || senderMutation.isPending}
            onClick={() => senderMutation.mutate()}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Buy ABS Credits</CardTitle>
          <CardDescription>Pay with MoMo or card via Paystack. Credits never expire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <label className="text-sm font-medium">Payment method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">Mobile money</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {packs.map((pack) => (
              <div key={pack.id} className="rounded border border-border p-4 space-y-2">
                <div className="font-semibold">{pack.label}</div>
                <div className="text-sm text-muted-foreground">{pack.description}</div>
                <div className="text-lg font-medium">{formatGhs(pack.amountPesewas)}</div>
                <Button
                  className="w-full"
                  disabled={buyMutation.isPending}
                  onClick={() => buyMutation.mutate(pack.id)}
                >
                  Buy
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card style={CARD_BORDER}>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(summary?.ledger || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit activity yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.ledger || []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.delta > 0 ? `+${row.delta}` : row.delta}</TableCell>
                    <TableCell>{row.balanceAfter}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'history', page],
    queryFn: () => messagesService.getHistory({ page, limit: 25 }),
  });
  const events = data?.data?.events || [];
  const pagination = data?.data?.pagination;

  return (
    <Card style={CARD_BORDER}>
      <CardHeader>
        <CardTitle>SMS history</CardTitle>
        <CardDescription>Delivery outcomes from compose, campaigns, and automations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No SMS history yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{event.status}</Badge>
                  </TableCell>
                  <TableCell>{event.source || '—'}</TableCell>
                  <TableCell>{event.recipientMasked || '—'}</TableCell>
                  <TableCell className="max-w-xs truncate">{event.subjectOrContext || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pagination && pagination.totalPages > 1 ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
        {events.length > 0 ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const header = 'When,Status,Source,Recipient,Preview,Error\n';
                const rows = events.map((event) => ([
                  event.createdAt || '',
                  event.status || '',
                  event.source || '',
                  event.recipientMasked || '',
                  String(event.subjectOrContext || '').replace(/"/g, '""'),
                  String(event.errorMessage || '').replace(/"/g, '""'),
                ].map((cell) => `"${cell}"`).join(','))).join('\n');
                const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `sms-history-page-${page}.csv`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download CSV
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Messages() {
  const location = useLocation();
  const { hasFeature } = useAuth();
  const active = useMemo(() => tabFromPath(location.pathname), [location.pathname]);

  if (!hasFeature('marketing')) {
    return <Navigate to="/dashboard" replace />;
  }

  if (location.pathname === '/messages' || location.pathname === '/messages/') {
    return <Navigate to="/messages/compose" replace />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Messages"
        description="Compose SMS, manage templates and groups, buy ABS Credits, and track delivery — without leaving ABS."
      />
      <MessagesNav active={active} />
      {active === 'compose' ? <ComposePanel /> : null}
      {active === 'templates' ? <TemplatesPanel /> : null}
      {active === 'groups' ? <GroupsPanel /> : null}
      {active === 'credits' ? <CreditsPanel /> : null}
      {active === 'history' ? <HistoryPanel /> : null}
    </div>
  );
}
