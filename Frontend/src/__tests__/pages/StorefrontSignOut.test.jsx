import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import AccountLayout from '../../../../storefront/src/components/storefront/AccountLayout';
import { StorefrontHeader } from '../../../../storefront/src/components/storefront/StorefrontLayout';
import { CartProvider } from '../../../../storefront/src/context/CartContext';
import { StorefrontAuthProvider, useStorefrontAuth } from '../../../../storefront/src/context/StorefrontAuthContext';
import { ONLINE_STORE_SESSION_KEY, StorefrontModeProvider } from '../../../../storefront/src/context/StorefrontModeContext';
import { WishlistProvider } from '../../../../storefront/src/context/WishlistContext';
import { CheckoutRoute, RequireShopperAuth } from '../../../../storefront/src/online-store/SingleStoreApp';
import ShopperProfilePage from '../../../../storefront/src/pages/ShopperProfilePage';

const ama = { name: 'Ama Shop', email: 'ama@example.com', isEmailVerified: true };
const kofi = { name: 'Kofi Shop', email: 'kofi@example.com', isEmailVerified: true };
const server = vi.hoisted(() => ({ me: null }));

vi.mock('../../../../storefront/src/services/api', () => ({
  default: {
    get: async (url) => (url.endsWith('/auth/me') ? server.me() : { data: {} }),
    post: async () => ({ data: { token: 'kofi-token', customer: { name: 'Kofi Shop', email: 'kofi@example.com', isEmailVerified: true } } }),
  },
}));
vi.mock('../../../../storefront/src/services/storeService', () => ({
  default: {
    getPublicStore: async () => ({ data: { slug: 'demo', displayName: 'Demo Store' } }),
    getWishlist: async () => ({ data: { items: [], listingIds: [] } }),
  },
}));
vi.mock('../../../../storefront/src/pages/CheckoutPage', async () => {
  const { default: Layout } = await import('../../../../storefront/src/components/storefront/AccountLayout');
  return { default: () => <Layout activePath="/checkout" title="Checkout">Checkout page</Layout> };
});
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

const KofiSignsIn = () => {
  const { customer, login } = useStorefrontAuth();
  return (
    <>
      <output data-testid="shopper">{customer?.name}</output>
      <button type="button" onClick={() => login({})}>Kofi signs in</button>
    </>
  );
};
const SignInPopup = () => (useStorefrontAuth().authModal.isOpen ? <p>Sign-in pop-up</p> : null);

const mount = (path, modeProps = { isAbsOnlineStoreHost: true }) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StorefrontAuthProvider>
      <CartProvider>
        <WishlistProvider>
          {/* Same flags as the app: with v7_startTransition, the guard overrides a plain navigate on sign-out. */}
          <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <StorefrontModeProvider {...modeProps}>
              <Where />
              <SignInPopup />
              <KofiSignsIn />
              <Link to="/account/orders">Orders bookmark</Link>
              <Routes>
                <Route path="/" element={<p>Host home</p>} />
                <Route path="/shop/:slug" element={<p>Shop home</p>} />
                <Route path="/login" element={<p>Sign-in page</p>} />
                <Route path="/cart" element={<AccountLayout activePath="/cart" title="Cart">Cart page</AccountLayout>} />
                <Route path="/checkout" element={<CheckoutRoute />} />
                <Route path="/products" element={<StorefrontHeader />} />
                <Route path="/account/profile" element={<RequireShopperAuth><ShopperProfilePage /></RequireShopperAuth>} />
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
  window.localStorage.setItem('sabito_storefront_token', 'ama-token');
  window.localStorage.setItem('sabito_storefront_customer', JSON.stringify(ama));
  server.me = async () => ({ data: { customer: ama } });
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

