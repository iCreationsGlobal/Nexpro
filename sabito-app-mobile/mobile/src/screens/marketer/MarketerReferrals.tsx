import React, { useState, useEffect, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Search, UserPlus, X, Plus, Briefcase, Calendar } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getCommonThemedStyles } from '../../utils/themeHelper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import EmptyState from '../../components/common/EmptyState';
import apiClient from '../../services/apiClient';
import { getStatusColor } from '../../utils/statusColors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Referral, User as UserType } from '../../types/api';

type MarketerReferralsScreenProps = RootStackScreenProps<'MarketerReferrals'>;

const STATUS_FILTERS = ['All', 'New', 'Contacted', 'Interested', 'Qualified', 'Converted', 'Unresponsive', 'Rejected'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const MarketerReferrals: React.FC<MarketerReferralsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors: themeColors, isDark } = getTheme(effectiveTheme || theme);
  const themedStyles = getCommonThemedStyles(theme);
  
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [filteredReferrals, setFilteredReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

  // Fetch referrals when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchReferrals();
      return () => {
        // Cleanup if needed
      };
    }, [])
  );

  useEffect(() => {
    filterReferrals();
  }, [referrals, activeFilter, searchQuery]);

  const fetchReferrals = async (): Promise<void> => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? (JSON.parse(userStr) as UserType) : null;

      if (!user || !user.id) {
        setReferrals([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const response = await apiClient.get<{ referrals: Referral[] }>(`/api/referrals/marketer/${user.id}`);
      if (response.data.referrals) {
        setReferrals(response.data.referrals);
      }
    } catch (error: any) {
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
        ref.businessName?.toLowerCase().includes(query) ||
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
    navigation.navigate('MarketerReferralDetails', { referralId: referral.id, initialData: referral });
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const handleAddReferral = (): void => {
    navigation.navigate('AddReferral');
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const colors = getStatusColor(status, 'referral');
    return (
      <View style={[styles.statusBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Text style={[styles.statusText, { color: colors.text }]}>{status}</Text>
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
          <Text style={[styles.businessName, themedStyles.textSecondary]}>
            For: {referral.businessName || 'Unknown Business'}
          </Text>
        </View>
        {renderStatusBadge(referral.status || 'New')}
      </View>

      {/* Stats Chips */}
      <View style={styles.chipsContainer}>
        <View style={[styles.chip, { backgroundColor: isDark ? themeColors.backgroundSecondary : '#F3F4F6', borderColor: themeColors.border, borderWidth: 1 }]}>
          <Briefcase size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: themeColors.textSecondary }]}>
            {referral.totalProjects || 0} Project{referral.totalProjects !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: isDark ? themeColors.backgroundSecondary : '#F3F4F6', borderColor: themeColors.border, borderWidth: 1 }]}>
          <Calendar size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: themeColors.textSecondary }]}>
            {referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (): React.ReactElement => {
    // If filtering, show filtered empty state
    if (activeFilter !== 'All') {
      return (
        <EmptyState 
          icon={UserPlus}
          title="No Referrals Found"
          subtitle={`No referrals with "${activeFilter}" status.`}
        />
      );
    }
    
    // First-time empty state with CTA button
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? themeColors.backgroundSecondary : '#F0FDF4' }]}>
          <UserPlus size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />
        </View>
        <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Referrals Yet</Text>
        <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
          Start adding client referrals to businesses and earn commissions.
        </Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => navigation.navigate('AddReferral')}
          activeOpacity={0.8}
        >
          <UserPlus size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.emptyButtonText}>Create Your First Referral</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themedStyles.safeArea]}>
        <StatusBar barStyle={themedStyles.statusBar} backgroundColor={themeColors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading referrals...</Text>
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
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}>
                <Search size={24} color={themeColors.iconSecondary} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddReferral} style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}>
                <Plus size={24} color={themeColors.iconSecondary} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Status Filter Chips - Only show when there are referrals */}
      {!isSearchActive && referrals.length > 0 && (
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
                  { 
                    backgroundColor: activeFilter === filter 
                      ? COLORS.APP_GREEN 
                      : (isDark ? 'transparent' : '#F4F4F4'),
                    borderColor: activeFilter === filter 
                      ? COLORS.APP_GREEN 
                      : themeColors.border
                  }
                ]}
                onPress={() => setActiveFilter(filter as StatusFilter)}
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
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
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
  referralCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: SPACING.md,
    borderWidth: 1,
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
    marginBottom: 4,
  },
  businessName: {
    fontSize: FONT_SIZES.sm,
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FONT_SIZES.xs,
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
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
  },
});

export default MarketerReferrals;





