import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import COLORS from '../../constants/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImagePosition {
  id: number;
  image: any;
  logo: any;
  top: number;
  left: number;
  width: number;
  height: number;
  delay: number;
}

// Image positions - adjust these to position images
const IMAGE_POSITIONS: ImagePosition[] = [
  {
    id: 1,
    image: require('../../../assets/Slide3 image 1.png'),
    logo: require('../../../assets/Slide3 image 1 logo.png'),
    top: 50,
    left: 50,
    width: 180, // 120 * 1.5
    height: 150, // 100 * 1.5
    delay: 300,
  },
  {
    id: 2,
    image: require('../../../assets/Slide3 image 2.png'),
    logo: require('../../../assets/Slide3 image 2 logo.png'),
    top: 200,
    left: 200,
    width: 225, // 150 * 1.5 (was already 25% larger, now 50% from original)
    height: 187.5, // 125 * 1.5
    delay: 600,
  },
  {
    id: 3,
    image: require('../../../assets/Slide3 image 3.png'),
    logo: require('../../../assets/Slide3 image 3 logo.png'),
    top: 350,
    left: 100,
    width: 180, // 120 * 1.5
    height: 150, // 100 * 1.5
    delay: 900,
  },
];

interface AnimatedSlide3Props {
  isVisible?: boolean;
}

interface ImageAnim {
  scale: Animated.Value;
  opacity: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
}

const AnimatedSlide3: React.FC<AnimatedSlide3Props> = ({ isVisible = true }) => {
  // Map animation
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const mapScale = useRef(new Animated.Value(0.8)).current;
  const mapTranslateY = useRef(new Animated.Value(-50)).current;
  
  // Track if animation has started to prevent re-triggering
  const hasAnimated = useRef(false);

  // Animations for each image set
  const imageAnims = useRef<ImageAnim[]>(
    IMAGE_POSITIONS.map(() => ({
      scale: new Animated.Value(0),
      opacity: new Animated.Value(0),
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
    }))
  ).current;

  // Logo scale animations for bouncing effect
  const logoAnims = useRef<Animated.Value[]>(
    IMAGE_POSITIONS.map(() => new Animated.Value(1))
  ).current;

  // Function to create random bouncing animation for a logo
  const createBouncingAnimation = (index: number): Animated.CompositeAnimation => {
    const randomDuration = 1500 + Math.random() * 1000; // 1.5-2.5 seconds
    const randomScale = 0.85 + Math.random() * 0.25; // Random scale 0.85-1.1
    
    return Animated.loop(
      Animated.sequence([
        Animated.timing(logoAnims[index], {
          toValue: randomScale,
          duration: randomDuration,
          easing: (t: number) => 1 - Math.pow(1 - t, 3), // Ease out cubic for smooth animation
          useNativeDriver: true,
        }),
        Animated.timing(logoAnims[index], {
          toValue: 1,
          duration: randomDuration,
          easing: (t: number) => 1 - Math.pow(1 - t, 3), // Ease out cubic for smooth animation
          useNativeDriver: true,
        }),
      ]),
      { iterations: -1 } // Infinite loop
    );
  };

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;

    // First animate map appearing from top
    Animated.parallel([
      Animated.timing(mapOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(mapScale, {
        toValue: 1,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(mapTranslateY, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Then animate each card appearing from different directions
    IMAGE_POSITIONS.forEach((item, index) => {
      // Set initial positions based on index
      const directions = [
        { translateX: -100, translateY: 100 }, // Left card from left
        { translateX: 0, translateY: -100 },    // Middle card from top
        { translateX: 100, translateY: 100 },   // Right card from right
      ];

      imageAnims[index].translateX.setValue(directions[index].translateX);
      imageAnims[index].translateY.setValue(directions[index].translateY);

      setTimeout(() => {
        Animated.parallel([
          Animated.spring(imageAnims[index].scale, {
            toValue: 1,
            tension: 50,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.timing(imageAnims[index].opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(imageAnims[index].translateX, {
            toValue: 0,
            tension: 50,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.spring(imageAnims[index].translateY, {
            toValue: 0,
            tension: 50,
            friction: 5,
            useNativeDriver: true,
          }),
        ]).start();

        // Start logo bouncing animation after image appears
        setTimeout(() => {
          createBouncingAnimation(index).start();
        }, item.delay + 1000);
      }, 400 + item.delay);
    });
  }, [isVisible]);

  return (
    <View style={styles.container}>
      {/* Background Map of Africa */}
      <Animated.View
        style={[
          styles.mapWrapper,
          {
            opacity: mapOpacity,
            transform: [
              { scale: mapScale },
              { translateY: mapTranslateY },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/map of africa.png')}
          style={styles.mapImage}
          resizeMode="contain"
        />
      </Animated.View>
      
      {/* Image Sets in a row */}
      <View style={styles.row}>
        {IMAGE_POSITIONS.map((item, index) => (
          <Animated.View
            key={item.id}
            style={[
              styles.imageSetContainer,
              {
                opacity: imageAnims[index].opacity,
                transform: [
                  { scale: imageAnims[index].scale },
                  { translateX: imageAnims[index].translateX },
                  { translateY: imageAnims[index].translateY },
                ],
                zIndex: index === 1 ? 10 : 5, // Middle card (index 1) on top
              },
            ]}
          >
            {/* Main Image */}
            <Image
              source={item.image}
              style={[styles.mainImage, { width: item.width, height: item.height }]}
              resizeMode="contain"
            />
            
            {/* Logo at bottom center */}
            <View style={styles.logoContainer}>
              <Animated.Image
                source={item.logo}
                style={[styles.logo, {
                  transform: [{ scale: logoAnims[index] }],
                }]}
                resizeMode="contain"
              />
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  mapWrapper: {
    position: 'absolute',
    width: '130%',
    height: '130%',
    zIndex: 0,
  },
  mapImage: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  imageSetContainer: {
    alignItems: 'center',
    marginHorizontal: -40, // Negative margin to bring cards closer and overlap (increased for larger cards)
  },
  mainImage: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logoContainer: {
    marginTop: -25, // Move logo up to overlap the card
    alignItems: 'center',
    zIndex: 10,
  },
  logo: {
    width: 50,
    height: 50,
  },
});

export default AnimatedSlide3;






