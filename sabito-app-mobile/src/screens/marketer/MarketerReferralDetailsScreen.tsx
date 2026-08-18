import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Phone, User, Calendar, Briefcase, CreditCard, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { getMyReferral } from '../../api/absMarketer';
import { getStatusColor } from '../../utils/statusColors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Referral } from '../../types/api';

type MarketerReferralDetailsScreenProps = RootStackScreenProps<'MarketerReferralDetails'>;

const MarketerReferralDetailsScreen: React.FC<MarketerReferralDetailsScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  // Accept initialData from navigation params for instant loading
  const { referralId, initialData } = route.params as { referralId: string; initialData?: Referral };
  
  // Use initialData immediately if provided (no loading state needed)
  const [referral, setReferral] = useState<Referral | null>(initialData || null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    // Only fetch if we don't have initial data
    // Skip background refresh since initialData from list is already fresh
    if (!initialData) {
      fetchReferralDetails();
    }
  }, [referralId]);

  const fetchReferralDetails = async (backgroundRefresh: boolean = false): Promise<void> => {
    if (!backgroundRefresh) {
      setIsLoading(true);
    }
    try {
      const data = await getMyReferral(referralId);
      if (data) {
        setReferral(data as Referral);
      } else {
        console.warn('Referral data not found');
      }
    } catch (error: any) {
      console.error('Error fetching referral details:', error);
      if (error.response?.status === 404) {
        console.warn('Referral not found (404)');
      } else if (error.response?.status === 403) {
        console.warn('Access denied to referral (403)');
      }
    } finally {
      if (!backgroundRefresh) {
        setIsLoading(false);
      }
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const renderStatusBadge = (status: Referral['status'] | string) => {
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

  const renderInfoRow = (icon: React.ReactNode, label: string, value: string | number | undefined | null) => (
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

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading referral details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!referral) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <AlertCircle size={48} color={colors.textSecondary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary, marginTop: SPACING.md }]}>Referral not found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleBack}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
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

      <ScrollView 
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          {renderStatusBadge(referral.status)}
        </View>

        {/* Client Information Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Client Information</Text>
          
          {renderInfoRow(
            <User size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
            'Client Name',
            referral.clientName
          )}
          
          {referral.clientEmail && renderInfoRow(
            <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
            'Email',
            referral.clientEmail
          )}
          
          {referral.clientPhone && renderInfoRow(
            <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
            'Phone',
            referral.clientPhone
          )}
        </View>

        {/* Referral Information Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Referral Information</Text>
          
          {referral.businessName && renderInfoRow(
            <Briefcase size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
            'Business',
            referral.businessName
          )}
          
          {renderInfoRow(
            <Calendar size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />,
            'Date Referred',
            referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : 'N/A'
          )}
        </View>

        {/* Note Section */}
        {referral.note && (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Note</Text>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>{referral.note}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
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
  retryButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  statusBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'capitalize',
  },
  card: {
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginBottom: 4,
  },
  infoValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  noteText: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
  },
});

export default MarketerReferralDetailsScreen;






