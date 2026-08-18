import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  TextInput as RNTextInput,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Filter, X, Building2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES } from '../../constants/sizes';
import { fetchPublicBusinesses } from '../../api/marketplace';
import BusinessCard from '../../components/common/BusinessCard';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

type DiscoverBusinessesScreenProps = RootStackScreenProps<'DiscoverBusinesses'>;

interface BusinessFilters {
  industry: string;
  location: string;
  rating: string;
  sort: 'featured' | 'rating' | 'recent';
}

const DiscoverBusinessesScreen: React.FC<DiscoverBusinessesScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search and filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<BusinessFilters>({
    industry: '',
    location: '',
    rating: '',
    sort: 'featured',
  });
  const [tempFilters, setTempFilters] = useState<BusinessFilters>(filters);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  useEffect(() => {
    loadBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage]);

  const loadBusinesses = async (isRefresh: boolean = false): Promise<void> => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
        setCurrentPage(1);
      } else {
        setIsLoading(true);
      }
      
      setError(null);

      const result = await fetchPublicBusinesses({
        ...filters,
        search: searchQuery,
        page: isRefresh ? 1 : currentPage,
        limit: 10,
      });

      if (result.success && result.data) {
        setBusinesses(result.data.businesses);
        setTotalPages(result.data.pagination.totalPages);
        setTotalCount(result.data.pagination.totalCount);
      } else {
        setError(result.error || 'Failed to load businesses');
      }
    } catch (err) {
      setError('Failed to load businesses');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  const handleSearch = (): void => {
    setCurrentPage(1);
    loadBusinesses();
  };

  const handleApplyFilters = (): void => {
    setFilters(tempFilters);
    setShowFilters(false);
    setCurrentPage(1);
  };

  const handleClearFilters = (): void => {
    const clearedFilters: BusinessFilters = {
      industry: '',
      location: '',
      rating: '',
      sort: 'featured',
    };
    setTempFilters(clearedFilters);
    setFilters(clearedFilters);
    setSearchQuery('');
    setShowFilters(false);
    setCurrentPage(1);
  };

  const handleLoadMore = (): void => {
    if (currentPage < totalPages && !isLoadingMore) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleBusinessPress = (business: Business): void => {
    // Pass the business data for instant loading
    navigation.navigate('DiscoverBusinessDetails', { businessId: business.id, initialData: business });
  };

  const renderFiltersModal = (): React.ReactElement => (
    <Modal
      visible={showFilters}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowFilters(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Industry Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Industry</Text>
              <RNTextInput
                style={[styles.filterInput, { 
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text 
                }]}
                placeholder="E.g., Restaurant, Tech, Retail"
                placeholderTextColor={colors.inputPlaceholder}
                value={tempFilters.industry}
                onChangeText={(text: string) => setTempFilters({ ...tempFilters, industry: text })}
              />
            </View>

            {/* Location Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Location</Text>
              <RNTextInput
                style={[styles.filterInput, { 
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text 
                }]}
                placeholder="E.g., Accra, Kumasi"
                placeholderTextColor={colors.inputPlaceholder}
                value={tempFilters.location}
                onChangeText={(text: string) => setTempFilters({ ...tempFilters, location: text })}
              />
            </View>

            {/* Rating Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Minimum Rating</Text>
              <View style={styles.ratingOptions}>
                {['3', '4', '4.5'].map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    style={[
                      styles.ratingOption,
                      { 
                        backgroundColor: colors.cardBackground,
                        borderColor: tempFilters.rating === rating ? COLORS.APP_GREEN : colors.border,
                      }
                    ]}
                    onPress={() => setTempFilters({ ...tempFilters, rating })}
                  >
                    <Text style={[
                      styles.ratingText,
                      { color: tempFilters.rating === rating ? COLORS.APP_GREEN : colors.text }
                    ]}>
                      {rating}+ stars
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sort Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Sort By</Text>
              <View style={styles.sortOptions}>
                {[
                  { value: 'featured', label: 'Featured' },
                  { value: 'rating', label: 'Rating' },
                  { value: 'recent', label: 'Recent' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.sortOption,
                      { 
                        backgroundColor: colors.cardBackground,
                        borderColor: tempFilters.sort === option.value ? COLORS.APP_GREEN : colors.border,
                      }
                    ]}
                    onPress={() => setTempFilters({ ...tempFilters, sort: option.value as BusinessFilters['sort'] })}
                  >
                    <Text style={[
                      styles.sortText,
                      { color: tempFilters.sort === option.value ? COLORS.APP_GREEN : colors.text }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Modal Actions */}
          <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.clearButton, { borderColor: colors.border }]}
              onPress={handleClearFilters}
            >
              <Text style={[styles.clearButtonText, { color: colors.text }]}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApplyFilters}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Discover Businesses</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {totalCount} businesses available
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={[styles.searchContainer, { 
          backgroundColor: colors.inputBackground,
          borderColor: colors.border 
        }]}>
          <Search size={20} color={colors.iconSecondary} />
          <RNTextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search businesses..."
            placeholderTextColor={colors.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={20} color={colors.iconSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: COLORS.APP_GREEN }]}
          onPress={() => setShowFilters(true)}
        >
          <Filter size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadBusinesses(true)}
            tintColor={COLORS.APP_GREEN}
          />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const paddingToBottom = 20;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom) {
            handleLoadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Finding businesses for you...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Building2 size={64} color={colors.iconSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Unable to load businesses
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadBusinesses()}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : businesses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Building2 size={64} color={colors.iconSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No businesses found
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Try adjusting your filters or search query
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleClearFilters}
            >
              <Text style={styles.retryButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {businesses.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                onPress={handleBusinessPress}
              />
            ))}

            {/* Load More Indicator */}
            {isLoadingMore && (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
                <Text style={[styles.loadMoreText, { color: colors.textSecondary }]}>
                  Loading more...
                </Text>
              </View>
            )}

            {/* Pagination Info */}
            {currentPage >= totalPages && businesses.length > 0 && (
              <Text style={[styles.endText, { color: colors.textSecondary }]}>
                You've reached the end
              </Text>
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Filters Modal */}
      {renderFiltersModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  loadingContainer: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  emptyContainer: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retryButton: {
    backgroundColor: COLORS.APP_GREEN,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  loadMoreText: {
    fontSize: FONT_SIZES.sm,
  },
  endText: {
    textAlign: 'center',
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZES.sm,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
  },
  modalBody: {
    padding: SPACING.md,
  },
  filterGroup: {
    marginBottom: SPACING.lg,
  },
  filterLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
  },
  ratingOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  ratingOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  ratingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  sortOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sortOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  sortText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    gap: SPACING.sm,
  },
  clearButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
});

export default DiscoverBusinessesScreen;






