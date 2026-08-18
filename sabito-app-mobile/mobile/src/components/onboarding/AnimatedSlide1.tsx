import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image, Animated, Dimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AnimatedSlide1Props {
  isVisible?: boolean;
}

const AnimatedSlide1: React.FC<AnimatedSlide1Props> = ({ isVisible = true }) => {
  // Animation values for each element
  const businessCardAnim = useRef(new Animated.Value(0)).current;
  const marketerListAnim = useRef(new Animated.Value(0)).current;
  const handEmojiAnim = useRef(new Animated.Value(0)).current;
  const avatarAnim = useRef(new Animated.Value(0)).current;

  // Floating animation values
  const floatBusiness = useRef(new Animated.Value(0)).current;
  const floatMarketers = useRef(new Animated.Value(0)).current;
  const floatHand = useRef(new Animated.Value(0)).current;
  const floatAvatar = useRef(new Animated.Value(0)).current;

  // Spiral connector animation
  const spiralOpacity = useRef(new Animated.Value(0)).current;

  // Track if animation has started
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;
    // Entrance animations - staggered
    Animated.stagger(150, [
      // Business card slides in from left
      Animated.spring(businessCardAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Marketer list slides in from right
      Animated.spring(marketerListAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Hand emoji fades in
      Animated.spring(handEmojiAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Avatar bounces in
      Animated.spring(avatarAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After all elements are loaded, fade in the spiral connector
      Animated.timing(spiralOpacity, {
        toValue: 1,
        duration: 1000,
        delay: 300,
        useNativeDriver: true,
      }).start();
    });

    // Continuous floating animations
    const floatAnimation1 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatBusiness, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatBusiness, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    const floatAnimation2 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatMarketers, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(floatMarketers, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    );

    const floatAnimation3 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatHand, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatHand, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    const floatAnimation4 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAvatar, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(floatAvatar, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );

    floatAnimation1.start();
    floatAnimation2.start();
    floatAnimation3.start();
    floatAnimation4.start();

    return () => {
      floatAnimation1.stop();
      floatAnimation2.stop();
      floatAnimation3.stop();
      floatAnimation4.stop();
    };
  }, [isVisible]);

  return (
    <View style={styles.container}>
      {/* Dotted Spiral Connector */}
      <Animated.View style={[styles.spiralContainer, { opacity: spiralOpacity }]}>
        <Svg height="100%" width="100%" style={styles.svg}>
          <Circle
            cx={SCREEN_WIDTH * 0.50}    // 45% of screen width
            cy={SCREEN_HEIGHT * 0.25}   // 28% of screen height
            r={SCREEN_WIDTH * 0.42}      // 40% of screen width as radius
            stroke="#1A9C06"
            strokeWidth="2"
            fill="none"
            strokeDasharray="8, 8"
          />
        </Svg>
      </Animated.View>

      {/* Business Card - Top Left */}
      <Animated.View
        style={[
          styles.businessCard,
          {
            opacity: businessCardAnim,
            transform: [
              {
                translateX: businessCardAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 0],
                }),
              },
              {
                translateY: floatBusiness.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10],
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/element 1 card with business name and company type.png')}
          style={styles.businessCardImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Marketer List - Top Right */}
      <Animated.View
        style={[
          styles.marketerList,
          {
            opacity: marketerListAnim,
            transform: [
              {
                translateX: marketerListAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [100, 0],
                }),
              },
              {
                translateY: floatMarketers.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -8],
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/element 2 card with names of marketers and conversion rate.png')}
          style={styles.marketerListImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Hand Emoji - Center */}
      <Animated.View
        style={[
          styles.handEmoji,
          {
            opacity: handEmojiAnim,
            transform: [
              {
                scale: handEmojiAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
              {
                translateY: floatHand.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -15],
                }),
              },
              {
                rotate: floatHand.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: ['-5deg', '5deg', '-5deg'],
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/element 3 hand emoji.png')}
          style={styles.handEmojiImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Avatar - Bottom Center */}
      <Animated.View
        style={[
          styles.avatar,
          {
            opacity: avatarAnim,
            transform: [
              {
                scale: avatarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
              {
                translateY: floatAvatar.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10], // Float up and down
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/element 5 user circular avartar.jpg')}
          style={styles.avatarImage}
          resizeMode="cover"
        />
      </Animated.View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,  // Constrain to screen width
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  businessCard: {
    position: 'absolute',
    top: '20%',
    left: 30,  // Start exactly from the left edge of the screen
    // Shadow styles
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,  // Android shadow
  },
  businessCardImage: {
    width: 220,  // 140 * 3
    height: 197, // 100 * 3
  },
  marketerList: {
    position: 'absolute',
    top: '40%',  // Slightly lower to overlap nicely
    left: '40%',  // Position to overlap on element 1
    zIndex: 2,    // Ensure it's on top of element 1
    // Shadow styles
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,  // Android shadow
  },
  marketerListImage: {
    width: 220,
    height: 233,
  },
  handEmoji: {
    position: 'absolute',
    top: '10%',
    left: '80%',
    marginLeft: -40,
  },
  handEmojiImage: {
    width: 80,
    height: 80,
  },
  avatar: {
    position: 'absolute',
    bottom: '10%',
    left: '16%',
    marginLeft: -35,
    // Shadow styles
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.0,
    shadowRadius: 8,
    elevation: 5,  // Android shadow
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  spiralContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,  // Behind all other elements
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default AnimatedSlide1;






