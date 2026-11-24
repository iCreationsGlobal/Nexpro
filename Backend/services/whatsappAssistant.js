/**
 * ABS on WhatsApp: an owner or manager asks about their business by text or voice note (.plans/whatsapp-assistant.md).
 * Reading only. The menu's answers come straight from ABS's reports (services/lynkAsk.js); anything they say in their
 * own words goes to Lynk AI (services/lynkChat.js), which asks ABS for the same numbers. Either way it's as that
 * person, with their rights, in their business and shop. A phone must be connected, and unlocked with the PIN once a
 * day (services/whatsappLinks.js).
 */
const { Op } = require('sequelize');
const { Shop, Tenant, UserTenant, WhatsAppInbound } = require('../models');
const wa = require('./absWhatsApp');
const links = require('./whatsappLinks');
const { LynkChatError, askLynk, writeOut } = require('./lynkChat');
const { AskError, answerQuestion, contextFor } = require('./lynkAsk');
const { notifyUsers } = require('./notificationService');
const { resolveBusinessType } = require('../config/businessTypes');
const { getFrontendBaseUrl } = require('../utils/frontendUrl');
const { toWhatsApp } = require('../utils/whatsappText');

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Meta sends again for days what it couldn't deliver; an old question isn't answered. */
const TOO_OLD_MS = 30 * MINUTE;
const MAX_PER_MINUTE = 15;
const MAX_PER_DAY = 300;
/** Replies to phones that aren't connected, and tries at a connect code, in an hour. */
const MAX_STRANGER_PER_HOUR = 5;
const CONVERSATION_MS = 12 * 60 * MINUTE;
const PENDING_MS = 30 * MINUTE;
const SEND_LIST = 10;

const appUrl = (path = '') => `${getFrontendBaseUrl().replace(/\/$/, '')}${path}`;
const SETTINGS_PAGE = '/settings/abs-whatsapp';

