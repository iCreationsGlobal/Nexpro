# ABS Google Calendar task reminders

## Setup

1. In Google Cloud, enable Google Calendar API and create a **Web application** OAuth client. Configure the consent screen for the intended audience. During Google's testing mode, only listed test users can authorize; Google may expire testing-mode refresh tokens. Production consent/verification requirements must be completed in Google Cloud as applicable.
2. Register the backend callback exactly: `https://YOUR_API_HOST/api/integrations/google-calendar/callback` (use the corresponding localhost backend URL for local testing).
3. Configure these backend environment variables securely:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `GOOGLE_CALENDAR_REDIRECT_URI` (the exact callback above)
   - `GOOGLE_CALENDAR_ENCRYPTION_KEY` (64 hexadecimal characters, generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; keep stable and back it up securely)
   - `FRONTEND_URL` (ABS web origin, used for links back to tasks)
   - `GOOGLE_CALENDAR_SYNC_SECRET` (random bearer secret, required only for an external worker trigger)
4. Run the normal backend migration command after reviewing the additive `create-calendar-integration.js` migration. It adds `calendar_connections` and `calendar_task_links` only. Do not sync models with `alter`.
5. Restart the backend. A persistent Node server runs a sync batch every minute. On serverless hosting, configure an authenticated scheduler to **POST** `/api/integrations/google-calendar/sync-worker` with `Authorization: Bearer <GOOGLE_CALENDAR_SYNC_SECRET>` every minute. Use a worker runtime long enough for the workspace workload; batches process up to ten connections, one at a time. Manual “Sync now” also works.
6. Web: Tasks → Google Calendar integration, or Settings → Notifications. Mobile: Settings → Google Calendar. Connect, grant access in Google's browser page, return to ABS, refresh, and choose a writable calendar. Selecting it explicitly enables sync for tasks assigned to that user in that workspace.

No OAuth credentials were configured, migrations executed, or real calendar events created during implementation.

## Behavior

- One-way ABS → Google Calendar. Changes made in Google Calendar do not edit ABS tasks.
- A task opts in with a date/time and reminder (0, 5, 10, 15, 30, 60 minutes, or one day). Calendar slots are 30 minutes and do not block availability.
- Dates entered on a device use its local timezone and are saved as UTC instants. A task's existing due date is separate from its calendar appointment time.
- Assignee's connected calendar receives the event. For unassigned tasks, the creator's calendar is used. Private task data is never copied to a different user's connection.
- Google Calendar/device notifications must be enabled to receive reminders. These are calendar reminders, not Google Meet calls or native ABS push notifications.
- Completed tasks keep their event with a checkmark and no reminder. Deleting a task, disabling its calendar reminder, or reassigning it removes the old linked event on the next successful sync.
- Sync state and retry are visible in integration settings. A disconnected assignee has no event until they connect and enable sync. Task saves do not wait for Google.
- Disconnect stops sync and discards local credentials; existing Google events stay. Remove those manually if unwanted. It does not globally revoke Google permissions because another ABS workspace may use the same grant. Users can revoke the app globally in Google Account permissions.
- Reconnecting or changing Google accounts requires selecting the calendar again. Existing events from the earlier connection remain as described by disconnect.

## Reliability and security

OAuth state is random, hashed, expires after ten minutes, and is bound to a tenant/user connection. PKCE verifier and tokens are encrypted using AES-256-GCM. Scope is limited to event management plus reading the calendar list. API responses never expose tokens. All user endpoints enforce active tenant membership. Sync rechecks membership and stops when access ends.

A durable link table retains deletion work after a task is removed. Per-connection PostgreSQL advisory transaction locks prevent overlapping workers or connection changes. Event IDs are deterministic to recover from ambiguous network results without duplicate creation. Failed syncs retain retry state; never log Google request objects containing credentials.

Very large connected task sets may require moving reconciliation into a dedicated queue worker. No production latency or Google end-to-end validation has been performed yet.

## Official references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/concepts/reminders

## Implementation validation

- 11 backend unit tests cover timezone/reminder validation, completed-task reminders, duplicate prevention on ambiguous responses, retained deletion retries, reassignment, membership removal, encrypted OAuth state/PKCE storage, expired callback rejection, safe status output, encryption configuration, and re-enabling removed reminders.
- ABS web production build passed; the final changed JSX also passed compilation after the task deep-link form hydration adjustment.
- Mobile typechecking reports no diagnostics in the new calendar files. Existing unrelated project diagnostics remain.
- No Google consent or reminder delivery has been tested against a real account. Before rollout, validate both web and mobile connection flows, task create/edit/complete/delete, reassignment, offline retries, and notification delivery with a test Google account.
- iOS JavaScript export passed to `/tmp/abs-calendar-export`; final mobile TSX syntax checks also passed.
