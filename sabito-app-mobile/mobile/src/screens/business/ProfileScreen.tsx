import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, User, Mail, Phone, Calendar, LogOut, ArrowRight, GraduationCap, Briefcase, Globe, Award, FileText, ChevronDown, X, Plus, Check, Lock, CreditCard, ChevronRight } from 'lucide-react-native';
import { TextInput, Button, Portal } from 'react-native-paper';
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
import { uploadProfileImage } from '../../services/imageUpload';
import { getProfessionalProfile, updateVisibility } from '../../api/professionalPlan';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType } from '../../types/api';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

// Professional Profile Constants
const EDUCATION_OPTIONS = [
  { label: 'High School', value: 'high_school' },
  { label: 'Diploma', value: 'diploma' },
  { label: "Bachelor's Degree", value: 'bachelors' },
  { label: "Master's Degree", value: 'masters' },
  { label: 'PhD', value: 'phd' },
  { label: 'Other', value: 'other' },
] as const;

const LANGUAGE_PROFICIENCY_OPTIONS = [
  { label: 'Basic', value: 'basic' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Fluent', value: 'fluent' },
  { label: 'Native', value: 'native' },
] as const;

const INDUSTRY_OPTIONS = [
  { label: 'Technology', value: 'Technology' },
  { label: 'E-commerce', value: 'E-commerce' },
  { label: 'Fintech', value: 'Fintech' },
  { label: 'Real Estate', value: 'Real Estate' },
  { label: 'Healthcare', value: 'Healthcare' },
  { label: 'Education', value: 'Education' },
  { label: 'Travel & Hospitality', value: 'Travel & Hospitality' },
  { label: 'Food & Beverage', value: 'Food & Beverage' },
  { label: 'Fashion & Beauty', value: 'Fashion & Beauty' },
  { label: 'Media & Entertainment', value: 'Media & Entertainment' },
] as const;

const SKILL_OPTIONS = [
  { label: 'Social Media Marketing', value: 'Social Media Marketing' },
  { label: 'Content Marketing', value: 'Content Marketing' },
  { label: 'Email Marketing', value: 'Email Marketing' },
  { label: 'SEO', value: 'SEO' },
  { label: 'Paid Ads (Meta / Google)', value: 'Paid Ads' },
  { label: 'Influencer Marketing', value: 'Influencer Marketing' },
  { label: 'Partnerships & BD', value: 'Partnerships & Business Development' },
  { label: 'Community Management', value: 'Community Management' },
  { label: 'Product Marketing', value: 'Product Marketing' },
  { label: 'Affiliate Marketing', value: 'Affiliate Marketing' },
] as const;

interface ProfessionalProfileData {
  educationLevel: string;
  yearsExperience: number;
  bio: string;
  certifications: string[];
  languages: string[];
  languageProficiency: Record<string, string>;
  industryExpertise: string[];
  skills: string[];
  availability: string;
  profileCompleteness: number;
}

const getDefaultProfileState = (): ProfessionalProfileData => ({
  educationLevel: '',
  yearsExperience: 0,
  bio: '',
  certifications: [],
  languages: [],
  languageProficiency: {},
  industryExpertise: [],
  skills: [],
  availability: 'available',
  profileCompleteness: 0,
});

const normalizeProfileData = (profile: any = {}): ProfessionalProfileData => ({
  educationLevel: profile.educationLevel || '',
  yearsExperience: profile.yearsExperience || 0,
  bio: profile.bio || '',
  certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
  languages: Array.isArray(profile.languages) ? profile.languages : [],
  languageProficiency: profile.languageProficiency || {},
  industryExpertise: Array.isArray(profile.industryExpertise) ? profile.industryExpertise : [],
  skills: Array.isArray(profile.skills) ? profile.skills : [],
  availability: profile.availability || 'available',
  profileCompleteness: profile.profileCompleteness || 0,
});

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);

  // Professional Profile State (for marketers only) - editing done on separate screen
  const [isLoadingProfessionalProfile, setIsLoadingProfessionalProfile] = useState<boolean>(false);
  const [professionalProfileData, setProfessionalProfileData] = useState<ProfessionalProfileData>(() => getDefaultProfileState());
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState<boolean>(false);

  useEffect(() => {
    const fetchUser = async () => {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData) as UserType;
        setUser(parsedUser);
        setPhone(parsedUser.phone || '');
        
        // Fetch professional profile if marketer
        if (parsedUser.accountType === 'marketer') {
          fetchProfessionalProfile();
        }
      }
    };
    fetchUser();
  }, []);

  const fetchProfessionalProfile = async (): Promise<void> => {
    try {
      setIsLoadingProfessionalProfile(true);
      const result = await getProfessionalProfile();
      
      if (result.success) {
        const normalizedProfile = normalizeProfileData(result.data);
        setProfessionalProfileData(normalizedProfile);
      }
    } catch (error) {
      // Silently fail - not critical
    } finally {
      setIsLoadingProfessionalProfile(false);
    }
  };


  const addCertification = (): void => {
    if (newCertification.trim() && professionalProfileData.certifications.length < 10) {
      setProfessionalProfileData(prev => ({
        ...prev,
        certifications: [...prev.certifications, newCertification.trim()],
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index: number): void => {
    setProfessionalProfileData(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index),
    }));
  };

  const addLanguage = (): void => {
    if (newLanguage.trim() && !professionalProfileData.languages.includes(newLanguage.trim())) {
      setProfessionalProfileData(prev => ({
        ...prev,
        languages: [...prev.languages, newLanguage.trim()],
        languageProficiency: {
          ...prev.languageProficiency,
          [newLanguage.trim()]: newLanguageProficiency,
        },
      }));
      setNewLanguage('');
      setNewLanguageProficiency('fluent');
    }
  };

  const removeLanguage = (language: string): void => {
    const updatedProficiency = { ...professionalProfileData.languageProficiency };
    delete updatedProficiency[language];

    setProfessionalProfileData(prev => ({
      ...prev,
      languages: prev.languages.filter(l => l !== language),
      languageProficiency: updatedProficiency,
    }));
  };

  const getEducationLabel = (value: string): string => {
    const option = EDUCATION_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value || 'Not specified';
  };

  const getLanguageProficiencyLabel = (value: string): string => {
    const option = LANGUAGE_PROFICIENCY_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value || 'fluent';
  };

  const handleVisibilityToggle = async (isPublic: boolean): Promise<void> => {
    if (!user) return;
    
    try {
      setIsUpdatingVisibility(true);
      const newVisibility = isPublic ? 'public' : 'private';
      
      const result = await updateVisibility(newVisibility);
      
      if (result.success) {
        // Update local state
        const updatedUser = { ...user, visibilityMode: newVisibility };
        setUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Show success message
        showDialog({
          title: 'Visibility Updated',
          message: isPublic 
            ? 'Your profile is now public. Businesses can find you in the marketplace!'
            : 'Your profile is now private. Only you can initiate partnerships.',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to update visibility',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error) {
      showDialog({
        title: 'Error',
        message: 'Failed to update visibility. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleUpdatePhone = async (): Promise<void> => {
    if (!phone.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiClient.patch('/api/users/profile', { phone: phone.trim() });
      
      if (response.data.success) {
        const updatedUser = { ...user, phone: phone.trim() } as UserType;
        setUser(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setIsEditingPhone(false);
        
        showDialog({
          title: 'Success',
          message: 'Phone number updated successfully!',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to update phone number',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImagePicker = async (): Promise<void> => {
    try {
      const hasPermission = await showImageSourceOptions();
      if (!hasPermission) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingImage(true);
        const uploadResult = await uploadProfileImage(result.assets[0].uri);
        
        if (uploadResult.success && uploadResult.imageUrl) {
          const updatedUser = { ...user, profileImage: uploadResult.imageUrl } as UserType;
          setUser(updatedUser);
          await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        } else {
          showDialog({
            title: 'Error',
            message: 'Failed to upload image',
            buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
          });
        }
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.message || 'Failed to pick image',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleLogout = (): void => {
    showDialog({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: hideDialog },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('user');
            await AsyncStorage.removeItem('accessToken');
            await AsyncStorage.removeItem('refreshToken');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    });
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  const isMarketer = user.accountType === 'marketer';

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView 
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Image Section */}
          <View style={styles.profileImageSection}>
            <TouchableOpacity onPress={handleImagePicker} disabled={isUploadingImage}>
              <View style={styles.profileImageContainer}>
                {user.profileImage ? (
                  <Image source={{ uri: user.profileImage }} style={styles.profileImage} />
                ) : (
                  <View style={[styles.profileImagePlaceholder, { backgroundColor: COLORS.APP_GREEN }]}>
                    <Text style={styles.profileImageText}>{user.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
                  </View>
                )}
                {isUploadingImage && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color={COLORS.WHITE} />
                  </View>
                )}
                <View style={[styles.cameraIconContainer, { backgroundColor: COLORS.APP_GREEN }]}>
                  <Camera size={16} color={COLORS.WHITE} strokeWidth={2} />
                </View>
              </View>
            </TouchableOpacity>
            <Text style={[styles.userName, { color: colors.text }]}>{user.name}</Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
          </View>

          {/* Basic Info Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Basic Information</Text>
            <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: isDark ? 'transparent' : '#F0FDF4', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
                  <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{user.email}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: isDark ? 'transparent' : '#F0FDF4', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
                  <Phone size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Phone</Text>
                  {isEditingPhone ? (
                    <View style={styles.phoneEditContainer}>
                      <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        mode="outlined"
                        keyboardType="phone-pad"
                        style={styles.phoneInput}
                        outlineColor={colors.border}
                        activeOutlineColor={COLORS.APP_GREEN}
                        textColor={colors.text}
                      />
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: COLORS.APP_GREEN }]}
                        onPress={handleUpdatePhone}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color={COLORS.WHITE} />
                        ) : (
                          <Check size={18} color={COLORS.WHITE} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cancelButton, { borderColor: colors.border }]}
                        onPress={() => {
                          setIsEditingPhone(false);
                          setPhone(user.phone || '');
                        }}
                      >
                        <X size={18} color={colors.text} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.phoneDisplayContainer}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{user.phone || 'Not set'}</Text>
                      <TouchableOpacity
                        onPress={() => setIsEditingPhone(true)}
                        style={styles.editIconButton}
                      >
                        <Text style={[styles.editText, { color: COLORS.APP_GREEN }]}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Visibility Toggle for Marketers */}
          {isMarketer && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Visibility</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <View style={styles.visibilityRow}>
                  <View style={styles.visibilityContent}>
                    <View style={[styles.infoIcon, { backgroundColor: isDark ? 'transparent' : '#F0FDF4', borderWidth: isDark ? 1 : 0, borderColor: colors.border }]}>
                      <Globe size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />
                    </View>
                    <View style={styles.visibilityText}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>Public Profile</Text>
                      <Text style={[styles.visibilityDescription, { color: colors.textSecondary }]}>
                        {user.visibilityMode === 'public' 
                          ? 'Your profile is visible to businesses in the marketplace'
                          : 'Your profile is private. Only you can initiate partnerships.'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={user.visibilityMode === 'public'}
                    onValueChange={handleVisibilityToggle}
                    disabled={isUpdatingVisibility}
                    trackColor={{ false: colors.border, true: COLORS.APP_GREEN }}
                    thumbColor={COLORS.WHITE}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Professional Profile Section for Marketers */}
          {isMarketer && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Profile</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.editProfileButton}
                  onPress={() => navigation.navigate('MarketerProfessionalProfile' as any)}
                >
                  <Text style={[styles.editProfileButtonText, { color: COLORS.APP_GREEN }]}>
                    Edit Professional Profile
                  </Text>
                  <ChevronRight size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Logout Button */}
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: colors.border }]}
            onPress={handleLogout}
          >
            <LogOut size={20} color={COLORS.ERROR} strokeWidth={2} />
            <Text style={[styles.logoutText, { color: COLORS.ERROR }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>


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
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  profileImageSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.APP_GREEN,
  },
  profileImageText: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.WHITE,
  },
  userName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  userEmail: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
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
    marginBottom: SPACING.lg,
  },
  infoIcon: {
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
  phoneEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  phoneInput: {
    flex: 1,
  },
  phoneDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editIconButton: {
    padding: SPACING.xs,
  },
  editText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visibilityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  visibilityText: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  visibilityDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginTop: 4,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  editProfileButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  logoutText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ERROR,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  professionalModalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    width: '100%',
    backgroundColor: COLORS.WHITE,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: SPACING.xl,
  },
  modalFooter: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.STROKE_COLOR,
  },
  saveButtonFull: {
    width: '100%',
  },
});

export default ProfileScreen;






