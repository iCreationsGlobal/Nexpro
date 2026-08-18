import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Image,
  Text,
  StatusBar,
} from 'react-native';
import COLORS from '../../constants/colors';
import { FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface SplashScreenProps {
  onAnimationComplete?: () => void;
}

const SPLASH_FALLBACK_MS = 3500;

const SplashScreen: React.FC<SplashScreenProps> = ({ onAnimationComplete }) => {
  // Animation values
  const logoPosition = useRef(new Animated.Value(0)).current; // Logo starts at center
  const textPosition = useRef(new Animated.Value(0)).current; // Text also starts at center
  const textOpacity = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    finishedRef.current = false;

    const finish = () => {
      if (cancelled || finishedRef.current) return;
      finishedRef.current = true;
      onAnimationComplete?.();
    };

    // Failsafe: never leave the user on splash if the animation callback is missed
    const fallback = setTimeout(finish, SPLASH_FALLBACK_MS);

    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(logoPosition, {
          toValue: -50,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(textPosition, {
          toValue: 50,
          duration: 600,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(800),
    ]).start(({ finished }) => {
      if (finished) finish();
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [logoPosition, textPosition, textOpacity, onAnimationComplete]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.DEEP_GREEN} />
      
      <View style={styles.contentContainer}>
        {/* Animated Logo Icon - Starts centered */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              transform: [{ translateX: logoPosition }],
            },
          ]}
        >
          <Image
            source={require('../../../assets/Sabito  green icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Animated Text - Slides in from right */}
        <Animated.Text
          style={[
            styles.logoText,
            {
              opacity: textOpacity,
              transform: [{ translateX: textPosition }],
            },
          ]}
        >
          Sabito
        </Animated.Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.DEEP_GREEN,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 80,
    height: 80,
  },
  logoText: {
    position: 'absolute',
    fontSize: FONT_SIZES.xxxl + 0, // 32px
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
    letterSpacing: 1,
    // Completely separate from logo, positioned independently
  },
});

export default SplashScreen;


