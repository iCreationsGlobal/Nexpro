import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Linking,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Button } from 'react-native-paper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { setOnboardingCompleted } from '../../utils/storage';
import AnimatedSlide1 from '../../components/onboarding/AnimatedSlide1';
import AnimatedSlide2 from '../../components/onboarding/AnimatedSlide2';
import AnimatedSlide3 from '../../components/onboarding/AnimatedSlide3';
import type { AuthStackScreenProps } from '../../types/navigation';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Slide {
  id: string;
  isAnimated: boolean;
  animationComponent: string;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    isAnimated: true,
    animationComponent: 'AnimatedSlide1',
    title: 'Discover Opportunities',
    subtitle: 'A platform where businesses and marketers connect and grow',
  },
  {
    id: '2',
    isAnimated: true,
    animationComponent: 'AnimatedSlide2',
    title: 'Build Partnerships',
    subtitle: 'Connect with verified businesses and marketers to grow together',
  },
  {
    id: '3',
    isAnimated: true,
    animationComponent: 'AnimatedSlide3',
    title: 'Earn & Expand',
    subtitle: 'Work with trusted businesses and grow together',
  },
];

type OnboardingScreenProps = AuthStackScreenProps<'Onboarding'> & {
  onComplete?: () => void | Promise<void>;
};

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const handleDotPress = (index: number): void => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const handleGetStarted = async (): Promise<void> => {
    await setOnboardingCompleted();
    if (typeof onComplete === 'function') {
      await onComplete();
    }
  };

  const handlePrivacyPolicy = (): void => {
    // TODO: Navigate to privacy policy or open URL
    Linking.openURL('https://sabito.com/privacy');
  };

  const handleTerms = (): void => {
    // TODO: Navigate to terms or open URL
    Linking.openURL('https://sabito.com/terms');
  };

  const renderSlide = ({ item, index: slideIndex }: { item: Slide; index: number }): JSX.Element => {
    // Render the appropriate animation component
    const renderAnimation = (): JSX.Element | null => {
      if (!item.isAnimated) return null;
      
      const isVisible = currentIndex === slideIndex;
      
      switch (item.animationComponent) {
        case 'AnimatedSlide1':
          return <AnimatedSlide1 key="slide1" isVisible={isVisible} />;
        case 'AnimatedSlide2':
          return <AnimatedSlide2 key="slide2" isVisible={isVisible} />;
        case 'AnimatedSlide3':
          return <AnimatedSlide3 key="slide3" isVisible={isVisible} />;
        default:
          return null;
      }
    };

    return (
      <View style={styles.slideContainer}>
        {/* Animation Component */}
        <View style={styles.animationContainer}>
          {renderAnimation()}
        </View>

        {/* Text Content */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.DEEP_GREEN} />
      
      {/* Slides FlatList */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Dots Indicator */}
      <View style={styles.dotsContainer}>
        {SLIDES.map((_, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.activeDot,
            ]}
            onPress={() => handleDotPress(index)}
            activeOpacity={0.7}
          />
        ))}
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        <Button
          mode="contained"
          onPress={handleGetStarted}
          style={styles.getStartedButton}
          contentStyle={styles.getStartedButtonContent}
          labelStyle={styles.getStartedButtonLabel}
        >
          Get Started
        </Button>

        <View style={styles.linksContainer}>
          <TouchableOpacity onPress={handlePrivacyPolicy}>
            <Text style={styles.linkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.linkSeparator}> • </Text>
          <TouchableOpacity onPress={handleTerms}>
            <Text style={styles.linkText}>Terms of Service</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.DEEP_GREEN,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'space-between',
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xxl,
  },
  animationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.WHITE,
    textAlign: 'center',
    opacity: 0.9,
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: SPACING.xs,
  },
  activeDot: {
    width: 24,
    backgroundColor: COLORS.WHITE,
  },
  bottomSection: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  getStartedButton: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  getStartedButtonContent: {
    paddingVertical: SPACING.md,
  },
  getStartedButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.DEEP_GREEN,
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.WHITE,
    opacity: 0.8,
  },
  linkSeparator: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.WHITE,
    opacity: 0.8,
  },
});

export default OnboardingScreen;






