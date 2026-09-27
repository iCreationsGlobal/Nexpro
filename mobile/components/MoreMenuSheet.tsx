import React, { useCallback, useMemo } from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  APP_SHEET_HEIGHT_TALL,
  SheetMenuRow,
  SheetSectionLabel,
} from '@/components/AppBottomSheet';
import { useAuth } from '@/context/AuthContext';
import { useFocusAreas } from '@/hooks/useFocusAreas';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';
import { useScreenColors } from '@/hooks/useScreenColors';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { FontFamily } from '@/constants/typography';
import { storeService } from '@/services/storeService';
import {
  buildMoreMenuSections,
  isMoreMenuRouteActive,
  type MoreMenuItem,
} from '@/utils/moreMenuItems';

type MoreMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet app menu (More tab) — shared AppBottomSheet chrome.
 */
export function MoreMenuSheet({ visible, onClose }: MoreMenuSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeTenant, activeTenantId, hasFeature, user, isDriver, isManager } = useAuth();
  const { mutedColor } = useScreenColors();
  const inStoreSetup = useIsStoreSetupRoute();
  const { focusAreas } = useFocusAreas();

  const { data: statusResponse } = useQuery({
    queryKey: ['store', 'setup-status'],
    queryFn: () => storeService.getSetupStatus(),
    enabled:
      visible
      && !!activeTenantId
      && hasFeature('paymentsExpenses')
      && !isDriver
      && !inStoreSetup,
    staleTime: 30 * 1000,
  });
  const setupData = (statusResponse as { data?: unknown })?.data ?? statusResponse ?? {};
  const checklist = (setupData as { checklist?: Record<string, unknown> }).checklist || {};
  const hasStoreSettings = Boolean(checklist.hasSettings);

  const sections = useMemo(
    () =>
      buildMoreMenuSections({
        isDriver,
        businessType: activeTenant?.businessType,
        shopType: activeTenant?.metadata?.shopType as string | undefined,
        hasFeature,
        hasStoreSettings,
        isPlatformAdmin: user?.isPlatformAdmin === true,
        focusAreas,
      }),
    [
      isDriver,
      activeTenant?.businessType,
      activeTenant?.metadata?.shopType,
      hasFeature,
      hasStoreSettings,
      user?.isPlatformAdmin,
      focusAreas,
    ]
  );

  const handleSelect = useCallback(
    (item: MoreMenuItem) => {
      onClose();
      requestAnimationFrame(() => {
        router.push(item.route as any);
      });
    },
    [onClose, router]
  );

  const { isRestricted: isSimpleRestricted, config: simpleConfig } = useSimpleMode();
  if (isSimpleRestricted && simpleConfig) {
    // Simple Mode: big coloured tiles, the same colours as the web sidebar.
    return (
      <AppBottomSheet visible={visible} title="Menu" onClose={onClose} height={APP_SHEET_HEIGHT_COMPACT}>
        <View style={styles.tileGrid}>
          {simpleConfig.more.filter((item) => !item.managerOnly || isManager).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                onClose();
                requestAnimationFrame(() => router.push(item.route as any));
              }}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: item.tone.background },
                pressed && styles.tilePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <AppIcon name={item.icon} size={40} color={item.tone.icon} strokeWidth={1.75} />
              <Text style={[styles.tileLabel, { color: item.tone.text }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </AppBottomSheet>
    );
  }

  return (
    <AppBottomSheet
      visible={visible}
      title="Menu"
      onClose={onClose}
      height={APP_SHEET_HEIGHT_TALL}
    >
      {sections.map((section) => (
        <View key={section.id} style={styles.section}>
          {section.title ? <SheetSectionLabel>{section.title}</SheetSectionLabel> : null}
          {section.items.map((item) => {
            const active = isMoreMenuRouteActive(pathname, item.route);
            return (
              <SheetMenuRow
                key={item.id}
                label={item.label}
                active={active}
                onPress={() => handleSelect(item)}
                icon={
                  <AppIcon
                    name={item.icon}
                    size={22}
                    color={active ? '#ffffff' : mutedColor}
                    strokeWidth={1.75}
                  />
                }
                trailing={<View />}
              />
            );
          })}
        </View>
      ))}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 16 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 120,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  tilePressed: { opacity: 0.8 },
  tileLabel: { fontSize: 18, fontFamily: FontFamily.semiBold },
});
