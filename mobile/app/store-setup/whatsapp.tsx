import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';

import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { FormLabel, FormInput } from '@/components/FormField';
import { StoreSetupChrome } from '@/components/store/StoreSetupChrome';
import { useAuth } from '@/context/AuthContext';
import { useStoreSetup, useStoreSetupEditing } from '@/context/StoreSetupContext';
import { formatDisplayPhone } from '@/utils/displayPhone';
import { getErrorMessage } from '@/utils/errorMessages';
import { useScreenColors } from '@/hooks/useScreenColors';

/**
 * Step 2 — WhatsApp when org has neither WhatsApp nor phone.
 * Navigate first; contact save runs in the background.
 */
export default function StoreSetupWhatsappScreen() {
  const { hasFeature } = useAuth();
  const { textColor, mutedColor } = useScreenColors();
  const { loading, gapFlags, defaults, settings, persistSoftAndAdvance, saveLiveEdit, closeEditor } =
    useStoreSetup();
  const editing = useStoreSetupEditing();
  const savedNumber = formatDisplayPhone(settings?.whatsappNumber || settings?.contactPhone);
  const [whatsapp, setWhatsapp] = useState(() =>
    editing
      ? savedNumber
      : formatDisplayPhone(
          settings?.whatsappNumber || settings?.contactPhone || defaults.whatsappNumber || defaults.contactPhone
        )
  );
  const [saving, setSaving] = useState(false);

  // Editors open before the saved settings arrive; start from the saved number once they do.
  useEffect(() => {
    if (editing && !loading) setWhatsapp((prev) => prev || savedNumber);
  }, [editing, loading, savedNumber]);

  const onContinue = useCallback(async () => {
    const value = formatDisplayPhone(whatsapp);
    if (!value) {
      Alert.alert('WhatsApp required', 'Add a WhatsApp number so customers can reach you.');
      return;
    }
    if (editing) {
      // The contact phone can differ from WhatsApp (set on the web); only fill it when it's empty.
      const changes: Record<string, unknown> = { whatsappNumber: value };
      if (!String(settings?.contactPhone || '').trim()) changes.contactPhone = value;
      setSaving(true);
      try {
        await saveLiveEdit(changes);
        closeEditor();
      } catch (error) {
        Alert.alert('Could not save', getErrorMessage(error, 'Failed to save WhatsApp number.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    persistSoftAndAdvance(
      'whatsapp',
      { whatsappNumber: value, contactPhone: value },
      { whatsappNumber: value, contactPhone: value }
    );
  }, [closeEditor, editing, persistSoftAndAdvance, saveLiveEdit, settings?.contactPhone, whatsapp]);

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store is not enabled for your workspace." />;
  }

  if (editing && loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <StoreSetupChrome
      stepId="whatsapp"
      gapFlags={gapFlags}
      onContinue={() => {
        void onContinue();
      }}
      continueLabel={editing ? 'Save' : 'Continue'}
      continueDisabled={!whatsapp.trim()}
      continuing={saving}
      editing={editing}
    >
      <Text style={[styles.headline, { color: textColor }]}>WhatsApp number</Text>
      <Text style={[styles.body, { color: mutedColor }]}>
        Customers use this to message you about orders. Ghana numbers work best (e.g. 024…).
      </Text>
      <View>
        <FormLabel>WhatsApp number</FormLabel>
        <FormInput
          value={whatsapp}
          onChangeText={setWhatsapp}
          placeholder="024 XXX XXXX"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>
    </StoreSetupChrome>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: -4,
  },
});
