jest.mock('../../../models', () => ({
  Shop: { findAll: jest.fn() },
  Tenant: { findAll: jest.fn() },
  UserTenant: { findAll: jest.fn() },
  WhatsAppInbound: { create: jest.fn(), count: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../../../services/absWhatsApp', () => ({ sendText: jest.fn(), sendButtons: jest.fn(), sendList: jest.fn(), sendLink: jest.fn(), markRead: jest.fn(), fetchAudio: jest.fn() }));
jest.mock('../../../services/whatsappLinks', () => ({
  ...jest.requireActual('../../../services/whatsappLinks'),
  linkForPhone: jest.fn(),
  finishConnecting: jest.fn(),
  disconnect: jest.fn(),
  moveTo: jest.fn(),
  startUnlock: jest.fn(),
}));
jest.mock('../../../services/lynkChat', () => ({ LynkChatError: class LynkChatError extends Error {}, askLynk: jest.fn(), writeOut: jest.fn() }));
jest.mock('../../../services/lynkAsk', () => ({ AskError: class AskError extends Error {}, answerQuestion: jest.fn(), contextFor: jest.fn() }));
jest.mock('../../../services/notificationService', () => ({ notifyUsers: jest.fn() }));

const { Shop, Tenant, UserTenant, WhatsAppInbound } = require('../../../models');
const wa = require('../../../services/absWhatsApp');
const links = require('../../../services/whatsappLinks');
const { LynkChatError, askLynk, writeOut } = require('../../../services/lynkChat');
const { AskError, answerQuestion, contextFor } = require('../../../services/lynkAsk');
const { notifyUsers } = require('../../../services/notificationService');
const { receive, unlocked, tellLocked, _private: { fromMeta, periodOf } } = require('../../../services/whatsappAssistant');

const PHONE = '233244000001';
const SOON = new Date(Date.now() + 3_600_000);
let link;
let ctx;
let next = 0;
const seconds = () => String(Math.floor(Date.now() / 1000));
const meta = (messageType, payload = {}, extra = {}) => ({ type: 'message', messageId: `in${next += 1}`, from: PHONE, timestamp: seconds(), messageType, payload, ...extra });
const text = (body, extra) => meta('text', { text: { body } }, extra);
const tap = (id) => meta('interactive', { interactive: { list_reply: { id } } });
const said = () => [wa.sendText, wa.sendButtons, wa.sendList, wa.sendLink].flatMap((send) => send.mock.calls.map((call) => call.slice(1)));
const words = () => JSON.stringify(said());
const reachedData = () => answerQuestion.mock.calls.length + askLynk.mock.calls.length + writeOut.mock.calls.length;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  link = { id: 'l1', userId: 'u1', tenantId: 't1', shopId: 's1', studioLocationId: null, phone: PHONE, unlockedUntil: SOON, conversationId: null, conversationAt: null };
  link.update = jest.fn(async (changes) => Object.assign(link, changes));
  ctx = { tenantId: 't1', tenant: { id: 't1', name: 'Adom Stores', businessType: 'shop' }, user: { id: 'u1', name: 'Jessica Mensah' }, tenantRole: 'owner', shopScoped: true, allowedShopIds: ['s1'], shopFilterId: 's1' };
  links.linkForPhone.mockImplementation(async () => link);
  links.startUnlock.mockResolvedValue('t'.repeat(32));
  contextFor.mockImplementation(async () => ctx);
  WhatsAppInbound.create.mockResolvedValue({});
  WhatsAppInbound.count.mockResolvedValue(1);
  WhatsAppInbound.destroy.mockResolvedValue(0);
  Shop.findAll.mockResolvedValue([]);
  UserTenant.findAll.mockResolvedValue([{ tenantId: 't1' }]);
  Tenant.findAll.mockResolvedValue([]);
  wa.markRead.mockResolvedValue({});
  notifyUsers.mockResolvedValue([]);
  askLynk.mockResolvedValue({ text: 'You sold **GH₵60**.', cards: [], conversationId: 'c1' });
  answerQuestion.mockResolvedValue({ current: { sales_total: 60, sales_count: 3 }, previous: { sales_total: 40, sales_count: 1 } });
});

describe('what Meta sends', () => {
  it('reads text, taps and voice notes, and leaves the rest', () => {
    expect(fromMeta(text(' hi '))).toMatchObject({ kind: 'text', text: 'hi', phone: PHONE });
    expect(fromMeta(tap('owed'))).toMatchObject({ kind: 'choice', choice: 'owed' });
    expect(fromMeta(meta('interactive', { interactive: { button_reply: { id: 'report' } } }))).toMatchObject({ choice: 'report' });
    expect(fromMeta(meta('audio', { audio: { id: '123' } }))).toMatchObject({ kind: 'audio', mediaId: '123' });
    expect(fromMeta(meta('image'))).toMatchObject({ kind: 'other' });
    for (const odd of [meta('reaction'), meta('system'), meta('interactive', {}), { ...text('hi'), from: '' }, { ...text('hi'), messageId: null }]) expect(fromMeta(odd)).toBeNull();
  });

  it('answers a message once, though Meta sends it again', async () => {
    WhatsAppInbound.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }));
    await receive([text('hi')]);
    expect(said()).toHaveLength(0);
  });

  it('does not answer an old message', async () => {
    await receive([text('hi', { timestamp: String(Math.floor(Date.now() / 1000) - 3600) })]);
    expect(said()).toHaveLength(0);
    expect(WhatsAppInbound.create).not.toHaveBeenCalled();
  });

  it('answers several in the order they came, and one failing does not stop the next', async () => {
    askLynk.mockRejectedValueOnce(new Error('boom'));
    await receive([text('one'), text('two'), text('three')]);
    expect(askLynk.mock.calls.map((call) => call[1])).toEqual(['one', 'two', 'three']);
    expect(wa.sendText.mock.calls[0][1]).toMatch(/Something went wrong/);
    expect(words()).not.toContain('boom');
  });
});

