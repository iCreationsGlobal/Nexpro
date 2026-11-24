/**
 * Connecting a person's WhatsApp to ABS, and their PIN.
 *
 * Connecting: the signed-in owner or manager chooses a PIN and gets a short code; sending it from their WhatsApp to
 * ABS's number proves the phone is theirs. The PIN is entered on ABS's own page (a one-time link sent in the chat),
 * never in the chat, where it would stay readable. Codes and links are kept only as hashes.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { WhatsAppLink } = require('../models');

const CODE_MINUTES = 15;
const UNLOCK_LINK_MINUTES = 15;
/** The PIN once a day. */
const UNLOCKED_HOURS = 24;
const MAX_PIN_TRIES = 5;
const PIN_LOCK_MINUTES = 60;

/** Without letters and digits that look alike. */
const CODE_LETTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_PATTERN = /\bconnect\s+abs\s+([2-9A-HJKMNP-Z]{4})[\s-]?([2-9A-HJKMNP-Z]{4})\b/i;

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60_000);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isPast = (date) => !date || new Date(date).getTime() <= Date.now();

class PinError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A PIN of 4 to 6 digits that isn't the first one anybody would try. */
function checkPin(pin) {
  const value = String(pin ?? '').trim();
  if (!/^\d{4,6}$/.test(value)) throw new PinError('Choose a PIN of 4 to 6 digits.');
  const steps = [...value].slice(1).map((digit, i) => Number(digit) - Number(value[i]));
  if ([0, 1, -1].some((step) => steps.every((s) => s === step))) throw new PinError('That PIN is too easy to guess. Choose another.');
  return value;
}

const linkOf = (userId) => WhatsAppLink.findOne({ where: { userId } });
const linkForPhone = (phone) => WhatsAppLink.findOne({ where: { phone } });

/** Starts connecting: keeps the PIN and the business, and gives the code to send from their WhatsApp. */
async function startConnecting({ userId, tenantId, shopId = null, studioLocationId = null, pin }) {
  const pinHash = await bcrypt.hash(checkPin(pin), 10);
  const code = Array.from({ length: 8 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('');
  const details = { tenantId, shopId, studioLocationId, pinHash, pinTries: 0, pinLockedUntil: null, codeHash: hash(code), codeExpiresAt: inMinutes(CODE_MINUTES) };
  const link = await linkOf(userId);
  if (link?.phone) throw new PinError('Your WhatsApp is already connected. Disconnect it first.', 409);
  if (link) await link.update(details);
  else await WhatsAppLink.create({ userId, ...details });
  return { words: `Connect ABS ${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: details.codeExpiresAt };
}

/** The connect code in a message, or null. */
function codeIn(text) {
  const found = CODE_PATTERN.exec(String(text || ''));
  return found ? `${found[1]}${found[2]}`.toUpperCase() : null;
}

/**
 * Finishes connecting: the phone that sent the code is this person's. A phone is one person's at a time.
 * @returns {Promise<{ link: object, movedFrom: object|null } | null>} null when the code isn't one that works
 */
async function finishConnecting({ phone, code }) {
  const link = await WhatsAppLink.findOne({ where: { codeHash: hash(code), codeExpiresAt: { [Op.gt]: new Date() } } });
  if (!link) return null;
  const before = await linkForPhone(phone);
  const movedFrom = before && before.userId !== link.userId ? before : null;
  if (movedFrom) await disconnect(movedFrom);
  await link.update({ phone, connectedAt: new Date(), codeHash: null, codeExpiresAt: null, unlockedUntil: inMinutes(UNLOCKED_HOURS * 60) });
  return { link, movedFrom };
}

/** Forgets the phone, and everything that let it in. */
const disconnect = (link) => link.update({
  phone: null,
  connectedAt: null,
  codeHash: null,
  codeExpiresAt: null,
  unlockHash: null,
  unlockExpiresAt: null,
  unlockedUntil: null,
  pendingMessage: null,
  conversationId: null,
  conversationAt: null,
});

/** A new PIN, set by the signed-in person: it's asked for again at once. */
async function changePin(link, pin) {
  const pinHash = await bcrypt.hash(checkPin(pin), 10);
  return link.update({ pinHash, pinTries: 0, pinLockedUntil: null, unlockedUntil: null, unlockHash: null, unlockExpiresAt: null });
}

/** Answers about another business or shop from now on, in a new conversation. */
const moveTo = (link, { tenantId, shopId = null, studioLocationId = null }) => link.update({ tenantId, shopId, studioLocationId, conversationId: null, conversationAt: null });

const isUnlocked = (link) => !isPast(link.unlockedUntil);
const isPinLocked = (link) => !isPast(link.pinLockedUntil);

/** The one-time link's token, with what they asked kept to answer after it. */
async function startUnlock(link, pendingMessage) {
  const token = crypto.randomBytes(24).toString('base64url');
  await link.update({ unlockHash: hash(token), unlockExpiresAt: inMinutes(UNLOCK_LINK_MINUTES), pendingMessage });
  return token;
}

/** The person an unlock link is for, while it works. */
async function linkForUnlock(token) {
  if (!/^[\w-]{32}$/.test(String(token || ''))) return null;
  return WhatsAppLink.findOne({ where: { unlockHash: hash(token), unlockExpiresAt: { [Op.gt]: new Date() }, phone: { [Op.ne]: null } } });
}

/**
 * Checks the PIN from the unlock page. Five wrong ones end the link and lock it for an hour.
 * @returns {Promise<{ ok: true, pending: object|null } | { ok: false, left: number, justLocked?: boolean, ended?: boolean }>}
 */
async function unlock(link, pin) {
  // Each try is counted before it's checked, in one step, and only while this link still works: many at once can't
  // get past the limit, nor slip in after it.
  const [, [tried]] = await WhatsAppLink.update(
    { pinTries: WhatsAppLink.sequelize.literal('"pinTries" + 1') },
    { where: { id: link.id, unlockHash: link.unlockHash, pinTries: { [Op.lt]: MAX_PIN_TRIES } }, returning: true },
  );
  if (!tried) return { ok: false, left: 0, ended: true };
  if (await bcrypt.compare(String(pin ?? ''), tried.pinHash)) {
    const pending = tried.pendingMessage;
    await tried.update({ pinTries: 0, pinLockedUntil: null, unlockHash: null, unlockExpiresAt: null, unlockedUntil: inMinutes(UNLOCKED_HOURS * 60), pendingMessage: null });
    return { ok: true, pending };
  }
  if (tried.pinTries < MAX_PIN_TRIES) return { ok: false, left: MAX_PIN_TRIES - tried.pinTries };
  await tried.update({ pinTries: 0, pinLockedUntil: inMinutes(PIN_LOCK_MINUTES), unlockHash: null, unlockExpiresAt: null, pendingMessage: null });
  return { ok: false, left: 0, justLocked: true };
}

module.exports = {
  PinError,
  changePin,
  codeIn,
  disconnect,
  finishConnecting,
  isPinLocked,
  isUnlocked,
  linkForPhone,
  linkForUnlock,
  linkOf,
  moveTo,
  startConnecting,
  startUnlock,
  unlock,
};
