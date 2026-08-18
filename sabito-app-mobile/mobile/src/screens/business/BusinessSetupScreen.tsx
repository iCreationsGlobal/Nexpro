import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';
import { Camera, Building2, MapPin, Globe, Mail, Phone, Briefcase, Users, CreditCard, Package, CheckCircle2, Info, X } from 'lucide-react-native';
import { Button, Chip } from 'react-native-paper';
import TextInput from '../../components/common/TextInput';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import StepIndicator from '../../components/common/StepIndicator';
import MultiSelectModal from '../../components/common/MultiSelectModal';
import BackButton from '../../components/common/BackButton';
import PartnershipTermsModal from '../../components/common/PartnershipTermsModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import industryServicesData from '../../data/industryServices.json';
import { uploadBusinessLogo } from '../../services/imageUpload';
import { requestCameraPermission, requestMediaLibraryPermission, showImageSourceOptions } from '../../services/permissions';
import { getAddressFromLocation } from '../../services/locationService';
import { acceptPartnershipTerms, getPartnershipTermsStatus } from '../../api/auth';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { BusinessSetupFormData } from '../../types/navigation';
import type { User } from '../../types/api';

type BusinessSetupScreenProps = RootStackScreenProps<'BusinessSetup'>;

interface Industry {
  value: string;
  label: string;
}

interface Service {
  service: string;
}

