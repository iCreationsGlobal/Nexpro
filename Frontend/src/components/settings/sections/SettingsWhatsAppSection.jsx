import {
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSettingsWhatsApp } from '../../../hooks/useSettingsWhatsApp';
import { showSuccess } from '../../../utils/toast';
import { WHATSAPP_TEMPLATES } from '../../../constants/whatsappTemplates';

/**
 * WhatsApp Business API configuration section.
 */
const SettingsWhatsAppSection = () => {
  const {
    canManageOrganization,
    whatsappForm,
    whatsappData,
    loadingWhatsApp,
    onWhatsAppSubmit,
    handleTestWhatsApp,
    handleWhatsAppEnabledChange,
    updateWhatsAppMutation,
    testWhatsAppMutation,
    whatsappTemplateLearnMoreOpen,
    setWhatsappTemplateLearnMoreOpen,
    resetWhatsAppForm,
    whatsappEditing,
    setWhatsappEditing,
    cancelWhatsAppEdit,
    showWhatsAppSummary,
  } = useSettingsWhatsApp();

  const webhookUrl = whatsappData?.data?.webhookUrl || '/api/webhooks/whatsapp';
  const templateCatalog = Array.isArray(whatsappData?.data?.templates) && whatsappData.data.templates.length
    ? whatsappData.data.templates
    : WHATSAPP_TEMPLATES;

  const copyWebhookUrl = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      showSuccess('Webhook URL copied');
    });
  };

  if (!canManageOrganization) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              You need admin or manager permissions to configure WhatsApp settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base md:text-2xl">WhatsApp Business API Configuration</CardTitle>
          {!loadingWhatsApp && showWhatsAppSummary && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setWhatsappEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loadingWhatsApp ? (
          <div className="flex items-center justify-center py-6 md:py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <Alert className="mb-3 md:mb-6 py-2 px-3 md:py-4 md:px-4">
              <AlertTitle className="text-sm md:text-base">WhatsApp Integration</AlertTitle>
              <AlertDescription className="text-xs md:text-sm">
                Configure WhatsApp Business API to send automated notifications from Automations (invoices, receipts, reminders, and more). You&apos;ll need a WhatsApp Business Account in Meta Business Manager first.
              </AlertDescription>
            </Alert>

            {showWhatsAppSummary ? (
              <>
                <Descriptions>
                  <DescriptionItem label="Status">
                    {whatsappData?.data?.enabled ? 'Enabled' : 'Disabled'}
                  </DescriptionItem>
                  <DescriptionItem label="Phone Number ID">
                    {whatsappData?.data?.phoneNumberId || '—'}
                  </DescriptionItem>
                  <DescriptionItem label="Business Account ID">
                    {whatsappData?.data?.businessAccountId || '—'}
                  </DescriptionItem>
                  <DescriptionItem label="Access Token">
                    {whatsappData?.data?.accessTokenConfigured ? 'Stored securely' : '—'}
                  </DescriptionItem>
                  <DescriptionItem label="Webhook Verify Token">
                    {whatsappData?.data?.webhookVerifyToken || '—'}
                  </DescriptionItem>
                  <DescriptionItem label="Template Namespace">
                    {whatsappData?.data?.templateNamespace || '—'}
                  </DescriptionItem>
                </Descriptions>
                <div className="mt-4 rounded-lg border border-gray-200 p-3 md:p-4 space-y-2">
                  <Label>Webhook URL</Label>
                  <p className="text-xs text-muted-foreground">
                    Paste this in Meta → WhatsApp → Configuration. Subscribe to messages.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={copyWebhookUrl}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </div>
              </>
            ) : (
            <Form {...whatsappForm}>
              <form onSubmit={whatsappForm.handleSubmit(onWhatsAppSubmit)} className="space-y-3 md:space-y-4">
                <FormField
                  control={whatsappForm.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-2 md:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable WhatsApp</FormLabel>
                        <FormDescription>
                          Enable WhatsApp Business API integration. When turned on, a connection test runs to verify your settings.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => handleWhatsAppEnabledChange(checked, field.onChange)}
                          disabled={testWhatsAppMutation.isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <FormField
                    control={whatsappForm.control}
                    name="phoneNumberId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm md:text-base">
                          Phone Number ID
                          <span className="text-xs text-muted-foreground ml-1 md:ml-2">
                            (Your WhatsApp Business Phone Number ID from Meta Business Manager)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 123456789012345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={whatsappForm.control}
                    name="businessAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Business Account ID
                          <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 123456789012345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={whatsappForm.control}
                  name="accessToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Access Token
                        <span className="text-xs text-muted-foreground ml-2">
                          (Your WhatsApp Business API Access Token - keep this secure)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter access token" {...field} />
                      </FormControl>
                      {whatsappData?.data?.accessTokenConfigured && !field.value?.trim() && (
                        <FormDescription>
                          A token is already stored in the database. Leave blank to keep using it.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <FormField
                    control={whatsappForm.control}
                    name="webhookVerifyToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Webhook Verify Token
                          <span className="text-xs text-muted-foreground ml-2">
                            (Set this in Meta Business Manager)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Your verify token" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={whatsappForm.control}
                    name="templateNamespace"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Template Namespace
                          <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-lg border border-gray-200 p-3 md:p-4 space-y-2">
                  <Label>Webhook URL</Label>
                  <p className="text-xs text-muted-foreground">
                    Paste this in Meta → WhatsApp → Configuration. Subscribe to message_status (and messages if you want inbound events).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={copyWebhookUrl}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end mt-3 md:mt-0">
                  {whatsappEditing ? (
                    <Button type="button" variant="outline" size="sm" onClick={cancelWhatsAppEdit}>
                      Cancel
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={resetWhatsAppForm}>
                      Reset
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestWhatsApp}
                    loading={testWhatsAppMutation.isPending}
                  >
                    Test Connection
                  </Button>
                  <Button type="submit" size="sm" loading={updateWhatsAppMutation.isPending}>
                    Save Settings
                  </Button>
                </div>
              </form>
            </Form>
            )}

            <Separator className="my-3 md:my-6">
              <span className="text-sm font-medium">Message Templates</span>
            </Separator>
            <Alert className="mt-2 md:mt-4 py-2 px-3 md:py-4 md:px-4 border-amber-200 bg-amber-50 text-amber-950">
              <AlertTitle className="text-sm md:text-base">Template setup required</AlertTitle>
              <AlertDescription>
                <div className="space-y-3">
                  <p>
                    Meta only delivers template messages. Create these UTILITY templates (English) in Meta Business Manager, then pick the same names in Automations.
                  </p>
                  <ul className="text-xs md:text-sm space-y-1 list-disc list-inside">
                    {templateCatalog.map((template) => (
                      <li key={template.name}>
                        <span className="font-medium">{template.name}</span>
                        {template.description ? ` — ${template.description}` : ''}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => setWhatsappTemplateLearnMoreOpen(true)}
                  >
                    <HelpCircle className="h-4 w-4" />
                    Learn More
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
            <Dialog open={whatsappTemplateLearnMoreOpen} onOpenChange={setWhatsappTemplateLearnMoreOpen}>
              <DialogContent className="sm:max-w-[32rem] sm:max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    How to Set Up WhatsApp Templates
                  </DialogTitle>
                </DialogHeader>
                <DialogBody className="overflow-y-auto space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Create these templates in Meta Business Manager so your shop can send customers bills, receipts, quotes, and stock alerts via WhatsApp. Template approval usually takes 24–48 hours.
                  </p>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Where to go</p>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Go to <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">Meta for Developers</a></li>
                      <li>Open your WhatsApp app or create one</li>
                      <li>Go to WhatsApp → Message Templates</li>
                      <li>Create each template below (use exact names)</li>
                    </ol>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Template names</p>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      {templateCatalog.map((template) => (
                        <li key={template.name}>
                          <strong>{template.name}</strong>
                          {template.description ? ` – ${template.description}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use Category: <strong>UTILITY</strong> and Language: <strong>English</strong> for all templates.
                  </p>
                  <div className="rounded-lg border border-gray-200 bg-muted/50 p-3">
                    <a
                      href="https://www.facebook.com/business/help"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Meta Business Help Centre
                    </a>
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button onClick={() => setWhatsappTemplateLearnMoreOpen(false)}>
                    Got it
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SettingsWhatsAppSection;
