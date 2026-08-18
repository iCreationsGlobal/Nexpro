import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Platform,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Search, MessageCircle, Users, TrendingUp, AlertCircle, Eye, EyeOff, X, UserPlus, Wallet, Calendar, Clock, Mail, CheckCircle, Briefcase, UserCheck, ArrowRight, Sparkles, LucideIcon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import { Button } from 'react-native-paper';
import {
  getMarketerDashboard,
  getMarketerSession,
  listMyReferrals,
} from '../../api/absMarketer';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User, Business, Referral, Project } from '../../types/api';

type MarketerDashboardScreenProps = RootStackScreenProps<'MarketerDashboard'>;

interface DashboardStats {
  availableBalance: { current: number };
  totalEarned: { current: number };
  pendingCommissions: { current: number };
}

interface Activity {
  id: string;
  description: string;
  entityType?: string;
  createdAt: string;
  read: boolean;
}

interface SearchResults {
  businesses?: Business[];
  referrals?: Referral[];
  projects?: Array<{ id: string; title: string; status: string }>;
}

interface EarningsResponse {
  earnings: Array<{
    id: string;
    amount: number;
    status: string;
    cashoutStatus?: string;
  }>;
}

interface StatsResponse {
  stats: {
    pendingCommissions?: { current: number };
  };
}

interface ActivitiesResponse {
  activities: Activity[];
}

