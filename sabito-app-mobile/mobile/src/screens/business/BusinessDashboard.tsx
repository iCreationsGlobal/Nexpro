import React, { useEffect, useState, useRef } from 'react';
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
  TextInput,
  Keyboard,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { Search, MessageCircle, Users, TrendingUp, AlertCircle, CheckCircle, Eye, EyeOff, X, Share2, Mail, UserCheck, Briefcase, CreditCard, Calendar, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import { Button } from 'react-native-paper';
import apiClient from '../../services/apiClient';
import type { BusinessTabScreenProps } from '../../types/navigation';
import type { User, Business, DashboardStats, Activity, Project, SearchResults } from '../../types/api';

type BusinessDashboardProps = BusinessTabScreenProps<'Dashboard'>;

type BusinessStatus = 'loading' | 'pending' | 'approved' | 'rejected' | 'unknown' | 'needs_setup';

type IconComponent = typeof Mail;

const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const surfaceColor = colors.cardBackground || colors.background;
  
  const [user, setUser] = useState<User | null>(null);
  const [businessStatus, setBusinessStatus] = useState<BusinessStatus>('loading');
  const [businessData, setBusinessData] = useState<Business | null>(null);
  const [isLoadingBusiness, setIsLoadingBusiness] = useState<boolean>(true);
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  
  // Dashboard stats states
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  
  // Activities state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState<boolean>(true);
  
  // Projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  
  // Search states
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showPendingInfo, setShowPendingInfo] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Animation refs for rotating symbols
  const spinTopLeft = useRef(new Animated.Value(0)).current;
  const spinBottomRight = useRef(new Animated.Value(0)).current;

  const fetchBusinessProfile = async (userId: string): Promise<void> => {
    try {
      const response = await apiClient.get(`/api/business/${userId}`);
      if (response.data.business) {
        const business = response.data.business as Business;
        const previousStatus = businessStatus;
        
        // Update state with fresh data
        setBusinessData(business);
        setBusinessStatus((business.status || 'unknown') as BusinessStatus);
        
        // Update AsyncStorage with fresh data
        await AsyncStorage.setItem('business', JSON.stringify(business));
        // If status changed from pending to approved, or already approved - load dashboard data
        if ((previousStatus === 'pending' && business.status === 'approved') || business.status === 'approved') {
          // Fetch all dashboard data in parallel for better performance
          await Promise.all([
            fetchDashboardStats(),
            fetchRecentActivities(),
            fetchOngoingProjects()
          ]);
        } else {
          setIsLoadingActivities(false);
          setIsLoadingProjects(false);
        }
      }
    } catch (error: any) {
      // Check if it's a 404 (no profile yet)
      if (error.response?.status === 404) {
        // Show empty state dashboard with "Get Started" button instead of auto-redirecting
        setBusinessStatus('needs_setup');
      } else {
        // Only log as error for actual errors (not 404)
        setBusinessStatus('unknown');
      }
    } finally {
      setIsLoadingBusiness(false);
    }
  };

  const fetchDashboardStats = async (): Promise<void> => {
    try {
      const response = await apiClient.get('/api/business/dashboard/stats?period=all_time');
      if (response.data.stats) {
        setDashboardStats(response.data.stats as DashboardStats);
      }
    } catch (error) {
      // Set default stats on error
      setDashboardStats({
        totalRevenue: { current: 0, change: 0, changeType: 'increase' },
        partneredMarketers: { current: 0, change: 0, changeType: 'increase' },
        referralsReceived: { current: 0, change: 0, changeType: 'increase' },
        projectsCompleted: { current: 0, change: 0, changeType: 'increase' },
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchRecentActivities = async (): Promise<void> => {
    try {
      const response = await apiClient.get('/api/activities/user?limit=5');
      if (response.data.activities) {
        setActivities(response.data.activities as Activity[]);
      }
    } catch (error) {
      setActivities([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const fetchOngoingProjects = async (): Promise<void> => {
    try {
      const response = await apiClient.get('/api/projects/business');
      if (response.data.projects) {
        // Filter for in_progress projects only and limit to 5 for dashboard preview
        const ongoingProjects = (response.data.projects as Project[])
          .filter(p => p.status === 'in_progress')
          .slice(0, 5);
        setProjects(ongoingProjects);
      }
    } catch (error) {
      // Set empty array regardless of error type - dashboard should always load
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const dismissActivity = async (activityId: string): Promise<void> => {
    try {
      // Mark as read in backend
      await apiClient.put(`/api/activities/${activityId}/read`, {});
      
      // Remove from dashboard (local state)
      setActivities(prev => prev.filter(activity => activity.id !== activityId));
    } catch (error) {
      // Silent fail
    }
  };

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const userData = await AsyncStorage.getItem('user');
        const businessDataStorage = await AsyncStorage.getItem('business');
        if (userData) {
          const parsedUser = JSON.parse(userData) as User;
          setUser(parsedUser);
          
          // If business data already in storage, use it temporarily
          if (businessDataStorage) {
            const parsedBusiness = JSON.parse(businessDataStorage) as Business;
            setBusinessData(parsedBusiness);
            setBusinessStatus((parsedBusiness.status || 'unknown') as BusinessStatus);
            // Show cached data immediately, but always refresh in background
            setIsLoadingBusiness(false);
            
            // ALWAYS fetch fresh business data to check for status updates (approval/rejection)
            await fetchBusinessProfile(parsedUser.id);
          } else {
            // No cache - fetch from backend
            await fetchBusinessProfile(parsedUser.id);
          }
        } else {
          navigation.replace('Login' as any);
        }
      } catch (error) {
        setIsLoadingBusiness(false);
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
    React.useCallback(() => {
      const refreshOnFocus = async (): Promise<void> => {
        if (user?.id) {
          await fetchBusinessProfile(user.id);
        }
      };
      
      // Initial refresh on focus
      refreshOnFocus();
      
      // Smart polling - only when screen is focused (every 45 seconds)
      const pollingInterval = setInterval(() => {
        if (user?.id) {
          fetchBusinessProfile(user.id);
        }
      }, 45000); // 45 seconds
      
      // Cleanup: Stop polling when screen is unfocused
      return () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
      };
    }, [user?.id])
  );

  // Pull-to-refresh handler
  const onRefresh = React.useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      if (user?.id) {
        await fetchBusinessProfile(user.id);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  // Show loading while fetching user or business data
  // Also wait for stats if business is approved
  if (!user || isLoadingBusiness || (businessStatus === 'approved' && isLoadingStats)) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Security check: Ensure only businesses can access
  if (user.accountType?.toLowerCase() !== 'business') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Access Denied: Not a business account.</Text>
        </View>
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

  const handleGetStarted = (): void => {
    // Navigate to business setup/profile
    navigation.navigate('BusinessSetup' as any);
  };

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
    // Focus input after state update
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
    setSearchResults(null);
    Keyboard.dismiss();
    
    // Clear timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  };

  const performSearch = async (query: string): Promise<void> => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);

    try {
      const response = await apiClient.get(`/api/business/search?q=${encodeURIComponent(query)}&limit=8`);

      if (response.data && response.data.data) {
        setSearchResults(response.data.data as SearchResults);
      }
    } catch (error) {
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
      searchTimeoutRef.current = null;
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

  // Render empty state dashboard (for pending or needs setup)
  const renderEmptyStateDashboard = (): React.ReactElement => (
    <>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.APP_GREEN]}
            tintColor={COLORS.APP_GREEN}
            title={businessStatus === 'pending' ? "Pull to check approval status..." : "Pull to refresh..."}
            titleColor={COLORS.GRAY}
          />
        }
      >
        {/* Main Container - Dark Green Background */}
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
          
          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <Text style={[styles.welcomeTitle, { color: isDark ? colors.text : COLORS.WHITE }]}>Hello {firstName},</Text>
            <Text style={[styles.welcomeSubtitle, { color: isDark ? colors.textSecondary : 'rgba(255, 255, 255, 0.8)' }]}>Your journey to more clients starts here.</Text>
          </View>

          {/* Three Cards */}
          <View style={styles.cardsContainer}>
            {/* Card 1 - Full Width */}
            <View style={[styles.card1, { 
              backgroundColor: isDark ? colors.cardBackground : '#C7E8E0',
              borderColor: isDark ? colors.border : '#C7E8E0'
            }]}>
              <View style={[styles.cardIconContainer1, { 
                backgroundColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.4)'
              }]}>
                <Users size={28} color={isDark ? COLORS.APP_GREEN : "#2A6A5F"} strokeWidth={1.5} />
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.card1Title, { color: colors.text }]}>Grow with marketers</Text>
                <Text style={[styles.card1Subtitle, { color: colors.textSecondary }]}>Marketers bring you more clients</Text>
              </View>
            </View>

            {/* Cards 2 & 3 - Side by Side */}
            <View style={styles.smallCardsRow}>
              <View style={[styles.card2, { 
                backgroundColor: isDark ? colors.cardBackground : '#ADDB44',
                borderColor: isDark ? colors.border : '#ADDB44'
              }]}>
                <View style={[styles.cardIconContainer2, { 
                  backgroundColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.3)'
                }]}>
                  <Users size={28} color={isDark ? COLORS.APP_GREEN : "#6B8F2A"} strokeWidth={1.5} />
                </View>
                <Text style={[styles.smallCardTitle, { color: colors.text }]}>Build{'\n'}Partnerships</Text>
              </View>

              <View style={[styles.card3, { 
                backgroundColor: isDark ? colors.cardBackground : '#F1F0DC',
                borderColor: isDark ? colors.border : '#F1F0DC'
              }]}>
                <View style={[styles.cardIconContainer3, { 
                  backgroundColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.3)'
                }]}>
                  <TrendingUp size={28} color={isDark ? COLORS.APP_GREEN : "#8B7E3D"} strokeWidth={1.5} />
                </View>
                <Text style={[styles.smallCardTitle, { color: colors.text }]}>Get More{'\n'}Clients</Text>
              </View>
            </View>
          </View>
        </View>

        {/* CTA Section - Only show when needs setup (not pending) */}
        {businessStatus === 'needs_setup' && (
          <View style={styles.ctaSection}>
            <Text style={[styles.ctaText, { color: colors.textSecondary }]}>
              Set up your business profile and start getting clients
            </Text>
            <Button
              mode="contained"
              onPress={handleGetStarted}
              style={styles.ctaButton}
              contentStyle={styles.ctaButtonContent}
              labelStyle={styles.ctaButtonLabel}
            >
              Set Up Business
            </Button>
          </View>
        )}
      </ScrollView>
    </>
  );

  // Render actual dashboard (for approved businesses)
  const renderActiveDashboard = (): React.ReactElement => (
    <>
      <ScrollView 
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.activeDashboardScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.APP_GREEN]}
            tintColor={COLORS.APP_GREEN}
            title="Pull to refresh..."
            titleColor={COLORS.GRAY}
          />
        }
      >
        {/* Greeting */}
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

          {/* Total Revenue Card */}
        <View style={styles.balanceCard}>
          <Text style={[styles.balanceLabel, { color: isDark ? colors.text : COLORS.WHITE }]}>Total Revenue</Text>
          <View style={styles.balanceAmountRow}>
            <Text style={[styles.balanceCurrency, { color: isDark ? colors.text : COLORS.WHITE }]}>₵</Text>
            <Text style={[styles.balanceAmount, { color: isDark ? colors.text : COLORS.WHITE }]}>
              {showBalance 
                ? (dashboardStats?.totalRevenue?.current || 0).toFixed(2) 
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
          <Text style={[styles.balanceUpdated, { color: isDark ? colors.textSecondary : COLORS.WHITE }]}>All time</Text>
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
                <Users size={20} color={colors.text} strokeWidth={1.5} />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Marketers</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {showBalance 
                    ? (dashboardStats?.partneredMarketers?.current || 0) 
                    : '••••••'}
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
                <Share2 size={20} color={colors.text} strokeWidth={1.5} />
              </View>
              <View style={styles.statTextContainer}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Referrals</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {showBalance 
                    ? (dashboardStats?.referralsReceived?.current || 0) 
                    : '••••••'}
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
                onPress={() => navigation.navigate('AddProject' as any)}
              >
              <View style={[styles.actionIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#E8F5E9',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Briefcase size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Add Project</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>Create new project</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => navigation.navigate('MarketerFees' as any)}
            >
              <View style={[styles.actionIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#E8F5E9',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Pay Commission</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>Pay marketers</Text>
              </View>
            </TouchableOpacity>
          </View>
          </View>
        </View>

        {/* Ongoing Projects - Only show when loaded and has data */}
        {!isLoadingProjects && projects.length > 0 && (
          <View style={styles.projectsSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ongoing Projects</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                <Text style={[styles.seeAllText, { color: COLORS.APP_GREEN }]}>See all</Text>
              </TouchableOpacity>
            </View>
            {projects.length === 1 ? (
              // Single project card - full width
              <TouchableOpacity 
                style={[styles.projectCardFull, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => navigation.navigate('Projects')}
              >
                <View style={styles.projectHeader}>
                  <View style={styles.projectLogo}>
                    <Text style={styles.projectLogoText}>
                      {projects[0].projectName?.charAt(0)?.toUpperCase() || 'P'}
                    </Text>
                  </View>
                  <View style={[styles.projectStatus, { 
                    backgroundColor: isDark ? 'transparent' : '#FEF3C7',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? '#FFA500' : 'transparent'
                  }]}>
                    <Text style={[styles.projectStatusText, { color: '#FFA500' }]}>In progress</Text>
                  </View>
                </View>
                <Text style={[styles.projectTitle, { color: colors.text }]} numberOfLines={1}>
                  {projects[0].projectName || 'Untitled Project'}
                </Text>
                <Text style={[styles.projectClient, { color: colors.textSecondary }]} numberOfLines={1}>
                  {projects[0].referral?.clientName || 'Client'}
                </Text>
              </TouchableOpacity>
            ) : (
              // Multiple projects - horizontal scroll
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectsScroll}>
                {projects.map((project) => (
                  <TouchableOpacity 
                    key={project.id}
                    style={[styles.projectCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                    onPress={() => navigation.navigate('Projects')}
                  >
                    <View style={styles.projectHeader}>
                      <View style={styles.projectLogo}>
                        <Text style={styles.projectLogoText}>
                          {project.projectName?.charAt(0)?.toUpperCase() || 'P'}
                        </Text>
                      </View>
                      <View style={[styles.projectStatus, { 
                        backgroundColor: isDark ? 'transparent' : '#FEF3C7',
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? '#FFA500' : 'transparent'
                      }]}>
                        <Text style={[styles.projectStatusText, { color: '#FFA500' }]}>In progress</Text>
                      </View>
                    </View>
                    <Text style={[styles.projectTitle, { color: colors.text }]} numberOfLines={1}>
                      {project.projectName || 'Untitled Project'}
                    </Text>
                    <Text style={[styles.projectClient, { color: colors.textSecondary }]} numberOfLines={1}>
                      {project.referral?.clientName || 'Client'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Recent Activities */}
        <View style={styles.activitiesSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent activities</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AllActivities' as any, { userType: 'business' })}>
              <Text style={[styles.seeAllText, { color: COLORS.APP_GREEN }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {activities.length === 0 ? (
            <View style={styles.emptyActivities}>
              <Text style={[styles.emptyActivitiesText, { color: colors.textSecondary }]}>No recent activities</Text>
            </View>
          ) : (
            activities.map((activity) => {
              // Determine icon and navigation target based on activity type
              let ActivityIcon: IconComponent = Mail;
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
                  navigation.navigate('BusinessTabNavigator' as any, { screen: navigationTarget });
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
                placeholder="Search businesses, marketers, projects..."
                placeholderTextColor={colors.inputPlaceholder}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => performSearch(searchQuery)}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity 
                  style={styles.searchClearButton}
                  onPress={() => setSearchQuery('')}
                >
                  <X size={16} color={COLORS.GRAY} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            {/* Normal Mode - Avatar + Icons */}
            <View style={styles.headerLeft}>
              <TouchableOpacity 
                style={styles.avatarContainer}
                onPress={() => navigation.navigate('Profile' as any)}
                activeOpacity={0.7}
              >
                {user.profileImage ? (
                  <Image source={{ uri: user.profileImage }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {user.name?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.userInfo}
                onPress={() => navigation.navigate('Profile' as any)}
                activeOpacity={0.7}
              >
                <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
                <Text style={[styles.userRole, { color: colors.textSecondary }]}>Business Account</Text>
              </TouchableOpacity>
            </View>

            {/* Right: Search + Chat Icons */}
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={[styles.headerIconButton, { 
                  backgroundColor: isDark ? 'transparent' : '#F4F4F4',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}
                onPress={handleSearchOpen}
              >
                <Search size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.headerIconButton, { 
                  backgroundColor: isDark ? 'transparent' : '#F4F4F4',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}
                onPress={() => navigation.navigate('ChatList' as any)}
              >
                <MessageCircle size={ICON_SIZES.md} color={colors.text} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Search Results - Show when search is active */}
      {isSearchActive && (
        <View style={styles.searchResultsContainer}>
          {isSearching ? (
            <View style={styles.searchLoadingContainer}>
              <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
              <Text style={styles.searchLoadingText}>Searching...</Text>
            </View>
          ) : searchResults ? (
            <ScrollView style={styles.searchResultsScroll} showsVerticalScrollIndicator={false}>
              {searchResults.businesses && searchResults.businesses.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Businesses</Text>
                  {searchResults.businesses.map((business) => (
                    <TouchableOpacity key={business.id} style={styles.searchResultItem}>
                      <View style={styles.searchResultIcon}>
                        <Users size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={styles.searchResultTitle}>{business.businessName}</Text>
                        <Text style={styles.searchResultSubtext}>{business.industry}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchResults.marketers && searchResults.marketers.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Marketers</Text>
                  {searchResults.marketers.map((marketer) => (
                    <TouchableOpacity key={marketer.id} style={styles.searchResultItem}>
                      <View style={styles.searchResultIcon}>
                        <Users size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={styles.searchResultTitle}>{marketer.name}</Text>
                        <Text style={styles.searchResultSubtext}>{marketer.email}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchResults.projects && searchResults.projects.length > 0 && (
                <View style={styles.searchResultSection}>
                  <Text style={styles.searchResultSectionTitle}>Projects</Text>
                  {searchResults.projects.map((project) => (
                    <TouchableOpacity key={project.id} style={styles.searchResultItem}>
                      <View style={styles.searchResultIcon}>
                        <TrendingUp size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                      </View>
                      <View style={styles.searchResultContent}>
                        <Text style={styles.searchResultTitle}>{project.title}</Text>
                        <Text style={styles.searchResultSubtext}>{project.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {(!searchResults.businesses || searchResults.businesses.length === 0) && 
               (!searchResults.marketers || searchResults.marketers.length === 0) && 
               (!searchResults.projects || searchResults.projects.length === 0) && (
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

      {/* Status Badge - Show only when pending and not searching */}
      {!isSearchActive && !isLoadingBusiness && businessStatus === 'pending' && (
        <TouchableOpacity
          style={[
            styles.statusBadge,
            {
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
              borderColor: '#F59E0B',
            },
          ]}
          activeOpacity={0.85}
          onPress={() => setShowPendingInfo(true)}
        >
          <AlertCircle size={16} color="#F59E0B" strokeWidth={2} />
          <Text style={[styles.statusText, { color: isDark ? '#FBBF24' : '#92400E' }]}>
            Pending Approval - We're reviewing your profile
          </Text>
        </TouchableOpacity>
      )}

      {/* Conditionally render dashboard based on business status - Hide when searching */}
      {!isSearchActive && (businessStatus === 'approved' ? renderActiveDashboard() : renderEmptyStateDashboard())}

      <Modal
        visible={showPendingInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPendingInfo(false)}
      >
        <View style={styles.pendingModalOverlay}>
          <View style={[styles.pendingModalCard, { backgroundColor: surfaceColor }]}>
            <Text style={[styles.pendingModalTitle, { color: colors.text }]}>
              Your profile is under review
            </Text>
            <Text style={[styles.pendingModalBody, { color: colors.textSecondary }]}>
              We're reviewing your profile to keep the marketplace safe and to make sure marketers only get legitimate opportunities.
            </Text>
            <Text style={[styles.pendingModalBody, { color: colors.textSecondary }]}>
              While it's pending, you can finish your setup and explore the app. Once you're approved you'll start receiving referrals and new clients automatically.
            </Text>
            <Button
              mode="contained"
              onPress={() => setShowPendingInfo(false)}
              style={[styles.pendingModalButton, { backgroundColor: COLORS.APP_GREEN }]}
              contentStyle={styles.pendingModalButtonContent}
              labelStyle={[styles.pendingModalButtonLabel, { color: '#FFFFFF' }]}
            >
              Got it
            </Button>
          </View>
        </View>
      </Modal>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
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
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  userRole: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
    padding: SPACING.xs,
    marginRight: SPACING.sm,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    marginRight: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    height: 48,
  },
  searchClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.WHITE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultsContainer: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  searchResultsScroll: {
    flex: 1,
  },
  searchResultSection: {
    marginTop: SPACING.md,
  },
  searchResultSectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    paddingHorizontal: 16,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
    backgroundColor: COLORS.WHITE,
  },
  searchResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  searchResultSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  searchLoadingContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
  noResultsContainer: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultsText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  noResultsSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  scrollContent: {
    paddingBottom: SPACING.xl, // Space for tab bar
  },
  mainContainer: {
    backgroundColor: '#1F4039', // Dark green background
    padding: 16,
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: SPACING.md,
    position: 'relative',
    overflow: 'hidden',
  },
  patternTopLeft: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 160,
    height: 160,
    opacity: 1,
  },
  patternBottomRight: {
    position: 'absolute',
    bottom: -40,
    right: -40,
    width: 180,
    height: 180,
    opacity: 1,
  },
  welcomeSection: {
    marginBottom: SPACING.lg,
    zIndex: 1,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
    marginBottom: SPACING.xs,
  },
  welcomeSubtitle: {
    fontSize: FONT_SIZES.md,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 22,
  },
  cardsContainer: {
    zIndex: 1,
  },
  card1: {
    backgroundColor: '#C7E8E0', // Light teal/green
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardIconContainer1: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  cardContent: {
    flex: 1,
  },
  card1Title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs / 2,
  },
  card1Subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    lineHeight: 20,
  },
  smallCardsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    zIndex: 1,
  },
  card2: {
    flex: 1,
    backgroundColor: '#ADDB44', // Lime green
    borderRadius: 12,
    padding: SPACING.md,
    minHeight: 140,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  card3: {
    flex: 1,
    backgroundColor: '#F1F0DC', // Beige/cream
    borderRadius: 12,
    padding: SPACING.md,
    minHeight: 140,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardIconContainer2: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  cardIconContainer3: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  smallCardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    lineHeight: 24,
  },
  card: {
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  growCard: {
    backgroundColor: '#C7E8E0', // Light teal/green
  },
  cardIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  cardDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    lineHeight: 22,
  },
  twoCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
    zIndex: 1,
  },
  smallCard: {
    flex: 1,
    borderRadius: 12,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  partnershipsCard: {
    backgroundColor: '#ADDB44', // Lime green
  },
  clientsCard: {
    backgroundColor: '#F1F0DC', // Beige/cream
  },
  smallCardIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  ctaSection: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
    paddingHorizontal: 16,
  },
  ctaText: {
    fontSize: 18,
    color: COLORS.GRAY,
    textAlign: 'left',
    marginBottom: SPACING.lg,
    lineHeight: 28,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  ctaButton: {
    borderRadius: 8,
    width: '100%',
  },
  ctaButtonContent: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  ctaButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  // Status Badge Styles
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: 16,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    borderRadius: 8,
    gap: SPACING.xs,
    borderWidth: 1,
  },
  statusApproved: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  statusText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#92400E',
  },
  // Active Dashboard Styles
  activeDashboardScroll: {
    paddingBottom: SPACING.xl * 2,
  },
  greetingContainer: {
    marginBottom: SPACING.md,
    marginHorizontal: 16,
    marginTop: 16,
  },
  greetingText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs / 2,
  },
  greetingSubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  balanceCard: {
    backgroundColor: 'transparent',
    padding: SPACING.lg,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.WHITE,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs / 2,
    flexWrap: 'nowrap',
  },
  balanceCurrency: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
    marginRight: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  eyeIconButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  balanceUpdated: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.WHITE,
    opacity: 0.9,
    textAlign: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#F1F0DC',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  statItemRight: {
    justifyContent: 'flex-end',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statTextContainer: {
    flex: 1,
  },
  statTextRight: {
    flex: 0,
    alignItems: 'flex-end',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.BLACK,
    opacity: 0.2,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs / 2,
    textAlign: 'left',
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'left',
  },
  textRight: {
    textAlign: 'right',
  },
  quickActionsSection: {
    marginBottom: SPACING.lg,
    marginHorizontal: 16,
  },
  quickActionsContainer: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  actionSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  projectsSection: {
    marginBottom: SPACING.lg,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  seeAllText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  projectsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  projectCard: {
    width: 200,
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    marginRight: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  projectCardFull: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  projectLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectLogoText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  projectStatus: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 12,
  },
  projectStatusText: {
    fontSize: FONT_SIZES.xs,
    color: '#92400E',
    fontWeight: FONT_WEIGHTS.medium,
  },
  projectTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  projectClient: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  activitiesSection: {
    marginBottom: SPACING.xl,
    marginHorizontal: 16,
  },
  emptyActivities: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyActivitiesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    fontStyle: 'italic',
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  activityContent: {
    flex: 1,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs / 2,
  },
  activityTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    flex: 1,
  },
  activityAmount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  activitySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginBottom: SPACING.xs / 2,
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.APP_GREEN,
    marginLeft: SPACING.xs,
  },
  pendingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  pendingModalCard: {
    width: '100%',
    borderRadius: 16,
    padding: SPACING.lg,
  },
  pendingModalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  pendingModalBody: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  pendingModalButton: {
    borderRadius: 8,
    marginTop: SPACING.xs,
  },
  pendingModalButtonContent: {
    paddingVertical: SPACING.sm,
  },
  pendingModalButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default BusinessDashboard;






