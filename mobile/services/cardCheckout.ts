import * as WebBrowser from 'expo-web-browser';

import { saleService } from './saleService';

/**
 * Open Paystack's checkout page for what is left to pay on a sale. The customer enters their card
 * there (ABS never sees card details); the page also offers MoMo. Payment goes to the business's
 * Paystack subaccount (see canTakeCardCheckout).
 *
 * Resolves once the page is closed on iOS (`returned: true`). Android only reports that it opened,
 * so the caller checks the payment when the app comes back to the foreground.
 */
export async function openCardCheckout(
  saleId: string,
  email?: string | null
): Promise<{ reference: string | null; returned: boolean }> {
  const res = await saleService.initializePaystackPayment(saleId, email ? { email } : {});
  const data = (res?.data ?? res) as { authorizationUrl?: string; authorization_url?: string; reference?: string } | null;
  const url = data?.authorizationUrl || data?.authorization_url;
  if (!url) throw new Error('Could not open the card payment page. Try again.');

  const result = await WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle: 'done',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
  return {
    reference: data?.reference ?? null,
    returned: result.type !== WebBrowser.WebBrowserResultType.OPENED,
  };
}
