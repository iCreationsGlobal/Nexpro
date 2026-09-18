import GoogleCalendarSettings from '../../tasks/GoogleCalendarSettings';
import { Bell, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  NOTIFICATION_PREFERENCE_CATEGORY_ORDER,
  NOTIFICATION_PREFERENCE_CATEGORY_LABELS,
  NOTIFICATION_PREFERENCE_LOCKED_CHANNELS,
} from '../../../constants';
import { useSettingsNotifications } from '../../../hooks/useSettingsNotifications';

/**
 * Staff in-app and email notification preferences.
 */
const SettingsNotificationsSection = () => {
  const {
    user,
    loadingProfile,
    notificationPrefsDraft,
    updateNotificationPrefsMutation,
    setNotifChannel,
    resetNotificationPrefs,
    saveNotificationPrefs,
  } = useSettingsNotifications();

  return (
    <>
    <GoogleCalendarSettings />
    <Card className="border border-gray-200">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <CardTitle className="text-base md:text-2xl flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground shrink-0" />
              Notifications
            </CardTitle>
            <CardDescription className="mt-1 md:mt-0 text-xs md:text-sm">
              Choose what appears in the notification bell and whether to also get a copy by email at{' '}
              <span className="font-medium text-foreground">{user?.email || 'your account email'}</span>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button
              variant="secondaryStroke"
              type="button"
              disabled={loadingProfile || !notificationPrefsDraft}
              onClick={resetNotificationPrefs}
            >
              Reset
            </Button>
            <Button
              type="button"
              disabled={loadingProfile || !notificationPrefsDraft || updateNotificationPrefsMutation.isPending}
              onClick={saveNotificationPrefs}
            >
              {updateNotificationPrefsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Save preferences'
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Security and account email</AlertTitle>
          <AlertDescription className="text-xs md:text-sm">
            Password reset, email verification, and workspace invitations are sent when required. They are not controlled by these toggles.
          </AlertDescription>
        </Alert>
        {loadingProfile || !notificationPrefsDraft ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Loading preferences…
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 md:gap-4 px-3 py-2 md:px-4 md:py-3 bg-muted/50 text-xs md:text-sm font-medium border-b border-border">
              <span>Category</span>
              <span className="text-center w-[72px] md:w-24">In-app</span>
              <span className="text-center w-[72px] md:w-24">Email</span>
            </div>
            {NOTIFICATION_PREFERENCE_CATEGORY_ORDER.map((key) => {
              const row = notificationPrefsDraft.categories[key];
              if (!row) return null;
              const label = NOTIFICATION_PREFERENCE_CATEGORY_LABELS[key] || key;
              return (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 md:gap-4 px-3 py-3 md:px-4 md:py-3 border-b border-border last:border-b-0 items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    {key === 'user' && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Invitation messages are always delivered.
                      </p>
                    )}
                  </div>
                  {(['in_app', 'email']).map((channel) => {
                    const lock = NOTIFICATION_PREFERENCE_LOCKED_CHANNELS[key]?.[channel];
                    if (lock === 'not_applicable') {
                      return (
                        <div
                          key={channel}
                          className="flex justify-center w-[72px] md:w-24 text-xs text-muted-foreground"
                        >
                          —
                        </div>
                      );
                    }
                    const checked = lock === 'always_on' ? true : channel === 'email' ? row.email === true : row.in_app !== false;
                    return (
                      <div key={channel} className="flex justify-center w-[72px] md:w-24">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={checked}
                            disabled={!!lock || updateNotificationPrefsMutation.isPending}
                            onCheckedChange={(v) => setNotifChannel(key, channel, v)}
                            aria-label={`${label} ${channel}`}
                          />
                          {lock === 'always_on' ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Lock className="h-3 w-3" aria-hidden />
                              Always on
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
};

export default SettingsNotificationsSection;
