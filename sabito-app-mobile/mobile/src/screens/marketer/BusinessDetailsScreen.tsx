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
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, 
  Globe, 
  Star, 
  CheckCircle,
  Clock,
  Building2,
  UserPlus,
  RefreshCw,
  Info,
  ExternalLink,
  Phone,
  Ban
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { Button } from 'react-native-paper';
import PartnershipSuccessModal from '../../components/common/PartnershipSuccessModal';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import BusinessReviewModal from '../../components/common/BusinessReviewModal';
import apiClient from '../../services/apiClient';
import { getBusinessDetails } from '../../api/marketplace';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business, ApiResponse } from '../../types/api';

type BusinessDetailsScreenProps = RootStackScreenProps<'BusinessDetails'>;

interface PortfolioItem {
  id: string;
  serviceName: string;
  category?: string;
  pricingFrom?: number;
  images?: string[];
}

const BusinessDetailsScreen: React.FC<BusinessDetailsScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { colors, isDark } = getTheme(theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  // Accept initialData from navigation params for instant loading
  const { businessId, initialData } = route.params as { businessId: string; initialData?: Business };
  
  // Use initialData immediately if provided (no loading state needed)
  const [business, setBusiness] = useState<Business | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData); // Skip loading if we have initial data
  const [applying, setApplying] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [suspending, setSuspending] = useState<boolean>(false);

  useEffect(() => {
    checkIfAdmin();
  }, []);

  useEffect(() => {
    // Only fetch if we don't have initial data
    // Skip background refresh since initialData from list is already fresh
    // and the public endpoint may not have access to partnered-only businesses
    if (businessId && !initialData) {
      fetchBusinessDetails();
    }
    // If we have initialData, we use it directly without background refresh
    // since the list already provides up-to-date data
  }, [businessId, isAdmin]);

  const checkIfAdmin = async (): Promise<void> => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(user.accountType?.toLowerCase() === 'admin');
      }
    } catch (error) {
      // Ignore error
    }
  };

  useEffect(() => {
    if (business?.id) {
      fetchPortfolio();
    }
  }, [business?.id]);

  const fetchBusinessDetails = async (backgroundRefresh: boolean = false): Promise<void> => {
    try {
      // Only show loading indicator if not a background refresh
      if (!backgroundRefresh) {
        setLoading(true);
      }
      
      // Check admin status again (in case it wasn't set when useEffect ran)
      let currentIsAdmin = isAdmin;
      if (!currentIsAdmin) {
        try {
          const userStr = await AsyncStorage.getItem('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            currentIsAdmin = user.accountType?.toLowerCase() === 'admin';
          }
        } catch (error) {
          // Ignore error
        }
      }
      
      console.log('[BusinessDetails] Fetching business:', { businessId, isAdmin: currentIsAdmin });
      
      // If admin, ONLY use admin endpoint (includes pending/inactive businesses)
      if (currentIsAdmin) {
        try {
          const response = await apiClient.get<{ success: boolean; businesses?: Business[]; data?: Business[] }>(`/api/admin/businesses`);
          const businesses = response.data?.businesses || response.data?.data || [];
          console.log('[BusinessDetails] Admin endpoint returned businesses:', businesses.length);
          
          const foundBusiness = businesses.find(b => {
            const matches = b.id === businessId || b.businessId === businessId;
            if (!matches) {
              console.log('[BusinessDetails] Business ID mismatch:', { 
                lookingFor: businessId, 
                businessId: b.id, 
                businessBusinessId: b.businessId 
              });
            }
            return matches;
          });
          
          if (foundBusiness) {
            console.log('[BusinessDetails] ✅ Business found via admin endpoint');
            setBusiness(foundBusiness);
            setLoading(false);
            return; // Successfully found via admin endpoint
          } else {
            console.warn('[BusinessDetails] ❌ Business not found in admin endpoint. Total businesses:', businesses.length);
            // Business not found in admin endpoint
            showDialog({
              title: 'Error',
              message: 'Business not found',
              buttons: [{ text: 'OK', onPress: () => navigation.goBack() }]
            });
            setLoading(false);
            return;
          }
        } catch (adminError: any) {
          console.error('[BusinessDetails] Admin endpoint error:', adminError?.response?.status, adminError?.response?.data);
          // Admin endpoint error
          const errorMessage = adminError?.response?.data?.message || adminError?.message || 'Failed to load business details';
          showDialog({
            title: 'Error',
            message: errorMessage,
            buttons: [{ text: 'OK', onPress: () => navigation.goBack() }]
          });
          setLoading(false);
          return;
        }
      }
      
      // For non-admin users, use public endpoint (only approved businesses)
      console.log('[BusinessDetails] Using public endpoint (non-admin user)');
      try {
        const result = await getBusinessDetails(businessId);
        if (result.success && result.data) {
          console.log('[BusinessDetails] ✅ Business found via public endpoint');
          setBusiness(result.data);
        } else {
          console.warn('[BusinessDetails] ❌ Public endpoint failed:', result.error);
          showDialog({
            title: 'Error',
            message: result.error || 'Failed to load business details',
            buttons: [{ text: 'OK', onPress: () => navigation.goBack() }]
          });
        }
      } catch (publicError: any) {
        console.error('[BusinessDetails] Public endpoint error:', publicError?.response?.status, publicError?.response?.data);
        showDialog({
          title: 'Error',
          message: publicError?.response?.data?.message || publicError?.message || 'Failed to load business details',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }]
        });
      }
    } catch (error: any) {
      // Unexpected error
      console.error('[BusinessDetails] Unexpected error:', error);
      showDialog({
        title: 'Error',
        message: error.message || 'Failed to load business details',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }]
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async (): Promise<void> => {
    if (!business?.id) return;
    
    try {
      setPortfolioLoading(true);
      const response = await apiClient.get(`/api/business/services/public/${business.id}`);
      const services = (response.data as any)?.data?.services || (response.data as any)?.services || [];
      setPortfolioItems(services as PortfolioItem[]);
    } catch (error) {
      setPortfolioItems([]);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleApplyToPartner = async (): Promise<void> => {
    if (!business || (business as any).hasApplied) return;

    showDialog({
      title: 'Apply to Partner',
      message: `Send partnership request to ${business.businessName}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: hideDialog },
        {
          text: 'Send Request',
          onPress: async () => {
            hideDialog();
            setApplying(true);
            try {
              const user = await AsyncStorage.getItem('user');

              if (!user) {
                return;
              }

              const parsedUser = JSON.parse(user);
              await apiClient.post('/api/partnerships/apply', {
                businessId: business.id,
                marketerId: parsedUser.id,
              });
              
              // Update local state
              setBusiness({
                ...business,
                hasApplied: true,
                partnershipStatus: 'pending',
              } as Business & { hasApplied?: boolean; partnershipStatus?: string });

              // Show success modal
              setShowSuccessModal(true);
            } catch (error: any) {
              showDialog({
                title: 'Error',
                message: error.response?.data?.message || 'Failed to apply for partnership',
                buttons: [{ text: 'OK' }]
              });
            } finally {
              setApplying(false);
            }
          },
        },
      ]
    });
  };

  const handleSuspendBusiness = async (): Promise<void> => {
    const userId = business?.userID || business?.userId || business?.user?.id;
    if (!userId) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    Alert.alert(
      'Suspend Business',
      'Are you sure you want to suspend this business?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              setSuspending(true);
              await apiClient.put(`/api/admin/users/${userId}/suspend`);
              Alert.alert('Success', 'Business suspended successfully');
              // Refresh business details
              await fetchBusinessDetails();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to suspend business');
            } finally {
              setSuspending(false);
            }
          },
        },
      ]
    );
  };

  const handleWebsitePress = (): void => {
    if (business?.website) {
      Linking.openURL(business.website);
    }
  };

  const renderRatingStars = (rating: number): React.ReactNode[] => {
    const stars: React.ReactNode[] = [];
    const avgRating = rating || 0;
    
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          size={18}
          color={i <= avgRating ? '#FBBF24' : '#D1D5DB'}
          fill={i <= avgRating ? '#FBBF24' : '#D1D5DB'}
          strokeWidth={0}
        />
      );
    }
    
    return stars;
  };

  const renderPartnershipBadge = (): React.ReactNode | null => {
    const businessWithStatus = business as Business & { hasApplied?: boolean; partnershipStatus?: string };
    if (!businessWithStatus.hasApplied) return null;

    const status = businessWithStatus.partnershipStatus;

    if (status === 'accepted') {
      return (
        <View style={[styles.inlineStatusBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' }]}>
          <CheckCircle size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
          <Text style={styles.inlineStatusText}>Partnered</Text>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View style={[styles.inlineStatusBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
          <Clock size={16} color="#F59E0B" strokeWidth={2} />
          <Text style={[styles.inlineStatusText, { color: '#F59E0B' }]}>Request Sent</Text>
        </View>
      );
    }

    return null;
  };

  const getApplyButtonLabel = (): string => {
    const businessWithStatus = business as Business & { hasApplied?: boolean; partnershipStatus?: string };
    if (businessWithStatus.hasApplied) {
      if (businessWithStatus.partnershipStatus === 'accepted') {
        return 'Partnered Business';
      }
      return 'Request Sent';
    }
    return 'Apply to Partner';
  };

  if (loading || !business) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading business details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const businessWithStatus = business as Business & { 
    hasApplied?: boolean; 
    partnershipStatus?: string;
    averageRating?: number;
    totalRatings?: number;
    commissionRateNew?: number;
    commissionRateReturning?: number;
    services?: string[];
    phone?: string;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Business Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
        {/* Cover Image Hero */}
        {business.coverImage && (
          <View style={styles.coverImageHero}>
            <Image 
              source={{ uri: business.coverImage }} 
              style={styles.coverImageLarge}
              resizeMode="cover"
            />
            <View style={styles.coverOverlay} />
          </View>
        )}
        
        {/* Business Header Card */}
        <View style={[styles.headerCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }, business.coverImage && styles.headerCardWithCover]}>
          <View style={styles.logoWrapper}>
            {business.logo ? (
              <Image source={{ uri: business.logo }} style={styles.logo} />
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: COLORS.APP_GREEN }]}>
                <Text style={styles.logoPlaceholderText}>
                  {business.businessName?.charAt(0)?.toUpperCase() || 'B'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.businessNameMain, { color: colors.text }]}>{business.businessName}</Text>
          <Text style={[styles.industryTag, { color: colors.textSecondary }]}>{business.industry || 'Business'}</Text>
          
          {/* Rating */}
          <View style={styles.ratingRow}>
            <View style={styles.starsRow}>
              {renderRatingStars(businessWithStatus.averageRating || 0)}
            </View>
            <Text style={[styles.ratingText, { color: colors.text }]}>
              {(businessWithStatus.averageRating || 0).toFixed(1)}
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
              ({businessWithStatus.totalRatings || 0})
            </Text>
          </View>

          {/* Partnership Badge */}
          {renderPartnershipBadge()}
        </View>

        {/* Commission Card */}
        <View style={[styles.commissionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Commission Rates</Text>
          <View style={styles.commissionGrid}>
            <View style={[styles.commissionBox, { 
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? colors.border : '#D1FAE5'
            }]}>
              <View style={[styles.commissionIconCircle, { backgroundColor: colors.cardBackground }]}>
                <UserPlus size={18} color={COLORS.APP_GREEN} strokeWidth={1} />
              </View>
              <View style={styles.commissionTextContainer}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>New Clients</Text>
                <Text style={[styles.commissionValue, { color: COLORS.APP_GREEN }]}>{businessWithStatus.commissionRateNew || 0}%</Text>
              </View>
            </View>
            
            <View style={[styles.commissionBox, { 
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
              borderWidth: 1,
              borderColor: isDark ? colors.border : '#D1FAE5'
            }]}>
              <View style={[styles.commissionIconCircle, { backgroundColor: colors.cardBackground }]}>
                <RefreshCw size={18} color={COLORS.APP_GREEN} strokeWidth={1} />
              </View>
              <View style={styles.commissionTextContainer}>
                <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>Returning</Text>
                <Text style={[styles.commissionValue, { color: COLORS.APP_GREEN }]}>{businessWithStatus.commissionRateReturning || 0}%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* About Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>About</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {business.description || 'No description provided.'}
          </Text>
        </View>

        {/* Services Card */}
        {businessWithStatus.services && businessWithStatus.services.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Services Offered</Text>
            <View style={styles.servicesContainer}>
              {businessWithStatus.services.map((service, index) => (
                <View key={index} style={[styles.serviceChip, { 
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4'
                }]}>
                  <Text style={styles.serviceChipText}>{service}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Contact Info Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Contact Information</Text>
          
          <View style={styles.contactRow}>
            <View style={[styles.iconCircle, { 
              backgroundColor: isDark ? 'transparent' : '#F0FDF4',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? colors.border : 'transparent'
            }]}>
              <MapPin size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Address</Text>
              <Text style={[styles.contactValue, { color: colors.text }]}>{business.address || 'N/A'}</Text>
            </View>
          </View>

          {business.website && (
            <TouchableOpacity style={styles.contactRow} onPress={handleWebsitePress}>
              <View style={[styles.iconCircle, { 
                backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Globe size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Website</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>
                  {business.website}
                </Text>
              </View>
              <View>
                <ExternalLink size={16} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
            </TouchableOpacity>
          )}

          {businessWithStatus.phone && (
            <TouchableOpacity 
              style={styles.contactRow} 
              onPress={() => {
                if (businessWithStatus.phone) {
                  Linking.openURL(`tel:${businessWithStatus.phone}`);
                }
              }}
            >
              <View style={[styles.iconCircle, { 
                backgroundColor: isDark ? 'transparent' : '#F0FDF4',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Phone size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>{businessWithStatus.phone}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Portfolio Section - Simplified version */}
        {portfolioLoading ? (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
          </View>
        ) : portfolioItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, styles.cardTitleMargin, { color: colors.text }]}>Portfolio</Text>
            {/* Portfolio items rendering would go here */}
          </View>
        )}
      </ScrollView>

      {/* Apply Button - Fixed at Bottom */}
      {businessWithStatus.hasApplied && businessWithStatus.partnershipStatus === 'accepted' && (
        <View style={[styles.bottomButtonContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Button
            mode="contained"
            onPress={() => setShowReviewModal(true)}
            style={[styles.applyButton, { backgroundColor: '#fbbf24' }]}
            contentStyle={styles.applyButtonContent}
            labelStyle={styles.applyButtonLabel}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Star size={18} color={COLORS.WHITE} fill={COLORS.WHITE} />
              <Text style={[styles.applyButtonLabel, { color: COLORS.WHITE }]}>Rate Business</Text>
            </View>
          </Button>
        </View>
      )}
      
      {!businessWithStatus.hasApplied && !isAdmin && (
        <View style={[styles.bottomButtonContainer, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
          <Button
            mode="contained"
            onPress={handleApplyToPartner}
            style={styles.applyButton}
            contentStyle={styles.applyButtonContent}
            labelStyle={styles.applyButtonLabel}
            disabled={applying}
            loading={applying}
          >
            Apply to Partner
          </Button>
        </View>
      )}

      {/* Admin Actions - Suspend Button */}
      {isAdmin && business && (business.status === 'approved' || business.status === 'Approved') && (
        <View style={[styles.bottomButtonContainer, { backgroundColor: colors.cardBackground, borderTopColor: colors.border }]}>
          <Button
            mode="contained"
            onPress={handleSuspendBusiness}
            style={[styles.applyButton, { backgroundColor: COLORS.ERROR }]}
            contentStyle={styles.applyButtonContent}
            labelStyle={styles.applyButtonLabel}
            disabled={suspending}
            loading={suspending}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ban size={18} color={COLORS.WHITE} strokeWidth={2} />
              <Text style={[styles.applyButtonLabel, { color: COLORS.WHITE }]}>Suspend Business</Text>
            </View>
          </Button>
        </View>
      )}

      {/* Success Modal */}
      <PartnershipSuccessModal
        visible={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        businessName={business.businessName}
      />

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
      
      {/* Review Modal */}
      <BusinessReviewModal
        business={business}
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onReviewSubmitted={() => {
          setShowReviewModal(false);
        }}
      />
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
  coverImageHero: {
    height: 200,
    position: 'relative',
  },
  coverImageLarge: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
  },
  headerCard: {
    padding: 24,
    marginBottom: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  headerCardWithCover: {
    marginTop: -80,
    zIndex: 1,
  },
  logoWrapper: {
    marginBottom: 16,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  businessNameMain: {
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: 6,
  },
  industryTag: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  ratingCount: {
    fontSize: FONT_SIZES.sm,
  },
  inlineStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'center',
  },
  inlineStatusText: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  card: {
    padding: 20,
    marginBottom: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cardTitleMargin: {
    marginBottom: 16,
  },
  commissionCard: {
    padding: 20,
    marginBottom: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  commissionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  commissionBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  commissionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commissionTextContainer: {
    flex: 1,
  },
  commissionLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  commissionValue: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
  },
  description: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
  },
  servicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  serviceChipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.medium,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  contactValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  bottomButtonContainer: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  applyButton: {
    backgroundColor: COLORS.APP_GREEN,
  },
  applyButtonContent: {
    paddingVertical: SPACING.sm,
  },
  applyButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default BusinessDetailsScreen;





