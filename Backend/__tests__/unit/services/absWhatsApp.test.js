const wa = require('../../../services/absWhatsApp');

const READY = { ABS_WHATSAPP_ASSISTANT: 'true', ABS_WHATSAPP_NUMBER: '+233 50 000 0000', WHATSAPP_PHONE_NUMBER_ID: '999', WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_APP_SECRET: 's' };
const originalEnv = process.env;
const originalFetch = global.fetch;
let sent;
const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(body.bytes || 10) });

beforeEach(() => {
  process.env = { ...originalEnv, ...READY };
  sent = [];
  global.fetch = jest.fn(async (url, options) => { sent.push({ url, body: options.body ? JSON.parse(options.body) : null, options }); return answer({ messages: [{ id: 'x' }] }); });
});
afterAll(() => { process.env = originalEnv; global.fetch = originalFetch; });

describe('ABS\'s WhatsApp number', () => {
  it.each(Object.keys(READY))('is off without %s', (name) => {
    expect(wa.assistantReady()).toBe(true);
    process.env[name] = '';
    expect(wa.assistantReady()).toBe(false);
    expect(wa.isAbsNumber('999')).toBe(false);
  });

  it('knows its own messages from a business\'s', () => {
    expect(wa.isAbsNumber('999')).toBe(true);
    expect(wa.isAbsNumber('555')).toBe(false);
    expect(wa.isAbsNumber(undefined)).toBe(false);
    expect(wa.chatLink('Connect ABS 7K4M-9QX2')).toBe('https://wa.me/233500000000?text=Connect%20ABS%207K4M-9QX2');
  });

  it('keeps to WhatsApp\'s limits', async () => {
    await wa.sendButtons('233', 'Body', [1, 2, 3, 4].map((n) => ({ id: `b${n}`, title: 'Compare with yesterday' })));
    const { buttons } = sent[0].body.interactive.action;
    expect(buttons).toHaveLength(3);
    expect(buttons[0].reply.title).toHaveLength(20);
    await wa.sendList('233', 'Body', 'Menu', Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: 'A name much longer than it may be', detail: 'd'.repeat(90) })));
    const [{ rows }] = sent[1].body.interactive.action.sections;
    expect(rows).toHaveLength(10);
    expect(rows[0].title).toHaveLength(24);
    expect(rows[0].description).toHaveLength(72);
    await wa.sendLink('233', 'Body', 'Open the invoices page', 'https://app/x');
    expect(sent[2].body.interactive).toMatchObject({ type: 'cta_url', action: { parameters: { url: 'https://app/x' } } });
    expect(sent[2].body.interactive.action.parameters.display_text).toHaveLength(20);
    expect(sent.every((m) => m.body.to === '233' && m.options.headers.Authorization === 'Bearer tok')).toBe(true);
  });

  it('sends long words first, then the buttons', async () => {
    await wa.sendButtons('233', 'word '.repeat(300), [{ id: 'menu', title: 'Menu' }]);
    expect(sent.map((m) => m.body.type)).toEqual(['text', 'interactive']);
    await wa.sendText('233', 'word '.repeat(2500));
    expect(sent.slice(2)).toHaveLength(4);
    expect(sent.slice(2).every((m) => m.body.text.body.length <= 4096)).toBe(true);
  });

  it('tries once more when Meta has a hiccup, not when Meta says no', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(answer({}, 500)).mockResolvedValueOnce(answer({}));
    await wa.sendText('233', 'hi');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    global.fetch = jest.fn().mockResolvedValue(answer({ error: { message: 'Re-engagement message' } }, 400));
    await expect(wa.sendText('233', 'hi')).rejects.toThrow('Meta answered 400: Re-engagement message');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches a voice note, unless it is too big or not a media id', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(answer({ url: 'https://lookaside/x', mime_type: 'audio/ogg; codecs=opus', file_size: 10 })).mockResolvedValueOnce(answer({ bytes: 900 }));
    await expect(wa.fetchAudio('123')).resolves.toMatchObject({ mime: 'audio/ogg', bytes: expect.any(Buffer) });
    global.fetch = jest.fn().mockResolvedValue(answer({ url: 'https://lookaside/x', file_size: 9e6 }));
    await expect(wa.fetchAudio('123')).rejects.toMatchObject({ tooBig: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await expect(wa.fetchAudio('../me')).rejects.toThrow('Not a media id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
