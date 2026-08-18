import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  GraduationCap,
  Briefcase,
  Globe,
  Award,
  FileText,
  ChevronDown,
  X,
  Plus,
  Check,
  Sparkles,
} from 'lucide-react-native';
import { TextInput, Button } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import MultiSelectModal from '../../components/common/MultiSelectModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import {
  getProfessionalProfile,
  updateEnhancedProfile,
} from '../../api/professionalPlan';
import type { RootStackScreenProps } from '../../types/navigation';

type MarketerProfessionalProfileScreenProps = RootStackScreenProps<'MarketerProfessionalProfile'>;

type EducationLevel = 'high_school' | 'diploma' | 'bachelors' | 'masters' | 'phd' | 'other';
type LanguageProficiency = 'basic' | 'intermediate' | 'fluent' | 'native';
type Availability = 'available' | 'unavailable';

interface Option {
  label: string;
  value: string;
}

interface ProfileData {
  educationLevel: string;
  yearsExperience: number;
  bio: string;
  certifications: string[];
  languages: string[];
  languageProficiency: Record<string, string>;
  industryExpertise: string[];
  skills: string[];
  availability: Availability;
  profileCompleteness: number;
}

const EDUCATION_OPTIONS: Option[] = [
  { label: 'High School', value: 'high_school' },
  { label: 'Diploma', value: 'diploma' },
  { label: "Bachelor's Degree", value: 'bachelors' },
  { label: "Master's Degree", value: 'masters' },
  { label: 'PhD', value: 'phd' },
  { label: 'Other', value: 'other' },
];

