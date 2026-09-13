import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Animated,
  Platform,
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { IntroWatchHero } from '@/components/IntroWatchHero';
import { IntroStoreHero } from '@/components/IntroStoreHero';
import { IntroInvoiceHero } from '@/components/IntroInvoiceHero';
import { IntroPosHero } from '@/components/IntroPosHero';
import { IntroBusinessHero } from '@/components/IntroBusinessHero';
import { AppBrandLogo } from '@/components/AppBrandLogo';
import { AppIcon } from '@/components/AppIcon';
import {
  NATIVE_CHIP_VARIANTS,
  SPLASH_INTRO_SLIDES,
  type SplashIntroSlide,
  type SplashIntroSmallCardVariant,
} from '@/config/splashIntro';
import { BRAND_GREEN } from '@/constants/brand';
import { FontFamily, FontSize } from '@/constants/typography';
import { useAuth } from '@/context/AuthContext';
import { markIntroOnboardingComplete } from '@/utils/introOnboarding';
import { getIntroCardLayout, INTRO_CARD_SHADOW } from '@/utils/introCardLayout';
import { logger } from '@/utils/logger';

const TITLE_COLOR = '#0f172a';
const SUBTITLE_COLOR = '#6b7280';
const PAGE_BG = '#f2faf5';
const CARD_BORDER = '#e5e7eb';
const WHATSAPP_GREEN = '#25D366';

type NativeChipVisual = {
  iconBg: string;
  iconName?: 'check' | 'comments' | 'shopping-cart' | 'sparkles';
  bang?: string;
};

function getNativeChipVisual(variant: SplashIntroSmallCardVariant): NativeChipVisual {
  switch (variant) {
    case 'payment-success':
      return { iconBg: BRAND_GREEN, iconName: 'check' };
    case 'whatsapp-share':
      return { iconBg: WHATSAPP_GREEN, iconName: 'comments' };
    case 'new-order':
      return { iconBg: BRAND_GREEN, iconName: 'shopping-cart' };
    case 'adapts':
      return { iconBg: BRAND_GREEN, iconName: 'sparkles' };
    case 'unusual-activity':
    default:
      return { iconBg: '#f97316', bang: '!' };
  }
}

function IntroGradientBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="introBackground" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#ffffff" />
            <Stop offset="100%" stopColor="#e4f5e9" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#introBackground)" />
      </Svg>
    </View>
  );
}

