import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppBottomSheet, APP_SHEET_HEIGHT_TALL } from '@/components/AppBottomSheet';
import { SimpleBigButton, SimpleField, simpleStyles } from '@/components/simple/SimpleUI';
import { useScreenColors } from '@/hooks/useScreenColors';
import { customerService } from '@/services/customerService';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDisplayPhone } from '@/utils/displayPhone';
import { openWhatsAppChat } from '@/utils/whatsapp';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { FontFamily } from '@/constants/typography';

type AnyCustomer = Record<string, any>;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Simple Mode customer form: name, phone, optional email. An existing customer also shows what
 * they owe (unpaid invoices) and one-tap Call / WhatsApp.
 */
export function SimpleCustomerSheet({ visible, customer, onClose }: {
  visible: boolean; customer: AnyCustomer | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { textColor, mutedColor, borderColor, cardBg } = useScreenColors();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(customer?.name || '');
    setPhone(formatDisplayPhone(customer?.phone));
    setEmail(customer?.email || '');
    setError('');
  }, [visible, customer]);

  const save = useMutation({
    mutationFn: (values: { name: string; phone?: string; email?: string }) => (
      customer?.id ? customerService.updateCustomer(String(customer.id), values) : customerService.createCustomer(values)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['simple'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err: unknown) => Alert.alert('Customer', getApiErrorMessage(err, 'Could not save this customer.')),
  });

  const handleSave = () => {
    if (name.trim().length < 2) return setError("Enter the customer's name.");
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) return setError('That email does not look right.');
    save.mutate({ name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined });
    return undefined;
  };

  const owes = Number(customer?.balance || 0);
  const dialPhone = formatDisplayPhone(customer?.phone);
  const inputStyle = [simpleStyles.input, { borderColor, color: textColor, backgroundColor: cardBg }];

  return (
    <AppBottomSheet visible={visible} title={customer ? customer.name || 'Customer' : 'Add Customer'} onClose={onClose} height={APP_SHEET_HEIGHT_TALL}>
      <View style={{ gap: 16, paddingBottom: 24 }}>
        {customer && owes > 0 ? (
          <View style={styles.owes}>
            <Text style={styles.owesLabel}>OWES YOU</Text>
            <Text style={styles.owesValue}>{formatCurrency(owes)}</Text>
          </View>
        ) : null}
        {customer && dialPhone ? (
          <View style={styles.contactRow}>
            <View style={{ flex: 1 }}>
              <SimpleBigButton label="Call" icon="phone" variant="outline" onPress={() => { void Linking.openURL(`tel:${dialPhone}`); }} />
            </View>
            <View style={{ flex: 1 }}>
              <SimpleBigButton
                label="WhatsApp"
                icon="comments"
                variant="outline"
                onPress={() => { void openWhatsAppChat({ phone: dialPhone, contactLabel: customer.name || 'This customer', defaultCountryCode: '233' }); }}
              />
            </View>
          </View>
        ) : null}

        <SimpleField label="Name">
          <TextInput value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="e.g. Ama Mensah"
            placeholderTextColor={mutedColor} style={inputStyle} accessibilityLabel="Name" />
        </SimpleField>
        <SimpleField label="Phone">
          <TextInput value={phone} onChangeText={(t) => { setPhone(t); setError(''); }} placeholder="e.g. 024 123 4567"
            placeholderTextColor={mutedColor} keyboardType="phone-pad" style={inputStyle} accessibilityLabel="Phone" />
        </SimpleField>
        <SimpleField label="Email (optional)">
          <TextInput value={email} onChangeText={(t) => { setEmail(t); setError(''); }} placeholder="e.g. ama@gmail.com"
            placeholderTextColor={mutedColor} keyboardType="email-address" autoCapitalize="none" style={inputStyle} accessibilityLabel="Email" />
        </SimpleField>

        {error ? <Text style={simpleStyles.error}>{error}</Text> : null}
        <SimpleBigButton label={customer ? 'Save changes' : 'Save customer'} icon="check" onPress={handleSave} loading={save.isPending} />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  owes: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 18, padding: 16 },
  owesLabel: { fontSize: 13, fontFamily: FontFamily.semiBold, color: '#b45309' },
  owesValue: { fontSize: 28, fontFamily: FontFamily.bold, color: '#78350f', marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: 12 },
});
