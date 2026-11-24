import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';

import { OnlineStoreChrome } from '../../../../storefront/src/online-store/SingleStoreApp';
import StoreMobileHeader from '../../../../storefront/src/online-store/StoreMobileHeader';
import {
  getActiveStorePage,
  getStorePages,
  hasStoreTabBar,
  isServiceStore,
} from '../../../../storefront/src/online-store/storeNavigation';
import { StorefrontModeProvider } from '../../../../storefront/src/context/StorefrontModeContext';

const mocks = vi.hoisted(() => ({ auth: { isAuthenticated: false }, cart: { cartSummary: { itemCount: 0 } } }));
vi.mock('../../../../storefront/src/context/StorefrontAuthContext', () => ({ useStorefrontAuth: () => mocks.auth }));
vi.mock('../../../../storefront/src/context/CartContext', () => ({ useCart: () => mocks.cart }));

const shop = { slug: 'demo', displayName: 'Demo Store', templateId: 'classic', primaryColor: '#7c3aed', whatsappNumber: '233200000000' };
const salon = { slug: 'glow', displayName: 'Glow', templateId: 'bold', storeMode: 'studio' };
const onSharedHost = { isAbsOnlineStoreHost: true };
const onMerchantDomain = { isCustomDomain: true, customDomainSlug: 'demo', forceMode: 'online-store' };

const Where = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
};

// `header: false` is a page that has no phone header of its own (checkout, or still loading).
const tree = (path, { store = shop, mode = onSharedHost, header = true } = {}) => (
  <MemoryRouter initialEntries={[path]}>
    <StorefrontModeProvider {...mode}>
      <OnlineStoreChrome>
        <Where />
        <Link to="/checkout">go checkout</Link>
        <Link to="/shop/demo">go demo</Link>
        <Link to="/shop/other">go other shop</Link>
        <Link to="/">go host home</Link>
        {header ? <StoreMobileHeader store={store} /> : null}
        <input aria-label="Note" />
        <input type="checkbox" aria-label="Agree" />
      </OnlineStoreChrome>
    </StorefrontModeProvider>
  </MemoryRouter>
);
const mount = (path, options) => render(tree(path, options));
const bar = () => screen.queryByRole('navigation', { name: 'Store' });
const tabs = () => within(bar()).getAllByRole('link').map((link) => [link.textContent.replace(/\d+\+?$/, ''), link.getAttribute('href')]);
const expectAt = (path) => expect(screen.getByTestId('location').textContent).toBe(path);

afterEach(cleanup);
beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.cart.cartSummary = { itemCount: 0 };
  window.scrollTo = vi.fn();
});

describe('store navigation rules', () => {
  it('builds pages under a shop path and at the root of a merchant domain', () => {
    expect(getStorePages({ homePath: '/shop/demo' }).map((page) => page.to)).toEqual([
      '/shop/demo', '/shop/demo/products', '/shop/demo/categories', '/shop/demo/about', '/shop/demo/reviews',
    ]);
    expect(getStorePages({ homePath: '/', serviceStore: true }).map((page) => [page.label, page.to])).toEqual([
      ['Home', '/'], ['All Services', '/services'], ['Categories', '/categories'], ['About Us', '/about'], ['Reviews', '/reviews'],
    ]);
  });

  it.each([
    ['/', 'home'], ['/shop/demo', 'home'], ['/shop/demo/', 'home'], ['/stores/demo', 'home'],
    ['/shop/demo/products', 'catalog'], ['/shop/demo/products/blue-shirt', 'catalog'], ['/shop/demo/services/braids', 'catalog'],
    ['/products', 'catalog'], ['/shop/demo/categories', 'categories'], ['/about', 'about'], ['/shop/demo/reviews', 'reviews'],
    ['/cart', 'cart'], ['/account', 'account'], ['/account/orders/1', 'account'], ['/track-order', ''], ['/checkout/success/1', ''],
  ])('%s belongs to "%s"', (path, page) => {
    expect(getActiveStorePage(path)).toBe(page);
  });

  it.each([
    ['/shop/demo', true], ['/shop/demo/products/x', true], ['/cart', true], ['/account/orders', true], ['/track-order', true], ['/checkout/success/1', true],
    ['/checkout', false], ['/checkout/', false], ['/checkout/paystack-callback', false], ['/login', false], ['/signup', false],
    ['/verify-email', false], ['/forgot-password', false], ['/reset-password', false], ['/', false], ['/shop', false], ['/templates', false],
  ])('%s has a bottom bar: %s', (path, expected) => {
    expect(hasStoreTabBar(path)).toBe(expected);
  });

  it('has a bottom bar at the root of a merchant domain, but still not on its checkout', () => {
    expect(hasStoreTabBar('/', { isCustomDomain: true })).toBe(true);
    expect(hasStoreTabBar('/checkout', { isCustomDomain: true })).toBe(false);
  });

  it.each([
    [{ storeMode: 'studio' }, true], [{ studioLocationId: 'x' }, true], [{ businessType: 'salon' }, true],
    [{ businessType: 'shop' }, false], [{}, false], [null, false],
  ])('%o is a service store: %s', (store, expected) => {
    expect(isServiceStore(store)).toBe(expected);
  });
});

