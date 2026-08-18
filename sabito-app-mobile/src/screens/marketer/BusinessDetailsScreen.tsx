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
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { Button } from 'react-native-paper';
import PartnershipSuccessModal from '../../components/common/PartnershipSuccessModal';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { getBusinessDetails, requestPartnership } from '../../api/marketplace';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

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
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState<boolean>(false);

  useEffect(() => {
    // Only fetch if we don't have initial data
    // Skip background refresh since initialData from list is already fresh
    // and the public endpoint may not have access to partnered-only businesses
    if (businessId && !initialData) {
      fetchBusinessDetails();
    }
    // If we have initialData, we use it directly without background refresh
    // since the list already provides up-to-date data
  }, [businessId]);

  useEffect(() => {
    if (business?.id) {
      fetchPortfolio();
    }
  }, [business?.id]);

  const fetchBusinessDetails = async (_backgroundRefresh: boolean = false): Promise<void> => {
    try {
      setLoading(true);
      const result = await getBusinessDetails(businessId);
      if (result?.data) {
        setBusiness(result.data as Business);
      } else {
        showDialog({
          title: 'Error',
          message: 'Failed to load business details',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error?.message || 'Failed to load business details',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async (): Promise<void> => {
    setPortfolioItems([]);
    setPortfolioLoading(false);
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
              const tenantId = (business as any).businessId || business.id;
              await requestPartnership(String(tenantId));
              setBusiness({ ...(business as any), hasApplied: true, partnershipStatus: 'pending' });
              setShowSuccessModal(true);
            } catch (error: any) {
              showDialog({
                title: 'Error',
                message: error?.message || 'Failed to send partnership request',
                buttons: [{ text: 'OK', onPress: hideDialog }],
              });
            } finally {
              setApplying(false);
            }
          },
        },
      ],
    });
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
      {!businessWithStatus.hasApplied && (
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





