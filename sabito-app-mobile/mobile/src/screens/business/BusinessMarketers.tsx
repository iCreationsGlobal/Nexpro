import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Users, X, CheckCircle, XCircle, Calendar, Star } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getCommonThemedStyles } from '../../utils/themeHelper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import EmptyState from '../../components/common/EmptyState';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import MarketerReviewModal from '../../components/common/MarketerReviewModal';
import AnimatedListItem from '../../components/common/AnimatedListItem';
import apiClient from '../../services/apiClient';
import { getStatusColor } from '../../utils/statusColors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Marketer } from '../../types/api';

type BusinessMarketersProps = RootStackScreenProps<'BusinessTabs'>;

const STATUS_FILTERS = ['All', 'Pending', 'Accepted', 'Rejected'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

interface Partnership {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  marketer?: Marketer;
  notes?: string;
}

const BusinessMarketers: React.FC<BusinessMarketersProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors: themeColors, isDark } = getTheme(effectiveTheme || theme);
  const themedStyles = getCommonThemedStyles(theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [marketers, setMarketers] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [selectedMarketerForReview, setSelectedMarketerForReview] = useState<Marketer | Partnership | null>(null);

  // Memoize filtered marketers to prevent unnecessary recalculations
  const filteredMarketers = useMemo(() => {
    let filtered = marketers;

    // Filter by status
    if (activeFilter !== 'All') {
      filtered = filtered.filter(marketer => 
        marketer.status?.toLowerCase() === activeFilter.toLowerCase()
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(marketer => 
        marketer.marketer?.name?.toLowerCase().includes(query) ||
        marketer.marketer?.email?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [marketers, activeFilter, searchQuery]);

  const fetchBusinessAndMarketers = useCallback(async (): Promise<void> => {
    try {
      const user = await AsyncStorage.getItem('user');

      if (!user) {
        setLoading(false);
        return;
      }

      const parsedUser = JSON.parse(user);
      // First get business profile to get businessId
      const businessResponse = await apiClient.get(`/api/business/${parsedUser.id}`);

      if (!(businessResponse.data as any).business?.id) {
        setLoading(false);
        return;
      }

      const fetchedBusinessId = (businessResponse.data as any).business.id;
      setBusinessId(fetchedBusinessId);
      // Then fetch partnership requests
      const response = await apiClient.get(`/api/partnerships/business/${fetchedBusinessId}/requests`);
      if ((response.data as any).requests) {
        setMarketers((response.data as any).requests as Partnership[]);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        setMarketers([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      if (!isMounted) return;
      await fetchBusinessAndMarketers();
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, [fetchBusinessAndMarketers]);

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchBusinessAndMarketers();
  };

  const handleCardPress = (marketer: Partnership): void => {
    navigation.navigate('MarketerDetails', { marketer } as any);
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const handleRespondToRequest = async (requestId: string, status: 'accepted' | 'rejected', marketerName?: string): Promise<void> => {
    const actionText = status === 'accepted' ? 'accept' : 'reject';
    
    showDialog({
      title: `${status === 'accepted' ? 'Accept' : 'Reject'} Partnership`,
      message: `Are you sure you want to ${actionText} ${marketerName || 'this marketer'}'s partnership request?`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: hideDialog },
        {
          text: status === 'accepted' ? 'Accept' : 'Reject',
          style: status === 'accepted' ? 'default' : 'destructive',
          onPress: () => {
            hideDialog();
            respondToRequest(requestId, status, marketerName);
          },
        },
      ]
    });
  };

  const respondToRequest = async (requestId: string, status: 'accepted' | 'rejected', marketerName?: string): Promise<void> => {
    setRespondingTo(requestId);

    try {
      await apiClient.patch(`/api/partnerships/respond/${requestId}`, { status });
      // Update local state
      setMarketers(prevMarketers =>
        prevMarketers.map(marketer =>
          marketer.id === requestId ? { ...marketer, status } : marketer
        )
      );
    } catch (error: any) {
      // Check for plan limit error
      if (error.response?.status === 400 && error.response?.data?.limitInfo) {
        const { message, limitInfo } = error.response.data;
        showDialog({
          title: 'Plan Limit Reached',
          message: `${message}\n\nCurrent: ${limitInfo.current}\nLimit: ${limitInfo.unlimited ? 'Unlimited' : limitInfo.limit}`,
          buttons: [
            { text: 'Cancel', style: 'cancel', onPress: hideDialog },
            {
              text: 'Upgrade Plan',
              onPress: () => {
                hideDialog();
                navigation.navigate('Subscription');
              },
              style: 'default',
            },
          ]
        });
      } else {
        showDialog({
          title: 'Error',
          message: 'Failed to update partnership status. Please try again.',
          buttons: [{ text: 'OK' }]
        });
      }
    } finally {
      setRespondingTo(null);
    }
  };

  const formatStatus = (status?: string): string => {
    return status?.charAt(0)?.toUpperCase() + status?.slice(1) || 'Pending';
  };

  const renderStatusBadge = (status?: string): React.ReactElement => {
    const statusColors = getStatusColor(status || 'pending', 'partnership');
    return (
      <View style={[styles.statusBadge, { 
        backgroundColor: isDark ? 'transparent' : statusColors.bg, 
        borderColor: statusColors.border 
      }]}>
        <Text style={[styles.statusText, { color: statusColors.color }]}>{formatStatus(status)}</Text>
      </View>
    );
  };

  const renderMarketerCard = useCallback(({ item: marketer, index }: { item: Partnership; index: number }) => {
    const isPending = marketer.status?.toLowerCase() === 'pending';
    const isResponding = respondingTo === marketer.id;

    return (
      <AnimatedListItem index={index} delay={50}>
        <TouchableOpacity
        style={[styles.marketerCard, themedStyles.card]}
        onPress={() => handleCardPress(marketer)}
        activeOpacity={0.7}
      >
        {/* Marketer Header with Status */}
        <View style={styles.cardHeader}>
          <View style={styles.marketerAvatar}>
            {marketer.marketer?.profileImage ? (
              <Image
                source={{ uri: marketer.marketer.profileImage }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {marketer.marketer?.name?.charAt(0)?.toUpperCase() || 'M'}
              </Text>
            )}
          </View>
          <View style={styles.marketerInfo}>
            <Text style={[styles.marketerName, themedStyles.text]}>
              {marketer.marketer?.name || 'Unknown Marketer'}
            </Text>
            <Text style={[styles.marketerEmail, themedStyles.textSecondary]}>
              {marketer.marketer?.email || 'No email'}
            </Text>
          </View>
          {renderStatusBadge(marketer.status)}
        </View>

        {/* Info Chips */}
        <View style={styles.chipsContainer}>
          <View style={[styles.chip, { 
            backgroundColor: isDark ? 'transparent' : '#F3F4F6',
            borderWidth: 1,
            borderColor: isDark ? themeColors.border : '#E0E0E0'
          }]}>
            <Calendar size={12} color={themeColors.iconSecondary} strokeWidth={2} />
            <Text style={[styles.chipText, themedStyles.textSecondary]}>
              Applied: {marketer.createdAt ? new Date(marketer.createdAt).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Review Button (only for accepted) */}
        {marketer.status?.toLowerCase() === 'accepted' && (
          <TouchableOpacity
            style={[styles.reviewButton, { backgroundColor: '#fbbf24' }]}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedMarketerForReview(marketer.marketer || marketer);
              setShowReviewModal(true);
            }}
            activeOpacity={0.7}
          >
            <Star size={16} color={COLORS.WHITE} fill={COLORS.WHITE} />
            <Text style={styles.reviewButtonText}>Rate Marketer</Text>
          </TouchableOpacity>
        )}

        {/* Action Buttons (only for pending) */}
        {isPending && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleRespondToRequest(marketer.id, 'rejected', marketer.marketer?.name);
              }}
              disabled={isResponding}
            >
              {isResponding ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <>
                  <XCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleRespondToRequest(marketer.id, 'accepted', marketer.marketer?.name);
              }}
              disabled={isResponding}
            >
              {isResponding ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <>
                  <CheckCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
      </AnimatedListItem>
    );
  }, [activeFilter, searchQuery, respondingTo, isSearchActive, theme, effectiveTheme, themeColors, isDark, themedStyles, marketers]);

  const renderEmptyState = useCallback(() => (
    <EmptyState 
      icon={Users}
      title="No Marketers Yet"
      subtitle={activeFilter !== 'All' 
        ? `No ${activeFilter.toLowerCase()} partnership requests.`
        : 'Marketers will send partnership requests. They will appear here.'}
    />
  ), [activeFilter]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, themedStyles.safeArea]}>
        <StatusBar barStyle={themedStyles.statusBar as any} backgroundColor={themeColors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, themedStyles.textSecondary]}>Loading marketers...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={themeColors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        {isSearchActive ? (
          <>
            <TouchableOpacity onPress={handleSearchClose} style={styles.searchBackButton}>
              <X size={24} color={themeColors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.searchBarContainer, { 
              backgroundColor: isDark ? 'transparent' : '#F4F4F4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? themeColors.border : 'transparent'
            }]}>
              <Search size={20} color={themeColors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.inputText }]}
                placeholder="Search marketers..."
                placeholderTextColor={themeColors.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity 
                  onPress={() => setSearchQuery('')}
                  style={[styles.clearButton, { 
                    backgroundColor: isDark ? 'transparent' : '#E5E7EB',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? themeColors.border : 'transparent'
                  }]}
                >
                  <X size={14} color={themeColors.iconSecondary} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Marketers</Text>
            <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { 
              backgroundColor: isDark ? 'transparent' : '#F4F4F4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? themeColors.border : 'transparent'
            }]}>
              <Search size={24} color={themeColors.iconSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Status Filter Chips - Only show when there are marketers */}
      {!isSearchActive && marketers.length > 0 && (
        <View style={[styles.filterContainer, { borderBottomColor: themeColors.border }]}>
          <View style={styles.filterScroll}>
            {STATUS_FILTERS.map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive 
                        ? COLORS.APP_GREEN 
                        : (isDark ? 'transparent' : COLORS.LIGHT_GRAY),
                      borderColor: isActive 
                        ? COLORS.APP_GREEN 
                        : themeColors.border,
                    },
                  ]}
                  onPress={() => setActiveFilter(filter)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: isActive ? COLORS.WHITE : themeColors.text,
                        fontWeight: isActive ? FONT_WEIGHTS.semibold : FONT_WEIGHTS.medium,
                      },
                    ]}
                  >
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Marketers List - Using FlatList for better performance */}
      <FlatList
        data={filteredMarketers}
        keyExtractor={(item) => item.id}
        renderItem={renderMarketerCard}
        style={[styles.scrollView, { backgroundColor: themeColors.background }]}
        contentContainerStyle={filteredMarketers.length === 0 ? styles.emptyContent : styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.APP_GREEN}
            colors={[COLORS.APP_GREEN]}
          />
        }
        ListEmptyComponent={renderEmptyState}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        getItemLayout={(data, index) => ({
          length: 220, // Approximate card height (padding + header + chips + buttons + margin)
          offset: 220 * index,
          index,
        })}
      />

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
      
      {/* Review Modal */}
      <MarketerReviewModal
        marketer={selectedMarketerForReview as any}
        visible={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          setSelectedMarketerForReview(null);
        }}
        onReviewSubmitted={() => {
          setShowReviewModal(false);
          setSelectedMarketerForReview(null);
        }}
      />
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
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
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
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  filterScroll: {
    flexDirection: 'row',
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
  filterChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.GRAY,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  marketerCard: {
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
    marginBottom: SPACING.sm,
  },
  marketerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  marketerInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  marketerName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  marketerEmail: {
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
    marginBottom: SPACING.sm,
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
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: COLORS.APP_GREEN,
  },
  rejectButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  acceptButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  reviewButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default BusinessMarketers;