describe('who may ask', () => {
  it('a number that isn\'t connected gets no numbers', async () => {
    link = null;
    await receive([text('who owes me?')]);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining('isn\'t connected'));
    expect(reachedData()).toBe(0);
    expect(contextFor).not.toHaveBeenCalled();
    expect(WhatsAppInbound.create).toHaveBeenCalledWith(expect.objectContaining({ connected: false }));
  });

  it('and is left alone after a few messages, codes too', async () => {
    link = null;
    WhatsAppInbound.count.mockResolvedValue(6);
    await receive([text('hello'), text('Connect ABS 7K4M-9QX2')]);
    expect(said()).toHaveLength(0);
    expect(links.finishConnecting).not.toHaveBeenCalled();
    expect(WhatsAppInbound.count.mock.calls[0][0].where).toMatchObject({ phone: PHONE, connected: false });
  });

  it('the right code connects, tells them in ABS, and opens the menu', async () => {
    const mine = { ...link };
    link = null;
    links.finishConnecting.mockResolvedValue({ link: mine, movedFrom: null });
    await receive([text('Connect ABS 7K4M-9QX2')]);
    expect(links.finishConnecting).toHaveBeenCalledWith({ phone: PHONE, code: '7K4M9QX2' });
    expect(notifyUsers).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u1'], payload: expect.objectContaining({ title: 'WhatsApp connected' }) }));
    expect(wa.sendList).toHaveBeenCalledWith(PHONE, expect.stringContaining('Connected'), 'Menu', expect.any(Array));
  });

  it('a wrong code connects nothing', async () => {
    link = null;
    links.finishConnecting.mockResolvedValue(null);
    await receive([text('Connect ABS 7K4M-9QX2')]);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining('doesn\'t work'));
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('someone who may no longer use ABS there is not connected after all', async () => {
    const mine = { ...link };
    link = null;
    links.finishConnecting.mockResolvedValue({ link: mine, movedFrom: null });
    contextFor.mockRejectedValue(new AskError('Lynk AI is for owners and managers'));
    await receive([text('Connect ABS 7K4M-9QX2')]);
    expect(links.disconnect).toHaveBeenCalledWith(mine);
  });

  it('whoever had the phone before is told', async () => {
    const before = { tenantId: 't9', userId: 'u9' };
    links.finishConnecting.mockResolvedValue({ link, movedFrom: before });
    await receive([text('Connect ABS 7K4M-9QX2')]);
    expect(notifyUsers).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't9', userIds: ['u9'], payload: expect.objectContaining({ title: 'Your WhatsApp was disconnected' }) }));
  });

  it.each([['typed', () => text('who owes me?')], ['tapped', () => tap('owed')], ['spoken', () => meta('audio', { audio: { id: '1' } })]])('rights are checked each time: no answer to something %s', async (_, message) => {
    contextFor.mockRejectedValue(new AskError('That person is no longer active in ABS'));
    await receive([message()]);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining('no longer active'));
    expect(reachedData()).toBe(0);
  });

  it('a flood is told once to slow down, then left', async () => {
    WhatsAppInbound.count.mockResolvedValueOnce(16).mockResolvedValueOnce(16);
    await receive([tap('sales')]);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining('at once'));
    WhatsAppInbound.count.mockResolvedValueOnce(17).mockResolvedValueOnce(17);
    await receive([tap('sales')]);
    WhatsAppInbound.count.mockResolvedValueOnce(2).mockResolvedValueOnce(302);
    await receive([tap('sales')]);
    expect(said()).toHaveLength(1);
    expect(reachedData()).toBe(0);
  });
});

