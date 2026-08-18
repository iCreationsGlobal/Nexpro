import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Phone, User, Calendar, Briefcase, CreditCard, X, CheckCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { Button } from 'react-native-paper';
import BackButton from '../../components/common/BackButton';
import apiClient from '../../services/apiClient';
import { getStatusColor } from '../../utils/statusColors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Referral } from '../../types/api';

type ReferralDetailsScreenProps = RootStackScreenProps<'ReferralDetails'>;

const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Qualified', 'Converted', 'Unresponsive', 'Rejected'] as const;

const ReferralDetailsScreen: React.FC<ReferralDetailsScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  // Accept initialData from navigation params for instant loading
  const { referralId, initialData } = route.params as { referralId: string; initialData?: Referral };
  
  // Use initialData immediately if provided (no loading state needed)
  const [referral, setReferral] = useState<Referral | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [showStatusMenu, setShowStatusMenu] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);

  useEffect(() => {
    // Only fetch if we don't have initial data
    // Skip background refresh since initialData from list is already fresh
    if (!initialData) {
      fetchReferral();
    }
  }, [referralId]);

  const fetchReferral = async (backgroundRefresh: boolean = false): Promise<void> => {
    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }
      const response = await apiClient.get(`/api/referrals/${referralId}`);
      if (response.data.referral) {
        setReferral(response.data.referral as Referral);
      }
    } catch (error: any) {
      // Handle error
    } finally {
      if (!backgroundRefresh) {
        setLoading(false);
      }
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleStatusUpdate = async (newStatus: string): Promise<void> => {
    if (!referral) return;
    
    setShowStatusMenu(false);
    
    if (newStatus === referral.status) {
      return;
    }

    setUpdating(true);

    try {
      await apiClient.patch(`/api/referrals/${referral.id}/status`, { status: newStatus });
      // Update local state
      setReferral({ ...referral, status: newStatus as Referral['status'] });
    } catch (error: any) {
      // Handle error
    } finally {
      setUpdating(false);
    }
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const statusColors = getStatusColor(status, 'referral');
    return (
      <View style={[styles.statusBadge, { 
        backgroundColor: isDark ? 'transparent' : statusColors.bg, 
        borderColor: statusColors.border 
      }]}>
        <Text style={[styles.statusText, { color: statusColors.color }]}>{status}</Text>
      </View>
    );
  };

  const renderInfoRow = (icon: React.ReactElement, label: string, value?: string | null): React.ReactElement => (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconContainer, { 
        backgroundColor: isDark ? 'transparent' : '#F0FDF4',
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
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading referral...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!referral) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Referral not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Client Info Card with Status and Stats */}
        <View style={styles.section}>
          <View style={[styles.mainCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Client Header */}
            <View style={styles.clientHeader}>
              {/* Avatar */}
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>
                  {referral.clientName?.charAt(0)?.toUpperCase() || 'C'}
                </Text>
              </View>
              
              {/* Client Name */}
              <Text style={[styles.clientName, { color: colors.text }]}>{referral.clientName || 'Unknown Client'}</Text>
              
              {/* Referred Date */}
              <Text style={[styles.referralDate, { color: colors.textSecondary }]}>
                Referred on {referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
              
            {/* Status Badge */}
            <TouchableOpacity
              style={styles.statusSelectorInline}
              onPress={() => setShowStatusMenu(!showStatusMenu)}
              disabled={updating}
            >
              <View style={styles.statusBadgeWrapper}>
                {renderStatusBadge(referral.status || 'New')}
                {updating ? (
                  <View style={styles.inlineUpdatingContainer}>
                    <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
                    <Text style={styles.statusHint}>Updating status...</Text>
                  </View>
                ) : (
                  <Text style={styles.statusHint}>Tap to change</Text>
                )}
              </View>
            </TouchableOpacity>

            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Project Stats */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: isDark ? 'transparent' : '#F9FAFB', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
                <Briefcase size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                <Text style={[styles.statValue, { color: colors.text }]}>{referral.totalProjects || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Projects</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: isDark ? 'transparent' : '#F9FAFB', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
                <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                <Text style={[styles.statValue, { color: colors.text }]}>₵{(referral.totalAmountPaid || 0).toFixed(2)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Amount Paid</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact Information</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Email',
              referral.clientEmail || null
            )}
            {renderInfoRow(
              <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Phone',
              referral.clientPhone || null
            )}
            {referral.businessName && renderInfoRow(
              <Briefcase size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Company',
              referral.businessName
            )}
          </View>
        </View>

        {/* Marketer Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Referred By</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Marketer',
              referral.marketer?.name
            )}
            {renderInfoRow(
              <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Marketer Email',
              referral.marketer?.email
            )}
            {referral.marketer?.phone && renderInfoRow(
              <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Marketer Phone',
              referral.marketer.phone
            )}
          </View>
        </View>

        {/* Notes Section - if note exists in referral */}
        {(referral as any).note && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.notesText, { color: colors.text }]}>{(referral as any).note}</Text>
            </View>
          </View>
        )}

        {/* Services Interested - if servicesInterested exists */}
        {(referral as any).servicesInterested && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Services Interested</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.servicesChipsContainer}>
                {(Array.isArray((referral as any).servicesInterested) 
                  ? (referral as any).servicesInterested 
                  : String((referral as any).servicesInterested).split(',').map((s: string) => s.trim())
                ).map((service: string, index: number) => (
                  <View key={index} style={[styles.serviceChip, { 
                    backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: colors.border 
                  }]}>
                    <Text style={[styles.serviceChipText, { color: colors.textSecondary }]}>{service}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Status Change Modal */}
      <Modal
        visible={showStatusMenu}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStatusMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Change Status</Text>
              <TouchableOpacity 
                style={[styles.modalCloseButton, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]}
                onPress={() => setShowStatusMenu(false)}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.statusOptionsContainer}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.modalStatusOption, 
                    { backgroundColor: colors.cardBackground, borderColor: colors.border },
                    status === referral.status && { backgroundColor: 'transparent', borderColor: COLORS.APP_GREEN }
                  ]}
                  onPress={() => handleStatusUpdate(status)}
                >
                  {renderStatusBadge(status)}
                  {status === referral.status && (
                    <View style={[styles.currentIndicator, { 
                      backgroundColor: isDark ? 'transparent' : '#E8F5E9'
                    }]}>
                      <CheckCircle size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                      <Text style={styles.currentText}>Current</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  infoCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: SPACING.md,
  },
  mainCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  clientHeader: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: -SPACING.md, // Negative margin to extend to card edges
  },
  clientAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  clientAvatarText: {
    fontSize: FONT_SIZES.xxl * 1.2,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  clientName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  referralDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  statusSelectorInline: {
    alignItems: 'center',
  },
  statusBadgeWrapper: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  inlineUpdatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: SPACING.xl,
    height: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  statusOptionsContainer: {
    padding: SPACING.md,
  },
  modalStatusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 12,
  },
  currentText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  notesText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    lineHeight: 22,
  },
  servicesChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  serviceChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  serviceChipText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default ReferralDetailsScreen;






