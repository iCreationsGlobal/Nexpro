export default function TaskCalendarFields({ value = {}, onChange }) {
  const localValue = value.startAt && Number.isFinite(Date.parse(value.startAt))
    ? new Date(Date.parse(value.startAt) - new Date(value.startAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return <fieldset className="space-y-2 rounded-lg border p-3 md:col-span-2">
    <label className="flex gap-2 items-center"><input type="checkbox" checked={value.enabled === true} onChange={e => onChange({ ...value, enabled: e.target.checked, reminderMinutes: value.reminderMinutes ?? 10 })} />Google Calendar reminder</label>
    {value.enabled && <>
      <label className="block text-sm">Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        <input type="datetime-local" className="block w-full rounded border bg-background p-2" value={localValue} onChange={e => onChange({ ...value, startAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
      </label>
      <label className="block text-sm">Remind me
        <select className="block w-full rounded border bg-background p-2" value={value.reminderMinutes ?? 10} onChange={e => onChange({ ...value, reminderMinutes: Number(e.target.value) })}>
          {[0, 5, 10, 15, 30, 60, 1440].map(n => <option key={n} value={n}>{n === 0 ? 'At start time' : n === 1440 ? '1 day before' : `${n} minutes before`}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Syncs to the assignee’s connected calendar. Connect a calendar in task integrations or notification settings. Changes usually sync within a few minutes.</p>
    </>}
  </fieldset>;
}
