import { Alert, Linking } from 'react-native';

import { collapseRepeatedDialCode } from '@/utils/displayPhone';

type WhatsAppOpenOptions = {
  phone?: string | null;
  message?: string;
  contactLabel?: string;
  defaultCountryCode?: string | null;
};

function digitsOnly(value?: string | null): string {
  return String(value ?? '').replace(/[^\d]/g, '');
}

export function getCountryCallingCodeFromPhone(phone?: string | null): string {
  const value = String(phone ?? '').trim();
  if (!value.startsWith('+')) return '';

  const digits = digitsOnly(value);
  if (digits.startsWith('233')) return '233';
  if (digits.startsWith('234')) return '234';
  if (digits.startsWith('254')) return '254';
  if (digits.startsWith('27')) return '27';
  if (digits.startsWith('256')) return '256';
  if (digits.startsWith('255')) return '255';
  if (digits.startsWith('250')) return '250';
  if (digits.startsWith('228')) return '228';
  if (digits.startsWith('225')) return '225';
  if (digits.startsWith('221')) return '221';

  return '';
}

export function normalizePhoneForWhatsApp(
  phone?: string | null,
  defaultCountryCode?: string | null
): string {
  const raw = collapseRepeatedDialCode(phone);
  if (!raw) return '';

  const hasInternationalPrefix = raw.startsWith('+');
  const countryCode = digitsOnly(defaultCountryCode);
  const digits = digitsOnly(raw);
  if (!digits) return '';

  if (hasInternationalPrefix) return digits;
  if (digits.startsWith('00') && digits.length > 2) return digits.slice(2);
  if (countryCode && digits.startsWith(countryCode)) return digits;
  if (countryCode && digits.startsWith('0')) return `${countryCode}${digits.replace(/^0+/, '')}`;
  if (countryCode && digits.length === 9) return `${countryCode}${digits}`;

  return digits;
}

export async function openWhatsAppChat({
  phone,
  message,
  contactLabel = 'This contact',
  defaultCountryCode,
}: WhatsAppOpenOptions): Promise<boolean> {
  const normalizedPhone = normalizePhoneForWhatsApp(phone, defaultCountryCode);
  if (!normalizedPhone) {
    Alert.alert('No phone number', `${contactLabel} has no phone number on file.`);
    return false;
  }

  const textQuery = message ? `&text=${encodeURIComponent(message)}` : '';
  const appUrl = `whatsapp://send?phone=${normalizedPhone}${textQuery}`;
  const webUrl = `https://wa.me/${normalizedPhone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

  try {
    await Linking.openURL(appUrl);
    return true;
  } catch {
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      Alert.alert(
        'Could not open WhatsApp',
        `We could not open a WhatsApp chat for ${normalizedPhone}. Please check that WhatsApp is installed or try again.`
      );
      return false;
    }
  }
}