const MarketerDashboard: React.FC<MarketerDashboardScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [user, setUser] = useState<User | null>(null);
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState<boolean>(false);
  
  // Dashboard stats states
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  
  // Activities state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState<boolean>(true);
  
  // Search states
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animation refs for rotating symbols
  const spinTopLeft = useRef(new Animated.Value(0)).current;
  const spinBottomRight = useRef(new Animated.Value(0)).current;

  const fetchDashboardStats = async (): Promise<void> => {
    try {
      const dash = await getMarketerDashboard();
      setDashboardStats({
        availableBalance: { current: Number(dash.availableBalance || 0) },
        totalEarned: { current: Number(dash.totalEarned || 0) },
        pendingCommissions: { current: Number(dash.pendingCommissionsCount || 0) },
      });
    } catch (error: any) {
      setDashboardStats({
        availableBalance: { current: 0 },
        pendingCommissions: { current: 0 },
        totalEarned: { current: 0 },
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchRecentActivities = async (): Promise<void> => {
    try {
      const referrals = await listMyReferrals();
      const recent = (referrals || []).slice(0, 5).map((r: any) => ({
        id: r.id,
        description: `${r.clientName} · ${r.status}`,
        entityType: 'referral',
        createdAt: r.createdAt,
        read: false,
      }));
      setActivities(recent);
    } catch (error: any) {
      setActivities([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const dismissActivity = async (activityId: string): Promise<void> => {
    setActivities((prev) => prev.filter((activity) => activity.id !== activityId));
  };

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const session = await getMarketerSession();
        const marketer = session.marketer as any;
        // Marketer-only app: ABS session has no accountType role field.
        setUser({
          ...marketer,
          id: marketer.id,
        } as User);
        await AsyncStorage.setItem('user', JSON.stringify({
          ...marketer,
          id: marketer.id,
        }));
        await Promise.all([fetchDashboardStats(), fetchRecentActivities()]);
      } catch (error: any) {
        navigation.replace('Login');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
    
    // Start rotation animations
    Animated.loop(
      Animated.timing(spinTopLeft, {
        toValue: 1,
        duration: 20000, // 20 seconds per rotation (slow)
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(spinBottomRight, {
        toValue: 1,
        duration: 25000, // 25 seconds per rotation (slower, different speed)
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Refresh data when screen comes into focus + Smart polling
  useFocusEffect(
    useCallback(() => {
      const refreshOnFocus = async (): Promise<void> => {
        if (user?.id) {
          // Fetch in parallel for better performance
          await Promise.all([
            fetchDashboardStats(),
            fetchRecentActivities()
          ]);
        }
      };
      
      // Initial refresh on focus
      refreshOnFocus();
      loadBannerDismissedState();
      
      // Smart polling - only when screen is focused (every 45 seconds)
      const pollingInterval = setInterval(() => {
        if (user?.id) {
          // Fetch in parallel for better performance
          Promise.all([
            fetchDashboardStats(),
            fetchRecentActivities()
          ]);
        }
      }, 45000); // 45 seconds
      
      // Cleanup: Stop polling when screen is unfocused
      return () => {
        clearInterval(pollingInterval);
      };
    }, [user?.id])
  );

  const loadBannerDismissedState = async (): Promise<void> => {
    try {
      const dismissed = await AsyncStorage.getItem('upgradeBannerDismissed');
      if (dismissed === 'true') {
        setUpgradeBannerDismissed(true);
      }
    } catch (error: any) {
      // Error handling
    }
  };

  const handleDismissBanner = async (): Promise<void> => {
    try {
      await AsyncStorage.setItem('upgradeBannerDismissed', 'true');
      setUpgradeBannerDismissed(true);
    } catch (error: any) {
      // Error handling
    }
  };

  // Show loading while fetching user or stats
  if (!user || isLoading || isLoadingStats) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading dashboard...</Text>
      </SafeAreaView>
    );
  }

  const firstName = user.name?.split(' ')[0] || 'there';
  // Interpolate rotation values
  const rotateTopLeft = spinTopLeft.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rotateBottomRight = spinBottomRight.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Helper function for greeting based on time
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Search handlers
  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
    setSearchResults(null);
    Keyboard.dismiss();
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  const performSearch = async (query: string): Promise<void> => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);

    try {
      const referrals = await listMyReferrals();
      const q = query.toLowerCase();
      const matched = (referrals || []).filter((r: any) =>
        String(r.clientName || '').toLowerCase().includes(q)
        || String(r.email || '').toLowerCase().includes(q)
        || String(r.phone || '').includes(q)
      );
      const response = {
        data: {
          data: {
            referrals: matched.slice(0, 8),
            businesses: [],
            projects: [],
          } as SearchResults,
        },
      };
      // keep shape for existing handler below
      void response;

      if (response.data && response.data.data) {
        setSearchResults(response.data.data);
      }
    } catch (error: any) {
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (text: string): void => {
    setSearchQuery(text);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounced search (300ms)
    if (text.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(text);
      }, 300);
    } else {
      setSearchResults(null);
    }
  };

  // Render active dashboard
  const renderActiveDashboard = (): React.ReactElement => (
    <>
      <ScrollView 
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.activeDashboardScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting - OUTSIDE the green card */}
        <View style={styles.greetingContainer}>
          <Text style={[styles.greetingText, { color: colors.text }]}>{getGreeting()} {firstName}</Text>
          <Text style={[styles.greetingSubtext, { color: colors.textSecondary }]}>This is how you are doing today</Text>
        </View>

        {/* Main Container - Dark Green Background with Cards */}
        <View style={[styles.mainContainer, { 
          backgroundColor: isDark ? 'transparent' : '#1F4039',
          borderWidth: isDark ? 1 : 0,
          borderColor: isDark ? colors.border : 'transparent'
        }]}>
          {/* Background Pattern Images - Rotating */}
          <Animated.Image 
            source={require('../../../assets/TOP LEFT IMAGE.png')}
            style={[
              styles.patternTopLeft,
              { transform: [{ rotate: rotateTopLeft }] }
            ]}
            resizeMode="contain"
          />
          <Animated.Image 
            source={require('../../../assets/BOTTOM RIGHT IMAGE.png')}
            style={[
              styles.patternBottomRight,
              { transform: [{ rotate: rotateBottomRight }] }
            ]}
            resizeMode="contain"
          />

          {/* Available Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={[styles.balanceLabel, { color: isDark ? colors.text : COLORS.WHITE }]}>Available balance</Text>
          <View style={styles.balanceAmountRow}>
            <Text style={[styles.balanceCurrency, { color: isDark ? colors.text : COLORS.WHITE }]}>₵</Text>
            <Text style={[styles.balanceAmount, { color: isDark ? colors.text : COLORS.WHITE }]}>
              {showBalance 
                ? (dashboardStats?.availableBalance?.current || 0).toFixed(2) 
                : '••••••'}
            </Text>
            <TouchableOpacity 
              onPress={() => setShowBalance(!showBalance)}
              style={styles.eyeIconButton}
            >
              {showBalance ? (
                <Eye size={20} color={isDark ? colors.text : COLORS.WHITE} strokeWidth={2} />
              ) : (
                <EyeOff size={20} color={isDark ? colors.text : COLORS.WHITE} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.balanceUpdated, { color: isDark ? colors.textSecondary : COLORS.WHITE }]}>Available for withdrawal</Text>
        </View>

          {/* Stats Card - Combined */}
          <View style={[styles.statsCard, { 
            backgroundColor: isDark ? colors.cardBackground : '#F1F0DC',
            borderColor: isDark ? colors.border : '#F1F0DC'
          }]}>
            <View style={styles.statItem}>
              <View style={[styles.statIconContainer, { 
                backgroundColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderColor: isDark ? colors.border : 'rgba(255, 255, 255, 0.5)'
              }]}>
                <AlertCircle size={20} color={colors.text} strokeWidth={1.5} />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {showBalance 
                    ? `₵${(dashboardStats?.pendingCommissions?.current || 0).toFixed(2)}` 
                    : '₵••••••'}
                </Text>
              </View>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? colors.border : '#9CA3AF' }]} />
            <View style={[styles.statItem, { marginLeft: 24 }]}>
              <View style={[styles.statIconContainer, {
                backgroundColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderColor: isDark ? colors.border : 'rgba(255, 255, 255, 0.5)'
              }]}>
                <TrendingUp size={20} color={colors.text} strokeWidth={1.5} />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Earnings</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {showBalance 
                    ? `₵${(dashboardStats?.totalEarned?.current || 0).toFixed(2)}` 
                    : '₵••••••'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <View style={[styles.quickActionsContainer, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => navigation.navigate('AddReferral')}
              >
              <View style={[styles.actionIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#E8F5E9',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <UserPlus size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Add referral</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>Add new referral</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => navigation.navigate('CashoutRequest')}
            >
              <View style={[styles.actionIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#E8F5E9',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Wallet size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Cashout</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>Withdraw funds</Text>
              </View>
            </TouchableOpacity>
          </View>
          </View>
        </View>

        {/* Recent Activities */}
        <View style={styles.activitiesSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent activities</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AllActivities')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          {activities.length === 0 ? (
            <View style={styles.emptyActivities}>
              <Text style={[styles.emptyActivitiesText, { color: colors.textSecondary }]}>No recent activities</Text>
            </View>
          ) : (
            activities.map((activity) => {
              // Determine icon and navigation target based on activity type
              let ActivityIcon: LucideIcon = Mail;
              let navigationTarget: string | null = null;
              
              const activityType = activity.entityType?.toLowerCase();
              const description = activity.description?.toLowerCase() || '';
              const isUnread = !activity.read;
              
              // Determine icon and navigation based on entity type or description
              if (activityType === 'partnership' || description.includes('partnership')) {
                ActivityIcon = UserCheck;
                navigationTarget = 'Marketers';
              } else if (activityType === 'project' || description.includes('project')) {
                ActivityIcon = CheckCircle;
                navigationTarget = 'Projects';
              } else if (activityType === 'referral' || description.includes('referral')) {
                ActivityIcon = Mail;
                navigationTarget = 'Referrals';
              } else if (activityType === 'business' || description.includes('approved') || description.includes('rejected')) {
                ActivityIcon = Briefcase;
                navigationTarget = null; // Stay on dashboard
              }

              const handleActivityPress = (): void => {
                if (navigationTarget) {
                  navigation.navigate(navigationTarget as any);
                }
              };

              // Instant dismiss on swipe - invisible swipe area
              const renderRightActions = (): React.ReactElement => {
                // Return transparent view to enable swipe
                return <View style={{ width: 100, backgroundColor: 'transparent' }} />;
              };

              const handleSwipeableOpen = (direction: string): void => {
                if (direction === 'right') {
                  // Instantly remove from UI
                  setActivities(prev => prev.filter(a => a.id !== activity.id));
                  
                  // Mark as read in background (don't wait)
                  dismissActivity(activity.id);
                }
              };

              return (
                <Swipeable
                  key={activity.id}
                  renderRightActions={renderRightActions}
                  onSwipeableOpen={handleSwipeableOpen}
                  rightThreshold={30}
                  friction={2}
                  overshootRight={false}
                  enabled={true}
                >
                    <TouchableOpacity 
                      style={[
                        styles.activityItem,
                        { 
                          backgroundColor: colors.cardBackground, 
                          borderColor: colors.border
                        }
                      ]}
                      onPress={handleActivityPress}
                      activeOpacity={navigationTarget ? 0.7 : 1}
                    >
                      <View style={[
                        styles.activityIcon,
                        { 
                          backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                          borderWidth: isDark ? 1 : 0,
                          borderColor: isDark ? colors.border : 'transparent'
                        }
                      ]}>
                        <ActivityIcon size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
                      </View>
                      <View style={styles.activityContent}>
                        <View style={styles.activityRow}>
                          <Text 
                            style={[
                              styles.activityTitle,
                              { color: colors.text }
                            ]}
                            numberOfLines={2}
                            ellipsizeMode="tail"
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
            })
          )}
        </View>
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header - Transforms into search bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {isSearchActive ? (
          <>
            {/* Search Mode - Full width search bar */}
            <TouchableOpacity 
              style={styles.searchBackButton}
              onPress={handleSearchClose}
            >
              <X size={24} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.searchBarContainer, { backgroundColor: colors.inputBackground }]}>
              <Search size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: colors.inputText }]}
                placeholder="Search referrals..."
                placeholderTextColor={colors.inputPlaceholder}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity 
                  style={styles.searchClearButton} 
                  onPress={() => setSearchQuery('')}
                >
                  <X size={16} color={colors.iconSecondary} strokeWidth={2} />
                </TouchableOpacity>
              )}
</View>
          </>
        ) : (
          <>
            {/* Normal Header */}
            <View style={styles.headerLeft}>
              <TouchableOpacity 
                style={styles.avatarContainer}
                onPress={() => navigation.navigate('Profile')}
                activeOpacity={0.7}
              >
                {user.profileImage ? (
                  <Image source={{ uri: user.profileImage }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{user.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => navigation.navigate('Profile')}
                activeOpacity={0.7}
              >
                <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}
                onPress={handleSearchOpen}
              >
                <Search size={24} color={colors.iconSecondary} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}
                onPress={() => navigation.navigate('Account')}
              >
                <Users size={24} color={colors.iconSecondary} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Search Results */}
      {isSearchActive && (
        <View style={styles.searchResultsContainer}>
          {isSearching ? (
            <View style={styles.searchLoadingContainer}>
              <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
              <Text style={styles.searchLoadingText}>Searching...</Text>
            </View>
          ) : searchResults ? (
            <ScrollView style={styles.searchResultsList} showsVerticalScrollIndicator={false}>
              {searchResults.businesses && searchResults.businesses.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Businesses</Text>
                  {searchResults.businesses.map((business) => (
                    <TouchableOpacity 
                      key={business.id} 
                      style={[styles.searchResultItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                      onPress={() => navigation.navigate('BusinessDetails', { businessId: business.id, initialData: business })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.searchResultIcon, { 
                        backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? colors.border : 'transparent'
                      }]}>
                        <Users size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={[styles.searchResultTitle, { color: colors.text }]}>{business.businessName}</Text>
                        <Text style={[styles.searchResultSubtext, { color: colors.textSecondary }]}>{business.industry}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchResults.referrals && searchResults.referrals.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Referrals</Text>
                  {searchResults.referrals.map((referral) => (
                    <TouchableOpacity 
                      key={referral.id} 
                      style={[styles.searchResultItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                      onPress={() => navigation.navigate('MarketerReferralDetails', { referralId: referral.id, initialData: referral })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.searchResultIcon, { 
                        backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? colors.border : 'transparent'
                      }]}>
                        <UserPlus size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={[styles.searchResultTitle, { color: colors.text }]}>{referral.clientName}</Text>
                        <Text style={[styles.searchResultSubtext, { color: colors.textSecondary }]}>{referral.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchResults.projects && searchResults.projects.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Projects</Text>
                  {searchResults.projects.map((project) => (
                    <TouchableOpacity 
                      key={project.id} 
                      style={[styles.searchResultItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                      onPress={() => navigation.navigate('Referrals')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.searchResultIcon, { 
                        backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? colors.border : 'transparent'
                      }]}>
                        <TrendingUp size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={[styles.searchResultTitle, { color: colors.text }]}>{project.title}</Text>
                        <Text style={[styles.searchResultSubtext, { color: colors.textSecondary }]}>{project.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {(!searchResults.businesses || searchResults.businesses.length === 0) && (!searchResults.referrals || searchResults.referrals.length === 0) && (!searchResults.projects || searchResults.projects.length === 0) && (
                <View style={styles.noResultsContainer}>
                  <Search size={32} color={COLORS.GRAY} strokeWidth={1.5} />
                  <Text style={styles.noResultsText}>No results found</Text>
                  <Text style={styles.noResultsSubtext}>Try a different search term</Text>
                </View>
              )}
            </ScrollView>
          ) : searchQuery.trim().length > 0 ? (
            <View style={styles.searchLoadingContainer}>
              <Text style={styles.searchHintText}>Keep typing...</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Dashboard Content - Hide when searching */}
      {!isSearchActive && renderActiveDashboard()}
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
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: SPACING.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  userName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  headerRight: {
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
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    height: 48,
  },
  searchClearButton: {
    padding: 4,
  },
  aiMatchButton: {
    padding: 8,
  },
  searchResultsContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  searchLoadingContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  searchLoadingText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  searchHintText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultSection: {
    marginBottom: SPACING.lg,
  },
  searchResultSectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.md,
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  searchResultSubtext: {
    fontSize: FONT_SIZES.sm,
  },
  noResultsContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    marginTop: SPACING.md,
  },
  noResultsSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginTop: SPACING.xs,
  },
  activeDashboardScroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  greetingContainer: {
    marginBottom: SPACING.md,
  },
  greetingText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  greetingSubtext: {
    fontSize: FONT_SIZES.sm,
  },
  mainContainer: {
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    position: 'relative',
    overflow: 'hidden',
  },
  patternTopLeft: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    opacity: 0.1,
  },
  patternBottomRight: {
    position: 'absolute',
    bottom: -50,
    right: -50,
    width: 200,
    height: 200,
    opacity: 0.1,
  },
  balanceCard: {
    marginBottom: SPACING.md,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    opacity: 0.9,
    marginBottom: SPACING.xs,
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  balanceCurrency: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginRight: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    marginRight: SPACING.sm,
  },
  eyeIconButton: {
    padding: 4,
  },
  balanceUpdated: {
    fontSize: FONT_SIZES.xs,
    opacity: 0.8,
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  statTextContainer: {
    flex: 1,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statDivider: {
    width: 1,
    height: '100%',
    marginHorizontal: SPACING.md,
  },
  quickActionsSection: {
    marginBottom: SPACING.lg,
  },
  quickActionsContainer: {
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  actionSubtext: {
    fontSize: FONT_SIZES.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  seeAllText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activitiesSection: {
    marginBottom: SPACING.lg,
  },
  activityItem: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    gap: SPACING.md,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  activityTitle: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.APP_GREEN,
    marginLeft: SPACING.xs,
    marginTop: 4,
  },
  activityDateTimeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  activityDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  activityTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  activityDateText: {
    fontSize: FONT_SIZES.xs,
  },
  emptyActivities: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyActivitiesText: {
    fontSize: FONT_SIZES.md,
  },
});

export default MarketerDashboard;