const LANGUAGE_PROFICIENCY_OPTIONS: Option[] = [
  { label: 'Basic', value: 'basic' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Fluent', value: 'fluent' },
  { label: 'Native', value: 'native' },
];

const INDUSTRY_OPTIONS: Option[] = [
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
];

const SKILL_OPTIONS: Option[] = [
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
];

const getDefaultProfileState = (): ProfileData => ({
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

const normalizeProfileData = (profile: any = {}): ProfileData => ({
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

const MarketerProfessionalProfileScreen: React.FC<MarketerProfessionalProfileScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isProfileSectionOpen, setIsProfileSectionOpen] = useState<boolean>(false);
  const [profileData, setProfileData] = useState<ProfileData>(() => getDefaultProfileState());
  const [initialProfileData, setInitialProfileData] = useState<ProfileData>(() => getDefaultProfileState());

  // Form inputs
  const [newCertification, setNewCertification] = useState<string>('');
  const [newLanguage, setNewLanguage] = useState<string>('');
  const [newLanguageProficiency, setNewLanguageProficiency] = useState<string>('fluent');

  // Modals
  const [showEducationModal, setShowEducationModal] = useState<boolean>(false);
  const [showLanguageProficiencyModal, setShowLanguageProficiencyModal] = useState<boolean>(false);
  const [showIndustryModal, setShowIndustryModal] = useState<boolean>(false);
  const [showSkillsModal, setShowSkillsModal] = useState<boolean>(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const result = await getProfessionalProfile();
      
      if (result.success && result.data) {
        const normalizedProfile = normalizeProfileData(result.data);
        setProfileData(normalizedProfile);
        setInitialProfileData(normalizedProfile);
        
        // Auto-open form if profile is empty
        const hasData = normalizedProfile.educationLevel || 
                      normalizedProfile.bio || 
                      normalizedProfile.certifications.length > 0 ||
                      normalizedProfile.languages.length > 0;
        setIsProfileSectionOpen(!hasData);
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to load profile',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Unable to load professional profile.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      const result = await updateEnhancedProfile(profileData);
      
      if (result.success) {
        showDialog({
          title: 'Success',
          message: 'Professional profile updated successfully!',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
        await fetchProfile();
        setIsProfileSectionOpen(false);
      } else {
        showDialog({
          title: 'Error',
          message: result.error || 'Failed to update profile',
          buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
        });
      }
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to save profile. Please try again.',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addCertification = (): void => {
    if (newCertification.trim() && profileData.certifications.length < 10) {
      setProfileData(prev => ({
        ...prev,
        certifications: [...prev.certifications, newCertification.trim()],
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index: number): void => {
    setProfileData(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index),
    }));
  };

  const addLanguage = (): void => {
    if (newLanguage.trim() && !profileData.languages.includes(newLanguage.trim())) {
      setProfileData(prev => ({
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
    const updatedProficiency = { ...profileData.languageProficiency };
    delete updatedProficiency[language];

    setProfileData(prev => ({
      ...prev,
      languages: prev.languages.filter(l => l !== language),
      languageProficiency: updatedProficiency,
    }));
  };

  const getEducationLabel = (value: string): string => {
    const option = EDUCATION_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value || 'Not specified';
  };

  const getLanguageProficiencyLabel = (value?: string): string => {
    const option = LANGUAGE_PROFICIENCY_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value || 'fluent';
  };

  const profileCompleteness = Math.max(
    0,
    Math.min(100, Math.round(profileData.profileCompleteness || 0))
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Professional Profile
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile Overview Card */}
          <View style={[styles.overviewCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.overviewTitle, { color: colors.text }]}>Profile Overview</Text>
            <Text style={[styles.overviewSubtitle, { color: colors.textSecondary }]}>
              Complete your details to unlock public visibility and better-fit partnerships.
            </Text>

            {/* Profile Completeness */}
            <View style={styles.completenessContainer}>
              <View style={styles.completenessHeader}>
                <Text style={[styles.completenessLabel, { color: COLORS.APP_GREEN }]}>
                  PROFILE COMPLETENESS
                </Text>
                <Text style={[styles.completenessValue, { color: COLORS.APP_GREEN }]}>
                  {profileCompleteness}%
                </Text>
              </View>
              <View style={[styles.completenessBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.completenessFill,
                    { width: `${profileCompleteness}%`, backgroundColor: COLORS.APP_GREEN },
                  ]}
                />
              </View>
              <Text style={[styles.completenessNote, { color: colors.textSecondary }]}>
                Complete profile increases visibility and partnership opportunities
              </Text>
            </View>

            {/* Display existing profile data */}
            {(profileData.educationLevel || profileData.bio || profileData.certifications.length > 0) && (
              <View style={styles.existingDataContainer}>
                {profileData.educationLevel && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Education</Text>
                    <Text style={[styles.dataValue, { color: colors.text }]}>
                      {getEducationLabel(profileData.educationLevel)}
                    </Text>
                  </View>
                )}
                {profileData.yearsExperience > 0 && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Experience</Text>
                    <Text style={[styles.dataValue, { color: colors.text }]}>
                      {profileData.yearsExperience}+ years
                    </Text>
                  </View>
                )}
                {profileData.certifications.length > 0 && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Certifications</Text>
                    <View style={styles.tagsContainer}>
                      {profileData.certifications.map((cert, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>{cert}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {profileData.languages.length > 0 && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Languages</Text>
                    <View style={styles.tagsContainer}>
                      {profileData.languages.map((lang, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>
                            {lang} ({getLanguageProficiencyLabel(profileData.languageProficiency[lang])})
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {profileData.industryExpertise.length > 0 && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Industries</Text>
                    <View style={styles.tagsContainer}>
                      {profileData.industryExpertise.map((industry, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>{industry}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {profileData.skills.length > 0 && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Skills</Text>
                    <View style={styles.tagsContainer}>
                      {profileData.skills.map((skill, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {profileData.bio && (
                  <View style={styles.dataRow}>
                    <Text style={[styles.dataLabel, { color: colors.textSecondary }]}>Bio</Text>
                    <Text style={[styles.dataValue, { color: colors.text }]}>{profileData.bio}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Banner */}
          <View style={[styles.banner, { backgroundColor: '#052e16' }]}>
            <View style={styles.bannerContent}>
              <Text style={styles.bannerEyebrow}>PROFESSIONAL PROFILE FIELDS</Text>
              <Text style={styles.bannerTitle}>Show businesses what you can do</Text>
              <Text style={styles.bannerSubtitle}>
                Complete these details to boost discovery, AI matches, and trust with potential partners.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bannerButton}
              onPress={() => setIsProfileSectionOpen(!isProfileSectionOpen)}
              activeOpacity={0.8}
            >
              <Text style={styles.bannerButtonText}>
                {isProfileSectionOpen ? 'Hide fields' : 'Set up profile'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Section */}
          {isProfileSectionOpen && (
            <View style={[styles.formCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {/* Education & Experience */}
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                  <GraduationCap size={24} color={COLORS.APP_GREEN} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Education & Experience
                  </Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Education Level *</Text>
                  <TouchableOpacity
                    style={[styles.selectButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setShowEducationModal(true)}
                  >
                    <Text style={[
                      styles.selectButtonText,
                      { color: profileData.educationLevel ? colors.text : colors.textSecondary }
                    ]}>
                      {profileData.educationLevel ? getEducationLabel(profileData.educationLevel) : 'Select education level'}
                    </Text>
                    <ChevronDown size={20} color={colors.iconSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Years of Experience *</Text>
                  <TextInput
                    mode="outlined"
                    value={profileData.yearsExperience.toString()}
                    onChangeText={(text) => {
                      const num = parseInt(text, 10) || 0;
                      setProfileData(prev => ({
                        ...prev,
                        yearsExperience: Math.min(50, Math.max(0, num)),
                      }));
                    }}
                    keyboardType="numeric"
                    placeholder="e.g., 5"
                    style={styles.input}
                    outlineColor={colors.border}
                    activeOutlineColor={COLORS.APP_GREEN}
                    textColor={colors.text}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Certifications</Text>
                  <View style={styles.addItemRow}>
                    <TextInput
                      mode="outlined"
                      value={newCertification}
                      onChangeText={setNewCertification}
                      placeholder="e.g., Google Ads Certified"
                      style={[styles.input, { flex: 1 }]}
                      outlineColor={colors.border}
                      activeOutlineColor={COLORS.APP_GREEN}
                      textColor={colors.text}
                      onSubmitEditing={addCertification}
                    />
                    <TouchableOpacity
                      style={[styles.addButton, { backgroundColor: COLORS.APP_GREEN }]}
                      onPress={addCertification}
                    >
                      <Plus size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  {profileData.certifications.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {profileData.certifications.map((cert, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                          <Text style={[styles.tagText, { color: '#065F46' }]}>{cert}</Text>
                          <TouchableOpacity onPress={() => removeCertification(index)}>
                            <X size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Languages */}
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                  <Globe size={24} color={COLORS.APP_GREEN} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Languages & Communication
                  </Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Languages Spoken *</Text>
                  <View style={styles.addItemRow}>
                    <TextInput
                      mode="outlined"
                      value={newLanguage}
                      onChangeText={setNewLanguage}
                      placeholder="e.g., English"
                      style={[styles.input, { flex: 1 }]}
                      outlineColor={colors.border}
                      activeOutlineColor={COLORS.APP_GREEN}
                      textColor={colors.text}
                    />
                    <TouchableOpacity
                      style={[styles.selectButton, { backgroundColor: colors.background, borderColor: colors.border, minWidth: 120 }]}
                      onPress={() => setShowLanguageProficiencyModal(true)}
                    >
                      <Text style={[styles.selectButtonText, { color: colors.text, fontSize: FONT_SIZES.sm }]}>
                        {getLanguageProficiencyLabel(newLanguageProficiency)}
                      </Text>
                      <ChevronDown size={16} color={colors.iconSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.addButton, { backgroundColor: COLORS.APP_GREEN }]}
                      onPress={addLanguage}
                    >
                      <Plus size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  {profileData.languages.length > 0 && (
                    <View style={styles.languagesList}>
                      {profileData.languages.map((language, index) => (
                        <View key={index} style={[styles.languageItem, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                          <View style={styles.languageInfo}>
                            <Text style={[styles.languageName, { color: colors.text }]}>{language}</Text>
                            <Text style={[styles.languageProficiency, { color: colors.textSecondary }]}>
                              {getLanguageProficiencyLabel(profileData.languageProficiency[language])}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => removeLanguage(language)}>
                            <X size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Expertise & Skills */}
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                  <Award size={24} color={COLORS.APP_GREEN} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Expertise & Skills
                  </Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Industries You Serve *</Text>
                  <TouchableOpacity
                    style={[styles.selectButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setShowIndustryModal(true)}
                  >
                    <Text style={[
                      styles.selectButtonText,
                      { color: profileData.industryExpertise.length > 0 ? colors.text : colors.textSecondary }
                    ]}>
                      {profileData.industryExpertise.length > 0
                        ? `${profileData.industryExpertise.length} ${profileData.industryExpertise.length === 1 ? 'industry' : 'industries'} selected`
                        : 'Select industries you serve'}
                    </Text>
                    <ChevronDown size={20} color={colors.iconSecondary} />
                  </TouchableOpacity>
                  {profileData.industryExpertise.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {profileData.industryExpertise.map((industry, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>{industry}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>Marketing Skills *</Text>
                  <TouchableOpacity
                    style={[styles.selectButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setShowSkillsModal(true)}
                  >
                    <Text style={[
                      styles.selectButtonText,
                      { color: profileData.skills.length > 0 ? colors.text : colors.textSecondary }
                    ]}>
                      {profileData.skills.length > 0
                        ? `${profileData.skills.length} ${profileData.skills.length === 1 ? 'skill' : 'skills'} selected`
                        : 'Select your core marketing skills'}
                    </Text>
                    <ChevronDown size={20} color={colors.iconSecondary} />
                  </TouchableOpacity>
                  {profileData.skills.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {profileData.skills.map((skill, index) => (
                        <View key={index} style={[styles.tag, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={[styles.tagText, { color: colors.text }]}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Professional Bio */}
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                  <FileText size={24} color={COLORS.APP_GREEN} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Professional Bio</Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    Tell businesses about yourself *
                  </Text>
                  <TextInput
                    mode="outlined"
                    value={profileData.bio}
                    onChangeText={(text) => {
                      if (text.length <= 1000) {
                        setProfileData(prev => ({ ...prev, bio: text }));
                      }
                    }}
                    placeholder="Results-driven marketer with 5 years of experience..."
                    multiline
                    numberOfLines={6}
                    style={[styles.input, styles.textArea]}
                    outlineColor={colors.border}
                    activeOutlineColor={COLORS.APP_GREEN}
                    textColor={colors.text}
                  />
                  <Text style={[styles.charCount, { color: colors.textSecondary }]}>
                    {profileData.bio.length}/1000 characters
                  </Text>
                </View>
              </View>

              {/* Save Button */}
              <View style={styles.saveContainer}>
                <Button
                  mode="contained"
                  onPress={handleSave}
                  loading={isSaving}
                  disabled={isSaving}
                  style={[styles.saveButton, { backgroundColor: COLORS.APP_GREEN }]}
                  labelStyle={styles.saveButtonLabel}
                >
                  Save Profile
                </Button>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Education Modal */}
      <Modal
        visible={showEducationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEducationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Education Level</Text>
              <TouchableOpacity onPress={() => setShowEducationModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {EDUCATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border },
                    profileData.educationLevel === option.value && { backgroundColor: '#F0FDF4' },
                  ]}
                  onPress={() => {
                    setProfileData(prev => ({ ...prev, educationLevel: option.value }));
                    setShowEducationModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>
                    {option.label}
                  </Text>
                  {profileData.educationLevel === option.value && (
                    <Check size={20} color={COLORS.APP_GREEN} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Language Proficiency Modal */}
      <Modal
        visible={showLanguageProficiencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageProficiencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Proficiency</Text>
              <TouchableOpacity onPress={() => setShowLanguageProficiencyModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {LANGUAGE_PROFICIENCY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: colors.border },
                    newLanguageProficiency === option.value && { backgroundColor: '#F0FDF4' },
                  ]}
                  onPress={() => {
                    setNewLanguageProficiency(option.value);
                    setShowLanguageProficiencyModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>
                    {option.label}
                  </Text>
                  {newLanguageProficiency === option.value && (
                    <Check size={20} color={COLORS.APP_GREEN} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Industry Multi-Select Modal */}
      <MultiSelectModal
        visible={showIndustryModal}
        onClose={() => setShowIndustryModal(false)}
        title="Select Industries"
        options={INDUSTRY_OPTIONS}
        selectedValues={profileData.industryExpertise}
        onConfirm={(selected: string[]) => {
          setProfileData(prev => ({ ...prev, industryExpertise: selected }));
        }}
      />

      {/* Skills Multi-Select Modal */}
      <MultiSelectModal
        visible={showSkillsModal}
        onClose={() => setShowSkillsModal(false)}
        title="Select Skills"
        options={SKILL_OPTIONS}
        selectedValues={profileData.skills}
        onConfirm={(selected: string[]) => {
          setProfileData(prev => ({ ...prev, skills: selected }));
        }}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  overviewCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  overviewTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  overviewSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.lg,
  },
  completenessContainer: {
    marginTop: SPACING.md,
  },
  completenessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  completenessLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  completenessValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  completenessBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  completenessFill: {
    height: '100%',
    borderRadius: 4,
  },
  completenessNote: {
    fontSize: FONT_SIZES.xs,
  },
  existingDataContainer: {
    marginTop: SPACING.lg,
  },
  dataRow: {
    marginBottom: SPACING.md,
  },
  dataLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  dataValue: {
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  tagText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  banner: {
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  bannerContent: {
    marginBottom: SPACING.md,
  },
  bannerEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: 'rgba(236, 253, 245, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  bannerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#ECFDF5',
    marginBottom: SPACING.xs,
  },
  bannerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(236, 253, 245, 0.85)',
    lineHeight: 20,
  },
  bannerButton: {
    backgroundColor: '#ECFDF5',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 24,
    alignSelf: 'flex-start',
  },
  bannerButtonText: {
    color: '#0F3F28',
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  formCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  formGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectButtonText: {
    fontSize: FONT_SIZES.md,
  },
  input: {
    backgroundColor: 'transparent',
  },
  textArea: {
    minHeight: 120,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languagesList: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  languageProficiency: {
    fontSize: FONT_SIZES.sm,
    textTransform: 'capitalize',
  },
  saveContainer: {
    marginTop: SPACING.lg,
  },
  saveButton: {
    borderRadius: 8,
  },
  saveButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    paddingVertical: SPACING.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalContent: {
    maxHeight: 400,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: FONT_SIZES.md,
  },
});

export default MarketerProfessionalProfileScreen;





