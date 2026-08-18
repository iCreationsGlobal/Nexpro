import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

import { FormSheetModal } from '@/components/FormSheetModal';
import { CURRENCY } from '@/constants';
import { parseDecimalInput } from '@/utils/formatCurrency';

type CartAmountMode = 'price' | 'discount';

type CartAmountItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  discount?: number;
};

type CartAmountSheetProps = {
  visible: boolean;
  mode: CartAmountMode;
  item: CartAmountItem | null;
  onClose: () => void;
  onApply: (itemId: string, amount: number) => void;
  cardBg?: string;
  borderColor?: string;
  textColor?: string;
  mutedColor?: string;
  inputBg?: string;
  tintColor?: string;
};

/**
 * Sheet to edit a cart line unit price or line discount amount.
 */
export function CartAmountSheet({
  visible,
  mode,
  item,
  onClose,
  onApply,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  inputBg,
  tintColor = '#166534',
}: CartAmountSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && item) {
      const initial =
        mode === 'price' ? Number(item.unitPrice) || 0 : Math.max(0, Number(item.discount) || 0);
      setValue(String(initial));
      setError('');
    }
  }, [visible, item, mode]);

  const title =
    mode === 'price'
      ? item
        ? `Edit price: ${item.name}`
        : 'Edit price'
      : item
        ? `Discount: ${item.name}`
        : 'Discount';

  const helper =
    mode === 'price'
      ? `Sale price per unit (${CURRENCY.SYMBOL})`
      : `Discount amount for this line (${CURRENCY.SYMBOL})`;

  const handleApply = useCallback(() => {
    if (!item) return;
    const amount = parseDecimalInput(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid amount');
      return;
    }
    if (mode === 'discount') {
      const lineGross = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
      if (amount > lineGross) {
        setError('Discount cannot exceed the line total');
        return;
      }
    }
    onApply(item.id, amount);
    onClose();
  }, [item, value, mode, onApply, onClose]);

  return (
    <FormSheetModal
      visible={visible}
      title={title}
      onClose={onClose}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      footer={
        <View style={styles.footerActions}>
          <Pressable
            onPress={onClose}
            style={[styles.secondaryBtn, { borderColor }]}
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.secondaryBtnText, { color: textColor }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleApply}
            style={[styles.primaryBtn, { backgroundColor: tintColor }]}
            accessibilityLabel="Apply"
          >
            <Text style={styles.primaryBtnText}>Apply</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={[styles.label, { color: mutedColor }]}>{helper}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: textColor,
            borderColor,
            backgroundColor: inputBg,
          },
        ]}
        value={value}
        onChangeText={(text) => {
          setValue(text.replace(/[^\d.]/g, ''));
          setError('');
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={mode === 'price' ? 'Unit price' : 'Discount amount'}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </FormSheetModal>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#dc2626',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
