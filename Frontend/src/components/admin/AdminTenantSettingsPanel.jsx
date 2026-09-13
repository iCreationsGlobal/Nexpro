import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PanelLeft, Receipt } from 'lucide-react';
import adminService from '@/services/adminService';
import { showError, showSuccess, handleApiError } from '@/utils/toast';
import { SIDEBAR_MENU_GROUPS } from '@/constants/sidebarMenus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const EMPTY_SETTINGS = {
  organization: {
    invoiceFooter: '',
    paymentDetails: '',
    paymentDetailsEnabled: false,
    defaultPaymentTerms: '',
    defaultTermsAndConditions: '',
  },
  jobInvoice: {
    autoSendInvoiceOnJobCreation: false,
    customerJobTrackingEnabled: false,
    emailCustomerJobTrackingOnJobCreation: false,
    smsCustomerJobTrackingOnJobCreation: false,
  },
  customerNotifications: {
    autoSendInvoiceToCustomer: true,
    autoSendReceiptToCustomer: false,
    sendPaymentReminderEmail: false,
    sendInvoicePaidConfirmationToCustomer: true,
    acceptOnlinePayments: false,
  },
  sidebarDefaults: {
    hiddenSidebarKeys: [],
  },
};

/**
 * Platform admin panel for editing tenant invoice and sidebar defaults.
 */
