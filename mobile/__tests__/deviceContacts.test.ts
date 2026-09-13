import type * as Contacts from 'expo-contacts';

import {
  mapContactToCustomerForm,
  pickContactPhoneNumber,
} from '@/utils/deviceContactMapping';

describe('pickContactPhoneNumber', () => {
  it('prefers mobile/cell numbers over home', () => {
    const numbers = [
      { label: 'home', number: '+1 555-0100' },
      { label: 'mobile', number: '+1 555-0199' },
    ] as Contacts.PhoneNumber[];

    expect(pickContactPhoneNumber(numbers)).toBe('+1 555-0199');
  });

  it('falls back to primary when no mobile label', () => {
    const numbers = [
      { label: 'home', number: '+1 555-0100' },
      { label: 'work', number: '+1 555-0200', isPrimary: true },
    ] as Contacts.PhoneNumber[];

    expect(pickContactPhoneNumber(numbers)).toBe('+1 555-0200');
  });

  it('returns first available number as last resort', () => {
    const numbers = [{ label: 'home', number: '+1 555-0100' }] as Contacts.PhoneNumber[];

    expect(pickContactPhoneNumber(numbers)).toBe('+1 555-0100');
  });
});

describe('mapContactToCustomerForm', () => {
  it('maps display name, phone, email, and company', () => {
    const contact = {
      name: 'Jane Doe',
      phoneNumbers: [{ label: 'mobile', number: '+233 20 123 4567' }],
      emails: [{ email: 'jane@example.com', label: 'work' }],
      company: 'Acme Ltd',
    } as Contacts.Contact;

    expect(mapContactToCustomerForm(contact)).toEqual({
      name: 'Jane Doe',
      phone: '+233 20 123 4567',
      email: 'jane@example.com',
      company: 'Acme Ltd',
    });
  });

  it('builds name from first and last when display name is missing', () => {
    const contact = {
      firstName: 'Jane',
      lastName: 'Doe',
      phoneNumbers: [{ label: 'mobile', number: '+1 555-0100' }],
    } as Contacts.Contact;

    expect(mapContactToCustomerForm(contact)).toEqual({
      name: 'Jane Doe',
      phone: '+1 555-0100',
      email: '',
      company: '',
    });
  });

  it('returns null when contact has no usable fields', () => {
    expect(mapContactToCustomerForm({} as Contacts.Contact)).toBeNull();
  });
});

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openSettings: jest.fn() },
  Platform: { OS: 'ios' },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('expo-contacts', () => ({
  Fields: {
    FirstName: 'firstName',
    LastName: 'lastName',
    Name: 'name',
    PhoneNumbers: 'phoneNumbers',
    Emails: 'emails',
    Company: 'company',
  },
  SortTypes: { FirstName: 'firstName' },
  isAvailableAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
  presentAccessPickerAsync: jest.fn(),
}));

import * as ExpoContacts from 'expo-contacts';

import {
  loadDeviceContacts,
  presentLimitedAccessPicker,
  refreshLimitedDeviceContacts,
  resetAccessPickerGuard,
} from '@/utils/deviceContacts';

describe('deviceContacts picker guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ExpoContacts.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(ExpoContacts.requestPermissionsAsync).mockResolvedValue({
      status: 'granted',
      accessPrivileges: 'limited',
      canAskAgain: true,
    } as ExpoContacts.ContactsPermissionResponse);
    jest.mocked(ExpoContacts.getPermissionsAsync).mockResolvedValue({
      status: 'granted',
      accessPrivileges: 'limited',
      canAskAgain: true,
    } as ExpoContacts.ContactsPermissionResponse);
    jest.mocked(ExpoContacts.getContactsAsync).mockResolvedValue({ data: [], hasNextPage: false });
    jest.mocked(ExpoContacts.presentAccessPickerAsync).mockResolvedValue(undefined);
  });

  it('loadDeviceContacts does not auto-present the access picker when empty', async () => {
    const result = await loadDeviceContacts();

    expect(result).toEqual({ rows: [], accessLimited: true });
    expect(ExpoContacts.presentAccessPickerAsync).not.toHaveBeenCalled();
  });

  it('presentLimitedAccessPicker returns false while another presentation is in flight', async () => {
    let resolvePresent: () => void = () => {};
    jest.mocked(ExpoContacts.presentAccessPickerAsync).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePresent = resolve;
        })
    );

    const first = presentLimitedAccessPicker();
    const second = presentLimitedAccessPicker();

    expect(ExpoContacts.presentAccessPickerAsync).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);

    resolvePresent();
    expect(await first).toBe(true);
  });

  it('presentLimitedAccessPicker swallows native already-presented errors', async () => {
    jest.mocked(ExpoContacts.presentAccessPickerAsync).mockRejectedValue(
      new Error('Contact access picker is already presented')
    );

    await expect(presentLimitedAccessPicker()).resolves.toBe(false);
  });

  it('refreshLimitedDeviceContacts still reloads contacts when picker is already presented', async () => {
    jest.mocked(ExpoContacts.presentAccessPickerAsync).mockRejectedValue(
      new Error('Contact access picker is already presented')
    );

    const { Alert } = require('react-native');
    const result = await refreshLimitedDeviceContacts();

    expect(result).toEqual({ rows: [], accessLimited: true });
    expect(ExpoContacts.getContactsAsync).toHaveBeenCalled();
    expect(ExpoContacts.presentAccessPickerAsync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('resetAccessPickerGuard clears guard so picker can present again', async () => {
    jest
      .mocked(ExpoContacts.presentAccessPickerAsync)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(undefined);

    void presentLimitedAccessPicker();
    await Promise.resolve();
    resetAccessPickerGuard();

    await expect(presentLimitedAccessPicker()).resolves.toBe(true);
    expect(ExpoContacts.presentAccessPickerAsync).toHaveBeenCalledTimes(2);
  });

  it(
    'refreshLimitedDeviceContacts hides and restores modal before presenting picker',
    async () => {
      const hideModal = jest.fn();
      const showModal = jest.fn();

      const result = await refreshLimitedDeviceContacts({ hideModal, showModal });

      expect(hideModal).toHaveBeenCalledTimes(1);
      expect(ExpoContacts.presentAccessPickerAsync).toHaveBeenCalledTimes(1);
      expect(showModal).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ rows: [], accessLimited: true });
    },
    1000
  );

  it('refreshLimitedDeviceContacts requests permission before opening picker', async () => {
    jest.mocked(ExpoContacts.getPermissionsAsync).mockResolvedValueOnce({
      status: 'undetermined',
      canAskAgain: true,
    } as ExpoContacts.ContactsPermissionResponse);
    jest.mocked(ExpoContacts.requestPermissionsAsync).mockResolvedValueOnce({
      status: 'granted',
      accessPrivileges: 'limited',
      canAskAgain: true,
    } as ExpoContacts.ContactsPermissionResponse);

    const result = await refreshLimitedDeviceContacts();

    expect(ExpoContacts.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ExpoContacts.presentAccessPickerAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rows: [], accessLimited: true });
  });
});
