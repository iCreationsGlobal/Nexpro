/**
 * Talking to Lynk AI from ABS's server, for a chat that isn't Lynk's own screen (ABS on WhatsApp). ABS opens a Lynk AI
 * session for the person as it does for the screen (services/lynkAi.js) and uses its pass: their words or voice note
 * go in, Lynk's reply comes out. Lynk asks ABS for the numbers, signed, as that person (services/lynkAsk.js).
 */
const { LynkAiSession } = require('../models');
const { startAiSession } = require('./lynkAi');
const { lynkConfigured } = require('./lynkImport');

/** What Lynk AI may ask about here: questions only. */
const ABILITIES = ['summary', 'top_products', 'low_stock', 'money_owed', 'customers', 'sales', 'expenses', 'products', 'find', 'record', 'insights'];

/** Lynk's passes work for hours; a new one is asked for a little before that. */
const PASS_MS = 6 * 3_600_000;
const MAX_PASSES = 2000;
const passes = new Map();

/** Something to tell the person, in Lynk's words or ours. */
class LynkChatError extends Error {}

const BUSY = 'I couldn\'t reach Lynk AI just now. Please try again in a minute.';

const lynkUrl = (path) => `${(process.env.LYNK_URL || 'https://www.lynkinfra.com').replace(/\/$/, '')}/api/app-ai/${path}`;
const keyOf = (who) => [who.tenant.id, who.user.id, who.shopId || '', who.studioLocationId || ''].join(':');

/** A pass for the person's Lynk AI session, opening one when there's none. */
async function passFor(who) {
  const key = keyOf(who);
  const kept = passes.get(key);
  if (kept && kept.until > Date.now()) return kept.pass;
  const lynk = await startAiSession({ tenant: who.tenant, user: who.user, role: who.role, client: 'whatsapp', abilities: ABILITIES });
  const pass = String(lynk.screen_url || '').split(/[?#]/)[0].split('/').pop();
  if (!/^[\w-]{20,64}$/.test(pass)) throw new Error('Lynk gave no pass');
  // Lynk's questions are answered only for sessions kept here.
  await LynkAiSession.create({ tenantId: who.tenant.id, lynkSessionId: String(lynk.id), userId: who.user.id, shopId: who.shopId || null, studioLocationId: who.studioLocationId || null, client: 'whatsapp' });
  if (passes.size >= MAX_PASSES) passes.delete(passes.keys().next().value);
  passes.set(key, { pass, until: Date.now() + PASS_MS });
  return pass;
}

/** Sends to Lynk with the person's pass; with a new one when Lynk says it has expired. */
async function withPass(who, path, request) {
  if (!lynkConfigured()) throw new LynkChatError('Lynk AI isn\'t set up yet. You can still use the menu.');
  try {
    for (let attempt = 0; ; attempt += 1) {
      const pass = await passFor(who);
      const res = await fetch(lynkUrl(`${pass}/${path}`), { method: 'POST', ...request(), signal: AbortSignal.timeout(90_000) });
      if (res.status !== 404 || attempt > 0) return res;
      passes.delete(keyOf(who));
    }
  } catch (error) {
    if (error instanceof LynkChatError) throw error;
    if (error.statusCode === 402) throw new LynkChatError('Your business needs Lynk credit to use this. Buy some in ABS, under Lynk AI.');
    console.error('[lynk-chat]', path, error.message);
    throw new LynkChatError(BUSY);
  }
}

/** Lynk streams one JSON event per line; the last is the whole reply. */
async function readReply(res) {
  let conversationId = null;
  let message = null;
  for (const line of (await res.text()).split('\n')) {
    let event = null;
    try { event = line.trim() ? JSON.parse(line) : null; } catch { event = null; }
    if (event?.type === 'conversation') conversationId = event.id;
    if (event?.type === 'done') message = event.message;
  }
  return { conversationId, message };
}

/**
 * Lynk AI's answer to their words.
 * @param {{ tenant: object, user: object, role: string|null, shopId: string|null, studioLocationId: string|null }} who
 * @returns {Promise<{ text: string, cards: object[], conversationId: string|null }>}
 */
async function askLynk(who, words, conversationId = null) {
  const res = await withPass(who, 'chat', () => ({
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: words, ...(conversationId ? { conversation_id: conversationId } : {}) }),
  }));
  if (!res.ok) {
    const said = await res.json().catch(() => null);
    throw new LynkChatError(res.status === 429 && said?.error ? said.error : BUSY);
  }
  const reply = await readReply(res).catch(() => null);
  if (!reply?.message) throw new LynkChatError(BUSY);
  return { text: String(reply.message.content || ''), cards: Array.isArray(reply.message.cards) ? reply.message.cards : [], conversationId: reply.conversationId || conversationId };
}

/** A voice note, written out. */
async function writeOut(who, { bytes, mime }) {
  const res = await withPass(who, 'transcribe', () => {
    const form = new FormData();
    form.append('audio', new Blob([bytes], { type: mime }), `voice.${mime.split('/')[1] || 'ogg'}`);
    return { body: form };
  });
  const said = await res.json().catch(() => null);
  if (res.ok && said?.text) return String(said.text);
  throw new LynkChatError(said?.error || 'I couldn\'t hear that. Try again, or type it.');
}

module.exports = { LynkChatError, askLynk, writeOut, _private: { passes } };