export default function AdminTenantSettingsPanel({ tenantId, tenantName }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [draft, setDraft] = useState(EMPTY_SETTINGS);
  const [reason, setReason] = useState('');

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await adminService.getTenantSettings(tenantId);
      const data = response?.data?.data ?? response?.data ?? null;
      if (!data) {
        throw new Error('Tenant settings not found');
      }
      const next = {
        organization: { ...EMPTY_SETTINGS.organization, ...(data.organization || {}) },
        jobInvoice: { ...EMPTY_SETTINGS.jobInvoice, ...(data.jobInvoice || {}) },
        customerNotifications: {
          ...EMPTY_SETTINGS.customerNotifications,
          ...(data.customerNotifications || {}),
        },
        sidebarDefaults: {
          hiddenSidebarKeys: data.sidebarDefaults?.hiddenSidebarKeys || [],
        },
      };
      setSettings(next);
      setDraft(next);
    } catch (error) {
      handleApiError(error, { context: 'load tenant settings' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const hasChanges = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(draft),
    [settings, draft]
  );

  const hiddenSidebarSet = useMemo(
    () => new Set(draft.sidebarDefaults.hiddenSidebarKeys),
    [draft.sidebarDefaults.hiddenSidebarKeys]
  );

  const handleSidebarToggle = useCallback((key, visible) => {
    setDraft((prev) => {
      const next = new Set(prev.sidebarDefaults.hiddenSidebarKeys);
      if (visible) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return {
        ...prev,
        sidebarDefaults: { hiddenSidebarKeys: Array.from(next) },
      };
    });
  }, []);

  const handleSave = async () => {
    if (!tenantId) return;
    if (!reason.trim()) {
      showError(null, 'Please enter a reason for this configuration change');
      return;
    }
    setSaving(true);
    try {
      const response = await adminService.updateTenantSettings(tenantId, {
        reason: reason.trim(),
        organization: draft.organization,
        jobInvoice: draft.jobInvoice,
        customerNotifications: draft.customerNotifications,
        sidebarDefaults: draft.sidebarDefaults,
      });
      const data = response?.data?.data ?? response?.data ?? draft;
      const next = {
        organization: { ...EMPTY_SETTINGS.organization, ...(data.organization || {}) },
        jobInvoice: { ...EMPTY_SETTINGS.jobInvoice, ...(data.jobInvoice || {}) },
        customerNotifications: {
          ...EMPTY_SETTINGS.customerNotifications,
          ...(data.customerNotifications || {}),
        },
        sidebarDefaults: {
          hiddenSidebarKeys: data.sidebarDefaults?.hiddenSidebarKeys || [],
        },
      };
      setSettings(next);
      setDraft(next);
      setReason('');
      showSuccess('Tenant settings updated');
    } catch (error) {
      handleApiError(error, { context: 'update tenant settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Invoice settings
          </CardTitle>
          <CardDescription>
            Configure invoice defaults for {tenantName || 'this tenant'}. Changes are audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-footer">Invoice footer (optional)</Label>
            <Textarea
              id="invoice-footer"
              rows={3}
              value={draft.organization.invoiceFooter}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  organization: { ...prev.organization, invoiceFooter: e.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-details">Payment details (optional)</Label>
            <Textarea
              id="payment-details"
              rows={3}
              value={draft.organization.paymentDetails}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  organization: { ...prev.organization, paymentDetails: e.target.value },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="payment-details-enabled">Show payment details on invoices</Label>
              <p className="text-xs text-muted-foreground">When enabled, payment details appear on invoice PDFs.</p>
            </div>
            <Switch
              id="payment-details-enabled"
              checked={draft.organization.paymentDetailsEnabled}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  organization: { ...prev.organization, paymentDetailsEnabled: checked },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-payment-terms">Default payment terms (optional)</Label>
            <Input
              id="default-payment-terms"
              value={draft.organization.defaultPaymentTerms}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  organization: { ...prev.organization, defaultPaymentTerms: e.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-terms">Default terms and conditions (optional)</Label>
            <Textarea
              id="default-terms"
              rows={3}
              value={draft.organization.defaultTermsAndConditions}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  organization: {
                    ...prev.organization,
                    defaultTermsAndConditions: e.target.value,
                  },
                }))
              }
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">Job invoice automation</p>
            {[
              ['autoSendInvoiceOnJobCreation', 'Auto-send invoice when a job is created'],
              ['customerJobTrackingEnabled', 'Enable customer job tracking links'],
              ['emailCustomerJobTrackingOnJobCreation', 'Email tracking link when job is created'],
              ['smsCustomerJobTrackingOnJobCreation', 'SMS tracking link when job is created'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`job-invoice-${key}`}>{label}</Label>
                <Switch
                  id={`job-invoice-${key}`}
                  checked={draft.jobInvoice[key]}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      jobInvoice: { ...prev.jobInvoice, [key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium">Customer notifications</p>
            {[
              ['autoSendInvoiceToCustomer', 'Auto-send invoice to customer'],
              ['autoSendReceiptToCustomer', 'Auto-send receipt to customer'],
              ['sendPaymentReminderEmail', 'Send payment reminder emails'],
              ['sendInvoicePaidConfirmationToCustomer', 'Send invoice paid confirmation'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`customer-notify-${key}`}>{label}</Label>
                <Switch
                  id={`customer-notify-${key}`}
                  checked={draft.customerNotifications[key]}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      customerNotifications: { ...prev.customerNotifications, [key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
            Sidebar defaults
          </CardTitle>
          <CardDescription>
            Default hidden menus for new members who have not customized their sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SIDEBAR_MENU_GROUPS.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-sm font-medium">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const visible = !hiddenSidebarSet.has(item.key);
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor={`sidebar-${item.key}`}>{item.label}</Label>
                        {item.description ? (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                      <Switch
                        id={`sidebar-${item.key}`}
                        checked={visible}
                        onCheckedChange={(checked) => handleSidebarToggle(item.key, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Save changes</CardTitle>
          <CardDescription>A reason is required for the audit log.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-reason">Reason (required)</Label>
            <Textarea
              id="settings-reason"
              rows={3}
              placeholder="e.g. Onboarding setup for new pharmacy tenant"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondaryStroke"
              disabled={saving || !hasChanges}
              onClick={() => setDraft(settings)}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              disabled={saving || !hasChanges || !reason.trim()}
              onClick={handleSave}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Save tenant settings'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
