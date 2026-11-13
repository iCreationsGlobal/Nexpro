jest.mock('@/services/api', () => ({
  api: {
    post: jest.fn(),
    defaults: { baseURL: 'https://api.africanbusinesssuite.com/api' },
  },
}));

import { api } from '@/services/api';
import { cardPaymentReturnUrl, saleService } from '@/services/saleService';
import { getErrorMessage, WORKSPACE_LOCKED_MESSAGE } from '@/utils/errorMessages';

const post = api.post as jest.Mock;

// App Store 3.1.1: the native app must not tell people to pay for the ABS plan elsewhere.
describe('locked workspace message', () => {
  const lockReply = (billingStatus: string) => ({
    response: {
      data: {
        success: false,
        errorCode: 'SUBSCRIPTION_LOCKED',
        message: 'Your subscription has expired. Renew your plan to continue using the app.',
        checkoutUrl: 'https://myapp.africanbusinesssuite.com/checkout',
        billingStatus,
        upgradeRequired: true,
      },
    },
  });

  it("replaces the server's renew wording", () => {
    const message = getErrorMessage(lockReply('locked'));
    expect(message).toBe(WORKSPACE_LOCKED_MESSAGE);
    expect(message).not.toMatch(/renew|upgrade|checkout|subscribe/i);
  });

  it('says suspended when suspended', () => {
    expect(getErrorMessage(lockReply('suspended'))).toBe('Workspace access is suspended. Contact ABS support.');
  });

  it('leaves other server messages alone', () => {
    expect(getErrorMessage({ response: { data: { message: 'Product not found' } } })).toBe('Product not found');
  });
});

describe('card sale return page', () => {
  beforeEach(() => post.mockReset().mockResolvedValue({ data: { success: true } }));

  it('sends Paystack a plain return page on the API, never the web dashboard', async () => {
    await saleService.initializePaystackPayment('s1', { email: 'ama@example.com' });
    expect(post).toHaveBeenCalledWith('/sales/s1/initialize-paystack', {
      email: 'ama@example.com',
      callbackUrl: 'https://api.africanbusinesssuite.com/api/public/payment-complete',
    });
    expect(cardPaymentReturnUrl()).not.toMatch(/myapp\.|checkout/);
  });
});
