import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Platform,
  Modal,
  FlatList,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CheckCircle, AlertCircle, ChevronDown, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Referral } from '../../types/api';

type AddProjectScreenProps = RootStackScreenProps<'AddProject'>;

interface FormData {
  referralId: string;
  projectName: string;
  description: string;
  amount: string;
  estimatedDeliveryTime: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  services: string[];
}

interface CommissionData {
  clientName: string;
  referralName: string;
  isNewClient: boolean;
  projectAmount: number;
  commissionRate: number;
  commissionAmount: number;
  platformFeePercentage: number;
  platformFeeAmount: number;
}

interface StatusOption {
  value: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  label: string;
}

const AddProjectScreen: React.FC<AddProjectScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const scrollViewRef = React.useRef<ScrollView>(null);
  const descriptionRef = React.useRef<number | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    referralId: '',
    projectName: '',
    description: '',
    amount: '',
    estimatedDeliveryTime: '',
    status: 'pending',
    services: []
  });
  
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [commissionData, setCommissionData] = useState<CommissionData | null>(null);
  const [showCommissionPreview, setShowCommissionPreview] = useState<boolean>(false);
  
  // Modal states
  const [showReferralModal, setShowReferralModal] = useState<boolean>(false);
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [referralSearchQuery, setReferralSearchQuery] = useState<string>('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async (): Promise<void> => {
    try {
      setIsLoadingData(true);

      // Fetch referrals
      const referralsResponse = await apiClient.get('/api/referrals/business');

      setReferrals(referralsResponse.data.referrals || []);
      // Fetch industries to get all services
      const industriesResponse = await apiClient.get('/api/industries');

      const industries = industriesResponse.data.industries || [];
      const allServices: string[] = [];
      const serviceSet = new Set<string>();

      // Fetch services for each industry
      for (const industry of industries) {
        try {
          const servicesResponse = await apiClient.get(`/api/industries/${industry.value}/services`);

          const services = servicesResponse.data.services || [];
          services.forEach((serviceObj: any) => {
            if (!serviceSet.has(serviceObj.service)) {
              serviceSet.add(serviceObj.service);
              allServices.push(serviceObj.service);
            }
          });
        } catch (error) {
          // Silent fail for individual industry services
        }
      }

      setAvailableServices(allServices);
    } catch (error) {
      showDialog({
        title: 'Error',
        message: 'Failed to load referrals and services',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.projectName?.trim()) {
      newErrors.projectName = 'Project name is required';
    }

    if (!formData.description?.trim()) {
      newErrors.description = 'Project description is required';
    }

    if (!formData.amount || parseFloat(formData.amount) < 100) {
      newErrors.amount = 'Project cost must be at least GHS 100';
    }

    if (!formData.referralId) {
      newErrors.referralId = 'Please select a referral';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCalculateCommission = async (): Promise<void> => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/projects/commission-preview', {
        referralId: formData.referralId,
        projectAmount: parseFloat(formData.amount)
      });

      setCommissionData(response.data.commissionPreview as CommissionData);
      setShowCommissionPreview(true);
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to calculate commission',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (): Promise<void> => {
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        amount: parseFloat(formData.amount),
        estimatedDeliveryTime: formData.estimatedDeliveryTime ? parseInt(formData.estimatedDeliveryTime) : null,
        services: formData.services || []
      };
      await apiClient.post('/api/projects', submitData);

      // Navigate directly to Projects tab to show the new project
      navigation.navigate('BusinessTabNavigator' as any, { 
        screen: 'Projects',
        params: { refresh: true }
      });
      
      // Show success message
      setTimeout(() => {
        showDialog({
          title: 'Success',
          message: 'Project created successfully!',
          buttons: [{ text: 'OK' }]
        });
      }, 300);
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to create project',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setLoading(false);
      setShowCommissionPreview(false);
    }
  };

  const selectedReferral = referrals.find(r => r.id === formData.referralId);
  
  // Filter referrals based on search query
  const filteredReferrals = referrals.filter(referral => {
    if (!referralSearchQuery) return true;
    const query = referralSearchQuery.toLowerCase();
    return (
      referral.clientName?.toLowerCase().includes(query) ||
      referral.clientEmail?.toLowerCase().includes(query) ||
      referral.businessName?.toLowerCase().includes(query)
    );
  });
  
  const statusOptions: StatusOption[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const selectedStatus = statusOptions.find(s => s.value === formData.status);

  if (isLoadingData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showCommissionPreview && commissionData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.backButton, { 
              backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6'
            }]}
            onPress={() => setShowCommissionPreview(false)}
          >
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Commission Preview</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>
          <View style={styles.previewContainer}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Commission Breakdown</Text>
            
            {/* Project Info */}
            <View style={styles.infoSection}>
              <Text style={[styles.infoSectionTitle, { color: colors.textSecondary }]}>Project Information</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Client</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{commissionData.clientName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Marketer</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{commissionData.referralName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Client Type</Text>
                  <View style={[styles.clientTypeChip, { 
                    backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                    borderColor: colors.border
                  }]}>
                    <Text style={[styles.clientTypeText, { color: colors.textSecondary }]}>
                      {commissionData.isNewClient ? 'New Client' : 'Returning Client'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Commission Details */}
            <View style={styles.infoSection}>
              <Text style={[styles.infoSectionTitle, { color: colors.textSecondary }]}>Financial Breakdown</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Project Amount</Text>
                  <Text style={[styles.infoValueBold, { color: colors.text }]}>₵{(commissionData.projectAmount || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Marketer Commission ({commissionData.commissionRate}%)</Text>
                  <Text style={[styles.infoValueBold, { color: colors.text }]}>₵{(commissionData.commissionAmount || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Platform Fee ({commissionData.platformFeePercentage}%)</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>₵{(commissionData.platformFeeAmount || 0).toFixed(2)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary, { 
                  backgroundColor: colors.cardBackground,
                  borderColor: COLORS.APP_GREEN 
                }]}
                onPress={() => setShowCommissionPreview(false)}
              >
                <Text style={[styles.buttonSecondaryText, { color: COLORS.APP_GREEN }]}>Edit Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
                onPress={handleCreateProject}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Confirm & Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={[styles.backButton, { 
            backgroundColor: isDark ? 'transparent' : '#F3F4F6',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Project</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
        <View style={styles.formContainer}>
          
          {/* Select Referral */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Select Referral <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[
                styles.selectButton, 
                { backgroundColor: colors.cardBackground, borderColor: colors.border },
                errors.referralId && styles.inputError
              ]}
              onPress={() => setShowReferralModal(true)}
            >
              <Text style={[
                styles.selectButtonText,
                { color: colors.text },
                !selectedReferral && [styles.selectButtonPlaceholder, { color: colors.textSecondary }]
              ]}>
                {selectedReferral 
                  ? `${selectedReferral.clientName} - ${selectedReferral.clientEmail}`
                  : 'Choose a referral'
                }
              </Text>
              <ChevronDown size={20} color={colors.iconSecondary} />
            </TouchableOpacity>
            {errors.referralId && (
              <Text style={styles.errorText}>{errors.referralId}</Text>
            )}
            {selectedReferral && (
              <View style={[styles.infoBox, { 
                backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
              }]}>
                <AlertCircle size={16} color={COLORS.APP_GREEN} />
                <Text style={[styles.infoText, { color: isDark ? colors.textSecondary : '#166534' }]}>
                  Client: {selectedReferral.clientName} | Business: {selectedReferral.businessName || 'N/A'}
                </Text>
              </View>
            )}
          </View>

          {/* Project Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Project Name <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text },
                errors.projectName && styles.inputError
              ]}
              value={formData.projectName}
              onChangeText={(value) => {
                setFormData({ ...formData, projectName: value });
                setErrors({ ...errors, projectName: '' });
              }}
              placeholder="Enter project name"
              placeholderTextColor={colors.textSecondary}
            />
            {errors.projectName && (
              <Text style={styles.errorText}>{errors.projectName}</Text>
            )}
          </View>

          {/* Project Cost */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Project Cost (GHS) <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text },
                errors.amount && styles.inputError
              ]}
              value={formData.amount}
              onChangeText={(value) => {
                setFormData({ ...formData, amount: value });
                setErrors({ ...errors, amount: '' });
              }}
              placeholder="Minimum 100"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
            {errors.amount && (
              <Text style={styles.errorText}>{errors.amount}</Text>
            )}
          </View>

          {/* Estimated Delivery Time */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Estimated Delivery Time (Days)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }
              ]}
              value={formData.estimatedDeliveryTime}
              onChangeText={(value) => setFormData({ ...formData, estimatedDeliveryTime: value })}
              placeholder="e.g., 14"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          {/* Project Status */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Project Status</Text>
            <TouchableOpacity
              style={[styles.selectButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={() => setShowStatusModal(true)}
            >
              <Text style={[styles.selectButtonText, { color: colors.text }]}>
                {selectedStatus?.label || 'Select status'}
              </Text>
              <ChevronDown size={20} color={colors.iconSecondary} />
            </TouchableOpacity>
          </View>

          {/* Project Description */}
          <View 
            style={styles.inputGroup}
            onLayout={(event) => {
              descriptionRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.label, { color: colors.text }]}>Project Description <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[
                styles.textArea, 
                { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text },
                errors.description && styles.inputError
              ]}
              value={formData.description}
              onChangeText={(value) => {
                setFormData({ ...formData, description: value });
                setErrors({ ...errors, description: '' });
              }}
              onFocus={() => {
                setTimeout(() => {
                  if (scrollViewRef.current && descriptionRef.current) {
                    scrollViewRef.current.scrollTo({
                      y: descriptionRef.current - 100,
                      animated: true,
                    });
                  }
                }, 100);
              }}
              placeholder="Describe the project details, requirements, and scope"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description && (
              <Text style={styles.errorText}>{errors.description}</Text>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleCalculateCommission}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.WHITE} />
            ) : (
              <Text style={styles.submitButtonText}>Preview Commission & Create</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Referral Selection Modal */}
      <Modal
        visible={showReferralModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowReferralModal(false);
          setReferralSearchQuery('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Referral</Text>
              <TouchableOpacity 
                style={[styles.modalCloseButton, { 
                  backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}
                onPress={() => {
                  setShowReferralModal(false);
                  setReferralSearchQuery('');
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <TextInput
                  style={[styles.searchInput, { 
                    backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                    borderColor: colors.border,
                    color: colors.text
                  }]}
                  placeholder="Search by client name or email..."
                  placeholderTextColor={colors.textSecondary}
                  value={referralSearchQuery}
                  onChangeText={setReferralSearchQuery}
                  autoCapitalize="none"
                />
                {referralSearchQuery.length > 0 && (
                  <TouchableOpacity 
                    style={[styles.searchClearButton, { 
                      backgroundColor: isDark ? colors.backgroundTertiary : '#D1D5DB',
                      borderWidth: isDark ? 1 : 0,
                      borderColor: isDark ? colors.border : 'transparent'
                    }]}
                    onPress={() => setReferralSearchQuery('')}
                  >
                    <X size={16} color={colors.iconSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <FlatList
              data={filteredReferrals}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { 
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border
                  }]}
                  onPress={() => {
                    setFormData({ ...formData, referralId: item.id });
                    setErrors({ ...errors, referralId: '' });
                    setShowReferralModal(false);
                    setReferralSearchQuery('');
                  }}
                >
                  {/* Avatar */}
                  <View style={styles.referralAvatar}>
                    <Text style={styles.referralAvatarText}>
                      {item.clientName?.charAt(0)?.toUpperCase() || 'C'}
                    </Text>
                  </View>
                  
                  {/* Client Info */}
                  <View style={styles.modalItemContent}>
                    <Text style={[styles.modalItemText, { color: colors.text }]}>
                      {item.clientName}
                    </Text>
                    <Text style={[styles.modalItemSubtext, { color: colors.textSecondary }]}>
                      {item.clientEmail}
                    </Text>
                  </View>
                  
                  {/* Selected Indicator */}
                  {formData.referralId === item.id && (
                    <View style={[styles.selectedIndicator, { 
                      backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' 
                    }]}>
                      <CheckCircle size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                    </View>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Text style={[styles.emptyListText, { color: colors.text }]}>
                    {referralSearchQuery ? 'No referrals found' : 'No referrals available'}
                  </Text>
                  <Text style={[styles.emptyListSubtext, { color: colors.textSecondary }]}>
                    {referralSearchQuery 
                      ? 'Try a different search term' 
                      : 'Create a referral first to start a project'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Status Selection Modal */}
      <Modal
        visible={showStatusModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Status</Text>
              <TouchableOpacity 
                style={[styles.modalCloseButton, { 
                  backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                  borderWidth: isDark ? 1 : 0,
                  borderColor: isDark ? colors.border : 'transparent'
                }]}
                onPress={() => setShowStatusModal(false)}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={statusOptions}
              keyExtractor={(item) => item.value}
              contentContainerStyle={{ padding: SPACING.md }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { 
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.border
                  }]}
                  onPress={() => {
                    setFormData({ ...formData, status: item.value });
                    setShowStatusModal(false);
                  }}
                >
                  <View style={styles.modalItemContent}>
                    <Text style={[styles.modalItemText, { color: colors.text }]}>{item.label}</Text>
                  </View>
                  {formData.status === item.value && (
                    <View style={[styles.selectedIndicator, { 
                      backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' 
                    }]}>
                      <CheckCircle size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>

    {/* Custom Dialog */}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
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
    color: COLORS.GRAY,
  },
  formContainer: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.ERROR,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    backgroundColor: COLORS.WHITE,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    backgroundColor: COLORS.WHITE,
    minHeight: 100,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: SPACING.md,
    backgroundColor: COLORS.WHITE,
  },
  selectButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    flex: 1,
  },
  selectButtonPlaceholder: {
    color: COLORS.GRAY,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.ERROR,
    marginTop: SPACING.xs,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: SPACING.sm,
    borderRadius: 8,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: '#166534',
  },
  submitButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  previewContainer: {
    padding: SPACING.lg,
  },
  previewTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.lg,
  },
  infoSection: {
    marginBottom: SPACING.lg,
  },
  infoSectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    marginBottom: SPACING.sm,
  },
  infoCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  infoLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    flex: 1,
  },
  infoValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
  },
  infoValueBold: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  clientTypeChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  clientTypeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    fontWeight: FONT_WEIGHTS.medium,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: COLORS.APP_GREEN,
  },
  buttonSecondary: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  buttonSecondaryText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
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
    height: '90%',
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: SPACING.md,
    paddingRight: 40,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchClearButton: {
    position: 'absolute',
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: SPACING.xs,
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  referralAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  referralAvatarText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  modalItemContent: {
    flex: 1,
  },
  modalItemText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 4,
  },
  modalItemSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  emptyListSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    textAlign: 'center',
  },
});

export default AddProjectScreen;






