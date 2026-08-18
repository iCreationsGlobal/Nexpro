import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  User,
  Mail,
  MapPin,
  Phone,
  Calendar,
  TrendingUp,
  DollarSign,
  Briefcase,
  CheckCircle,
  Ban,
  CreditCard,
  Building2,
  Link,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import BackButton from '../../components/common/BackButton';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';

type AdminMarketerDetailsScreenProps = RootStackScreenProps<'AdminMarketerDetails'>;

interface Marketer {
  id: string;
  name: string;
  email?: string;
  location?: string;
  profilePicture?: string;
  profileImage?: string;
  status?: 'active' | 'suspended';
  userID?: string;
  totalReferrals?: number;
  totalEarnings?: number;
  conversionRate?: number;
  createdAt?: string;
  phone?: string;
  paymentMethod?: string;
  paymentNumber?: string;
  partneredBusinesses?: Array<{ id: string; businessName: string }>;
}

const AdminMarketerDetailsScreen: React.FC = () => {
  const navigation = useNavigation<AdminMarketerDetailsScreenProps['navigation']>();
  const route = useRoute<AdminMarketerDetailsScreenProps['route']>();
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const { marketerId } = route.params;
  const [marketer, setMarketer] = useState<Marketer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [suspending, setSuspending] = useState<boolean>(false);

  useEffect(() => {
    fetchMarketerDetails();
  }, [marketerId]);

  const fetchMarketerDetails = async (): Promise<void> => {
    try {
      setLoading(true);
      
      // Fetch all marketers and find the one with matching ID
      const response = await apiClient.get<{ success: boolean; marketers?: Marketer[]; data?: Marketer[] }>(
        `/api/admin/marketers`
      );
      
      const marketers = response.data?.marketers || response.data?.data || [];
      const foundMarketer = marketers.find(m => m.id === marketerId || m.userID === marketerId);
      
      if (foundMarketer) {
        setMarketer(foundMarketer);
      } else {
        Alert.alert('Error', 'Marketer not found', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      console.error('[AdminMarketerDetails] Failed to fetch marketer:', error);
      Alert.alert('Error', error?.response?.data?.message || 'Failed to load marketer details', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchMarketerDetails();
  };

  const handleSuspendMarketer = async (): Promise<void> => {
    if (!marketer) return;
    
    Alert.alert(
      'Suspend Marketer',
      `Are you sure you want to suspend ${marketer.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              setSuspending(true);
              await apiClient.patch(`/api/admin/users/${marketer.userID || marketer.id}/suspend`);
              Alert.alert('Success', 'Marketer suspended successfully');
              fetchMarketerDetails();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to suspend marketer');
            } finally {
              setSuspending(false);
            }
          },
        },
      ]
    );
  };

  const handleActivateMarketer = async (): Promise<void> => {
    if (!marketer) return;
    
    Alert.alert(
      'Activate Marketer',
      `Are you sure you want to activate ${marketer.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            try {
              setSuspending(true);
              // Note: Backend might not have activate endpoint yet
              await apiClient.patch(`/api/admin/users/${marketer.userID || marketer.id}/activate`, { isVerified: true });
              Alert.alert('Success', 'Marketer activated successfully');
              fetchMarketerDetails();
            } catch (error: any) {
              if (error.response?.status === 404) {
                Alert.alert('Not Available', 'Activate endpoint is not yet implemented. Please contact support.');
              } else {
                Alert.alert('Error', error.response?.data?.message || 'Failed to activate marketer');
              }
            } finally {
              setSuspending(false);
            }
          },
        },
      ]
    );
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading marketer details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!marketer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Marketer not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSuspended = marketer.status === 'suspended';
  const profileImage = marketer.profilePicture || marketer.profileImage;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={[styles.scrollView, { backgroundColor: colors.background }]} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Marketer Header Card */}
        <View style={[styles.headerCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.logoWrapper}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.logo}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: COLORS.APP_GREEN }]}>
                <Text style={styles.logoPlaceholderText}>
                  {marketer.name?.charAt(0)?.toUpperCase() || 'M'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.marketerNameMain, { color: colors.text }]}>{marketer.name || 'Unknown Marketer'}</Text>
          <Text style={[styles.industryTag, { color: colors.textSecondary }]}>Marketer</Text>
          
          {/* Status Badge */}
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: isSuspended
                    ? COLORS.ERROR + '20'
                    : COLORS.SUCCESS + '20',
                  borderColor: isSuspended
                    ? COLORS.ERROR
                    : COLORS.SUCCESS,
                },
              ]}
            >
              {isSuspended ? (
                <Ban size={14} color={COLORS.ERROR} strokeWidth={2} />
              ) : (
                <CheckCircle size={14} color={COLORS.SUCCESS} strokeWidth={2} />
              )}
              <Text
                style={[
                  styles.statusChipText,
                  {
                    color: isSuspended
                      ? COLORS.ERROR
                      : COLORS.SUCCESS,
                  },
                ]}
              >
                {isSuspended ? 'Suspended' : 'Active'}
              </Text>
            </View>
          </View>
        </View>

        {/* Performance Stats Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Performance Stats</Text>
          
          <View style={styles.commissionGrid}>
            <View style={[styles.commissionBox, { 
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? colors.border : '#D1FAE5'
            }]}>
              <View style={[styles.commissionIconCircle, { backgroundColor: colors.cardBackground }]}>
                <Link size={18} color={COLORS.APP_GREEN} strokeWidth={1} />
              </View>
              <View style={styles.commissionTextContainer}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Referrals</Text>
                <Text style={[styles.commissionValue, { color: COLORS.APP_GREEN }]}>{marketer.totalReferrals || 0}</Text>
              </View>
            </View>
            
            <View style={[styles.commissionBox, { 
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? colors.border : '#D1FAE5'
            }]}>
              <View style={[styles.commissionIconCircle, { backgroundColor: colors.cardBackground }]}>
                <DollarSign size={18} color={COLORS.APP_GREEN} strokeWidth={1} />
              </View>
              <View style={styles.commissionTextContainer}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Earnings</Text>
                <Text style={[styles.commissionValue, { color: COLORS.APP_GREEN }]}>GHS {(marketer.totalEarnings || 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>
          
          {marketer.conversionRate !== undefined && (
            <View style={[styles.commissionBox, { 
              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7',
              borderWidth: 1,
              borderColor: isDark ? colors.border : '#FDE68A',
              marginTop: 12,
            }]}>
              <View style={[styles.commissionIconCircle, { backgroundColor: colors.cardBackground }]}>
                <TrendingUp size={18} color={COLORS.WARNING} strokeWidth={1} />
              </View>
              <View style={styles.commissionTextContainer}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Conversion Rate</Text>
                <Text style={[styles.commissionValue, { color: COLORS.WARNING }]}>{marketer.conversionRate.toFixed(1)}%</Text>
              </View>
            </View>
          )}
        </View>

        {/* Contact Info Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Contact Information</Text>
          
          <View style={styles.contactRow}>
            <View style={[styles.iconCircle, { 
              backgroundColor: isDark ? 'transparent' : '#F0FDF4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? colors.border : 'transparent'
            }]}>
              <Mail size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Email</Text>
              <Text style={[styles.contactValue, { color: colors.text }]}>{marketer.email || 'N/A'}</Text>
            </View>
          </View>

          {marketer.phone && (
            <View style={styles.contactRow}>
              <View style={[styles.iconCircle, { 
                backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Phone size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>{marketer.phone}</Text>
              </View>
            </View>
          )}

          {marketer.location && (
            <View style={styles.contactRow}>
              <View style={[styles.iconCircle, { 
                backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <MapPin size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Location</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>{marketer.location}</Text>
              </View>
            </View>
          )}

          {marketer.createdAt && (
            <View style={styles.contactRow}>
              <View style={[styles.iconCircle, { 
                backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Calendar size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Joined</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>{new Date(marketer.createdAt).toLocaleDateString()}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Payment Information */}
        {(marketer.paymentMethod || marketer.paymentNumber) && (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Payment Information</Text>
            
            {marketer.paymentMethod && (
              <View style={styles.contactRow}>
                <View style={[styles.iconCircle, { 
                  backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}>
                  <CreditCard size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Payment Method</Text>
                  <Text style={[styles.contactValue, { color: colors.text }]}>
                    {marketer.paymentMethod} - {marketer.paymentNumber || 'N/A'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Partnered Businesses */}
        {marketer.partneredBusinesses && marketer.partneredBusinesses.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>
              Partnered Businesses ({marketer.partneredBusinesses.length})
            </Text>
            
            {marketer.partneredBusinesses.map((business) => (
              <View key={business.id} style={styles.contactRow}>
                <View style={[styles.iconCircle, { 
                  backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}>
                  <Building2 size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={[styles.contactValue, { color: colors.text }]}>
                    {business.businessName}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Admin Actions - Suspend/Activate Button */}
      <View style={[styles.bottomButtonContainer, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
        {isSuspended ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.activateButton]}
            onPress={handleActivateMarketer}
            disabled={suspending}
          >
            {suspending ? (
              <ActivityIndicator size="small" color={COLORS.WHITE} />
            ) : (
              <>
                <CheckCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                <Text style={styles.actionButtonText}>Activate Marketer</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.suspendButton]}
            onPress={handleSuspendMarketer}
            disabled={suspending}
          >
            {suspending ? (
              <ActivityIndicator size="small" color={COLORS.WHITE} />
            ) : (
              <>
                <Ban size={18} color={COLORS.WHITE} strokeWidth={2} />
                <Text style={styles.actionButtonText}>Suspend Marketer</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 100,
  },
  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    margin: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  logoWrapper: {
    marginBottom: 12,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    fontSize: 40,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  marketerNameMain: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
    textAlign: 'center',
  },
  industryTag: {
    fontSize: FONT_SIZES.md,
    marginBottom: 12,
  },
  statusContainer: {
    marginTop: 8,
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
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cardTitleMargin: {
    marginBottom: 16,
  },
  commissionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  commissionBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  commissionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commissionTextContainer: {
    flex: 1,
  },
  commissionLabel: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 4,
  },
  commissionValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 4,
  },
  contactValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
  },
  bottomButtonContainer: {
    padding: 16,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  suspendButton: {
    backgroundColor: COLORS.ERROR,
  },
  activateButton: {
    backgroundColor: COLORS.SUCCESS,
  },
  actionButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default AdminMarketerDetailsScreen;

