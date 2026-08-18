import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image, Animated, Dimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AnimatedSlide2Props {
  isVisible?: boolean;
}

const AnimatedSlide2: React.FC<AnimatedSlide2Props> = ({ isVisible = true }) => {
  // Animation values for each card's scale
  const card1Scale = useRef(new Animated.Value(1)).current;
  const card2Scale = useRef(new Animated.Value(1)).current;
  const card3Scale = useRef(new Animated.Value(1)).current;

  // State for controlling which card is in front (avoid mixing native/non-native driver)
  const [activeCard, setActiveCard] = useState<number>(1);

  // Animation values for entrance (slide in)
  const card1Opacity = useRef(new Animated.Value(0)).current;
  const card2Opacity = useRef(new Animated.Value(0)).current;
  const card3Opacity = useRef(new Animated.Value(0)).current;

  const card1TranslateY = useRef(new Animated.Value(50)).current;
  const card2TranslateY = useRef(new Animated.Value(50)).current;
  const card3TranslateY = useRef(new Animated.Value(50)).current;

  // Track if animation has started
  const hasAnimated = useRef(false);

  // Background circle animation
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const circleScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;

    // Animate background circle
    Animated.parallel([
      Animated.timing(circleOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(circleScale, {
        toValue: 1,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
    // Initial entrance animation - cards slide up and fade in smoothly
    Animated.stagger(250, [
      Animated.parallel([
        Animated.timing(card1Opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(card1TranslateY, {
          toValue: 0,
          tension: 20,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(card2Opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(card2TranslateY, {
          toValue: 0,
          tension: 20,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(card3Opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(card3TranslateY, {
          toValue: 0,
          tension: 20,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // After entrance, start the continuous scaling loop
      startScalingAnimation();
    });

    return () => {
      // Cleanup
      card1Scale.stopAnimation();
      card2Scale.stopAnimation();
      card3Scale.stopAnimation();
    };
  }, [isVisible]);

  const startScalingAnimation = (): void => {
    // Ensure all cards start at normal size
    card1Scale.setValue(1);
    card2Scale.setValue(1);
    card3Scale.setValue(1);

    // Helper function to animate a card scale
    const animateCardScale = (
      cardScale: Animated.Value,
      toValue: number,
      callback?: () => void
    ): void => {
      Animated.spring(cardScale, {
        toValue,
        tension: 20,
        friction: 10,
        useNativeDriver: true,
      }).start(callback);
    };

    // Cycle through cards
    const runCycle = (): void => {
      // ===== CARD 1 BIGGER =====
      setActiveCard(1);
      card1Scale.setValue(1);
      card2Scale.setValue(1);
      card3Scale.setValue(1);
      
      animateCardScale(card1Scale, 1.2, () => {
        setTimeout(() => {
          animateCardScale(card1Scale, 1, () => {
            setTimeout(() => {
              // ===== CARD 2 BIGGER =====
              setActiveCard(2);
              card1Scale.setValue(1);
              card2Scale.setValue(1);
              card3Scale.setValue(1);
              
              animateCardScale(card2Scale, 1.2, () => {
                setTimeout(() => {
                  animateCardScale(card2Scale, 1, () => {
                    setTimeout(() => {
                      // ===== CARD 3 BIGGER =====
                      setActiveCard(3);
                      card1Scale.setValue(1);
                      card2Scale.setValue(1);
                      card3Scale.setValue(1);
                      
                      animateCardScale(card3Scale, 1.2, () => {
                        setTimeout(() => {
                          animateCardScale(card3Scale, 1, () => {
                            setTimeout(() => {
                              // Restart cycle
                              runCycle();
                            }, 500);
                          });
                        }, 1500);
                      });
                    }, 200);
                  });
                }, 1500);
              });
            }, 200);
          });
        }, 1500);
      });
    };

    runCycle();
  };

  return (
    <View style={styles.container}>
      {/* Dotted Circle Background */}
      <Animated.View style={[styles.circleContainer, {
        opacity: circleOpacity,
        transform: [{ scale: circleScale }],
      }]}>
        <Svg height="100%" width="100%" style={styles.svg}>
          <Circle
            cx={SCREEN_WIDTH * 0.50}
            cy={SCREEN_HEIGHT * 0.28}
            r={SCREEN_WIDTH * 0.38}
            stroke="#1A9C06"
            strokeWidth="2"
            fill="none"
            strokeDasharray="8, 8"
          />
        </Svg>
      </Animated.View>

      {/* Card 1 - Top */}
      <Animated.View
        style={[
          styles.cardContainer,
          {
            opacity: card1Opacity,
            zIndex: activeCard === 1 ? 10 : 1,
            elevation: activeCard === 1 ? 10 : 1,
            transform: [
              { translateY: card1TranslateY },
              { scale: card1Scale },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/Slide 2 element 1.png')}
          style={styles.cardImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Card 2 - Middle */}
      <Animated.View
        style={[
          styles.cardContainer,
          {
            opacity: card2Opacity,
            zIndex: activeCard === 2 ? 10 : 2,
            elevation: activeCard === 2 ? 10 : 2,
            transform: [
              { translateY: card2TranslateY },
              { scale: card2Scale },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/Slide 2 element 2.png')}
          style={styles.cardImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Card 3 - Bottom */}
      <Animated.View
        style={[
          styles.cardContainer,
          {
            opacity: card3Opacity,
            zIndex: activeCard === 3 ? 10 : 3,
            elevation: activeCard === 3 ? 10 : 3,
            transform: [
              { translateY: card3TranslateY },
              { scale: card3Scale },
            ],
          },
        ]}
      >
        <Image
          source={require('../../../assets/Slide 2 element 3.png')}
          style={styles.cardImage}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    position: 'relative',
  },
  circleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cardContainer: {
    marginVertical: -49,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 1,
  },
  cardImage: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.45,
  },
});

export default AnimatedSlide2;


