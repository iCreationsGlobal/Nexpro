import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  STOREFRONT_PURCHASE_INTENT_KEY,
  useStorefrontAuth,
} from './StorefrontAuthContext';
import storeService from '../services/storeService';
import { showError, showSuccess } from '../utils/toast';
import {
  QUERY_STALE,
  refreshAfterWishlistChange,
  SHOPPER_QUERY_KEYS,
} from '../utils/queryInvalidation';

const WishlistContext = createContext(null);

const readWishlistIntent = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STOREFRONT_PURCHASE_INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw);
    if (intent?.action !== 'wishlist') return null;
    const listingId = intent.productId || intent.listingId || null;
    if (!listingId) return null;
    return {
      listingId,
      slug: intent.productSlug || null,
      storeSlug: intent.storeSlug || null,
    };
  } catch {
    return null;
  }
};

const clearPurchaseIntent = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STOREFRONT_PURCHASE_INTENT_KEY);
  } catch {
    // Intent cleanup is best-effort.
  }
};

const getCurrentReturnTo = () => {
  if (typeof window === 'undefined') return '/products';
  return `${window.location.pathname}${window.location.search || ''}` || '/products';
};

const unwrapWishlist = (response) => response?.data?.data || response?.data || response || {};

const getWishlistSnapshot = (payload) => {
  const data = unwrapWishlist(payload);
  const items = Array.isArray(data.items) ? data.items : [];
  const listingIds = Array.isArray(data.listingIds)
    ? data.listingIds
    : items.map((item) => item.listingId).filter(Boolean);

  return { items, listingIds: [...new Set(listingIds)] };
};

const buildOptimisticWishlistItem = (product, listingId) => ({
  id: `optimistic-${listingId}`,
  listingId,
  product: {
    ...product,
    id: product?.id || listingId,
    listingId,
  },
});

const buildWishlistPayload = (items, listingIds) => ({
  items,
  listingIds: [...new Set(listingIds.filter(Boolean))],
});

const buildOptimisticWishlist = (payload, listingId, product, shouldSave) => {
  const snapshot = getWishlistSnapshot(payload);
  if (!shouldSave) {
    return buildWishlistPayload(
      snapshot.items.filter((item) => item.listingId !== listingId),
      snapshot.listingIds.filter((id) => id !== listingId),
    );
  }

  const nextItems = snapshot.items.some((item) => item.listingId === listingId)
    ? snapshot.items
    : [...snapshot.items, buildOptimisticWishlistItem(product, listingId)];

  return buildWishlistPayload(nextItems, [...snapshot.listingIds, listingId]);
};

