jest.mock('../../../models', () => ({ LynkAiSession: { create: jest.fn() } }));
jest.mock('../../../services/lynkAi', () => ({ startAiSession: jest.fn() }));
jest.mock('../../../services/lynkImport', () => ({ lynkConfigured: jest.fn(() => true) }));

const { LynkAiSession } = require('../../../models');
const { startAiSession } = require('../../../services/lynkAi');
const { lynkConfigured } = require('../../../services/lynkImport');
const { LynkChatError, askLynk, writeOut, _private: { passes } } = require('../../../services/lynkChat');

const WHO = { tenant: { id: 't1', name: 'Adom' }, user: { id: 'u1', name: 'Jessica' }, role: 'owner', shopId: 's1', studioLocationId: null };
const PASS = 'p'.repeat(32);
const originalFetch = global.fetch;
const stream = (...events) => ({ ok: true, status: 200, text: async () => `${events.map((e) => JSON.stringify(e)).join('\n')}\n` });
const done = (content, cards = []) => ({ type: 'done', message: { content, cards }, credit_cents: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  passes.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  lynkConfigured.mockReturnValue(true);
  startAiSession.mockResolvedValue({ id: 'ls1', screen_url: `https://lynk/ai/${PASS}?x=1` });
  global.fetch = jest.fn(async () => stream({ type: 'conversation', id: 'c1' }, { type: 'delta', text: 'You' }, done('You sold GH₵60.')));
});
afterAll(() => { global.fetch = originalFetch; });

describe('talking to Lynk AI', () => {
  it('opens a session as the person, for questions only, and keeps it so ABS answers Lynk', async () => {
    const reply = await askLynk(WHO, 'What did I sell?');
    expect(reply).toEqual({ text: 'You sold GH₵60.', cards: [], conversationId: 'c1' });
    const opened = startAiSession.mock.calls[0][0];
    expect(opened).toMatchObject({ tenant: WHO.tenant, user: WHO.user, role: 'owner' });
    expect(opened.abilities).toEqual(expect.arrayContaining(['summary', 'money_owed', 'find']));
    expect(opened.abilities).not.toEqual(expect.arrayContaining(['design']));
    expect(opened.abilities).not.toEqual(expect.arrayContaining(['import']));
    expect(LynkAiSession.create).toHaveBeenCalledWith({ tenantId: 't1', lynkSessionId: 'ls1', userId: 'u1', shopId: 's1', studioLocationId: null, client: 'whatsapp' });
    expect(global.fetch.mock.calls[0][0]).toMatch(new RegExp(`/api/app-ai/${PASS}/chat$`));
  });

  it('keeps the session and the conversation', async () => {
    await askLynk(WHO, 'one');
    await askLynk(WHO, 'two', 'c1');
    expect(startAiSession).toHaveBeenCalledTimes(1);
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ message: 'two', conversation_id: 'c1' });
  });

  it('never shares a session between people, businesses or shops', async () => {
    for (const other of [{}, { user: { id: 'u2' } }, { tenant: { id: 't2' } }, { shopId: 's2' }, { studioLocationId: 'l1' }]) await askLynk({ ...WHO, ...other }, 'x');
    expect(startAiSession).toHaveBeenCalledTimes(5);
  });

  it('opens a new one when Lynk says it has expired, once', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(askLynk(WHO, 'x')).resolves.toMatchObject({ text: 'You sold GH₵60.' });
    expect(startAiSession).toHaveBeenCalledTimes(2);
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(askLynk(WHO, 'x')).rejects.toThrow(LynkChatError);
  });

  it.each([
    ['Lynk is down', () => global.fetch.mockRejectedValue(new Error('ECONNREFUSED')), /couldn't reach Lynk AI/],
    ['the answer stops halfway', () => global.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{"type":"delta","text":"You so' }), /couldn't reach Lynk AI/],
    ['Lynk is busy', () => global.fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Wait a minute.' }) }), /^Wait a minute\.$/],
    ['Lynk fails', () => global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'stack trace' }) }), /couldn't reach Lynk AI/],
    ['there is no credit', () => startAiSession.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 402 })), /needs Lynk credit/],
    ['Lynk gives no pass', () => startAiSession.mockResolvedValue({ id: 'ls1' }), /couldn't reach Lynk AI/],
    ['Lynk is not set up', () => lynkConfigured.mockReturnValue(false), /isn't set up yet/],
  ])('says so when %s', async (_, arrange, words) => {
    arrange();
    await expect(askLynk(WHO, 'x')).rejects.toThrow(LynkChatError);
    await expect(askLynk(WHO, 'x')).rejects.toThrow(words);
  });

  it('writes out a voice note, with Lynk\'s own words when it can\'t', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: 'Who owes me?' }) });
    await expect(writeOut(WHO, { bytes: Buffer.from('abc'), mime: 'audio/ogg' })).resolves.toBe('Who owes me?');
    const audio = global.fetch.mock.calls[0][1].body.get('audio');
    expect(audio.type).toBe('audio/ogg');
    expect(audio.name).toBe('voice.ogg');
    global.fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'A little louder.' }) });
    await expect(writeOut(WHO, { bytes: Buffer.from('abc'), mime: 'audio/ogg' })).rejects.toThrow('A little louder.');
  });
});
