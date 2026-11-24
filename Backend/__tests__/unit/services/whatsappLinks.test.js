jest.mock('../../../models', () => ({ WhatsAppLink: { findOne: jest.fn(), create: jest.fn(), update: jest.fn(), sequelize: { literal: (sql) => ({ sql }) } } }));

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { WhatsAppLink } = require('../../../models');
const links = require('../../../services/whatsappLinks');

const row = (data = {}) => {
  const link = { id: 'l1', userId: 'u1', phone: null, pinTries: 0, ...data };
  link.update = jest.fn(async (changes) => Object.assign(link, changes));
  return link;
};
const OWNER = { userId: 'u1', tenantId: 't1', shopId: 's1' };

beforeEach(() => jest.resetAllMocks());

describe('connecting a WhatsApp', () => {
  beforeEach(() => { bcrypt.hash = jest.fn(async (pin) => `hash-of-${pin}`); });

  it.each([['123'], ['1234567'], ['1111'], ['1234'], ['4321'], ['98765'], ['12a4'], [''], [null], [undefined]])('refuses the PIN %p', async (pin) => {
    await expect(links.startConnecting({ ...OWNER, pin })).rejects.toThrow(links.PinError);
    expect(WhatsAppLink.create).not.toHaveBeenCalled();
  });

  it('gives the words to send, and keeps only hashes', async () => {
    WhatsAppLink.findOne.mockResolvedValue(null);
    const { words } = await links.startConnecting({ ...OWNER, pin: '2580' });
    expect(words).toMatch(/^Connect ABS [2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const kept = WhatsAppLink.create.mock.calls[0][0];
    expect(kept).toMatchObject({ userId: 'u1', tenantId: 't1', shopId: 's1', pinHash: 'hash-of-2580' });
    expect(kept.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(kept.codeExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect(links.codeIn(words)).toHaveLength(8);
  });

  it('is refused while a phone is connected', async () => {
    const link = row({ phone: '233244000001' });
    WhatsAppLink.findOne.mockResolvedValue(link);
    await expect(links.startConnecting({ ...OWNER, pin: '2580' })).rejects.toMatchObject({ status: 409 });
    expect(link.update).not.toHaveBeenCalled();
  });

  it('finds the code however it is typed, and nothing in ordinary words', () => {
    expect(links.codeIn('Connect ABS 7K4M-9QX2')).toBe('7K4M9QX2');
    expect(links.codeIn('please connect abs 7k4m 9qx2 thanks')).toBe('7K4M9QX2');
    expect(links.codeIn('connect they were there')).toBeNull();
    expect(links.codeIn('who owes me?')).toBeNull();
    expect(links.codeIn(null)).toBeNull();
  });

  it('only a code that still works connects; the phone is one person\'s at a time', async () => {
    WhatsAppLink.findOne.mockResolvedValueOnce(null);
    expect(await links.finishConnecting({ phone: '233244000001', code: 'AAAABBBB' })).toBeNull();
    expect(WhatsAppLink.findOne.mock.calls[0][0].where.codeExpiresAt[Op.gt]).toBeInstanceOf(Date);

    const mine = row({ codeHash: 'x' });
    const before = row({ id: 'l2', userId: 'u2', phone: '233244000001', unlockedUntil: new Date() });
    WhatsAppLink.findOne.mockResolvedValueOnce(mine).mockResolvedValueOnce(before);
    const done = await links.finishConnecting({ phone: '233244000001', code: 'AAAABBBB' });
    expect(done.movedFrom).toBe(before);
    expect(before).toMatchObject({ phone: null, unlockedUntil: null, conversationId: null });
    expect(mine).toMatchObject({ phone: '233244000001', codeHash: null });
    expect(links.isUnlocked(mine)).toBe(true);
  });
});

describe('the PIN', () => {
  beforeEach(() => { bcrypt.compare = jest.fn(async (pin, hash) => hash === `hash-of-${pin}`); });

  it('is asked for once a day', () => {
    expect(links.isUnlocked({ unlockedUntil: null })).toBe(false);
    expect(links.isUnlocked({ unlockedUntil: new Date(Date.now() - 1) })).toBe(false);
    expect(links.isUnlocked({ unlockedUntil: new Date(Date.now() + 1000) })).toBe(true);
  });

  it('a link works only while it is kept, not past, and for a connected phone', async () => {
    expect(await links.linkForUnlock('short')).toBeNull();
    expect(await links.linkForUnlock('../../etc/passwd-aaaaaaaaaaaaaaaa')).toBeNull();
    expect(WhatsAppLink.findOne).not.toHaveBeenCalled();
    const link = row({ phone: '233244000001' });
    const token = await links.startUnlock(link, { kind: 'text', text: 'hi' });
    expect(link.unlockHash).not.toContain(token);
    await links.linkForUnlock(token);
    const { where } = WhatsAppLink.findOne.mock.calls[0][0];
    expect(where.unlockHash).toBe(link.unlockHash);
    expect(where.unlockExpiresAt[Op.gt]).toBeInstanceOf(Date);
    expect(where.phone[Op.ne]).toBeNull();
  });

  const tryPin = async (link, pin) => {
    // The database counts the try only while the link works and there are tries left.
    WhatsAppLink.update.mockImplementation(async (changes, { where }) => {
      if (link.unlockHash !== where.unlockHash || link.pinTries >= where.pinTries[Op.lt]) return [0, []];
      link.pinTries += 1;
      return [1, [link]];
    });
    return links.unlock({ id: link.id, unlockHash: 'h' }, pin);
  };

  it('the right one opens it for a day, once, and gives back what was asked', async () => {
    const link = row({ unlockHash: 'h', pinHash: 'hash-of-2580', pinTries: 3, pendingMessage: { kind: 'text', text: 'hi' } });
    expect(await tryPin(link, '2580')).toEqual({ ok: true, pending: { kind: 'text', text: 'hi' } });
    expect(link).toMatchObject({ pinTries: 0, unlockHash: null, pendingMessage: null });
    expect(link.unlockedUntil.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(await tryPin(link, '2580')).toEqual({ ok: false, left: 0, ended: true });
  });

  it('five wrong ones end the link and lock it for an hour', async () => {
    const link = row({ unlockHash: 'h', pinHash: 'hash-of-2580', pendingMessage: { kind: 'text' } });
    for (const left of [4, 3, 2, 1]) expect(await tryPin(link, '0000')).toEqual({ ok: false, left });
    expect(await tryPin(link, '0000')).toEqual({ ok: false, left: 0, justLocked: true });
    expect(link).toMatchObject({ unlockHash: null, pendingMessage: null });
    expect(link.unlockedUntil).toBeUndefined();
    expect(links.isPinLocked(link)).toBe(true);
    // Not even the right PIN, on a link that has ended.
    expect(await tryPin(link, '2580')).toEqual({ ok: false, left: 0, ended: true });
  });

  it('a new one asks again at once', async () => {
    bcrypt.hash = jest.fn(async (pin) => `hash-of-${pin}`);
    const link = row({ pinHash: 'x', unlockedUntil: new Date(Date.now() + 1000), pinLockedUntil: new Date(Date.now() + 1000) });
    await links.changePin(link, '7391');
    expect(link).toMatchObject({ pinHash: 'hash-of-7391', unlockedUntil: null, pinLockedUntil: null, pinTries: 0 });
  });
});
