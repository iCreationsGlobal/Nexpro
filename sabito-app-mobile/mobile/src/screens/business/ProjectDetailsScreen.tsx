import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { 
  Briefcase, 
  CreditCard, 
  Calendar, 
  User, 
  Mail,
  Phone,
  Clock,
  FileText,
  X,
  CheckCircle,
  Plus
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { getStatusColor } from '../../utils/statusColors';
import RecordPaymentModal from '../../components/payments/RecordPaymentModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Project } from '../../types/api';

type ProjectDetailsScreenProps = RootStackScreenProps<'ProjectDetails'>;

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'on_hold', 'cancelled'] as const;

interface ExtendedProject extends Project {
  expectedCommission?: number;
  paymentStatus?: string;
  totalPaid?: number;
  estimatedDeliveryTime?: string;
  completedAt?: string;
  isNewClient?: boolean;
}

const ProjectDetailsScreen: React.FC<ProjectDetailsScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  // Accept initialData from navigation params for instant loading
  const { projectId, initialData } = route.params as { projectId: string; initialData?: ExtendedProject };
  
  // Use initialData immediately if provided (no loading state needed)
  const [project, setProject] = useState<ExtendedProject | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [showStatusMenu, setShowStatusMenu] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [userAccountType, setUserAccountType] = useState<string | null>(null);
  
  // Get user account type once on mount
  useFocusEffect(
    React.useCallback(() => {
      const getUserType = async () => {
        try {
          const userStr = await AsyncStorage.getItem('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            const accountType = user?.accountType?.toLowerCase();
            setUserAccountType(accountType);
          }
        } catch (error) {
          setUserAccountType(null);
        }
      };
      getUserType();
      // Only fetch if we don't have initial data
      // Skip background refresh since initialData from list is already fresh
      if (!initialData) {
        fetchProject();
      }
    }, [projectId])
  );

  const fetchProject = async (backgroundRefresh: boolean = false): Promise<void> => {
    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const accountType = user?.accountType?.toLowerCase();
      // Use appropriate endpoint based on user type
      let endpoint;
      if (accountType === 'marketer') {
        endpoint = '/api/marketer/projects';
      } else {
        endpoint = '/api/projects/business';
      }

      const response = await apiClient.get(endpoint);
      // Find project in response
      const fetchedProject = (response.data.projects as ExtendedProject[])?.find((p: ExtendedProject) => p.id === projectId);
      if (fetchedProject) {
        setProject(fetchedProject);
      }
    } catch (error) {
      // Handle error
    } finally {
      if (!backgroundRefresh) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const refreshProjectData = async (): Promise<void> => {
    try {
      setRefreshing(true);
      await fetchProject();
    } catch (error) {
      // Handle error
    } finally {
      setRefreshing(false);
    }
  };

  const handlePaymentSuccess = async (amount: string | number): Promise<void> => {
    // Refresh project data and wait for it to complete
    await refreshProjectData();
    
    // Show success dialog after refresh completes
    setTimeout(() => {
      showDialog({
        title: 'Payment Recorded!',
        message: `Payment of ₵${parseFloat(String(amount)).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been recorded successfully.`,
        buttons: [
          {
            text: 'OK',
            onPress: hideDialog,
          },
        ]
      });
    }, 300);
  };

  const handleStatusUpdate = async (newStatus: string): Promise<void> => {
    if (!project) return;
    
    setShowStatusMenu(false);
    
    if (newStatus === project.status) {
      return;
    }

    setUpdating(true);

    try {
      await apiClient.patch(`/api/projects/${project.id}/status`, { status: newStatus });
      // Update local state
      setProject({ ...project, status: newStatus as Project['status'] });

      showDialog({
        title: 'Success',
        message: `Project status updated to "${formatStatus(newStatus)}"`,
        buttons: [{ text: 'OK' }]
      });
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to update project status. Please try again.',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setUpdating(false);
    }
  };

  const formatStatus = (status: string): string => {
    if (!status) return 'N/A';
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatCurrency = (amount?: number): string => {
    return `₵${(amount || 0).toFixed(2)}`;
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

  const renderInfoRow = (icon: React.ReactElement, label: string, value?: string | null): React.ReactElement => (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconContainer, { 
        backgroundColor: isDark ? 'transparent' : '#E8F5E9',
        borderWidth: isDark ? 1 : 0,
        borderColor: isDark ? colors.border : 'transparent'
      }]}>
        {icon}
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value || 'N/A'}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading project...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Project Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Project not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Project Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Project Info Card */}
        <View style={styles.section}>
          <View style={[styles.mainCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Project Header */}
            <View style={styles.projectHeader}>
              {/* Icon */}
              <View style={styles.projectIcon}>
                <Briefcase size={28} color={COLORS.WHITE} strokeWidth={1.5} />
              </View>
              
              {/* Project Name */}
              <Text style={[styles.projectName, { color: colors.text }]}>{project.projectName || 'Untitled Project'}</Text>
              
              {/* Created Date */}
              <Text style={[styles.projectDate, { color: colors.textSecondary }]}>
                Created on {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
              
              {/* Status Badge */}
              {userAccountType === 'business' ? (
                <TouchableOpacity
                  style={styles.statusSelectorInline}
                  onPress={() => setShowStatusMenu(!showStatusMenu)}
                  disabled={updating}
                >
                  <View style={styles.statusBadgeWrapper}>
                    {renderStatusBadge(project.status || 'pending')}
                    {updating ? (
                      <View style={styles.inlineUpdatingContainer}>
                        <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
                        <Text style={[styles.statusHint, { color: colors.textSecondary }]}>Updating status...</Text>
                      </View>
                    ) : (
                      <Text style={[styles.statusHint, { color: colors.textSecondary }]}>Tap to change</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.statusSelectorInline}>
                  <View style={styles.statusBadgeWrapper}>
                    {renderStatusBadge(project.status || 'pending')}
                  </View>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Financial Stats */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                <Text style={[styles.statValue, { color: colors.text }]}>₵{(project.amount || 0).toFixed(2)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Project Amount</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                <Text style={[styles.statValue, { color: colors.text }]}>₵{(project.expectedCommission || 0).toFixed(2)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Commission</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Tracking Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment Tracking</Text>
            {userAccountType === 'business' && project.paymentStatus !== 'paid' && (
              <TouchableOpacity
                style={styles.recordPaymentButton}
                onPress={() => setShowPaymentModal(true)}
              >
                <Plus size={16} color={COLORS.WHITE} strokeWidth={2} />
                <Text style={styles.recordPaymentButtonText}>Record Payment</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <CreditCard size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Payment Status',
              project.paymentStatus ? formatStatus(project.paymentStatus) : 'Unpaid'
            )}
            {renderInfoRow(
              <CreditCard size={20} color={COLORS.SUCCESS} strokeWidth={1.5} />,
              'Amount Paid',
              formatCurrency(project.totalPaid || 0)
            )}
            {renderInfoRow(
              <CreditCard size={20} color={COLORS.WARNING} strokeWidth={1.5} />,
              'Remaining Amount',
              formatCurrency((project.amount || 0) - (project.totalPaid || 0))
            )}
          </View>
        </View>

        {/* Client Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Client Information</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Client Name',
              project.referral?.clientName || null
            )}
            {renderInfoRow(
              <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Client Email',
              project.referral?.clientEmail || null
            )}
            {renderInfoRow(
              <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Client Phone',
              project.referral?.clientPhone || null
            )}
            {project.referral?.businessName && renderInfoRow(
              <Briefcase size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Company',
              project.referral.businessName
            )}
          </View>
        </View>

        {/* Marketer Information - Only show for business users */}
        {userAccountType === 'business' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Marketer</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {renderInfoRow(
                <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
                'Marketer Name',
                project.referral?.marketer?.name || null
              )}
              {renderInfoRow(
                <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
                'Marketer Email',
                project.referral?.marketer?.email || null
              )}
              {project.referral?.marketer?.phone && renderInfoRow(
                <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
                'Marketer Phone',
                project.referral.marketer.phone
              )}
            </View>
          </View>
        )}

        {/* Project Timeline */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Timeline</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <Calendar size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Created Date',
              project.createdAt ? new Date(project.createdAt).toLocaleDateString() : null
            )}
            {renderInfoRow(
              <Clock size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Estimated Delivery',
              project.estimatedDeliveryTime || null
            )}
            {project.completedAt && renderInfoRow(
              <Calendar size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Completed Date',
              new Date(project.completedAt).toLocaleDateString()
            )}
          </View>
        </View>

        {/* Project Description */}
        {project.description && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Description</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.descriptionText, { color: colors.text }]}>{project.description}</Text>
            </View>
          </View>
        )}

        {/* Client Type Information */}
        {project.isNewClient !== undefined && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Additional Information</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {renderInfoRow(
                <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
                'Client Type',
                project.isNewClient ? 'New Client' : 'Returning Client'
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Record Payment Modal - Only for business users */}
      {userAccountType === 'business' && (
        <RecordPaymentModal
          visible={showPaymentModal}
          project={project}
          onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Status Change Modal - Only for business users */}
      {userAccountType === 'business' && (
        <Modal
          visible={showStatusMenu}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowStatusMenu(false)}
        >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowStatusMenu(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Change Status</Text>
              <TouchableOpacity 
                onPress={() => setShowStatusMenu(false)}
                style={[styles.modalCloseButton, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]}
              >
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Status Options */}
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.modalStatusOption,
                    { backgroundColor: colors.cardBackground, borderColor: colors.border },
                    project.status === status && { backgroundColor: 'transparent', borderColor: COLORS.APP_GREEN }
                  ]}
                  onPress={() => handleStatusUpdate(status)}
                >
                  <View style={styles.statusOptionContent}>
                    {renderStatusBadge(status)}
                    {project.status === status && (
                      <View style={[styles.checkIconContainer, { 
                        backgroundColor: isDark ? 'transparent' : COLORS.WHITE
                      }]}>
                        <CheckCircle size={20} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>

    {/* Custom Dialog */}
    <CustomDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      buttons={dialog.buttons}
      onClose={hideDialog}
    />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  recordPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
  },
  recordPaymentButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  mainCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  projectHeader: {
    alignItems: 'center',
  },
  projectIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  projectName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  projectDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  statusSelectorInline: {
    alignItems: 'center',
  },
  statusBadgeWrapper: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  inlineUpdatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.STROKE_COLOR,
    marginVertical: SPACING.md,
    marginHorizontal: -SPACING.md, // Negative margin to extend to card edges
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginTop: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    marginTop: 2,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    fontWeight: FONT_WEIGHTS.medium,
  },
  descriptionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollView: {
    maxHeight: '85%',
  },
  modalStatusOption: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: 8,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  modalStatusOptionSelected: {
    borderColor: COLORS.APP_GREEN,
    backgroundColor: '#E8F5E9',
  },
  statusOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.WHITE,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProjectDetailsScreen;






