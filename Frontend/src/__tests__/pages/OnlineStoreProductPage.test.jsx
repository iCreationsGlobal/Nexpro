import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import PublicStoreProduct from '../../../../storefront/src/pages/PublicStoreProduct';

const mocks = vi.hoisted(() => ({ mode: {} }));
vi.mock('../../../../storefront/src/context/StorefrontModeContext', () => ({
  useStorefrontMode: () => mocks.mode,
  persistOnlineStoreBrand: vi.fn(),
  readOnlineStoreSession: () => null,
  isOnlineStoreShopPath: () => true,
  isStorefrontCommercePath: () => false,
}));
vi.mock('../../../../storefront/src/context/StorefrontAuthContext', () => ({ useStorefrontAuth: () => ({ isAuthenticated: false, openShopperAuthModal: vi.fn() }) }));
vi.mock('../../../../storefront/src/context/CartContext', () => ({ useCart: () => ({ addItem: vi.fn(), cartSummary: { itemCount: 0 } }) }));
vi.mock('../../../../storefront/src/context/WishlistContext', () => ({ useWishlist: () => ({ isWishlisted: () => false, pendingListingIds: [], toggleWishlist: vi.fn(), count: 0 }) }));
vi.mock('../../../../storefront/src/services/storeService', () => ({
  default: {
    getPublicStore: async () => ({ data: { slug: 'demo', displayName: 'Payless', currency: 'GHS', templateId: 'classic', productCardActions: ['add_to_cart'] } }),
    getPublicStoreProducts: async () => ({ currency: 'GHS', data: [{ id: 'p1', slug: 'mug', title: 'Blue mug', publicPrice: 10, available: true, images: [] }] }),
    getProductReviews: async () => ({ data: { reviews: [] } }),
  },
}));

const show = async (path, mode) => {
  mocks.mode = mode;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shop/:storeSlug/products/:productSlug" element={<PublicStoreProduct />} />
          <Route path="/stores/:storeSlug/products/:productSlug" element={<PublicStoreProduct />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Blue mug' });
};
const mainHeadings = () => screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent);

afterEach(cleanup);

describe('product page', () => {
  it('is about the product on an online store: no store card, and the product is the heading', async () => {
    await show('/shop/demo/products/mug', { mode: 'online-store', isSingleStoreMode: true, isMarketplaceMode: false, storeSlug: 'demo', pathPrefix: 'shop' });
    expect(mainHeadings()).toEqual(['Blue mug']);
    expect(screen.queryByText('Sold by')).not.toBeInTheDocument();
    expect(screen.queryByText('Published product')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
  });

  it('still says who sells it on the marketplace', async () => {
    await show('/stores/demo/products/mug', { mode: 'marketplace', isSingleStoreMode: false, isMarketplaceMode: true, storeSlug: null, pathPrefix: null });
    expect(mainHeadings()).toEqual(['Payless']);
    expect(screen.getByText('Sold by')).toBeInTheDocument();
    expect(screen.getByText('Published product')).toBeInTheDocument();
  });
});
