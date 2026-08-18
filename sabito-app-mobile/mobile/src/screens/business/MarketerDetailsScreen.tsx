import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, User, Calendar, Briefcase, CheckCircle, XCircle, CreditCard, Share2, Phone } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { getStatusColor } from '../../utils/statusColors';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Marketer } from '../../types/api';

type MarketerDetailsScreenProps = RootStackScreenProps<'MarketerDetails'>;

interface PartnershipStats {
  totalReferrals?: number;
  totalProjects?: number;
  totalEarnings?: number;
}

interface Partnership {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  marketer?: Marketer;
  notes?: string;
}

const MarketerDetailsScreen: React.FC<MarketerDetailsScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  // Accept marketer object directly (partnership object from BusinessMarketers)
  const marketerParam = (route.params as any).marketer as Partnership;
  const [marketer, setMarketer] = useState<Partnership | null>(marketerParam || null);
  const [responding, setResponding] = useState<boolean>(false);
  const [stats, setStats] = useState<PartnershipStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  useEffect(() => {
    if (marketer?.marketer?.id) {
      fetchMarketerStats();
    }
  }, [marketer?.marketer?.id]);

  const fetchMarketerStats = async (): Promise<void> => {
    if (!marketer?.marketer?.id) return;
    
    try {
      const response = await apiClient.get(`/api/partnerships/marketer/${marketer.marketer.id}`);
      if (response.data.success && (response.data.marketer as any)?.stats) {
        setStats((response.data.marketer as any).stats as PartnershipStats);
      }
    } catch (error) {
      // Handle error
    } finally {
      setLoadingStats(false);
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleRespondToRequest = async (requestId: string, status: 'accepted' | 'rejected', marketerName?: string): Promise<void> => {
    showDialog({
      title: 'Confirm Action',
      message: `Are you sure you want to ${status === 'accepted' ? 'accept' : 'reject'} ${marketerName || 'this marketer'}'s partnership request?`,
      buttons: [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: hideDialog,
        },
        {
          text: 'Confirm',
          onPress: async () => {
            hideDialog();
            setResponding(true);

            try {
              await apiClient.patch(`/api/partnerships/respond/${requestId}`, { status });
              // Update local state
              if (marketer) {
                setMarketer({ ...marketer, status });
              }

              showDialog({
                title: 'Success',
                message: `${marketerName || 'The marketer'}'s partnership request has been ${status === 'accepted' ? 'accepted' : 'rejected'}.`,
                buttons: [{ text: 'OK', onPress: () => { hideDialog(); navigation.goBack(); }, style: 'default' }]
              });
            } catch (error: any) {
              // Check for plan limit error
              if (error.response?.status === 400 && error.response?.data?.limitInfo) {
                const { message, limitInfo } = error.response.data;
                showDialog({
                  title: 'Plan Limit Reached',
                  message: `${message}\n\nCurrent: ${limitInfo.current}\nLimit: ${limitInfo.unlimited ? 'Unlimited' : limitInfo.limit}`,
                  buttons: [
                    { text: 'Cancel', style: 'cancel', onPress: hideDialog },
                    {
                      text: 'Upgrade Plan',
                      onPress: () => {
                        hideDialog();
                        navigation.navigate('Subscription');
                      },
                      style: 'default',
                    },
                  ]
                });
              } else {
                showDialog({
                  title: 'Error',
                  message: 'Failed to update partnership status. Please try again.',
                  buttons: [{ text: 'OK' }]
                });
              }
            } finally {
              setResponding(false);
            }
          }
        }
      ]
    });
  };

  const formatStatus = (status?: string): string => {
    return status?.charAt(0)?.toUpperCase() + status?.slice(1) || 'Pending';
  };

  const renderStatusBadge = (status: string): React.ReactElement => {
    const statusColors = getStatusColor(status, 'partnership');
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

  if (!marketer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Marketer not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPending = marketer.status?.toLowerCase() === 'pending';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Marketer Info Card */}
        <View style={styles.section}>
          <View style={[styles.mainCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {/* Marketer Header */}
            <View style={styles.marketerHeader}>
              {/* Avatar */}
              <View style={styles.marketerAvatar}>
                {marketer.marketer?.profileImage ? (
                  <Image
                    source={{ uri: marketer.marketer.profileImage }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.marketerAvatarText}>
                    {marketer.marketer?.name?.charAt(0)?.toUpperCase() || 'M'}
                  </Text>
                )}
              </View>
              
              {/* Marketer Name */}
              <Text style={[styles.marketerName, { color: colors.text }]}>{marketer.marketer?.name || 'Unknown Marketer'}</Text>
              
              {/* Applied Date */}
              <Text style={[styles.appliedDate, { color: colors.textSecondary }]}>
                Applied on {marketer.createdAt ? new Date(marketer.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
              
              {/* Status Badge */}
              <View style={styles.statusContainer}>
                {renderStatusBadge(marketer.status || 'pending')}
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Performance Stats */}
            {loadingStats ? (
              <View style={styles.statsLoading}>
                <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
              </View>
            ) : stats ? (
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <Share2 size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                  <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalReferrals || 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Referrals</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <Briefcase size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                  <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalProjects || 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Projects</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                  <Text style={[styles.statValue, { color: colors.text }]}>₵{(stats.totalEarnings || 0).toFixed(2)}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Earned</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact Information</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Marketer Name',
              marketer.marketer?.name || null
            )}
            {renderInfoRow(
              <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Email',
              marketer.marketer?.email || null
            )}
            {marketer.marketer?.phone && renderInfoRow(
              <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Phone Number',
              marketer.marketer.phone
            )}
          </View>
        </View>

        {/* Partnership Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Partnership Details</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {renderInfoRow(
              <Calendar size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Request Date',
              marketer.createdAt ? new Date(marketer.createdAt).toLocaleDateString() : null
            )}
            {renderInfoRow(
              <Briefcase size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
              'Status',
              formatStatus(marketer.status)
            )}
          </View>
        </View>

        {/* Notes Section */}
        {marketer.notes && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.notesText, { color: colors.text }]}>{marketer.notes}</Text>
            </View>
          </View>
        )}

        {/* Action Buttons (only for pending) */}
        {isPending && (
          <View style={styles.section}>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() =>
                  handleRespondToRequest(marketer.id, 'rejected', marketer.marketer?.name)
                }
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <>
                    <XCircle size={20} color={COLORS.WHITE} strokeWidth={2} />
                    <Text style={styles.rejectButtonText}>Reject Request</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() =>
                  handleRespondToRequest(marketer.id, 'accepted', marketer.marketer?.name)
                }
                disabled={responding}
              >
                {responding ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <>
                    <CheckCircle size={20} color={COLORS.WHITE} strokeWidth={2} />
                    <Text style={styles.acceptButtonText}>Accept Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
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
  mainCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
  },
  marketerHeader: {
    alignItems: 'center',
  },
  marketerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  marketerAvatarText: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  marketerName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  appliedDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  statusContainer: {
    alignItems: 'center',
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
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.STROKE_COLOR,
    marginVertical: SPACING.md,
    marginHorizontal: -SPACING.md, // Negative margin to extend to card edges
  },
  statsLoading: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
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
  notesText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 12,
  },
  rejectButton: {
    backgroundColor: '#dc3545',
  },
  rejectButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  acceptButton: {
    backgroundColor: COLORS.APP_GREEN,
  },
  acceptButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default MarketerDetailsScreen;






