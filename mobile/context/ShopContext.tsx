import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/constants';
import { shopService } from '@/services/shopService';
import { setApiShopContext } from '@/services/api';
import { refreshAfterWorkspaceScopeChange } from '@/utils/queryInvalidation';

type Shop = { id: string; name: string; isDefault?: boolean };

type ShopContextValue = {
  isShopWorkspace: boolean;
  shops: Shop[];
  canAccessAll: boolean;
  isShopScopedUser: boolean;
  activeShopId: string | null;
  activeShop: Shop | null;
  loadingShops: boolean;
  setActiveShop: (shopId: string | 'all') => void;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const queryClient = useQueryClient();

  const isShopWorkspace = useMemo(
    () =>
      (activeTenant?.businessType === 'shop' || activeTenant?.businessType === 'rental') &&
      hasFeature('shopsModule'),
    [activeTenant?.businessType, hasFeature]
  );

  const [activeShopId, setActiveShopIdState] = useState<string | null>(null);

  const { data: access, isLoading, isError, refetch } = useQuery({
    queryKey: ['shops', 'access', activeTenantId],
    queryFn: () => shopService.getAccess(),
    enabled: !!activeTenantId && isShopWorkspace,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const shops = access?.shops ?? [];
  const canAccessAll = !!access?.canAccessAll;

  useEffect(() => {
    if (!isShopWorkspace || !activeTenantId) {
      AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SHOP_ID).catch(() => {});
      setApiShopContext(null);
      setActiveShopIdState(null);
      return;
    }
    if (isLoading) return;

    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHOP_ID);
      const validIds = shops.map((s) => s.id);

      if (stored && validIds.includes(stored)) {
        setApiShopContext(stored);
        setActiveShopIdState(stored);
        return;
      }

      if (stored && !validIds.includes(stored)) {
        await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SHOP_ID);
      }

      const fallback =
        (access?.defaultShopId &&
        (validIds.length === 0 || validIds.includes(access.defaultShopId))
          ? access.defaultShopId
          : null) ||
        access?.activeShopId ||
        shops[0]?.id ||
        null;

      if (fallback) {
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHOP_ID, fallback);
        setApiShopContext(fallback);
        setActiveShopIdState(fallback);
      }
    })();
  }, [
    isShopWorkspace,
    activeTenantId,
    shops,
    canAccessAll,
    access?.activeShopId,
    access?.defaultShopId,
    isLoading,
  ]);

  const setActiveShop = useCallback(
    (shopId: string | 'all') => {
      (async () => {
        if (!shopId || shopId === 'all') return;
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHOP_ID, shopId);
        setApiShopContext(shopId);
        setActiveShopIdState(shopId);
        await refreshAfterWorkspaceScopeChange(queryClient);
      })();
    },
    [queryClient]
  );

  const activeShop = useMemo(
    () => shops.find((s) => s.id === activeShopId) ?? null,
    [shops, activeShopId]
  );

  const value = useMemo<ShopContextValue>(
    () => ({
      isShopWorkspace,
      shops,
      canAccessAll,
      isShopScopedUser: !canAccessAll && shops.length > 0,
      activeShopId,
      activeShop,
      loadingShops: isLoading,
      setActiveShop,
    }),
    [isShopWorkspace, shops, canAccessAll, activeShopId, activeShop, isLoading, setActiveShop]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
}

export function useShopOptional() {
  return useContext(ShopContext);
}
