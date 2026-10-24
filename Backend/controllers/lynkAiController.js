/**
 * Lynk AI inside ABS (services/lynkAi.js): the owner's or manager's button opens a Lynk AI session (the page with
 * tabs, or Ask in the side panel); Lynk's signed questions are answered from ABS's own numbers (services/lynkAsk.js),
 * only for sessions ABS opened, as that person, in the shop they had open.
 */
const { LynkAiSession, Tenant } = require('../models');
const { startAiSession } = require('../services/lynkAi');
const { answerQuestion, AskError } = require('../services/lynkAsk');
const { verifyLynkSignature, lynkConfigured } = require('../services/lynkImport');

const pageFrom = (raw) => {
  if (!raw || typeof raw !== 'object' || typeof raw.path !== 'string' || !raw.path.startsWith('/')) return null;
  const record = raw.record && typeof raw.record.type === 'string' && typeof raw.record.id === 'string'
    ? { type: raw.record.type.slice(0, 40), id: raw.record.id.slice(0, 120) }
    : null;
  return { path: raw.path.slice(0, 300), ...(typeof raw.title === 'string' && raw.title.trim() ? { title: raw.title.trim().slice(0, 200) } : {}), ...(record ? { record } : {}) };
};

// @desc    Open Lynk AI for the signed-in owner or manager: Lynk's screen address, to show inside ABS
// @route   POST /api/lynk/session
// @access  Private (admin, manager)
exports.startLynkAi = async (req, res, next) => {
  try {
    if (!lynkConfigured()) return res.status(503).json({ success: false, message: 'Lynk AI isn\'t set up yet.' });
    const tenant = req.tenant || await Tenant.findByPk(req.tenantId, { attributes: ['id', 'name', 'businessType', 'metadata'] });
    const client = req.body?.client === 'app' ? 'app' : 'web';
    const lynk = await startAiSession({
      tenant,
      user: req.user,
      role: req.tenantRole || null,
      client,
      screen: req.body?.screen === 'panel' ? 'panel' : 'full',
      tab: typeof req.body?.tab === 'string' ? req.body.tab : 'ask',
      page: pageFrom(req.body?.page),
    });
    await LynkAiSession.create({
      tenantId: req.tenantId,
      lynkSessionId: String(lynk.id),
      userId: req.user.id,
      shopId: req.shopFilterId || null,
      studioLocationId: req.studioLocationFilterId || null,
      client,
    });
    res.status(201).json({ success: true, sessionId: lynk.id, screenUrl: lynk.screen_url, tabs: lynk.tabs || [] });
  } catch (error) {
    if (error.statusCode === 402 || error.statusCode === 502) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
};

// @desc    Lynk AI asks about the business (summary, money owed, stock, customers, a record…): ABS's own numbers
// @route   POST /api/webhooks/lynk/ask
// @access  Lynk (signed)
exports.lynkAsk = async (req, res) => {
  if (!verifyLynkSignature(req.rawBody, req.headers['x-lynk-signature'])) {
    return res.status(401).json({ error: 'Not signed by Lynk' });
  }
  try {
    const sessionId = req.body?.session_id ? String(req.body.session_id) : '';
    const session = sessionId ? await LynkAiSession.findOne({ where: { lynkSessionId: sessionId } }) : null;
    // Only sessions ABS opened, for the same business and person.
    if (!session || session.tenantId !== String(req.body?.user?.id || '') || session.userId !== String(req.body?.member?.id || '')) {
      return res.status(404).json({ error: 'Unknown session' });
    }
    const answer = await answerQuestion(
      { tenantId: session.tenantId, userId: session.userId, shopId: session.shopId, studioLocationId: session.studioLocationId, client: session.client },
      req.body?.question || {},
    );
    res.status(200).json({ answer });
  } catch (error) {
    if (error instanceof AskError) return res.status(error.status || 400).json({ error: error.message });
    console.error('[lynk-ask]', req.body?.question?.kind, error);
    res.status(500).json({ error: 'ABS couldn\'t answer that just now' });
  }
};