const money = (n) => `${Number(n) < 0 ? '-' : ''}GH₵${Math.abs(Number(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n) => (Number(n) || 0).toLocaleString('en-GH', { maximumFractionDigits: 2 });

const isoDay = (date) => date.toISOString().slice(0, 10);
const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Today and yesterday, or this month and the one before, as the questions take them (`to` not included; Ghana time). */
function periodOf(which, now = new Date()) {
  if (which === 'month') {
    const first = (back) => isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
    const tomorrow = isoDay(new Date(now.getTime() + DAY));
    return { from: first(0), to: tomorrow, label: 'this month', previous: { from: first(1), to: first(0), label: 'last month' } };
  }
  const at = (days) => isoDay(new Date(now.getTime() + days * DAY));
  return { from: at(0), to: at(1), label: 'today', previous: { from: at(-1), to: at(0), label: 'yesterday' } };
}

/* ---- What Meta sent ---- */

/** One incoming message as it's handled here, or null when it isn't something to answer (a reaction, a notice). */
function fromMeta({ messageId, from, timestamp, messageType, payload = {} }) {
  const phone = String(from || '').replace(/\D/g, '');
  if (!messageId || !phone) return null;
  const base = { id: String(messageId).slice(0, 200), phone, at: Number(timestamp) * 1000 || Date.now() };
  if (messageType === 'text') return { ...base, kind: 'text', text: String(payload.text?.body || '').trim().slice(0, 2000) };
  if (messageType === 'button') return { ...base, kind: 'text', text: String(payload.button?.text || '').trim().slice(0, 200) };
  if (messageType === 'interactive') {
    const chosen = payload.interactive?.button_reply || payload.interactive?.list_reply;
    return chosen?.id ? { ...base, kind: 'choice', choice: String(chosen.id).slice(0, 200) } : null;
  }
  if (messageType === 'audio') return { ...base, kind: 'audio', mediaId: String(payload.audio?.id || '') };
  if (['image', 'video', 'document', 'sticker', 'location', 'contacts'].includes(messageType)) return { ...base, kind: 'other' };
  return null;
}

/** Whether this is the first time Meta sends it. Meta gives up after a week, so older ones are cleared now and then. */
async function firstTime({ id, phone }, connected) {
  try {
    await WhatsAppInbound.create({ messageId: id, phone, connected });
    if (Math.random() < 0.01) WhatsAppInbound.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - 8 * DAY) } } }).catch(() => {});
    return true;
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return false;
    throw error;
  }
}

const countSince = (phone, ms, connected) => WhatsAppInbound.count({ where: { phone, connected, createdAt: { [Op.gt]: new Date(Date.now() - ms) } } });

/* ---- The menu ---- */

const isRetail = (ctx) => ['shop', 'pharmacy'].includes(resolveBusinessType(ctx.tenant?.businessType));

async function shopsOf(ctx) {
  if (!ctx.shopScoped || (ctx.allowedShopIds || []).length < 2) return [];
  return Shop.findAll({ where: { tenantId: ctx.tenantId, id: { [Op.in]: ctx.allowedShopIds } }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
}

async function businessesOf(userId) {
  const rows = await UserTenant.findAll({ where: { userId, status: 'active', role: { [Op.in]: ['owner', 'admin', 'manager'] } }, attributes: ['tenantId'], raw: true });
  if (rows.length < 2) return [];
  return Tenant.findAll({ where: { id: { [Op.in]: rows.map((r) => r.tenantId) } }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
}

async function sendMenu(link, ctx, text) {
  const places = [(await shopsOf(ctx)).length && 'shop', (await businessesOf(link.userId)).length && 'business'].filter(Boolean).join(' or ');
  return wa.sendList(link.phone, text, 'Menu', [
    { id: 'sales', title: isRetail(ctx) ? 'Today\'s sales' : 'Money in today' },
    ...(isRetail(ctx) ? [{ id: 'stock', title: 'Check stock', detail: 'What\'s out or running low' }, { id: 'best', title: 'Best sellers', detail: 'This month' }] : []),
    { id: 'owed', title: 'Who owes me' },
    { id: 'profit', title: 'Reports & profit', detail: 'This month' },
    { id: 'expenses', title: 'Expenses', detail: 'This month' },
    ...(places ? [{ id: 'places', title: `Change ${places}` }] : []),
    { id: 'lock', title: 'Lock', detail: 'Ask for my PIN again' },
  ]);
}

/** The shop answered about, when the business has more than one: so a number is never taken for all of them. */
async function placeOf(ctx) {
  const shop = (await shopsOf(ctx)).find((s) => s.id === ctx.shopFilterId);
  return shop ? `${ctx.tenant.name}, ${shop.name}` : ctx.tenant.name;
}

/** The person as the questions take them: who, which business, which shop. */
const askerOf = (link) => ({ tenantId: link.tenantId, userId: link.userId, shopId: link.shopId, studioLocationId: link.studioLocationId, client: 'whatsapp' });
const ask = (link, question) => answerQuestion(askerOf(link), question);

/** The figures of a summary (shops count sales; the others, money received on invoices). */
const figuresOf = (ctx) => [
  ['sales_total', isRetail(ctx) ? 'Total sales' : 'Money received', money],
  ['sales_count', 'Sales made', count],
  ['items_sold', 'Items sold', count],
  ['customers', 'Customers', count],
  ['average_sale', isRetail(ctx) ? 'Average sale' : 'Average invoice', money],
];
const profitOf = (ctx) => [
  ['sales_total', isRetail(ctx) ? 'Total sales' : 'Money received', money],
  ['cost_of_goods', 'Cost of goods', money],
  ['gross_profit', 'Gross profit', money],
  ['expenses_total', 'Expenses', money],
  ['net_profit', 'Net profit', money],
];

const lines = (figures, values) => figures.filter(([key]) => values?.[key] !== undefined).map(([key, label, show]) => `${label}: *${show(values[key])}*`).join('\n');

const change = (now, before) => {
  if (!before) return '';
  const percent = Math.round(((now - before) / Math.abs(before)) * 100);
  return percent === 0 ? ', the same' : `, ${percent > 0 ? 'up' : 'down'} ${Math.abs(percent)}%`;
};

const compared = (figures, now, before, label) => figures
  .filter(([key]) => now?.[key] !== undefined)
  .map(([key, name, show]) => `${name}: *${show(now[key])}* (${label} ${show(before?.[key])}${change(now[key], before?.[key])})`)
  .join('\n');

/** Rows as lines, the name in bold (a * in it would end the bold). */
const rowLines = (items) => items.map((i) => `• *${String(i.label || '').replace(/\*/g, '')}*${i.detail ? `\n   ${i.detail}` : ''}`).join('\n');

const MENU_BUTTON = { id: 'menu', title: 'Menu' };

/** A list the menu gives: its title, rows and total, or what to say when it's empty. */
async function sendRows(link, { title, place, answer, total, empty, path, buttons }) {
  const items = answer.items || [];
  if (!items.length) return wa.sendButtons(link.phone, empty, [MENU_BUTTON]);
  const more = Number(answer.count) > items.length ? `\n…and ${count(Number(answer.count) - items.length)} more: ${appUrl(path)}` : '';
  return wa.sendButtons(link.phone, `*${title}*\n${place}\n\n${rowLines(items)}${more}${total ? `\n\n${total}` : ''}`, [...buttons, MENU_BUTTON]);
}

const MENU = {
  menu: (link, ctx) => sendMenu(link, ctx, 'What would you like to know?'),

  async sales(link, ctx) {
    const period = periodOf('today');
    const a = await ask(link, { kind: 'summary', period });
    const title = isRetail(ctx) ? 'Sales today' : 'Money in today';
    return wa.sendButtons(
      link.phone,
      `*${title}*\n${longDay(period.from)} · ${await placeOf(ctx)}\n\n${lines(figuresOf(ctx), a.current)}`,
      [{ id: 'sales_before', title: 'vs yesterday' }, ...(isRetail(ctx) ? [{ id: 'best', title: 'Best sellers' }] : []), { id: 'report', title: 'Full report' }],
    );
  },

  async sales_before(link, ctx) {
    const a = await ask(link, { kind: 'summary', period: periodOf('today') });
    return wa.sendButtons(link.phone, `*Today so far, and yesterday*\n${await placeOf(ctx)}\n\n${compared(figuresOf(ctx), a.current, a.previous, 'yesterday')}`, [{ id: 'report', title: 'Full report' }, MENU_BUTTON]);
  },

  async profit(link, ctx) {
    const a = await ask(link, { kind: 'summary', period: periodOf('month') });
    return wa.sendButtons(link.phone, `*Profit this month, and last month*\n${await placeOf(ctx)}\n\n${compared(profitOf(ctx), a.current, a.previous, 'last month')}`, [{ id: 'expenses', title: 'Expenses' }, { id: 'report', title: 'Full report' }, MENU_BUTTON]);
  },

  async best(link, ctx) {
    const answer = await ask(link, { kind: 'top_products', period: periodOf('month'), by: 'quantity', limit: SEND_LIST });
    return sendRows(link, { title: 'Best sellers this month', place: await placeOf(ctx), answer, empty: 'Nothing sold this month yet.', path: '/reports/overview', buttons: [] });
  },

  async stock(link, ctx) {
    const answer = await ask(link, { kind: 'low_stock', limit: SEND_LIST });
    return sendRows(link, { title: 'Out or running low', place: await placeOf(ctx), answer, empty: 'Nothing is out or running low.', path: '/products', buttons: [] });
  },

  async owed(link, ctx) {
    const answer = await ask(link, { kind: 'money_owed', limit: SEND_LIST });
    return sendRows(link, { title: 'Who owes you', place: await placeOf(ctx), answer, total: `Total owed: *${money(answer.total_amount)}*`, empty: 'Nobody owes you money.', path: '/invoices', buttons: [] });
  },

  async expenses(link, ctx) {
    const answer = await ask(link, { kind: 'expenses', period: periodOf('month'), limit: SEND_LIST });
    return sendRows(link, { title: 'Expenses this month', place: await placeOf(ctx), answer, total: `Total: *${money(answer.total_amount)}*`, empty: 'No expenses recorded this month.', path: '/expenses', buttons: [] });
  },

  report: (link) => wa.sendLink(link.phone, 'The full report is in ABS.', 'Full report', appUrl('/reports/overview')),

  async places(link, ctx) {
    const [shops, businesses] = [await shopsOf(ctx), await businessesOf(link.userId)];
    const rows = [
      ...shops.map((s) => ({ id: `shop:${s.id}`, title: s.name, detail: s.id === ctx.shopFilterId ? 'Now' : 'Shop' })),
      ...businesses.map((b) => ({ id: `business:${b.id}`, title: b.name, detail: b.id === ctx.tenantId ? 'Now' : 'Business' })),
    ];
    if (!rows.length) return MENU.menu(link, ctx);
    const more = rows.length > 10 ? ` The first 10 are here; for the others, open ABS there and go to ${appUrl(SETTINGS_PAGE)}.` : '';
    return wa.sendList(link.phone, `Which one should I answer about?${more}`, 'Choose', rows);
  },

  async lock(link) {
    await link.update({ unlockedUntil: null });
    return wa.sendText(link.phone, 'Locked. I\'ll ask for your PIN next time.');
  },

  async disconnect(link) {
    const { phone } = link;
    await links.disconnect(link);
    return wa.sendText(phone, 'Disconnected. To use ABS on WhatsApp again, connect it in ABS, under Settings.');
  },

  keep: (link, ctx) => MENU.menu(link, ctx),
};

/** Moves to another shop or business of theirs, checked like any other request. */
async function moveTo(link, ctx, kind, id) {
  if (kind === 'shop') {
    if (!(ctx.allowedShopIds || []).includes(id)) return wa.sendText(link.phone, 'You don\'t have access to that shop.');
    await links.moveTo(link, { tenantId: link.tenantId, shopId: id });
  } else {
    if (!(await businessesOf(link.userId)).some((b) => b.id === id)) return wa.sendText(link.phone, 'You don\'t have access to that business.');
    await contextFor({ tenantId: id, userId: link.userId });
    await links.moveTo(link, { tenantId: id });
  }
  const now = await contextFor(askerOf(link));
  return sendMenu(link, now, `Now answering about *${await placeOf(now)}*.`);
}

async function choose(link, ctx, choice) {
  const [kind, id] = choice.split(':');
  if (['shop', 'business'].includes(kind) && id) return moveTo(link, ctx, kind, id);
  const answer = Object.prototype.hasOwnProperty.call(MENU, choice) ? MENU[choice] : MENU.menu;
  return answer(link, ctx);
}

/* ---- Their own words ---- */

/** Lynk's cards as text, and the first page they point to. */
function cardsAsText(cards) {
  const said = [];
  const pages = [];
  for (const card of cards) {
    if (card?.type === 'items' && Array.isArray(card.rows)) said.push(`*${card.title}*\n${rowLines(card.rows)}${card.more ? `\n…and ${card.more} more` : ''}`);
    if (card?.type === 'insight') said.push(`*${card.title}*\n${card.detail || ''}`.trim());
    if (card?.type === 'link' && String(card.path || '').startsWith('/')) pages.push({ label: card.label || 'Open in ABS', path: card.path });
    if (card?.type === 'credit') {
      if (card.text) said.push(card.text);
      pages.push({ label: 'Buy Lynk credit', path: '/lynk' });
    }
  }
  return { said, page: pages[0] || null };
}

async function answerWords(link, ctx, words) {
  const recent = link.conversationAt && Date.now() - new Date(link.conversationAt).getTime() < CONVERSATION_MS;
  const who = { tenant: ctx.tenant, user: ctx.user, role: ctx.tenantRole || null, shopId: ctx.shopFilterId || null, studioLocationId: ctx.studioLocationFilterId || null };
  const reply = await askLynk(who, words, recent ? link.conversationId : null);
  await link.update({ conversationId: reply.conversationId, conversationAt: new Date() });
  const { said, page } = cardsAsText(reply.cards);
  const text = [toWhatsApp(reply.text, appUrl), ...said].filter(Boolean).join('\n\n') || 'Sorry, I lost my words there. Ask me again?';
  return page ? wa.sendLink(link.phone, text, page.label, appUrl(page.path)) : wa.sendText(link.phone, text);
}

async function answerVoice(link, ctx, mediaId) {
  let audio;
  try {
    audio = await wa.fetchAudio(mediaId);
  } catch (error) {
    if (!error.tooBig) console.error('[whatsapp] voice note', error.message);
    return wa.sendText(link.phone, error.tooBig ? 'That voice note is too long. Keep it under a minute.' : 'I couldn\'t get that voice note. Try again, or type it.');
  }
  const who = { tenant: ctx.tenant, user: ctx.user, role: ctx.tenantRole || null, shopId: ctx.shopFilterId || null, studioLocationId: ctx.studioLocationFilterId || null };
  const words = await writeOut(who, audio);
  // What was heard, so a wrong answer to a misheard question is plain to see.
  await wa.sendText(link.phone, `🎤 _${words.replace(/_/g, ' ')}_`);
  return answerText(link, ctx, words);
}

const GREETING = /^(hi|hello|hey|hiya|menu|start|help|good (morning|afternoon|evening|day))[\s!.,]*(abs)?[\s!.]*$/i;
const LEAVE = /^(stop|disconnect|unsubscribe)[\s!.]*$/i;
const LOCK = /^lock[\s!.]*$/i;

async function answerText(link, ctx, text) {
  if (!text) return MENU.menu(link, ctx);
  if (GREETING.test(text)) {
    const name = String(ctx.user.name || '').trim().split(/\s+/)[0];
    return sendMenu(link, ctx, `Hi${name ? ` ${name}` : ''}, this is ABS for *${await placeOf(ctx)}*.\n\nAsk me about your sales, stock, customers, expenses and profit. Type it or send a voice note. Lynk AI answers from your own ABS records.`);
  }
  return answerWords(link, ctx, text);
}

function answer(link, ctx, m) {
  if (m.kind === 'choice') return choose(link, ctx, m.choice);
  if (m.kind === 'audio') return answerVoice(link, ctx, m.mediaId);
  if (m.kind === 'text') return answerText(link, ctx, m.text);
  return wa.sendText(link.phone, 'I can read text and voice notes for now.');
}

/** Answers, or says in the chat why not. */
async function tryAnswer(link, ctx, m) {
  try {
    await answer(link, ctx, m);
  } catch (error) {
    if (error instanceof LynkChatError || error instanceof AskError) return wa.sendText(link.phone, error.message);
    console.error('[whatsapp] answering failed', error);
    return wa.sendText(link.phone, 'Something went wrong on our side. Please try again.');
  }
  return null;
}

/* ---- Who's writing ---- */

async function connect(m, code) {
  const done = await links.finishConnecting({ phone: m.phone, code });
  if (!done) return wa.sendText(m.phone, `That code doesn't work any more. Get a new one in ABS: ${appUrl(SETTINGS_PAGE)}`);
  const { link, movedFrom } = done;
  const ending = m.phone.slice(-4);
  if (movedFrom) {
    await notifyUsers({ tenantId: movedFrom.tenantId, userIds: [movedFrom.userId], payload: { title: 'Your WhatsApp was disconnected', message: `The number ending ${ending} was connected to another ABS user.`, type: 'system', link: SETTINGS_PAGE } }).catch(() => {});
  }
  let ctx;
  try {
    ctx = await contextFor(askerOf(link));
  } catch (error) {
    if (!(error instanceof AskError)) throw error;
    await links.disconnect(link);
    return wa.sendText(m.phone, `I couldn't connect you: ${error.message}`);
  }
  await notifyUsers({ tenantId: link.tenantId, userIds: [link.userId], payload: { title: 'WhatsApp connected', message: `The number ending ${ending} can now ask ABS about ${ctx.tenant.name}. Not you? Disconnect it in Settings.`, type: 'system', priority: 'high', channels: ['in_app', 'push'], link: SETTINGS_PAGE } }).catch(() => {});
  return sendMenu(link, ctx, `Connected. I'll answer about *${await placeOf(ctx)}*.\n\nAsk me about your sales, stock, customers, expenses and profit. Type it or send a voice note. I'll ask for your PIN once a day.`);
}

