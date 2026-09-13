import { Alert, Linking, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';

import { invoiceService } from '@/services/invoiceService';
import {
  getInvoicePdfFilename,
  prepareInvoicePdf,
} from '@/services/pdfDocumentService';
import {
  buildLocalInvoicePaymentLink,
  formatInvoiceShareContent,
  type InvoiceShareInput,
} from '@/utils/invoiceShareMessage';
import { logger } from '@/utils/logger';
import { normalizePhoneForWhatsApp, openWhatsAppChat } from '@/utils/whatsapp';

export type { InvoiceShareContent, InvoiceShareInput } from '@/utils/invoiceShareMessage';
export { buildLocalInvoicePaymentLink, formatInvoiceShareContent } from '@/utils/invoiceShareMessage';

/** Ensure the invoice has a payment token and return the public payment link. */
export async function resolveInvoicePaymentLink(invoice: InvoiceShareInput): Promise<string | null> {
  if (invoice.status === 'cancelled') return null;

  try {
    const res = await invoiceService.ensurePaymentLink(invoice.id);
    const payload = (res as { data?: { paymentLink?: string; paymentToken?: string } })?.data ?? res;
    const link = (payload as { paymentLink?: string })?.paymentLink;
    if (link) return String(link);
    const token = (payload as { paymentToken?: string })?.paymentToken ?? invoice.paymentToken;
    if (token) return buildLocalInvoicePaymentLink(String(token));
  } catch {
    // fall through to local token
  }

  if (invoice.paymentToken) {
    return buildLocalInvoicePaymentLink(String(invoice.paymentToken));
  }

  return null;
}

function buildSmsUrl(phone: string | null, body: string): string {
  const encoded = encodeURIComponent(body);
  if (phone) {
    return Platform.OS === 'ios'
      ? `sms:${phone}&body=${encoded}`
      : `sms:${phone}?body=${encoded}`;
  }
  return Platform.OS === 'ios' ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

async function openWhatsAppWithMessage(message: string): Promise<boolean> {
  const textQuery = `?text=${encodeURIComponent(message)}`;
  const appUrl = `whatsapp://send${textQuery}`;
  const webUrl = `https://wa.me/${textQuery}`;

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
        'We could not open WhatsApp on this device. Check that WhatsApp is installed or try again.'
      );
      return false;
    }
  }
}

function getCustomerName(invoice: InvoiceShareInput): string {
  return String(invoice.customer?.name || invoice.customer?.company || 'Customer').trim();
}

type InvoiceWhatsAppShareOptions = {
  businessName?: string | null;
  defaultCountryCode?: string | null;
  showProductCode?: boolean;
  businessType?: string | null;
  pdfSource?: Record<string, unknown> | null;
};

async function shareInvoicePdfForWhatsApp(
  pdfUri: string,
  message: string,
  dialogTitle: string
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  if (Platform.OS === 'ios') {
    try {
      const result = await Share.share({
        url: pdfUri,
        message,
        title: dialogTitle,
      });
      return result.action !== Share.dismissedAction;
    } catch {
      // Fall through to expo-sharing.
    }
  }

  try {
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle,
    });
    return true;
  } catch {
    return false;
  }
}

async function shareInvoicePdfViaWhatsApp(
  invoice: InvoiceShareInput,
  message: string,
  options: InvoiceWhatsAppShareOptions
): Promise<boolean> {
  const pdfSource = options.pdfSource ?? (invoice as Record<string, unknown>);
  const prepared = await prepareInvoicePdf(pdfSource, {
    showProductCode: options.showProductCode,
    footerNote: message,
    businessType: options.businessType ?? undefined,
  });

  return shareInvoicePdfForWhatsApp(
    prepared.uri,
    message,
    `Share ${getInvoicePdfFilename(pdfSource)} on WhatsApp`
  );
}

export async function shareInvoiceViaWhatsApp(
  invoice: InvoiceShareInput,
  options: InvoiceWhatsAppShareOptions = {}
): Promise<boolean> {
  const paymentLink = await resolveInvoicePaymentLink(invoice);
  const { message } = formatInvoiceShareContent(invoice, paymentLink, options.businessName);

  try {
    const sharedWithPdf = await shareInvoicePdfViaWhatsApp(invoice, message, options);
    if (sharedWithPdf) return true;
  } catch (error) {
    logger.warn('InvoiceShare', 'WhatsApp PDF share failed; falling back to text-only share', {
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const phone = String(invoice.customer?.phone || '').trim();

  if (phone) {
    return openWhatsAppChat({
      phone,
      message,
      contactLabel: getCustomerName(invoice),
      defaultCountryCode: options.defaultCountryCode,
    });
  }

  return openWhatsAppWithMessage(message);
}

export async function shareInvoiceViaSms(
  invoice: InvoiceShareInput,
  options: { businessName?: string | null; defaultCountryCode?: string | null } = {}
): Promise<boolean> {
  const paymentLink = await resolveInvoicePaymentLink(invoice);
  const { message } = formatInvoiceShareContent(invoice, paymentLink, options.businessName);
  const phone = normalizePhoneForWhatsApp(invoice.customer?.phone, options.defaultCountryCode) || null;
  const url = buildSmsUrl(phone, message);

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      'SMS unavailable',
      phone
        ? 'Could not open the SMS app on this device.'
        : 'Could not open the SMS app. Add a phone number to the customer profile or compose the message manually.'
    );
    return false;
  }
}

export async function shareInvoiceViaEmail(
  invoice: InvoiceShareInput,
  options: { businessName?: string | null } = {}
): Promise<boolean> {
  const paymentLink = await resolveInvoicePaymentLink(invoice);
  const { subject, message } = formatInvoiceShareContent(invoice, paymentLink, options.businessName);
  const email = String(invoice.customer?.email || '').trim();
  const url = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      'Email unavailable',
      email
        ? 'Could not open an email app on this device.'
        : 'Could not open an email app. Add an email address to the customer profile or choose another share option.'
    );
    return false;
  }
}
