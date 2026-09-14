import { Alert, Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

import {
  mapContactToRow,
  type CustomerFormFromContact,
  type DeviceContactRow,
} from '@/utils/deviceContactMapping';
import { logger } from '@/utils/logger';

export type { CustomerFormFromContact, DeviceContactRow };
export {
  mapContactToCustomerForm,
  mapContactToRow,
  pickContactPhoneNumber,
} from '@/utils/deviceContactMapping';

export const MAX_CONTACTS = 500;
export const CONTACT_PAGE_SIZE = 100;

export const CONTACT_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.Name,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
  Contacts.Fields.Company,
];

function showContactsPickerBlockedAlert() {
  Alert.alert(
    'Choose contacts in Settings',
    'iOS could not open the contact picker from here. Open Settings → ABS → Contacts, choose contacts to share, or allow Full Access, then return and tap Select contacts again.',
    [
      { text: 'Not now', style: 'cancel' },
      ...(typeof Linking.openSettings === 'function'
        ? [{ text: 'Open Settings', onPress: () => Linking.openSettings() }]
        : []),
    ]
  );
}

function showContactsPermissionAlert(canAskAgain: boolean | undefined) {
  const message =
    canAskAgain === false
      ? 'Contacts access is turned off for ABS. Open Settings, tap Contacts, and allow access.'
      : 'Allow contacts access when prompted so we can read your phone contacts.';

  if (canAskAgain === false && typeof Linking.openSettings === 'function') {
    Alert.alert('Contacts access needed', message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return;
  }

  Alert.alert('Contacts access needed', message);
}

export async function ensureContactsPermission(): Promise<Contacts.ContactsPermissionResponse | null> {
  const available = await Contacts.isAvailableAsync();
  if (!available) {
    Alert.alert(
      'Contacts unavailable',
      'This device does not expose contacts to apps.'
    );
    return null;
  }

  let permission = await Contacts.getPermissionsAsync();
  if (permission.status !== 'granted' && permission.canAskAgain !== false) {
    permission = await Contacts.requestPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    showContactsPermissionAlert(permission.canAskAgain);
    return null;
  }

  return permission;
}

export async function fetchDeviceContacts(max = MAX_CONTACTS): Promise<DeviceContactRow[]> {
  const rows: DeviceContactRow[] = [];
  let pageOffset = 0;
  let hasNextPage = true;

  while (hasNextPage && rows.length < max) {
    const result = await Contacts.getContactsAsync({
      fields: CONTACT_FIELDS,
      pageSize: CONTACT_PAGE_SIZE,
      pageOffset,
      sort: Contacts.SortTypes.FirstName,
    });

    for (const [index, contact] of (result.data || []).entries()) {
      const row = mapContactToRow(contact, pageOffset + index);
      if (row) rows.push(row);
      if (rows.length >= max) break;
    }

    hasNextPage = result.hasNextPage;
    pageOffset += CONTACT_PAGE_SIZE;
  }

  return rows.slice(0, max);
}

export type LoadedDeviceContacts = {
  rows: DeviceContactRow[];
  accessLimited: boolean;
};

/** Wait for RN Modal dismiss animation before presenting native iOS picker. */
export const ACCESS_PICKER_MODAL_DISMISS_MS = 650;

let isAccessPickerPresenting = false;

export type ModalDismissCallbacks = {
  hideModal: () => void;
  showModal: () => void;
};

function isAccessPickerAlreadyPresentedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /already presented/i.test(message);
}

/** Clear in-flight picker guard (e.g. when contact sheet closes). */
export function resetAccessPickerGuard(): void {
  if (isAccessPickerPresenting) {
    logger.debug('DeviceContacts', 'resetAccessPickerGuard: clearing in-flight guard');
  }
  isAccessPickerPresenting = false;
}

