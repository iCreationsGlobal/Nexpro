import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, Building2, ChevronDown, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import TextInput from '../../components/common/TextInput';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Business } from '../../types/api';

type AddReferralScreenProps = RootStackScreenProps<'AddReferral'>;

interface ReferralFormData {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  location: string;
  businessName: string;
  note: string;
}

interface FormErrors {
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  businessName?: string;
}

const AddReferralScreen: React.FC<AddReferralScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [showBusinessModal, setShowBusinessModal] = useState<boolean>(false);
  const [formData, setFormData] = useState<ReferralFormData>({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    location: '',
    businessName: '',
    note: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    fetchPartneredBusinesses();
  }, []);

  const fetchPartneredBusinesses = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/marketer/partnerships', {
        timeout: 30000,
      });
      const partneredBusinesses = ((response.data as any)?.partnerships as any[])
        ?.filter((p: any) => p.status === 'accepted')
        ?.map((p: any) => p.business as Business) || [];
      setBusinesses(partneredBusinesses);
      
      if (partneredBusinesses.length === 0) {
        showDialog({
          title: 'No Businesses',
          message: 'You have no partnered businesses yet. Please partner with a business first.',
          buttons: [{ text: 'OK', onPress: () => { hideDialog(); navigation.goBack(); }, style: 'default' }]
        });
      }
      
      // If only one business, auto-select it
      if (partneredBusinesses.length === 1) {
        setFormData(prev => ({ ...prev, businessName: partneredBusinesses[0].businessName || '' }));
      }
    } catch (error: any) {
      showDialog({
        title: 'Error Loading Businesses',
        message: `Failed to load partnered businesses.\n\nError: ${error.response?.data?.message || error.message}`,
        buttons: [{ text: 'OK', onPress: () => { hideDialog(); navigation.goBack(); }, style: 'default' }]
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.clientName.trim()) {
      newErrors.clientName = 'Client name is required';
    }
    
    if (!formData.clientEmail.trim()) {
      newErrors.clientEmail = 'Client email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.clientEmail)) {
      newErrors.clientEmail = 'Please enter a valid email address';
    }
    
    if (!formData.clientPhone.trim()) {
      newErrors.clientPhone = 'Client phone is required';
    }
    
    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }
    
    if (!formData.businessName) {
      newErrors.businessName = 'Please select a business';
    }

    const isValid = Object.keys(newErrors).length === 0;
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validateForm()) {
      return;
    }
    setLoading(true);
    
    try {
      await apiClient.post('/api/referrals', formData, {
        timeout: 30000,
      });
      showDialog({
        title: 'Success',
        message: 'Referral created successfully!',
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              hideDialog();
              navigation.goBack();
            },
            style: 'default',
          },
        ]
      });
    } catch (error: any) {
      // Check for plan limit error
      if (error.response?.status === 400 && error.response?.data?.limitInfo) {
        const { message, limitInfo } = error.response.data;
        showDialog({
          title: 'Plan Limit Reached',
          message: `${message}\n\nCurrent: ${limitInfo.current}\nLimit: ${limitInfo.unlimited ? 'Unlimited' : limitInfo.limit}`,
          buttons: [{ text: 'OK' }]
        });
      } else {
        const errorMessage = error.response?.data?.message || error.message || 'Failed to create referral. Please try again.';
        showDialog({
          title: 'Error',
          message: errorMessage,
          buttons: [{ text: 'OK' }]
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ReferralFormData, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Show loading spinner while fetching businesses
  if (loading && businesses.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Add Referral</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading businesses...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show empty state only after loading is complete and no businesses found
  if (businesses.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Add Referral</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.backgroundSecondary : '#FEF3C7' }]}>
            <Building2 size={48} color="#F59E0B" strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Partnered Businesses</Text>
          <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
            You have not partnered with any business. Partner with a business first before you can add referrals.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('MarketerTabNavigator', { screen: 'Discover' } as any)}
          >
            <Text style={styles.emptyButtonText}>Browse Businesses</Text>
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
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Add Referral</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Form Card */}
        <View style={[styles.formCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.formHeader}>
            <UserPlus size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
            <Text style={[styles.formTitle, { color: colors.text }]}>Client Information</Text>
          </View>

          {/* Client Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Client Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={formData.clientName}
              onChangeText={(value) => handleInputChange('clientName', value)}
              placeholder="Enter client's full name"
              error={errors.clientName}
            />
            {errors.clientName && (
              <Text style={styles.errorText}>{errors.clientName}</Text>
            )}
          </View>

          {/* Client Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Client Email <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={formData.clientEmail}
              onChangeText={(value) => handleInputChange('clientEmail', value)}
              placeholder="client@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.clientEmail}
            />
            {errors.clientEmail && (
              <Text style={styles.errorText}>{errors.clientEmail}</Text>
            )}
          </View>

          {/* Client Phone */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Client Phone <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={formData.clientPhone}
              onChangeText={(value) => handleInputChange('clientPhone', value)}
              placeholder="0XX XXX XXXX"
              keyboardType="phone-pad"
              error={errors.clientPhone}
            />
            {errors.clientPhone && (
              <Text style={styles.errorText}>{errors.clientPhone}</Text>
            )}
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Location <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={formData.location}
              onChangeText={(value) => handleInputChange('location', value)}
              placeholder="City or area"
              error={errors.location}
            />
            {errors.location && (
              <Text style={styles.errorText}>{errors.location}</Text>
            )}
          </View>

          {/* Business Selection */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Refer To <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.selectButton,
                { backgroundColor: colors.inputBackground, borderColor: errors.businessName ? COLORS.ERROR : colors.border }
              ]}
              onPress={() => setShowBusinessModal(true)}
            >
              <Text style={[
                styles.selectButtonText,
                { color: formData.businessName ? colors.inputText : colors.inputPlaceholder }
              ]}>
                {formData.businessName || 'Select a business'}
              </Text>
              <ChevronDown size={20} color={colors.iconSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
            {errors.businessName && (
              <Text style={styles.errorText}>{errors.businessName}</Text>
            )}
          </View>

          {/* Notes (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Notes <Text style={[styles.optional, { color: colors.textSecondary }]}>(Optional)</Text>
            </Text>
            <TextInput
              value={formData.note}
              onChangeText={(value) => handleInputChange('note', value)}
              placeholder="Any additional information..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.WHITE} />
          ) : (
            <Text style={styles.submitButtonText}>Create Referral</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Business Selection Modal */}
      <Modal
        visible={showBusinessModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBusinessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Business</Text>
              <TouchableOpacity onPress={() => setShowBusinessModal(false)}>
                <Text style={[styles.modalClose, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {businesses.map((business) => (
                <TouchableOpacity
                  key={business.id}
                  style={[
                    styles.businessOption,
                    { borderBottomColor: colors.border },
                    formData.businessName === business.businessName && { backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' }
                  ]}
                  onPress={() => {
                    handleInputChange('businessName', business.businessName || '');
                    setShowBusinessModal(false);
                  }}
                >
                  <View style={styles.businessOptionContent}>
                    <Text style={[styles.businessOptionName, { color: colors.text }]}>
                      {business.businessName}
                    </Text>
                    <Text style={[styles.businessOptionIndustry, { color: colors.textSecondary }]}>
                      {business.industry}
                    </Text>
                  </View>
                  {formData.businessName === business.businessName && (
                    <Check size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  formCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  formTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
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
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.ERROR,
    marginTop: SPACING.xs,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    height: 56,
  },
  selectButtonText: {
    fontSize: FONT_SIZES.md,
    flex: 1,
  },
  submitButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalClose: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  modalScroll: {
    maxHeight: 400,
  },
  businessOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  businessOptionContent: {
    flex: 1,
  },
  businessOptionName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  businessOptionIndustry: {
    fontSize: FONT_SIZES.sm,
  },
});

export default AddReferralScreen;






