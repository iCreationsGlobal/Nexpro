import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FormSheetModal } from '@/components/FormSheetModal';
import { FontFamily, FontSize } from '@/constants/typography';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  parsePaymentAmount,
  RENTAL_PAYMENT_METHODS,
  validateRecordedPaymentAmount,
  type PaymentAmountType,
  type RentalPaymentMethod,
} from '@/utils/recordPayment';

type RentalRecordPaymentSheetProps = {
  visible: boolean;
  balance: number;
  onClose: () => void;
  onSubmit: (payload: {
    amount: number;
    paymentMethod: RentalPaymentMethod;
    referenceNumber?: string;
    notes?: string;
  }) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  tintColor: string;
};

export function RentalRecordPaymentSheet({
  visible,
  balance,
  onClose,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  tintColor,
}: RentalRecordPaymentSheetProps) {
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentAmountType>('full');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<RentalPaymentMethod>('cash');
  const isLocked = disabled || isSubmitting;
  const resolvedAmount = paymentType === 'full' ? balance : parsePaymentAmount(paymentAmount);
  const paymentError = validateRecordedPaymentAmount(resolvedAmount, balance, paymentType);

  useEffect(() => {
    if (!visible) return;
    setPaymentAmount(balance > 0 ? balance.toFixed(2) : '');
    setPaymentType('full');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentMethod('cash');
  }, [visible]);

  const handleSubmit = () => {
    if (paymentError) return;
    onSubmit({
      amount: resolvedAmount,
      paymentMethod,
      referenceNumber: paymentReference.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    });
  };

  return (
    <FormSheetModal
      visible={visible}
      title="Record payment"
      onClose={onClose}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      footer={
        <View style={styles.sheetActions}>
          <Pressable
            onPress={onClose}
            disabled={isLocked}
            style={[
              styles.sheetButton,
              styles.sheetButtonSecondary,
              { borderColor },
              isLocked && styles.disabledButton,
            ]}
          >
            <Text style={[styles.sheetButtonText, { color: textColor }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={isLocked || Boolean(paymentError)}
            style={[
              styles.sheetButton,
              styles.sheetButtonPrimary,
              { backgroundColor: tintColor, borderColor: tintColor },
              (isLocked || Boolean(paymentError)) && styles.disabledButton,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sheetButtonPrimaryText}>
                {paymentType === 'partial' ? 'Record part payment' : 'Record Payment'}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={styles.paymentSummary}>
        <Text style={[styles.paymentSummaryLabel, { color: mutedColor }]}>Outstanding hire balance</Text>
        <Text style={[styles.paymentSummaryValue, { color: textColor }]}>{formatCurrency(balance)}</Text>
      </View>
      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: mutedColor }]}>Payment type</Text>
        <View style={styles.methodRow}>
          {([
            { value: 'full', label: 'Full payment' },
            { value: 'partial', label: 'Part payment' },
          ] as const).map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                setPaymentType(option.value);
                setPaymentAmount(option.value === 'full' && balance > 0 ? balance.toFixed(2) : '');
              }}
              disabled={isLocked}
              style={[
                styles.methodChip,
                { borderColor },
                paymentType === option.value && { backgroundColor: tintColor, borderColor: tintColor },
                isLocked && styles.disabledButton,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.methodChipText,
                  { color: paymentType === option.value ? '#fff' : textColor },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: mutedColor }]}>
          {paymentType === 'partial' ? 'Amount paid now' : 'Amount'}
        </Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor: cardBg }]}
          value={paymentType === 'full' && balance > 0 ? balance.toFixed(2) : paymentAmount}
          onChangeText={(value) => {
            setPaymentType('partial');
            setPaymentAmount(value);
          }}
          keyboardType="decimal-pad"
          placeholder={balance.toFixed(2)}
          placeholderTextColor={mutedColor}
          returnKeyType="done"
          editable={!isLocked}
        />
        {paymentType === 'partial' && !paymentError ? (
          <Text style={[styles.hint, { color: mutedColor }]}>
            Remaining after this payment: {formatCurrency(Math.max(0, balance - (Number.isFinite(resolvedAmount) ? resolvedAmount : 0)))}
          </Text>
        ) : null}
        {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}
      </View>
      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: mutedColor }]}>Payment method</Text>
        <View style={styles.methodRow}>
          {RENTAL_PAYMENT_METHODS.map((method) => (
            <Pressable
              key={method.value}
              onPress={() => setPaymentMethod(method.value)}
              disabled={isLocked}
              style={[
                styles.methodChip,
                { borderColor },
                paymentMethod === method.value && { backgroundColor: tintColor, borderColor: tintColor },
                isLocked && styles.disabledButton,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.methodChipText,
                  { color: paymentMethod === method.value ? '#fff' : textColor },
                ]}
              >
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: mutedColor }]}>Reference number (optional)</Text>
        <TextInput
          style={[styles.input, { color: textColor, borderColor, backgroundColor: cardBg }]}
          value={paymentReference}
          onChangeText={setPaymentReference}
          placeholder="Receipt, transfer, or MoMo reference"
          placeholderTextColor={mutedColor}
          autoCapitalize="characters"
          returnKeyType="done"
          editable={!isLocked}
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: mutedColor }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: textColor, borderColor, backgroundColor: cardBg }]}
          value={paymentNotes}
          onChangeText={setPaymentNotes}
          placeholder="Payment notes"
          placeholderTextColor={mutedColor}
          multiline
          editable={!isLocked}
        />
      </View>
    </FormSheetModal>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  formGroup: { marginBottom: 18 },
  paymentSummary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    padding: 14,
    marginBottom: 18,
  },
  paymentSummaryLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  paymentSummaryValue: { fontFamily: FontFamily.bold, fontSize: FontSize.title, fontWeight: '700' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    minHeight: 44,
    minWidth: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  methodChipText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, fontWeight: '600', lineHeight: 16, textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  errorText: { color: '#b45309', fontSize: 12, lineHeight: 16, marginTop: 8, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sheetButtonSecondary: { backgroundColor: 'transparent' },
  sheetButtonPrimary: {},
  sheetButtonText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, fontWeight: '700' },
  sheetButtonPrimaryText: { color: '#fff', fontFamily: FontFamily.bold, fontSize: FontSize.md, fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
});
