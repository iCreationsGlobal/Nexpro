import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import shopService from '../services/shopService';
import { refreshAfterWorkspaceScopeChange } from '../utils/queryInvalidation';

export const ACTIVE_SHOP_STORAGE_KEY = 'activeShopId';
const STORAGE_KEY = ACTIVE_SHOP_STORAGE_KEY;

const ShopContext = createContext(null);

/**
 * Provides shop/branch list and active location for retail and rental workspaces.
 */
export function ShopProvider({ children }) {
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const queryClient = useQueryClient();

  const isShopWorkspace = useMemo(() => {
    const businessType = activeTenant?.businessType;
    return (businessType === 'shop' || businessType === 'rental') && hasFeature('shopsModule');
  }, [activeTenant?.businessType, hasFeature]);

  const [activeShopId, setActiveShopIdState] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  const { data: accessData, isLoading, isError, refetch } = useQuery({
    queryKey: ['shops', 'access', activeTenantId],
    queryFn: () => shopService.getAccess(),
    enabled: !!activeTenantId && isShopWorkspace,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const access = accessData?.data || accessData || {};
  const shops = access.shops || [];
  const canAccessAll = !!access.canAccessAll;

  useEffect(() => {
    if (!isShopWorkspace || !activeTenantId) {
      localStorage.removeItem(STORAGE_KEY);
      setActiveShopIdState(null);
      return;
    }

    if (isLoading) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const validIds = shops.map((s) => s.id);

    if (stored && validIds.includes(stored)) {
      setActiveShopIdState(stored);
      return;
    }

    if (stored && !validIds.includes(stored)) {
      localStorage.removeItem(STORAGE_KEY);
    }

    const fallback =
      (access.defaultShopId && validIds.includes(access.defaultShopId)
        ? access.defaultShopId
        : null) ||
      access.activeShopId ||
      shops[0]?.id ||
      null;

    if (fallback) {
      localStorage.setItem(STORAGE_KEY, fallback);
      setActiveShopIdState(fallback);
    }
  }, [
    isShopWorkspace,
    activeTenantId,
    shops,
    canAccessAll,
    access.activeShopId,
    access.defaultShopId,
    isLoading,
  ]);

  useEffect(() => {
    if (!isShopWorkspace || isLoading || isError) return;
    if (shops.length > 0 && !activeShopId) {
      const validIds = shops.map((s) => s.id);
      const fallback =
        (access.defaultShopId && validIds.includes(access.defaultShopId)
          ? access.defaultShopId
          : null) ||
        access.activeShopId ||
        shops[0]?.id;
      if (fallback) {
        localStorage.setItem(STORAGE_KEY, fallback);
        setActiveShopIdState(fallback);
      }
    }
  }, [isShopWorkspace, isLoading, isError, shops, activeShopId, access.defaultShopId, access.activeShopId]);

  const setActiveShop = useCallback(
    (shopId) => {
      if (!shopId || shopId === 'all') return;
      localStorage.setItem(STORAGE_KEY, shopId);
      setActiveShopIdState(shopId);
      refreshAfterWorkspaceScopeChange(queryClient);
    },
    [queryClient]
  );

  const refreshShops = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shops'] });
  }, [queryClient]);

  const activeShop = useMemo(
    () => shops.find((s) => s.id === activeShopId) || null,
    [shops, activeShopId]
  );

  const isShopScopedUser = !canAccessAll && shops.length > 0;

  const value = useMemo(
    () => ({
      isShopWorkspace,
      shops,
      canAccessAll,
      isShopScopedUser,
      activeShopId,
      activeShop,
      loadingShops: isLoading,
      setActiveShop,
      refreshShops,
      refetchShopAccess: refetch,
    }),
    [
      isShopWorkspace,
      shops,
      canAccessAll,
      isShopScopedUser,
      activeShopId,
      activeShop,
      isLoading,
      setActiveShop,
      refreshShops,
      refetch,
    ]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    throw new Error('useShop must be used within ShopProvider');
  }
  return ctx;
};

export const useShopOptional = () => useContext(ShopContext);
