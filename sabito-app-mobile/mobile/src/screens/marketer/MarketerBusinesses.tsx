import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Building2, X, CheckCircle, Clock, ChevronRight, Star } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getCommonThemedStyles } from '../../utils/themeHelper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import EmptyState from '../../components/common/EmptyState';
import BusinessReviewModal from '../../components/common/BusinessReviewModal';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

type MarketerBusinessesScreenProps = RootStackScreenProps<'MarketerBusinesses'>;

const STATUS_FILTERS = ['All', 'My businesses'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// Extended Business interface for marketer businesses list
interface ExtendedBusiness extends Business {
  hasApplied?: boolean;
  partnershipStatus?: 'pending' | 'accepted' | 'rejected';
  averageRating?: number;
  totalRatings?: number;
}

const MarketerBusinesses: React.FC<MarketerBusinessesScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors: themeColors, isDark } = getTheme(effectiveTheme || theme);
  const themedStyles = getCommonThemedStyles(theme);
  
  const [businesses, setBusinesses] = useState<ExtendedBusiness[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [selectedBusinessForReview, setSelectedBusinessForReview] = useState<ExtendedBusiness | null>(null);

  // Memoize filtered businesses to prevent unnecessary recalculations
  const filteredBusinesses = useMemo(() => {
    let filtered = businesses;

    // Filter by "My businesses"
    if (activeFilter === 'My businesses') {
      filtered = filtered.filter(business => business.hasApplied === true);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(business => 
        business.businessName?.toLowerCase().includes(query) ||
        business.industry?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [businesses, activeFilter, searchQuery]);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async (): Promise<void> => {
    try {
      const response = await apiClient.get<{ businesses: ExtendedBusiness[] }>('/api/business/approved');
      
      if (response.data.businesses) {
        setBusinesses(response.data.businesses);
      } else {
        setBusinesses([]);
      }
    } catch (error: any) {
      setBusinesses([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchBusinesses();
  };

  const handleCardPress = (business: ExtendedBusiness): void => {
    // Pass the business data for instant loading
    navigation.navigate('BusinessDetails', { businessId: business.id, initialData: business });
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const renderPartnershipBadge = (business: ExtendedBusiness): React.ReactElement | null => {
    if (!business.hasApplied) {
      return null;
    }

    const status = business.partnershipStatus;
    
    if (status === 'accepted') {
      return (
        <View style={styles.partnerBadge}>
          <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2} />
          <Text style={styles.partnerBadgeText}>Partner</Text>
        </View>
      );
    }
    
    if (status === 'pending') {
      return (
        <View style={[styles.partnerBadge, styles.pendingBadge]}>
          <Clock size={14} color="#F59E0B" strokeWidth={2} />
          <Text style={[styles.partnerBadgeText, styles.pendingBadgeText]}>Request Sent</Text>
        </View>
      );
    }
    
    return null;
  };

  const renderRatingStars = (rating?: number): React.ReactElement[] => {
    const stars: React.ReactElement[] = [];
    const avgRating = rating || 0;
    
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          size={16}
          color={i <= avgRating ? '#FBBF24' : '#D1D5DB'}
          fill={i <= avgRating ? '#FBBF24' : '#D1D5DB'}
          strokeWidth={0}
        />
      );
    }
    
    return stars;
  };

  const renderBusinessCard = (business: ExtendedBusiness): React.ReactElement => (
    <TouchableOpacity 
      key={business.id} 
      style={[styles.businessCard, themedStyles.card]}
      onPress={() => handleCardPress(business)}
      activeOpacity={0.7}
    >
      {/* Cover Image with Content Overlay */}
      {business.coverImage ? (
        <View style={styles.coverImageContainer}>
          <Image 
            source={{ uri: business.coverImage }} 
            style={styles.coverImage}
            resizeMode="cover"
          />
          {/* Dark Gradient Overlay */}
          <View style={styles.coverGradient} />
          
          {/* Content on Cover - Name, Logo & Rating */}
          <View style={styles.coverContent}>
            <View style={styles.coverHeaderLeft}>
              <Text style={styles.businessNameOnCover} numberOfLines={2}>
                {business.businessName || 'Unnamed Business'}
              </Text>
              
              {/* Rating Stars on Cover */}
              <View style={styles.ratingOnCover}>
                <View style={styles.starsRow}>
                  {renderRatingStars(business.averageRating)}
                </View>
                <Text style={styles.ratingCountOnCover}>
                  {business.totalRatings ? `(${business.totalRatings})` : '(No reviews)'}
                </Text>
              </View>
              
              {/* Partnership Badge on Cover */}
              {business.hasApplied && business.partnershipStatus === 'accepted' && (
                <View style={styles.partnershipBadgeOnCover}>
                  <CheckCircle size={14} color={COLORS.APP_GREEN} strokeWidth={2} />
                  <Text style={styles.partnershipBadgeTextOnCover}>Partnered</Text>
                </View>
              )}
            </View>
            
            {/* Business Logo on Cover */}
            <View style={[
              styles.businessLogoOnCover,
              !business.logo && styles.logoAvatarOnCover
            ]}>
              {business.logo ? (
                <Image source={{ uri: business.logo }} style={styles.logoImageOnCover} />
              ) : (
                <Text style={styles.logoAvatarText}>
                  {business.businessName?.charAt(0)?.toUpperCase() || 'B'}
                </Text>
              )}
            </View>
          </View>
        </View>
      ) : (
        /* No Cover - Regular Header */
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={[styles.businessName, themedStyles.text]} numberOfLines={2}>
              {business.businessName || 'Unnamed Business'}
            </Text>
            
            {/* Rating Stars */}
            <View style={styles.ratingContainer}>
              <View style={styles.starsRow}>
                {renderRatingStars(business.averageRating)}
              </View>
              <Text style={[styles.ratingCount, themedStyles.textSecondary]}>
                {business.totalRatings ? `(${business.totalRatings})` : '(No reviews)'}
              </Text>
            </View>
            
            {/* Partnership Badge */}
            {renderPartnershipBadge(business)}
          </View>
          
          {/* Business Logo */}
          <View style={[
            styles.businessLogo,
            !business.logo && styles.logoAvatar
          ]}>
            {business.logo ? (
              <Image source={{ uri: business.logo }} style={styles.logoImage} />
            ) : (
              <Text style={styles.logoAvatarText}>
                {business.businessName?.charAt(0)?.toUpperCase() || 'B'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Industry Type */}
      <View style={styles.industryContainer}>
        <Text style={[styles.industry, themedStyles.textSecondary]}>{business.industry || 'Service'}</Text>
      </View>

      {/* Commission Footer */}
      <View style={styles.cardFooter}>
        <View style={[styles.commissionBox, { backgroundColor: isDark ? themeColors.backgroundSecondary : '#F0FDF4' }]}>
          <Text style={[styles.commissionText, { color: themeColors.text }]}>
            Commission: {business.commissionRateNew || 15}% of new client payment + {business.commissionRateReturning || 10}% of returning client payment
          </Text>
        </View>
        <View style={styles.arrowButton}>
          <ChevronRight size={24} color={COLORS.WHITE} strokeWidth={2.5} />
        </View>
      </View>
      
      {/* Review Button for Accepted Partnerships */}
      {business.hasApplied && business.partnershipStatus === 'accepted' && activeFilter === 'My businesses' && (
        <TouchableOpacity
          style={[styles.reviewButton, { backgroundColor: '#fbbf24' }]}
          onPress={(e) => {
            e.stopPropagation();
            setSelectedBusinessForReview(business);
            setShowReviewModal(true);
          }}
          activeOpacity={0.7}
        >
          <Star size={16} color={COLORS.WHITE} fill={COLORS.WHITE} />
          <Text style={styles.reviewButtonText}>Rate Business</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={Building2}
      title="No Businesses Found"
      subtitle={activeFilter === 'My businesses' 
        ? 'You haven\'t partnered with any businesses yet. Browse "All" businesses to send partnership requests.'
        : 'No businesses available. Check back later.'}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themedStyles.safeArea]}>
        <StatusBar barStyle={themedStyles.statusBar} backgroundColor={themeColors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading businesses...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, themedStyles.safeArea]}>
      <StatusBar barStyle={themedStyles.statusBar} backgroundColor={themeColors.background} />

      {/* Header */}
      <View style={[styles.header, themedStyles.header]}>
        {isSearchActive ? (
          <>
            <TouchableOpacity onPress={handleSearchClose} style={styles.searchBackButton}>
              <X size={24} color={themeColors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.searchBarContainer, { backgroundColor: themeColors.inputBackground }]}>
              <Search size={20} color={themeColors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.searchInput, themedStyles.input]}
                placeholder="Search businesses..."
                placeholderTextColor={themedStyles.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color={themeColors.iconSecondary} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.headerTitle, themedStyles.text]}>Businesses</Text>
            <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}>
              <Search size={24} color={themeColors.iconSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Filter Chips - Only show when there are businesses */}
      {!isSearchActive && businesses.length > 0 && (
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {STATUS_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  { backgroundColor: isDark ? 'transparent' : '#F4F4F4', borderColor: themeColors.border },
                  activeFilter === filter && [styles.filterChipActive, { backgroundColor: isDark ? themeColors.backgroundSecondary : '#E8F5E9', borderColor: COLORS.APP_GREEN }],
                ]}
                onPress={() => setActiveFilter(filter as StatusFilter)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: themeColors.textSecondary },
                    activeFilter === filter && [styles.filterChipTextActive, { color: COLORS.APP_GREEN }],
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Businesses List */}
      <ScrollView
        style={[styles.scrollView, themedStyles.scrollView]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.APP_GREEN}
            colors={[COLORS.APP_GREEN]}
          />
        }
      >
        {filteredBusinesses.length === 0 ? (
          renderEmptyState()
        ) : (
          filteredBusinesses.map((business) => renderBusinessCard(business))
        )}
      </ScrollView>

      {/* Review Modal */}
      {selectedBusinessForReview && (
        <BusinessReviewModal
          business={selectedBusinessForReview}
          visible={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setSelectedBusinessForReview(null);
          }}
          onReviewSubmitted={() => {
            setShowReviewModal(false);
            setSelectedBusinessForReview(null);
            // Optionally refresh the list
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBackButton: {
    padding: 8,
    marginRight: SPACING.sm,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    marginLeft: SPACING.sm,
    height: 48,
  },
  filterContainer: {
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
  },
  filterChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  filterChipTextActive: {
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  businessCard: {
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  coverImageContainer: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  coverContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 16,
  },
  coverHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  businessNameOnCover: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  ratingOnCover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingCountOnCover: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: FONT_WEIGHTS.medium,
  },
  businessLogoOnCover: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  logoAvatarOnCover: {
    backgroundColor: COLORS.APP_GREEN,
    borderColor: '#FFFFFF',
  },
  partnershipBadgeOnCover: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  partnershipBadgeTextOnCover: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    padding: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  businessName: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 8,
    lineHeight: 26,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingCount: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
  businessLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#718096',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#718096',
  },
  logoAvatar: {
    backgroundColor: COLORS.APP_GREEN,
    borderColor: COLORS.APP_GREEN,
  },
  logoImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  logoImageOnCover: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  logoAvatarText: {
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    gap: 4,
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
  },
  partnerBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
    letterSpacing: 0.5,
  },
  pendingBadgeText: {
    color: '#F59E0B',
  },
  industryContainer: {
    paddingHorizontal: 16,
  },
  industry: {
    fontSize: 14,
    color: '#718096',
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: 16,
    paddingTop: 0,
  },
  commissionBox: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  commissionText: {
    fontSize: 13,
    color: '#4A5568',
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: 18,
  },
  arrowButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
  },
  reviewButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  reviewButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default MarketerBusinesses;





