jest.mock('../../../config/database', () => ({ sequelize: { where: jest.fn(() => ({})), literal: jest.fn() } }));
jest.mock('../../../models', () => ({
  Notification: { findAll: jest.fn(), bulkCreate: jest.fn(async (rows) => rows) },
  UserTenant: { findAll: jest.fn() },
  User: { findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../../services/pushNotificationService', () => ({ dispatchExpoPushToUsers: jest.fn().mockResolvedValue({ attempted: 0 }) }));
jest.mock('../../../services/notificationPreferenceHelper', () => ({
  getPreferencesForUsers: jest.fn().mockResolvedValue(new Map()),
  isNotificationChannelEnabled: jest.fn(() => true),
  normalizeNotificationCategory: jest.fn((value) => value),
}));
jest.mock('../../../middleware/cache', () => ({ invalidateNotificationsCache: jest.fn() }));
jest.mock('../../../services/websocketService', () => ({ emitNotification: jest.fn() }));

const { Notification, UserTenant } = require('../../../models');
const { dispatchExpoPushToUsers } = require('../../../services/pushNotificationService');
const { notifyOnlineStoreItemsUnavailable } = require('../../../services/notificationService');
const { isShortOfStock, tellStore, unavailableItemsMessage } = require('../../../services/storefrontUnavailableItems');

const store = { tenantId: 't1', slug: 'demo' };
const stand = { listingId: 'l1', title: 'Laptop Stand', requested: 1, left: 0 };
const fan = { listingId: 'l2', title: 'Fan', requested: 3, left: 2 };
const ama = { id: null, name: 'Ama Mensah', email: 'ama@x.com' };
const tell = (items, change = {}) => notifyOnlineStoreItemsUnavailable({ store, items, shopper: ama, phone: '0240000000', ...change });
const sent = () => Notification.bulkCreate.mock.calls.map(([rows]) => rows);
const message = () => sent()[0][0].message;

beforeEach(() => {
  jest.clearAllMocks();
  UserTenant.findAll.mockResolvedValue([{ userId: 'owner' }, { userId: 'manager' }]);
  Notification.findAll.mockResolvedValue([]);
});

describe('telling the store', () => {
  it('says who wants what and how to reach them, in the app and by push', async () => {
    expect(await tell([stand])).toBe(true);
    expect(message()).toBe("Ama Mensah is trying to buy Laptop Stand, but it's not available. Phone: 0240000000");
    expect(sent()[0].map((row) => row.userId)).toEqual(['owner', 'manager']);
    expect(sent()[0][0]).toMatchObject({ tenantId: 't1', type: 'order', priority: 'high', link: '/products' });
    expect(dispatchExpoPushToUsers).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['part of it is left', [fan], 'Ama Mensah is trying to buy 3 × Fan, but only 2 are left. Phone: 0240000000'],
    ['one is left', [{ ...fan, left: 1 }], 'Ama Mensah is trying to buy 3 × Fan, but only 1 is left. Phone: 0240000000'],
    ['several items are short', [stand, fan], "Ama Mensah is trying to buy Laptop Stand, 3 × Fan (2 left), but they're not available. Phone: 0240000000"],
  ])('is clear when %s', async (_name, items, expected) => {
    await tell(items);
    expect(message()).toBe(expected);
  });

  it('copes without a name or phone', async () => {
    await tell([stand], { shopper: {}, phone: '' });
    expect(message()).toBe("A shopper is trying to buy Laptop Stand, but it's not available.");
  });

  it('does not pass on links or odd characters a shopper typed', async () => {
    await tell([stand], { shopper: { name: 'Ama <b>\nhttps://evil.example/x www.evil.example ' + 'x'.repeat(200) }, phone: '024\n<i>000' });
    expect(message()).not.toMatch(/evil|<|>|\n/);
    expect(message().length).toBeLessThan(170);
  });

  const earlier = (change = {}) => ({ metadata: { alertId: 'a1', shopperKey: 'ama@x.com', listingIds: ['l1'], ...change } });

  it('tells the store once an hour about the same shopper and item', async () => {
    Notification.findAll.mockResolvedValue([earlier(), earlier()]);
    expect(await tell([stand])).toBe(true);
    expect(sent()).toHaveLength(0);
    await tell([stand, fan]);
    expect(message()).toBe('Ama Mensah is trying to buy 3 × Fan, but only 2 are left. Phone: 0240000000');
  });

  it('still tells it about another shopper', async () => {
    Notification.findAll.mockResolvedValue([earlier({ shopperKey: 'kofi@x.com' })]);
    expect(await tell([stand])).toBe(true);
    expect(sent()).toHaveLength(1);
  });

  it('only looks back an hour, at this store', async () => {
    await tell([stand]);
    const { where } = Notification.findAll.mock.calls[0][0];
    expect(where.tenantId).toBe('t1');
    const since = where.createdAt[Object.getOwnPropertySymbols(where.createdAt)[0]];
    expect(Math.abs(Date.now() - since.getTime() - 3600000)).toBeLessThan(5000);
  });

  it('stops after 20 alerts in an hour, counting alerts rather than copies', async () => {
    const alerts = (n, copies) => Array.from({ length: n }, (_, i) => Array.from({ length: copies }, () => earlier({ alertId: `a${i}`, shopperKey: `s${i}` }))).flat();
    Notification.findAll.mockResolvedValue(alerts(19, 4));
    expect(await tell([stand])).toBe(true);
    Notification.findAll.mockResolvedValue(alerts(20, 1));
    expect(await tell([stand])).toBe(false);
    expect(sent()).toHaveLength(1);
  });

  it('knows when nobody could be told', async () => {
    UserTenant.findAll.mockResolvedValue([]);
    expect(await tell([stand])).toBe(false);
    expect(await notifyOnlineStoreItemsUnavailable({ store: {}, items: [stand] })).toBe(false);
  });

  it('never stops the shopper when the alert fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    UserTenant.findAll.mockRejectedValue(new Error('database down'));
    expect(await tellStore({ store, items: [stand], shopper: ama })).toBe(false);
  });

  it('does not keep the shopper waiting', async () => {
    jest.useFakeTimers();
    UserTenant.findAll.mockReturnValue(new Promise(() => {}));
    const told = tellStore({ store, items: [stand], shopper: ama });
    await jest.advanceTimersByTimeAsync(5000);
    expect(await told).toBe(false);
    jest.useRealTimers();
  });
});

describe('what the shopper reads', () => {
  it.each([
    [[stand], true, "Laptop Stand isn't available right now. We've told the store."],
    [[stand], false, "Laptop Stand isn't available right now. Please contact the store."],
    [[fan], true, "Only 2 of Fan are available right now. We've told the store."],
    [[{ ...fan, left: 1 }], true, "Only 1 of Fan is available right now. We've told the store."],
    [[stand, fan], true, "These items aren't available right now: Laptop Stand, Fan (only 2 left). We've told the store."],
  ])('%#', (items, told, expected) => {
    expect(unavailableItemsMessage(items, told)).toBe(expected);
  });
});

describe('running short', () => {
  it.each([
    [{ available: true, quantityOnHand: 5, trackStock: true }, 5, false],
    [{ available: true, quantityOnHand: 4, trackStock: true }, 5, true],
    [{ available: false, quantityOnHand: 0, trackStock: true }, 1, true],
    [{ available: true, quantityOnHand: 0, trackStock: false }, 50, false],
  ])('%o for %i: %s', (availability, quantity, short) => {
    expect(isShortOfStock(availability, quantity)).toBe(short);
  });
});
