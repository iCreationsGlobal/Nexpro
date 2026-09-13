import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSettingsRental } from '../../../hooks/useSettingsRental';

/**
 * Rental workspace defaults — late fees, grace period, deposits, and pre-booking policy.
 */
const SettingsRentalSection = () => {
  const {
    canManageOrganization,
    isRentalTenant,
    loadingRentalSettings,
    rentalSettings,
    rentalSettingsEditing,
    rentalDraft,
    updateRentalSettingsMutation,
    handleRentalDraftChange,
    handleSaveRentalSettings,
    startRentalEdit,
    cancelRentalEdit,
  } = useSettingsRental();

  if (!isRentalTenant) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert>
            <AlertTitle>Not available</AlertTitle>
            <AlertDescription>
              Rental settings are only available for rental workspaces.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!canManageOrganization) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              You need admin or manager permissions to change rental settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const renderReadOnlyValue = (label, value, hint) => (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-foreground mt-1">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="border border-gray-200">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base md:text-lg">Late returns</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                What a rental day means, late fees, deposits, and pre-booking defaults.
              </CardDescription>
            </div>
            {!loadingRentalSettings && !rentalSettingsEditing && (
              <Button
                type="button"
                variant="secondaryStroke"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
                onClick={startRentalEdit}
              >
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingRentalSettings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading rental settings...
            </div>
          ) : rentalSettingsEditing ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>What a rental day means</Label>
                <RadioGroup
                  value={rentalDraft.dayBillingMode === 'overnight' ? 'overnight' : 'end_of_day'}
                  onValueChange={(value) => handleRentalDraftChange({ dayBillingMode: value })}
                  className="grid gap-2"
                >
                  <label
                    htmlFor="day-billing-end-of-day"
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
                  >
                    <RadioGroupItem id="day-billing-end-of-day" value="end_of_day" className="mt-0.5" />
                    <div className="space-y-1 leading-none">
                      <p className="text-sm font-medium text-foreground">End of day (cars)</p>
                      <p className="text-xs text-muted-foreground">
                        1 day = pick up and return on the same date.
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="day-billing-overnight"
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
                  >
                    <RadioGroupItem id="day-billing-overnight" value="overnight" className="mt-0.5" />
                    <div className="space-y-1 leading-none">
                      <p className="text-sm font-medium text-foreground">Overnight (equipment)</p>
                      <p className="text-xs text-muted-foreground">
                        1 day = pick up today, return tomorrow.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lateChargeRatePercent">Late charge rate (% of daily rate)</Label>
                  <Input
                    id="lateChargeRatePercent"
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    value={rentalDraft.lateChargeRatePercent}
                    onChange={(e) => handleRentalDraftChange({ lateChargeRatePercent: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Applied per day after the grace period. Default is 50%.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gracePeriodValue">Grace period</Label>
                  <div className="flex gap-2">
                    <Input
                      id="gracePeriodValue"
                      type="number"
                      min="0"
                      step="1"
                      value={rentalDraft.gracePeriodValue}
                      onChange={(e) => handleRentalDraftChange({ gracePeriodValue: e.target.value })}
                    />
                    <Select
                      value={rentalDraft.gracePeriodUnit}
                      onValueChange={(value) => handleRentalDraftChange({ gracePeriodUnit: value })}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No late fee is charged until this period after the rental end date.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="defaultDepositPercent">Default deposit % (optional)</Label>
                  <Input
                    id="defaultDepositPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={rentalDraft.defaultDepositPercent}
                    onChange={(e) => handleRentalDraftChange({ defaultDepositPercent: e.target.value })}
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultDepositAmount">Default deposit amount (optional)</Label>
                  <Input
                    id="defaultDepositAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rentalDraft.defaultDepositAmount}
                    onChange={(e) => handleRentalDraftChange({ defaultDepositAmount: e.target.value })}
                    placeholder="Fixed amount"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preBookingExpiryDays">Pre-booking expiry days (optional)</Label>
                <Input
                  id="preBookingExpiryDays"
                  type="number"
                  min="1"
                  step="1"
                  value={rentalDraft.preBookingExpiryDays}
                  onChange={(e) => handleRentalDraftChange({ preBookingExpiryDays: e.target.value })}
                  placeholder="Days before an unconverted pre-booking expires"
                />
              </div>

              <div className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-base">Require ID verification (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Flag new rentals when customer ID has not been verified.
                  </p>
                </div>
                <Switch
                  checked={rentalDraft.requireIdVerification === true}
                  onCheckedChange={(checked) => handleRentalDraftChange({ requireIdVerification: checked })}
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelRentalEdit}
                  disabled={updateRentalSettingsMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveRentalSettings}
                  disabled={updateRentalSettingsMutation.isPending}
                >
                  {updateRentalSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save changes'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {renderReadOnlyValue(
                'What a rental day means',
                rentalSettings.dayBillingMode === 'overnight'
                  ? 'Overnight (equipment)'
                  : 'End of day (cars)',
                rentalSettings.dayBillingMode === 'overnight'
                  ? '1 day = pick up today, return tomorrow.'
                  : '1 day = pick up and return on the same date.'
              )}
              {renderReadOnlyValue(
                'Late charge rate',
                `${rentalSettings.lateChargeRatePercent ?? 50}% of daily rate`,
                'Used when processing returns after the grace period.'
              )}
              {renderReadOnlyValue(
                'Grace period',
                `${rentalSettings.gracePeriodValue ?? 0} ${rentalSettings.gracePeriodUnit === 'days' ? 'days' : 'hours'}`,
                'Late fees start after this buffer past the rental end date.'
              )}
              {renderReadOnlyValue(
                'Default deposit',
                rentalSettings.defaultDepositPercent != null
                  ? `${rentalSettings.defaultDepositPercent}%`
                  : rentalSettings.defaultDepositAmount != null
                    ? `GHS ${Number(rentalSettings.defaultDepositAmount).toFixed(2)}`
                    : 'Not set',
                'Suggested deposit for new rentals (optional).'
              )}
              {renderReadOnlyValue(
                'Pre-booking expiry',
                rentalSettings.preBookingExpiryDays != null
                  ? `${rentalSettings.preBookingExpiryDays} days`
                  : 'Not set',
                'How long unconverted pre-bookings remain valid (optional).'
              )}
              {renderReadOnlyValue(
                'Require ID verification',
                rentalSettings.requireIdVerification ? 'Yes' : 'No',
                'Whether staff should verify customer ID before hire-out.'
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsRentalSection;