/** Reanimated tilt stripped out for this test build — plain View, small chip added back. */
function IntroCardStagePlain({ slide, stageHeight, stageWidth }: { slide: SplashIntroSlide; stageHeight: number; stageWidth: number }) {
  const hasLarge = Boolean(slide.largeCardImage);
  const smallVariant = slide.smallCardVariant || 'placeholder';
  const showNativeChip = NATIVE_CHIP_VARIANTS.includes(smallVariant);
  const nativeChipVisual = showNativeChip ? getNativeChipVisual(smallVariant) : null;
  const { cardWidth: largeWidth, cardHeight: largeHeight } = getIntroCardLayout(stageWidth, stageHeight);
  const smallWidth = Math.min(stageWidth * 0.72, 260);

  return (
    <View style={[styles.cardStage, { height: stageHeight }]}>
      <View style={[styles.largeCard, { width: largeWidth, height: largeHeight }]}>
        {hasLarge ? (
          <Image
            source={slide.largeCardImage as number}
            style={styles.largeCardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholderInner}>
            <Text style={styles.placeholderLabel}>{slide.largeCardPlaceholder}</Text>
          </View>
        )}
      </View>

      {showNativeChip && nativeChipVisual ? (
        <View
          style={[
            styles.smallCard,
            { maxWidth: smallWidth, top: 16 + largeHeight - 22, right: (stageWidth - largeWidth) / 2 + 8 },
          ]}
        >
          <View style={styles.nativeChip}>
            <View style={[styles.nativeChipIcon, { backgroundColor: nativeChipVisual.iconBg }]}>
              {nativeChipVisual.iconName ? (
                <AppIcon name={nativeChipVisual.iconName} size={18} color="#ffffff" />
              ) : (
                <Text style={styles.nativeChipBang}>{nativeChipVisual.bang ?? '!'}</Text>
              )}
            </View>
            <Text style={styles.nativeChipText} numberOfLines={1}>
              {slide.smallCardPlaceholder}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function IntroScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const listRef = useRef<FlatList<SplashIntroSlide>>(null);
  const scrollOffset = useRef(0);
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const autoSliding = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselHeight, setCarouselHeight] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  logger.info('Intro', 'Render (plain test — no reanimated/svg)', { width, height });

  const isLastSlide = activeIndex === SPLASH_INTRO_SLIDES.length - 1;
  const activeSlide = SPLASH_INTRO_SLIDES[activeIndex] ?? SPLASH_INTRO_SLIDES[0];

  const cardStageHeight = useMemo(() => {
    const topBar = insets.top + 52;
    const footerApprox = Math.max(insets.bottom, 12) + 188;
    return Math.max(300, height - topBar - footerApprox);
  }, [height, insets.bottom, insets.top]);

  const finishIntro = useCallback(async () => {
    await markIntroOnboardingComplete();
    router.replace(user ? '/' : '/login');
  }, [user]);

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      finishIntro();
      return;
    }
    const nextIndex = activeIndex + 1;
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    setActiveIndex(nextIndex);
  }, [activeIndex, isLastSlide, finishIntro]);

  useEffect(() => {
    if (!foreground || dragging || isLastSlide) return;
    let animationFrame: number | undefined;
    const timer = setTimeout(() => {
      const nextIndex = activeIndex + 1;
      autoSliding.current = true;
      const startOffset = scrollOffset.current;
      let startedAt: number | undefined;
      const animate = (timestamp: number) => {
        startedAt ??= timestamp;
        const progress = Math.min((timestamp - startedAt) / 800, 1);
        // Smooth start and finish without changing manual swipe behavior.
        const eased = (1 - Math.cos(Math.PI * progress)) / 2;
        listRef.current?.scrollToOffset({
          offset: startOffset + (nextIndex * width - startOffset) * eased,
          animated: false,
        });
        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        } else {
          listRef.current?.scrollToOffset({ offset: nextIndex * width, animated: false });
          scrollOffset.current = nextIndex * width;
          setActiveIndex(nextIndex);
        }
      };
      animationFrame = requestAnimationFrame(animate);
    }, 5000);
    return () => {
      clearTimeout(timer);
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      autoSliding.current = false;
    };
  }, [activeIndex, dragging, foreground, isLastSlide, width]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Programmatic frame updates can emit scroll-end events mid-transition.
      // Updating the index here would cancel the animation halfway through.
      if (autoSliding.current) return;
      const index = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex(Math.max(0, Math.min(index, SPLASH_INTRO_SLIDES.length - 1)));
    },
    [width]
  );

  const renderSlide = useCallback(
    ({ item }: { item: SplashIntroSlide }) => (
      <View style={[styles.slide, { width }]}>
        {item.id === 'every-business' ? (
          <IntroBusinessHero width={width} height={carouselHeight || cardStageHeight} active={activeIndex === 0} />
        ) : item.id === 'smart-pos' ? (
          <IntroPosHero width={width} height={carouselHeight || cardStageHeight} />
        ) : item.id === 'quotations' ? (
          <IntroInvoiceHero width={width} height={carouselHeight || cardStageHeight} />
        ) : item.id === 'online-store' ? (
          <IntroStoreHero width={width} height={carouselHeight || cardStageHeight} />
        ) : item.id === 'abs-watch' ? (
          <IntroWatchHero width={width} height={carouselHeight || cardStageHeight} />
        ) : <IntroCardStagePlain slide={item} stageHeight={carouselHeight || cardStageHeight} stageWidth={width} />}
      </View>
    ),
    [activeIndex, carouselHeight, cardStageHeight, width]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <IntroGradientBackground />
      <View style={styles.topBar}>
        <AppBrandLogo size={36} appName="ABS" style={styles.logo} nameStyle={styles.logoName} />
        <Pressable onPress={finishIntro} hitSlop={8} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={styles.carousel}
        onLayout={event => setCarouselHeight(event.nativeEvent.layout.height)}
        data={SPLASH_INTRO_SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={event => {
          scrollOffset.current = event.nativeEvent.contentOffset.x;
          indicatorPosition.setValue(event.nativeEvent.contentOffset.x / width);
        }}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setDragging(true)}
        onScrollEndDrag={() => setDragging(false)}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={styles.copyWrap}>
          <Text style={[styles.title, { fontSize: Platform.OS === 'ios' ? Math.min(27, (width - 56) / 12) : Math.min(24, (width - 56) / 13.5) }]} numberOfLines={1} adjustsFontSizeToFit>
            {activeSlide.title}
          </Text>
          <View style={styles.subtitleWrap}>
            {activeSlide.subtitle.split('\n').map((line, index) => (
              <Text key={index} style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.dots}>
          {SPLASH_INTRO_SLIDES.map((slide, index) => (
            <Animated.View
              key={slide.id}
              style={[
                styles.dot,
                {
                  width: indicatorPosition.interpolate({
                    inputRange: [index - 1, index, index + 1],
                    outputRange: [8, 22, 8],
                    extrapolate: 'clamp',
                  }),
                  backgroundColor: indicatorPosition.interpolate({
                    inputRange: [index - 1, index, index + 1],
                    outputRange: ['#d1d5db', BRAND_GREEN, '#d1d5db'],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            />
          ))}
        </View>

        <Pressable onPress={handleNext} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{isLastSlide ? 'Get Started' : 'Continue'}</Text>
          <AppIcon name="arrow-right" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 4 },
  logo: { marginBottom: 0, alignSelf: 'flex-start', gap: 8 },
  logoName: { fontFamily: FontFamily.bold, color: BRAND_GREEN },
  skipButton: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { fontSize: FontSize.body, fontFamily: FontFamily.semiBold, color: BRAND_GREEN },
  carousel: { flex: 1 },
  slide: { flexShrink: 0, justifyContent: 'flex-start' },
  cardStage: { width: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 16 },
  largeCard: { borderRadius: 20, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: '#ffffff', ...INTRO_CARD_SHADOW },
  largeCardImage: { width: '100%', height: '100%', borderRadius: 19 },
  smallCard: {
    position: 'absolute',
    borderRadius: 999,
    zIndex: 5,
    elevation: 5,
  },
  nativeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  nativeChipIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nativeChipBang: { color: '#ffffff', fontSize: 18, fontFamily: FontFamily.bold, lineHeight: 22 },
  nativeChipText: { flexShrink: 1, color: BRAND_GREEN, fontSize: 13, fontFamily: FontFamily.semiBold },
  placeholderInner: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 16 },
  placeholderLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: TITLE_COLOR, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingTop: 4, gap: 14 },
  copyWrap: { alignItems: 'center', paddingHorizontal: 4, marginBottom: 2 },
  title: { fontSize: 24, lineHeight: Platform.OS === 'ios' ? 34 : 30, fontFamily: FontFamily.bold, color: TITLE_COLOR, textAlign: 'center', marginBottom: 8 },
  subtitleWrap: { width: '100%', maxWidth: 340 },
  subtitle: { width: '100%', fontSize: Platform.OS === 'ios' ? 15 : FontSize.sm, lineHeight: Platform.OS === 'ios' ? 23 : 20, fontFamily: Platform.OS === 'ios' ? FontFamily.medium : FontFamily.regular, color: SUBTITLE_COLOR, textAlign: 'center', maxWidth: 340 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  primaryButton: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: BRAND_GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: { fontSize: FontSize.lg, fontFamily: FontFamily.semiBold, color: '#ffffff' },
});
