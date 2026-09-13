import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../../../context/AuthContext';
import partnerProgramService from '../../../services/partnerProgramService';
import { showError, showSuccess } from '../../../utils/toast';
import {
  getSabitoPartnerCategoryOptions,
  getTenantSabitoSubtype,
  resolveSabitoPartnerCategoryId,
} from '../../../constants/businessTypes';
import StatusChip from '../../StatusChip';

const listingChipStatus = (settings) => {
  const status = settings?.moderationStatus || 'draft';
  if (status === 'approved' && settings.enabled && settings.listed) return 'live';
  if (status === 'pending') return 'pending_review';
  return status;
};

/**
 * ABS settings for Sabito Partner Program: enable, rates, applications, payouts.
 */
const SettingsSabitoPartnersSection = () => {
  const { isManager, activeTenant } = useAuth();
  const canManage = isManager;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [catalog, setCatalog] = useState({ products: [], pricingTemplates: [] });
  const [selectedServiceKeys, setSelectedServiceKeys] = useState([]);
  const [applications, setApplications] = useState([]);
  const [partnerships, setPartnerships] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [cashouts, setCashouts] = useState([]);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState([]);
  const [paidNote, setPaidNote] = useState('');
  const [payoutReference, setPayoutReference] = useState('');
  const now = new Date();
  const [payoutMonth, setPayoutMonth] = useState(now.getMonth() + 1);
  const [payoutYear, setPayoutYear] = useState(now.getFullYear());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        settingsRes,
        catalogRes,
        appsRes,
        partnersRes,
        commissionsRes,
        referralsRes,
        cashoutsRes,
      ] = await Promise.all([
        partnerProgramService.getSettings(),
        partnerProgramService.getCatalog(),
        partnerProgramService.listApplications(),
        partnerProgramService.listPartnerships({ status: 'active' }),
        partnerProgramService.listCommissions({
          status: 'due',
          remittanceStatus: 'owed',
          month: payoutMonth,
          year: payoutYear,
        }),
        partnerProgramService.listReferrals(),
        partnerProgramService.listCashouts(),
      ]);
      const s = settingsRes.data?.data || settingsRes.data;
      setSettings(s);
      setCatalog(catalogRes.data?.data || { products: [], pricingTemplates: [] });
      const existingKeys = (s?.services || []).map((svc) => {
        if (svc.productId) return `product:${svc.productId}`;
        if (svc.pricingTemplateId) return `pricingTemplate:${svc.pricingTemplateId}`;
        return `label:${svc.label}`;
      });
      setSelectedServiceKeys(existingKeys);
      setApplications(appsRes.data?.data || []);
      setPartnerships(partnersRes.data?.data || []);
      setCommissions(commissionsRes.data?.data || []);
      setReferrals(referralsRes.data?.data || []);
      setCashouts(cashoutsRes.data?.data || []);
      setSelectedCommissionIds([]);
    } catch (err) {
      showError(err, 'Failed to load Sabito Partners settings');
    } finally {
      setLoading(false);
    }
  }, [payoutMonth, payoutYear]);

  useEffect(() => {
    if (canManage) loadAll();
  }, [canManage, loadAll]);

  const catalogOptions = useMemo(() => {
    const products = (catalog.products || []).map((p) => ({
      key: `product:${p.id}`,
      label: p.label,
      productId: p.id,
    }));
    const templates = (catalog.pricingTemplates || []).map((t) => ({
      key: `pricingTemplate:${t.id}`,
      label: t.label,
      pricingTemplateId: t.id,
    }));
    return [...templates, ...products];
  }, [catalog]);

  const tenantSubtype = useMemo(() => getTenantSabitoSubtype(activeTenant), [activeTenant]);
  const categoryOptions = useMemo(
    () => getSabitoPartnerCategoryOptions(activeTenant?.businessType, { subtype: tenantSubtype }),
    [activeTenant?.businessType, tenantSubtype]
  );
  const categoryValue = useMemo(
    () =>
      resolveSabitoPartnerCategoryId({
        savedCategory: settings?.category,
        subtype: tenantSubtype,
        options: categoryOptions,
      }),
    [settings?.category, tenantSubtype, categoryOptions]
  );

  const updateField = (key, value) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    if (settings.enabled && settings.listed && !categoryValue) {
      showError(new Error('Select a category before listing on Sabito'));
      return;
    }
    setSaving(true);
    try {
      const services = catalogOptions
        .filter((opt) => selectedServiceKeys.includes(opt.key))
        .map((opt) => ({
          label: opt.label,
          productId: opt.productId || null,
          pricingTemplateId: opt.pricingTemplateId || null,
        }));
      await partnerProgramService.updateSettings({
        enabled: settings.enabled,
        listed: settings.listed,
        displayName: settings.displayName,
        pitch: settings.pitch,
        category: categoryValue || settings.category || null,
        location: settings.location,
        logoUrl: settings.logoUrl,
        firstClientRatePercent: Number(settings.firstClientRatePercent),
        returningClientRatePercent: Number(settings.returningClientRatePercent),
        attributionMonths: Number(settings.attributionMonths),
        maxMarketers: Number(settings.maxMarketers),
        payoutNotes: settings.payoutNotes,
        slug: settings.slug,
        services,
      });
      showSuccess(
        settings.enabled && settings.listed
          ? 'Saved. Listing on Sabito is submitted for review unless it is already live.'
          : 'Partner program settings saved'
      );
      await loadAll();
    } catch (err) {
      showError(err, 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await partnerProgramService.approveApplication(id);
      showSuccess('Marketer approved');
      await loadAll();
    } catch (err) {
      showError(err, 'Failed to approve');
    }
  };

  const handleDecline = async (id) => {
    try {
      await partnerProgramService.declineApplication(id);
      showSuccess('Application declined');
      await loadAll();
    } catch (err) {
      showError(err, 'Failed to decline');
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedCommissionIds.length) {
      showError(null, 'Select at least one commission');
      return;
    }
    try {
      await partnerProgramService.paySabito({
        commissionIds: selectedCommissionIds,
        paidNote: paidNote || undefined,
        payoutReference: payoutReference || undefined,
      });
      showSuccess('Paid Sabito. ABS will pay marketers their share.');
      setPaidNote('');
      await loadAll();
    } catch (err) {
      showError(err, 'Failed to pay Sabito');
    }
  };

  const toggleCommission = (id, checked) => {
    setSelectedCommissionIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    );
  };

  if (!canManage) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Only workspace admins and managers can manage Sabito Partners.
        </CardContent>
      </Card>
    );
  }

  if (loading || !settings) {
    return <p className="text-sm text-muted-foreground">Loading Sabito Partners…</p>;
  }

  const pendingApps = applications.filter((a) => a.status === 'pending');
  const pendingCashouts = cashouts.filter((c) => c.status === 'pending' || c.status === 'approved');
  const dueTotal = commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <Tabs defaultValue="setup" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="setup">Setup</TabsTrigger>
        <TabsTrigger value="applications">
          Applications{pendingApps.length ? ` (${pendingApps.length})` : ''}
        </TabsTrigger>
        <TabsTrigger value="partners">Partners ({partnerships.length})</TabsTrigger>
        <TabsTrigger value="referrals">Referrals ({referrals.length})</TabsTrigger>
        <TabsTrigger value="cashouts">
          Cashouts{pendingCashouts.length ? ` (${pendingCashouts.length})` : ''}
        </TabsTrigger>
        <TabsTrigger value="payouts">Due commissions</TabsTrigger>
      </TabsList>

      <TabsContent value="setup" className="space-y-4">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Program listing</CardTitle>
            <CardDescription>
              Enable the program and submit your business for review. ABS approves listings before marketers can see them on Sabito App.
              Slots used: {settings.activePartners || 0} / {settings.maxMarketers}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>Listing status</Label>
                <p className="text-xs text-muted-foreground">
                  {settings.moderationNote ? settings.moderationNote : 'Draft until you list; Pending review until ABS approves.'}
                </p>
              </div>
              <StatusChip status={listingChipStatus(settings)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>Enable Partner Program</Label>
                <p className="text-xs text-muted-foreground">Turn on Sabito Partners for this workspace</p>
              </div>
              <Switch
                checked={!!settings.enabled}
                onCheckedChange={(v) => updateField('enabled', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>List on Sabito marketplace</Label>
                <p className="text-xs text-muted-foreground">
                  Submit for review. Unlisting does not remove an existing approval.
                </p>
              </div>
              <Switch
                checked={!!settings.listed}
                onCheckedChange={(v) => updateField('listed', v)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={settings.displayName || ''}
                  onChange={(e) => updateField('displayName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={settings.slug || ''}
                  onChange={(e) => updateField('slug', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Category
                  {settings.enabled && settings.listed ? '' : ' (optional)'}
                </Label>
                <Select
                  value={categoryValue || undefined}
                  onValueChange={(value) => updateField('category', value)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input
                  value={settings.location || ''}
                  onChange={(e) => updateField('location', e.target.value)}
                  placeholder="e.g. Accra"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pitch</Label>
              <Textarea
                value={settings.pitch || ''}
                onChange={(e) => updateField('pitch', e.target.value)}
                placeholder="Why marketers should partner with you"
                rows={3}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First-client commission %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={settings.firstClientRatePercent ?? 10}
                  onChange={(e) => updateField('firstClientRatePercent', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Returning-client commission %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={settings.returningClientRatePercent ?? 5}
                  onChange={(e) => updateField('returningClientRatePercent', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Attribution window (months)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.attributionMonths ?? 12}
                  onChange={(e) => updateField('attributionMonths', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max marketers</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.maxMarketers ?? 10}
                  onChange={(e) => updateField('maxMarketers', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Payout notes (optional)</Label>
              <Textarea
                value={settings.payoutNotes || ''}
                onChange={(e) => updateField('payoutNotes', e.target.value)}
                placeholder="Shown to marketers. You remit commissions to ABS; ABS pays marketers."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Services / products in program</Label>
              <p className="text-xs text-muted-foreground">
                Select from your ABS catalog. Commission uses the default rates above unless overridden later.
              </p>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-3 space-y-2">
                {catalogOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products or pricing templates found.</p>
                ) : (
                  catalogOptions.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedServiceKeys.includes(opt.key)}
                        onCheckedChange={(checked) => {
                          setSelectedServiceKeys((prev) =>
                            checked ? [...prev, opt.key] : prev.filter((k) => k !== opt.key)
                          );
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={loadAll} disabled={saving}>
                Reset
              </Button>
              <Button type="button" onClick={handleSaveSettings} disabled={saving}>
                {saving
                  ? 'Saving…'
                  : settings.enabled && settings.listed
                    ? 'Save / submit for review'
                    : 'Save settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="applications" className="space-y-3">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Applications</CardTitle>
            <CardDescription>Approve or decline marketers who applied via Sabito App.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            ) : (
              applications.map((app) => (
                <div
                  key={app.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{app.marketer?.name || 'Marketer'}</p>
                    <p className="text-xs text-muted-foreground">
                      {app.marketer?.email} · {app.status}
                    </p>
                    {app.pitch ? <p className="text-sm mt-1">{app.pitch}</p> : null}
                  </div>
                  {app.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => handleDecline(app.id)}>
                        Decline
                      </Button>
                      <Button type="button" size="sm" onClick={() => handleApprove(app.id)}>
                        Approve
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="partners" className="space-y-3">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Active partners</CardTitle>
            <CardDescription>
              Share each partner’s referral code when creating customers if needed — or rely on
              marketer referrals that match by customer email or phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {partnerships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active partners yet.</p>
            ) : (
              partnerships.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-sm">{p.marketer?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Code: <span className="font-mono">{p.referralCode}</span>
                    {p.marketer?.momoNumber ? ` · MoMo ${p.marketer.momoNumber}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    First {p.firstClientRatePercent}% · Returning {p.returningClientRatePercent}%
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="referrals" className="space-y-3">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Marketer referrals</CardTitle>
            <CardDescription>
              Referrals match ABS customers by email or phone. Matched customers attribute commissions when they pay.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrals yet.</p>
            ) : (
              referrals.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{r.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.marketer?.name || 'Marketer'} · {r.status}
                    {r.email ? ` · ${r.email}` : ''}
                    {r.phone ? ` · ${r.phone}` : ''}
                  </p>
                  {r.customer?.name ? (
                    <p className="text-xs text-muted-foreground mt-1">Matched customer: {r.customer.name}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cashouts" className="space-y-3">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Cashout requests</CardTitle>
            <CardDescription>
              Marketers request payout of their share after you Pay Sabito. ABS pays marketers from Control Center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cashouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cashout requests yet.</p>
            ) : (
              cashouts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {c.marketer?.name} · GHS {Number(c.amount || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.status}
                      {c.marketer?.momoNumber ? ` · MoMo ${c.marketer.momoNumber}` : ''}
                      {Array.isArray(c.commissions) ? ` · ${c.commissions.length} commission(s)` : ''}
                    </p>
                  </div>
                  <StatusChip status={c.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="payouts" className="space-y-3">
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">Due commissions</CardTitle>
            <CardDescription>
              Accrues when a referred customer pays you. Remit the full marketer commission to ABS (Pay Sabito). ABS keeps the platform take and pays marketers.
              Due this filter: GHS {dueTotal.toFixed(2)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={payoutMonth}
                  onChange={(e) => setPayoutMonth(Number(e.target.value))}
                  className="w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input
                  type="number"
                  min={2020}
                  value={payoutYear}
                  onChange={(e) => setPayoutYear(Number(e.target.value))}
                  className="w-28"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={loadAll}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {commissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No due commissions for this month.</p>
              ) : (
                commissions.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <Checkbox
                      checked={selectedCommissionIds.includes(c.id)}
                      onCheckedChange={(checked) => toggleCommission(c.id, !!checked)}
                    />
                    <div>
                      <p className="font-medium">
                        {c.marketer?.name} · GHS {Number(c.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.rateType} @ {c.ratePercent}% of GHS {Number(c.paymentAmount).toFixed(2)}
                        {c.customer?.name ? ` · ${c.customer.name}` : ''}
                        {c.marketer?.momoNumber ? ` · MoMo ${c.marketer.momoNumber}` : ''}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Payment reference (optional)</Label>
              <Input
                value={paidNote}
                onChange={(e) => setPaidNote(e.target.value)}
                placeholder="MoMo transaction ID or note"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payout reference (optional)</Label>
              <Input
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                placeholder="e.g. MoMo ref ABC123"
              />
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleMarkPaid} disabled={!selectedCommissionIds.length}>
                Pay Sabito
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default SettingsSabitoPartnersSection;
