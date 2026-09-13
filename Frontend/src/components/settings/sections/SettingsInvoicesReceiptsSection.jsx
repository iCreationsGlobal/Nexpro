import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import PrintableInvoice from '../../PrintableInvoice';
import {
  POS_CHANNEL_LABELS,
  POS_FORMAT_LABELS,
  POS_MODE_LABELS,
  useSettingsInvoicesReceipts,
} from '../../../hooks/useSettingsInvoicesReceipts';

/**
 * Invoices & receipts settings (auto-send, POS receipt/print, checkout fields, preview).
 */
const SettingsInvoicesReceiptsSection = () => {
   const {
    canManageOrganization,
    isStudioLike,
    loadingNotificationChannels,
    loadingPOSConfig,
    autoSendInvoice,
    autoSendReceipt,
    sendPaymentReminderEmail,
    sendInvoicePaidConfirmationToCustomer,
    acceptOnlinePayments,
    quoteWorkflowEnabled,
    jobInvoiceData,
    updateQuoteWorkflowMutation,
    updateJobInvoiceMutation,
    handleQuoteWorkflowChange,
    handleAutoSendInvoiceOnJobCreation,
    updateCustomerNotificationPrefsMutation,
    handleNotificationPrefChange,
    configData,
    posConfigForm,
    posConfigEditing,
    setPosConfigEditing,
    resetPosConfigFormFromData,
    onPOSConfigSubmit,
    updatePOSConfigMutation,
    organization,
    organizationLogo,
    mockInvoice,
  } = useSettingsInvoicesReceipts();

  if (!canManageOrganization) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              You need admin or manager permissions to change invoice and receipt settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base md:text-2xl">Auto-send to customers</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            When to automatically notify customers via Email, WhatsApp, or SMS (using your configured channels).
            {' '}
            <a href="/automations" className="text-[#166534] underline underline-offset-2">
              Managed in Automations
            </a>
            {' '}
            after migration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingNotificationChannels ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preferences…
            </p>
          ) : (
            <>
              <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Auto send invoice to customer</Label>
                  <p className="text-xs text-muted-foreground">
                    When you send an invoice, notify the customer via configured channels (email, WhatsApp, SMS).
                  </p>
                </div>
                <Switch
                  checked={autoSendInvoice}
                  disabled={updateCustomerNotificationPrefsMutation.isPending}
                  onCheckedChange={(checked) => handleNotificationPrefChange({ autoSendInvoiceToCustomer: checked })}
                />
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Auto send receipt to customer</Label>
                  <p className="text-xs text-muted-foreground">
                    When a sale is completed (e.g. POS), automatically send the receipt via configured channels.
                  </p>
                </div>
                <Switch
                  checked={autoSendReceipt}
                  disabled={updateCustomerNotificationPrefsMutation.isPending}
                  onCheckedChange={(checked) => handleNotificationPrefChange({ autoSendReceiptToCustomer: checked })}
                />
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Send payment reminder by email</Label>
                  <p className="text-xs text-muted-foreground">
                    Include email when sending overdue payment reminders (in addition to WhatsApp/SMS if configured).
                  </p>
                </div>
                <Switch
                  checked={sendPaymentReminderEmail}
                  disabled={updateCustomerNotificationPrefsMutation.isPending}
                  onCheckedChange={(checked) => handleNotificationPrefChange({ sendPaymentReminderEmail: checked })}
                />
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Send invoice paid confirmation to customer</Label>
                  <p className="text-xs text-muted-foreground">
                    When an invoice is paid, send a confirmation email (and SMS if configured) to the customer.
                  </p>
                </div>
                <Switch
                  checked={sendInvoicePaidConfirmationToCustomer}
                  disabled={updateCustomerNotificationPrefsMutation.isPending}
                  onCheckedChange={(checked) => handleNotificationPrefChange({ sendInvoicePaidConfirmationToCustomer: checked })}
                />
              </div>
              <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Accept online payments</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow customers to pay invoices via payment link or online checkout. When enabled, payment collection must be configured.
                  </p>
                </div>
                <Switch
                  checked={acceptOnlinePayments}
                  disabled={updateCustomerNotificationPrefsMutation.isPending}
                  onCheckedChange={(checked) => handleNotificationPrefChange({ acceptOnlinePayments: checked })}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base md:text-2xl">Quote workflow</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            When a customer accepts a quote via the view-quote link, choose what happens next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="space-y-0.5 pr-4">
              <Label className="text-base">
                {isStudioLike
                  ? 'Auto-create job and invoice when customer accepts'
                  : 'Auto-create sales invoice when customer accepts'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isStudioLike
                  ? 'If on: accepting the quote creates a job and invoice, and the invoice is sent to the customer automatically. If off: only the acceptance is recorded.'
                  : 'If on: accepting the quote creates a sales invoice and sends it to the customer automatically. If off: only the acceptance is recorded.'}
              </p>
            </div>
            <Switch
              checked={quoteWorkflowEnabled}
              disabled={updateQuoteWorkflowMutation.isPending}
              onCheckedChange={handleQuoteWorkflowChange}
            />
          </div>
        </CardContent>
      </Card>

      {isStudioLike ? (
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base md:text-2xl">Job invoices</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Control automatic invoice sending when jobs are created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
              <div className="space-y-0.5 pr-4">
                <Label className="text-base">Auto-send invoice when a job is created</Label>
                <p className="text-xs text-muted-foreground">
                  After an invoice is auto-generated for a new job, mark it sent and notify the customer (email, WhatsApp, SMS) when channels are configured.
                </p>
              </div>
              <Switch
                checked={jobInvoiceData?.autoSendInvoiceOnJobCreation === true}
                disabled={updateJobInvoiceMutation.isPending}
                onCheckedChange={handleAutoSendInvoiceOnJobCreation}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base md:text-2xl">POS &amp; checkout</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Receipt delivery, print format, and customer fields at checkout.
              </CardDescription>
            </div>
            {!loadingPOSConfig && !posConfigEditing && (
              <Button
                type="button"
                variant="secondaryStroke"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => {
                  resetPosConfigFormFromData();
                  setPosConfigEditing(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingPOSConfig ? (
            <div className="flex items-center justify-center py-6 md:py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posConfigEditing ? (
            <Form {...posConfigForm}>
              <form onSubmit={posConfigForm.handleSubmit(onPOSConfigSubmit)} className="space-y-6 md:space-y-8">
                <div>
                  <p className="text-sm font-semibold mb-1">Receipt delivery</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Configure how receipts are sent or printed after a sale.
                  </p>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <FormField
                        control={posConfigForm.control}
                        name="receipt.mode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>After sale</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                if (value === 'auto_print') {
                                  posConfigForm.setValue('receipt.channels', ['print']);
                                } else if (value === 'auto_send') {
                                  const current = posConfigForm.getValues('receipt.channels') || [];
                                  const sendChannels = current.filter((c) => ['sms', 'whatsapp', 'email'].includes(c));
                                  posConfigForm.setValue('receipt.channels', sendChannels.length ? sendChannels : ['sms']);
                                }
                              }}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select behavior" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="ask">Ask staff</SelectItem>
                                <SelectItem value="auto_send">Auto send</SelectItem>
                                <SelectItem value="auto_print">Auto print</SelectItem>
                                <SelectItem value="auto_both">Auto send + print</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {{
                                ask: 'Staff will choose how to send or print the receipt after each sale.',
                                auto_send: 'Receipt will automatically be sent to customers via the enabled channels (SMS, WhatsApp, Email) after each sale.',
                                auto_print: 'Receipt will automatically be printed for the customer after each sale.',
                                auto_both: 'Receipt will automatically be sent to customers and printed for the customer after each sale.',
                              }[posConfigForm.watch('receipt.mode')] || 'Choose how receipts are handled after each sale.'}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <FormField
                        control={posConfigForm.control}
                        name="receipt.channels"
                        render={({ field }) => {
                          const mode = posConfigForm.watch('receipt.mode');
                          const allChannels = [
                            { id: 'sms', label: 'SMS' },
                            { id: 'whatsapp', label: 'WhatsApp' },
                            { id: 'email', label: 'Email' },
                            { id: 'print', label: 'Print' },
                          ];
                          const selectableChannels = mode === 'auto_print'
                            ? allChannels.filter((c) => c.id === 'print')
                            : mode === 'auto_send'
                              ? allChannels.filter((c) => ['sms', 'whatsapp', 'email'].includes(c.id))
                              : allChannels;
                          const channelDescription = mode === 'auto_print'
                            ? 'Print only — receipt will be printed automatically.'
                            : mode === 'auto_send'
                              ? 'Select channels for sending receipts automatically (SMS, WhatsApp, Email).'
                              : mode === 'auto_both'
                                ? 'Select channels for send + print (SMS, WhatsApp, Email, Print).'
                                : 'Select which channels staff can choose from.';
                          return (
                            <FormItem>
                              <div className="mb-2">
                                <FormLabel>Enabled channels</FormLabel>
                                <FormDescription>{channelDescription}</FormDescription>
                              </div>
                              <div className="flex flex-wrap gap-4">
                                {selectableChannels.map((item) => (
                                  <div key={item.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`channel-${item.id}`}
                                      checked={field.value?.includes(item.id)}
                                      disabled={mode === 'auto_print'}
                                      onCheckedChange={(checked) => {
                                        const next = checked
                                          ? [...(field.value || []), item.id]
                                          : (field.value || []).filter((c) => c !== item.id);
                                        field.onChange(next);
                                      }}
                                    />
                                    <Label htmlFor={`channel-${item.id}`} className="font-normal cursor-pointer">
                                      {item.label}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-1">Print</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Receipt and invoice print layout. Thermal printers use black and white, no logo, small font.
                  </p>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <FormField
                      control={posConfigForm.control}
                      name="print.format"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Format</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="a4">A4 (full page)</SelectItem>
                              <SelectItem value="thermal_58">58mm Thermal</SelectItem>
                              <SelectItem value="thermal_80">80mm Thermal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            58mm/80mm: black and white, no logo, small font for thermal receipt printers
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-1">Customer at checkout</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Require customer details before completing checkout.
                  </p>
                  <div className="space-y-4">
                    <FormField
                      control={posConfigForm.control}
                      name="customer.phoneRequired"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                          <div className="space-y-0.5 pr-4">
                            <FormLabel className="text-base">Require phone number</FormLabel>
                            <FormDescription>
                              Block checkout until customer phone is provided
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={posConfigForm.control}
                      name="customer.nameRequired"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                          <div className="space-y-0.5 pr-4">
                            <FormLabel className="text-base">Require customer name</FormLabel>
                            <FormDescription>
                              Block checkout until customer name is provided
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Alert>
                  <AlertDescription>
                    For SMS, WhatsApp, or Email receipts, configure those channels under Settings → Email or WhatsApp.
                  </AlertDescription>
                </Alert>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetPosConfigFormFromData();
                      setPosConfigEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updatePOSConfigMutation.isPending}>
                    {updatePOSConfigMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving…
                      </>
                    ) : (
                      'Save configuration'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6 md:space-y-8">
              <div>
                <p className="text-sm font-semibold mb-1">Receipt delivery</p>
                <p className="text-xs text-muted-foreground mb-4">
                  How receipts are sent or printed after each completed sale.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-base">After sale</Label>
                      <p className="text-xs text-muted-foreground">
                        What happens when a sale completes at the register or checkout.
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0 text-right">
                      {POS_MODE_LABELS[configData?.receipt?.mode] || configData?.receipt?.mode || '—'}
                    </span>
                  </div>
                  <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-base">Enabled channels</Label>
                      <p className="text-xs text-muted-foreground">
                        Channels staff can use or that run automatically, depending on the mode above.
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0 text-right max-w-[45%] break-words">
                      {(configData?.receipt?.channels || []).map((c) => POS_CHANNEL_LABELS[c] || c).join(', ') || '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-1">Print</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Layout for printed receipts and invoices from POS or checkout.
                </p>
                <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-base">Format</Label>
                    <p className="text-xs text-muted-foreground">
                      Page or roll width used when printing receipts and invoices.
                    </p>
                  </div>
                  <span className="text-sm font-medium shrink-0 text-right">
                    {POS_FORMAT_LABELS[configData?.print?.format] || configData?.print?.format || '—'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-1">Customer at checkout</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Whether customers must provide contact details before completing checkout.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-base">Require phone number</Label>
                      <p className="text-xs text-muted-foreground">
                        Block checkout until a phone number is entered for the customer.
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0">{configData?.customer?.phoneRequired ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-base">Require customer name</Label>
                      <p className="text-xs text-muted-foreground">
                        Block checkout until a name is entered for the customer.
                      </p>
                    </div>
                    <span className="text-sm font-medium shrink-0">{configData?.customer?.nameRequired ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
              <Alert>
                <AlertDescription>
                  For SMS, WhatsApp, or Email receipts, configure those channels under Settings → Email or WhatsApp.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base md:text-2xl">Invoice preview</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Preview how your invoice will look with your current branding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border border-gray-200 rounded-lg p-2 md:p-4 bg-card max-h-[800px] overflow-auto">
            <PrintableInvoice
              invoice={mockInvoice}
              organization={{
                ...organization,
                logoUrl: organizationLogo || organization.logoUrl,
              }}
              maskAmounts
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsInvoicesReceiptsSection;
