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
import { useFocusEffect } from '@react-navigation/native';
import { Search, Briefcase, X, Plus, CreditCard, Calendar } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import EmptyState from '../../components/common/EmptyState';
import apiClient from '../../services/apiClient';
import { getStatusColor } from '../../utils/statusColors';
import type { BusinessTabScreenProps } from '../../types/navigation';
import type { Project } from '../../types/api';

type BusinessProjectsProps = BusinessTabScreenProps<'Projects'>;

const STATUS_FILTERS = ['All Projects', 'Pending', 'In Progress', 'Completed', 'Cancelled'] as const;

const BusinessProjects: React.FC<BusinessProjectsProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors: themeColors, isDark } = getTheme(effectiveTheme || theme);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>('All Projects');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    filterProjects();
  }, [projects, activeFilter, searchQuery]);

  // Refresh projects when screen comes into focus (e.g., after creating a project)
  useFocusEffect(
    React.useCallback(() => {
      fetchProjects();
    }, [])
  );

  const fetchProjects = async (): Promise<void> => {
    try {
      const response = await apiClient.get('/api/projects/business');
      if (response.data.projects) {
        setProjects(response.data.projects as Project[]);
      } else {
        setProjects([]);
      }
    } catch (error: any) {
      // If 404, means no business profile or no projects - set empty array
      if (error.response?.status === 404) {
        setProjects([]);
      } else if (error.response?.status === 500) {
        setProjects([]);
      } else {
        setProjects([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterProjects = (): void => {
    let filtered = projects;

    // Filter by status
    if (activeFilter !== 'All Projects') {
      const statusMap: Record<string, string> = {
        'Pending': 'pending',
        'In Progress': 'in_progress',
        'Completed': 'completed',
        'Cancelled': 'cancelled'
      };
      const status = statusMap[activeFilter];
      filtered = filtered.filter(project => project.status === status);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(project => 
        project.projectName?.toLowerCase().includes(query) ||
        project.referral?.clientName?.toLowerCase().includes(query) ||
        project.referral?.marketer?.name?.toLowerCase().includes(query)
      );
    }

    setFilteredProjects(filtered);
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchProjects();
  };

  const handleCardPress = (project: Project): void => {
    // Pass the project data for instant loading
    navigation.navigate('ProjectDetails', { projectId: project.id, initialData: project });
  };

  const handleSearchOpen = (): void => {
    setIsSearchActive(true);
  };

  const handleSearchClose = (): void => {
    setIsSearchActive(false);
    setSearchQuery('');
  };

  const formatStatus = (status: string): string => {
    const statusLabels: Record<string, string> = {
      pending: 'Pending',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return statusLabels[status] || status;
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const statusColors = getStatusColor(status, 'project');
    return (
      <View style={[styles.statusBadge, { 
        backgroundColor: isDark ? 'transparent' : statusColors.bg, 
        borderColor: statusColors.border 
      }]}>
        <Text style={[styles.statusText, { color: statusColors.color }]}>{formatStatus(status)}</Text>
      </View>
    );
  };

  const renderProjectCard = (project: Project): React.ReactElement => (
    <TouchableOpacity
      key={project.id}
      style={[styles.projectCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
      onPress={() => handleCardPress(project)}
      activeOpacity={0.7}
    >
      {/* Project Header with Status */}
      <View style={styles.cardHeader}>
        <View style={styles.projectIcon}>
          <Text style={styles.projectIconText}>
            {project.projectName?.charAt(0)?.toUpperCase() || 'P'}
          </Text>
        </View>
        <View style={styles.projectInfo}>
          <Text style={[styles.projectName, { color: themeColors.text }]} numberOfLines={2}>{project.projectName || 'Untitled Project'}</Text>
          <Text style={[styles.clientName, { color: themeColors.textSecondary }]} numberOfLines={1}>{project.referral?.clientName || 'Unknown Client'}</Text>
        </View>
        {renderStatusBadge(project.status || 'pending')}
      </View>

      {/* Stats Chips */}
      <View style={styles.chipsContainer}>
        <View style={[styles.chip, { 
          backgroundColor: isDark ? 'transparent' : '#F3F4F6',
          borderWidth: 1,
          borderColor: isDark ? themeColors.border : '#E0E0E0'
        }]}>
          <CreditCard size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: themeColors.textSecondary }]}>₵{(project.amount || 0).toFixed(2)}</Text>
        </View>
        <View style={[styles.chip, { 
          backgroundColor: isDark ? 'transparent' : '#F3F4F6',
          borderWidth: 1,
          borderColor: isDark ? themeColors.border : '#E0E0E0'
        }]}>
          <Calendar size={12} color={themeColors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: themeColors.textSecondary }]}>
            {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={Briefcase}
      title="No Projects Yet"
      subtitle={activeFilter !== 'All Projects' 
        ? `No projects with "${activeFilter}" status.`
        : 'Projects will appear here once they are created from your referrals.'}
      actionLabel={activeFilter === 'All Projects' ? 'Create Project' : undefined}
      onAction={activeFilter === 'All Projects' ? () => navigation.navigate('AddProject') : undefined}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={themeColors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading projects...</Text>
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
            <View style={[styles.searchBarContainer, { backgroundColor: themeColors.inputBackground }]}>
              <Search size={20} color={themeColors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.searchInput, { color: themeColors.inputText }]}
                placeholder="Search projects..."
                placeholderTextColor={themeColors.inputPlaceholder}
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
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Projects</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { 
                backgroundColor: isDark ? 'transparent' : '#F4F4F4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? themeColors.border : 'transparent'
              }]}>
                <Search size={24} color={themeColors.text} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.headerIconButton, { 
                  backgroundColor: isDark ? 'transparent' : '#F4F4F4',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? themeColors.border : 'transparent'
                }]}
                onPress={() => navigation.navigate('AddProject')}
              >
                <Plus size={24} color={themeColors.text} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Status Filter Chips - Only show when there are projects */}
      {!isSearchActive && projects.length > 0 && (
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

      {/* Projects List */}
      <ScrollView
        style={[styles.scrollView, { backgroundColor: themeColors.background }]}
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
        {filteredProjects.length === 0 ? (
          renderEmptyState()
        ) : (
          filteredProjects.map((project) => renderProjectCard(project))
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
  headerActions: {
    flexDirection: 'row',
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
  projectCard: {
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
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  projectIconText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  projectInfo: {
    flex: 1,
    marginRight: 8,
  },
  projectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 4,
  },
  clientName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginBottom: 2,
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

export default BusinessProjects;