async function waitForModalDismiss(ms = ACCESS_PICKER_MODAL_DISMISS_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function logPermissionSnapshot(label: string, permission: Contacts.ContactsPermissionResponse) {
  logger.debug('DeviceContacts', label, {
    status: permission.status,
    accessPrivileges: permission.accessPrivileges,
    canAskAgain: permission.canAskAgain,
  });
}

/**
 * Present iOS limited-access picker at most once at a time.
 * Returns false when skipped (in-flight guard or native "already presented").
 */
export async function presentLimitedAccessPicker(): Promise<boolean> {
  logger.debug('DeviceContacts', 'presentLimitedAccessPicker entry', {
    isAccessPickerPresenting,
  });

  if (isAccessPickerPresenting) {
    logger.debug('DeviceContacts', 'presentLimitedAccessPicker skipped: guard active');
    return false;
  }

  isAccessPickerPresenting = true;
  try {
    await Contacts.presentAccessPickerAsync();
    logger.debug('DeviceContacts', 'presentLimitedAccessPicker success');
    return true;
  } catch (error) {
    if (isAccessPickerAlreadyPresentedError(error)) {
      logger.warn('DeviceContacts', 'presentLimitedAccessPicker already presented', error);
      return false;
    }
    logger.error('DeviceContacts', 'presentLimitedAccessPicker failed', error);
    throw error;
  } finally {
    isAccessPickerPresenting = false;
    logger.debug('DeviceContacts', 'presentLimitedAccessPicker exit', {
      isAccessPickerPresenting,
    });
  }
}

/**
 * Request permission and fetch contacts. Does not auto-open the iOS limited-access picker.
 */
export async function loadDeviceContacts(): Promise<LoadedDeviceContacts | null> {
  const permission = await ensureContactsPermission();
  if (!permission) {
    logger.debug('DeviceContacts', 'loadDeviceContacts: permission denied or unavailable');
    return null;
  }

  logPermissionSnapshot('loadDeviceContacts permission', permission);

  const accessLimited = permission.accessPrivileges === 'limited';
  const rows = await fetchDeviceContacts();
  logger.debug('DeviceContacts', 'loadDeviceContacts loaded', {
    count: rows.length,
    accessLimited,
  });

  return { rows, accessLimited };
}

/**
 * User tapped "Select contacts" / "Allow access" — request permission, then open iOS limited picker if needed.
 * Pass modalDismiss to hide RN bottom sheets first — native picker cannot present over Modal.
 */
export async function refreshLimitedDeviceContacts(
  modalDismiss?: ModalDismissCallbacks
): Promise<LoadedDeviceContacts | null> {
  logger.debug('DeviceContacts', 'refreshLimitedDeviceContacts start', {
    hasModalDismiss: Boolean(modalDismiss),
  });

  if (modalDismiss) {
    logger.debug('DeviceContacts', 'refreshLimitedDeviceContacts hiding modal');
    modalDismiss.hideModal();
    await waitForModalDismiss();
  }

  try {
    const permission = await ensureContactsPermission();
    if (!permission) {
      logger.debug('DeviceContacts', 'refreshLimitedDeviceContacts permission not granted');
      return null;
    }

    logPermissionSnapshot('refreshLimitedDeviceContacts permission after prompt', permission);

    const accessLimited = permission.accessPrivileges === 'limited';
    let presented = false;

    if (Platform.OS === 'ios' && accessLimited) {
      presented = await presentLimitedAccessPicker();
      if (!presented) {
        logger.warn('DeviceContacts', 'refreshLimitedDeviceContacts picker not presented');
        showContactsPickerBlockedAlert();
      }
    }

    const rows = await fetchDeviceContacts();

    logger.debug('DeviceContacts', 'refreshLimitedDeviceContacts reloaded', {
      count: rows.length,
      accessLimited,
      presented,
    });

    return { rows, accessLimited };
  } catch (error) {
    logger.error('DeviceContacts', 'refreshLimitedDeviceContacts failed', error);
    throw error;
  } finally {
    if (modalDismiss) {
      logger.debug('DeviceContacts', 'refreshLimitedDeviceContacts restoring modal');
      modalDismiss.showModal();
    }
  }
}
