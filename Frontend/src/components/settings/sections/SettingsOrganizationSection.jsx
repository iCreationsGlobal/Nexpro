import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PhoneNumberInput from '../../PhoneNumberInput';
import FileUpload from '../../FileUpload';
import FilePreview from '../../FilePreview';
import { OrganizationReviewShareSection } from '../../OrganizationReviewShareSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Descriptions as ShadcnDescriptions, DescriptionItem } from '@/components/ui/descriptions';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { SHOP_TYPE_LABELS, CURRENCIES } from '../../../constants';
import { useSettingsOrganization } from '../../../hooks/useSettingsOrganization';

const SettingsOrganizationSection = () => {
  const navigate = useNavigate();
  const {
    activeTenant,
    canManageOrganization,
    hasFeature,
    organization,
    organizationRecord,
    organizationForm,
    organizationEditing,
    organizationLogoPreview,
    organizationLogoPreviewVisible,
    setOrganizationLogoPreviewVisible,
    organizationLogoUploading,
    loadingOrganization,
    workspaceTypeDisplay,
    workspaceDescription,
    addAnotherWorkspaceLabel,
    updateOrganizationMutation,
    onOrganizationSubmit,
    handleOrganizationLogoUpload,
    startOrganizationEdit,
    cancelOrganizationEdit,
    handleAddAnotherBranch,
    resolveFileUrl,
    setOrganizationLogoPreview,
  } = useSettingsOrganization();

  const organizationTab = organizationEditing && canManageOrganization ? (
    <Card className="border-0 shadow-none bg-transparent md:border md:bg-card">
      <CardHeader className="p-0 md:p-6 pb-2 md:pb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base md:text-2xl">Organization Profile</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={cancelOrganizationEdit}
            >
              Cancel
            </Button>
            <Button onClick={organizationForm.handleSubmit(onOrganizationSubmit)} loading={updateOrganizationMutation.isLoading}>
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 md:p-6 pt-0 md:pt-0 pb-0 md:pb-6">
        <Form {...organizationForm}>
          <form onSubmit={organizationForm.handleSubmit(onOrganizationSubmit)} className="space-y-3 md:space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <FormField
                control={organizationForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Nexus Studio" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="legalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Legal Name (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Legal registered name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={organizationForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <PhoneNumberInput placeholder="Enter phone number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={organizationForm.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://nexuspress.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={organizationForm.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl>
                      <Input type="hidden" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {activeTenant?.plan === 'enterprise' && (
              <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                <h3 className="text-sm font-medium">Enterprise branding</h3>
                <p className="text-xs text-muted-foreground">
                  Customize the app name and primary color shown across the app (sidebar, theme).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={organizationForm.control}
                    name="appName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App name (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. My Business Suite" {...field} />
                        </FormControl>
                        <FormDescription>Replaces the default app name in the sidebar and header.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={organizationForm.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary color (optional)</FormLabel>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input
                              type="color"
                              className="h-10 w-16 p-1 cursor-pointer"
                              {...field}
                              value={field.value || '#166534'}
                            />
                          </FormControl>
                          <Input
                            type="text"
                            className="flex-1 font-mono text-sm"
                            placeholder="#166534"
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </div>
                        <FormDescription>Brand color used for buttons, links, and accent areas.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      organizationForm.setValue('appName', '', { shouldDirty: true, shouldValidate: true });
                      organizationForm.setValue('primaryColor', '', { shouldDirty: true, shouldValidate: true });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {organization.businessType === 'shop' && (
              <FormField
                control={organizationForm.control}
                name="shopType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shop type (optional)</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select shop type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SHOP_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Used for default product categories and product templates.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={organizationForm.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency (optional)</FormLabel>
                  <Select
                    value={field.value || 'GHS'}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((curr) => (
                        <SelectItem key={curr.code} value={curr.code}>
                          {curr.symbol} - {curr.name} ({curr.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Currency used for invoices, quotes, and all financial displays.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <h3 className="text-sm font-medium mb-2 md:mb-4">Branding</h3>
          <div className="mb-6">
          <FileUpload
            onFileSelect={handleOrganizationLogoUpload}
            disabled={false}
            uploading={organizationLogoUploading}
            accept="image/*"
            maxSizeMB={5}
            uploadedFiles={organizationLogoPreview || organization.logoUrl ? [{
              id: 'organization-logo',
              fileUrl: organizationLogoPreview || organization.logoUrl,
              originalName: 'Organization Logo',
              name: 'Organization Logo',
              url: resolveFileUrl(organizationLogoPreview || organization.logoUrl)
            }] : []}
            onFilePreview={() => setOrganizationLogoPreviewVisible(true)}
            onFileRemove={() => {
              organizationForm.setValue('logoUrl', '');
              setOrganizationLogoPreview('');
            }}
            showFileList={true}
            emptyMessage="No organization logo uploaded yet."
          />
          <p className="text-sm text-muted-foreground mt-2">Upload a high-resolution image for invoices and quotes.</p>
          </div>
        </div>

        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <h3 className="text-sm font-medium mb-2 md:mb-4">Address</h3>
          <div className="space-y-3 md:space-y-4">
          <FormField
            control={organizationForm.control}
            name="address.line1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="address.line2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address Line 2 (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Suite / Landmark" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormField
            control={organizationForm.control}
            name="address.city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="address.state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State / Region (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="address.postalCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Postal Code (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="address.country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Ghana" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        </div>

        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <h3 className="text-sm font-medium mb-2 md:mb-4">Tax & Compliance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <FormField
            control={organizationForm.control}
            name="tax.vatNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>VAT Number (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.tin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>TIN (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.ghanaCardPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ghana Card PIN (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="For GRA e-VAT invoices" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-2 rounded-lg border border-border p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Ghana levy components (optional)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set VAT, NHIL, GETFund, and COVID-19 HRL rates for e-VAT-ready invoices. Combined rate is used when charging tax. Manage GRA connection under Compliance → e-VAT.
              </p>
            </div>
            {(organizationForm.watch('tax.levies') || []).map((levy, index) => (
              <div key={levy.code || index} className="grid grid-cols-[1fr_100px] gap-2 items-end">
                <FormField
                  control={organizationForm.control}
                  name={`tax.levies.${index}.label`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{levy.code?.toUpperCase() || 'Levy'}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={organizationForm.control}
                  name={`tax.levies.${index}.ratePercent`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Rate %</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={field.value === '' || field.value == null ? '' : String(field.value)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '' || /^\d*\.?\d*$/.test(raw)) field.onChange(raw === '' ? '' : raw);
                          }}
                          onBlur={() => {
                            const n = parseFloat(String(field.value));
                            field.onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </div>
          <FormField
            control={organizationForm.control}
            name="tax.enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Charge tax on sales</FormLabel>
                  <p className="text-sm text-muted-foreground">Apply your default rate to POS, quotes, and new invoices when enabled.</p>
                </div>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.defaultRatePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default tax rate (%)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name={field.name}
                    ref={field.ref}
                    value={
                      field.value === '' || field.value === null || field.value === undefined
                        ? ''
                        : String(field.value)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        field.onChange('');
                        return;
                      }
                      if (/^\d*\.?\d*$/.test(raw)) {
                        field.onChange(raw);
                      }
                    }}
                    onBlur={() => {
                      field.onBlur();
                      const v = field.value;
                      if (v === '' || v === undefined || v === null) {
                        field.onChange(0);
                        return;
                      }
                      const n = parseFloat(String(v));
                      field.onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.pricesAreTaxInclusive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Product prices include tax</FormLabel>
                  <p className="text-sm text-muted-foreground">Turn on if catalog and POS unit prices are tax-inclusive.</p>
                </div>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.displayLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tax label on documents (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. VAT, NHIL, Sales tax" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.otherCharges.enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 md:col-span-2">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Enable other charges</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Add a payment charge (for example Paystack 2%) to online checkouts.
                  </p>
                </div>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.otherCharges.label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Other charge label (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Transaction charge, Paystack fee" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.otherCharges.ratePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Other charge rate (%)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={field.value === '' || field.value === null || field.value === undefined ? '' : String(field.value)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        field.onChange('');
                        return;
                      }
                      if (/^\d*\.?\d*$/.test(raw)) field.onChange(raw);
                    }}
                    onBlur={() => {
                      field.onBlur();
                      const n = parseFloat(String(field.value || 0));
                      field.onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="tax.otherCharges.customerBears"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Customer bears this charge</FormLabel>
                  <p className="text-sm text-muted-foreground">When on, checkout amount includes this charge.</p>
                </div>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        </div>

        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <h3 className="text-sm font-medium mb-2 md:mb-4">Automations</h3>
          <Alert className="border-border">
            <AlertTitle>Automation behavior moved</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Configure rule triggers, conditions, and actions in the dedicated Automations page.
                Provider credentials stay in Settings.
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/automations')}
                >
                  Open Automations
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>

        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <FormField
            control={organizationForm.control}
            name="invoiceFooter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice & Quote Footer (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={4} placeholder="Enter your custom footer message" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="paymentDetails"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Payment details (Pay to) (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Enter the bank or mobile money details customers should pay to. This will appear under “Pay to” on invoices and quotes."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="paymentDetailsEnabled"
            render={({ field }) => (
              <FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Show Pay To on invoices and quotes</FormLabel>
                  <FormDescription>
                    Turn this on to display your saved payment details on customer documents.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <FormField
            control={organizationForm.control}
            name="defaultPaymentTerms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default Payment Terms (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Net 30, Due on Receipt" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={organizationForm.control}
            name="defaultTermsAndConditions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default Terms & Conditions (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Payment due within 30 days" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={organizationForm.control}
          name="supportEmail"
          render={({ field }) => (
            <FormItem className="mt-4">
              <FormLabel>Support / Contact Email (optional)</FormLabel>
              <FormControl>
                <Input type="email" placeholder="Used for Contact support link" {...field} />
              </FormControl>
              <FormDescription>Email address used when users click &quot;Contact support&quot;</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  ) : (
    <Card className="border-0 shadow-none bg-transparent md:border md:bg-card">
      <CardHeader className="p-0 md:p-6 pb-2 md:pb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base md:text-2xl">Organization Profile</CardTitle>
          {canManageOrganization && (
            <Button
              variant="secondaryStroke"
              size="sm"
              className="shrink-0"
              onClick={startOrganizationEdit}
            >
              Edit Organization
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 md:p-6 pt-0">
        {loadingOrganization ? (
          <div className="flex items-center justify-center py-6 md:py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            <ShadcnDescriptions>
              <DescriptionItem label="Display Name">{organization.name || '—'}</DescriptionItem>
              <DescriptionItem label="Legal Name">{organization.legalName || '—'}</DescriptionItem>
              <DescriptionItem label="Email">{organization.email || '—'}</DescriptionItem>
              <DescriptionItem label="Phone">{organization.phone || 'Not set'}</DescriptionItem>
              <DescriptionItem label="Website">{organization.website || 'Not set'}</DescriptionItem>
              {organization.businessType === 'shop' && (
                <DescriptionItem label="Shop type">
                  {organization.shopType ? (SHOP_TYPE_LABELS[organization.shopType] || organization.shopType) : 'Not set'}
                </DescriptionItem>
              )}
            </ShadcnDescriptions>

      <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
        <h3 className="text-sm font-medium mb-2 md:mb-4">Branding</h3>
        <div className="flex items-center gap-4 md:gap-6">
        <div
          style={{
            width: 120,
            height: 120,
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
            background: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          {organizationLogoPreview || organization.logoUrl ? (
            <img
              src={resolveFileUrl(organizationLogoPreview || organization.logoUrl)}
              alt="Organization logo"
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8, cursor: 'pointer' }}
              onClick={() => setOrganizationLogoPreviewVisible(true)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No logo uploaded</p>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-2">This logo is displayed on invoices and quotes.</p>
          {canManageOrganization && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                document.getElementById('organization-logo-upload')?.click();
              }}
              loading={organizationLogoUploading}
            >
              {organizationLogoPreview || organization.logoUrl ? 'Update Logo' : 'Upload Logo'}
            </Button>
          )}
          <input
            id="organization-logo-upload"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleOrganizationLogoUpload({ file });
              }
              // Reset input so the same file can be selected again
              e.target.value = '';
            }}
          />
        </div>
        </div>
      </div>

      {activeTenant?.plan === 'enterprise' && (
        <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
          <h3 className="text-sm font-medium mb-2 md:mb-4">Enterprise branding</h3>
          <ShadcnDescriptions>
            <DescriptionItem label="App name">{organization.appName ? organization.appName : 'Default (ABS)'}</DescriptionItem>
            <DescriptionItem label="Primary color">
              {organization.primaryColor ? (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-5 h-5 rounded border border-border"
                    style={{ backgroundColor: organization.primaryColor }}
                    aria-hidden
                  />
                  {organization.primaryColor}
                </span>
              ) : (
                'Default'
              )}
            </DescriptionItem>
          </ShadcnDescriptions>
          {canManageOrganization && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={startOrganizationEdit}
            >
              Edit branding
            </Button>
          )}
        </div>
      )}

      <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
        <h3 className="text-sm font-medium mb-2 md:mb-4">Address</h3>
        <ShadcnDescriptions>
        <DescriptionItem label="Street Address">{organization.address?.line1 || 'Not set'}</DescriptionItem>
        {organization.address?.line2 && (
          <DescriptionItem label="Address Line 2">{organization.address.line2}</DescriptionItem>
        )}
        <DescriptionItem label="City">{organization.address?.city || 'Not set'}</DescriptionItem>
        <DescriptionItem label="State / Region">{organization.address?.state || 'Not set'}</DescriptionItem>
        <DescriptionItem label="Postal Code">{organization.address?.postalCode || 'Not set'}</DescriptionItem>
        <DescriptionItem label="Country">{organization.address?.country || 'Not set'}</DescriptionItem>
      </ShadcnDescriptions>
      </div>

      <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
        <h3 className="text-sm font-medium mb-2 md:mb-4">Tax & Compliance</h3>
        <ShadcnDescriptions>
        <DescriptionItem label="VAT Number">{organization.tax?.vatNumber || 'Not set'}</DescriptionItem>
        <DescriptionItem label="TIN">{organization.tax?.tin || 'Not set'}</DescriptionItem>
        <DescriptionItem label="Ghana Card PIN">{organization.tax?.ghanaCardPin || 'Not set'}</DescriptionItem>
        <DescriptionItem label="Tax on sales">{organization.tax?.enabled ? 'Enabled' : 'Off'}</DescriptionItem>
        {organization.tax?.enabled && (
          <>
            <DescriptionItem label="Default rate">
              {parseFloat(organization.tax?.defaultRatePercent || 0).toFixed(2)}%
            </DescriptionItem>
            <DescriptionItem label="Prices">
              {organization.tax?.pricesAreTaxInclusive ? 'Tax-inclusive' : 'Tax-exclusive'}
            </DescriptionItem>
            <DescriptionItem label="Document label">{organization.tax?.displayLabel || 'Tax'}</DescriptionItem>
          </>
        )}
        <DescriptionItem label="Other charges">
          {organization.tax?.otherCharges?.enabled
            ? `${organization.tax?.otherCharges?.label || 'Transaction charge'} (${parseFloat(organization.tax?.otherCharges?.ratePercent || 0).toFixed(2)}%)`
            : 'Off'}
        </DescriptionItem>
        {organization.tax?.otherCharges?.enabled && (
          <DescriptionItem label="Who bears charge">
            {organization.tax?.otherCharges?.customerBears ? 'Customer' : 'Business'}
          </DescriptionItem>
        )}
      </ShadcnDescriptions>
      </div>

      <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6">
        <h3 className="text-sm font-medium mb-2 md:mb-4">Invoice & Quote Footer</h3>
        {organization.invoiceFooter ? (
        <p className="whitespace-pre-line">{organization.invoiceFooter}</p>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">Not set</p>
          {canManageOrganization && (
            <Button
              variant="link"
              size="sm"
              onClick={startOrganizationEdit}
            >
              Add Invoice & Quote Footer
            </Button>
          )}
        </div>
      )}
      </div>

      <div className="border-t border-border pt-4 mt-4 md:pt-6 md:mt-6 md:-mx-6 md:px-6">
        <h3 className="text-sm font-medium mb-2 md:mb-4">Business</h3>
        <div className="space-y-3 md:space-y-4">
        <div>
          <Label className="text-sm font-medium text-muted-foreground">Business Type</Label>
          <div className="mt-2">
            <div className="text-base font-semibold">{workspaceTypeDisplay}</div>
            <p className="text-sm text-muted-foreground mt-1">{workspaceDescription}</p>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Business Actions</h3>
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              onClick={handleAddAnotherBranch}
              className="w-full sm:w-auto"
            >
              {addAnotherWorkspaceLabel}
            </Button>
            {(organization.supportEmail || organization.email) && (
              <Button
                variant="outline"
                onClick={() => {
                  const email = organization.supportEmail || organization.email;
                  window.open(`mailto:${email}?subject=Business Inquiry`, '_blank');
                }}
                className="w-full sm:w-auto"
              >
                Contact support
              </Button>
            )}
          </div>
        </div>
      </div>
      </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {organizationTab}
      {canManageOrganization && typeof hasFeature === 'function' && hasFeature('crm') ? (
        <OrganizationReviewShareSection
          tenantSlug={activeTenant?.slug}
          organizationName={organizationRecord?.name || activeTenant?.name}
        />
      ) : null}
      <FilePreview
        open={organizationLogoPreviewVisible}
        onClose={() => setOrganizationLogoPreviewVisible(false)}
        file={organizationLogoPreview || organization?.logoUrl ? {
          fileUrl: organizationLogoPreview || organization?.logoUrl,
          title: 'Organization Logo',
          type: 'image',
          metadata: {
            mimeType: (organizationLogoPreview || organization?.logoUrl)?.startsWith('data:')
              ? (organizationLogoPreview || organization?.logoUrl).match(/data:([^;]+)/)?.[1] || 'image/jpeg'
              : 'image/jpeg',
          },
        } : null}
      />
    </div>
  );
};

export default SettingsOrganizationSection;
