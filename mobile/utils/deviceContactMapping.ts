import type * as Contacts from 'expo-contacts';

export type CustomerFormFromContact = {
  name: string;
  phone: string;
  email: string;
  company: string;
};

export type DeviceContactRow = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
};

const MOBILE_PHONE_LABEL = /mobile|cell|iphone/i;

/**
 * Prefer mobile/cell numbers, then primary, then first available phone.
 */
export function pickContactPhoneNumber(phoneNumbers?: Contacts.PhoneNumber[]): string {
  if (!phoneNumbers?.length) return '';

  const mobile = phoneNumbers.find(
    (entry) => MOBILE_PHONE_LABEL.test(entry.label || '') && entry.number?.trim()
  );
  if (mobile?.number?.trim()) return mobile.number.trim();

  const primary = phoneNumbers.find((entry) => entry.isPrimary && entry.number?.trim());
  if (primary?.number?.trim()) return primary.number.trim();

  return phoneNumbers.find((entry) => entry.number?.trim())?.number?.trim() || '';
}

function resolveDisplayName(contact: Contacts.Contact): string {
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    ''
  );
}

/**
 * Map a device contact to Add Customer form fields.
 */
export function mapContactToCustomerForm(contact: Contacts.Contact): CustomerFormFromContact | null {
  const name = resolveDisplayName(contact);
  const phone = pickContactPhoneNumber(contact.phoneNumbers);
  const email = contact.emails?.[0]?.email?.trim() || '';
  const company = contact.company?.trim() || '';

  if (!name && !phone && !email) return null;

  return {
    name: name || 'Unnamed',
    phone,
    email,
    company,
  };
}

/**
 * Map a device contact to a list row (import / picker).
 */
export function mapContactToRow(contact: Contacts.Contact, index: number): DeviceContactRow | null {
  const mapped = mapContactToCustomerForm(contact);
  if (!mapped) return null;

  return {
    id: contact.id || `contact-${index}`,
    name: mapped.name,
    phone: mapped.phone || undefined,
    email: mapped.email || undefined,
    company: mapped.company || undefined,
  };
}