describe('bottom bar', () => {
  it('links to the shop pages, cart and sign-in, returning to the page after sign-in', () => {
    mount('/shop/demo/products?search=red');
    expect(tabs()).toEqual([
      ['Home', '/shop/demo'], ['Shop', '/shop/demo/products'], ['Categories', '/shop/demo/categories'], ['Cart', '/cart'],
      ['Sign in', '/login?returnTo=%2Fshop%2Fdemo%2Fproducts%3Fsearch%3Dred'],
    ]);
    expect(within(bar()).getByRole('link', { current: 'page' })).toHaveTextContent('Shop');
  });

  it('shows Account when signed in, and Services for a service store', () => {
    mocks.auth.isAuthenticated = true;
    mount('/shop/glow', { store: salon });
    expect(tabs()).toEqual([
      ['Home', '/shop/glow'], ['Services', '/shop/glow/services'], ['Categories', '/shop/glow/categories'], ['Cart', '/cart'], ['Account', '/account'],
    ]);
  });

  it('uses root paths on a merchant domain', () => {
    mount('/products', { mode: onMerchantDomain });
    expect(tabs().slice(0, 3).map(([, to]) => to)).toEqual(['/', '/products', '/categories']);
  });

  it('shows and announces the cart count', () => {
    mocks.cart.cartSummary = { itemCount: 2 };
    mount('/shop/demo');
    expect(within(bar()).getByRole('link', { name: 'Cart, 2 items' })).toHaveTextContent('2');
  });

  it('caps a large cart count', () => {
    mocks.cart.cartSummary = { itemCount: 140 };
    mount('/shop/demo');
    expect(within(bar()).getByRole('link', { name: 'Cart, 140 items' })).toHaveTextContent('99+');
  });

  it('goes to the top of the page when a tab is tapped', async () => {
    mount('/shop/demo');
    await userEvent.click(within(bar()).getByRole('link', { name: 'Categories' }));
    expectAt('/shop/demo/categories');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('hides on checkout and reserves no space there', async () => {
    mount('/shop/demo');
    expect(document.documentElement).toHaveClass('sf-tab-bar');
    await userEvent.click(screen.getByRole('link', { name: 'go checkout' }));
    expect(bar()).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('sf-tab-bar');
  });

  it('hides on the shared host landing page', async () => {
    mount('/shop/demo');
    await userEvent.click(screen.getByRole('link', { name: 'go host home' }));
    expect(bar()).not.toBeInTheDocument();
  });

  it("is never shown on another shop's page, and comes back for its own", async () => {
    mount('/shop/demo');
    await userEvent.click(screen.getByRole('link', { name: 'go other shop' }));
    expect(bar()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'go demo' }));
    expect(bar()).toBeInTheDocument();
  });

  it('is not shown until the store is known', () => {
    mount('/shop/missing', { header: false });
    expect(bar()).not.toBeInTheDocument();
  });

  it.each(['/', '/stores/demo', '/products', '/cart', '/account'])('is not part of the Sabito marketplace (%s)', (path) => {
    mount(path, { mode: {} });
    expect(bar()).not.toBeInTheDocument();
  });

  it('gets out of the way of the keyboard, but not for a checkbox', async () => {
    mount('/shop/demo');
    act(() => screen.getByLabelText('Agree').focus());
    await act(() => new Promise((resolve) => { setTimeout(resolve, 5); }));
    expect(bar()).not.toHaveClass('invisible');
    act(() => screen.getByLabelText('Note').focus());
    await waitFor(() => expect(document.querySelector('.store-tab-bar')).toHaveClass('invisible'));
    act(() => screen.getByLabelText('Note').blur());
    await waitFor(() => expect(bar()).not.toHaveClass('invisible'));
  });
});

describe('phone menu', () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Open store menu' }));
    return screen.getByRole('dialog', { name: 'Store menu' });
  };

  it('lists every store page, order tracking and contact', async () => {
    mount('/shop/demo/about');
    const menu = await openMenu();
    expect(within(menu).getAllByRole('link').slice(1).map((link) => [link.textContent, link.getAttribute('href').split('?')[0]])).toEqual([
      ['Home', '/shop/demo'], ['All Products', '/shop/demo/products'], ['Categories', '/shop/demo/categories'], ['About Us', '/shop/demo/about'],
      ['Reviews', '/shop/demo/reviews'], ['Track order', '/track-order'], ['Contact us', 'https://wa.me/233200000000'],
    ]);
    expect(within(menu).getByRole('link', { current: 'page' })).toHaveTextContent('About Us');
  });

  it('is not inside the header, whose blur would squeeze it', async () => {
    mount('/shop/demo');
    expect((await openMenu()).closest('header')).toBeNull();
  });

  it('closes on a link, on Escape and on the close button, and unlocks scrolling', async () => {
    mount('/shop/demo');
    await userEvent.click(within(await openMenu()).getByRole('link', { name: 'Reviews' }));
    expectAt('/shop/demo/reviews');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openMenu();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Close store menu' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByRole('button', { name: 'Open store menu' })).toHaveFocus();

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Close store menu' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside the menu', async () => {
    mount('/shop/demo');
    const menu = await openMenu();
    within(menu).getByRole('link', { name: 'Contact us' }).focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(within(menu).getByRole('link', { name: 'Demo Store' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(within(menu).getByRole('link', { name: 'Contact us' })).toHaveFocus();
  });

  it('leaves out Contact us when the store has no contact details', async () => {
    mount('/shop/glow', { store: salon });
    expect(within(await openMenu()).queryByText('Contact us')).not.toBeInTheDocument();
  });
});

describe('phone search', () => {
  it('opens on demand, searches the shop, then closes', async () => {
    mount('/shop/demo');
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await userEvent.type(screen.getByRole('searchbox'), '  red shirt {Enter}');
    expectAt('/shop/demo/products?search=red+shirt');
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox')).toHaveValue('red shirt');
  });

  it('searches services in a service store', async () => {
    mount('/shop/glow', { store: salon });
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.type(screen.getByRole('searchbox'), 'braids{Enter}');
    expectAt('/shop/glow/services?search=braids');
  });
});
