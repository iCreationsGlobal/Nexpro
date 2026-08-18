import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, MapPin, Globe, Mail, Phone, Briefcase, Users, CreditCard, Package, CheckCircle2 } from 'lucide-react-native';
import { Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import { createBusinessProfile } from '../../api/auth';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User } from '../../types/api';

type BusinessPreviewScreenProps = RootStackScreenProps<'BusinessPreview'>;

interface FormData {
  businessName: string;
  description: string;
  industries: string[];
  address: string;
  phone: string;
  email: string;
  website?: string;
  logo?: string | null;
  selectedServices: string[];
  marketerCount: string;
  commissionRateNew: string;
  commissionRateReturning: string;
}

const BusinessPreviewScreen: React.FC<BusinessPreviewScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const { formData, user } = route.params as { formData: FormData; user: User };
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleEdit = (): void => {
    navigation.goBack();
  };

  const handleConfirm = async (): Promise<void> => {
    if (!user?.id) {
      return;
    }

    setIsSubmitting(true);

    const payload = {
      userID: user.id,
      businessName: formData.businessName,
      description: formData.description,
      industry: formData.industries.length > 0 ? formData.industries[0] : '', // Backend expects single industry
      address: formData.address,
      phone: formData.phone,
      email: formData.email,
      website: formData.website || '',
      logo: formData.logo || '',
      services: formData.selectedServices,
      commissionRateNew: parseFloat(formData.commissionRateNew),
      commissionRateReturning: parseFloat(formData.commissionRateReturning),
      marketerCount: parseInt(formData.marketerCount) || 5,
    };
    try {
      const response = await createBusinessProfile(payload);
      // Store business data in AsyncStorage for immediate access
      if (response.data && response.data.business) {
        await AsyncStorage.setItem('business', JSON.stringify(response.data.business));
      }

      showDialog({
        title: 'Success!',
        message: 'Your business profile has been created successfully! Your profile is now under review and will be approved within 2 business days. You\'ll receive an email confirmation shortly.',
        buttons: [
          {
            text: 'Go to Dashboard',
            onPress: () => {
              hideDialog();
              // Reset navigation stack to prevent going back to setup
              navigation.reset({
                index: 0,
                routes: [{ name: 'BusinessTabNavigator' as any }],
              });
            },
            style: 'default',
          },
        ]
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to create business profile. Please try again.';
      // Error handling could be added here if needed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton 
          onPress={handleEdit}
          style={{ opacity: isSubmitting ? 0.5 : 1 }}
        />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review Your Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Preview Card */}
        <View style={styles.previewCard}>
          {/* Business Name */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Building2 size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={styles.sectionTitle}>Business Information</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Business Name</Text>
              <Text style={styles.value}>{formData.businessName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{formData.description}</Text>
            </View>
          </View>

          {/* Contact Information */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={styles.sectionTitle}>Contact Details</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{formData.email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{formData.phone}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Address</Text>
              <Text style={styles.value}>{formData.address}</Text>
            </View>
            {formData.website ? (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Website</Text>
                <Text style={styles.value}>{formData.website}</Text>
              </View>
            ) : null}
          </View>

          {/* Industry & Services */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Briefcase size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={styles.sectionTitle}>Industry & Services</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Industry</Text>
              <View style={styles.chipsContainer}>
                {formData.industries.map((industry, index) => {
                  // Find the industry label from the value
                  const industryLabel = industry;
                  return (
                    <View key={index} style={styles.chip}>
                      <Text style={styles.chipText}>{industryLabel}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Services</Text>
              <View style={styles.chipsContainer}>
                {formData.selectedServices.slice(0, 5).map((service, index) => (
                  <View key={index} style={styles.chip}>
                    <Text style={styles.chipText}>{service}</Text>
                  </View>
                ))}
                {formData.selectedServices.length > 5 && (
                  <Text style={styles.moreText}>
                    +{formData.selectedServices.length - 5} more
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Marketer Capacity</Text>
              <Text style={styles.value}>{formData.marketerCount} marketers</Text>
            </View>
          </View>

          {/* Commission Rates */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <CreditCard size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={styles.sectionTitle}>Commission Structure</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>New Clients</Text>
              <Text style={styles.valueHighlight}>{formData.commissionRateNew}%</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Returning Clients</Text>
              <Text style={styles.valueHighlight}>{formData.commissionRateReturning}%</Text>
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <CheckCircle2 size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
            <Text style={styles.infoText}>
              Your profile will be reviewed and approved within 2 business days. You'll receive an email confirmation shortly.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.bottomSection}>
        <Button
          mode="contained"
          onPress={handleConfirm}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.confirmButton}
          contentStyle={styles.confirmButtonContent}
          labelStyle={styles.confirmButtonLabel}
        >
          {isSubmitting ? 'Creating Profile...' : 'Confirm & Submit'}
        </Button>
        <Button
          mode="outlined"
          onPress={handleEdit}
          disabled={isSubmitting}
          style={styles.editButton}
          contentStyle={styles.editButtonContent}
          labelStyle={styles.editButtonLabel}
        >
          Edit Information
        </Button>
      </View>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: SPACING.xl * 2,
  },
  previewCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginHorizontal: SPACING.md,
  },
  section: {
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
    paddingBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  infoRow: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.GRAY,
  },
  value: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.regular,
    color: COLORS.BLACK,
    lineHeight: 22,
  },
  valueHighlight: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  chip: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.APP_GREEN,
  },
  moreText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.GRAY,
    alignSelf: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: '#F0FDF4',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
    lineHeight: 20,
  },
  bottomSection: {
    padding: 16,
    backgroundColor: COLORS.WHITE,
    borderTopWidth: 1,
    borderTopColor: COLORS.STROKE_COLOR,
    gap: SPACING.sm,
  },
  confirmButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
  },
  confirmButtonContent: {
    paddingVertical: SPACING.sm,
  },
  confirmButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  editButton: {
    borderColor: COLORS.APP_GREEN,
    borderWidth: 1,
    borderRadius: 12,
  },
  editButtonContent: {
    paddingVertical: SPACING.sm,
  },
  editButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
});

export default BusinessPreviewScreen;






