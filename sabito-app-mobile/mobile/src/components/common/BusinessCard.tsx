import React, { memo } from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Star, MapPin, TrendingUp } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { useCardPressAnimation } from '../../utils/animations';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES } from '../../constants/sizes';
import type { Business } from '../../types/api';

interface BusinessCardProps {
  business: Business & {
    name?: string;
    city?: string;
    country?: string;
    rating?: number;
    totalRatings?: number;
    totalReviews?: number;
    services?: string[] | string;
    description?: string;
    fullDescription?: string;
    isPremium?: boolean;
    isFounder?: boolean;
  };
  onPress: (business: Business) => void;
}

const BusinessCard = memo<BusinessCardProps>(({ business, onPress }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  const {
    businessName,
    name,
    industry,
    logo,
    address: location,
    city,
    country,
    averageRating,
    rating: rawRating,
    totalRatings,
    totalReviews,
    services = [],
    description,
    fullDescription,
    isPremium = false,
    isFounder = false,
  } = business;

  const displayLocation = location || [city, country].filter(Boolean).join(', ');
  const rating = Number(averageRating || rawRating) || 0;
  const reviews = Number(totalRatings || totalReviews) || 0;
  const displayName = businessName || name;
  const displayDescription = description || fullDescription;

  // Handle services as string or array
  const servicesArray = Array.isArray(services) 
    ? services 
    : (typeof services === 'string' ? services.split(',').map(s => s.trim()).filter(Boolean) : []);

  const getInitial = () => {
    if (!displayName) return '?';
    return displayName.charAt(0).toUpperCase();
  };

  const { animatedStyle, handlePressIn, handlePressOut } = useCardPressAnimation();

  return (
    <Pressable
      onPress={() => onPress(business)}
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
        
        {isPremium && (
          <View style={[styles.badge, { backgroundColor: '#8B5CF6' }]}>
            <Text style={styles.badgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Business Info */}
      <View style={styles.businessInfo}>
        <View style={styles.avatarContainer}>
          {logo ? (
            <Image 
              source={{ uri: logo }} 
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
          <Text style={[styles.businessName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.industry, { color: colors.textSecondary }]} numberOfLines={1}>
            {industry || 'N/A'}
          </Text>
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

      {/* Services Tags */}
      {servicesArray.length > 0 && (
        <View style={styles.servicesContainer}>
          {servicesArray.slice(0, 3).map((service, index) => (
            <View key={index} style={[styles.serviceTag, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.serviceText, { color: colors.textSecondary }]} numberOfLines={1}>
                {service}
              </Text>
            </View>
          ))}
          {servicesArray.length > 3 && (
            <Text style={[styles.moreServices, { color: colors.textSecondary }]}>
              +{servicesArray.length - 3} more
            </Text>
          )}
        </View>
      )}

      {/* Conversion Rate Badge */}
      {isPremium && (
        <View style={styles.statsContainer}>
          <TrendingUp size={12} color={COLORS.APP_GREEN} />
          <Text style={[styles.statsText, { color: COLORS.APP_GREEN }]}>
            Premium Business
          </Text>
        </View>
      )}
      </Animated.View>
    </Pressable>
  );
});

BusinessCard.displayName = 'BusinessCard';

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
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.WHITE,
  },
  businessInfo: {
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
  businessName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  industry: {
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
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  serviceTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  serviceText: {
    fontSize: FONT_SIZES.xs,
  },
  moreServices: {
    fontSize: FONT_SIZES.xs,
    alignSelf: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
  },
  statsText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
});

export default BusinessCard;

