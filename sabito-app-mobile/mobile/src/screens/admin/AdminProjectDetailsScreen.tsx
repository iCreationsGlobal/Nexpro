import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Briefcase,
  DollarSign,
  Calendar,
  Building2,
  Link,
  User,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Project } from '../../types/api';

type AdminProjectDetailsScreenProps = RootStackScreenProps<'AdminProjectDetails'>;

const AdminProjectDetailsScreen: React.FC = () => {
  const navigation = useNavigation<AdminProjectDetailsScreenProps['navigation']>();
  const route = useRoute<AdminProjectDetailsScreenProps['route']>();
  const { theme, effectiveTheme } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  
  const { projectId } = route.params;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  const fetchProjectDetails = async (): Promise<void> => {
    try {
      setLoading(true);
      
      // Fetch all projects and find the one with matching ID
      const response = await apiClient.get<{ success?: boolean; projects?: Project[]; data?: Project[] }>(
        `/api/admin/projects`
      );
      
      const projects = response.data?.projects || response.data?.data || [];
      const foundProject = projects.find(p => p.id === projectId);
      
      if (foundProject) {
        setProject(foundProject);
      } else {
        Alert.alert('Error', 'Project not found', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      console.error('[AdminProjectDetails] Failed to fetch project:', error);
      Alert.alert('Error', error?.response?.data?.message || 'Failed to load project details', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchProjectDetails();
  };

  const getStatusColor = (status?: string): string => {
    const statusColors: Record<string, string> = {
      active: COLORS.SUCCESS,
      completed: COLORS.SUCCESS,
      cancelled: COLORS.ERROR,
      pending: COLORS.WARNING,
      in_progress: COLORS.INFO,
      on_hold: COLORS.WARNING,
    };
    return statusColors[status || ''] || colors.textSecondary;
  };

  const getStatusIcon = (status?: string): React.ReactElement => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} color={COLORS.SUCCESS} strokeWidth={2} />;
      case 'cancelled':
        return <XCircle size={14} color={COLORS.ERROR} strokeWidth={2} />;
      case 'active':
      case 'in_progress':
        return <Clock size={14} color={COLORS.INFO} strokeWidth={2} />;
      default:
        return <Clock size={14} color={COLORS.WARNING} strokeWidth={2} />;
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Project Details" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Project Details" />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Project not found
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="Project Details" />
      
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusChip,
              {
                backgroundColor: `${getStatusColor(project.status)}20`,
                borderColor: getStatusColor(project.status),
              },
            ]}
          >
            {getStatusIcon(project.status)}
            <Text style={[styles.statusChipText, { color: getStatusColor(project.status) }]}>
              {project.status?.charAt(0).toUpperCase() + project.status?.slice(1) || 'Unknown'}
            </Text>
          </View>
        </View>

        {/* Project Information */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Information</Text>
          
          <View style={styles.infoRow}>
            <Briefcase size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {project.title || 'Untitled Project'}
            </Text>
          </View>
          
          {project.description && (
            <View style={styles.infoRow}>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                {project.description}
              </Text>
            </View>
          )}
          
          {project.estimatedValue && (
            <View style={styles.infoRow}>
              <DollarSign size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                GHS {parseFloat(project.estimatedValue.toString()).toLocaleString()}
              </Text>
            </View>
          )}
          
          {project.createdAt && (
            <View style={styles.infoRow}>
              <Calendar size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Created: {new Date(project.createdAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* Business Information */}
        {project.business && (
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Information</Text>
            
            <View style={styles.infoRow}>
              <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {project.business.businessName || 'Unknown Business'}
              </Text>
            </View>
            
            {project.business.industry && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Industry: {project.business.industry}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Referral Information */}
        {project.referral && (
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Referral Information</Text>
            
            <View style={styles.infoRow}>
              <Link size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Client: {project.referral.clientName || 'Unknown'}
              </Text>
            </View>
            
            {project.referral.marketer && (
              <View style={styles.infoRow}>
                <User size={16} color={colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.infoText, { color: colors.text }]}>
                  Marketer: {project.referral.marketer.name || 'Unknown'}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  statusChipText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});

export default AdminProjectDetailsScreen;