describe('the PIN', () => {
  beforeEach(() => { link.unlockedUntil = new Date(Date.now() - 1000); });

  it.each([
    ['text', () => text('Who owes me?'), { kind: 'text', text: 'Who owes me?' }],
    ['a tap', () => tap('owed'), { kind: 'choice', choice: 'owed' }],
    ['a voice note', () => meta('audio', { audio: { id: '77' } }), { kind: 'audio', mediaId: '77' }],
    ['a greeting', () => text('hi'), { kind: 'text', text: 'hi' }],
    ['the PIN itself', () => text('2580'), { kind: 'text', text: '2580' }],
  ])('is asked for, on ABS\'s page, before answering %s', async (_, message, kept) => {
    await receive([message()]);
    expect(links.startUnlock).toHaveBeenCalledWith(link, expect.objectContaining(kept));
    expect(wa.sendLink).toHaveBeenCalledWith(PHONE, expect.stringContaining('PIN'), 'Enter your PIN', expect.stringMatching(/\/wa\/t{32}$/));
    expect(reachedData()).toBe(0);
    expect(words()).not.toContain('Adom');
  });

  it('no link while it is locked', async () => {
    link.pinLockedUntil = SOON;
    await receive([text('sales')]);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining('Too many wrong PINs'));
    expect(links.startUnlock).not.toHaveBeenCalled();
  });

  it('once entered, what they asked is answered', async () => {
    link.unlockedUntil = SOON;
    await unlocked(PHONE, { kind: 'text', text: 'Who owes me?', at: Date.now() });
    expect(askLynk).toHaveBeenCalledWith(expect.anything(), 'Who owes me?', null);
    await unlocked(PHONE, { kind: 'text', text: 'Old question', at: Date.now() - 3_600_000 });
    expect(askLynk).toHaveBeenCalledTimes(1);
    expect(wa.sendList).toHaveBeenCalledTimes(1);
  });

  it('answers nothing when it isn\'t really unlocked, or they may no longer ask', async () => {
    await unlocked(PHONE, { kind: 'text', text: 'x', at: Date.now() });
    link.unlockedUntil = SOON;
    contextFor.mockRejectedValue(new AskError('no'));
    await unlocked(PHONE, { kind: 'text', text: 'x', at: Date.now() });
    expect(said()).toHaveLength(0);
  });

  it('locking and leaving need none', async () => {
    await receive([text('Lock')]);
    expect(link.unlockedUntil).toBeNull();
    await receive([text('stop')]);
    expect(wa.sendButtons).toHaveBeenCalledWith(PHONE, expect.stringContaining('Disconnect'), [{ id: 'disconnect', title: 'Disconnect' }, { id: 'keep', title: 'Keep it' }]);
    await receive([tap('disconnect')]);
    expect(links.disconnect).toHaveBeenCalledWith(link);
    expect(links.startUnlock).not.toHaveBeenCalled();
  });

  it('five wrong ones are told in ABS', async () => {
    await tellLocked(link);
    expect(notifyUsers).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u1'], payload: expect.objectContaining({ title: 'ABS on WhatsApp is locked' }) }));
  });
});

