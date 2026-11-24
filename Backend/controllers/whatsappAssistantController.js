/**
 * ABS on WhatsApp, from ABS itself: an owner or manager connects their WhatsApp, chooses their PIN and which business
 * it answers about (services/whatsappLinks.js), and the page where the PIN is entered. The chat is
 * services/whatsappAssistant.js.
 */
const { Shop, Tenant } = require('../models');
const wa = require('../services/absWhatsApp');
const links = require('../services/whatsappLinks');
const assistant = require('../services/whatsappAssistant');

const hereOf = (req) => ({ tenantId: req.tenantId, shopId: req.shopFilterId || null, studioLocationId: req.studioLocationFilterId || null });

/** Every handler below: only when it's switched on, and never for ABS staff helping a business. */
const handler = (work) => async (req, res, next) => {
  try {
    if (!wa.assistantReady()) return res.status(503).json({ success: false, message: 'ABS on WhatsApp isn\'t available yet.' });
    if (req.isSupportAccess) return res.status(403).json({ success: false, message: 'Only the business\'s own people can connect their WhatsApp.' });
    return await work(req, res);
  } catch (error) {
    if (error instanceof links.PinError) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
};

async function statusOf(req, link) {
  if (!link?.phone) return { connected: false };
  const [tenant, shop] = await Promise.all([
    Tenant.findByPk(link.tenantId, { attributes: ['id', 'name'] }),
    link.shopId ? Shop.findByPk(link.shopId, { attributes: ['id', 'name'] }) : null,
  ]);
  const here = hereOf(req);
  return {
    connected: true,
    phoneEnding: link.phone.slice(-4),
    connectedAt: link.connectedAt,
    businessName: tenant?.name || null,
    shopName: shop?.name || null,
    here: link.tenantId === here.tenantId && (link.shopId || null) === here.shopId,
    pinLocked: links.isPinLocked(link),
  };
}

// @desc    Whether ABS on WhatsApp is available, and this person's connection
// @route   GET /api/whatsapp-assistant
// @access  Private (admin, manager)
exports.getStatus = async (req, res, next) => {
  try {
    if (!wa.assistantReady() || req.isSupportAccess) return res.status(200).json({ success: true, data: { available: false, connected: false } });
    const status = await statusOf(req, await links.linkOf(req.user.id));
    return res.status(200).json({ success: true, data: { available: true, number: wa.absNumber(), chatUrl: wa.chatLink(), ...status } });
  } catch (error) {
    return next(error);
  }
};

// @desc    Choose a PIN and get the message to send from their WhatsApp
// @route   POST /api/whatsapp-assistant/connect
// @access  Private (admin, manager)
exports.connect = handler(async (req, res) => {
  const { words, expiresAt } = await links.startConnecting({ userId: req.user.id, ...hereOf(req), pin: req.body?.pin });
  res.status(201).json({ success: true, data: { words, chatUrl: wa.chatLink(words), expiresAt } });
});

const connectedLink = async (req) => {
  const link = await links.linkOf(req.user.id);
  if (!link?.phone) throw new links.PinError('Your WhatsApp isn\'t connected.', 404);
  return link;
};

// @desc    Set a new PIN
// @route   PUT /api/whatsapp-assistant/pin
// @access  Private (admin, manager)
exports.changePin = handler(async (req, res) => {
  const link = await links.changePin(await connectedLink(req), req.body?.pin);
  res.status(200).json({ success: true, data: await statusOf(req, link) });
});

// @desc    Answer about the business and shop they have open here
// @route   PUT /api/whatsapp-assistant/here
// @access  Private (admin, manager)
exports.useHere = handler(async (req, res) => {
  const link = await links.moveTo(await connectedLink(req), hereOf(req));
  res.status(200).json({ success: true, data: await statusOf(req, link) });
});

// @desc    Disconnect their WhatsApp
// @route   DELETE /api/whatsapp-assistant
// @access  Private (any role: someone who is no longer a manager can still disconnect)
exports.disconnect = handler(async (req, res) => {
  const link = await links.linkOf(req.user.id);
  if (link) await links.disconnect(link);
  res.status(200).json({ success: true, data: { connected: false } });
});

const EXPIRED = { success: false, code: 'EXPIRED', message: 'This link has expired. Send any message to ABS on WhatsApp to get a new one.' };

// @desc    Whether a PIN link still works
// @route   GET /api/public/whatsapp-unlock/:token
// @access  Public (a one-time link sent in the chat)
exports.checkUnlock = async (req, res, next) => {
  try {
    const link = wa.assistantReady() ? await links.linkForUnlock(req.params.token) : null;
    if (!link) return res.status(404).json(EXPIRED);
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
};

// @desc    Enter the PIN: the chat carries on
// @route   POST /api/public/whatsapp-unlock/:token
// @access  Public (a one-time link sent in the chat)
exports.unlock = async (req, res, next) => {
  try {
    const link = wa.assistantReady() ? await links.linkForUnlock(req.params.token) : null;
    if (!link) return res.status(404).json(EXPIRED);
    const result = await links.unlock(link, req.body?.pin);
    if (result.ok) {
      assistant.unlocked(link.phone, result.pending);
      return res.status(200).json({ success: true, data: { chatUrl: wa.chatLink() } });
    }
    if (result.ended) return res.status(404).json(EXPIRED);
    if (result.left > 0) return res.status(400).json({ success: false, code: 'WRONG_PIN', message: `That PIN is wrong. ${result.left} ${result.left === 1 ? 'try' : 'tries'} left.` });
    await assistant.tellLocked(link);
    return res.status(423).json({ success: false, code: 'LOCKED', message: 'Too many wrong PINs. Try again in an hour, or set a new PIN in ABS, under Settings.' });
  } catch (error) {
    return next(error);
  }
};
