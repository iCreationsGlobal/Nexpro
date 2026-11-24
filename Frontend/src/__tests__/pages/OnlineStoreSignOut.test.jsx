import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import AccountLayout from '../../../../storefront/src/components/storefront/AccountLayout';
import { CartProvider } from '../../../../storefront/src/context/CartContext';
import { StorefrontAuthProvider } from '../../../../storefront/src/context/StorefrontAuthContext';
import { ONLINE_STORE_SESSION_KEY, StorefrontModeProvider } from '../../../../storefront/src/context/StorefrontModeContext';
import { WishlistProvider } from '../../../../storefront/src/context/WishlistContext';
import { RequireShopperAuth } from '../../../../storefront/src/online-store/SingleStoreApp';

vi.mock('../../../../storefront/src/services/authService', () => ({
  default: {
    getToken: () => window.localStorage.getItem('sabito_storefront_token'),
    getStoredCustomer: () => JSON.parse(window.localStorage.getItem('sabito_storefront_customer')),
    getMe: async () => ({ customer: JSON.parse(window.localStorage.getItem('sabito_storefront_customer')) }),
    getPublicConfig: async () => ({}),
    logout: () => {
      window.localStorage.removeItem('sabito_storefront_token');
      window.localStorage.removeItem('sabito_storefront_customer');
    },
  },
}));
vi.mock('../../../../storefront/src/services/storeService', () => ({
  default: {
    getPublicStore: async () => ({ data: { slug: 'demo', displayName: 'Demo Store' } }),
    getWishlist: async () => ({ data: { items: [], listingIds: [] } }),
  },
}));
vi.mock('../../../../storefront/src/utils/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

// The shared setup stubs both storages to always return null; give them real values here.
const backWithRealValues = (storage) => {
  const values = new Map();
  storage.getItem.mockImplementation((key) => values.get(key) ?? null);
  storage.setItem.mockImplementation((key, value) => { values.set(key, String(value)); });
  storage.removeItem.mockImplementation((key) => { values.delete(key); });
  storage.clear.mockImplementation(() => values.clear());
};

const CART_KEY = 'sabito_storefront_cart';
const cartItem = { listingId: 'l1', storeSlug: 'demo', quantity: 2, unitPrice: 50, store: { slug: 'demo', displayName: 'Demo Store' } };

const Where = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const mount = (path, modeProps = { isAbsOnlineStoreHost: true }) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StorefrontAuthProvider>
      <CartProvider>
        <WishlistProvider>
          {/* Same flags as the app: with v7_startTransition, the guard overrides a plain navigate on sign-out. */}
          <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <StorefrontModeProvider {...modeProps}>
              <Where />
              <Link to="/account/orders">Orders bookmark</Link>
              <Routes>
                <Route path="/" element={<p>Host home</p>} />
                <Route path="/shop/:slug" element={<p>Shop home</p>} />
                <Route path="/login" element={<p>Sign-in page</p>} />
                <Route path="/cart" element={<AccountLayout activePath="/cart" title="Cart">Cart page</AccountLayout>} />
                <Route path="/checkout" element={<AccountLayout activePath="/checkout" title="Checkout">Checkout page</AccountLayout>} />
                <Route path="/account/*" element={<RequireShopperAuth><AccountLayout title="My orders">Account page</AccountLayout></RequireShopperAuth>} />
              </Routes>
            </StorefrontModeProvider>
          </MemoryRouter>
        </WishlistProvider>
      </CartProvider>
    </StorefrontAuthProvider>
  </QueryClientProvider>,
);

const signOut = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  return user;
};
const expectAt = (path) => waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^${path.replace('?', '\\?')}$`)));

afterEach(() => {
  cleanup();
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    storage.getItem.mockImplementation(() => null);
    ['setItem', 'removeItem', 'clear'].forEach((method) => storage[method].mockReset());
  });
});
beforeEach(() => {
  backWithRealValues(window.localStorage);
  backWithRealValues(window.sessionStorage);
  window.localStorage.setItem('sabito_storefront_token', 'token');
  window.localStorage.setItem('sabito_storefront_customer', JSON.stringify({ name: 'Ama', email: 'ama@example.com', isEmailVerified: true }));
  window.sessionStorage.setItem(ONLINE_STORE_SESSION_KEY, JSON.stringify({ slug: 'demo', pathPrefix: 'shop' }));
});

describe('signing out of an online store', () => {
  it.each(['/account', '/account/orders', '/account/orders/123', '/account/wishlist', '/account/addresses', '/account/profile'])(
    'goes back to the shop from %s, not to the sign-in page',
    async (path) => {
      mount(path);
      await signOut();
      await expectAt('/shop/demo');
      expect(screen.getByText('Shop home')).toBeInTheDocument();
      expect(window.localStorage.getItem('sabito_storefront_token')).toBeNull();
      expect(window.localStorage.getItem('sabito_storefront_customer')).toBeNull();
    },
  );

  it('keeps the cart', async () => {
    window.localStorage.setItem(CART_KEY, JSON.stringify([cartItem]));
    mount('/account');
    await signOut();
    await expectAt('/shop/demo');
    expect(JSON.parse(window.localStorage.getItem(CART_KEY))).toEqual([cartItem]);
  });

  it('asks for a sign-in again when an account page is opened afterwards', async () => {
    mount('/account/orders');
    const user = await signOut();
    await expectAt('/shop/demo');
    await user.click(screen.getByRole('link', { name: 'Orders bookmark' }));
    await expectAt('/login?returnTo=%2Faccount%2Forders');
  });

  it('goes to the home page on a merchant domain', async () => {
    mount('/account', { isCustomDomain: true, customDomainSlug: 'demo', forceMode: 'online-store' });
    await signOut();
    await expectAt('/');
  });

  it('goes to the sign-in page on the shared host when no shop is known', async () => {
    window.sessionStorage.removeItem(ONLINE_STORE_SESSION_KEY);
    mount('/account');
    await signOut();
    await expectAt('/login');
  });

  it.each(['/cart', '/checkout'])('is not offered on %s', async (path) => {
    mount(path);
    await screen.findByRole('link', { name: 'Account' });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('is not offered to guests', async () => {
    window.localStorage.removeItem('sabito_storefront_token');
    mount('/cart');
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