export const WishlistProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, openShopperAuthModal } = useStorefrontAuth();
  const [items, setItems] = useState([]);
  const [listingIds, setListingIds] = useState([]);
  const [pendingListingIds, setPendingListingIds] = useState([]);
  const resumeIntentRef = useRef(false);
  const toggleWishlistRef = useRef(async () => ({ ok: false, saved: false }));

  const applyWishlist = useCallback((payload) => {
    const data = unwrapWishlist(payload);
    const nextItems = Array.isArray(data.items) ? data.items : [];
    const nextListingIds = Array.isArray(data.listingIds)
      ? data.listingIds
      : nextItems.map((item) => item.listingId).filter(Boolean);

    setItems(nextItems);
    setListingIds([...new Set(nextListingIds)]);
  }, []);

  const wishlistQuery = useQuery({
    queryKey: SHOPPER_QUERY_KEYS.wishlist,
    queryFn: storeService.getWishlist,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });

  const refreshWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setListingIds([]);
      return null;
    }

    try {
      const result = await wishlistQuery.refetch();
      if (result.data) applyWishlist(result.data);
      return result.data || null;
    } catch (error) {
      showError(error, 'Could not load your wishlist.');
      return null;
    }
  }, [applyWishlist, isAuthenticated, wishlistQuery]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setItems([]);
      setListingIds([]);
      resumeIntentRef.current = false;
      return;
    }
    if (wishlistQuery.data) {
      applyWishlist(wishlistQuery.data);
    }
  }, [applyWishlist, isAuthenticated, isLoading, wishlistQuery.data]);

  useEffect(() => {
    if (wishlistQuery.error) {
      showError(wishlistQuery.error, 'Could not load your wishlist.');
    }
  }, [wishlistQuery.error]);

  const isWishlisted = useCallback((listingId) => (
    Boolean(listingId && listingIds.includes(listingId))
  ), [listingIds]);

  const requireWishlistAuth = useCallback((product) => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'wishlist',
        productId: product?.listingId || product?.id || null,
        listingId: product?.listingId || product?.id || null,
        productSlug: product?.slug || null,
        storeSlug: product?.store?.slug || product?.storeSlug || null,
        returnTo: getCurrentReturnTo(),
      },
    });
  }, [openShopperAuthModal]);

  const markPending = useCallback((listingId, pending) => {
    setPendingListingIds((current) => {
      if (!listingId) return current;
      if (pending) return current.includes(listingId) ? current : [...current, listingId];
      return current.filter((id) => id !== listingId);
    });
  }, []);

  const toggleWishlist = useCallback(async (product) => {
    const listingId = product?.listingId || product?.id;
    if (!listingId) {
      showError('This product cannot be saved right now.');
      return { ok: false, saved: false };
    }

    // Avoid bouncing signed-in shoppers to /signup while session is still hydrating
    // (Online Store redirects the auth modal to a full page).
    if (isLoading) {
      return { ok: false, authPending: true, saved: false };
    }

    if (!isAuthenticated) {
      requireWishlistAuth(product);
      return { ok: false, authRequired: true, saved: false };
    }

    const wasSaved = isWishlisted(listingId);
    markPending(listingId, true);
    await queryClient.cancelQueries({ queryKey: SHOPPER_QUERY_KEYS.wishlist });
    const previousWishlist = queryClient.getQueryData(SHOPPER_QUERY_KEYS.wishlist);
    const previousSnapshot = { items, listingIds };
    const optimisticWishlist = buildOptimisticWishlist(
      previousWishlist || buildWishlistPayload(items, listingIds),
      listingId,
      product,
      !wasSaved,
    );
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, optimisticWishlist);
    applyWishlist(optimisticWishlist);

    try {
      const response = await storeService.toggleWishlistItem(listingId);
      const data = unwrapWishlist(response);
      applyWishlist(data);
      queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, data);
      await refreshAfterWishlistChange(queryClient);
      showSuccess(wasSaved ? 'Removed from wishlist.' : 'Saved to wishlist.');
      return { ok: true, saved: !wasSaved };
    } catch (error) {
      queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, previousWishlist);
      setItems(previousSnapshot.items);
      setListingIds(previousSnapshot.listingIds);
      showError(error, 'Could not update your wishlist.');
      return { ok: false, saved: wasSaved };
    } finally {
      markPending(listingId, false);
    }
  }, [applyWishlist, isAuthenticated, isLoading, isWishlisted, items, listingIds, markPending, queryClient, requireWishlistAuth]);

  useEffect(() => {
    toggleWishlistRef.current = toggleWishlist;
  }, [toggleWishlist]);

  // After Online Store full-page auth (/login|/signup), complete the pending heart click.
  useEffect(() => {
    if (isLoading || !isAuthenticated || resumeIntentRef.current) return;

    const intent = readWishlistIntent();
    if (!intent?.listingId) return;

    resumeIntentRef.current = true;
    clearPurchaseIntent();

    const product = {
      id: intent.listingId,
      listingId: intent.listingId,
      slug: intent.slug,
      storeSlug: intent.storeSlug,
      store: intent.storeSlug ? { slug: intent.storeSlug } : undefined,
    };

    (async () => {
      try {
        const response = await storeService.getWishlist();
        const snapshot = unwrapWishlist(response);
        const ids = Array.isArray(snapshot.listingIds)
          ? snapshot.listingIds
          : (Array.isArray(snapshot.items) ? snapshot.items.map((item) => item.listingId) : []);
        applyWishlist(snapshot);
        queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, snapshot);
        if (ids.includes(intent.listingId)) return;
        await toggleWishlistRef.current(product);
      } catch {
        // Errors are surfaced inside toggleWishlist / toast helpers.
      }
    })();
  }, [applyWishlist, isAuthenticated, isLoading, queryClient]);

  const removeWishlistItem = useCallback(async (listingId) => {
    if (!listingId) return { ok: false };
    markPending(listingId, true);
    await queryClient.cancelQueries({ queryKey: SHOPPER_QUERY_KEYS.wishlist });
    const previousWishlist = queryClient.getQueryData(SHOPPER_QUERY_KEYS.wishlist);
    const previousSnapshot = { items, listingIds };
    const optimisticWishlist = buildOptimisticWishlist(
      previousWishlist || buildWishlistPayload(items, listingIds),
      listingId,
      null,
      false,
    );
    queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, optimisticWishlist);
    applyWishlist(optimisticWishlist);

    try {
      const response = await storeService.removeWishlistItem(listingId);
      const data = unwrapWishlist(response);
      applyWishlist(data);
      queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, data);
      await refreshAfterWishlistChange(queryClient);
      showSuccess('Removed from wishlist.');
      return { ok: true };
    } catch (error) {
      queryClient.setQueryData(SHOPPER_QUERY_KEYS.wishlist, previousWishlist);
      setItems(previousSnapshot.items);
      setListingIds(previousSnapshot.listingIds);
      showError(error, 'Could not remove this item.');
      return { ok: false };
    } finally {
      markPending(listingId, false);
    }
  }, [applyWishlist, items, listingIds, markPending, queryClient]);

  const value = useMemo(() => ({
    count: listingIds.length,
    isWishlistLoading: wishlistQuery.isLoading || wishlistQuery.isFetching,
    isWishlisted,
    items,
    pendingListingIds,
    wishlistError: wishlistQuery.error,
    refetchWishlist: refreshWishlist,
    refreshWishlist,
    removeWishlistItem,
    toggleWishlist,
  }), [
    isWishlisted,
    items,
    listingIds.length,
    pendingListingIds,
    refreshWishlist,
    removeWishlistItem,
    toggleWishlist,
    wishlistQuery.error,
    wishlistQuery.isFetching,
    wishlistQuery.isLoading,
  ]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within WishlistProvider');
  }
  return context;
};
