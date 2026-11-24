import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ProductCard, ServiceCard } from '../../../../storefront/src/components/storefront/StorefrontLayout';
import { sanitizeProductGrid, useCompactCards } from '../../../../storefront/src/online-store/productGrid';

const ONLINE_STORE = vi.hoisted(() => ({ isSingleStoreMode: true, isMarketplaceMode: false, isCustomDomain: false, storeSlug: 'demo' }));
const mocks = vi.hoisted(() => ({ mode: null, addItem: vi.fn(() => ({ ok: true })), toasts: { showSuccess: vi.fn(), showError: vi.fn() }, wishlist: { isWishlisted: () => false, pendingListingIds: [], toggleWishlist: vi.fn(), count: 0 } }));
vi.mock('../../../../storefront/src/context/WishlistContext', () => ({ useWishlist: () => mocks.wishlist }));
vi.mock('../../../../storefront/src/context/CartContext', () => ({ useCart: () => ({ addItem: mocks.addItem, cartSummary: { itemCount: 0 } }) }));
vi.mock('../../../../storefront/src/context/StorefrontAuthContext', () => ({ useStorefrontAuth: () => ({}) }));
vi.mock('../../../../storefront/src/context/StorefrontModeContext', () => ({
  useStorefrontMode: () => mocks.mode,
  readOnlineStoreSession: () => null,
  isOnlineStoreShopPath: () => true,
  isStorefrontCommercePath: () => false,
}));

vi.mock('../../../../storefront/src/utils/toast', () => mocks.toasts);

const store = { slug: 'demo', displayName: 'Demo', currency: 'GHS', productCardActions: ['add_to_cart', 'buy_now'], whatsappNumber: '233200000000' };
const product = { id: 'p1', slug: 'blue-shirt', title: 'Blue shirt', publicPrice: 120, available: true, category: { name: 'Shirts' }, images: ['https://example.com/a.jpg'], store };

const Where = () => <output data-testid="location">{useLocation().pathname}</output>;
const show = (element) => render(
  <MemoryRouter initialEntries={['/shop/demo']}>
    <Where />
    <Routes><Route path="/shop/:storeSlug" element={element} /><Route path="*" element={null} /></Routes>
  </MemoryRouter>,
);

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = ONLINE_STORE;
});

describe('compact product card', () => {
  it('shows only the image, name, price, heart and plus', () => {
    const { container } = show(<ProductCard product={product} compact />);
    expect(screen.getByText('Blue shirt')).toBeInTheDocument();
    expect(screen.getByText(/120\.00/)).toBeInTheDocument();
    ['Available', 'For sale', 'No reviews yet', 'New', 'Shirts', 'Add', 'Buy now'].forEach((text) => expect(screen.queryByText(text)).not.toBeInTheDocument());
    expect(within(container).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Save Blue shirt to wishlist', 'Add Blue shirt to cart']);
  });

  it('opens the product when tapped anywhere', async () => {
    show(<ProductCard product={product} compact />);
    await userEvent.click(screen.getByText(/120\.00/));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop/demo/products/blue-shirt');
  });

  it('saves to the wishlist without opening the product', async () => {
    show(<ProductCard product={product} compact />);
    const heart = screen.getByRole('button', { name: 'Save Blue shirt to wishlist' });
    expect(heart.closest('a')).toBeNull();
    await userEvent.click(heart);
    expect(mocks.wishlist.toggleWishlist).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shop\/demo$/);
  });

  it('adds one to the cart without opening the product', async () => {
    show(<ProductCard product={product} compact />);
    const plus = screen.getByRole('button', { name: 'Add Blue shirt to cart' });
    expect(plus.closest('a')).toBeNull();
    await userEvent.click(plus);
    expect(mocks.addItem).toHaveBeenCalledTimes(1);
    expect(mocks.addItem).toHaveBeenCalledWith(expect.objectContaining({ product: expect.objectContaining({ id: 'p1' }), quantity: 1 }));
    expect(mocks.toasts.showSuccess).toHaveBeenCalledWith('Added to cart.');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/shop\/demo$/);
  });

  it.each([
    ['Buy now only', ['buy_now']], ['View and Add', ['view', 'add_to_cart']], ['nothing chosen', undefined],
  ])('offers the plus when the owner sells online: %s', (_name, productCardActions) => {
    show(<ProductCard product={{ ...product, store: { ...store, productCardActions } }} compact />);
    expect(screen.getByRole('button', { name: /to cart/ })).toBeInTheDocument();
  });

  it.each([
    ['it is a sample', { isSample: true }],
    ['it has no price', { publicPrice: 0 }],
    ['it is only for rent', { listingMode: 'rent', rentalRatePerDay: 40 }],
    ['the price is hidden', { store: { ...store, productCardActions: ['add_to_cart', 'contact_for_price'] } }],
    ['the owner only takes WhatsApp orders', { store: { ...store, productCardActions: ['view', 'whatsapp'] } }],
  ])('has no plus when %s', (_name, change) => {
    show(<ProductCard product={{ ...product, ...change }} compact />);
    expect(screen.queryByRole('button', { name: /to cart/ })).not.toBeInTheDocument();
  });

  it('shows a discount', () => {
    show(<ProductCard product={{ ...product, compareAtPrice: 150 }} compact />);
    expect(screen.getByText('-20%')).toBeInTheDocument();
  });

  it('looks and sells the same when stock has run out: that is checked at payment', async () => {
    show(<ProductCard product={{ ...product, available: false, availability: { status: 'out_of_stock', label: 'Out of stock' } }} compact />);
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Blue shirt to cart' }));
    expect(mocks.addItem).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a hidden price', { store: { ...store, productCardActions: ['contact_for_price'] } }, 'Contact for price'],
    ['no price', { publicPrice: 0 }, 'Price on request'],
    ['a sample', { isSample: true }, 'Sample'],
  ])('handles %s', (_name, change, text) => {
    show(<ProductCard product={{ ...product, ...change }} compact />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows the daily price of a rental, and both prices when it is also for sale', () => {
    show(<ProductCard product={{ ...product, listingMode: 'rent', rentalRatePerDay: 40 }} compact />);
    expect(screen.getByText(/40\.00/)).toBeInTheDocument();
    expect(screen.getByText('/day')).toBeInTheDocument();
    cleanup();
    show(<ProductCard product={{ ...product, listingMode: 'both', rentalRatePerDay: 40 }} compact />);
    expect(screen.getByText(/120\.00/)).toBeInTheDocument();
    expect(screen.getByText(/or .*40\.00\/day to rent/)).toBeInTheDocument();
  });
});

