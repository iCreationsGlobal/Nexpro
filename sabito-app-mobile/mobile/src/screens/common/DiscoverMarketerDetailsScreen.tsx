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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import {
  ArrowLeft,
  Star,
  MapPin,
  Award,
  TrendingUp,
  Mail,
  MessageCircle,
  Heart,
  Share2,
  CheckCircle,
  Globe,
  Phone,
  Briefcase,
  Target,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { getMarketerPublicProfile } from '../../api/marketplace';
import BackButton from '../../components/common/BackButton';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Marketer, User } from '../../types/api';

type DiscoverMarketerDetailsScreenProps = RootStackScreenProps<'DiscoverMarketerDetails'>;

type PartnershipStatus = 'pending' | 'accepted' | 'rejected' | null;

interface ExtendedMarketer extends Marketer {
  location?: string;
  city?: string;
  country?: string;
  totalRatings?: number;
  totalEarnings?: number;
  responseTimeMinutes?: number;
  languages?: string[];
  isTopMarketer?: boolean;
  isFounder?: boolean;
  email?: string;
  phone?: string;
  website?: string;
}

const DiscoverMarketerDetailsScreen: React.FC<DiscoverMarketerDetailsScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const { marketerId } = route.params;
  const [marketer, setMarketer] = useState<ExtendedMarketer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [requestingPartnership, setRequestingPartnership] = useState<boolean>(false);
  const [partnershipStatus, setPartnershipStatus] = useState<PartnershipStatus>(null);
  const { dialog, showDialog, hideDialog } = useDialog();

  useEffect(() => {
    loadMarketerProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketerId]);

  const loadMarketerProfile = async (): Promise<void> => {
    try {
      setLoading(true);
      const result = await getMarketerPublicProfile(marketerId);
      if (result.success && result.data) {
        setMarketer(result.data as ExtendedMarketer);
        // Check if marketer is saved
        checkIfSaved(result.data.id);
        // Check partnership request status
        await checkPartnershipStatus(result.data.id);
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to load marketer profile',
          buttons: [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }]
        });
      }
    } catch (error) {
      showDialog({
        title: 'Error',
        message: 'Failed to load marketer profile',
        buttons: [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }]
      });
    } finally {
      setLoading(false);
    }
  };

  const checkPartnershipStatus = async (marketerId: string): Promise<void> => {
    try {
      const userString = await AsyncStorage.getItem('user');
      if (!userString) {
        setPartnershipStatus(null);
        return;
      }
      const user = JSON.parse(userString) as User;
      
      // Get business ID
      const businessRes = await apiClient.get(`/api/business/${user.id}`);
      
      if (!businessRes.data?.business?.id) {
        setPartnershipStatus(null);
        return;
      }
      
      const businessId = businessRes.data.business.id;
      
      // Check if partnership request exists
      const partnershipRes = await apiClient.get(`/api/partnerships/business/${businessId}/requests`);
      
      if (partnershipRes.data?.requests) {
        const existingRequest = (partnershipRes.data.requests as any[]).find(
          (req: any) => req.marketerId === marketerId
        );
        
        if (existingRequest) {
          setPartnershipStatus(existingRequest.status as PartnershipStatus);
        } else {
          setPartnershipStatus(null);
        }
      } else {
        setPartnershipStatus(null);
      }
    } catch (error) {
      setPartnershipStatus(null);
    }
  };

  const checkIfSaved = async (id: string): Promise<void> => {
    try {
      // apiClient handles authorization automatically, no need for manual headers
      const response = await apiClient.get(`/api/business/saved-marketers/${id}/check`);
      if (response.data.success) {
        setIsSaved(response.data.isSaved || false);
      }
    } catch (error) {
      // Marketer might not be saved, which is fine
      setIsSaved(false);
    }
  };

  const handleSaveMarketer = async (): Promise<void> => {
    if (!marketer) return;
    
    setSaving(true);
    try {
      if (isSaved) {
        // Unsave marketer
        await apiClient.delete(`/api/business/saved-marketers/${marketer.id}`);
      } else {
        // Save marketer
        await apiClient.post('/api/business/saved-marketers', { marketerId: marketer.id });
      }
      
      setIsSaved(!isSaved);
      showDialog({
        title: 'Success',
        message: isSaved ? 'Marketer removed from saved list' : 'Marketer saved successfully',
        buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
      });
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to save marketer',
        buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPartnership = async (): Promise<void> => {
    if (!marketer) return;
    
    // First check business status
    try {
      const userString = await AsyncStorage.getItem('user');
      if (!userString) {
        showDialog({
          title: 'Error',
          message: 'User not found',
          buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
        });
        return;
      }
      const user = JSON.parse(userString) as User;
      
      // Get business data to check status
      const businessRes = await apiClient.get(`/api/business/${user.id}`);
      
      if (!businessRes.data?.business?.id) {
        showDialog({
          title: 'Error',
          message: 'Business profile not found',
          buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
        });
        return;
      }
      
      const businessStatus = (businessRes.data.business.status as string)?.toLowerCase();
      
      // Check if business is approved
      if (businessStatus !== 'approved') {
        showDialog({
          title: 'Approval Required',
          message: 'Your business profile needs to be approved before you can send partnership requests. Please wait for admin approval.',
          buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
        });
        return;
      }
      
      // Business is approved, show confirmation dialog
      showDialog({
        title: 'Request Partnership',
        message: `Are you sure you want to send a partnership request to ${marketer.name}?`,
        buttons: [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => {}
          },
          {
            text: 'Send Request',
            style: 'default',
            onPress: async () => {
              hideDialog(); // Close confirmation dialog first
              setRequestingPartnership(true);
              try {
                await apiClient.post('/api/partnerships/request', {
                  marketerId: marketer.id,
                  businessId: businessRes.data.business.id,
                });
                
              // Update partnership status
              setPartnershipStatus('pending');
              
              showDialog({
                title: 'Success',
                message: 'Partnership request sent successfully!',
                buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
              });
              } catch (error: any) {
                if (error.response?.status === 400) {
                  showDialog({
                    title: 'Error',
                    message: error.response.data.message || 'Partnership request already exists',
                    buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
                  });
                } else {
                  showDialog({
                    title: 'Error',
                    message: 'Failed to send partnership request',
                    buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
                  });
                }
              } finally {
                setRequestingPartnership(false);
              }
            },
          },
        ],
      });
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to verify business status. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: () => {} }]
      });
    }
  };

  const handleContact = (): void => {
    if (!marketer) return;
    navigation.navigate('NewChat' as any, {
      recipientId: marketer.id,
      recipientName: marketer.name,
      recipientType: 'marketer',
    });
  };

  const handleShare = async (): Promise<void> => {
    if (!marketer) return;
    try {
      await Share.share({
        message: `Check out ${marketer.name} on Sabito!`,
        url: `https://sabito.com/marketers/${marketer.id}`,
      });
    } catch (error) {
      // Error sharing
    }
  };

  const getInitials = (name: string): string => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const renderRatingStars = (rating: number): React.ReactElement[] => {
    const stars: React.ReactElement[] = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalfStar = (rating || 0) % 1 >= 0.5;
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Star key={i} size={16} color="#F59E0B" fill="#F59E0B" />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <Star key={i} size={16} color="#F59E0B" fill="#F59E0B" />
        );
      } else {
        stars.push(
          <Star key={i} size={16} color="#D1D5DB" fill="none" />
        );
      }
    }
    return stars;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading marketer profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!marketer) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Marketer not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const {
    name,
    profileImage,
    bio,
    location,
    city,
    country,
    averageRating = 0,
    totalRatings = 0,
    totalReferrals = 0,
    totalEarnings = 0,
    conversionRate = 0,
    yearsExperience = 0,
    responseTimeMinutes = 0,
    industryExpertise = [],
    skills = [],
    languages = [],
    certifications = [],
    isTopMarketer = false,
    isFounder = false,
    subscriptionPlan,
    email,
    phone,
    website,
  } = marketer;

  const displayLocation = location || [city, country].filter(Boolean).join(', ');
  const rating = Number(averageRating) || 0;
  const reviews = Number(totalRatings) || 0;
  const isProfessional = subscriptionPlan === 'professional';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Marketer Profile</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Share2 size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={[styles.heroCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.heroContent}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.APP_GREEN }]}>
                  <Text style={styles.avatarText}>{getInitials(name)}</Text>
                </View>
              )}
            </View>

            {/* Name and Badges */}
            <View style={styles.nameSection}>
              <View style={styles.nameRow}>
                <Text style={[styles.marketerName, { color: colors.text }]}>{name}</Text>
                {isTopMarketer && (
                  <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                    <Award size={10} color="#FFF" />
                    <Text style={styles.badgeText}>TOP</Text>
                  </View>
                )}
                {isProfessional && !isTopMarketer && (
                  <View style={[styles.badge, { backgroundColor: '#8B5CF6' }]}>
                    <Text style={styles.badgeText}>PRO</Text>
                  </View>
                )}
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <View style={styles.starsRow}>
                  {renderRatingStars(rating)}
                </View>
                <Text style={[styles.ratingText, { color: colors.text }]}>
                  {rating.toFixed(1)}
                </Text>
                <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>
                  ({reviews > 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews} referrals)
                </Text>
              </View>

              {/* Meta Info */}
              <View style={styles.metaRow}>
                {yearsExperience > 0 && (
                  <>
                    <View style={styles.metaItem}>
                      <TrendingUp size={14} color={colors.iconSecondary} />
                      <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                        {yearsExperience}+ yrs
                      </Text>
                    </View>
                    <Text style={[styles.metaDivider, { color: colors.textSecondary }]}>•</Text>
                  </>
                )}
                {displayLocation && (
                  <>
                    <View style={styles.metaItem}>
                      <MapPin size={14} color={colors.iconSecondary} />
                      <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                        {displayLocation}
                      </Text>
                    </View>
                    {industryExpertise.length > 0 && (
                      <Text style={[styles.metaDivider, { color: colors.textSecondary }]}>•</Text>
                    )}
                  </>
                )}
                {industryExpertise.length > 0 && (
                  <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {industryExpertise.slice(0, 2).join(', ')}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
              style={[
              styles.primaryButton, 
              { 
                backgroundColor: partnershipStatus === 'pending' 
                  ? (isDark ? colors.backgroundSecondary : '#F3F4F6')
                  : partnershipStatus === 'accepted'
                  ? COLORS.APP_GREEN
                  : COLORS.APP_GREEN,
                borderWidth: partnershipStatus === 'pending' ? 1 : 0,
                borderColor: partnershipStatus === 'pending' ? colors.border : 'transparent',
              }
            ]}
            onPress={handleRequestPartnership}
            disabled={requestingPartnership || partnershipStatus === 'pending' || partnershipStatus === 'accepted'}
          >
            {requestingPartnership ? (
              <ActivityIndicator size="small" color={partnershipStatus === 'pending' ? colors.text : COLORS.WHITE} />
            ) : (
              <>
                {partnershipStatus === 'pending' ? (
                  <CheckCircle size={18} color={COLORS.APP_GREEN} />
                ) : partnershipStatus === 'accepted' ? (
                  <CheckCircle size={18} color={COLORS.WHITE} />
                ) : (
                  <Briefcase size={18} color={COLORS.WHITE} />
                )}
                <Text style={[
                  styles.primaryButtonText,
                  (partnershipStatus === 'pending' || partnershipStatus === 'accepted') && { color: partnershipStatus === 'pending' ? COLORS.APP_GREEN : COLORS.WHITE }
                ]}>
                  {partnershipStatus === 'pending' 
                    ? 'Request Sent' 
                    : partnershipStatus === 'accepted'
                    ? 'Partnership Accepted'
                    : 'Request Partnership'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { 
              backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
              borderColor: colors.border 
            }]}
            onPress={handleContact}
          >
            <MessageCircle size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { 
              backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
              borderColor: colors.border 
            }]}
            onPress={handleSaveMarketer}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.APP_GREEN} />
            ) : (
              <Heart size={18} color={isSaved ? COLORS.APP_GREEN : colors.text} fill={isSaved ? COLORS.APP_GREEN : 'none'} />
            )}
          </TouchableOpacity>
        </View>

        {/* About Section */}
        {bio && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              About {name.split(' ')[0]}
            </Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.bioText, { color: colors.text }]}>{bio}</Text>
            </View>
          </View>
        )}

        {/* Core Expertise */}
        {skills.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Core Expertise</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.expertiseGrid}>
                {skills.map((skill, index) => (
                  <View
                    key={index}
                    style={[styles.expertiseItem, { 
                      backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                      borderColor: colors.border 
                    }]}
                  >
                    <Target size={16} color={COLORS.APP_GREEN} />
                    <Text style={[styles.expertiseText, { color: colors.text }]}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Performance Metrics */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Performance Metrics</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Real results delivered by {name.split(' ')[0]}
          </Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.metricsGrid}>
              <View style={[styles.metricItem, { borderBottomColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Referrals</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{totalReferrals || 0}</Text>
              </View>
              <View style={[styles.metricItem, { borderBottomColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Conversion Rate</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {conversionRate ? `${conversionRate.toFixed(2)}%` : 'N/A'}
                </Text>
              </View>
              <View style={[styles.metricItem, { borderBottomColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Earnings</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  ₵{(totalEarnings || 0).toFixed(2)}
                </Text>
              </View>
              {yearsExperience > 0 && (
                <View style={[styles.metricItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Experience</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {yearsExperience}+ years
                  </Text>
                </View>
              )}
              {responseTimeMinutes > 0 && (
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Response Time</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {responseTimeMinutes < 60 
                      ? `${responseTimeMinutes}m`
                      : responseTimeMinutes < 1440
                      ? `${Math.floor(responseTimeMinutes / 60)}h`
                      : `${Math.floor(responseTimeMinutes / 1440)}d`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Industries & Niches */}
        {industryExpertise.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Industries & Niches</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.tagsContainer}>
                {industryExpertise.map((industry, index) => (
                  <View
                    key={index}
                    style={[styles.tag, { 
                      backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#F0FDF4',
                      borderColor: isDark ? 'rgba(31, 185, 0, 0.3)' : '#BBF7D0' 
                    }]}
                  >
                    <Text style={[styles.tagText, { color: isDark ? COLORS.APP_GREEN : '#065F46' }]}>
                      {industry}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Languages</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.tagsContainer}>
                {languages.map((language, index) => (
                  <View
                    key={index}
                    style={[styles.tag, { 
                      backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                      borderColor: colors.border 
                    }]}
                  >
                    <Text style={[styles.tagText, { color: colors.text }]}>{language}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Certifications & Credentials</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Validated skills and professional achievements
            </Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {certifications.map((cert, index) => (
                <View key={index} style={[styles.certificationItem, { borderBottomColor: colors.border }]}>
                  <View style={[styles.certIcon, { backgroundColor: COLORS.APP_GREEN }]}>
                    <CheckCircle size={16} color={COLORS.WHITE} />
                  </View>
                  <View style={styles.certContent}>
                    <Text style={[styles.certName, { color: colors.text }]}>{cert}</Text>
                    <Text style={[styles.certStatus, { color: colors.textSecondary }]}>
                      Verified Certification
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Custom Dialog */}
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
  container: {
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
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  shareButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
  },
  heroCard: {
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  heroContent: {
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  nameSection: {
    alignItems: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  marketerName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  reviewCount: {
    fontSize: FONT_SIZES.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FONT_SIZES.sm,
  },
  metaDivider: {
    fontSize: FONT_SIZES.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
  sectionCard: {
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
  },
  bioText: {
    fontSize: FONT_SIZES.md,
    lineHeight: 24,
  },
  expertiseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  expertiseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
    borderWidth: 1,
  },
  expertiseText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  metricsGrid: {
    gap: SPACING.md,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  metricLabel: {
    fontSize: FONT_SIZES.md,
  },
  metricValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.normal,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tag: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  certificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    marginBottom: SPACING.md,
  },
  certIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  certContent: {
    flex: 1,
  },
  certName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  certStatus: {
    fontSize: FONT_SIZES.xs,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    marginBottom: SPACING.md,
  },
  contactText: {
    fontSize: FONT_SIZES.md,
    flex: 1,
  },
});

export default DiscoverMarketerDetailsScreen;