const BusinessSetupScreen: React.FC<BusinessSetupScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const surfaceColor = colors.cardBackground || colors.background;
  const { dialog, showDialog, hideDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState((s) => s.isVisible);
  
  const [currentStep, setCurrentStep] = useState<number>(0); // Start at 0 (Welcome)
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [loadingServices, setLoadingServices] = useState<boolean>(false);
  const [showIndustryModal, setShowIndustryModal] = useState<boolean>(false);
  const [showServicesModal, setShowServicesModal] = useState<boolean>(false);
  const [showNewClientInfo, setShowNewClientInfo] = useState<boolean>(false);
  const [showReturningClientInfo, setShowReturningClientInfo] = useState<boolean>(false);
  const [showBusinessTypeModal, setShowBusinessTypeModal] = useState<boolean>(false);
  
  // Animation refs for steps preview
  const step1Opacity = useRef(new Animated.Value(0)).current;
  const step1TranslateY = useRef(new Animated.Value(20)).current;
  const step2Opacity = useRef(new Animated.Value(0)).current;
  const step2TranslateY = useRef(new Animated.Value(20)).current;
  const step3Opacity = useRef(new Animated.Value(0)).current;
  const step3TranslateY = useRef(new Animated.Value(20)).current;
  
  // Animation for briefcase icon (floating)
  const iconFloatY = useRef(new Animated.Value(0)).current;
  
  // Form data
  const [formData, setFormData] = useState<BusinessSetupFormData>({
    businessName: '',
    description: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo: null,
    businessType: '', // 'services' or 'products' - matches web
    industries: [],  // Array for multi-select
    selectedServices: [],
    salesChannel: [], // For products - matches web
    marketerCount: '5',
    commissionRateNew: '15',
    commissionRateReturning: '10',
  });
  
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [gettingLocation, setGettingLocation] = useState<boolean>(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null); // For accordion on welcome screen
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  const steps = ['Welcome', 'Business Information', 'Industry & Services', 'Commission Setup'] as const;

  useEffect(() => {
    const fetchUser = async () => {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData) as User;
        setUser(parsedUser);
        setFormData(prev => ({ ...prev, email: parsedUser.email || '' }));
      }
    };
    fetchUser();
    fetchIndustries();
    checkTermsAcceptance();
  }, []);

  // Check if user has accepted partnership terms
  const checkTermsAcceptance = async (): Promise<boolean> => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return false;

      const status = await getPartnershipTermsStatus(token);
      const hasAccepted = status.hasAcceptedCurrent || false;
      setTermsAccepted(hasAccepted);
      return hasAccepted;
    } catch (error) {
      // Default to false if there's an error
      setTermsAccepted(false);
      return false;
    }
  };

  // Handle partnership terms acceptance
  const handleTermsAccept = async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        return;
      }

      await acceptPartnershipTerms(token, '1.0');
      setTermsAccepted(true);
      setShowTermsModal(false);
      
      // Store acceptance locally as well
      await AsyncStorage.setItem('partnershipTermsAccepted', JSON.stringify({
        version: '1.0',
        acceptedAt: new Date().toISOString()
      }));
      
      // If on welcome screen (step 0), move to step 1 after accepting terms
      if (currentStep === 0) {
        setCurrentStep(1);
      }
    } catch (error) {
      // Handle error
    }
  };

  // Check and show terms modal when moving from Welcome (step 0) to Business Information (step 1)
  useEffect(() => {
    // Don't show terms modal on welcome screen itself
    // It will be shown when user tries to proceed from welcome to step 1
  }, [currentStep]);

  // Floating icon animation
  useEffect(() => {
    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(iconFloatY, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(iconFloatY, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    floatAnimation.start();
    return () => floatAnimation.stop();
  }, []);

  const fetchIndustries = async (): Promise<void> => {
    try {
      setLoadingData(true);
      const response = await apiClient.get('/api/industries');
      if ((response.data as any).industries) {
        setIndustries((response.data as any).industries as Industry[]);
      }
    } catch (error) {
      // Handle error
    } finally {
      setLoadingData(false);
    }
  };

  const fetchServices = async (selectedIndustries: string[]): Promise<void> => {
    try {
      setLoadingServices(true);
      const allServices: Service[] = [];
      const serviceSet = new Set<string>();

      for (const industry of selectedIndustries) {
        try {
          const response = await apiClient.get(`/api/industries/${industry}/services`);
          if ((response.data as any).services) {
            const services = (response.data as any).services as Service[];
            services.forEach(serviceObj => {
              if (!serviceSet.has(serviceObj.service)) {
                serviceSet.add(serviceObj.service);
                allServices.push(serviceObj);
              }
            });
          }
        } catch (error) {
          // Handle error for individual industry
        }
      }

      setAvailableServices(allServices);
    } catch (error) {
      // Handle error
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    if (formData.industries && formData.industries.length > 0) {
      fetchServices(formData.industries);
    }
  }, [formData.industries]);

  const handlePrevious = (): void => {
    if (currentStep > 0) {
      // Go to previous step
      setCurrentStep(currentStep - 1);
    } else {
      // On step 0 (Welcome), go back to dashboard
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        // If no screen to go back to, navigate to BusinessTabNavigator (dashboard)
        navigation.navigate('BusinessTabNavigator' as any);
      }
    }
  };

  const handleTakePhoto = async (): Promise<void> => {
    try {
      // Request camera permission first
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        return;
      }
      
      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingLogo(true);
        const logoUrl = await uploadBusinessLogo(result.assets[0].uri);
        setFormData({ ...formData, logo: logoUrl });
      }
    } catch (error: any) {
      if (!error.message?.includes('cancel')) {
        showDialog({
          title: 'Error',
          message: error.message || 'Failed to take photo',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
      }
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleChooseFromLibrary = async (): Promise<void> => {
    try {
      // Request media library permission first
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        return;
      }

      // Launch image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingLogo(true);
        const logoUrl = await uploadBusinessLogo(result.assets[0].uri);
        setFormData({ ...formData, logo: logoUrl });
      }
    } catch (error: any) {
      if (!error.message?.includes('cancel')) {
        showDialog({
          title: 'Error',
          message: error.message || 'Failed to pick image',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
      }
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleImagePicker = async (): Promise<void> => {
    // Show options to choose between camera and photo library
    showImageSourceOptions(handleTakePhoto, handleChooseFromLibrary);
  };

  const handleGetLocation = async (): Promise<void> => {
    try {
      setGettingLocation(true);
      const addressData = await getAddressFromLocation();
      if (addressData) {
        setFormData(prev => ({ ...prev, address: addressData.fullAddress }));
      }
    } catch (error: any) {
      showDialog({
        title: 'Location Error',
        message: error.message || 'Failed to get location. Please enter address manually.',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setGettingLocation(false);
    }
  };

  const handleBusinessTypeSelect = (businessType: 'services' | 'products'): void => {
    setFormData(prev => ({
      ...prev,
      businessType,
      // Clear opposite selections when switching
      selectedServices: businessType === 'products' ? [] : prev.selectedServices,
      selectedProducts: businessType === 'services' ? [] : prev.selectedProducts,
      industries: businessType === 'products' ? [] : prev.industries,
      salesChannel: businessType === 'services' ? [] : prev.salesChannel,
    }));
    setShowBusinessTypeModal(false);
    // Stay on Step 2 (Industry & Services) after selection (matches web)
    setCurrentStep(2);
  };

  const handleNext = (): void => {
    // Validation
    if (currentStep === 0) {
      // Step 0: Welcome - Move to Business Information (Step 1)
      // Check if user has accepted partnership terms first
      if (!termsAccepted) {
        // Check terms status before showing modal
        checkTermsAcceptance().then((hasAccepted) => {
          if (!hasAccepted) {
            setShowTermsModal(true);
          } else {
            // Terms already accepted, proceed to step 1
            setCurrentStep(1);
          }
        });
        return;
      }
      // Terms accepted, proceed to step 1
      setCurrentStep(1);
    } else if (currentStep === 1) {
      // Step 1: Business Information
      // Check if user has accepted partnership terms first
      if (!termsAccepted) {
        setShowTermsModal(true);
        return;
      }
      // Validate required fields
      if (!formData.businessName.trim()) {
        showDialog({
          title: 'Required',
          message: 'Business name is required',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      // Description is optional (consistent with web version)
      if (!formData.address.trim()) {
        showDialog({
          title: 'Required',
          message: 'Address is required',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      if (!formData.phone.trim()) {
        showDialog({
          title: 'Required',
          message: 'Phone is required',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      if (!formData.email.trim()) {
        showDialog({
          title: 'Required',
          message: 'Email is required',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      // Check if business type is selected before moving to Industry & Services
      if (!formData.businessType) {
        setShowBusinessTypeModal(true);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Step 2: Industry & Services
      // Validate marketerCount (required, must be at least 1)
      const marketerCount = parseInt(formData.marketerCount, 10);
      if (!marketerCount || marketerCount < 1) {
        showDialog({
          title: 'Required',
          message: 'Please specify the number of marketers you want to work with',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      
      // Validate industries (required for services businesses)
      if (formData.businessType === 'services' && (!formData.industries || formData.industries.length === 0)) {
        showDialog({
          title: 'Required',
          message: 'Please select at least one industry',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      
      // Validate services (required for services businesses)
      if (formData.businessType === 'services' && formData.selectedServices.length === 0) {
        showDialog({
          title: 'Required',
          message: 'Please select at least one service',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      
      // Validate salesChannel (required for products businesses)
      if (formData.businessType === 'products' && (!formData.salesChannel || formData.salesChannel.length === 0)) {
        showDialog({
          title: 'Required',
          message: 'Please select at least one sales channel',
          buttons: [{ text: 'OK', onPress: hideDialog }]
        });
        return;
      }
      
      setCurrentStep(3);
    }
  };

  const handleSubmit = (): void => {
    console.log('handleSubmit called', { currentStep, user: !!user, formData });
    
    if (!user) {
      showDialog({
        title: 'Error',
        message: 'User information not found. Please try again.',
        buttons: [{ text: 'OK' }]
      });
      return;
    }
    
    // Validate commission rates
    const rateNew = parseFloat(formData.commissionRateNew);
    const rateReturning = parseFloat(formData.commissionRateReturning);
    
    console.log('Commission rates:', { rateNew, rateReturning });
    
    if (!rateNew || rateNew < 1 || rateNew > 50) {
      showDialog({
        title: 'Invalid Rate',
        message: 'New client commission rate must be between 1% and 50%',
        buttons: [{ text: 'OK' }]
      });
      return;
    }
    if (!rateReturning || rateReturning < 1 || rateReturning > 50) {
      showDialog({
        title: 'Invalid Rate',
        message: 'Returning client commission rate must be between 1% and 50%',
        buttons: [{ text: 'OK' }]
      });
      return;
    }

    try {
      console.log('Navigating to BusinessPreview with:', { formData, user });
      // Navigate to preview screen
      navigation.navigate('BusinessPreview', {
        formData,
        user,
      });
    } catch (error: any) {
      console.error('Navigation error:', error);
      showDialog({
        title: 'Error',
        message: error.message || 'Failed to navigate to preview. Please try again.',
        buttons: [{ text: 'OK' }]
      });
    }
  };

  const toggleService = (serviceValue: string): void => {
    setFormData(prev => {
      const isSelected = prev.selectedServices.includes(serviceValue);
      return {
        ...prev,
        selectedServices: isSelected
          ? prev.selectedServices.filter(s => s !== serviceValue)
          : [...prev.selectedServices, serviceValue]
      };
    });
  };

  // Render step content based on current step (matches web version: 4 steps with Welcome)
  const renderStepContent = (): React.ReactElement => {
    switch (currentStep) {
      case 0:
        // Step 0: Welcome Page (matches web)
        return (
          <View style={styles.stepContainer}>
            <View style={styles.welcomeContent}>
              <View style={styles.welcomeLeft}>
                <Text style={[styles.welcomeTitle, { color: colors.text }]}>Welcome to Sabito!</Text>
                <Text style={[styles.welcomeParagraph, { color: colors.textSecondary }]}>
                  Let's set up your business profile so you can start attracting referrals from top marketers.
                </Text>
                <Text style={[styles.welcomeParagraph, { color: colors.textSecondary }]}>
                  This quick process helps us understand your services and pricing, so we can match you with the right partners.
                </Text>
                <View style={[styles.infoBox, { backgroundColor: isDark ? 'rgba(31, 185, 0, 0.1)' : '#E8F5E8', borderColor: COLORS.APP_GREEN }]}>
                  <Info size={20} color={COLORS.APP_GREEN} />
                  <Text style={[styles.infoBoxText, { color: COLORS.APP_GREEN }]}>
                    Please provide accurate information — it's key to getting quality referrals and payouts.
                  </Text>
                </View>
              </View>

              <View style={styles.welcomeRight}>
                <View style={styles.stepPreview}>
                  <Text style={[styles.stepPreviewTitle, { color: colors.text }]}>Step 1: Business Information</Text>
                  <Text style={[styles.stepPreviewDescription, { color: colors.textSecondary }]}>
                    Tell us what your business does and who you serve.
                  </Text>
                  <View style={styles.stepPreviewList}>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• Select your industry and location.</Text>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• Add a short description of your company.</Text>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• This helps marketers understand your brand.</Text>
                  </View>
                </View>

                <View style={styles.stepPreview}>
                  <Text style={[styles.stepPreviewTitle, { color: colors.text }]}>Step 2: Industry & Services</Text>
                  <Text style={[styles.stepPreviewDescription, { color: colors.textSecondary }]}>
                    List the services you want marketers to promote.
                  </Text>
                  <View style={styles.stepPreviewList}>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• Choose services relevant to your business.</Text>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• This helps marketers find and partner with you.</Text>
                  </View>
                </View>

                <View style={styles.stepPreview}>
                  <Text style={[styles.stepPreviewTitle, { color: colors.text }]}>Step 3: Commission Setup</Text>
                  <Text style={[styles.stepPreviewDescription, { color: colors.textSecondary }]}>
                    Choose how much you're willing to share per successful referral.
                  </Text>
                  <View style={styles.stepPreviewList}>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• Set commission percentage on revenue from referrals.</Text>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• Separate rates for new and returning clients.</Text>
                    <Text style={[styles.stepPreviewListItem, { color: colors.textSecondary }]}>• You only pay for successful conversions.</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        );
      case 1:
        // Step 1: Business Information (matches web)
        // Business Info Step - Full Implementation
        return (
          <View style={styles.stepContainer}>
            {/* Logo Upload */}
            <View style={styles.logoSection}>
              <TouchableOpacity
                style={[styles.logoContainer, { borderColor: colors.border }]}
                onPress={handleImagePicker}
                disabled={uploadingLogo}
              >
                {formData.logo ? (
                  <Image source={{ uri: formData.logo }} style={styles.logoImage} />
                ) : (
                  <View style={[styles.logoPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                    <Camera size={32} color={colors.textSecondary} />
                  </View>
                )}
                {uploadingLogo && (
                  <View style={styles.logoOverlay}>
                    <ActivityIndicator size="small" color={COLORS.WHITE} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.uploadButton, { backgroundColor: COLORS.APP_GREEN }]}
                onPress={handleImagePicker}
                disabled={uploadingLogo}
              >
                <Text style={styles.uploadButtonText}>
                  {uploadingLogo ? 'Uploading...' : formData.logo ? 'Update Logo' : 'Upload Logo'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Business Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Business Name <Text style={styles.required}>*</Text>
            </Text>
              <TextInput
                value={formData.businessName}
                onChangeText={(text) => setFormData({ ...formData, businessName: text })}
                placeholder="Enter your business name"
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Business Description
              </Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Tell us about your business..."
                multiline={true}
                numberOfLines={6}
                style={{ minHeight: 150, textAlignVertical: 'top' }}
              />
            </View>

            {/* Address with Location Button */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Address <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.addressContainer}>
                <View style={styles.addressInputWrapper}>
                  <TextInput
                    value={formData.address}
                    onChangeText={(text) => setFormData({ ...formData, address: text })}
                    placeholder="Business address"
                    style={styles.addressInputField}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.locationButton, { backgroundColor: gettingLocation ? colors.backgroundSecondary : COLORS.APP_GREEN }]}
                  onPress={handleGetLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color={COLORS.WHITE} />
                  ) : (
                    <MapPin size={20} color={COLORS.WHITE} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Phone <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Business phone number"
                keyboardType="phone-pad"
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Email <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Business email"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Website (optional) - Last input in Step 1 */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Website <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                value={formData.website}
                onChangeText={(text) => setFormData({ ...formData, website: text })}
                placeholder="https://yourwebsite.com"
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>
          </View>
        );
      case 2:
        // Step 2: Industry & Services (matches web exactly)
        return (
          <View style={styles.stepContainer}>
            {formData.businessType === 'services' ? (
              <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                Select your industry and services to help marketers understand your business.
              </Text>
            ) : formData.businessType === 'products' ? (
              <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                Tell us about your product business.
              </Text>
            ) : null}

            {/* Industry Selection (only for services) */}
            {formData.businessType === 'services' && (
              <>
                <TouchableOpacity
                  style={[styles.selectButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                  onPress={() => setShowIndustryModal(true)}
                >
                  <Text style={[styles.selectButtonLabel, { color: colors.text }]}>Industry *</Text>
                  <Text style={[styles.selectButtonValue, { color: colors.textSecondary }]}>
                    {formData.industries.length > 0
                      ? `${formData.industries.length} selected`
                      : 'Select your industry'}
                  </Text>
                </TouchableOpacity>

                {/* Services Selection (only for services) */}
                <TouchableOpacity
                  style={[styles.selectButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                  onPress={() => setShowServicesModal(true)}
                  disabled={!formData.industries || formData.industries.length === 0 || loadingServices}
                >
                  <Text style={[styles.selectButtonLabel, { color: colors.text }]}>Services *</Text>
                  <Text style={[
                    styles.selectButtonValue,
                    { color: (formData.industries.length === 0 || loadingServices) ? colors.textSecondary : colors.text }
                  ]}>
                    {loadingServices
                      ? 'Loading services...'
                      : formData.selectedServices.length > 0
                      ? `${formData.selectedServices.length} selected`
                      : 'Select your services'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Sales Channel Selection (only for products) */}
            {formData.businessType === 'products' && (
              <TouchableOpacity
                style={[styles.selectButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => {
                  // Show sales channel selection modal
                  const salesChannels = [
                    { label: 'Online Store (E-commerce/Website)', value: 'online' },
                    { label: 'Physical Store/Shop', value: 'store' },
                    { label: 'Social Media (Facebook, Instagram, etc)', value: 'social' },
                    { label: 'Both Online & Physical Store', value: 'both' },
                    { label: 'Mobile/Delivery Service', value: 'delivery' }
                  ];
                  
                  // Create a temporary multi-select modal for sales channels
                  // For now, show dialog with selection options
                  showDialog({
                    title: 'Sales Channel',
                    message: 'Please use the website version to select sales channels for products businesses.',
                    buttons: [{ text: 'OK', onPress: hideDialog }]
                  });
                }}
              >
                <Text style={[styles.selectButtonLabel, { color: colors.text }]}>Where do you sell your products? *</Text>
                <Text style={[styles.selectButtonValue, { color: colors.textSecondary }]}>
                  {formData.salesChannel.length > 0
                    ? `${formData.salesChannel.length} selected`
                    : 'Select where you sell'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Marketer Count - Last input in Step 2 */}
            <TextInput
              label="Number of Marketers Needed *"
              value={formData.marketerCount}
              onChangeText={(text) => setFormData({ ...formData, marketerCount: text })}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              contentStyle={{ backgroundColor: colors.cardBackground }}
              placeholder="How many marketers do you need?"
            />
          </View>
        );
      case 3:
        // Step 3: Commission Setup (matches web exactly)
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
              What percentage of your profit are you willing to share per successful referral?
            </Text>
            
            <View style={[styles.infoBox, { backgroundColor: isDark ? 'rgba(31, 185, 0, 0.1)' : '#F0FDF4', borderColor: COLORS.APP_GREEN }]}>
              <Info size={20} color={COLORS.APP_GREEN} />
              <Text style={[styles.infoBoxText, { color: COLORS.APP_GREEN }]}>
                Higher commission rates attract top-performing marketers and increase your chances of getting quality referrals. Competitive rates help you stand out and build long-term partnerships with successful marketers.
              </Text>
          </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Commission Rate for New Clients (%)
              </Text>
            <TextInput
              value={formData.commissionRateNew}
              onChangeText={(text) => setFormData({ ...formData, commissionRateNew: text })}
              keyboardType="numeric"
                placeholder="e.g., 15"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Commission Rate for Returning Clients (%)
              </Text>
            <TextInput
              value={formData.commissionRateReturning}
              onChangeText={(text) => setFormData({ ...formData, commissionRateReturning: text })}
              keyboardType="numeric"
                placeholder="e.g., 10"
            />
            </View>
          </View>
        );
      default:
        return <View />;
    }
  };

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={handlePrevious} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Business Setup</Text>
        <View style={{ width: 40 }} />
      </View>
      

      {/* Step Indicator */}
      <View style={styles.stepIndicatorContainer}>
        <StepIndicator currentStep={currentStep + 1} totalSteps={steps.length} />
      </View>
      
      {/* Step Title and Indicator (matches web) - Hide on welcome screen */}
      {currentStep > 0 && (
        <View style={styles.stepTitleContainer}>
          <Text style={[styles.stepTitleHeader, { color: colors.text }]}>
            {steps[currentStep]}
          </Text>
          <Text style={[styles.stepIndicatorText, { color: colors.textSecondary }]}>
            {currentStep + 1}/{steps.length}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          bottomOffset={100}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 180 } // Extra padding: button height (~80px) + keyboard spacing (~100px)
          ]}
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        >
          {renderStepContent()}
        </KeyboardAwareScrollView>

        {/* Footer Actions - KeyboardStickyView automatically positions above keyboard */}
        <KeyboardStickyView offset={{ closed: 0, opened: -16 }}>
          <View style={[
            styles.footer,
            {
              backgroundColor: colors.cardBackground,
              borderTopColor: colors.border,
              // 4px bottom padding when keyboard open; safe area when closed
              paddingBottom: isKeyboardVisible ? 4 : (Platform.OS === 'ios' ? insets.bottom : SPACING.md),
              marginBottom: isKeyboardVisible ? 0 : undefined,
            }
          ]}>
            {currentStep === 0 ? (
              <Button
                mode="contained"
                onPress={handleNext}
                style={[styles.nextButton, isKeyboardVisible && { marginBottom: 0, marginTop: 0 }]}
                contentStyle={styles.nextButtonContent}
                labelStyle={styles.nextButtonLabel}
                buttonColor={COLORS.APP_GREEN}
              >
                Let's Get Started
              </Button>
            ) : currentStep < steps.length - 1 ? (
              <Button
                mode="contained"
                onPress={handleNext}
                style={[styles.nextButton, isKeyboardVisible && { marginBottom: 0, marginTop: 0 }]}
                contentStyle={styles.nextButtonContent}
                labelStyle={styles.nextButtonLabel}
                buttonColor={COLORS.APP_GREEN}
              >
                Next
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={() => {
                  console.log('Continue to Preview button pressed', { currentStep, stepsLength: steps.length });
                  handleSubmit();
                }}
                loading={isLoading}
                disabled={false}
                style={[styles.nextButton, isKeyboardVisible && { marginBottom: 0, marginTop: 0 }]}
                contentStyle={styles.nextButtonContent}
                labelStyle={styles.nextButtonLabel}
                buttonColor={COLORS.APP_GREEN}
              >
                Continue to Preview
              </Button>
            )}
          </View>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>

    {/* Partnership Terms Modal */}
    <PartnershipTermsModal
      visible={showTermsModal}
      onAccept={handleTermsAccept}
      onDecline={() => setShowTermsModal(false)}
    />

    {/* Business Type Selection Modal (matches web) */}
    <Modal
      visible={showBusinessTypeModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {}} // Don't allow closing without selection
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.businessTypeModalContainer, { backgroundColor: colors.cardBackground }]}>
          <View style={[styles.businessTypeModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.businessTypeModalTitle, { color: colors.text }]}>What do you offer?</Text>
            <Text style={[styles.businessTypeModalMessage, { color: colors.textSecondary }]}>
              Select what your business offers to help us customize your setup experience.
            </Text>
          </View>
          
          <View style={styles.businessTypeContainer}>
            <TouchableOpacity
              style={[styles.businessTypeOption, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => handleBusinessTypeSelect('services')}
            >
              <View style={[styles.businessTypeIcon, { backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#E8F5E8' }]}>
                <Briefcase size={24} color={COLORS.APP_GREEN} />
              </View>
              <View style={styles.businessTypeContent}>
                <Text style={[styles.businessTypeTitle, { color: colors.text }]}>Services</Text>
                <Text style={[styles.businessTypeDescription, { color: colors.textSecondary }]}>
                  Offer professional services to clients
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.businessTypeOption, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => handleBusinessTypeSelect('products')}
            >
              <View style={[styles.businessTypeIcon, { backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#E8F5E8' }]}>
                <Package size={24} color={COLORS.APP_GREEN} />
              </View>
              <View style={styles.businessTypeContent}>
                <Text style={[styles.businessTypeTitle, { color: colors.text }]}>Products</Text>
                <Text style={[styles.businessTypeDescription, { color: colors.textSecondary }]}>
                  Sell physical or digital products
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Industry Selection Modal */}
    <MultiSelectModal
      visible={showIndustryModal}
      title="Select Industry"
      options={industries.map(industry => ({ label: industry.label, value: industry.value }))}
      selectedValues={formData.industries}
      onClose={() => setShowIndustryModal(false)}
      onConfirm={(selected) => {
        setFormData(prev => ({ ...prev, industries: selected as string[] }));
      }}
    />

    {/* Services Selection Modal */}
    <MultiSelectModal
      visible={showServicesModal}
      title="Select Services"
      options={availableServices.map(service => ({ label: service.service, value: service.service }))}
      selectedValues={formData.selectedServices}
      onClose={() => setShowServicesModal(false)}
      onConfirm={(selected) => {
        setFormData(prev => ({ ...prev, selectedServices: selected as string[] }));
      }}
    />

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
  stepContainer: {
    padding: SPACING.md,
  },
  welcomeContent: {
    gap: SPACING.lg,
  },
  welcomeLeft: {
    marginBottom: SPACING.md,
  },
  welcomeRight: {
    gap: SPACING.lg,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  welcomeParagraph: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  stepPreview: {
    marginBottom: SPACING.lg,
  },
  stepPreviewTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  stepPreviewDescription: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.xs,
    lineHeight: 20,
  },
  stepPreviewList: {
    paddingLeft: SPACING.md,
  },
  stepPreviewListItem: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  stepTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.lg,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  required: {
    color: COLORS.ERROR,
  },
  optional: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.normal,
    color: COLORS.GRAY,
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: COLORS.WHITE,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: FONT_SIZES.sm,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  addressInputWrapper: {
    flex: 1,
  },
  addressInputField: {
    marginBottom: 0,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xs + 2, // Align with input field
  },
  footer: {
    padding: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.STROKE_COLOR,
  },
  nextButton: {
    width: '100%',
    borderRadius: 8,
  },
  nextButtonContent: {
    paddingVertical: SPACING.sm,
  },
  nextButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  stepIndicatorContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  stepTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  stepTitleHeader: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stepIndicatorText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  stepDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  selectButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectButtonLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.xs,
  },
  selectButtonValue: {
    fontSize: FONT_SIZES.md,
    flex: 1,
    textAlign: 'right',
  },
  businessTypeContainer: {
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  businessTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    gap: SPACING.md,
  },
  businessTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  businessTypeContent: {
    flex: 1,
  },
  businessTypeTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  businessTypeDescription: {
    fontSize: FONT_SIZES.sm,
  },
  infoBox: {
    flexDirection: 'row',
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  infoBoxText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  businessTypeModalContainer: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  businessTypeModalHeader: {
    borderBottomWidth: 1,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.lg,
  },
  businessTypeModalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  businessTypeModalMessage: {
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
  },
});

export default BusinessSetupScreen;