describe('large product card', () => {
  const labels = ['Available', 'For sale', 'No reviews yet'];

  it('leaves out what is true of everything on an online store, and keeps the buttons', () => {
    show(<ProductCard product={product} />);
    labels.forEach((text) => expect(screen.queryByText(text)).not.toBeInTheDocument());
    ['Shirts', 'Add', 'Buy now'].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
  });

  it('still says what a shopper needs to know', () => {
    show(<ProductCard product={{ ...product, listingMode: 'both', rentalRatePerDay: 4, rating: 4.5, reviewsCount: 12 }} />);
    ['For rent', '12 reviews'].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.queryByText('For sale')).not.toBeInTheDocument();
  });

  it('can be added to the cart on an online store when stock has run out', () => {
    show(<ProductCard product={{ ...product, available: false }} />);
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('still says it is out of stock on the marketplace', () => {
    mocks.mode = { isSingleStoreMode: false, isMarketplaceMode: true };
    show(<ProductCard product={{ ...product, available: false }} />);
    expect(screen.getAllByText('Out of stock')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });

  it('is unchanged on the marketplace', () => {
    mocks.mode = { isSingleStoreMode: false, isMarketplaceMode: true };
    show(<ProductCard product={product} />);
    [...labels, 'New', 'Shirts', 'Add', 'Buy now'].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
  });
});

describe('compact service card', () => {
  const service = { id: 's1', slug: 'braids', title: 'Braids', category: 'Hair', startingPrice: 50, priceType: 'fixed', ctaType: 'book_service', studio: { displayName: 'Glow', currency: 'GHS' } };
  it('shows only the image, name and price', () => {
    show(<ServiceCard service={service} serviceUrl="/shop/demo/services/braids" compact />);
    expect(screen.getByText('Braids')).toBeInTheDocument();
    expect(screen.getByText(/50\.00/)).toBeInTheDocument();
    ['Hair', 'New', 'Glow', 'Book service'].forEach((text) => expect(screen.queryByText(text)).not.toBeInTheDocument());
    expect(screen.getByRole('link')).toHaveAttribute('href', '/shop/demo/services/braids');
  });

  it('keeps the large card as it was', () => {
    show(<ServiceCard service={service} serviceUrl="/x" />);
    ['Hair', 'Glow', 'Book service'].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
  });
});

describe('which card is used', () => {
  const atWidth = (isComputer) => window.matchMedia.mockImplementation(() => ({ matches: isComputer, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const Probe = ({ grid }) => <p>{useCompactCards(grid) ? 'compact' : 'large'}</p>;

  it.each([
    ['phone', false, {}, 'compact'],
    ['phone, one per row', false, { phone: 1 }, 'large'],
    ['phone, whatever computers use', false, { computerCards: 'large' }, 'compact'],
    ['computer', true, {}, 'large'],
    ['computer, owner chose compact', true, { computerCards: 'compact' }, 'compact'],
  ])('%s', (_name, isComputer, value, expected) => {
    atWidth(isComputer);
    render(<Probe grid={sanitizeProductGrid(value)} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each([[true], [false]])('always large outside online stores (computer: %s)', (isComputer) => {
    atWidth(isComputer);
    render(<Probe grid={null} />);
    expect(screen.getByText('large')).toBeInTheDocument();
  });
});
