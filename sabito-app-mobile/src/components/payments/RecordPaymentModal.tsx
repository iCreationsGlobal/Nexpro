import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { X, CreditCard, Banknote, FileText, Hash } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import apiClient from '../../services/apiClient';
import type { Project } from '../../types/api';

interface PaymentMethod {
  value: string;
  label: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'other', label: 'Other' },
];

interface FormData {
  amount: string;
  paymentMethod: string;
  reference: string;
  notes: string;
}

interface FormErrors {
  amount?: string;
  paymentMethod?: string;
  reference?: string;
}

interface RecordPaymentModalProps {
  visible: boolean;
  project: Project | null;
  onClose: () => void;
  onPaymentSuccess?: (amount: string) => void;
}

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ visible, project, onClose, onPaymentSuccess }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [formData, setFormData] = useState<FormData>({
    amount: '',
    paymentMethod: '',
    reference: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showMethodPicker, setShowMethodPicker] = useState<boolean>(false);

  const formatCurrency = (amount: number): string => {
    return `₵${(amount || 0).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleInputChange = (field: keyof FormData, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Please enter a valid amount';
    }

    const remainingAmount = (project?.amount || 0) - ((project as any)?.totalPaid || 0);
    if (parseFloat(formData.amount) > remainingAmount) {
      newErrors.amount = `Amount cannot exceed remaining balance (${formatCurrency(remainingAmount)})`;
    }

    // Payment method and reference are optional (matching web behavior)

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validateForm() || !project) {
      return;
    }

    setIsSubmitting(true);
    try {
      const paymentData = {
        projectId: project.id,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod || null,
        reference: formData.reference || null,
        notes: formData.notes || null,
      };
      await apiClient.post('/api/payment/record', paymentData);
      // Store the amount before resetting
      const recordedAmount = formData.amount;

      // Reset form
      setFormData({
        amount: '',
        paymentMethod: '',
        reference: '',
        notes: '',
      });

      // Close the modal
      onClose();

      // Call success callback with the amount (parent will show dialog)
      if (onPaymentSuccess) {
        onPaymentSuccess(recordedAmount);
      }
    } catch (error: any) {
      // Show error alert
      Alert.alert('Error', error.response?.data?.message || 'Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setFormData({
      amount: '',
      paymentMethod: '',
      reference: '',
      notes: '',
    });
    setErrors({});
    onClose();
  };

  if (!visible || !project) return null;

  const totalAmount = project.amount || 0;
  const alreadyPaid = (project as any)?.totalPaid || 0;
  const remainingAmount = totalAmount - alreadyPaid;
  const selectedMethod = PAYMENT_METHODS.find(m => m.value === formData.paymentMethod);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Record Payment</Text>
            <TouchableOpacity
              style={[styles.closeButton, {
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent',
              }]}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Payment Summary */}
            <View style={[styles.summarySection, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>
                {project.projectName}
              </Text>
              
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Amount:</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {formatCurrency(totalAmount)}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Already Paid:</Text>
                <Text style={[styles.summaryValue, { color: COLORS.SUCCESS }]}>
                  {formatCurrency(alreadyPaid)}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.summaryRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Remaining:</Text>
                <Text style={[styles.totalAmount, { color: COLORS.APP_GREEN }]}>
                  {formatCurrency(remainingAmount)}
                </Text>
              </View>
            </View>

            {/* Payment Amount Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Payment Amount (GHS) <Text style={styles.required}>*</Text>
              </Text>
              <View style={[
                styles.inputWrapper,
                { backgroundColor: colors.cardBackground, borderColor: errors.amount ? COLORS.ERROR : colors.border }
              ]}>
                <Banknote size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={formData.amount}
                  onChangeText={(value) => handleInputChange('amount', value)}
                  placeholder="Enter amount received"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                />
              </View>
              {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
            </View>

            {/* Payment Method Picker */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Payment Method
              </Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  { backgroundColor: colors.cardBackground, borderColor: errors.paymentMethod ? COLORS.ERROR : colors.border }
                ]}
                onPress={() => setShowMethodPicker(!showMethodPicker)}
              >
                <CreditCard size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                <Text style={[
                  styles.pickerText,
                  { color: selectedMethod ? colors.text : colors.textSecondary }
                ]}>
                  {selectedMethod?.label || 'Select payment method'}
                </Text>
              </TouchableOpacity>
              {errors.paymentMethod && <Text style={styles.errorText}>{errors.paymentMethod}</Text>}

              {/* Method Options Dropdown */}
              {showMethodPicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                  {PAYMENT_METHODS.map((method) => (
                    <TouchableOpacity
                      key={method.value}
                      style={[
                        styles.pickerOption,
                        { borderBottomColor: colors.border },
                        formData.paymentMethod === method.value && { backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' }
                      ]}
                      onPress={() => {
                        handleInputChange('paymentMethod', method.value);
                        setShowMethodPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.pickerOptionText,
                        { color: colors.text },
                        formData.paymentMethod === method.value && { color: COLORS.APP_GREEN, fontWeight: FONT_WEIGHTS.semibold }
                      ]}>
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Payment Reference */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Reference Number
              </Text>
              <View style={[
                styles.inputWrapper,
                { backgroundColor: colors.cardBackground, borderColor: errors.reference ? COLORS.ERROR : colors.border }
              ]}>
                <Hash size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={formData.reference}
                  onChangeText={(value) => handleInputChange('reference', value)}
                  placeholder="Payment reference (optional)"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              {errors.reference && <Text style={styles.errorText}>{errors.reference}</Text>}
            </View>

            {/* Payment Notes (Optional) */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Notes (Optional)
              </Text>
              <View style={[
                styles.textAreaWrapper,
                { backgroundColor: colors.cardBackground, borderColor: colors.border }
              ]}>
                <FileText size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                <TextInput
                  style={[styles.textArea, { color: colors.text }]}
                  value={formData.notes}
                  onChangeText={(value) => handleInputChange('notes', value)}
                  placeholder="Additional notes (optional)"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <>
                  <CreditCard size={20} color={COLORS.WHITE} strokeWidth={2} />
                  <Text style={styles.submitButtonText}>Record Payment</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 16,
  },
  summarySection: {
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.sm,
  },
  summaryValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
    marginHorizontal: -SPACING.md,
  },
  totalLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  totalAmount: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.ERROR,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    paddingVertical: 4,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  pickerText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
  },
  pickerDropdown: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  pickerOptionText: {
    fontSize: FONT_SIZES.md,
  },
  textAreaWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  textArea: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    minHeight: 80,
    paddingTop: 4,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.ERROR,
    marginTop: SPACING.xs,
  },
  submitButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 8,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default RecordPaymentModal;






