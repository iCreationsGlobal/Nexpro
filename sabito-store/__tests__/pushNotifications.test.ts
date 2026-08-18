jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  modelName: 'Test Device',
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  setNotificationHandler: jest.fn(),
}));

jest.mock('@/services/ordersApi', () => ({
  notificationsApi: {
    register: jest.fn(),
  },
}));

import * as Notifications from 'expo-notifications';

import { getBuyerNotificationRoute, observeBuyerNotificationResponses } from '@/utils/pushNotifications';

const makeResponse = (data: Record<string, unknown>) => ({
  notification: {
    request: {
      content: {
        data,
      },
    },
  },
}) as Notifications.NotificationResponse;

describe('buyer push notification routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
    jest.mocked(Notifications.clearLastNotificationResponseAsync).mockResolvedValue(undefined);
    jest.mocked(Notifications.addNotificationResponseReceivedListener).mockReturnValue({ remove: jest.fn() } as never);
  });

  it('routes order updates with orderId to the order detail screen', () => {
    expect(
      getBuyerNotificationRoute({
        type: 'order_update',
        orderId: 'order 123',
      }),
    ).toBe('/order/order%20123');
  });

  it('routes order updates with saleId from metadata to the order detail screen', () => {
    expect(
      getBuyerNotificationRoute({
        type: 'order_update',
        metadata: { saleId: 987 },
      }),
    ).toBe('/order/987');
  });

  it('routes valid order links when identifiers are absent', () => {
    expect(
      getBuyerNotificationRoute({
        type: 'order_update',
        link: '/order/existing-order',
      }),
    ).toBe('/order/existing-order');
  });

  it('falls back for missing, invalid, stock alert, or seller order payloads', () => {
    expect(getBuyerNotificationRoute(null)).toBeNull();
    expect(getBuyerNotificationRoute([])).toBeNull();
    expect(getBuyerNotificationRoute({ type: 'inventory', metadata: { source: 'stock_alert' } })).toBeNull();
    expect(getBuyerNotificationRoute({ type: 'order', saleId: 'seller-sale', metadata: { source: 'online_store' } })).toBeNull();
    expect(getBuyerNotificationRoute({ type: 'order_update', link: '/orders/not-supported' })).toBeNull();
  });

  it('handles the cold-start last notification response shape', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse({
        type: 'order_update',
        orderId: 42,
      }));

    const onRoute = jest.fn();
    observeBuyerNotificationResponses(onRoute);
    await Promise.resolve();

    expect(onRoute).toHaveBeenCalledWith('/order/42');
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });
});
