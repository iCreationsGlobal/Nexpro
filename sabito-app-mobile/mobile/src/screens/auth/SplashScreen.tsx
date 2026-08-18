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

const SplashScreen: React.FC<SplashScreenProps> = ({ onAnimationComplete }) => {
  // Animation values
  const logoPosition = useRef(new Animated.Value(0)).current; // Logo starts at center
  const textPosition = useRef(new Animated.Value(0)).current; // Text also starts at center
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animation sequence
    startAnimation();
  }, []);

  const startAnimation = (): void => {
    // Step 1: Logo starts centered alone
    // Step 2: Logo moves left
    // Step 3: Text fades in as logo moves, ending together with 8px gap
    // Step 4: After completion, navigate to next screen

    Animated.sequence([
      // Wait a bit before starting (500ms)
      Animated.delay(500),
      
      // Logo and text separate from center
      Animated.parallel([
        // Logo moves left
        Animated.timing(logoPosition, {
          toValue: -50, // Move left
          duration: 600,
          useNativeDriver: true,
        }),
        // Text moves right
        Animated.timing(textPosition, {
          toValue: 50, // Move right
          duration: 600,
          delay: 200, // Slight delay
          useNativeDriver: true,
        }),
        // Text fades in
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),
      
      // Hold the final position for 800ms
      Animated.delay(800),
    ]).start(() => {
      // Animation complete, trigger callback
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    });
  };

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


