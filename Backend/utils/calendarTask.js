const crypto = require('crypto');
function normalizeCalendar(input) {
  if (!input || input.enabled === false) return { enabled: false };
  if (input.enabled !== true || typeof input.startAt !== 'string' || !/Z$|[+-]\d{2}:\d{2}$/.test(input.startAt) || !Number.isFinite(Date.parse(input.startAt))) {
    const error = new Error('Choose a valid calendar date and time'); error.statusCode = 400; throw error;
  }
  const minutes = Number(input.reminderMinutes);
  if (![0, 5, 10, 15, 30, 60, 1440].includes(minutes)) {
    const error = new Error('Choose a supported reminder time'); error.statusCode = 400; throw error;
  }
  return { enabled: true, startAt: new Date(input.startAt).toISOString(), reminderMinutes: minutes };
}
function eventForTask(task) {
  const config = normalizeCalendar(task.metadata?.calendar);
  if (!config.enabled) return null;
  const completed = task.status === 'completed';
  const base = process.env.FRONTEND_URL || '';
  const url = /^https?:\/\//.test(base) ? `${base.replace(/\/$/, '')}/tasks?taskId=${encodeURIComponent(task.id)}` : '';
  return {
    summary: `${completed ? '✓ ' : ''}${task.title}`,
    description: [task.description || '', url ? `Open in ABS: ${url}` : 'ABS task'].filter(Boolean).join('\n\n'),
    start: { dateTime: config.startAt },
    end: { dateTime: new Date(Date.parse(config.startAt) + 30 * 60000).toISOString() },
    reminders: { useDefault: false, overrides: completed ? [] : [{ method: 'popup', minutes: config.reminderMinutes }] },
    transparency: 'transparent',
    extendedProperties: { private: { absTaskId: task.id, absTenantId: task.tenantId } },
  };
}
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eventId = (connectionId, taskId) => `abs${fingerprint([connectionId, taskId]).slice(0, 48)}`;
module.exports = { normalizeCalendar, eventForTask, fingerprint, eventId };
