import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Building2, 
  MapPin, 
  Globe, 
  Mail, 
  Phone, 
  Briefcase,
  Users,
  CreditCard,
  Edit3,
  Camera
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { requestCameraPermission, requestMediaLibraryPermission, showImageSourceOptions } from '../../services/permissions';
import { uploadBusinessLogo } from '../../services/imageUpload';
import EditOrganisationModal from '../../components/business/EditOrganisationModal';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

type OrganisationScreenProps = RootStackScreenProps<'Organisation'>;

interface BusinessWithUserID extends Business {
  userID?: string;
  marketerCount?: number;
}

const OrganisationScreen: React.FC<OrganisationScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [business, setBusiness] = useState<BusinessWithUserID | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  useEffect(() => {
    fetchBusinessProfile();
  }, []);

  const fetchBusinessProfile = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const userData = await AsyncStorage.getItem('user');
      
      if (!userData) return;
      
      const user = JSON.parse(userData);

      const response = await apiClient.get(`/api/business/${user.id}`);

      if (response.data.business) {
        setBusiness(response.data.business as BusinessWithUserID);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  const handleTakePhoto = async (): Promise<void> => {
    try {
      // Request camera permission first
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        showDialog({
          title: 'Camera Permission Required',
          message: 'Please grant camera permission to take photos. You can enable it in your device settings.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
        return;
      }
      
      // Launch camera with proper error handling
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        await processSelectedImage(result.assets[0]);
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error occurred';
      
      // Don't show error if user canceled
      if (!errorMessage.includes('User canceled') && !errorMessage.includes('cancelled')) {
        showDialog({
          title: 'Camera Error',
          message: errorMessage.includes('permission') || errorMessage.includes('Permission')
            ? 'Camera permission is required. Please enable it in your device settings.'
            : 'Failed to open camera. Please try again.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    }
  };

  const handleChooseFromLibrary = async (): Promise<void> => {
    try {
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) return;
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        await processSelectedImage(result.assets[0]);
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to select image. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    }
  };

  const processSelectedImage = async (selectedImage: ImagePicker.ImagePickerAsset): Promise<void> => {
    try {
      setIsUploadingLogo(true);
      const imageUri = selectedImage.uri;

      // Check if business userID is available
      if (!business?.userID) {
        showDialog({
          title: 'Error',
          message: 'Unable to identify business. Please try again.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
        return;
      }

      // Upload and compress image
      const base64Image = await uploadBusinessLogo(imageUri, business.userID);

      // Update business logo in backend
      await apiClient.put(`/api/business/${business.userID}`, { logo: base64Image });
      
      // Update local state
      setBusiness({ ...business, logo: base64Image });
      
      // Show success feedback
      showDialog({
        title: 'Success',
        message: 'Logo updated successfully!',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update logo. Please try again.';
      showDialog({
        title: 'Update Failed',
        message: errorMessage,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleChangeLogo = async (): Promise<void> => {
    showImageSourceOptions(handleTakePhoto, handleChooseFromLibrary);
  };

  const handleSaveOrganisation = async (formData: Partial<BusinessWithUserID>): Promise<void> => {
    try {
      if (!business?.userID) {
        throw new Error('Business userID is required');
      }
      await apiClient.put(`/api/business/${business.userID}`, formData);
      // Update local state
      setBusiness({ ...business, ...formData });
    } catch (error) {
      throw error;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading organisation details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Organisation</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No organisation profile found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const servicesArray = Array.isArray(business.services) 
    ? business.services 
    : (typeof business.services === 'string' ? business.services.split(',').map(s => s.trim()) : []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Organisation</Text>
        <TouchableOpacity 
          style={styles.editHeaderButton}
          onPress={() => setShowEditModal(true)}
        >
          <Edit3 size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {/* Business Name Card */}
        <View style={[styles.businessHeader, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.logoWrapper}>
            <View style={styles.logoContainer}>
              {business.logo ? (
                <Image source={{ uri: business.logo }} style={styles.logo} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{business.businessName?.charAt(0)?.toUpperCase() || 'B'}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity 
              style={[styles.cameraButton, { borderColor: colors.cardBackground }]}
              onPress={handleChangeLogo}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <Camera size={16} color={COLORS.WHITE} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.businessInfo}>
            <Text style={[styles.businessName, { color: colors.text }]}>{business.businessName}</Text>
            <Text style={[styles.businessDescription, { color: colors.textSecondary }]} numberOfLines={2}>
              {business.description}
            </Text>
          </View>
        </View>

        {/* Business Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Business Information</Text>
          <View style={[styles.detailsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Briefcase size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Industry</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{business.industry || 'Not specified'}</Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Mail size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{business.email || 'N/A'}</Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Phone size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Phone</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{business.phone || 'N/A'}</Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <MapPin size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Address</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{business.address || 'N/A'}</Text>
              </View>
            </View>

            {business.website && (
              <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.detailIconContainer, { 
                  backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}>
                  <Globe size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Website</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{business.website}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Commission Rates */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Commission Structure</Text>
          <View style={[styles.detailsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <CreditCard size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>New Clients</Text>
                <Text style={[styles.detailValueHighlight, { color: COLORS.APP_GREEN }]}>
                  {business.commissionRateNew || 0}%
                </Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <CreditCard size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Returning Clients</Text>
                <Text style={[styles.detailValueHighlight, { color: COLORS.APP_GREEN }]}>
                  {business.commissionRateReturning || 0}%
                </Text>
              </View>
            </View>

            <View style={[styles.detailItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Users size={20} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Marketer Capacity</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{business.marketerCount || 0} marketers</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Services */}
        {servicesArray.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Services Offered</Text>
            <View style={styles.servicesGroup}>
              {servicesArray.map((service, index) => (
                <View key={index} style={[styles.serviceChip, { 
                  backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
                }]}>
                  <Text style={styles.serviceText}>{service}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Edit Organisation Modal */}
      <EditOrganisationModal
        visible={showEditModal}
        business={business}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveOrganisation}
      />

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  editHeaderButton: {
    padding: SPACING.xs,
  },
  scrollView: {
    flex: 1,
  },
  businessHeader: {
    flexDirection: 'row',
    padding: 16,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: SPACING.md,
  },
  logoWrapper: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  logoContainer: {
    position: 'relative',
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  businessDescription: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    paddingHorizontal: 16,
    paddingVertical: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailsGroup: {
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    marginTop: 4,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  detailValueHighlight: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  servicesGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    paddingHorizontal: 16,
  },
  serviceChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    marginBottom: SPACING.xs,
  },
  serviceText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.APP_GREEN,
  },
});

export default OrganisationScreen;






