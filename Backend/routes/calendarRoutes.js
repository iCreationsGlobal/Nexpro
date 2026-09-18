const express = require('express');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const Connection = require('../models/CalendarConnection');
const Link = require('../models/CalendarTaskLink');
const { UserTenant } = require('../models');
const service = require('../services/googleCalendarService');
const router = express.Router();
const action = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    // Google request errors can contain credentials. Never pass those to the generic logger.
    if (error.response || error.config) return res.status(502).json({ success: false, message: 'Google Calendar could not complete this request. Retry or reconnect.' });
    next(error);
  }
};
router.get('/callback', async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    await service.callback(req.query.code, req.query.state);
    res.type('html').send('<!doctype html><title>Google Calendar connected</title><h1>Google Calendar connected</h1><p>Return to ABS, refresh the connection, and choose your calendar to enable task reminders. You can close this tab.</p>');
  } catch (_) {
    res.status(400).type('html').send('<!doctype html><title>Calendar connection unsuccessful</title><h1>Calendar connection unsuccessful</h1><p>Return to ABS and try connecting again. Please grant both calendar permissions.</p>');
  }
});
router.post('/sync-worker', action(async (req, res) => {
  const expected = process.env.GOOGLE_CALENDAR_SYNC_SECRET;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.sendStatus(401);
  await service.runBatch(); res.json({ success: true });
}));
router.use(protect, tenantContext);
router.use(async (req, res, next) => {
  try {
    const member = req.tenantId && await UserTenant.findOne({ where: { userId: req.user.id, tenantId: req.tenantId, status: 'active' } });
    if (!member) return res.status(403).json({ success: false, message: 'An active workspace membership is required.' });
    next();
  } catch (error) { next(error); }
});
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!req.tenantId || req.supportSession) return res.status(403).json({ success: false, message: 'Use your own active workspace to connect a calendar.' });
  next();
});
const connectionFor = async req => {
  const row = await Connection.findOne({ where: { userId: req.user.id, tenantId: req.tenantId } });
  if (!row?.tokens) throw Object.assign(new Error('Connect Google Calendar first'), { statusCode: 400 });
  return row;
};
router.get('/status', action(async (req, res) => {
  if (!service.configured()) return res.json({ success: true, data: service.publicStatus(null) });
  const row = await Connection.findOne({ where: { userId: req.user.id, tenantId: req.tenantId } });
  const links = row ? await Link.findAll({ where: { connectionId: row.id }, attributes: ['taskId', 'status', 'lastError'] }) : [];
  res.json({ success: true, data: { ...service.publicStatus(row), tasks: links } });
}));
router.post('/connect', action(async (req, res) => res.json({ success: true, data: { url: await service.authorize(req.tenantId, req.user.id) } })));
router.get('/calendars', action(async (req, res) => res.json({ success: true, data: await service.calendars(await connectionFor(req)) })));
router.put('/selection', action(async (req, res) => {
  if (typeof req.body.calendarId !== 'string' || !req.body.calendarId || req.body.calendarId.length > 1024) return res.status(400).json({ success: false, message: 'Select a calendar' });
  res.json({ success: true, data: await service.select(await connectionFor(req), req.body.calendarId) });
}));
router.post('/sync', action(async (req, res) => res.json({ success: true, data: await service.sync((await connectionFor(req)).id) })));
router.delete('/connection', action(async (req, res) => { await service.disconnect(await connectionFor(req)); res.json({ success: true }); }));
module.exports = router;
