import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useStudioLocationOptional } from '@/context/StudioLocationContext';
import { useTheme } from '@/context/ThemeContext';
import Colors from '@/constants/Colors';
import { FontFamily, FontSize } from '@/constants/typography';
import { useScopedWorkspaceName } from '@/hooks/useScopedWorkspaceName';
import { membershipTenantId } from '@/utils/membership';
import { refreshAfterSale } from '@/utils/queryInvalidation';
import { getWorkspaceDisplayName } from '@/utils/workspaceDisplayName';

type ScopeOption = { id: string; label: string; isAll?: boolean };
type ScopeKind = 'shop' | 'studio' | 'tenant';

type WorkspaceScopeSwitcherProps = {
  /** Render inside the header top row beside the ABS logo (no extra margin). */
  embedded?: boolean;
};

/**
 * Shop, studio location, or workspace picker for the global header.
 * Prefer multi-shop / multi-location when available; otherwise multi-tenant switch.
 */
export function WorkspaceScopeSwitcher({ embedded = false }: WorkspaceScopeSwitcherProps) {
  const shop = useShopOptional();
  const studio = useStudioLocationOptional();
  const { memberships, activeTenantId, activeTenant, setActiveTenantId } = useAuth();
  const scopedName = useScopedWorkspaceName('Your business');
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const handleSelectTenant = useCallback(
    async (tenantId: string) => {
      if (tenantId === activeTenantId) return;
      await setActiveTenantId(tenantId);
    },
    [activeTenantId, setActiveTenantId]
  );

  const config = useMemo(() => {
    const multiShop = !!shop?.isShopWorkspace && shop.shops.length > 1;
    if (multiShop) {
      const options: ScopeOption[] = shop.shops.map((s) => ({
        id: s.id,
        label: s.isDefault ? `${s.name} (main)` : s.name,
      }));
      return {
        kind: 'shop' as ScopeKind,
        icon: 'archive' as const,
        label: shop.activeShop?.name || 'Select shop',
        sheetTitle: 'Select shop',
        options,
        showPicker: true,
        loading: false,
        activeId: shop.activeShopId,
        onSelect: (id: string) => shop.setActiveShop(id),
      };
    }

    const multiStudio =
      !!studio?.isStudioWorkspace &&
      (studio.locations.length > 1 || studio.canAccessAll);
    if (multiStudio) {
      const options: ScopeOption[] = [];
      if (studio.canAccessAll) options.push({ id: 'all', label: 'All locations', isAll: true });
      studio.locations.forEach((l) => {
        options.push({
          id: l.id,
          label: l.isDefault ? `${l.name} (main)` : l.name,
        });
      });
      const label =
        studio.activeLocation?.name ||
        (studio.canAccessAll ? 'All locations' : 'Select location');
      return {
        kind: 'studio' as ScopeKind,
        icon: 'briefcase' as const,
        label,
        sheetTitle: 'Select location',
        options,
        showPicker: true,
        loading: false,
        activeId: studio.activeStudioLocationId,
        onSelect: (id: string) => studio.setActiveStudioLocation(id === 'all' ? 'all' : id),
      };
    }

    if (memberships.length > 1) {
      const options: ScopeOption[] = memberships
        .map((m) => {
          const id = membershipTenantId(m);
          if (!id) return null;
          const name = getWorkspaceDisplayName(m.tenant?.name, undefined, 'Workspace');
          const type = (m.tenant?.businessType || '').replace(/_/g, ' ');
          return {
            id,
            label: type ? `${name} · ${type}` : name,
          };
        })
        .filter(Boolean) as ScopeOption[];

      if (options.length > 1) {
        return {
          kind: 'tenant' as ScopeKind,
          icon: 'store' as const,
          label: getWorkspaceDisplayName(activeTenant?.name, undefined, scopedName),
          sheetTitle: 'Switch workspace',
          options,
          showPicker: true,
          loading: false,
          activeId: activeTenantId,
          onSelect: (id: string) => {
            void handleSelectTenant(id);
          },
        };
      }
    }

    if (shop?.isShopWorkspace && (shop.shops.length > 0 || shop.loadingShops)) {
      return {
        kind: 'shop' as ScopeKind,
        icon: 'archive' as const,
        label: shop.activeShop?.name || (shop.loadingShops ? 'Loading…' : scopedName),
        sheetTitle: 'Select shop',
        options: [] as ScopeOption[],
        showPicker: false,
        loading: shop.loadingShops && shop.shops.length === 0,
        activeId: shop.activeShopId,
        onSelect: (_id: string) => {},
      };
    }

    if (studio?.isStudioWorkspace && (studio.locations.length > 0 || studio.loadingLocations)) {
      return {
        kind: 'studio' as ScopeKind,
        icon: 'briefcase' as const,
        label:
          studio.activeLocation?.name ||
          (studio.loadingLocations
            ? 'Loading…'
            : studio.canAccessAll
              ? 'All locations'
              : scopedName),
        sheetTitle: 'Select location',
        options: [] as ScopeOption[],
        showPicker: false,
        loading: studio.loadingLocations && studio.locations.length === 0,
        activeId: studio.activeStudioLocationId,
        onSelect: (_id: string) => {},
      };
    }

    return {
      kind: 'tenant' as ScopeKind,
      icon: 'store' as const,
      label: scopedName,
      sheetTitle: 'Switch workspace',
      options: [] as ScopeOption[],
      showPicker: false,
      loading: false,
      activeId: activeTenantId,
      onSelect: (_id: string) => {},
    };
  }, [
    shop,
    studio,
    memberships,
    activeTenantId,
    activeTenant?.name,
    scopedName,
    handleSelectTenant,
  ]);

  const mutedColor = resolvedTheme === 'dark' ? '#a1a1aa' : '#6b7280';
  const textColor = resolvedTheme === 'dark' ? '#fff' : '#111';
  /** Logo sits beside this in the header — skip redundant scope icon when embedded. */
  const showLeadingIcon = !embedded;

  const labelStyle = embedded ? styles.embeddedLabel : styles.staticLabel;
  const triggerLabelStyle = embedded ? styles.embeddedLabel : styles.triggerLabel;

  const rowStyle = embedded
    ? [styles.staticRow, styles.embeddedRow]
    : styles.staticRow;

  if (config.loading || !config.showPicker) {
    return (
      <View style={rowStyle}>
        {showLeadingIcon ? <AppIcon name={config.icon} size={14} color={mutedColor} /> : null}
        <Text style={[labelStyle, { color: textColor }]} numberOfLines={1}>
          {config.label}
        </Text>
      </View>
    );
  }

  const triggerStyle = embedded
    ? [styles.trigger, styles.embeddedTrigger]
    : styles.trigger;

  const a11yLabel =
    config.kind === 'shop'
      ? `Shop: ${config.label}. Switch shop`
      : config.kind === 'studio'
        ? `Location: ${config.label}. Switch location`
        : `Workspace: ${config.label}. Switch workspace`;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [triggerStyle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        {showLeadingIcon ? <AppIcon name={config.icon} size={14} color={mutedColor} /> : null}
        <Text style={[triggerLabelStyle, { color: textColor }]} numberOfLines={1}>
          {config.label}
        </Text>
        <AppIcon name="chevron-down" size={14} color={mutedColor} />
      </Pressable>

      <AppBottomSheet
        visible={open}
        title={config.sheetTitle}
        onClose={() => setOpen(false)}
        height={APP_SHEET_HEIGHT_COMPACT}
      >
        {config.options.map((item) => {
          const active =
            (item.isAll && !config.activeId) || item.id === config.activeId;
          return (
            <SheetMenuRow
              key={item.id}
              label={item.label}
              active={active}
              onPress={() => {
                config.onSelect(item.id);
                setOpen(false);
              }}
              trailing={
                active ? <AppIcon name="check" size={18} color="#fff" /> : <View />
              }
            />
          );
        })}
      </AppBottomSheet>
    </>
  );
}

