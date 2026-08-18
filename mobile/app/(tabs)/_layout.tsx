import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { DeviceEventEmitter, View, Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/context/AuthContext';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { Header } from '@/components/Header';
import { MoreMenuSheet } from '@/components/MoreMenuSheet';
import { SmartSearchProvider } from '@/context/SmartSearchContext';
import Colors from '@/constants/Colors';
import { FontFamily, FontSize } from '@/constants/typography';
import { useTheme } from '@/context/ThemeContext';
import { useScanningEnabled } from '@/hooks/useScanningEnabled';
import { resolveBusinessType } from '@/constants';
import { OPEN_SCAN_CAMERA_EVENT } from '@/utils/scanTabEvents';

function TabBarIcon({
  name,
  color,
}: {
  name: AppIconName;
  color: string;
}) {
  return <AppIcon name={name} size={24} color={color} style={{ marginBottom: -2 }} />;
}

/** Stable header component — avoids remounting Header on every TabLayout render (notification poll spam). */
function TabsHeader() {
  return <Header />;
}

function CenterTabButton() {
  const { activeTenant } = useAuth();
  const { resolvedTheme } = useTheme();
  const tint = Colors[resolvedTheme ?? 'light'].tint;
  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isStudio = resolvedType === 'studio';

  return (
    <View style={[styles.centerButton, { backgroundColor: tint }]}>
      <AppIcon name={isStudio ? 'plus' : 'camera'} size={28} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const colors = Colors[resolvedTheme ?? 'light'];
  const { scanningEnabled } = useScanningEnabled();
  const { activeTenant, hasFeature, isDriver } = useAuth();
  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isShop = resolvedType === 'shop';
  const isPharmacy = resolvedType === 'pharmacy';
  const isStudio = resolvedType === 'studio';
  const isRetailLike = isShop || isPharmacy;
  const showInvoicesInTab = (isRetailLike || isStudio) && hasFeature('invoices');
  const centerTabTitle = isStudio ? 'Add Job' : 'Scan';
  const isScanRoute = pathname === '/scan' || pathname.endsWith('/scan');
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!isDriver) return;
    const allowed = pathname === '/deliveries' || pathname.endsWith('/deliveries') || pathname === '/more' || pathname.endsWith('/more');
    if (!allowed) {
      router.replace('/(tabs)/deliveries');
    }
  }, [isDriver, pathname, router]);

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: colors.tint,
      tabBarInactiveTintColor: colors.tabIconDefault,
      headerShown: true,
      header: TabsHeader,
      tabBarLabelStyle: {
        fontFamily: FontFamily.medium,
        fontSize: FontSize.xs,
        fontWeight: '500' as const,
      },
    }),
    [colors.tint, colors.tabIconDefault]
  );

  return (
    <SmartSearchProvider>
    <>
    <MoreMenuSheet visible={menuOpen} onClose={closeMenu} />
    <Tabs
      screenOptions={screenOptions}
    >
      {/* Tab order: Dashboard → Customers → center (Scan / Add Job) → Invoice → More */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          ...(isDriver ? { href: null } : {}),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={
          !isDriver && hasFeature('crm')
            ? {
                title: 'Customers',
                tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name="users" color={color} />,
              }
            : { href: null, title: 'Customers' }
        }
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: centerTabTitle,
          ...(isDriver ? { href: null } : {}),
          tabBarButton: (props) => (
            <Pressable
              onPress={(event) => {
                if (!isStudio && isScanRoute && scanningEnabled) {
                  DeviceEventEmitter.emit(OPEN_SCAN_CAMERA_EVENT);
                  return;
                }
                props.onPress?.(event);
              }}
              style={({ pressed }) => [styles.centerTab, pressed && styles.centerButtonPressed]}
            >
              <View style={styles.centerTabContent}>
                <CenterTabButton />
                <Text style={[styles.centerTabLabel, { color: colors.tabIconDefault }]}>
                  {centerTabTitle}
                </Text>
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={
          !isDriver && showInvoicesInTab
            ? {
                title: 'Invoice',
                tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name="file-text" color={color} />,
              }
            : { href: null, title: 'Invoice' }
        }
      />
      <Tabs.Screen
        name="more"
        options={{
          title: isDriver ? 'Account' : 'More',
          tabBarIcon: ({ color }) => <TabBarIcon name={isDriver ? 'user' : 'bars'} color={color} />,
          tabBarButton: (props) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDriver ? 'Account menu' : 'More menu'}
              onPress={() => setMenuOpen(true)}
              style={props.style}
            >
              {props.children}
            </Pressable>
          ),
        }}
      />

      {/* Accessible via More or deep links — not in tab bar */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="online-orders" options={{ href: null, title: 'Online Store' }} />
      <Tabs.Screen name="store" options={{ href: null, title: 'Online Store' }} />
      <Tabs.Screen name="store-services" options={{ href: null, title: 'Studio Services' }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
          headerShown: false,
          title: 'Ayebia',
        }}
      />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="expenses" options={{ href: null }} />
      <Tabs.Screen name="quotes" options={{ href: null }} />
      <Tabs.Screen name="sales" options={{ href: null }} />
      <Tabs.Screen name="dealers" options={{ href: null, title: 'Dealers' }} />
      <Tabs.Screen name="leads" options={{ href: null }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
      <Tabs.Screen
        name="deliveries"
        options={
          isDriver
            ? {
                title: 'Deliveries',
                tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name="truck" color={color} />,
              }
            : { href: null }
        }
      />
    </Tabs>
    </>
    </SmartSearchProvider>
  );
}

const styles = StyleSheet.create({
  centerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
  centerTabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTabLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  centerButtonPressed: {
    opacity: 0.9,
  },
});
