import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';

import { ContactPickerSearchBar } from '@/components/ContactPickerSearchBar';
import { FormSheetModal } from '@/components/FormSheetModal';
import {
  loadDeviceContacts,
  refreshLimitedDeviceContacts,
  resetAccessPickerGuard,
  type CustomerFormFromContact,
  type DeviceContactRow,
} from '@/utils/deviceContacts';
import { filterDeviceContactRows } from '@/utils/filterDeviceContacts';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { logger } from '@/utils/logger';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: CustomerFormFromContact) => void;
  colors: { tint: string };
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

/**
 * Single-select contact picker for pre-filling a customer form.
 */
export function PickContactSheet({
  visible,
  onClose,
  onSelect,
  colors,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
}: Props) {
  const [rows, setRows] = useState<DeviceContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [accessLimited, setAccessLimited] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [hiddenForPicker, setHiddenForPicker] = useState(false);
  const [searchText, setSearchText] = useState('');

  const filteredRows = useMemo(
    () => filterDeviceContactRows(rows, searchText),
    [rows, searchText]
  );

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadDeviceContacts();
      if (!result) {
        setRows([]);
        setAccessLimited(false);
        setAccessDenied(true);
        return;
      }
      setRows(result.rows);
      setAccessLimited(result.accessLimited);
      setAccessDenied(false);
    } catch (error) {
      Alert.alert('Could not load contacts', getApiErrorMessage(error, 'Try again later.'));
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setRows([]);
      setAccessLimited(false);
      setAccessDenied(false);
      setHiddenForPicker(false);
      setSearchText('');
      loadContacts();
      return;
    }

    setHiddenForPicker(false);
    resetAccessPickerGuard();
  }, [visible, loadContacts]);

  const handleSelectMoreContacts = useCallback(async () => {
    logger.debug('Contacts', 'Select contacts tapped', {
      accessLimited,
      accessDenied,
      rowCount: rows.length,
      loading,
    });
    setLoading(true);
    try {
      const result = await refreshLimitedDeviceContacts({
        hideModal: () => setHiddenForPicker(true),
        showModal: () => setHiddenForPicker(false),
      });
      if (!result) {
        setAccessDenied(true);
        return;
      }
      logger.debug('Contacts', 'Select contacts complete', { count: result.rows.length });
      setRows(result.rows);
      setAccessLimited(result.accessLimited);
      setAccessDenied(false);
      setSearchText('');
    } catch (error) {
      logger.error('Contacts', 'Select contacts failed', error);
      Alert.alert(
        'Could not open contact picker',
        getApiErrorMessage(error, 'Allow contacts access in Settings, then try again.')
      );
    } finally {
      setLoading(false);
    }
  }, [accessDenied, accessLimited, loading, rows.length]);

  const handleSelectContact = useCallback(
    (row: DeviceContactRow) => {
      onSelect({
        name: row.name,
        phone: row.phone || '',
        email: row.email || '',
        company: row.company || '',
      });
      onClose();
    },
    [onClose, onSelect]
  );

  return (
    hiddenForPicker ? null : (
    <FormSheetModal
      visible={visible}
      title="Choose contact"
      onClose={onClose}
      scrollable={false}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
    >
      <View style={styles.body}>
        {loading && rows.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.hint, { color: mutedColor, marginTop: 12 }]}>Loading contacts…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No contacts found</Text>
            <Text style={[styles.hint, { color: mutedColor }]}>
              {accessDenied
                ? 'Allow ABS to access your phone contacts when prompted, or enable Contacts in Settings.'
                : accessLimited
                  ? 'You may have allowed only selected contacts. Choose which contacts ABS can access, or allow full access in Settings.'
                  : 'Add contacts in your phone’s Contacts app, then try again. Simulators often have no contacts — test on a real device.'}
            </Text>
            <Pressable
              onPress={handleSelectMoreContacts}
              disabled={loading}
              style={[styles.menuBtn, { borderColor, marginTop: 12 }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.tint} />
              ) : (
                <Text style={[styles.menuBtnText, { color: colors.tint }]}>
                  {accessDenied ? 'Allow access to contacts' : 'Select contacts'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <ContactPickerSearchBar
              value={searchText}
              onChangeText={setSearchText}
              borderColor={borderColor}
              textColor={textColor}
              mutedColor={mutedColor}
              inputBg={cardBg}
            />
            <Text style={[styles.label, { color: mutedColor }]}>
              {searchText.trim()
                ? `${filteredRows.length} of ${rows.length} contacts`
                : `${rows.length} contacts`}
            </Text>
            {filteredRows.length === 0 ? (
              <View style={styles.centered}>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No matching contacts</Text>
                <Text style={[styles.hint, { color: mutedColor }]}>Try a different name, phone, or email.</Text>
              </View>
            ) : (
            <FlatList
              data={filteredRows}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectContact(item)}
                  style={[styles.contactRow, { borderColor }]}
                >
                  <View style={styles.contactText}>
                    <Text style={[styles.contactName, { color: textColor }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: mutedColor, fontSize: 12 }} numberOfLines={1}>
                      {[item.phone, item.email, item.company].filter(Boolean).join(' · ') ||
                        'No phone/email'}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
            )}
            {accessLimited ? (
              <Pressable
                onPress={handleSelectMoreContacts}
                disabled={loading}
                style={[styles.menuBtn, { borderColor, marginTop: 8 }]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.tint} />
                ) : (
                  <Text style={[styles.menuBtnText, { color: colors.tint }]}>Select more contacts</Text>
                )}
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </FormSheetModal>
    )
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 280 },
  centered: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  contactRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  contactText: { flex: 1, minWidth: 0 },
  contactName: { fontSize: 14, fontWeight: '600' },
  menuBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  menuBtnText: { fontSize: 15, fontWeight: '600' },
});
