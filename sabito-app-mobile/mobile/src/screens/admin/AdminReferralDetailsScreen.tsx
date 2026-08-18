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
  User,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  Building2,
  Link,
  CheckCircle,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Referral } from '../../types/api';

type AdminReferralDetailsScreenProps = RootStackScreenProps<'AdminReferralDetails'>;

const AdminReferralDetailsScreen: React.FC = () => {
  const navigation = useNavigation<AdminReferralDetailsScreenProps['navigation']>();
  const route = useRoute<AdminReferralDetailsScreenProps['route']>();
  const { theme, effectiveTheme } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  
  const { referralId } = route.params;
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    fetchReferralDetails();
  }, [referralId]);

  const fetchReferralDetails = async (): Promise<void> => {
    try {
      setLoading(true);
      
      // Fetch all referrals and find the one with matching ID
      const response = await apiClient.get<{ success?: boolean; referrals?: Referral[]; data?: Referral[] }>(
        `/api/admin/referrals`
      );
      
      const referrals = response.data?.referrals || response.data?.data || [];
      const foundReferral = referrals.find(r => r.id === referralId);
      
      if (foundReferral) {
        setReferral(foundReferral);
      } else {
        Alert.alert('Error', 'Referral not found', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      console.error('[AdminReferralDetails] Failed to fetch referral:', error);
      Alert.alert('Error', error?.response?.data?.message || 'Failed to load referral details', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchReferralDetails();
  };

  const getStatusColor = (status?: string): string => {
    const statusColors: Record<string, string> = {
      New: '#3B82F6',
      Contacted: '#8B5CF6',
      Interested: '#F59E0B',
      Qualified: '#10B981',
      Converted: COLORS.SUCCESS,
      Rejected: COLORS.ERROR,
      Unresponsive: '#6B7280',
    };
    return statusColors[status || ''] || colors.textSecondary;
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Referral Details" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </View>
    );
  }

  if (!referral) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AdminHeader title="Referral Details" />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Referral not found
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="Referral Details" />
      
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
                backgroundColor: `${getStatusColor(referral.status)}20`,
                borderColor: getStatusColor(referral.status),
              },
            ]}
          >
            <Text style={[styles.statusChipText, { color: getStatusColor(referral.status) }]}>
              {referral.status || 'Unknown'}
            </Text>
          </View>
        </View>

        {/* Client Information */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Client Information</Text>
          
          <View style={styles.infoRow}>
            <User size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {referral.clientName || 'N/A'}
            </Text>
          </View>
          
          {referral.clientEmail && (
            <View style={styles.infoRow}>
              <Mail size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {referral.clientEmail}
              </Text>
            </View>
          )}
          
          {referral.clientPhone && (
            <View style={styles.infoRow}>
              <Phone size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {referral.clientPhone}
              </Text>
            </View>
          )}
        </View>

        {/* Referral Information */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Referral Information</Text>
          
          {referral.marketer && (
            <View style={styles.infoRow}>
              <User size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Marketer: {referral.marketer.name || 'Unknown'}
              </Text>
            </View>
          )}
          
          {referral.business && (
            <View style={styles.infoRow}>
              <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Business: {referral.business.businessName || 'Unknown'}
              </Text>
            </View>
          )}
          
          {referral.businessName && (
            <View style={styles.infoRow}>
              <Building2 size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Business: {referral.businessName}
              </Text>
            </View>
          )}
          
          {referral.createdAt && (
            <View style={styles.infoRow}>
              <Calendar size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Referred: {new Date(referral.createdAt).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>

        {/* Note Section */}
        {referral.note && (
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Note</Text>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              {referral.note}
            </Text>
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
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
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default AdminReferralDetailsScreen;

