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
import * as DocumentPicker from 'expo-document-picker';

import { FormSheetModal } from '@/components/FormSheetModal';
import { AppIcon } from '@/components/AppIcon';
import { ContactPickerSearchBar } from '@/components/ContactPickerSearchBar';
import {
  contactImportService,
  type ContactImportDestination,
  type ContactImportItem,
} from '@/services/contactImportService';
import {
  loadDeviceContacts,
  refreshLimitedDeviceContacts,
  resetAccessPickerGuard,
} from '@/utils/deviceContacts';
import { filterDeviceContactRows } from '@/utils/filterDeviceContacts';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { logger } from '@/utils/logger';

type Props = {
  visible: boolean;
  onClose: () => void;
  defaultDestination?: ContactImportDestination;
  onImported?: () => void;
  colors: { tint: string };
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
};

type PhoneContactRow = ContactImportItem & { id: string };

/**
 * Mobile import sheet: destination + From phone / From file.
 */
export function ImportContactsSheet({
  visible,
  onClose,
  defaultDestination = 'customers',
  onImported,
  colors,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
}: Props) {
  const [destination, setDestination] = useState<ContactImportDestination>(defaultDestination);
  const [mode, setMode] = useState<'menu' | 'phone'>('menu');
  const [phoneRows, setPhoneRows] = useState<PhoneContactRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsAccessLimited, setContactsAccessLimited] = useState(false);
  const [contactsAccessDenied, setContactsAccessDenied] = useState(false);
  const [hiddenForPicker, setHiddenForPicker] = useState(false);
  const [searchText, setSearchText] = useState('');

  const filteredPhoneRows = useMemo(
    () => filterDeviceContactRows(phoneRows, searchText),
    [phoneRows, searchText]
  );

  useEffect(() => {
    if (visible) {
      setDestination(defaultDestination);
      setMode('menu');
      setPhoneRows([]);
      setSelectedIds(new Set());
      setLoading(false);
      setLoadingContacts(false);
      setContactsAccessLimited(false);
      setContactsAccessDenied(false);
      setHiddenForPicker(false);
      setSearchText('');
      return;
    }

    setHiddenForPicker(false);
    resetAccessPickerGuard();
  }, [defaultDestination, visible]);

  const selectedContacts = useMemo(
    () => phoneRows.filter((row) => selectedIds.has(row.id)),
    [phoneRows, selectedIds]
  );

  const handleLoadPhoneContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const result = await loadDeviceContacts();
      if (!result) {
        setContactsAccessDenied(true);
        setPhoneRows([]);
        setMode('phone');
        return;
      }

      setContactsAccessDenied(false);
      setContactsAccessLimited(result.accessLimited);
      setPhoneRows(result.rows);
      setSelectedIds(new Set());
      setSearchText('');
      setMode('phone');
    } catch (error) {
      Alert.alert('Could not load contacts', getApiErrorMessage(error, 'Try again or use file import.'));
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const handleSelectMoreContacts = useCallback(async () => {
    logger.debug('Contacts', 'Import sheet select contacts tapped', {
      accessLimited: contactsAccessLimited,
      accessDenied: contactsAccessDenied,
      rowCount: phoneRows.length,
      loadingContacts,
    });
    setLoadingContacts(true);
    try {
      const result = await refreshLimitedDeviceContacts({
        hideModal: () => setHiddenForPicker(true),
        showModal: () => setHiddenForPicker(false),
      });
      if (!result) {
        setContactsAccessDenied(true);
        return;
      }
      logger.debug('Contacts', 'Import sheet select contacts complete', { count: result.rows.length });
      setContactsAccessDenied(false);
      setContactsAccessLimited(result.accessLimited);
      setPhoneRows(result.rows);
      setSelectedIds(new Set());
      setSearchText('');
    } catch (error) {
      logger.error('Contacts', 'Import sheet select contacts failed', error);
      Alert.alert(
        'Could not open contact picker',
        getApiErrorMessage(error, 'Allow contacts access in Settings, then try again.')
      );
    } finally {
      setLoadingContacts(false);
    }
  }, [contactsAccessDenied, contactsAccessLimited, loadingContacts, phoneRows.length]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = useMemo(() => {
    if (filteredPhoneRows.length === 0) return false;
    return filteredPhoneRows.every((row) => selectedIds.has(row.id));
  }, [filteredPhoneRows, selectedIds]);

  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredPhoneRows.map((row) => row.id);
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [filteredPhoneRows]);

  const handleImportSelected = useCallback(async () => {
    if (!selectedContacts.length) {
      Alert.alert('Select contacts', 'Choose at least one contact to import.');
      return;
    }
    setLoading(true);
    try {
      const result = await contactImportService.importFromContacts(
        destination,
        selectedContacts.map(({ name, phone, email }) => ({ name, phone, email }))
      );
      const created = result.successCount || 0;
      const skipped = result.skippedCount || 0;
      Alert.alert(
        'Import complete',
        `Created ${created}. Skipped ${skipped}. Errors ${result.errorCount || 0}.`
      );
      if (created > 0) onImported?.();
      onClose();
    } catch (error) {
      Alert.alert('Import failed', getApiErrorMessage(error, 'Could not import contacts.'));
    } finally {
      setLoading(false);
    }
  }, [destination, onClose, onImported, selectedContacts]);

  const handleImportFile = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      setLoading(true);
      const result = await contactImportService.importFromFile(destination, {
        uri: asset.uri,
        name: asset.name || 'contacts.csv',
        mimeType: asset.mimeType,
      });
      const created = result.successCount || 0;
      const skipped = result.skippedCount || 0;
      Alert.alert(
        'Import complete',
        `Created ${created}. Skipped ${skipped}. Errors ${result.errorCount || 0}.`
      );
      if (created > 0) onImported?.();
      onClose();
    } catch (error) {
      Alert.alert('Import failed', getApiErrorMessage(error, 'Could not import file.'));
    } finally {
      setLoading(false);
    }
  }, [destination, onClose, onImported]);

  return (
    hiddenForPicker ? null : (
    <FormSheetModal
      visible={visible}
      title="Import contacts"
      onClose={onClose}
      scrollable={mode !== 'phone'}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      footer={
        mode === 'phone' ? (
          <View style={styles.footerRow}>
            <Pressable
              onPress={() => setMode('menu')}
              style={[styles.secondaryBtn, { borderColor }]}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handleImportSelected}
              disabled={loading || selectedContacts.length === 0}
              style={[styles.primaryBtn, { backgroundColor: colors.tint, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Import ({selectedContacts.length})
                </Text>
              )}
            </Pressable>
          </View>
        ) : null
      }
    >
      <View style={[styles.body, mode === 'phone' && styles.bodyPhone]}>
        <Text style={[styles.label, { color: mutedColor }]}>Import into</Text>
        <View style={styles.destRow}>
          {(['customers', 'leads'] as const).map((value) => {
            const active = destination === value;
            return (
              <Pressable
                key={value}
                onPress={() => setDestination(value)}
                style={[
                  styles.destChip,
                  {
                    borderColor: active ? colors.tint : borderColor,
                    backgroundColor: active ? `${colors.tint}18` : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: active ? colors.tint : textColor, fontWeight: '600' }}>
                  {value === 'customers' ? 'Customers' : 'Leads'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'menu' ? (
          <View style={styles.menu}>
            <Pressable
              onPress={handleLoadPhoneContacts}
              disabled={loadingContacts}
              style={[styles.menuBtn, { borderColor }]}
            >
              {loadingContacts ? (
                <ActivityIndicator color={colors.tint} />
              ) : (
                <Text style={[styles.menuBtnText, { color: textColor }]}>From phone contacts</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleImportFile}
              disabled={loading}
              style={[styles.menuBtn, { borderColor }]}
            >
              {loading ? (
                <ActivityIndicator color={colors.tint} />
              ) : (
                <Text style={[styles.menuBtnText, { color: textColor }]}>From CSV / Excel file</Text>
              )}
            </Pressable>
            <Text style={[styles.hint, { color: mutedColor }]}>
              Phone import asks for permission. Duplicates are skipped.
            </Text>
          </View>
        ) : (
          <View style={styles.phoneList}>
            <View style={styles.phoneHeader}>
              <Text style={[styles.label, { color: mutedColor }]}>
                {searchText.trim()
                  ? `${filteredPhoneRows.length} of ${phoneRows.length} contacts`
                  : `${phoneRows.length} contacts`}
              </Text>
              {filteredPhoneRows.length > 0 ? (
                <Pressable onPress={toggleSelectAllVisible}>
                  <Text style={{ color: colors.tint, fontWeight: '600' }}>
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {phoneRows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No contacts found</Text>
                <Text style={[styles.hint, { color: mutedColor }]}>
                  {contactsAccessDenied
                    ? 'Allow ABS to access your phone contacts when prompted, or enable Contacts in Settings.'
                    : contactsAccessLimited
                      ? 'You may have allowed only selected contacts. Choose which contacts ABS can access, or allow full access in Settings.'
                      : 'Add contacts in your phone’s Contacts app, then try again. Simulators often have no contacts — test on a real device.'}
                </Text>
                <Pressable
                  onPress={handleSelectMoreContacts}
                  disabled={loadingContacts}
                  style={[styles.menuBtn, { borderColor, marginTop: 12 }]}
                >
                  {loadingContacts ? (
                    <ActivityIndicator color={colors.tint} />
                  ) : (
                    <Text style={[styles.menuBtnText, { color: colors.tint }]}>
                      {contactsAccessDenied ? 'Allow access to contacts' : 'Select contacts'}
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
                {filteredPhoneRows.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyTitle, { color: textColor }]}>No matching contacts</Text>
                    <Text style={[styles.hint, { color: mutedColor }]}>
                      Try a different name, phone, or email.
                    </Text>
                  </View>
                ) : (
              <FlatList
                data={filteredPhoneRows}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <Pressable
                      onPress={() => toggleSelected(item.id)}
                      style={[styles.contactRow, { borderColor }]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          selected ? styles.checkboxChecked : styles.checkboxUnchecked,
                          selected && { borderColor: colors.tint, backgroundColor: colors.tint },
                        ]}
                      >
                        {selected ? <AppIcon name="check" size={14} color="#fff" /> : null}
                      </View>
                      <View style={styles.contactText}>
                        <Text style={[styles.contactName, { color: textColor }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={{ color: mutedColor, fontSize: 12 }} numberOfLines={1}>
                          {[item.phone, item.email].filter(Boolean).join(' · ') || 'No phone/email'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
                )}
              </>
            )}
          </View>
        )}
      </View>
    </FormSheetModal>
    )
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 12, minHeight: 220 },
  bodyPhone: { minHeight: 0 },
  label: { fontSize: 13, fontWeight: '600' },
  destRow: { flexDirection: 'row', gap: 8 },
  destChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  menu: { gap: 10, marginTop: 8 },
  menuBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  menuBtnText: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18 },
  phoneList: { flex: 1, minHeight: 280 },
  phoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  emptyState: { flex: 1, justifyContent: 'center', paddingVertical: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxUnchecked: {
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {},
  contactText: { flex: 1, minWidth: 0 },
  contactName: { fontSize: 14, fontWeight: '600' },
  footerRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '600' },
  primaryBtn: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
});
