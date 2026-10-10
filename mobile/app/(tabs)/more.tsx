import React from 'react';
import { MoreMenuSheet } from '@/components/MoreMenuSheet';
import { usePathname, useRouter } from 'expo-router';

/**
 * More is opened as a bottom sheet from the tab bar.
 * Deep links and the dashboard View all action open the same menu.
 */
export default function MoreScreen() {
  const router = useRouter();
  const pathname = usePathname();

  return <MoreMenuSheet visible={pathname === '/more' || pathname === '/(tabs)/more'} onClose={() => router.replace('/(tabs)')} />;
}