describe('signing out of the marketplace', () => {
  const ACCOUNT_PAGES = ['/account', '/account/orders', '/account/orders/123', '/account/wishlist', '/account/addresses', '/account/profile'];
  const PAGES = [...ACCOUNT_PAGES, '/checkout', '/products', '/cart'];
  // The session-check screen has a header too; wait for the page itself.
  const header = async () => {
    const banner = await screen.findByRole('banner');
    await waitFor(() => expect(screen.queryByText('Checking your shopper session')).not.toBeInTheDocument());
    return within(banner.isConnected ? banner : await screen.findByRole('banner'));
  };

  beforeEach(() => window.sessionStorage.removeItem(ONLINE_STORE_SESSION_KEY));

  const expectPlainSignIn = async () => {
    await expectAt('/login');
    await screen.findByText('Sign-in page');
    expect(screen.queryByText('Sign-in pop-up')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('sabito_storefront_token')).toBeNull();
  };

  it.each(PAGES)('opens a plain sign-in page from the header on %s', async (path) => {
    mount(path, {});
    const user = userEvent.setup();
    await user.click(await (await header()).findByRole('button', { name: 'Sign out' }));
    await expectPlainSignIn();
  });

  it.each(PAGES)('opens a plain sign-in page from the phone menu on %s', async (path) => {
    mount(path, {});
    const user = userEvent.setup();
    await user.click(await (await header()).findByRole('button', { name: /open .*menu/i }));
    await user.click(within(document.getElementById('storefront-mobile-menu')).getByRole('button', { name: 'Sign out' }));
    await expectPlainSignIn();
  });

  it('opens a plain sign-in page from the profile form', async () => {
    mount('/account/profile', {});
    const user = userEvent.setup();
    const save = await screen.findByRole('button', { name: 'Save profile' });
    await user.click(within(save.closest('form')).getByRole('button', { name: 'Sign out' }));
    await expectPlainSignIn();
  });

  it('still remembers an account page opened afterwards', async () => {
    mount('/account', {});
    const user = userEvent.setup();
    await user.click(await (await header()).findByRole('button', { name: 'Sign out' }));
    await expectPlainSignIn();
    await user.click(screen.getByRole('link', { name: 'Orders bookmark' }));
    await expectAt('/login?returnTo=%2Faccount%2Forders');
  });

  it('still opens the sign-in pop-up for a signed-out shopper at checkout', async () => {
    window.localStorage.removeItem('sabito_storefront_token');
    mount('/checkout', {});
    await screen.findByText('Sign-in pop-up');
    await expectAt('/checkout');
  });
});

describe('signing out before the session check replies', () => {
  const stored = () => JSON.parse(window.localStorage.getItem('sabito_storefront_customer'));
  const tick = () => new Promise((resolve) => { setTimeout(resolve, 20); });
  let reply;

  beforeEach(() => {
    window.sessionStorage.removeItem(ONLINE_STORE_SESSION_KEY);
    const pending = new Promise((resolve, reject) => {
      reply = { ok: () => resolve({ data: { customer: ama } }), fail: () => reject(new Error('expired')) };
    });
    server.me = () => pending;
  });

  it('does not bring the shopper back', async () => {
    mount('/products', {});
    await signOut();
    await expectAt('/login');
    reply.ok();
    await tick();
    expect(stored()).toBeNull();
    expect(window.localStorage.getItem('sabito_storefront_token')).toBeNull();
    expect(screen.getByTestId('shopper')).toBeEmptyDOMElement();
  });

  it.each(['ok', 'fail'])('leaves the next shopper signed in as themselves (reply: %s)', async (outcome) => {
    mount('/products', {});
    const user = await signOut();
    await user.click(screen.getByRole('button', { name: 'Kofi signs in' }));
    reply[outcome]();
    await tick();
    expect(stored()).toEqual(kofi);
    expect(screen.getByTestId('shopper')).toHaveTextContent('Kofi Shop');
    expect(window.localStorage.getItem('sabito_storefront_token')).toBe('kofi-token');
  });

  it('still signs out a shopper whose session was rejected', async () => {
    mount('/account', {});
    reply.fail();
    await expectAt('/login?returnTo=%2Faccount');
    expect(stored()).toBeNull();
  });
});
