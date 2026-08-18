import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  Mail,
  UserCheck,
  UserPlus,
  UserX,
  RefreshCw,
  Briefcase,
  CreditCard,
  CheckCircle,
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  TrendingUp,
  ClipboardList,
  Calendar,
  Clock,
} from 'lucide-react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import apiClient from '../../services/apiClient';
import BackButton from '../../components/common/BackButton';
import EmptyState from '../../components/common/EmptyState';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Activity } from '../../types/api';

type AllActivitiesScreenProps = RootStackScreenProps<'AllActivities'>;

type FilterType = 'all' | 'unread' | 'partnership' | 'referral' | 'project';
type IconComponent = typeof ClipboardList;

interface FilterOption {
  id: FilterType;
  label: string;
  icon: IconComponent;
}

interface ActivityGroups {
  today: Activity[];
  yesterday: Activity[];
  thisWeek: Activity[];
  older: Activity[];
}

const AllActivitiesScreen: React.FC<AllActivitiesScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const { userType } = route.params || {};
  
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);

  // Filter options
  const filters: FilterOption[] = [
    { id: 'all', label: 'All', icon: ClipboardList },
    { id: 'unread', label: 'Unread', icon: Mail },
    { id: 'partnership', label: 'Partnerships', icon: UserCheck },
    { id: 'referral', label: 'Referrals', icon: Mail },
    { id: 'project', label: 'Projects', icon: Briefcase },
  ];

  useEffect(() => {
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, selectedFilter, searchQuery]);

  const fetchActivities = async (): Promise<void> => {
    try {
      const endpoint = userType === 'marketer' 
        ? '/api/marketer/activities?limit=100'
        : '/api/activities/user?limit=100';
      const response = await apiClient.get(endpoint);
      setActivities(response.data.activities || []);
    } catch (error) {
      setActivities([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = (): void => {
    setIsRefreshing(true);
    fetchActivities();
  };

  const markAsRead = async (activityId: string): Promise<void> => {
    // ✅ INSTANT UI UPDATE - Update state immediately
    setActivities(prev => 
      prev.map(activity => 
        activity.id === activityId 
          ? { ...activity, read: true, readAt: new Date().toISOString() }
          : activity
      )
    );
    
    // ✅ Call API in background (don't wait)
    try {
      await apiClient.put(`/api/activities/${activityId}/read`, {});
    } catch (error) {
      // Don't show error to user - operation was optimistic
      // Revert the state if API fails
      setActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { ...activity, read: false, readAt: null }
            : activity
        )
      );
    }
  };

  const filterActivities = (): void => {
    let filtered = [...activities];

    // Filter by read status
    if (selectedFilter === 'unread') {
      filtered = filtered.filter(activity => !activity.read);
    }
    // Filter by type
    else if (selectedFilter !== 'all') {
      filtered = filtered.filter(activity => 
        activity.entityType?.toLowerCase() === selectedFilter.toLowerCase()
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(activity =>
        activity.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredActivities(filtered);
  };

  const getActivityIcon = (activity: Activity): IconComponent => {
    const type = activity.entityType?.toLowerCase();
    const action = activity.action?.toLowerCase();

    // Partnership icons
    if (type === 'partnership') {
      if (action === 'received' || action === 'applied') return UserPlus;
      if (action === 'approved') return UserCheck;
      if (action === 'rejected') return UserX;
      return Users;
    }

    // Referral icons
    if (type === 'referral') {
      if (action === 'received') return Mail;
      if (action === 'updated') return RefreshCw;
      return Mail;
    }

    // Project icons
    if (type === 'project') {
      if (action === 'created') return Briefcase;
      if (action === 'updated' && activity.description?.includes('payment')) return CreditCard;
      if (action === 'updated' && activity.description?.includes('completed')) return CheckCircle;
      return Briefcase;
    }

    // Business icons
    if (type === 'business') {
      if (action === 'created') return Building2;
      if (action === 'approved') return CheckCircle2;
      if (action === 'rejected') return XCircle;
      return Building2;
    }

    // Commission/earnings icons
    if (activity.description?.toLowerCase().includes('commission')) {
      return TrendingUp;
    }

    // Default
    return ClipboardList;
  };

  const groupActivitiesByDate = (activities: Activity[]): ActivityGroups => {
    const groups: ActivityGroups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    activities.forEach(activity => {
      const activityDate = new Date(activity.createdAt);
      const activityDay = new Date(
        activityDate.getFullYear(),
        activityDate.getMonth(),
        activityDate.getDate()
      );

      if (activityDay.getTime() === today.getTime()) {
        groups.today.push(activity);
      } else if (activityDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(activity);
      } else if (activityDate >= weekAgo) {
        groups.thisWeek.push(activity);
      } else {
        groups.older.push(activity);
      }
    });

    // Sort each group: unread first, then by date (newest first)
    const sortByReadStatus = (a: Activity, b: Activity): number => {
      if (a.read === b.read) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.read ? 1 : -1; // Unread (false) comes before read (true)
    };

    groups.today.sort(sortByReadStatus);
    groups.yesterday.sort(sortByReadStatus);
    groups.thisWeek.sort(sortByReadStatus);
    groups.older.sort(sortByReadStatus);

    return groups;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleActivityPress = (activity: Activity): void => {
    // Navigate to relevant screen based on activity type
    const type = activity.entityType?.toLowerCase();
    
    if (type === 'partnership') {
      navigation.navigate((userType === 'business' ? 'Marketers' : 'Businesses') as any);
    } else if (type === 'referral') {
      navigation.navigate('Referrals' as any);
    } else if (type === 'project') {
      navigation.navigate('Projects' as any);
    }
  };

  const renderRightActions = (_progress: any, _dragX: any, _activityId: string): React.ReactElement => {
    // Return transparent view to enable swipe
    return <View style={{ width: 100, backgroundColor: 'transparent' }} />;
  };

  const handleSwipeableOpen = (direction: string, activityId: string): void => {
    if (direction === 'right') {
      // ✅ INSTANT - Mark as read immediately
      markAsRead(activityId);
    }
  };

  const renderActivityItem = (activity: Activity): React.ReactElement => {
    const Icon = getActivityIcon(activity);
    const isUnread = !activity.read;
    
    return (
      <Swipeable
        key={activity.id}
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, activity.id)}
        onSwipeableOpen={(direction) => handleSwipeableOpen(direction, activity.id)}
        rightThreshold={30}
        overshootRight={false}
        friction={2}
        enabled={isUnread}
      >
        <TouchableOpacity
          style={[
            styles.activityItem,
            { 
              backgroundColor: colors.cardBackground, 
              borderColor: colors.border
            }
          ]}
          onPress={() => handleActivityPress(activity)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.activityIconContainer,
            { 
              backgroundColor: isDark ? 'transparent' : '#F0FDF4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? colors.border : 'transparent'
            }
          ]}>
            <Icon size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
          </View>
          <View style={styles.activityContent}>
            <View style={styles.activityTitleRow}>
              <Text 
                style={[
                  styles.activityDescription,
                  { color: colors.text }
                ]}
              >
                {activity.description}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <View style={styles.activityDateTimeRow}>
              <View style={[styles.activityDateChip, { 
                backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                borderColor: colors.border
              }]}>
                <Calendar size={10} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.activityDateText, { color: colors.textSecondary, marginLeft: 4 }]}>
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : 'N/A'}
                </Text>
              </View>
              <View style={[styles.activityTimeChip, { 
                backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                borderColor: colors.border
              }]}>
                <Clock size={10} color={colors.iconSecondary} strokeWidth={2} />
                <Text style={[styles.activityDateText, { color: colors.textSecondary, marginLeft: 4 }]}>
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderActivitiesByGroup = (): React.ReactElement => {
    const groups = groupActivitiesByDate(filteredActivities);
    
    return (
      <>
        {groups.today.length > 0 && (
          <View style={styles.dateGroup}>
            <Text style={[styles.dateGroupTitle, { color: colors.textSecondary }]}>TODAY</Text>
            {groups.today.map(renderActivityItem)}
          </View>
        )}

        {groups.yesterday.length > 0 && (
          <View style={styles.dateGroup}>
            <Text style={[styles.dateGroupTitle, { color: colors.textSecondary }]}>YESTERDAY</Text>
            {groups.yesterday.map(renderActivityItem)}
          </View>
        )}

        {groups.thisWeek.length > 0 && (
          <View style={styles.dateGroup}>
            <Text style={[styles.dateGroupTitle, { color: colors.textSecondary }]}>THIS WEEK</Text>
            {groups.thisWeek.map(renderActivityItem)}
          </View>
        )}

        {groups.older.length > 0 && (
          <View style={styles.dateGroup}>
            <Text style={[styles.dateGroupTitle, { color: colors.textSecondary }]}>OLDER</Text>
            {groups.older.map(renderActivityItem)}
          </View>
        )}
      </>
    );
  };

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={ClipboardList}
      title="No activities yet"
      subtitle={searchQuery 
        ? 'No activities match your search'
        : 'Activities will appear here when you start using the app'}
    />
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>All Activities</Text>
        <TouchableOpacity 
          onPress={() => setShowSearch(!showSearch)} 
          style={[styles.headerIconButton, { 
            backgroundColor: isDark ? 'transparent' : '#F4F4F4',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}
        >
          <Search size={24} color={colors.text} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <Search size={20} color={colors.iconSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.inputText }]}
            placeholder="Search activities..."
            placeholderTextColor={colors.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearButton, { color: COLORS.APP_GREEN }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Filter Chips */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.filtersContainer, { borderBottomColor: colors.border }]}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {filters.map(filter => {
            const isSelected = selectedFilter === filter.id;
            
            return (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterChip,
                  { 
                    backgroundColor: isSelected 
                      ? COLORS.APP_GREEN 
                      : (isDark ? 'transparent' : COLORS.WHITE),
                    borderColor: isSelected 
                      ? COLORS.APP_GREEN 
                      : colors.border
                  }
                ]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isSelected ? COLORS.WHITE : colors.textSecondary },
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Activities List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading activities...</Text>
        </View>
      ) : filteredActivities.length === 0 ? (
        renderEmptyState()
      ) : (
        <ScrollView
          style={[styles.activitiesList, { backgroundColor: colors.background }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.APP_GREEN}
            />
          }
        >
          {renderActivitiesByGroup()}
          <View style={styles.bottomPadding} />
        </ScrollView>
      )}
      </GestureHandlerRootView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
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
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.TEXT_PRIMARY,
    flex: 1,
    textAlign: 'center',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.TEXT_PRIMARY,
  },
  clearButton: {
    color: COLORS.APP_GREEN,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  filtersContent: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  activitiesList: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  dateGroup: {
    marginTop: SPACING.lg,
  },
  dateGroupTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.GRAY,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.WHITE,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  activityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  activityIconContainerUnread: {
    backgroundColor: COLORS.APP_GREEN,
  },
  activityContent: {
    flex: 1,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.TEXT_PRIMARY,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.APP_GREEN,
    marginLeft: 8,
  },
  activityDateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  activityDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: SPACING.xs,
  },
  activityTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  activityDateText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  swipeActionContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  swipeAction: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: '100%',
  },
  swipeActionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  swipeActionText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.WHITE,
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
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.TEXT_PRIMARY,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomPadding: {
    height: SPACING.xl,
  },
});

export default AllActivitiesScreen;






