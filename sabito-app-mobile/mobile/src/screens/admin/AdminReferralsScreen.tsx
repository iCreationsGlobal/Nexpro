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
import { useNavigation } from '@react-navigation/native';
import {
  Search,
  Link,
  Briefcase,
  User,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import AnimatedListItem from '../../components/common/AnimatedListItem';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { AdminTabScreenProps } from '../../types/navigation';
import type { Referral, Project } from '../../types/api';

type AdminReferralsScreenProps = AdminTabScreenProps<'Referrals'>;

interface StatusFilter {
  key: string;
  label: string;
}

const AdminReferralsScreen: React.FC = () => {
  const navigation = useNavigation<AdminReferralsScreenProps['navigation']>();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'referrals' | 'projects'>('referrals');
  const [data, setData] = useState<Array<Referral | Project>>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const statusFilters: Record<string, StatusFilter[]> = {
    referrals: [
      { key: 'all', label: 'All' },
      { key: 'New', label: 'New' },
      { key: 'Contacted', label: 'Contacted' },
      { key: 'Interested', label: 'Interested' },
      { key: 'Converted', label: 'Converted' },
      { key: 'Rejected', label: 'Rejected' },
    ],
    projects: [
      { key: 'all', label: 'All' },
      { key: 'active', label: 'Active' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
    ],
  };

  // Memoize filtered data
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }

    const query = searchQuery.toLowerCase();
    return data.filter((item) => {
      if (activeView === 'referrals') {
        const referral = item as Referral;
        return (
          referral.clientName?.toLowerCase().includes(query) ||
          referral.marketer?.name?.toLowerCase().includes(query) ||
          referral.business?.businessName?.toLowerCase().includes(query)
        );
      } else {
        const project = item as Project;
        return (
          project.title?.toLowerCase().includes(query) ||
          project.referral?.clientName?.toLowerCase().includes(query) ||
          project.business?.businessName?.toLowerCase().includes(query)
        );
      }
    });
  }, [searchQuery, data, activeView]);

  const fetchData = useCallback(async (loadMore: boolean = false): Promise<void> => {
    try {
      if (!loadMore) {
        setLoading(true);
      }
      
      const currentPage = loadMore ? page + 1 : 1;
      const endpoint = activeView === 'referrals' ? '/api/admin/referrals' : '/api/admin/projects';
      const statusParam = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      
      // Backend returns different formats:
      // - Referrals: { referrals: [...] }
      // - Projects: might have { success: true, data: [...] } or { projects: [...] }
      const response = await apiClient.get<any>(
        `${endpoint}?page=${currentPage}&limit=20${statusParam}`
      );
      
      // Handle different response formats
      let responseData: Array<Referral | Project> = [];
      if (response?.data?.referrals && Array.isArray(response.data.referrals)) {
        // Referrals endpoint returns { referrals: [...] }
        responseData = response.data.referrals;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        // Some endpoints return { success: true, data: [...] }
        responseData = response.data.data;
      } else if (response?.data?.projects && Array.isArray(response.data.projects)) {
        // Projects endpoint might return { projects: [...] }
        responseData = response.data.projects;
      } else if (Array.isArray(response?.data)) {
        // Direct array response
        responseData = response.data;
      }
      
      if (responseData.length > 0 || response?.data?.success) {
        // Use functional update to avoid dependency on data state
        setData((prevData) => loadMore ? [...prevData, ...responseData] : responseData);
        // Backend doesn't return pagination yet
        setHasMore(false);
        setPage(currentPage);
      } else {
        console.warn('[AdminReferrals] Unexpected response structure:', {
          hasReferrals: Boolean(response?.data?.referrals),
          hasData: Boolean(response?.data?.data),
          hasProjects: Boolean(response?.data?.projects),
          isArray: Array.isArray(response?.data),
        });
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to fetch ${activeView}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeView, statusFilter, page]); // Removed 'data' from dependencies to prevent infinite loop

  useEffect(() => {
    let isMounted = true;
    
    // Add a small delay to avoid simultaneous requests when navigating to admin
    const timeoutId = setTimeout(() => {
      const fetchDataAsync = async (): Promise<void> => {
        if (!isMounted) return;
        await fetchData();
      };
      fetchDataAsync();
    }, 500);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [activeView, statusFilter, fetchData]);

  const onRefresh = useCallback((): void => {
    setRefreshing(true);
    setPage(1);
    fetchData();
  }, [fetchData]);

  const getStatusColor = (status?: string): string => {
    const statusColors: Record<string, string> = {
      New: '#3B82F6',
      Contacted: '#8B5CF6',
      Interested: '#F59E0B',
      Qualified: '#10B981',
      Converted: COLORS.SUCCESS,
      Rejected: COLORS.ERROR,
      Unresponsive: '#6B7280',
      active: COLORS.SUCCESS,
      completed: '#10B981',
      cancelled: COLORS.ERROR,
    };
    return statusColors[status || ''] || colors.textSecondary;
  };

  const renderReferralCard = useCallback(({ item, index }: { item: Referral | Project; index: number }) => {
    const referral = item as Referral;
    if (!referral || activeView !== 'referrals') return null;
    
    return (
      <AnimatedListItem index={index} delay={50}>
        <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminReferralDetails' as any, { referralId: referral.id, initialData: referral })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {referral.clientName || 'Unknown Client'}
            </Text>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: `${getStatusColor(referral.status)}20`,
                  borderColor: getStatusColor(referral.status),
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: getStatusColor(referral.status) }]}>
                {referral.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <User size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              Marketer: {referral.marketer?.name || 'Unknown'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              Business: {referral.business?.businessName || 'Unknown'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Calendar size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {new Date(referral.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  }, [colors, navigation]);

  const renderProjectCard = useCallback(({ item, index }: { item: Referral | Project; index: number }) => {
    const project = item as Project;
    if (!project || activeView !== 'projects') return null;
    
    return (
      <AnimatedListItem index={index} delay={50}>
        <TouchableOpacity
        key={project.id}
        style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminProjectDetails' as any, { projectId: project.id, initialData: project })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {project.projectName || project.title || 'Untitled Project'}
            </Text>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: `${getStatusColor(project.status)}20`,
                  borderColor: getStatusColor(project.status),
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: getStatusColor(project.status) }]}>
                {project.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {project.referral?.business?.businessName || project.referral?.businessName || project.business?.businessName || 'Unknown Business'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Link size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              Client: {project.referral?.clientName || 'Unknown'}
            </Text>
          </View>
          {project.estimatedValue && (
            <View style={styles.detailRow}>
              <DollarSign size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                GHS {parseFloat(project.estimatedValue.toString()).toLocaleString()}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Calendar size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {new Date(project.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  }, [colors, navigation, activeView]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title={activeView === 'referrals' ? 'Referrals' : 'Projects'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title={activeView === 'referrals' ? 'Referrals' : 'Projects'} />
      
      {/* View Toggle */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[
            styles.viewToggleButton,
            {
              backgroundColor: activeView === 'referrals' ? COLORS.APP_GREEN : colors.cardBackground,
              borderColor: activeView === 'referrals' ? COLORS.APP_GREEN : colors.border,
            },
          ]}
          onPress={() => {
            setActiveView('referrals');
            setStatusFilter('all');
          }}
        >
          <Link
            size={20}
            color={activeView === 'referrals' ? COLORS.WHITE : colors.text}
            strokeWidth={2}
          />
          <Text
            style={[
              styles.viewToggleText,
              { color: activeView === 'referrals' ? COLORS.WHITE : colors.text },
            ]}
          >
            Referrals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewToggleButton,
            {
              backgroundColor: activeView === 'projects' ? COLORS.APP_GREEN : colors.cardBackground,
              borderColor: activeView === 'projects' ? COLORS.APP_GREEN : colors.border,
            },
          ]}
          onPress={() => {
            setActiveView('projects');
            setStatusFilter('all');
          }}
        >
          <Briefcase
            size={20}
            color={activeView === 'projects' ? COLORS.WHITE : colors.text}
            strokeWidth={2}
          />
          <Text
            style={[
              styles.viewToggleText,
              { color: activeView === 'projects' ? COLORS.WHITE : colors.text },
            ]}
          >
            Projects
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={`Search ${activeView}...`}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Status Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {statusFilters[activeView].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              {
                backgroundColor: statusFilter === filter.key ? COLORS.APP_GREEN : colors.cardBackground,
                borderColor: statusFilter === filter.key ? COLORS.APP_GREEN : colors.border,
              },
            ]}
            onPress={() => setStatusFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterText,
                { color: statusFilter === filter.key ? COLORS.WHITE : colors.text },
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Data List */}
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={activeView === 'referrals' ? renderReferralCard : renderProjectCard}
        style={styles.content}
        contentContainerStyle={filteredData.length === 0 ? styles.emptyContainer : styles.listContent}
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
            {activeView === 'referrals' ? (
              <Link size={64} color={colors.textSecondary} strokeWidth={1.5} />
            ) : (
              <Briefcase size={64} color={colors.textSecondary} strokeWidth={1.5} />
            )}
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No {activeView} found
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
  viewToggleContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  viewToggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  filtersContainer: {
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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

export default AdminReferralsScreen;