const codeIn = (m) => (m.kind === 'text' ? links.codeIn(m.text) : null);

async function stranger(m) {
  if (await countSince(m.phone, 60 * MINUTE, false) > MAX_STRANGER_PER_HOUR) return null;
  const code = codeIn(m);
  if (code) return connect(m, code);
  return wa.sendText(m.phone, `This is ABS (African Business Suite). Your number isn't connected to a business yet. If you use ABS, connect it here: ${appUrl(SETTINGS_PAGE)}`);
}

async function askForPin(link, m) {
  if (links.isPinLocked(link)) return wa.sendText(link.phone, `Too many wrong PINs, so this is locked for now. Try again within the hour, or set a new PIN in ABS: ${appUrl(SETTINGS_PAGE)}`);
  const kept = { kind: m.kind, at: Date.now(), ...(m.text ? { text: m.text } : {}), ...(m.mediaId ? { mediaId: m.mediaId } : {}), ...(m.choice ? { choice: m.choice } : {}) };
  const token = await links.startUnlock(link, kept);
  return wa.sendLink(link.phone, 'Enter your PIN to carry on. I ask once a day, on ABS\'s own page, so it never shows in this chat.', 'Enter your PIN', appUrl(`/wa/${token}`));
}

async function handle(m) {
  if (Date.now() - m.at > TOO_OLD_MS) return null;
  const link = await links.linkForPhone(m.phone);
  if (!(await firstTime(m, Boolean(link)))) return null;
  if (!link) return stranger(m);

  const lately = await countSince(m.phone, MINUTE, true);
  const today = await countSince(m.phone, DAY, true);
  if (lately > MAX_PER_MINUTE || today > MAX_PER_DAY) {
    const justOver = lately === MAX_PER_MINUTE + 1 || today === MAX_PER_DAY + 1;
    return justOver ? wa.sendText(m.phone, today > MAX_PER_DAY ? 'That\'s a lot of messages for one day. Please carry on tomorrow.' : 'That\'s a lot of messages at once. Wait a minute and try again.') : null;
  }
  wa.markRead(m.id).catch(() => {});

  // A phone already connected may be moved to another ABS user.
  const code = codeIn(m);
  if (code) return connect(m, code);

  // Leaving and locking need no PIN.
  if (m.kind === 'text' && LEAVE.test(m.text)) return wa.sendButtons(m.phone, 'Disconnect this WhatsApp from ABS?', [{ id: 'disconnect', title: 'Disconnect' }, { id: 'keep', title: 'Keep it' }]);
  if (m.kind === 'choice' && m.choice === 'disconnect') return MENU.disconnect(link);
  if ((m.kind === 'text' && LOCK.test(m.text)) || (m.kind === 'choice' && m.choice === 'lock')) return MENU.lock(link);

  let ctx;
  try {
    ctx = await contextFor(askerOf(link));
  } catch (error) {
    if (error instanceof AskError) return wa.sendText(m.phone, `I can't answer about this business: ${error.message}`);
    throw error;
  }
  if (!links.isUnlocked(link)) return askForPin(link, m);
  return tryAnswer(link, ctx, m);
}

