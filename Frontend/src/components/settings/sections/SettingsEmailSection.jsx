import { Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useSettingsEmail } from '../../../hooks/useSettingsEmail';

/**
 * Email provider configuration section.
 */
const SettingsEmailSection = () => {
  const {
    canManageOrganization,
    emailForm,
    loadingEmail,
    emailEditing,
    setEmailEditing,
    showSmtpPassword,
    setShowSmtpPassword,
    onEmailSubmit,
    handleTestEmail,
    handleEmailEnabledChange,
    updateEmailMutation,
    testEmailMutation,
    emailDataLoaded,
    emailPlatformInfo,
    switchingToOwnEmail,
    platformEmailActive,
    noEmailAvailable,
    showEmailSummary,
    resetEmailForm,
  } = useSettingsEmail();

  if (!canManageOrganization) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              You need admin or manager permissions to configure Email settings.
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
          <CardTitle className="text-base md:text-2xl">Email Service Configuration</CardTitle>
          {!loadingEmail && showEmailSummary && (
            <Button variant="secondaryStroke" size="sm" className="shrink-0" onClick={() => setEmailEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loadingEmail ? (
          <div className="flex items-center justify-center py-6 md:py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : showEmailSummary ? (
          <>
            <Alert className="mb-3 md:mb-6 py-2 px-3 md:py-4 md:px-4">
              <Info className="h-4 w-4" />
              <AlertTitle className="text-sm md:text-base">Using your own email provider</AlertTitle>
              <AlertDescription className="text-xs md:text-sm">
                Customer email is sent through your configured provider with your from address. ABS platform email no longer applies.
              </AlertDescription>
            </Alert>
            <Descriptions>
              <DescriptionItem label="Status">Enabled</DescriptionItem>
              <DescriptionItem label="Provider">{(emailDataLoaded?.provider || 'smtp').toUpperCase()}</DescriptionItem>
              <DescriptionItem label="From Email">{emailDataLoaded?.fromEmail || '—'}</DescriptionItem>
              <DescriptionItem label="From Name">{emailDataLoaded?.fromName || '—'}</DescriptionItem>
            </Descriptions>
          </>
        ) : (
          <>
            {emailEditing && (
              <div className="mb-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setEmailEditing(false)}>
                  Cancel
                </Button>
              </div>
            )}
            <Alert className="mb-3 md:mb-6 py-2 px-3 md:py-4 md:px-4">
              <AlertTitle className="text-sm md:text-base">Email Integration</AlertTitle>
              <AlertDescription className="text-xs md:text-sm space-y-2">
                <p>
                  <span className="font-medium text-foreground">Default:</span>{' '}
                  Customer email is sent through ABS platform email automatically when you have not configured your own provider.
                  {emailPlatformInfo?.fromName ? (
                    <> Messages are sent as <span className="font-medium">{emailPlatformInfo.fromName}</span>{emailPlatformInfo.fromEmail ? <> ({emailPlatformInfo.fromEmail})</> : null}.</>
                  ) : (
                    ' Messages use the ABS platform sender.'
                  )}
                </p>
                <p>
                  <span className="font-medium text-foreground">Optional:</span>{' '}
                  Connect your own SMTP, SendGrid, or AWS SES below to send from your business address instead.
                </p>
              </AlertDescription>
            </Alert>

            {platformEmailActive && (
              <Alert className="mb-3 md:mb-4 border-[#166534]/25 bg-[#166534]/5 py-2 px-3 md:py-4 md:px-4">
                <Info className="h-4 w-4 text-[#166534]" />
                <AlertTitle className="text-sm md:text-base text-[#166534]">ABS platform email is active</AlertTitle>
                <AlertDescription className="text-xs md:text-sm text-foreground">
                  Email is already working for your workspace—you do not need to enable anything below.
                </AlertDescription>
              </Alert>
            )}

            {switchingToOwnEmail && (
              <Alert className="mb-3 md:mb-4 border-gray-200 py-2 px-3 md:py-4 md:px-4">
                <Info className="h-4 w-4" />
                <AlertTitle className="text-sm md:text-base">Switching to your own email provider</AlertTitle>
                <AlertDescription className="text-xs md:text-sm">
                  Save your settings after the connection test succeeds.
                </AlertDescription>
              </Alert>
            )}

            {noEmailAvailable && (
              <Alert className="mb-3 md:mb-4 py-2 px-3 md:py-4 md:px-4">
                <AlertTitle className="text-sm md:text-base">No email available</AlertTitle>
                <AlertDescription className="text-xs md:text-sm text-muted-foreground">
                  Platform email is not enabled for your account. Connect your own provider below, or contact ABS support.
                </AlertDescription>
              </Alert>
            )}

            <p className="mb-3 md:mb-4 text-xs md:text-sm font-medium text-foreground">Your own email provider (optional)</p>

            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-3 md:space-y-4">
                <FormField
                  control={emailForm.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-2 md:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Use my own email provider</FormLabel>
                        <FormDescription>
                          Connect SMTP, SendGrid, or AWS SES with your credentials. A connection test runs when you turn this on.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => handleEmailEnabledChange(checked, field.onChange)}
                          disabled={testEmailMutation.isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={emailForm.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Provider</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="smtp">SMTP</SelectItem>
                            <SelectItem value="sendgrid">SendGrid</SelectItem>
                            <SelectItem value="ses">AWS SES</SelectItem>
                            <SelectItem value="resend">Resend</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {emailForm.watch('provider') === 'smtp' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={emailForm.control} name="smtpHost" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Host <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={emailForm.control} name="smtpPort" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Port <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="587" {...field} value={field.value === '' || field.value == null ? '' : field.value}
                              onChange={(e) => { const raw = e.target.value; if (raw === '') { field.onChange(''); return; } const n = parseInt(raw, 10); field.onChange(Number.isNaN(n) ? '' : n); }} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={emailForm.control} name="smtpUser" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP User <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl><Input placeholder="user@example.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={emailForm.control} name="smtpPassword" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Password <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input type={showSmtpPassword ? 'text' : 'password'} placeholder="Enter password" className="pr-10" {...field} />
                              <button type="button" onClick={() => setShowSmtpPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showSmtpPassword ? 'Hide password' : 'Show password'}>
                                {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={emailForm.control} name="smtpRejectUnauthorized" render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Reject Unauthorized Certificates</FormLabel>
                          <FormDescription>Enable to reject unauthorized SSL certificates</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </>
                )}

                {emailForm.watch('provider') === 'sendgrid' && (
                  <FormField control={emailForm.control} name="sendgridApiKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SendGrid API Key <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                      <FormControl><Input type="password" placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {emailForm.watch('provider') === 'resend' && (
                  <FormField control={emailForm.control} name="resendApiKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resend API Key <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                      <FormControl><Input type="password" placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {emailForm.watch('provider') === 'ses' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={emailForm.control} name="sesAccessKeyId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>AWS Access Key ID <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl><Input placeholder="AKIAIOSFODNN7EXAMPLE" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={emailForm.control} name="sesRegion" render={({ field }) => (
                        <FormItem>
                          <FormLabel>AWS Region <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                          <FormControl><Input placeholder="us-east-1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={emailForm.control} name="sesSecretAccessKey" render={({ field }) => (
                      <FormItem>
                        <FormLabel>AWS Secret Access Key <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                        <FormControl><Input type="password" placeholder="Enter secret access key" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={emailForm.control} name="sesHost" render={({ field }) => (
                      <FormItem>
                        <FormLabel>SES Host <span className="text-xs text-muted-foreground ml-2">(Optional)</span></FormLabel>
                        <FormControl><Input placeholder="email-smtp.us-east-1.amazonaws.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <FormField control={emailForm.control} name="fromEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Email <span className="text-xs text-muted-foreground ml-2">(Required)</span></FormLabel>
                      <FormControl><Input type="email" placeholder="noreply@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={emailForm.control} name="fromName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Name <span className="text-xs text-muted-foreground ml-2">(Optional)</span></FormLabel>
                      <FormControl><Input placeholder="Your Company Name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="flex flex-wrap gap-2 justify-end mt-3 md:mt-0">
                  <Button type="button" variant="outline" size="sm" onClick={resetEmailForm}>Reset</Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleTestEmail} loading={testEmailMutation.isPending}>Test Connection</Button>
                  <Button type="submit" size="sm" loading={updateEmailMutation.isPending}>Save Settings</Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SettingsEmailSection;