describe('the menu', () => {
  it('is free: straight from ABS, as the person, in their shop', async () => {
    await receive([tap('sales')]);
    expect(answerQuestion).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1', shopId: 's1', studioLocationId: null, client: 'whatsapp' }, { kind: 'summary', period: periodOf('today') });
    expect(wa.sendButtons.mock.calls[0][1]).toMatch(/^\*Sales today\*\n.+ · Adom Stores\n\nTotal sales: \*GH₵60\.00\*\nSales made: \*3\*$/);
    expect(askLynk).not.toHaveBeenCalled();
  });

  it('compares with yesterday, also when there was nothing or a loss', async () => {
    await receive([tap('sales_before')]);
    expect(wa.sendButtons.mock.calls[0][1]).toContain('Total sales: *GH₵60.00* (yesterday GH₵40.00, up 50%)');
    answerQuestion.mockResolvedValue({ current: { net_profit: -80 }, previous: { net_profit: 0 } });
    await receive([tap('profit')]);
    expect(wa.sendButtons.mock.calls[1][1]).toContain('Net profit: *-GH₵80.00* (last month GH₵0.00)');
  });

  it('names the shop when there are several, and offers to change', async () => {
    ctx.allowedShopIds = ['s1', 's2'];
    Shop.findAll.mockResolvedValue([{ id: 's1', name: 'Osu' }, { id: 's2', name: 'Tema' }]);
    await receive([tap('menu')]);
    expect(wa.sendList.mock.calls[0][3].map((r) => r.title)).toContain('Change shop');
    await receive([tap('sales')]);
    expect(wa.sendButtons.mock.calls[0][1]).toContain('Adom Stores, Osu');
    await receive([tap('places')]);
    expect(wa.sendList.mock.calls[1][3]).toEqual([{ id: 'shop:s1', title: 'Osu', detail: 'Now' }, { id: 'shop:s2', title: 'Tema', detail: 'Shop' }]);
  });

  it('a shop or business that isn\'t theirs is refused', async () => {
    await receive([tap('shop:s9')]);
    await receive([tap('business:t9')]);
    expect(links.moveTo).not.toHaveBeenCalled();
    expect(words()).toMatch(/access to that shop.*access to that business/);
  });

  it('one that is theirs is moved to', async () => {
    ctx.allowedShopIds = ['s1', 's2'];
    await receive([tap('shop:s2')]);
    expect(links.moveTo).toHaveBeenCalledWith(link, { tenantId: 't1', shopId: 's2' });
    UserTenant.findAll.mockResolvedValue([{ tenantId: 't1' }, { tenantId: 't2' }]);
    Tenant.findAll.mockResolvedValue([{ id: 't1', name: 'Adom' }, { id: 't2', name: 'Other' }]);
    await receive([tap('business:t2')]);
    expect(contextFor).toHaveBeenCalledWith({ tenantId: 't2', userId: 'u1' });
    expect(links.moveTo).toHaveBeenLastCalledWith(link, { tenantId: 't2' });
  });

  it('a business that doesn\'t sell goods has no stock or best sellers', async () => {
    ctx.tenant.businessType = 'studio';
    await receive([text('menu')]);
    expect(wa.sendList.mock.calls[0][3].map((r) => r.id)).not.toEqual(expect.arrayContaining(['stock']));
    expect(wa.sendList.mock.calls[0][3][0].title).toBe('Money in today');
  });

  it.each([['__proto__'], ['constructor'], ['nothing'], ['']])('an unknown choice (%p) never breaks', async (id) => {
    await receive([tap(id)]);
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it('lists rows with what is left out, and says when there is nothing', async () => {
    answerQuestion.mockResolvedValue({ items: [{ label: 'Kwame *Bold*', detail: 'GH₵610' }], count: 12, total_amount: 1860 });
    await receive([tap('owed')]);
    expect(wa.sendButtons.mock.calls[0][1]).toMatch(/• \*Kwame Bold\*\n {3}GH₵610\n…and 11 more: .*\/invoices\n\nTotal owed: \*GH₵1,860\.00\*$/);
    answerQuestion.mockResolvedValue({ items: [], count: 0 });
    await receive([tap('owed')]);
    expect(wa.sendButtons.mock.calls[1][1]).toBe('Nobody owes you money.');
  });
});

describe('their own words', () => {
  it('go to Lynk AI as the person, and the answer comes back as WhatsApp text', async () => {
    await receive([text('What did I sell?')]);
    expect(askLynk).toHaveBeenCalledWith({ tenant: ctx.tenant, user: ctx.user, role: 'owner', shopId: 's1', studioLocationId: null }, 'What did I sell?', null);
    expect(wa.sendText).toHaveBeenCalledWith(PHONE, 'You sold *GH₵60*.');
    expect(link).toMatchObject({ conversationId: 'c1' });
  });

  it('carry on the conversation for half a day', async () => {
    Object.assign(link, { conversationId: 'c7', conversationAt: new Date(Date.now() - 3_600_000) });
    await receive([text('and yesterday?')]);
    expect(askLynk.mock.calls[0][2]).toBe('c7');
    link.conversationAt = new Date(Date.now() - 13 * 3_600_000);
    await receive([text('hello there')]);
    expect(askLynk.mock.calls[1][2]).toBeNull();
  });

  it('show lists and one button, only to ABS\'s own pages', async () => {
    askLynk.mockResolvedValue({ text: 'Here.', cards: [{ type: 'items', title: 'Owed', rows: [{ label: 'Adwoa', detail: 'GH₵1' }], more: 2 }, { type: 'link', label: 'Invoices', path: '/invoices' }], conversationId: 'c1' });
    await receive([text('x')]);
    expect(wa.sendLink).toHaveBeenCalledWith(PHONE, 'Here.\n\n*Owed*\n• *Adwoa*\n   GH₵1\n…and 2 more', 'Invoices', expect.stringMatching(/^https?:\/\/[^/]+\/invoices$/));
    askLynk.mockResolvedValue({ text: 'Here.', cards: [{ type: 'link', label: 'Bad', path: 'https://evil.example' }], conversationId: 'c1' });
    await receive([text('x')]);
    expect(wa.sendLink).toHaveBeenCalledTimes(1);
  });

  it('out of credit points to where to buy it', async () => {
    askLynk.mockResolvedValue({ text: 'I need credit.', cards: [{ type: 'credit', text: 'Buy Lynk credit.' }], conversationId: 'c1' });
    await receive([text('x')]);
    expect(wa.sendLink).toHaveBeenCalledWith(PHONE, 'I need credit.\n\nBuy Lynk credit.', 'Buy Lynk credit', expect.stringMatching(/\/lynk$/));
  });

  it('a voice note is written out, shown back, and answered', async () => {
    wa.fetchAudio.mockResolvedValue({ bytes: Buffer.from('x'), mime: 'audio/ogg' });
    writeOut.mockResolvedValue('Who owes me?');
    await receive([meta('audio', { audio: { id: '1' } })]);
    expect(wa.sendText.mock.calls.map((call) => call[1])).toEqual(['🎤 _Who owes me?_', 'You sold *GH₵60*.']);
  });

  it('says what went wrong, kindly', async () => {
    askLynk.mockRejectedValueOnce(new LynkChatError('I couldn\'t reach Lynk AI just now.'));
    await receive([text('x')]);
    wa.fetchAudio.mockRejectedValueOnce(Object.assign(new Error('x'), { tooBig: true }));
    await receive([meta('audio', { audio: { id: '1' } })]);
    await receive([meta('image')]);
    expect(wa.sendText.mock.calls.map((call) => call[1])).toEqual(['I couldn\'t reach Lynk AI just now.', expect.stringContaining('too long'), expect.stringContaining('text and voice notes')]);
  });
});

describe('days', () => {
  it('today and yesterday, this month and last, in Ghana time', () => {
    expect(periodOf('today', new Date('2026-11-24T23:30:00Z'))).toEqual({ from: '2026-11-24', to: '2026-11-25', label: 'today', previous: { from: '2026-11-23', to: '2026-11-24', label: 'yesterday' } });
    expect(periodOf('month', new Date('2027-01-31T10:00:00Z'))).toEqual({ from: '2027-01-01', to: '2027-02-01', label: 'this month', previous: { from: '2026-12-01', to: '2027-01-01', label: 'last month' } });
  });
});
