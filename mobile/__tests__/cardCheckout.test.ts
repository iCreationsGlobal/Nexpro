jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserPresentationStyle: { FULL_SCREEN: 'fullScreen' },
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' },
}));
jest.mock('@/services/saleService', () => ({
  saleService: { initializePaystackPayment: jest.fn() },
}));

import * as WebBrowser from 'expo-web-browser';
import { openCardCheckout } from '@/services/cardCheckout';
import { saleService } from '@/services/saleService';

const initialize = saleService.initializePaystackPayment as jest.Mock;
const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
const CHECKOUT = { success: true, data: { authorizationUrl: 'https://checkout.paystack.com/abc', reference: 'SALE-s1-1' } };

describe('openCardCheckout', () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens Paystack's page for the sale and reports when the cashier closes it (iOS)", async () => {
    initialize.mockResolvedValue(CHECKOUT);
    openBrowser.mockResolvedValue({ type: 'dismiss' });

    await expect(openCardCheckout('s1', 'ama@example.com')).resolves.toEqual({ reference: 'SALE-s1-1', returned: true });
    expect(initialize).toHaveBeenCalledWith('s1', { email: 'ama@example.com' });
    expect(openBrowser).toHaveBeenCalledWith('https://checkout.paystack.com/abc', expect.objectContaining({ dismissButtonStyle: 'done' }));
  });

  it('on Android only knows the page opened, so the screen checks when the app comes back', async () => {
    initialize.mockResolvedValue({ data: { authorization_url: 'https://checkout.paystack.com/xyz' } });
    openBrowser.mockResolvedValue({ type: 'opened' });

    await expect(openCardCheckout('s2')).resolves.toEqual({ reference: null, returned: false });
    expect(initialize).toHaveBeenCalledWith('s2', {});
  });

  it('does not open anything when Paystack gives no page', async () => {
    initialize.mockResolvedValue({ success: true, data: {} });
    await expect(openCardCheckout('s3')).rejects.toThrow('Could not open the card payment page');
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
