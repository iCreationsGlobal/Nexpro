jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  modelName: 'Test Device',
}));

jest.mock('expo-constants', () => ({
  easConfig: { projectId: '8dff9445-6979-427f-b84e-aae48f077d82' },
  expoConfig: { extra: { eas: { projectId: '8dff9445-6979-427f-b84e-aae48f077d82' } } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  setNotificationHandler: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('@/services/notificationService', () => ({
  notificationService: {
    registerPushToken: jest.fn(),
  },
}));

import * as Notifications from 'expo-notifications';

import { getSellerNotificationRoute, observeSellerNotificationResponses } from '@/utils/pushNotifications';

const makeResponse = (data: Record<string, unknown>) => ({
  notification: {
    request: {
      content: {
        data,
      },
    },
  },
}) as Notifications.NotificationResponse;

describe('seller push notification routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
    jest.mocked(Notifications.clearLastNotificationResponseAsync).mockResolvedValue(undefined);
    jest.mocked(Notifications.addNotificationResponseReceivedListener).mockReturnValue({ remove: jest.fn() } as never);
  });

  it('routes online store orders with saleId to the order detail screen', () => {
    expect(
      getSellerNotificationRoute({
        type: 'order',
        saleId: 'sale 123',
        metadata: { source: 'online_store' },
      }),
    ).toBe('/store-order/sale%20123');
  });

  it('routes online store order notifications without saleId to the store Orders section', () => {
    expect(
      getSellerNotificationRoute({
        type: 'order',
        link: '/store/orders',
        metadata: { source: 'online_store' },
      }),
    ).toBe('/(tabs)/store?section=orders');
  });

  it('routes stock alerts to the products tab', () => {
    expect(
      getSellerNotificationRoute({
        type: 'inventory',
        metadata: { source: 'stock_alert' },
      }),
    ).toBe('/(tabs)/products');
  });

  it('falls back for missing, invalid, or unrelated payloads', () => {
    expect(getSellerNotificationRoute(null)).toBeNull();
    expect(getSellerNotificationRoute([])).toBeNull();
    expect(getSellerNotificationRoute({ type: 'order_update', orderId: 'buyer-order' })).toBeNull();
    expect(getSellerNotificationRoute({ type: 'inventory' })).toBeNull();
  });

  it('handles the cold-start last notification response shape', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse({
        type: 'order',
        saleId: 42,
        metadata: { source: 'online_store' },
      }));

    const onRoute = jest.fn();
    observeSellerNotificationResponses(onRoute);
    await Promise.resolve();

    expect(onRoute).toHaveBeenCalledWith('/store-order/42');
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });
});
