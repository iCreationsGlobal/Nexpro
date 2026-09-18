const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Connection = require('../models/CalendarConnection');
const Link = require('../models/CalendarTaskLink');
const { UserTask, UserTenant } = require('../models');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');
const { eventForTask, fingerprint, eventId } = require('../utils/calendarTask');
const KEY = 'GOOGLE_CALENDAR_ENCRYPTION_KEY';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const configured = () => Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_REDIRECT_URI && /^[a-f0-9]{64}$/i.test(process.env[KEY] || ''));
function requireConfiguration() {
  if (!configured()) throw Object.assign(new Error('Google Calendar is not configured by your administrator yet'), { statusCode: 503 });
}
const oauth = () => new OAuth2Client(process.env.GOOGLE_CALENDAR_CLIENT_ID, process.env.GOOGLE_CALENDAR_CLIENT_SECRET, process.env.GOOGLE_CALENDAR_REDIRECT_URI);
const encrypt = value => { requireConfiguration(); return encryptSecret(JSON.stringify(value), KEY); };
const decrypt = value => JSON.parse(decryptSecret(value, KEY));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const publicStatus = connection => ({
  configured: configured(), connected: Boolean(connection?.tokens), enabled: Boolean(connection?.enabled),
  calendarId: connection?.calendarId || '', calendarName: connection?.calendarName || '',
  lastSyncedAt: connection?.lastSyncedAt || null, lastError: connection?.lastError || null,
});
async function withConnection(id, action) {
  return sequelize.transaction(async transaction => {
    const [rows] = await sequelize.query('SELECT pg_try_advisory_xact_lock(hashtext(:id)) AS locked', { replacements: { id: `calendar:${id}` }, transaction });
    if (!rows[0].locked) throw Object.assign(new Error('Calendar sync is already running. Try again shortly.'), { statusCode: 409 });
    const connection = await Connection.findByPk(id, { transaction });
    if (!connection) throw Object.assign(new Error('Calendar connection not found'), { statusCode: 404 });
    return action(connection, transaction);
  });
}
async function authClient(connection, transaction) {
  requireConfiguration();
  const client = oauth();
  const tokens = decrypt(connection.tokens);
  client.setCredentials(tokens);
  // Explicitly persist refresh results; never send tokens to either application.
  if (!tokens.access_token || !tokens.expiry_date || tokens.expiry_date < Date.now() + 60000) {
    const { credentials } = await client.refreshAccessToken();
    const merged = { ...tokens, ...credentials, refresh_token: credentials.refresh_token || tokens.refresh_token };
    client.setCredentials(merged);
    await connection.update({ tokens: encrypt(merged) }, { transaction });
  }
  return client;
}
async function request(client, path, method = 'GET', data) {
  return (await client.request({ url: `https://www.googleapis.com/calendar/v3/${path}`, method, data, timeout: 15000, retry: false })).data;
}
async function authorize(tenantId, userId) {
  requireConfiguration();
  const [connection] = await Connection.findOrCreate({ where: { tenantId, userId } });
  return withConnection(connection.id, async (row, transaction) => {
    const state = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(48).toString('base64url');
    await row.update({ stateHash: hash(state), stateExpiresAt: new Date(Date.now() + 10 * 60000), verifier: encrypt(verifier) }, { transaction });
    return oauth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  });
}
async function callback(code, state) {
  requireConfiguration();
  if (typeof code !== 'string' || typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) throw new Error('Invalid authorization response');
  const row = await Connection.findOne({ where: { stateHash: hash(state), stateExpiresAt: { [Op.gt]: new Date() } } });
  if (!row) throw new Error('Authorization expired. Connect again from ABS.');
  await withConnection(row.id, async (connection, transaction) => {
    if (connection.stateHash !== hash(state) || connection.stateExpiresAt <= new Date()) throw new Error('Authorization expired');
    const membership = await UserTenant.findOne({ where: { tenantId: row.tenantId, userId: row.userId, status: 'active' }, transaction });
    if (!membership) throw new Error('Workspace access is no longer active');
    const { tokens } = await oauth().getToken({ code, codeVerifier: decrypt(connection.verifier) });
    if (!tokens.refresh_token || !SCOPES.every(scope => String(tokens.scope || '').split(' ').includes(scope))) throw new Error('Please grant calendar access and try again');
    // Changing Google accounts must never reuse links belonging to a previous account.
    await Link.destroy({ where: { connectionId: connection.id }, transaction });
    await connection.update({ tokens: encrypt(tokens), enabled: false, calendarId: null, calendarName: null, stateHash: null, stateExpiresAt: null, verifier: null, lastError: null }, { transaction });
  });
}
async function calendars(connection) {
  return withConnection(connection.id, async (row, transaction) => {
    const client = await authClient(row, transaction);
    let pageToken; const items = [];
    do {
      const result = await request(client, `users/me/calendarList?minAccessRole=writer${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      items.push(...(result.items || []).map(c => ({ id: c.id, name: c.summary, primary: Boolean(c.primary) })));
      pageToken = result.nextPageToken;
    } while (pageToken);
    return items;
  });
}
async function select(connection, calendarId) {
  return withConnection(connection.id, async (row, transaction) => {
    if (row.enabled && row.calendarId !== calendarId) throw Object.assign(new Error('Disconnect before choosing a different calendar. Existing events will stay in the old calendar.'), { statusCode: 400 });
    const client = await authClient(row, transaction);
    const calendar = await request(client, `users/me/calendarList/${encodeURIComponent(calendarId)}`);
    if (!['owner', 'writer'].includes(calendar.accessRole)) throw Object.assign(new Error('Choose a writable calendar'), { statusCode: 400 });
    await row.update({ enabled: true, calendarId, calendarName: calendar.summary, lastError: null }, { transaction });
    return publicStatus(row);
  });
}
async function disconnect(connection) {
  return withConnection(connection.id, async (row, transaction) => {
    // Disconnect is local to this workspace; Google revocation would affect other workspace grants.
    await Link.destroy({ where: { connectionId: row.id }, transaction });
    await row.update({ tokens: null, enabled: false, calendarId: null, calendarName: null, stateHash: null, verifier: null, stateExpiresAt: null, lastError: null }, { transaction });
  });
}
async function sync(id) {
  return withConnection(id, async (connection, transaction) => {
    if (!connection.enabled || !connection.tokens || !connection.calendarId) return;
    const membership = await UserTenant.findOne({ where: { tenantId: connection.tenantId, userId: connection.userId, status: 'active' }, transaction });
    if (!membership) {
      await connection.update({ enabled: false, tokens: null, lastError: 'Workspace access ended. Reconnect if access is restored.' }, { transaction }); return;
    }
    let failed = false;
    try {
      const client = await authClient(connection, transaction);
      const base = `calendars/${encodeURIComponent(connection.calendarId)}/events`;
      const relevant = task => task && task.tenantId === connection.tenantId && (task.assigneeId || task.userId) === connection.userId && task.metadata?.calendar?.enabled === true;
      // Reconcile links first: deletion, reassignment, or disabling sync removes the old event.
      const links = await Link.findAll({ where: { connectionId: id }, transaction });
      for (const link of links) {
        const task = await UserTask.findByPk(link.taskId, { transaction });
        if (relevant(task) || link.status === 'removed') continue;
        try {
          await request(client, `${base}/${link.eventId}`, 'DELETE');
          await link.update({ status: 'removed', fingerprint: null, lastError: null }, { transaction });
        } catch (error) {
          if ([404, 410].includes(error.response?.status)) await link.update({ status: 'removed', fingerprint: null, lastError: null }, { transaction });
          else { failed = true; await link.update({ status: 'error', lastError: 'Event removal failed; retry sync.' }, { transaction }); }
        }
      }
      let after;
      while (true) {
        const tasks = await UserTask.findAll({ where: {
          tenantId: connection.tenantId,
          [Op.or]: [{ assigneeId: connection.userId }, { assigneeId: null, userId: connection.userId }],
          ...(after ? { id: { [Op.gt]: after } } : {}),
        }, order: [['id', 'ASC']], limit: 100, transaction });
        if (!tasks.length) break;
        for (const task of tasks) {
          if (!relevant(task)) continue;
          const [link] = await Link.findOrCreate({ where: { connectionId: id, taskId: task.id }, defaults: { eventId: eventId(id, task.id) }, transaction });
          try {
            if (link.status === 'removed') {
              await link.update({ eventId: eventId(link.eventId, task.id), status: 'pending', fingerprint: null }, { transaction });
            }
            const body = eventForTask(task); const digest = fingerprint(body);
            if (link.fingerprint === digest && link.status === 'synced') continue;
            // Deterministic IDs make a retry after an ambiguous network response idempotent.
            try { await request(client, `${base}/${link.eventId}`, 'PUT', body); }
            catch (error) {
              if (![404, 410].includes(error.response?.status)) throw error;
              if (error.response?.status === 410) {
                await link.update({ eventId: eventId(link.eventId, task.id), status: 'pending' }, { transaction });
              }
              try { await request(client, base, 'POST', { ...body, id: link.eventId }); }
              catch (insertError) {
                if (insertError.response?.status !== 409) throw insertError;
                await request(client, `${base}/${link.eventId}`, 'PUT', body);
              }
            }
            await link.update({ fingerprint: digest, status: 'synced', lastError: null }, { transaction });
          } catch (_) {
            failed = true;
            await link.update({ status: 'error', lastError: 'Calendar update failed. Check your connection and retry.' }, { transaction });
          }
        }
        after = tasks[tasks.length - 1].id;
      }
      await connection.update({ lastSyncedAt: new Date(), lastError: failed ? 'Some tasks could not sync. Retry sync.' : null }, { transaction });
    } catch (_) {
      await connection.update({ lastSyncedAt: new Date(), lastError: 'Calendar sync failed. Retry or reconnect Google Calendar.' }, { transaction });
    }
    return publicStatus(connection);
  });
}
let running = false;
async function runBatch() {
  if (!configured() || running) return;
  running = true;
  try {
    const connections = await Connection.findAll({ where: { enabled: true }, order: [['lastSyncedAt', 'ASC NULLS FIRST']], limit: 10 });
    for (const row of connections) { try { await sync(row.id); } catch (_) { /* Another worker owns this connection; next tick retries. */ } }
  } finally { running = false; }
}
let timer;
function start() {
  if (!configured() || timer) return;
  timer = setInterval(() => { void runBatch().catch(() => console.warn('[Calendar] Background sync failed; will retry.')); }, 60000);
  timer.unref();
}
module.exports = { configured, publicStatus, authorize, callback, calendars, select, disconnect, sync, runBatch, start };
