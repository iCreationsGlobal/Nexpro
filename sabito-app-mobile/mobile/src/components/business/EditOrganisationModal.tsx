import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import type { Business } from '../../types/api';

interface FormData {
  businessName: string;
  description: string;
  website: string;
  phone: string;
  address: string;
  email: string;
}

interface FormErrors {
  businessName?: string;
  description?: string;
  phone?: string;
  address?: string;
  email?: string;
}

interface EditOrganisationModalProps {
  visible: boolean;
  business: Business | null;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
}

const EditOrganisationModal: React.FC<EditOrganisationModalProps> = ({ visible, business, onClose, onSave }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  const [formData, setFormData] = useState<FormData>({
    businessName: business?.businessName || '',
    description: business?.description || '',
    website: business?.website || '',
    phone: business?.phone || '',
    address: business?.address || '',
    email: business?.email || '',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const handleInputChange = (field: keyof FormData, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.businessName?.trim()) {
      newErrors.businessName = 'Business name is required';
    }

    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.phone?.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.address?.trim()) {
      newErrors.address = 'Address is required';
    }

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      // Error handling can be added here if needed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Organisation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Business Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Business Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBackground, borderColor: errors.businessName ? COLORS.ERROR : colors.border, color: colors.text }
                ]}
                value={formData.businessName}
                onChangeText={(value) => handleInputChange('businessName', value)}
                placeholder="Enter business name"
                placeholderTextColor={colors.textSecondary}
              />
              {errors.businessName && <Text style={styles.errorText}>{errors.businessName}</Text>}
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Description <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: colors.cardBackground, borderColor: errors.description ? COLORS.ERROR : colors.border, color: colors.text }
                ]}
                value={formData.description}
                onChangeText={(value) => handleInputChange('description', value)}
                placeholder="Tell us about your business"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* Website */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Website</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBackground, borderColor: colors.border, color: colors.text }
                ]}
                value={formData.website}
                onChangeText={(value) => handleInputChange('website', value)}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Phone <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBackground, borderColor: errors.phone ? COLORS.ERROR : colors.border, color: colors.text }
                ]}
                value={formData.phone}
                onChangeText={(value) => handleInputChange('phone', value)}
                placeholder="+233 XX XXX XXXX"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />
              {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            </View>

            {/* Address */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Address <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBackground, borderColor: errors.address ? COLORS.ERROR : colors.border, color: colors.text }
                ]}
                value={formData.address}
                onChangeText={(value) => handleInputChange('address', value)}
                placeholder="Business address"
                placeholderTextColor={colors.textSecondary}
              />
              {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Email <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.cardBackground, borderColor: errors.email ? COLORS.ERROR : colors.border, color: colors.text }
                ]}
                value={formData.email}
                onChangeText={(value) => handleInputChange('email', value)}
                placeholder="business@example.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSubmitting && styles.saveButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  modalBody: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: SPACING.xs,
  },
  required: {
    color: COLORS.ERROR,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    backgroundColor: COLORS.WHITE,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    backgroundColor: COLORS.WHITE,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    color: COLORS.ERROR,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs / 2,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
  },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.APP_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.WHITE,
  },
});

export default EditOrganisationModal;






