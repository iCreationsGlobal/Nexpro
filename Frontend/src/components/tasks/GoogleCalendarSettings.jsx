import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { calendarService } from '../../services/calendarService';
import { Button } from '@/components/ui/button';

export default function GoogleCalendarSettings() {
  const { user, activeTenant } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState('');
  const query = useQuery({ queryKey: ['google-calendar', activeTenant?.id, user?.id], queryFn: calendarService.status, enabled: !!activeTenant?.id, staleTime: 0, retry: false });
  const status = query.data;
  const calendars = useQuery({ queryKey: ['google-calendars', activeTenant?.id, user?.id, status?.connected], queryFn: calendarService.calendars, enabled: status?.connected === true, retry: false });
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); await query.refetch(); }
    catch (e) { setError(e?.response?.data?.message || 'Calendar action failed. Try again.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3">
    <h3 className="font-semibold">Google Calendar · Integrations</h3>
    <p className="text-sm text-muted-foreground">Connect your own calendar for tasks assigned to you in this workspace. Calendar notifications must be enabled on your device.</p>
    {query.isLoading ? <p>Checking connection…</p> : query.isError ? <p role="alert">Could not check your calendar connection.</p> : !status?.configured ? <p>Your administrator needs to configure Google Calendar before connecting.</p> : <>
      <p className="text-sm">{status.enabled ? `Sync enabled · ${status.calendarName}` : status.connected ? 'Connected · choose a calendar to enable sync' : 'Not connected'}</p>
      {!status.connected && <Button disabled={busy} onClick={() => run(async () => { const { url } = await calendarService.connect(); window.location.assign(url); })}>Connect Google Calendar</Button>}
      {status.connected && <>
        {!status.enabled && <div className="flex flex-wrap gap-2">
          <select aria-label="Calendar for task reminders" className="rounded-md border bg-background p-2" value={selection} onChange={e => setSelection(e.target.value)}>
            <option value="">Choose a calendar</option>
            {(calendars.data || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button disabled={busy || !selection} onClick={() => run(() => calendarService.select(selection))}>Enable task sync</Button>
          {calendars.isError && <Button variant="outline" onClick={() => calendars.refetch()}>Retry calendar list</Button>}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !status.enabled} onClick={() => run(calendarService.sync)}>{busy ? 'Working…' : 'Sync now / retry'}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('Disconnect Google Calendar? Existing events will remain in Google Calendar and stop updating.')) run(calendarService.disconnect); }}>Disconnect</Button>
        </div>
        {status.lastSyncedAt && <p className="text-xs text-muted-foreground">Last sync attempt: {new Date(status.lastSyncedAt).toLocaleString()}</p>}
        {status.lastError && <p role="alert" className="text-sm text-destructive">{status.lastError}</p>}
        <p className="text-sm">{(status.tasks || []).filter(t => t.status === 'synced').length} synced · {(status.tasks || []).filter(t => t.status === 'error').length} need retry</p>
      </>}
    </>}
    <Button variant="outline" disabled={busy} onClick={() => { query.refetch(); if (status?.connected) calendars.refetch(); }}>Refresh connection</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
