jest.mock('../../../models', () => ({ Tenant: { findByPk: jest.fn(async () => ({ name: 'Adom Stores' })) }, Shop: { findByPk: jest.fn(async () => ({ name: 'Osu' })) } }));
jest.mock('../../../services/absWhatsApp', () => ({ assistantReady: jest.fn(), absNumber: () => '233500000000', chatLink: (words) => `https://wa.me/233500000000${words ? `?text=${encodeURIComponent(words)}` : ''}` }));
jest.mock('../../../services/whatsappLinks', () => ({
  PinError: class PinError extends Error { constructor(message, status = 400) { super(message); this.status = status; } },
  linkOf: jest.fn(), linkForUnlock: jest.fn(), startConnecting: jest.fn(), changePin: jest.fn(), moveTo: jest.fn(), disconnect: jest.fn(), unlock: jest.fn(), isPinLocked: jest.fn(() => false),
}));
jest.mock('../../../services/whatsappAssistant', () => ({ unlocked: jest.fn(), tellLocked: jest.fn(async () => {}) }));

const wa = require('../../../services/absWhatsApp');
const links = require('../../../services/whatsappLinks');
const assistant = require('../../../services/whatsappAssistant');
const controller = require('../../../controllers/whatsappAssistantController');

const LINK = { id: 'l1', userId: 'u1', tenantId: 't1', shopId: 's1', phone: '233244000001', pinHash: 'secret-hash', connectedAt: 'then' };
const request = (extra = {}) => ({ user: { id: 'u1' }, tenantId: 't1', shopFilterId: 's1', body: {}, params: {}, ...extra });

async function run(name, req = request()) {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  await controller[name](req, res, next);
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0], next };
}

beforeEach(() => {
  jest.clearAllMocks();
  wa.assistantReady.mockReturnValue(true);
  links.linkOf.mockResolvedValue({ ...LINK });
  links.linkForUnlock.mockResolvedValue({ ...LINK });
});

describe('ABS on WhatsApp, in Settings', () => {
  it('says who is connected without the number or the PIN', async () => {
    const { body } = await run('getStatus');
    expect(body.data).toMatchObject({ available: true, connected: true, phoneEnding: '0001', businessName: 'Adom Stores', shopName: 'Osu', here: true });
    expect(JSON.stringify(body)).not.toMatch(/233244000001|secret-hash/);
    expect((await run('getStatus', request({ shopFilterId: 's2' }))).body.data.here).toBe(false);
    expect((await run('getStatus', request({ tenantId: 't2' }))).body.data.here).toBe(false);
  });

  it('is not there while it is switched off', async () => {
    wa.assistantReady.mockReturnValue(false);
    expect((await run('getStatus')).body.data).toEqual({ available: false, connected: false });
    for (const name of ['connect', 'changePin', 'useHere', 'disconnect']) expect((await run(name)).status).toBe(503);
    for (const name of ['checkUnlock', 'unlock']) expect((await run(name, request({ params: { token: 'x' } }))).status).toBe(404);
    expect(links.startConnecting).not.toHaveBeenCalled();
  });

  it('is never for ABS staff helping a business', async () => {
    expect((await run('getStatus', request({ isSupportAccess: true }))).body.data.available).toBe(false);
    for (const name of ['connect', 'changePin', 'useHere', 'disconnect']) expect((await run(name, request({ isSupportAccess: true }))).status).toBe(403);
    expect(links.startConnecting).not.toHaveBeenCalled();
  });

  it('connects the signed-in person for what they have open', async () => {
    links.startConnecting.mockResolvedValue({ words: 'Connect ABS 7K4M-9QX2', expiresAt: 'soon' });
    const { status, body } = await run('connect', request({ body: { pin: '2580', userId: 'someone-else', tenantId: 't9' } }));
    expect(links.startConnecting).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1', shopId: 's1', studioLocationId: null, pin: '2580' });
    expect(status).toBe(201);
    expect(body.data.chatUrl).toBe('https://wa.me/233500000000?text=Connect%20ABS%207K4M-9QX2');
  });

  it('says why a PIN is refused, and passes on what isn\'t expected', async () => {
    links.startConnecting.mockRejectedValueOnce(new links.PinError('Too easy.'));
    expect(await run('connect')).toMatchObject({ status: 400, body: { message: 'Too easy.' } });
    const broken = new Error('database');
    links.startConnecting.mockRejectedValueOnce(broken);
    expect((await run('connect')).next).toHaveBeenCalledWith(broken);
  });

  it('changes only a connection there is; disconnecting twice is fine', async () => {
    links.linkOf.mockResolvedValue({ ...LINK, phone: null });
    expect((await run('changePin', request({ body: { pin: '7391' } }))).status).toBe(404);
    expect((await run('useHere')).status).toBe(404);
    links.linkOf.mockResolvedValue(null);
    expect((await run('disconnect')).status).toBe(200);
    expect(links.disconnect).not.toHaveBeenCalled();
  });
});

describe('the PIN page', () => {
  const enter = (pin = '2580') => run('unlock', request({ params: { token: 't' }, body: { pin } }));

  it('carries on the chat when the PIN is right', async () => {
    links.unlock.mockResolvedValue({ ok: true, pending: { kind: 'text', text: 'hi' } });
    expect(await enter()).toMatchObject({ status: 200, body: { data: { chatUrl: 'https://wa.me/233500000000' } } });
    expect(assistant.unlocked).toHaveBeenCalledWith('233244000001', { kind: 'text', text: 'hi' });
  });

  it('says how many tries are left, then locks and tells the person once', async () => {
    links.unlock.mockResolvedValue({ ok: false, left: 1 });
    expect((await enter()).body).toMatchObject({ code: 'WRONG_PIN', message: 'That PIN is wrong. 1 try left.' });
    links.unlock.mockResolvedValue({ ok: false, left: 0, justLocked: true });
    expect((await enter()).status).toBe(423);
    links.unlock.mockResolvedValue({ ok: false, left: 0, ended: true });
    expect((await enter()).body.code).toBe('EXPIRED');
    expect(assistant.tellLocked).toHaveBeenCalledTimes(1);
    expect(assistant.unlocked).not.toHaveBeenCalled();
  });

  it('an unknown link says nothing about anyone', async () => {
    links.linkForUnlock.mockResolvedValue(null);
    const { status, body } = await enter();
    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toMatch(/Adom|0001/);
    expect(links.unlock).not.toHaveBeenCalled();
    links.linkForUnlock.mockResolvedValue({ ...LINK });
    expect((await run('checkUnlock', request({ params: { token: 't' } }))).body).toEqual({ success: true });
  });
});
