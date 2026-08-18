import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, TouchableOpacity, ScrollView } from 'react-native';
import { AlertCircle, Info, CreditCard, TrendingDown, CheckCircle } from 'lucide-react-native';
import { Button } from 'react-native-paper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface CashoutConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalAmount: number;
  feeAmount: number;
  finalAmount: number;
  withdrawalFee: number;
  paymentProvider: string;
  paymentNumber: string;
  isLoading?: boolean;
}

const CashoutConfirmationModal: React.FC<CashoutConfirmationModalProps> = ({ 
  visible, 
  onClose, 
  onConfirm,
  totalAmount,
  feeAmount,
  finalAmount,
  withdrawalFee,
  paymentProvider,
  paymentNumber,
  isLoading = false
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalCard,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <AlertCircle size={32} color={COLORS.APP_GREEN} strokeWidth={2} />
              </View>
              <Text style={styles.title}>Confirm Cashout Request</Text>
              <Text style={styles.subtitle}>Please review your withdrawal details</Text>
            </View>

            {/* Amount Breakdown */}
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>Amount Breakdown</Text>
              
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Total Earnings</Text>
                <Text style={styles.breakdownValue}>₵{totalAmount.toFixed(2)}</Text>
              </View>

              <View style={styles.breakdownRow}>
                <View style={styles.feeLabel}>
                  <TrendingDown size={16} color="#EF4444" strokeWidth={2} />
                  <Text style={[styles.breakdownLabel, { color: '#EF4444' }]}>
                    Withdrawal Fee ({withdrawalFee}%)
                  </Text>
                </View>
                <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>- ₵{feeAmount.toFixed(2)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.breakdownRow}>
                <Text style={styles.finalLabel}>You Will Receive</Text>
                <Text style={styles.finalValue}>₵{finalAmount.toFixed(2)}</Text>
              </View>
            </View>

            {/* Payment Details */}
            <View style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <CreditCard size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
                <Text style={styles.paymentTitle}>Payment Destination</Text>
              </View>
              <Text style={styles.paymentProvider}>{paymentProvider}</Text>
              <Text style={styles.paymentNumber}>{paymentNumber}</Text>
            </View>

            {/* Important Notice */}
            <View style={styles.noticeCard}>
              <View style={styles.noticeHeader}>
                <Info size={18} color="#F59E0B" strokeWidth={2} />
                <Text style={styles.noticeTitle}>Important Notice</Text>
              </View>
              <Text style={styles.noticeText}>
                The final amount you receive may be slightly less due to additional charges from your mobile money provider (e.g., transaction fees, tax). These charges are determined by {paymentProvider} and are outside our control.
              </Text>
            </View>

            {/* Processing Time */}
            <View style={styles.infoRow}>
              <CheckCircle size={16} color="#10B981" strokeWidth={2} />
              <Text style={styles.infoText}>Payments are typically processed within 1-3 business days</Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <Button
              mode="contained"
              onPress={onConfirm}
              style={styles.confirmButton}
              contentStyle={styles.confirmButtonContent}
              labelStyle={styles.confirmButtonLabel}
              disabled={isLoading}
              loading={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm Cashout'}
            </Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: '#6B7280',
    textAlign: 'center',
  },
  breakdownCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  breakdownTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#111827',
    marginBottom: SPACING.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  feeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownLabel: {
    fontSize: FONT_SIZES.sm,
    color: '#6B7280',
  },
  breakdownValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: SPACING.sm,
  },
  finalLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
  },
  finalValue: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  paymentCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.xs,
  },
  paymentTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#111827',
  },
  paymentProvider: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
    marginBottom: 4,
  },
  paymentNumber: {
    fontSize: FONT_SIZES.sm,
    color: '#6B7280',
  },
  noticeCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.xs,
  },
  noticeTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#92400E',
  },
  noticeText: {
    fontSize: FONT_SIZES.xs,
    color: '#78350F',
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: '#6B7280',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
  },
  confirmButtonContent: {
    paddingVertical: 4,
  },
  confirmButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default CashoutConfirmationModal;






