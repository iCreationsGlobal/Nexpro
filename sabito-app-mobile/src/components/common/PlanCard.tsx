import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Platform, Pressable, Animated as RNAnimated } from 'react-native';
import { Button } from 'react-native-paper';
import { Check, LucideIcon } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { useCardPressAnimation } from '../../utils/animations';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';

interface PlanCardProps {
  name: string;
  price: string;
  tagline?: string;
  Icon: LucideIcon;
  features?: string[];
  recommended?: boolean;
  defaultExpanded?: boolean;
  onSelectPlan?: () => void;
  isSelected?: boolean;
}

/**
 * Expandable Plan Card Component
 */
const PlanCard: React.FC<PlanCardProps> = ({
  name,
  price,
  tagline,
  Icon,
  features = [],
  recommended = false,
  defaultExpanded = false,
  onSelectPlan,
  isSelected = false,
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const heightAnim = useRef(new RNAnimated.Value(defaultExpanded ? 1 : 0)).current;

  useEffect(() => {
    RNAnimated.timing(heightAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, heightAnim]);

  const handleCardPress = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelectPlan = () => {
    if (onSelectPlan) {
      onSelectPlan();
    }
  };

  const contentHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, features.length * 32 + 80], // Approximate height based on features count
  });

  const { animatedStyle, handlePressIn, handlePressOut } = useCardPressAnimation();

  return (
    <Pressable
      onPress={handleCardPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBackground || colors.background,
            borderColor: colors.border,
          },
          isSelected && [
            styles.selectedCard,
            {
              backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#F9FFF7',
              borderColor: COLORS.APP_GREEN,
            },
          ],
          animatedStyle,
        ]}
      >
      {/* First Line: Icon + Title + Price */}
      <View style={styles.topRow}>
        {/* Icon */}
        <View
          style={[
            styles.iconContainer,
            { borderColor: colors.border, backgroundColor: colors.cardBackground || colors.background },
            isSelected && styles.iconContainerSelected,
          ]}
        >
          <Icon 
            size={28} 
            color={isSelected ? COLORS.WHITE : COLORS.APP_GREEN} 
            strokeWidth={1.5}
          />
        </View>

        {/* Title with Recommended Tag */}
        <View style={styles.titleContainer}>
          <Text style={[styles.planName, { color: colors.text }]}>{name}</Text>
          {recommended && (
            <View style={styles.recommendedTag}>
              <Text style={styles.recommendedText}>Recommended</Text>
            </View>
          )}
        </View>

        {/* Price */}
        <Text style={[styles.price, { color: colors.text }]}>{price}</Text>
      </View>

      {/* Tagline */}
      {tagline && (
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          {tagline}
        </Text>
      )}

      {/* Expanded Content */}
      <RNAnimated.View
        style={[
          styles.expandedContent,
          {
            maxHeight: contentHeight,
            opacity: heightAnim,
          },
        ]}
      >
        {/* Features List */}
        {features.length > 0 && (
          <View style={styles.featuresContainer}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <Check size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Select Plan Button */}
        {onSelectPlan && (
          <Button
            mode={isSelected ? 'outlined' : 'contained'}
            onPress={handleSelectPlan}
            buttonColor={isSelected ? 'transparent' : COLORS.APP_GREEN}
            textColor={isSelected ? COLORS.APP_GREEN : COLORS.WHITE}
            style={[
              styles.selectButton,
              isSelected && { borderColor: COLORS.APP_GREEN },
            ]}
            labelStyle={styles.selectButtonLabel}
          >
            {isSelected ? 'Selected' : 'Select Plan'}
          </Button>
        )}
      </RNAnimated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  selectedCard: {
    borderWidth: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  iconContainerSelected: {
    backgroundColor: COLORS.APP_GREEN,
    borderColor: COLORS.APP_GREEN,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  planName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  recommendedTag: {
    backgroundColor: COLORS.APP_GREEN,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  price: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  tagline: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  expandedContent: {
    overflow: 'hidden',
  },
  featuresContainer: {
    marginBottom: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  featureText: {
    fontSize: FONT_SIZES.md,
    flex: 1,
  },
  selectButton: {
    marginTop: SPACING.md,
  },
  selectButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default PlanCard;

