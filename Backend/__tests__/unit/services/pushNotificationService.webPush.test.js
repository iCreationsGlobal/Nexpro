const mockUserScope = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
};

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

jest.mock('../../../models', () => ({
  StorefrontCustomer: { findAll: jest.fn(), findByPk: jest.fn() },
  User: {
    scope: jest.fn(() => mockUserScope),
  },
}));

const axios = require('axios');
const webpush = require('web-push');
const {
  dispatchExpoPushToUsers,
  getPushTargetsForUsers,
  getWebPushTargetsForUsers,
  isWebPushConfigured,
  isWebPushDevice,
} = require('../../../services/pushNotificationService');

const webDevice = (name, extra = {}) => ({
  token: `https://push.example.com/${name}`,
  platform: 'web',
  subscription: {
    endpoint: `https://push.example.com/${name}`,
    keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
  },
  tenantId: 'tenant-1',
  ...extra,
});

const VAPID_ENV = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PLATFORM_EMAIL_FROM'];

describe('pushNotificationService web push', () => {
  const savedEnv = {};

  beforeEach(() => {
    jest.clearAllMocks();
    VAPID_ENV.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
    axios.post.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    VAPID_ENV.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  });

  const configureVapid = () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    process.env.VAPID_SUBJECT = 'ops@example.com';
  };

  it('is off until the keys and a contact are configured', () => {
    expect(isWebPushConfigured()).toBe(false);
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
    expect(isWebPushConfigured()).toBe(false);
    process.env.PLATFORM_EMAIL_FROM = 'info@example.com';
    expect(isWebPushConfigured()).toBe(true);
  });

  it('recognises stored browser subscriptions', () => {
    expect(isWebPushDevice(webDevice('a'))).toBe(true);
    expect(isWebPushDevice({ ...webDevice('a'), token: 'something-else' })).toBe(false);
    expect(isWebPushDevice({ token: 'ExpoPushToken[x]', platform: 'ios' })).toBe(false);
  });

  it('keeps web subscriptions out of Expo targets and Expo tokens out of web targets', async () => {
    mockUserScope.findAll.mockResolvedValue([
      {
        id: 'user-1',
        notificationPreferences: {
          pushDevices: [
            { token: 'ExpoPushToken[token-a]', tenantId: 'tenant-1' },
            webDevice('a'),
            webDevice('a'),
            webDevice('other-tenant', { tenantId: 'tenant-2' }),
          ],
        },
      },
      {
        id: 'user-2',
        notificationPreferences: {
          categories: { order: { in_app: true, email: false, push: false } },
          pushDevices: [webDevice('muted')],
        },
      },
    ]);

    const args = { userIds: ['user-1', 'user-2'], tenantId: 'tenant-1', category: 'order' };
    await expect(getPushTargetsForUsers(args)).resolves.toEqual([
      { userId: 'user-1', token: 'ExpoPushToken[token-a]' },
    ]);
    await expect(getWebPushTargetsForUsers(args)).resolves.toEqual([
      { ownerId: 'user-1', token: webDevice('a').token, subscription: webDevice('a').subscription },
    ]);
  });

  it('does not send web push without VAPID keys', async () => {
    mockUserScope.findAll.mockResolvedValue([
      { id: 'user-1', notificationPreferences: { pushDevices: [webDevice('a')] } },
    ]);

    const result = await dispatchExpoPushToUsers({
      tenantId: 'tenant-1',
      userIds: ['user-1'],
      title: 'New order',
      message: 'Order #12',
      type: 'order',
    });

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, attempted: 0, invalidTokens: 0 });
  });

  it('sends to browsers, removes expired subscriptions and adds up the counts', async () => {
    configureVapid();
    const user = {
      id: 'user-1',
      notificationPreferences: {
        pushDevices: [webDevice('live'), webDevice('gone'), { token: 'ExpoPushToken[token-a]', tenantId: 'tenant-1' }],
      },
      update: jest.fn(),
    };
    mockUserScope.findAll.mockResolvedValue([user]);
    mockUserScope.findByPk.mockResolvedValue(user);
    axios.post.mockResolvedValue({ data: { data: [{ status: 'ok' }] } });
    webpush.sendNotification.mockImplementation((subscription) => (
      subscription.endpoint.endsWith('/gone')
        ? Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 }))
        : Promise.resolve({ statusCode: 201 })
    ));

    const result = await dispatchExpoPushToUsers({
      tenantId: 'tenant-1',
      userIds: ['user-1'],
      title: 'Payment received',
      message: 'Invoice INV-1 was paid',
      type: 'payment',
      priority: 'high',
      metadata: { saleId: 'sale-9' },
      link: '/sales?saleId=sale-9',
    });

    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.com', 'public-key', 'private-key');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload, options] = webpush.sendNotification.mock.calls[0];
    expect(subscription).toEqual(webDevice('live').subscription);
    expect(JSON.parse(payload)).toMatchObject({
      title: 'Payment received',
      body: 'Invoice INV-1 was paid',
      url: '/sales?saleId=sale-9',
      tag: 'sale-9',
    });
    expect(options).toMatchObject({ urgency: 'high' });

    expect(user.update).toHaveBeenCalledWith({
      notificationPreferences: {
        pushDevices: [webDevice('live'), { token: 'ExpoPushToken[token-a]', tenantId: 'tenant-1' }],
      },
    });
    expect(result).toEqual({ sent: 2, attempted: 3, invalidTokens: 1 });
  });

  it('only opens in-app paths from a notification', async () => {
    configureVapid();
    mockUserScope.findAll.mockResolvedValue([
      { id: 'user-1', notificationPreferences: { pushDevices: [webDevice('a')] } },
    ]);
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 });

    await dispatchExpoPushToUsers({
      tenantId: 'tenant-1',
      userIds: ['user-1'],
      title: 'Hello',
      link: 'https://evil.example.com/phish',
    });

    expect(JSON.parse(webpush.sendNotification.mock.calls[0][1]).url).toBe('/dashboard');
  });
});
