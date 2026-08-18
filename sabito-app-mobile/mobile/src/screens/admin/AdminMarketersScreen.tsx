import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import {
  Search,
  User,
  Mail,
  MapPin,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Ban,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import AnimatedListItem from '../../components/common/AnimatedListItem';
import COLORS from '../../constants/colors';
import { API_CONFIG } from '../../config/env';
import apiClient from '../../services/apiClient';
import type { AdminTabScreenProps } from '../../types/navigation';

type AdminMarketersScreenProps = AdminTabScreenProps<'Marketers'>;

interface Marketer {
  id: string;
  name: string;
  email?: string;
  location?: string;
  profilePicture?: string;
  profileImage?: string;
  status?: 'active' | 'suspended';
  userID?: string;
  totalReferrals?: number;
  totalEarnings?: number;
  conversionRate?: number;
}

const AdminMarketersScreen: React.FC = () => {
  const navigation = useNavigation<AdminMarketersScreenProps['navigation']>();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [marketers, setMarketers] = useState<Marketer[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
  ];

  // Memoize filtered marketers
  const filteredMarketers = useMemo(() => {
    if (!searchQuery.trim()) {
      return marketers;
    }

    const query = searchQuery.toLowerCase();
    return marketers.filter(
      (marketer) =>
        marketer.name?.toLowerCase().includes(query) ||
        marketer.email?.toLowerCase().includes(query) ||
        marketer.location?.toLowerCase().includes(query)
    );
  }, [searchQuery, marketers]);

  const fetchMarketers = useCallback(async (loadMore: boolean = false): Promise<void> => {
    try {
      if (!loadMore) {
        setLoading(true);
      }
      
      const currentPage = loadMore ? page + 1 : 1;
      const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`;
      
      // Backend returns { success: true, marketers: [...] } not { data: [...] }
      const response = await apiClient.get<{ success: boolean; marketers?: Marketer[]; data?: Marketer[]; pagination?: { hasMore: boolean } }>(
        `/api/admin/marketers?page=${currentPage}&limit=20${statusParam}`
      );
      
      // Handle both response formats for compatibility
      const marketersData = response?.data?.marketers || response?.data?.data;
      
      if (response?.data?.success && marketersData && Array.isArray(marketersData)) {
        const newMarketers = marketersData;
        // Use functional update to avoid dependency on marketers state
        setMarketers((prevMarketers) => loadMore ? [...prevMarketers, ...newMarketers] : newMarketers);
        // Backend doesn't return pagination yet
        setHasMore(false);
        setPage(currentPage);
      } else {
        console.warn('[AdminMarketers] Unexpected response structure:', {
          success: response?.data?.success,
          hasMarketers: Boolean(response?.data?.marketers),
          hasData: Boolean(response?.data?.data),
        });
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to fetch marketers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, page]); // Removed 'marketers' from dependencies to prevent infinite loop

  useEffect(() => {
    let isMounted = true;
    
    // Add a small delay to avoid simultaneous requests when navigating to admin
    const timeoutId = setTimeout(() => {
      const fetchData = async (): Promise<void> => {
        if (!isMounted) return;
        await fetchMarketers();
      };
      fetchData();
    }, 400);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [activeTab, fetchMarketers]);

  const onRefresh = useCallback((): void => {
    setRefreshing(true);
    setPage(1);
    fetchMarketers();
  }, [fetchMarketers]);


  const getImageUrl = useCallback((imagePath?: string): string | undefined => {
    if (!imagePath) return undefined;
    // If already a full URL, return as is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    // If relative path, prepend base URL
    const baseURL = API_CONFIG.baseURL.replace(/\/$/, ''); // Remove trailing slash
    const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
    return `${baseURL}${cleanPath}`;
  }, []);

  const renderMarketerCard = useCallback(({ item: marketer, index }: { item: Marketer; index: number }) => {
    if (!marketer) return null;
    
    const isSuspended = marketer.status === 'suspended';
    const profileImageUrl = getImageUrl(marketer.profileImage || marketer.profilePicture);
    
    return (
      <AnimatedListItem index={index} delay={50}>
        <TouchableOpacity
        style={[styles.marketerCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminMarketerDetails' as any, { marketerId: marketer.id })}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          {profileImageUrl ? (
            <Image 
              source={{ uri: profileImageUrl }} 
              style={styles.marketerAvatar}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.marketerAvatarPlaceholder, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
              <User size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
            </View>
          )}
          <View style={styles.marketerInfo}>
            <View style={styles.marketerNameContainer}>
              <Text style={[styles.marketerName, { color: colors.text }]} numberOfLines={1}>
                {marketer.name || 'Unknown Marketer'}
              </Text>
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: isSuspended
                      ? COLORS.ERROR + '20'
                      : COLORS.SUCCESS + '20',
                    borderColor: isSuspended
                      ? COLORS.ERROR
                      : COLORS.SUCCESS,
                  },
                ]}
              >
                {isSuspended ? (
                  <Ban size={14} color={COLORS.ERROR} strokeWidth={2} />
                ) : (
                  <CheckCircle size={14} color={COLORS.SUCCESS} strokeWidth={2} />
                )}
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color: isSuspended
                        ? COLORS.ERROR
                        : COLORS.SUCCESS,
                    },
                  ]}
                >
                  {isSuspended ? 'Suspended' : 'Active'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.cardDetails}>
          {marketer.email && (
            <View style={styles.detailRow}>
              <Mail size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]} numberOfLines={1}>
                {marketer.email}
              </Text>
            </View>
          )}
          {marketer.location && (
            <View style={styles.detailRow}>
              <MapPin size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {marketer.location}
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <TrendingUp size={18} color={COLORS.APP_GREEN} strokeWidth={2} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {marketer.totalReferrals || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Referrals</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <DollarSign size={18} color={COLORS.SUCCESS} strokeWidth={2} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>
                GHS {(marketer.totalEarnings || 0).toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Earnings</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {marketer.conversionRate ? `${marketer.conversionRate.toFixed(1)}%` : '0%'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rate</Text>
          </View>
        </View>

      </TouchableOpacity>
      </AnimatedListItem>
    );
  }, [colors, navigation, getImageUrl]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Marketers" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="Marketers" />
      
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search marketers..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab.key ? COLORS.APP_GREEN : colors.cardBackground,
                borderColor: activeTab === tab.key ? COLORS.APP_GREEN : colors.border,
              },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? COLORS.WHITE : colors.text },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Marketer List */}
      <FlatList
        data={filteredMarketers}
        keyExtractor={(item) => item.id}
        renderItem={renderMarketerCard}
        style={styles.content}
        contentContainerStyle={filteredMarketers.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <User size={64} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No marketers found
            </Text>
          </View>
        )}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
        getItemLayout={(data, index) => ({
          length: 200, // Approximate card height
          offset: 200 * index,
          index,
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  tabsContainer: {
    maxHeight: 50,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  marketerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  marketerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  marketerAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  marketerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  marketerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
});

export default AdminMarketersScreen;



