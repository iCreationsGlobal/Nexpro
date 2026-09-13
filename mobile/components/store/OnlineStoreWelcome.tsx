import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily, FontSize } from '@/constants/typography';
import { standaloneFullWidth } from '@/styles/standaloneButton';
import type { AppIconName } from '@/components/AppIcon';

/** Relative require — Metro resolves this reliably for local assets. */
const HERO_IMAGE = require('../../assets/images/online-store-welcome.png');

const HERO_ASPECT = 1004 / 690;

const HOW_IT_WORKS: ReadonlyArray<{
  icon: AppIconName;
  title: string;
  body: string;
}> = [
  {
    icon: 'shopping-cart',
    title: 'Your own shop link',
    body: 'Customers browse your store and pay online.',
  },
  {
    icon: 'package',
    title: 'Sell from your stock',
    body: 'List products from inventory — stock stays in sync.',
  },
  {
    icon: 'credit-card',
    title: 'Accept MoMo & card',
    body: 'Customers pay with Mobile Money or card.',
  },
  {
    icon: 'list',
    title: 'Manage orders here',
    body: 'New orders show up in the app so you can fulfill them.',
  },
];
/**
 * Floating Scan / Add Job button overhangs ~20px (marginTop: -20) above the tab bar
 * and is 56px tall — reserve enough so the CTA clears the elevated circle.
 */
const TAB_SCAN_FAB_INSET = 52;

type OnlineStoreWelcomeProps = {
  /** Tab screens already have the app Header; standalone wizard needs its own title. */
  chrome?: 'tab' | 'standalone';
  ctaLabel?: string;
  onCreateStore: () => void;
  /** Extra bottom inset (added on top of chrome defaults). */
  bottomInset?: number;
};

/**
 * Launch / not-published welcome for Online Store.
 * Mockup order (single viewport, no scroll): hero → copy → CTA → How it works.
 */
export function OnlineStoreWelcome({
  chrome = 'tab',
  ctaLabel = 'Create Store',
  onCreateStore,
  bottomInset = 0,
}: OnlineStoreWelcomeProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { bg, textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const isStandalone = chrome === 'standalone';
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const paddingTop = isStandalone ? Math.max(insets.top, 16) + 8 : 6;
  const paddingBottom = isStandalone
    ? Math.max(bottomInset, insets.bottom, 24)
    : Math.max(bottomInset, TAB_SCAN_FAB_INSET);

  const heroSize = useMemo(() => {
    const maxWidth = Math.min(320, windowWidth - 48);
    // Leave room for copy, CTA, and How it works on one screen.
    const maxHeight = Math.min(240, Math.max(140, windowHeight * 0.34));
    const heightFromWidth = maxWidth / HERO_ASPECT;
    const height = Math.min(maxHeight, heightFromWidth);
    const width = height * HERO_ASPECT;
    return { width, height };
  }, [windowWidth, windowHeight]);

  const openHowItWorks = useCallback(() => setHowItWorksOpen(true), []);
  const closeHowItWorks = useCallback(() => setHowItWorksOpen(false), []);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: bg,
          paddingTop,
          paddingBottom,
        },
      ]}
    >
      {isStandalone ? (
        <View style={styles.statusHeader}>
          <Text style={[styles.statusTitle, { color: textColor }]}>Online Store</Text>
          <Text style={[styles.statusSubtitle, { color: mutedColor }]}>Not published yet</Text>
        </View>
      ) : null}

      <View style={styles.heroWrap}>
        <Image
          source={HERO_IMAGE}
          style={[styles.heroImage, { width: heroSize.width, height: heroSize.height }]}
          resizeMode="contain"
          accessibilityLabel="Online store illustration"
        />
      </View>

      <View style={styles.copyBlock}>
        <Text style={[styles.headline, { color: textColor }]}>
          Launch Your{'\n'}
          <Text style={{ color: BRAND_GREEN }}>Online Store</Text>
        </Text>
        <Text style={[styles.subhead, { color: mutedColor }]} numberOfLines={2}>
          Create your own online store in minutes and start receiving orders from anywhere.
        </Text>
      </View>

      <View style={styles.ctaBlock}>
        <Pressable
          onPress={onCreateStore}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          <AppIcon name="chevron-right" size={18} color="#fff" />
        </Pressable>

        <Pressable
          onPress={openHowItWorks}
          accessibilityRole="button"
          accessibilityLabel="How it works"
          style={({ pressed }) => [styles.howItWorks, pressed && styles.ctaPressed]}
          hitSlop={8}
        >
          <Text style={styles.howItWorksLabel}>How it works</Text>
          <AppIcon name="chevron-right" size={14} color={BRAND_GREEN} />
        </Pressable>
      </View>

      <FormSheetModal
        visible={howItWorksOpen}
        title="How it works"
        onClose={closeHowItWorks}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={closeHowItWorks}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={({ pressed }) => [styles.sheetDone, pressed && styles.ctaPressed]}
          >
            <Text style={styles.sheetDoneLabel}>Got it</Text>
          </Pressable>
        }
      >
        <Text style={[styles.sheetIntro, { color: mutedColor }]}>
          Online Store gives you a shop link customers can open to browse and buy from you.
        </Text>
        <View style={styles.sheetList}>
          {HOW_IT_WORKS.map((item) => (
            <View key={item.title} style={[styles.sheetRow, { borderColor }]}>
              <View style={styles.sheetIconCircle}>
                <AppIcon name={item.icon} size={18} color={BRAND_GREEN} />
              </View>
              <View style={styles.sheetRowCopy}>
                <Text style={[styles.sheetRowTitle, { color: textColor }]}>{item.title}</Text>
                <Text style={[styles.sheetRowBody, { color: mutedColor }]}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </FormSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  statusHeader: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
    flexShrink: 0,
  },
  statusTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusSubtitle: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  heroWrap: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    alignSelf: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    marginBottom: 10,
  },
  headline: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.display,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subhead: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 340,
    paddingHorizontal: 4,
  },
  ctaBlock: {
    flexShrink: 0,
    gap: 2,
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: BRAND_GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaLabel: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  howItWorks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  howItWorksLabel: {
    color: BRAND_GREEN,
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  sheetIntro: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: 20,
    marginBottom: 16,
  },
  sheetList: {
    gap: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  sheetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowCopy: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  sheetRowTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  sheetRowBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  sheetDone: {
    ...standaloneFullWidth,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneLabel: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
});
