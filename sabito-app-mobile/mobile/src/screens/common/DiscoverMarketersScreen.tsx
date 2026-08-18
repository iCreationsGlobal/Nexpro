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
import { Search, Filter, X, Users } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES } from '../../constants/sizes';
import { fetchPublicMarketers } from '../../api/marketplace';
import MarketerCard from '../../components/common/MarketerCard';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Marketer } from '../../types/api';

type DiscoverMarketersScreenProps = RootStackScreenProps<'DiscoverMarketers'>;

interface MarketerFilters {
  industry: string;
  experience: string;
  rating: string;
  sort: 'featured' | 'rating' | 'experience' | 'referrals';
}

const DiscoverMarketersScreen: React.FC<DiscoverMarketersScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [marketers, setMarketers] = useState<Marketer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search and filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<MarketerFilters>({
    industry: '',
    experience: '',
    rating: '',
    sort: 'featured',
  });
  const [tempFilters, setTempFilters] = useState<MarketerFilters>(filters);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  useEffect(() => {
    loadMarketers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage]);

  const loadMarketers = async (isRefresh: boolean = false): Promise<void> => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
        setCurrentPage(1);
      } else {
        setIsLoading(true);
      }
      
      setError(null);

      const result = await fetchPublicMarketers({
        ...filters,
        search: searchQuery,
        page: isRefresh ? 1 : currentPage,
        limit: 10,
      });

      if (result.success && result.data) {
        setMarketers(result.data.marketers);
        setTotalPages(result.data.pagination.totalPages);
        setTotalCount(result.data.pagination.totalCount);
      } else {
        setError(result.error || 'Failed to load marketers');
      }
    } catch (err) {
      setError('Failed to load marketers');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  const handleSearch = (): void => {
    setCurrentPage(1);
    loadMarketers();
  };

  const handleApplyFilters = (): void => {
    setFilters(tempFilters);
    setShowFilters(false);
    setCurrentPage(1);
  };

  const handleClearFilters = (): void => {
    const clearedFilters: MarketerFilters = {
      industry: '',
      experience: '',
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

  const handleMarketerPress = (marketer: Marketer): void => {
    navigation.navigate('DiscoverMarketerDetails', { marketerId: marketer.id });
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
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Industry Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Industry Expertise</Text>
              <RNTextInput
                style={[styles.filterInput, { 
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text 
                }]}
                placeholder="E.g., Tech, Retail, Food"
                placeholderTextColor={colors.inputPlaceholder}
                value={tempFilters.industry}
                onChangeText={(text: string) => setTempFilters({ ...tempFilters, industry: text })}
              />
            </View>

            {/* Experience Filter */}
            <View style={styles.filterGroup}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Experience Level</Text>
              <View style={styles.experienceOptions}>
                {[
                  { value: '1-2', label: '1-2 years' },
                  { value: '3-5', label: '3-5 years' },
                  { value: '5+', label: '5+ years' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.experienceOption,
                      { 
                        backgroundColor: colors.cardBackground,
                        borderColor: tempFilters.experience === option.value ? COLORS.APP_GREEN : colors.border,
                      }
                    ]}
                    onPress={() => setTempFilters({ ...tempFilters, experience: option.value })}
                  >
                    <Text style={[
                      styles.experienceText,
                      { color: tempFilters.experience === option.value ? COLORS.APP_GREEN : colors.text }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                    onPress={() => setTempFilters({ ...tempFilters, sort: option.value as MarketerFilters['sort'] })}
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Discover Marketers</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {totalCount} professional marketers
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
            placeholder="Search marketers..."
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
            onRefresh={() => loadMarketers(true)}
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
              Finding marketers for you...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Users size={64} color={colors.iconSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Unable to load marketers
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadMarketers()}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : marketers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Users size={64} color={colors.iconSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No marketers found
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
            {marketers.map((marketer) => (
              <MarketerCard
                key={marketer.id}
                marketer={marketer}
                onPress={handleMarketerPress}
              />
            ))}

            {isLoadingMore && (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
                <Text style={[styles.loadMoreText, { color: colors.textSecondary }]}>
                  Loading more...
                </Text>
              </View>
            )}

            {currentPage >= totalPages && marketers.length > 0 && (
              <Text style={[styles.endText, { color: colors.textSecondary }]}>
                You've reached the end
              </Text>
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

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
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
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
  experienceOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  experienceOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  experienceText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
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

export default DiscoverMarketersScreen;