/** One message at a time for each phone, in the order they came. */
const queues = new Map();
function inTurn(phone, work) {
  const next = (queues.get(phone) || Promise.resolve()).then(work).catch((error) => console.error('[whatsapp] message failed', error));
  queues.set(phone, next);
  next.finally(() => { if (queues.get(phone) === next) queues.delete(phone); });
  return next;
}

/** What Meta sent to ABS's number (services/whatsappService.js, handleWebhook). Never throws. */
function receive(results) {
  const messages = results.map(fromMeta).filter(Boolean);
  return Promise.all(messages.map((m) => inTurn(m.phone, () => handle(m))));
}

/** The PIN was entered on ABS's page: what they asked before it is answered in the chat. */
function unlocked(phone, pending) {
  return inTurn(phone, async () => {
    const link = await links.linkForPhone(phone);
    if (!link || !links.isUnlocked(link)) return null;
    const ctx = await contextFor(askerOf(link)).catch((error) => { if (error instanceof AskError) return null; throw error; });
    if (!ctx) return null;
    if (pending && Date.now() - pending.at < PENDING_MS) return tryAnswer(link, ctx, pending);
    return sendMenu(link, ctx, 'Thank you. What would you like to know?');
  });
}

/** Five wrong PINs: the person is told in ABS, in case it wasn't them. */
const tellLocked = (link) => notifyUsers({
  tenantId: link.tenantId,
  userIds: [link.userId],
  payload: { title: 'ABS on WhatsApp is locked', message: 'The wrong PIN was entered 5 times. If it wasn\'t you, disconnect your WhatsApp in Settings.', type: 'system', priority: 'high', channels: ['in_app', 'push'], link: SETTINGS_PAGE },
}).catch(() => {});

module.exports = { receive, tellLocked, unlocked, _private: { cardsAsText, fromMeta, periodOf } };
