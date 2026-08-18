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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  CreditCard,
  CheckCircle,
  User
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import TextInput from '../../components/common/TextInput';
import SuccessModal from '../../components/common/SuccessModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import { Button } from 'react-native-paper';
import { updateMarketerProfile, getMarketerSession } from '../../api/absMarketer';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType } from '../../types/api';

type PaymentMethodSetupScreenProps = RootStackScreenProps<'PaymentMethodSetup'>;

interface PaymentProvider {
  id: string;
  name: string;
  color: string;
}

const PROVIDERS: PaymentProvider[] = [
  { id: 'MTN', name: 'MTN Mobile Money', color: '#FFCB05' },
  { id: 'AirtelTigo', name: 'AirtelTigo Money', color: '#ED1C24' },
  { id: 'Vodacash', name: 'Vodacash', color: '#E60000' },
];

const PaymentMethodSetupScreen: React.FC<PaymentMethodSetupScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [user, setUser] = useState<UserType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async (): Promise<void> => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData) as UserType;
        setUser(parsedUser);
        
        // Pre-fill if user already has payment method
        if (parsedUser.paymentProvider) {
          setSelectedProvider(parsedUser.paymentProvider);
        }
        if (parsedUser.paymentNumber) {
          setPhoneNumber(parsedUser.paymentNumber);
        }
        if (parsedUser.accountName) {
          setAccountName(parsedUser.accountName);
        }
      }
    } catch (error) {
      // Handle error
    }
  };

  const handleSave = async (): Promise<void> => {
    // Validation
    if (!selectedProvider) {
      showDialog({
        title: 'Provider Required',
        message: 'Please select your mobile money provider',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    // Clean phone number (remove spaces and special characters)
    const cleanedPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
    
    if (!phoneNumber || cleanedPhone.length < 10) {
      showDialog({
        title: 'Phone Number Required',
        message: 'Please enter a valid 10-digit mobile money number (e.g., 0555155972)',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    if (!accountName || accountName.trim().length < 2) {
      showDialog({
        title: 'Account Name Required',
        message: 'Please enter the account holder name',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    try {
      setIsSaving(true);

      // Clean phone number before sending
      const cleanedPhoneFinal = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
      
      const payload = {
        momoNumber: cleanedPhoneFinal,
        bankDetails: `${selectedProvider}|${accountName.trim()}`,
      };

      await updateMarketerProfile(payload);
      const session = await getMarketerSession().catch(() => null);
      const updatedUser = {
        ...(session?.marketer || user),
        momoNumber: cleanedPhoneFinal,
        paymentMethod: 'mobile_money',
        paymentProvider: selectedProvider,
        paymentNumber: cleanedPhoneFinal,
        accountName: accountName.trim(),
      } as UserType;
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setShowSuccessModal(true);
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || error.message || 'Failed to save payment method',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Method</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' }]}>
          <CreditCard size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            Set up your mobile money account to receive your earnings
          </Text>
        </View>

        {/* Provider Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Select Provider <Text style={{ color: '#EF4444' }}>*</Text>
          </Text>
          <View style={styles.providersGrid}>
            {PROVIDERS.map((provider) => {
              const isSelected = selectedProvider === provider.id;
              return (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerCard,
                    {
                      backgroundColor: colors.cardBackground,
                      borderColor: isSelected ? COLORS.APP_GREEN : colors.border,
                      borderWidth: isSelected ? 2 : 1
                    }
                  ]}
                  onPress={() => setSelectedProvider(provider.id)}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <View style={styles.providerCheckmark}>
                      <CheckCircle size={20} color={COLORS.APP_GREEN} strokeWidth={2} fill={COLORS.APP_GREEN} />
                    </View>
                  )}
                  <View style={[styles.providerIcon, { backgroundColor: provider.color + '20' }]}>
                    <CreditCard size={24} color={provider.color} strokeWidth={2} />
                  </View>
                  <Text style={[styles.providerName, { color: colors.text }]}>
                    {provider.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Phone Number */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Mobile Money Number <Text style={{ color: '#EF4444' }}>*</Text>
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="0XX XXX XXXX"
            keyboardType="phone-pad"
            maxLength={15}
            style={styles.input}
          />
        </View>

        {/* Account Name */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Account Holder Name <Text style={{ color: '#EF4444' }}>*</Text>
          </Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
            Name registered on the mobile money account
          </Text>
          <TextInput
            value={accountName}
            onChangeText={setAccountName}
            placeholder="Enter account holder name"
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        {/* Existing Payment Method */}
        {user?.paymentMethod && (
          <View style={[styles.existingMethodCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.existingHeader}>
              <User size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
              <Text style={[styles.existingTitle, { color: colors.text }]}>Current Payment Method</Text>
            </View>
            <View style={styles.existingInfo}>
              <Text style={[styles.existingLabel, { color: colors.textSecondary }]}>Provider: {user.paymentProvider || 'N/A'}</Text>
              <Text style={[styles.existingLabel, { color: colors.textSecondary }]}>Number: {user.paymentNumber || 'N/A'}</Text>
              <Text style={[styles.existingLabel, { color: colors.textSecondary }]}>Name: {user.accountName || 'N/A'}</Text>
            </View>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Save Button */}
      <View style={[styles.bottomSection, { 
        backgroundColor: colors.background,
        borderTopColor: colors.border 
      }]}>
        <Button
          mode="contained"
          onPress={handleSave}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          labelStyle={styles.saveButtonLabel}
          disabled={!selectedProvider || !phoneNumber || !accountName || isSaving}
          loading={isSaving}
        >
          {user?.paymentMethod ? 'Update Payment Method' : 'Save Payment Method'}
        </Button>
      </View>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          navigation.goBack();
        }}
        title="Success!"
        message="Your payment method has been saved successfully. You can now receive earnings to this mobile money account."
        buttonText="Done"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
  },
  sectionHint: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.sm,
  },
  providersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  providerCard: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
  },
  providerCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  providerName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'center',
  },
  input: {
    marginBottom: SPACING.sm,
  },
  existingMethodCard: {
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    marginTop: SPACING.md,
  },
  existingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  existingTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  existingInfo: {
    gap: SPACING.xs,
  },
  existingLabel: {
    fontSize: FONT_SIZES.sm,
  },
  bottomSection: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  saveButton: {
    width: '100%',
  },
  saveButtonContent: {
    paddingVertical: SPACING.sm,
  },
  saveButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default PaymentMethodSetupScreen;