export function OfflineQueueBanner() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const colors = Colors[resolvedTheme ?? 'light'];
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { offlineQueueService } = await import('@/services/offlineQueueService');
      const n = await offlineQueueService.getPendingCount();
      if (mounted) setCount(n);
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (count === 0) return null;

  const onSync = async () => {
    setSyncing(true);
    try {
      const { offlineQueueService } = await import('@/services/offlineQueueService');
      const { synced } = await offlineQueueService.syncPendingSales();
      setCount(await offlineQueueService.getPendingCount());
      if (synced > 0) await refreshAfterSale(queryClient);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={[bannerStyles.wrap, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
      <Text style={bannerStyles.text}>{count} sale(s) waiting to sync</Text>
      <Pressable onPress={onSync} disabled={syncing} style={[bannerStyles.btn, { backgroundColor: colors.tint }]}>
        {syncing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={bannerStyles.btnText}>Sync now</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 44,
  },
  staticLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  embeddedLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    fontWeight: '700',
    flexShrink: 1,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 44,
  },
  triggerLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  embeddedRow: {
    marginBottom: 0,
    alignSelf: 'stretch',
    flex: 1,
    minWidth: 0,
  },
  embeddedTrigger: {
    marginBottom: 0,
    alignSelf: 'stretch',
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
});

const bannerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  text: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#92400e',
  },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
