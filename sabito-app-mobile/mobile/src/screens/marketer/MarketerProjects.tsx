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
import { Search, FolderOpen, X, Calendar, DollarSign } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import EmptyState from '../../components/common/EmptyState';
import BackButton from '../../components/common/BackButton';
import { getStatusColor } from '../../utils/statusColors';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Project } from '../../types/api';

type MarketerProjectsScreenProps = RootStackScreenProps<'MarketerProjects'>;

const STATUS_FILTERS = ['All', 'Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// Extended Project interface for marketer projects list
interface ExtendedProject extends Project {
  businessName?: string;
  clientName?: string;
  projectValue?: number;
  expectedCommission?: number;
}

const MarketerProjects: React.FC<MarketerProjectsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [projects, setProjects] = useState<ExtendedProject[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ExtendedProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

  // Fetch projects when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchProjects();
      return () => {
        // Cleanup if needed
      };
    }, [])
  );

  useEffect(() => {
    filterProjects();
  }, [projects, activeFilter, searchQuery]);

  const fetchProjects = async (): Promise<void> => {
    try {
      const response = await apiClient.get<{ projects: ExtendedProject[] }>('/api/marketer/projects', {
        timeout: 30000,
      });
      const projectsData = response.data?.projects || [];
      setProjects(projectsData);
    } catch (error: any) {
      if (error.response?.status === 404) {
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
    if (activeFilter !== 'All') {
      filtered = filtered.filter(proj => proj.status?.toLowerCase() === activeFilter.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(proj => 
        proj.projectName?.toLowerCase().includes(query) ||
        proj.businessName?.toLowerCase().includes(query) ||
        proj.clientName?.toLowerCase().includes(query)
      );
    }

    setFilteredProjects(filtered);
  };

  const handleRefresh = (): void => {
    setRefreshing(true);
    fetchProjects();
  };

  const handleCardPress = (project: ExtendedProject): void => {
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

  const formatCurrency = (amount?: number): string => {
    return `₵${parseFloat(String(amount || 0)).toFixed(2)}`;
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const statusColors = getStatusColor(status, 'project');
    return (
      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
        <Text style={[styles.statusText, { color: statusColors.text }]}>{status}</Text>
      </View>
    );
  };

  const renderProjectCard = (project: ExtendedProject): React.ReactElement => (
    <TouchableOpacity
      key={project.id}
      style={[styles.projectCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
      onPress={() => handleCardPress(project)}
      activeOpacity={0.7}
    >
      {/* Project Header */}
      <View style={styles.cardHeader}>
        <View style={styles.projectInfo}>
          <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
            {project.projectName || 'Unnamed Project'}
          </Text>
          <Text style={[styles.businessName, { color: colors.textSecondary }]} numberOfLines={1}>
            {project.businessName || 'Unknown Business'}
          </Text>
        </View>
        {renderStatusBadge(project.status || 'Pending')}
      </View>

      {/* Client Info */}
      {project.clientName && (
        <View style={styles.clientRow}>
          <Text style={[styles.clientLabel, { color: colors.textSecondary }]}>Client: </Text>
          <Text style={[styles.clientName, { color: colors.text }]}>{project.clientName}</Text>
        </View>
      )}

      {/* Stats Chips */}
      <View style={styles.chipsContainer}>
        <View style={[styles.chip, { backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6', borderColor: colors.border, borderWidth: 1 }]}>
          <DollarSign size={12} color={colors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>
            {formatCurrency(project.projectValue || project.amount)}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6', borderColor: colors.border, borderWidth: 1 }]}>
          <Calendar size={12} color={colors.iconSecondary} strokeWidth={2} />
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>
            {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>

      {/* Commission Info */}
      {project.expectedCommission && (
        <View style={[styles.commissionBox, { backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' }]}>
          <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Expected Commission</Text>
          <Text style={[styles.commissionValue, { color: COLORS.APP_GREEN }]}>
            {formatCurrency(project.expectedCommission)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = (): React.ReactElement => (
    <EmptyState 
      icon={FolderOpen}
      title="No Projects Found"
      description={
        activeFilter !== 'All'
        ? `No projects with "${activeFilter}" status.`
        : 'Projects from your referrals will appear here once businesses create them.'}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading projects...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {isSearchActive ? (
          <>
            <TouchableOpacity onPress={handleSearchClose} style={styles.searchBackButton}>
              <X size={24} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={[styles.searchBarContainer, { backgroundColor: colors.inputBackground }]}>
              <Search size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.searchInput, { color: colors.inputText }]}
                placeholder="Search projects..."
                placeholderTextColor={colors.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color={colors.iconSecondary} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <BackButton onPress={() => navigation.goBack()} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>Projects</Text>
            <TouchableOpacity onPress={handleSearchOpen} style={[styles.headerIconButton, { backgroundColor: isDark ? 'transparent' : '#F4F4F4' }]}>
              <Search size={24} color={colors.iconSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Status Filter Chips */}
      {!isSearchActive && projects.length > 0 && (
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
                      : colors.border
                  }
                ]}
                onPress={() => setActiveFilter(filter as StatusFilter)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: activeFilter === filter ? COLORS.WHITE : colors.textSecondary },
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
        style={[styles.scrollView, { backgroundColor: colors.background }]}
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
    flex: 1,
    textAlign: 'center',
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
  projectCard: {
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  projectInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  projectName: {
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
    textTransform: 'capitalize',
  },
  clientRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  clientLabel: {
    fontSize: FONT_SIZES.sm,
  },
  clientName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
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
  commissionBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commissionLabel: {
    fontSize: FONT_SIZES.sm,
  },
  commissionValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default MarketerProjects;





