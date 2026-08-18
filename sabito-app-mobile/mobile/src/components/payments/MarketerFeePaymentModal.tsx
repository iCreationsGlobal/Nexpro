import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { X, CreditCard, User, Briefcase, Percent } from 'lucide-react-native';
import { Paystack } from 'react-native-paystack-webview';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import apiClient from '../../services/apiClient';
import { PAYSTACK_CONFIG } from '../../config/env';
import type { Project, Marketer } from '../../types/api';

interface Fee {
  id: string;
  amount: number;
  percentage?: number;
  commissionRate?: number;
  project?: Project;
  marketer?: Marketer;
  clientType?: string;
}

interface MarketerFeePaymentModalProps {
  visible: boolean;
  fee: Fee | null;
  onClose: () => void;
  onPaymentSuccess?: (data: { amount: number; marketerName?: string; reference: string }) => void;
}

interface PaystackResponse {
  transactionRef?: { reference?: string };
  reference?: string;
}

const MarketerFeePaymentModal: React.FC<MarketerFeePaymentModalProps> = ({ visible, fee, onClose, onPaymentSuccess }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const paystackWebViewRef = useRef<any>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const formatCurrency = (amount: number): string => {
    return `₵${(amount || 0).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handlePayNow = (): void => {
    paystackWebViewRef.current?.startTransaction();
  };

  const handlePaystackSuccess = async (response: PaystackResponse): Promise<void> => {
    try {
      setIsProcessing(true);

      const projectId = fee?.project?.id;
      if (!projectId) {
        throw new Error('Project ID is missing from fee data');
      }

      const paystackReference = response.transactionRef?.reference || response.reference || '';
      // Update commission status to paid on backend
      await apiClient.patch(
        `/api/projects/${projectId}/commission-status`,
        {
          status: 'paid',
          comment: `Mobile payment via Paystack. Ref: ${paystackReference}. Commission ID: ${fee?.id}`,
        },
        {
          timeout: 30000, // 30 second timeout (backend sends emails, creates earnings)
        }
      );
      // Call success callback FIRST (parent will close modal, show dialog and refresh)
      if (onPaymentSuccess) {
        onPaymentSuccess({ amount: fee?.amount || 0, marketerName: fee?.marketer?.name, reference: paystackReference });
      }
      
      // Close the modal to prevent double payment
      onClose();
    } catch (error: any) {
      const paystackReference = response.transactionRef?.reference || response.reference || '';
      
      // Call success callback FIRST (parent will close modal and refresh)
      if (onPaymentSuccess) {
        onPaymentSuccess({ amount: fee?.amount || 0, marketerName: fee?.marketer?.name, reference: paystackReference });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaystackCancel = (): void => {
    // Handle cancel if needed
  };

  if (!visible || !fee) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Pay Marketer Commission</Text>
            <TouchableOpacity
              style={[styles.closeButton, {
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent',
              }]}
              onPress={onClose}
              disabled={isProcessing}
            >
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Commission Summary */}
            <View style={[styles.summarySection, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.summaryTitle, { color: colors.text }]}>Commission Details</Text>
              
              <View style={styles.summaryRow}>
                <View style={styles.labelWithIcon}>
                  <User size={14} color={colors.iconSecondary} />
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Marketer:</Text>
                </View>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {fee.marketer?.name || 'Unknown Marketer'}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.labelWithIcon}>
                  <Briefcase size={14} color={colors.iconSecondary} />
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Project:</Text>
                </View>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {fee.project?.projectName || 'Project Commission'}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.labelWithIcon}>
                  <Percent size={14} color={colors.iconSecondary} />
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Commission Rate:</Text>
                </View>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {fee.percentage || fee.commissionRate}%
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Total Amount:</Text>
                <Text style={[styles.totalAmount, { color: COLORS.APP_GREEN }]}>
                  {formatCurrency(fee.amount)}
                </Text>
              </View>
            </View>

            {/* Payment Info */}
            <View style={[styles.infoBox, { backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' }]}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Your payment will be processed securely via Paystack. The marketer will be notified once payment is complete.
              </Text>
            </View>

            {/* Pay Button */}
            <TouchableOpacity
              style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
              onPress={handlePayNow}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={COLORS.WHITE} />
              ) : (
                <>
                  <CreditCard size={20} color={COLORS.WHITE} strokeWidth={2} />
                  <Text style={styles.payButtonText}>Pay {formatCurrency(fee.amount)}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>

          {/* Hidden Paystack WebView */}
          <Paystack
            ref={paystackWebViewRef}
            paystackKey={PAYSTACK_CONFIG.publicKey}
            billingEmail={fee.marketer?.email || 'marketer@example.com'}
            amount={fee.amount * 100} // Convert to pesewas
            currency="GHS"
            channels={['card', 'mobile_money', 'bank']}
            onCancel={handlePaystackCancel}
            onSuccess={handlePaystackSuccess}
            metadata={{
              commission_id: fee.id,
              fee_type: 'marketer_commission',
              project_id: fee.project?.id,
              marketer_id: fee.marketer?.id,
              client_type: fee.clientType,
            }}
          />
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
    maxHeight: '85%',
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
    marginBottom: SPACING.md,
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
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.sm,
  },
  summaryValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
    marginHorizontal: -SPACING.md, // Negative margin to extend to modal edges
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  totalAmount: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  infoBox: {
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  payButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 8,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default MarketerFeePaymentModal;






