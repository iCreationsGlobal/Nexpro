import React, { useState } from 'react';
import { Text, Pressable, Alert, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { calendarService } from '@/services/calendarService';
import { useAuth } from '@/context/AuthContext';
import { ScreenShell } from '@/components/ScreenShell';
import { useScreenColors } from '@/hooks/useScreenColors';

export default function CalendarSettings() {
  const { activeTenantId, user } = useAuth();
  const { textColor, mutedColor, colors, borderColor } = useScreenColors();
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['google-calendar', activeTenantId, user?.id], queryFn: calendarService.status, enabled: !!activeTenantId, retry: false, staleTime: 0 });
  const status = query.data;
  const calendars = useQuery({ queryKey: ['google-calendars', activeTenantId, user?.id, status?.connected], queryFn: calendarService.calendars, enabled: status?.connected === true, retry: false });
  useFocusEffect(React.useCallback(() => { void query.refetch(); }, [query.refetch]));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await query.refetch(); }
    catch (e: any) { Alert.alert('Calendar', e?.response?.data?.message || 'Could not complete this action. Try again.'); }
    finally { setBusy(false); }
  };
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={{ padding: 14, borderWidth: 1, borderColor, borderRadius: 10, marginVertical: 5, opacity: busy ? 0.5 : 1 }}><Text style={{ color: colors.tint, fontWeight: '600' }}>{label}</Text></Pressable>;
  return <ScreenShell scrollable>
    <Stack.Screen options={{ title: 'Google Calendar' }} />
    <Text style={{ color: textColor, fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Google Calendar</Text>
    <Text style={{ color: mutedColor, marginBottom: 16 }}>Sync reminders for tasks assigned to you in this workspace. Enable Google Calendar notifications on your phone to receive alerts.</Text>
    {query.isLoading ? <Text style={{ color: textColor }}>Checking connection…</Text> : query.isError ? <Text style={{ color: textColor }}>Could not check the connection. Try refreshing.</Text> : !status?.configured ? <Text style={{ color: textColor }}>Your administrator needs to configure Google Calendar first.</Text> : <>
      <Text style={{ color: textColor }}>{status.enabled ? `Sync enabled · ${status.calendarName}` : status.connected ? 'Choose a calendar to enable task sync' : 'Not connected'}</Text>
      {!status.connected && button('Connect Google Calendar', () => run(async () => { const { url } = await calendarService.connect(); await WebBrowser.openBrowserAsync(url); }))}
      {status.connected && !status.enabled && <View>
        {calendars.isLoading && <Text style={{ color: mutedColor }}>Loading calendars…</Text>}
        {calendars.isError && button('Retry calendar list', () => { void calendars.refetch(); })}
        {(calendars.data || []).map((calendar: { id: string; name: string }) => <View key={calendar.id}>{button(`Use ${calendar.name}`, () => run(() => calendarService.select(calendar.id)))}</View>)}
      </View>}
      {status.enabled && button('Sync now / retry', () => run(calendarService.sync))}
      {status.connected && button('Disconnect', () => Alert.alert('Disconnect Google Calendar?', 'Existing events remain in Google Calendar and will stop updating.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: () => run(calendarService.disconnect) }]))}
      {status.lastSyncedAt && <Text style={{ color: mutedColor }}>Last attempt: {new Date(status.lastSyncedAt).toLocaleString()}</Text>}
      {!!status.lastError && <Text style={{ color: textColor }}>{status.lastError}</Text>}
      {status.enabled && <Text style={{ color: mutedColor }}>{(status.tasks || []).filter((t: any) => t.status === 'synced').length} synced · {(status.tasks || []).filter((t: any) => t.status === 'error').length} need retry</Text>}
    </>}
    {button(busy ? 'Working…' : 'Refresh connection', () => { void query.refetch(); if (status?.connected) void calendars.refetch(); })}
  </ScreenShell>;
}
