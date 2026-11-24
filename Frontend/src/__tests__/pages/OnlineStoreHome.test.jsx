import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import PublicStoreHome from '../../../../storefront/src/pages/PublicStoreHome';

const mocks = vi.hoisted(() => ({ mode: {} }));
const product = vi.hoisted(() => ({ id: 'p1', slug: 'mug', title: 'Mug', publicPrice: 8, compareAtPrice: 10, available: true, images: [] }));

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
    getMarketplaceStoreHome: async () => ({
      data: {
        store: { slug: 'demo', displayName: 'Demo', currency: 'GHS', templateId: 'classic', stats: {}, storeMode: 'shop' },
        featuredProducts: [product],
        products: [product],
        promotionalBanner: { title: 'Featured deal', product },
      },
    }),
    getStoreReviews: async () => ({ data: { reviews: [] } }),
    getStoreReviewEligibility: async () => ({ data: null }),
  },
}));

const show = (path, mode) => {
  mocks.mode = mode;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shop/:storeSlug" element={<PublicStoreHome />} />
          <Route path="/stores/:storeSlug" element={<PublicStoreHome />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe('store home page', () => {
  it('has no featured promo on an online store', async () => {
    show('/shop/demo', { mode: 'online-store', isSingleStoreMode: true, isMarketplaceMode: false, storeSlug: 'demo', pathPrefix: 'shop' });
    expect(await screen.findByRole('heading', { name: 'Featured' })).toBeInTheDocument();
    expect(screen.getByText('Mug')).toBeInTheDocument();
    expect(screen.queryByText('Featured Promo')).not.toBeInTheDocument();
    expect(screen.queryByText('Featured deal')).not.toBeInTheDocument();
  });

  it('keeps it on the marketplace', async () => {
    show('/stores/demo', { mode: 'marketplace', isSingleStoreMode: false, isMarketplaceMode: true, storeSlug: null, pathPrefix: null });
    expect(await screen.findByText('Featured Promo')).toBeInTheDocument();
    expect(screen.getByText('Featured deal')).toBeInTheDocument();
  });
});
