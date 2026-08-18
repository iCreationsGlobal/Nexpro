import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Star, MapPin, TrendingUp, Award, Clock } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { useCardPressAnimation } from '../../utils/animations';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES } from '../../constants/sizes';
import type { Marketer } from '../../types/api';

interface MarketerCardProps {
  marketer: Marketer & {
    location?: string;
    city?: string;
    country?: string;
    totalRatings?: number;
    industryExpertise?: string[];
    skills?: string[];
    bio?: string;
    yearsExperience?: number;
    conversionRate?: number;
    responseTimeMinutes?: number;
    isTopMarketer?: boolean;
    isFounder?: boolean;
  };
  onPress: (marketer: Marketer) => void;
}

const MarketerCard = memo<MarketerCardProps>(({ marketer, onPress }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  const {
    name,
    profileImage,
    location,
    city,
    country,
    averageRating = 0,
    totalRatings = 0,
    industryExpertise = [],
    skills = [],
    bio,
    yearsExperience = 0,
    conversionRate = 0,
    responseTimeMinutes = 0,
    isTopMarketer = false,
    isFounder = false,
    subscriptionPlan,
  } = marketer;

  const displayLocation = location || [city, country].filter(Boolean).join(', ');
  const rating = Number(averageRating) || 0;
  const reviews = Number(totalRatings) || 0;
  const isProfessional = subscriptionPlan === 'professional';

  const getInitial = () => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  const formatResponseTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  const { animatedStyle, handlePressIn, handlePressOut } = useCardPressAnimation();

  return (
    <Pressable
      onPress={() => onPress(marketer)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.border,
          },
          animatedStyle,
        ]}
      >
      {/* Header with badges */}
      <View style={styles.header}>
        <View style={styles.ratingContainer}>
          <Star size={14} color="#F59E0B" fill="#F59E0B" />
          <Text style={styles.ratingText}>
            {rating.toFixed(1)}
          </Text>
          <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>
            ({reviews > 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews})
          </Text>
        </View>
        
        <View style={styles.badgesRow}>
          {isTopMarketer && (
            <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
              <Award size={10} color="#FFF" />
              <Text style={styles.badgeText}>TOP</Text>
            </View>
          )}
          {isProfessional && !isTopMarketer && (
            <View style={[styles.badge, { backgroundColor: '#8B5CF6' }]}>
              <Text style={styles.badgeText}>PRO</Text>
            </View>
          )}
        </View>
      </View>

      {/* Marketer Info */}
      <View style={styles.marketerInfo}>
        <View style={styles.avatarContainer}>
          {profileImage ? (
            <Image 
              source={{ uri: profileImage }} 
              style={styles.avatar}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
              onError={() => {}}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.APP_GREEN }]}>
              <Text style={styles.avatarText}>{getInitial()}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.infoContent}>
          <Text style={[styles.marketerName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          {yearsExperience > 0 && (
            <Text style={[styles.experience, { color: colors.textSecondary }]}>
              {yearsExperience} {yearsExperience === 1 ? 'year' : 'years'} experience
            </Text>
          )}
        </View>
      </View>

      {/* Location */}
      {displayLocation && (
        <View style={styles.locationContainer}>
          <MapPin size={12} color={colors.textSecondary} />
          <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
            {displayLocation}
          </Text>
        </View>
      )}

      {/* Skills/Expertise Tags */}
      {(skills.length > 0 || industryExpertise.length > 0) && (
        <View style={styles.tagsContainer}>
          {(industryExpertise.length > 0 ? industryExpertise : skills).slice(0, 3).map((tag, index) => (
            <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.tagText, { color: colors.textSecondary }]} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ))}
          {(industryExpertise.length > 3 || skills.length > 3) && (
            <Text style={[styles.moreTags, { color: colors.textSecondary }]}>
              +{(industryExpertise.length > 3 ? industryExpertise.length : skills.length) - 3} more
            </Text>
          )}
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsContainer}>
        {conversionRate > 0 && (
          <View style={styles.statItem}>
            <TrendingUp size={12} color={COLORS.APP_GREEN} />
            <Text style={[styles.statText, { color: COLORS.APP_GREEN }]}>
              {conversionRate.toFixed(1)}% conversion
            </Text>
          </View>
        )}
        {responseTimeMinutes > 0 && (
          <View style={styles.statItem}>
            <Clock size={12} color={colors.textSecondary} />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              {formatResponseTime(responseTimeMinutes)} response
            </Text>
          </View>
        )}
      </View>
      </Animated.View>
    </Pressable>
  );
});

MarketerCard.displayName = 'MarketerCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.BLACK,
  },
  reviewCount: {
    fontSize: FONT_SIZES.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.WHITE,
  },
  marketerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarContainer: {
    marginRight: SPACING.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.WHITE,
  },
  infoContent: {
    flex: 1,
  },
  marketerName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  experience: {
    fontSize: FONT_SIZES.sm,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.sm,
  },
  location: {
    fontSize: FONT_SIZES.xs,
    flex: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  tag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: FONT_SIZES.xs,
  },
  moreTags: {
    fontSize: FONT_SIZES.xs,
    alignSelf: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
});

export default MarketerCard;

