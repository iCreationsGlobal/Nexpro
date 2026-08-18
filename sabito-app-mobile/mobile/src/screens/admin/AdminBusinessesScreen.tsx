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
  Building2,
  MapPin,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import AnimatedListItem from '../../components/common/AnimatedListItem';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { AdminTabScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

type AdminBusinessesScreenProps = AdminTabScreenProps<'Businesses'>;

interface BusinessWithUser extends Business {
  userId?: string;
  userID?: string;
}

const AdminBusinessesScreen: React.FC = () => {
  const navigation = useNavigation<AdminBusinessesScreenProps['navigation']>();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [businesses, setBusinesses] = useState<BusinessWithUser[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const tabs = [
    { key: 'all', label: 'All', status: null },
    { key: 'pending', label: 'Pending', status: 'pending' },
    { key: 'approved', label: 'Approved', status: 'approved' },
    { key: 'rejected', label: 'Rejected', status: 'rejected' },
    { key: 'suspended', label: 'Suspended', status: 'suspended' },
  ];

  // Memoize filtered businesses
  const filteredBusinesses = useMemo(() => {
    if (!searchQuery.trim()) {
      return businesses;
    }

    const query = searchQuery.toLowerCase();
    return businesses.filter(
      (business) =>
        business.businessName?.toLowerCase().includes(query) ||
        business.industry?.toLowerCase().includes(query) ||
        business.location?.toLowerCase().includes(query) ||
        business.user?.email?.toLowerCase().includes(query)
    );
  }, [searchQuery, businesses]);

  const fetchBusinesses = useCallback(async (loadMore: boolean = false): Promise<void> => {
    try {
      if (!loadMore) {
        setLoading(true);
      }
      
      const currentPage = loadMore ? page + 1 : 1;
      const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`;
      
      // Backend returns { success: true, businesses: [...] } not { data: [...] }
      const response = await apiClient.get<{ success: boolean; businesses?: BusinessWithUser[]; data?: BusinessWithUser[]; pagination?: { hasMore: boolean } }>(
        `/api/admin/businesses?page=${currentPage}&limit=20${statusParam}`
      );
      
      // Handle both response formats for compatibility
      const businessesData = response?.data?.businesses || response?.data?.data;
      
      if (response?.data?.success && businessesData && Array.isArray(businessesData)) {
        const newBusinesses = businessesData;
        // Use functional update to avoid dependency on businesses state
        setBusinesses((prevBusinesses) => loadMore ? [...prevBusinesses, ...newBusinesses] : newBusinesses);
        // Backend doesn't return pagination yet, so disable pagination for now
        setHasMore(false);
        setPage(currentPage);
      } else {
        console.warn('[AdminBusinesses] Unexpected response structure:', {
          success: response?.data?.success,
          hasBusinesses: Boolean(response?.data?.businesses),
          hasData: Boolean(response?.data?.data),
          businessesLength: response?.data?.businesses?.length,
          dataLength: response?.data?.data?.length,
        });
        Alert.alert('Warning', 'Received unexpected response format from server');
      }
    } catch (error: any) {
      console.error('[AdminBusinesses] Failed to fetch businesses:', {
        message: error?.message,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        // Don't log full data to avoid base64 image spam
        errorMessage: error?.response?.data?.message,
        url: error?.config?.url,
      });
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to fetch businesses';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, page]); // Removed 'businesses' from dependencies to prevent infinite loop

  useEffect(() => {
    let isMounted = true;
    
    // Add a small delay to avoid simultaneous requests when navigating to admin
    const timeoutId = setTimeout(() => {
      const fetchData = async (): Promise<void> => {
        if (!isMounted) return;
        await fetchBusinesses();
      };
      fetchData();
    }, 600);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [activeTab, fetchBusinesses]);

  const onRefresh = useCallback((): void => {
    setRefreshing(true);
    setPage(1);
    fetchBusinesses();
  }, [fetchBusinesses]);

  const handleApproveBusiness = async (businessId: string): Promise<void> => {
    Alert.alert(
      'Approve Business',
      'Are you sure you want to approve this business?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await apiClient.patch(`/api/admin/businesses/${businessId}/approve`);
              Alert.alert('Success', 'Business approved successfully');
              fetchBusinesses();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to approve business');
            }
          },
        },
      ]
    );
  };

  const handleRejectBusiness = async (businessId: string): Promise<void> => {
    Alert.alert(
      'Reject Business',
      'Are you sure you want to reject this business?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.patch(`/api/admin/businesses/${businessId}/reject`);
              Alert.alert('Success', 'Business rejected successfully');
              fetchBusinesses();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to reject business');
            }
          },
        },
      ]
    );
  };

  const handleSuspendBusiness = async (userId: string): Promise<void> => {
    Alert.alert(
      'Suspend Business',
      'Are you sure you want to suspend this business?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.patch(`/api/admin/users/${userId}/suspend`);
              Alert.alert('Success', 'Business suspended successfully');
              fetchBusinesses();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to suspend business');
            }
          },
        },
      ]
    );
  };

  const getStatusIcon = (status?: string): React.ReactElement | null => {
    const normalizedStatus = status?.toLowerCase();
    switch (normalizedStatus) {
      case 'approved':
        return <CheckCircle size={14} color={COLORS.SUCCESS} strokeWidth={2} />;
      case 'rejected':
        return <XCircle size={14} color={COLORS.ERROR} strokeWidth={2} />;
      case 'pending':
        return <Clock size={14} color={COLORS.WARNING} strokeWidth={2} />;
      case 'suspended':
        return <Ban size={14} color={COLORS.ERROR} strokeWidth={2} />;
      default:
        return null;
    }
  };

  const renderBusinessCard = useCallback(({ item: business, index }: { item: BusinessWithUser; index: number }) => {
    if (!business) return null;
    
    // Normalize status to lowercase for consistent handling
    const status = (business.status || 'pending').toLowerCase();
    
    return (
      <AnimatedListItem index={index} delay={50}>
        <TouchableOpacity
        key={business.id}
        style={[styles.businessCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminBusinessDetails' as any, { businessId: business.id, initialData: business })}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          {business.logo ? (
            <Image 
              source={{ uri: business.logo }} 
              style={styles.businessLogo}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.businessLogoPlaceholder, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
              <Building2 size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
            </View>
          )}
          <View style={styles.businessInfo}>
            <View style={styles.businessNameContainer}>
              <Text style={[styles.businessName, { color: colors.text }]} numberOfLines={1}>
                {business.businessName || 'Unknown Business'}
              </Text>
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor:
                      status === 'approved'
                        ? COLORS.SUCCESS + '20' // Green with 20% opacity
                        : status === 'rejected' || status === 'suspended'
                        ? COLORS.ERROR + '20'
                        : COLORS.WARNING + '20',
                    borderColor:
                      status === 'approved'
                        ? COLORS.SUCCESS
                        : status === 'rejected' || status === 'suspended'
                        ? COLORS.ERROR
                        : COLORS.WARNING,
                  },
                ]}
              >
                {getStatusIcon(status)}
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color:
                        status === 'approved'
                          ? COLORS.SUCCESS
                          : status === 'rejected' || status === 'suspended'
                          ? COLORS.ERROR
                          : COLORS.WARNING,
                    },
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.cardDetails}>
          {business.industry && (
            <View style={styles.detailRow}>
              <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {business.industry}
              </Text>
            </View>
          )}
          {business.location && (
            <View style={styles.detailRow}>
              <MapPin size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {business.location}
              </Text>
            </View>
          )}
          {business.user?.email && (
            <View style={styles.detailRow}>
              <Mail size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {business.user.email}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => handleApproveBusiness(business.id)}
            >
              <CheckCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleRejectBusiness(business.id)}
            >
              <XCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
      </AnimatedListItem>
    );
  }, [colors, navigation]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Businesses" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="Businesses" />
      
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search businesses..."
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

      {/* Business List */}
      <FlatList
        data={filteredBusinesses}
        keyExtractor={(item) => item.id}
        renderItem={renderBusinessCard}
        style={styles.content}
        contentContainerStyle={filteredBusinesses.length === 0 ? styles.emptyContainer : styles.listContent}
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
            <Building2 size={64} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No businesses found
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
  businessCard: {
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
  businessLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  businessLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessInfo: {
    flex: 1,
    marginLeft: 12,
  },
  businessNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  businessName: {
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
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  approveButton: {
    backgroundColor: COLORS.SUCCESS,
  },
  rejectButton: {
    backgroundColor: COLORS.ERROR,
  },
  suspendButton: {
    backgroundColor: COLORS.WARNING,
  },
  actionButtonText: {
    color: COLORS.WHITE,
    fontSize: 14,
    fontWeight: '600',
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

export default AdminBusinessesScreen;



