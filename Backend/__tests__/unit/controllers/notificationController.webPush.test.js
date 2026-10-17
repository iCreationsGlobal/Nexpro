const mockUserScope = {
  findByPk: jest.fn(),
};

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../config/config', () => ({ nodeEnv: 'test' }));
jest.mock('../../../models', () => ({
  Notification: {},
  User: { scope: jest.fn(() => mockUserScope) },
  Product: {},
  Tenant: {},
}));
jest.mock('../../../middleware/cache', () => ({ invalidateNotificationsCache: jest.fn() }));
jest.mock('../../../utils/performanceLogger', () => ({ startHotPathTimer: jest.fn(() => jest.fn()) }));
jest.mock('../../../services/pushNotificationService', () => ({
  dispatchExpoPushToUsers: jest.fn(),
  getWebPushPublicKey: jest.fn(() => 'public-key'),
  isWebPushConfigured: jest.fn(() => true),
}));

const pushService = require('../../../services/pushNotificationService');
const {
  getWebPushConfig,
  registerPushToken,
  unregisterPushToken,
} = require('../../../controllers/notificationController');

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: {
    p256dh: 'BOr6nSzDkcqz9mLwJx7PlUwHG3t4EsVxQb2k8yWfN1aZ',
    auth: 'k7s9Qd2LmP4xWv1Z',
  },
};

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeUser = (pushDevices = []) => {
  const user = {
    id: 'user-1',
    notificationPreferences: { categories: {}, pushDevices },
    update: jest.fn(async (values) => {
      Object.assign(user, values);
    }),
  };
  return user;
};

describe('notificationController web push', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves the public key when web push is set up', async () => {
    const res = makeRes();
    await getWebPushConfig({}, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { enabled: true, publicKey: 'public-key' } });

    pushService.isWebPushConfigured.mockReturnValueOnce(false);
    const offRes = makeRes();
    await getWebPushConfig({}, offRes);
    expect(offRes.json).toHaveBeenCalledWith({ success: true, data: { enabled: false, publicKey: null } });
  });

  it('stores a browser subscription with its endpoint as the token', async () => {
    const user = makeUser([{ token: 'ExpoPushToken[phone]', platform: 'android' }]);
    mockUserScope.findByPk.mockResolvedValue(user);
    const res = makeRes();
    const next = jest.fn();

    await registerPushToken(
      { body: { platform: 'web', subscription: SUBSCRIPTION, deviceName: 'Chrome on Android' }, user: { id: 'user-1' }, tenantId: 'tenant-1' },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const saved = user.update.mock.calls[0][0].notificationPreferences.pushDevices;
    expect(saved[0]).toMatchObject({
      token: SUBSCRIPTION.endpoint,
      platform: 'web',
      subscription: { endpoint: SUBSCRIPTION.endpoint, keys: SUBSCRIPTION.keys },
      deviceName: 'Chrome on Android',
      tenantId: 'tenant-1',
    });
    expect(saved[0].subscription).not.toHaveProperty('expirationTime');
    expect(saved[1]).toEqual({ token: 'ExpoPushToken[phone]', platform: 'android' });
  });

  it('rejects malformed browser subscriptions', async () => {
    for (const subscription of [
      undefined,
      { endpoint: 'http://insecure.example.com/x', keys: SUBSCRIPTION.keys },
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: 'short', auth: SUBSCRIPTION.keys.auth } },
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: SUBSCRIPTION.keys.p256dh, auth: 'bad key!' } },
    ]) {
      const res = makeRes();
      await registerPushToken({ body: { platform: 'web', subscription }, user: { id: 'user-1' } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockUserScope.findByPk).not.toHaveBeenCalled();
  });

  it('still registers mobile Expo tokens', async () => {
    const user = makeUser();
    mockUserScope.findByPk.mockResolvedValue(user);
    const res = makeRes();
    await registerPushToken(
      { body: { platform: 'ios', token: 'ExpoPushToken[ios-1]' }, user: { id: 'user-1' }, tenantId: 'tenant-1' },
      res,
      jest.fn()
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(user.update.mock.calls[0][0].notificationPreferences.pushDevices[0]).toMatchObject({
      token: 'ExpoPushToken[ios-1]',
      platform: 'ios',
    });

    const missing = makeRes();
    await registerPushToken({ body: { platform: 'android' }, user: { id: 'user-1' } }, missing, jest.fn());
    expect(missing.status).toHaveBeenCalledWith(400);
  });

  it('unregisters one device and leaves the others', async () => {
    const user = makeUser([
      { token: SUBSCRIPTION.endpoint, platform: 'web', subscription: SUBSCRIPTION },
      { token: 'ExpoPushToken[phone]', platform: 'android' },
    ]);
    mockUserScope.findByPk.mockResolvedValue(user);
    const res = makeRes();

    await unregisterPushToken({ body: { token: SUBSCRIPTION.endpoint }, user: { id: 'user-1' } }, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { deviceCount: 1 } });
    expect(user.notificationPreferences.pushDevices).toEqual([{ token: 'ExpoPushToken[phone]', platform: 'android' }]);
  });
});
