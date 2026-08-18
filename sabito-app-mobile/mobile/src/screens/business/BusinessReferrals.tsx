import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Share2, X, Briefcase, CreditCard, Calendar } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getCommonThemedStyles } from '../../utils/themeHelper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import EmptyState from '../../components/common/EmptyState';
import apiClient from '../../services/apiClient';
import { getStatusColor } from '../../utils/statusColors';
import type { BusinessTabScreenProps } from '../../types/navigation';
import type { Referral } from '../../types/api';

type BusinessReferralsProps = BusinessTabScreenProps<'Referrals'>;

const STATUS_FILTERS = ['All', 'New', 'Contacted', 'Interested', 'Qualified', 'Converted', 'Unresponsive', 'Rejected'] as const;

const BusinessReferrals: React.FC<BusinessReferralsProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors: themeColors, isDark } = getTheme(effectiveTheme || theme);
  const themedStyles = getCommonThemedStyles(theme);
  
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [filteredReferrals, setFilteredReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

  useEffect(() => {
    fetchReferrals();
  }, []);

  useEffect(() => {
    filterReferrals();
  }, [referrals, activeFilter, searchQuery]);

  const fetchReferrals = async (): Promise<void> => {
    try {
      const response = await apiClient.get('/api/referrals/business');
      if (response.data.referrals) {
        setReferrals(response.data.referrals as Referral[]);
      }
    } catch (error: any) {
      // If 404, means no business profile or no referrals - set empty array
      if (error.response?.status === 404) {
        setReferrals([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterReferrals = (): void => {
    let filtered = referrals;

    // Filter by status
    if (activeFilter !== 'All') {
      filtered = filtered.filter(ref => ref.status?.toLowerCase() === activeFilter.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ref => 
        ref.clientName?.toLowerCase().includes(query) ||
        ref.marketer?.name?.toLowerCase().includes(query) ||
        ref.clientEmail?.toLowerCase().includes(query)
      );
    }

    setFilteredReferrals(filtered);
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchReferrals();
  };

  const handleCardPress = (referral: Referral): void => {
    // Pass the referral data for instant loading
    navigation.navigate('ReferralDetails', { referralId: referral.id, initialData: referral });
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const statusColors = getStatusColor(status, 'referral');
    return (
      <View style={[styles.statusBadge, { 
        backgroundColor: isDark ? 'transparent' : statusColors.bg, 
        borderColor: statusColors.border 
      }]}>
        <Text style={[styles.statusText, { color: statusColors.color }]}>{status}</Text>
      </View>
    );
  };

  const renderReferralCard = (referral: Referral): React.ReactElement => (
    <TouchableOpacity
      key={referral.id}
      style={[styles.referralCard, themedStyles.card]}
      onPress={() => handleCardPress(referral)}
      activeOpacity={0.7}
    >
      {/* Client Info with Status */}
      <View style={styles.cardHeader}>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientAvatarText}>
            {referral.clientName?.charAt(0)?.toUpperCase() || 'C'}
          </Text>
        </View>
        <View style={styles.clientInfo}>
          <Text style={[styles.clientName, themedStyles.text]}>{referral.clientName || 'Unknown Client'}</Text>
          <Text style={[styles.marketerName, themedStyles.textSecondary]}>
            From: {referral.marketer?.name || 'Unknown Marketer'}
          </Text>
        </View>
        {renderStatusBadge(referral.status || 'New')}
      </View>

      {/* Stats Chips */}
      <View style={styles.chipsContainer}>
        <View style={[styles.chip, { 
          backgroundColor: isDark ? 'transparent' : '#F3F4F6',
          borderWidth: 1,
          borderColor: isDark ? themeColors.border : '#E0E0E0'
        }]}>
          <Briefcase size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, themedStyles.textSecondary]}>
            {referral.totalProjects || 0} Project{referral.totalProjects !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.chip, { 
          backgroundColor: isDark ? 'transparent' : '#F3F4F6',
          borderWidth: 1,
          borderColor: isDark ? themeColors.border : '#E0E0E0'
        }]}>
          <CreditCard size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, themedStyles.textSecondary]}>₵{(referral.totalAmountPaid || 0).toFixed(2)}</Text>
        </View>
        <View style={[styles.chip, { 
          backgroundColor: isDark ? 'transparent' : '#F3F4F6',
          borderWidth: 1,
          borderColor: isDark ? themeColors.border : '#E0E0E0'
        }]}>
          <Calendar size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, themedStyles.textSecondary]}>
            {referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={Share2}
      title="No Referrals Yet"
      subtitle={activeFilter !== 'All' 
        ? `No referrals with "${activeFilter}" status.`
        : 'Marketers will send you client referrals. They will appear here.'}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themedStyles.safeArea]}>
        <StatusBar barStyle={themedStyles.statusBar} backgroundColor={themeColors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, themedStyles.textSecondary]}>Loading referrals...</Text>
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
            <View style={[styles.searchBarContainer, themedStyles.input]}>
              <Search size={20} color={themeColors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.inputText }]}
                placeholder="Search referrals..."
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
            <Text style={[styles.headerTitle, themedStyles.text]}>Referrals</Text>
            <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { 
              backgroundColor: isDark ? 'transparent' : '#F4F4F4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? themeColors.border : 'transparent'
            }]}>
              <Search size={24} color={themeColors.text} strokeWidth={1.5} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Status Filter Chips - Only show when there are referrals */}
      {!isSearchActive && referrals.length > 0 && (
        <View style={[styles.filterContainer, { borderBottomColor: themeColors.border }]}>
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
                  { 
                    backgroundColor: activeFilter === filter 
                      ? COLORS.APP_GREEN 
                      : (isDark ? 'transparent' : COLORS.WHITE),
                    borderColor: activeFilter === filter 
                      ? COLORS.APP_GREEN 
                      : themeColors.border
                  }
                ]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: activeFilter === filter ? COLORS.WHITE : themeColors.textSecondary },
                    activeFilter === filter && styles.filterChipTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Referrals List */}
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
        {filteredReferrals.length === 0 ? (
          renderEmptyState()
        ) : (
          filteredReferrals.map((referral) => renderReferralCard(referral))
        )}
      </ScrollView>
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
    color: COLORS.GRAY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F4',
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
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    marginLeft: SPACING.sm,
    height: 48,
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
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
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.APP_GREEN,
    borderColor: COLORS.APP_GREEN,
  },
  filterChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.GRAY,
  },
  filterChipTextActive: {
    color: COLORS.WHITE,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  referralCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  clientAvatarText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 4,
  },
  marketerName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default BusinessReferrals;






