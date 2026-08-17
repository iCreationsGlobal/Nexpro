import { z } from 'zod';
import { integerOrEmptySchema } from './formUtils';
import { API_BASE_URL } from '../services/api';

/**
 * Resolve file URLs (base64, relative paths, absolute URLs).
 * @param {string} url
 * @returns {string}
 */
export const resolveSettingsFileUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

export const SMS_SECTIONS = ['overview', 'provider', 'templates', 'delivery-rules'];

export const DEFAULT_DELIVERY_SETTINGS = {
  enabled: false,
  requireSelectionAtCheckout: false,
  bands: [],
};

/**
 * Create a new delivery band draft row.
 * @param {number} [index]
 * @returns {Object}
 */
export const createDeliveryBand = (index = 0) => ({
  id: `band_${Date.now()}_${index}`,
  label: '',
  minKm: '',
  maxKm: '',
  fee: '',
});

export const organizationSchema = z.object({
  name: z.string().min(1, 'Enter organization name'),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().optional(),
  appName: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  invoiceFooter: z.string().optional(),
  paymentDetails: z.string().optional(),
  paymentDetailsEnabled: z.boolean().optional(),
  defaultPaymentTerms: z.string().optional(),
  defaultTermsAndConditions: z.string().optional(),
  supportEmail: z.string().email().optional().or(z.literal('')),
  currency: z.string().optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  tax: z.object({
    vatNumber: z.string().optional(),
    tin: z.string().optional(),
    ghanaCardPin: z.string().max(32).optional(),
    scheme: z.enum(['standard', 'flat', 'none']).optional(),
    enabled: z.boolean().optional(),
    defaultRatePercent: z.preprocess(
      (val) => {
        if (val === '' || val === undefined || val === null) return 0;
        const n = typeof val === 'string' ? parseFloat(val.trim()) : Number(val);
        if (!Number.isFinite(n)) return 0;
        return Math.min(100, Math.max(0, n));
      },
      z.number().min(0).max(100)
    ),
    pricesAreTaxInclusive: z.boolean().optional(),
    displayLabel: z.string().max(80).optional(),
    levies: z.array(z.object({
      code: z.string().max(32),
      label: z.string().max(80),
      ratePercent: z.preprocess(
        (val) => {
          if (val === '' || val === undefined || val === null) return 0;
          const n = typeof val === 'string' ? parseFloat(val.trim()) : Number(val);
          if (!Number.isFinite(n)) return 0;
          return Math.min(100, Math.max(0, n));
        },
        z.number().min(0).max(100)
      ),
      enabled: z.boolean().optional(),
    })).optional(),
    otherCharges: z.object({
      enabled: z.boolean().optional(),
      label: z.string().max(80).optional(),
      ratePercent: z.preprocess(
        (val) => {
          if (val === '' || val === undefined || val === null) return 0;
          const n = typeof val === 'string' ? parseFloat(val.trim()) : Number(val);
          if (!Number.isFinite(n)) return 0;
          return Math.min(100, Math.max(0, n));
        },
        z.number().min(0).max(100)
      ),
      customerBears: z.boolean().optional(),
      appliesTo: z.enum(['online_payments', 'all_payments']).optional(),
    }).optional(),
  }).optional(),
  shopType: z.string().optional(),
});

/**
 * Unwrap nested API response payloads.
 * @param {*} response
 * @returns {Object}
 */
export const unwrapApiPayload = (response) => response?.data?.data ?? response?.data ?? response ?? {};

/**
 * Format enum-like values for display.
 * @param {string} value
 * @returns {string}
 */
export const formatLabel = (value) => {
  if (!value) return 'Not set';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

/**
 * Format minor currency units (e.g. pesewas) as major display string.
 * @param {number} amount
 * @param {string} [currency]
 * @returns {string}
 */
export const formatMinorCurrency = (amount, currency = 'GHS') => {
  const numericAmount = Number(amount);
  const majorAmount = Number.isFinite(numericAmount) ? numericAmount / 100 : 0;
  return `${currency || 'GHS'} ${majorAmount.toFixed(2)}`;
};

export const PAYMENT_COLLECTION_SUBTABS = ['merchant-id', 'settlements', 'hubtel', 'mtn-collection'];

/** @param {string|null|undefined} subtab */
export function normalizePaymentCollectionSubtab(subtab) {
  if (subtab === 'hubtel' || subtab === 'hubtel-collection') return 'hubtel';
  if (subtab === 'settlements' || subtab === 'paystack') return 'settlements';
  if (subtab === 'merchant-id' || subtab === 'mtn-collection' || subtab === 'momo') return 'merchant-id';
  return 'merchant-id';
}

export const DELIVERY_RULE_CATEGORY_LABELS = {
  sales: 'Sales & billing',
  operations: 'Operations',
  account: 'Account',
  security: 'Security',
};

export const whatsappSchema = z.object({
  enabled: z.boolean().default(false),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
  businessAccountId: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  templateNamespace: z.string().optional(),
});

export const smsSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['termii', 'twilio', 'africas_talking', 'arkesel']).default('termii'),
  senderId: z.string().optional(),
  apiKey: z.string().optional(),
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  fromNumber: z.string().optional(),
  username: z.string().optional(),
});

export const emailSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['smtp', 'sendgrid', 'ses']).default('smtp'),
  smtpHost: z.string().optional(),
  smtpPort: z.union([z.number(), z.literal('')]).optional().transform((v) => (v === '' || v == null ? 587 : v)),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpRejectUnauthorized: z.boolean().default(true),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  sendgridApiKey: z.string().optional(),
  sesAccessKeyId: z.string().optional(),
  sesSecretAccessKey: z.string().optional(),
  sesRegion: z.string().optional(),
  sesHost: z.string().optional(),
});

export const paymentCollectionSchema = z.object({
  settlement_type: z.enum(['bank', 'momo']),
  business_name: z.string().min(1, 'Business / account name is required'),
  bank_code: z.string().optional(),
  bank_name: z.string().optional(),
  account_number: z.string().optional(),
  primary_contact_email: z.string().email().optional().or(z.literal('')),
  momo_phone: z.string().optional(),
  momo_provider: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.settlement_type === 'bank') {
    if (!data.bank_code || !data.bank_code.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bank is required', path: ['bank_code'] });
    if (!data.account_number || String(data.account_number).replace(/\s/g, '').length < 8) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Account number must be at least 8 characters', path: ['account_number'] });
  }
  if (data.settlement_type === 'momo') {
    const phone = (data.momo_phone || '').replace(/\s/g, '');
    if (!phone || phone.length < 9) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MoMo phone number is required (e.g. 0XXXXXXXXX)', path: ['momo_phone'] });
    if (!data.momo_provider || !['MTN', 'AIRTEL', 'VODAFONE'].includes(String(data.momo_provider).toUpperCase())) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select MoMo provider (MTN, AirtelTigo Money, or Vodafone Cash)', path: ['momo_provider'] });
  }
});

/**
 * Merge saved email settings with organization fields for auto-fill.
 * @param {Object} ed
 * @param {Object} org
 * @param {Object} [options]
 * @returns {Object}
 */
export const getEmailFormValues = (ed, org, options = {}) => {
  const o = org || {};
  const orgEmail = (o.email || '').trim();
  const orgName = (o.name || '').trim();
  const isGmail = orgEmail.toLowerCase().endsWith('@gmail.com');
  return {
    enabled: ed?.enabled ?? false,
    provider: ed?.provider || 'smtp',
    smtpHost: (ed?.smtpHost || '').trim() || (isGmail ? 'smtp.gmail.com' : ''),
    smtpPort: ed?.smtpPort ?? 587,
    smtpUser: (ed?.smtpUser || '').trim() || orgEmail || '',
    smtpPassword: options.clearSecrets ? '' : (ed?.smtpPassword === '***' ? '' : (ed?.smtpPassword || '')),
    smtpRejectUnauthorized: ed?.smtpRejectUnauthorized !== false,
    fromEmail: (ed?.fromEmail || '').trim() || orgEmail || '',
    fromName: (ed?.fromName || '').trim() || orgName || '',
    sendgridApiKey: options.clearSecrets ? '' : (ed?.sendgridApiKey === '***' ? '' : (ed?.sendgridApiKey || '')),
    sesAccessKeyId: ed?.sesAccessKeyId || '',
    sesSecretAccessKey: options.clearSecrets ? '' : (ed?.sesSecretAccessKey === '***' ? '' : (ed?.sesSecretAccessKey || '')),
    sesRegion: ed?.sesRegion || 'us-east-1',
    sesHost: ed?.sesHost || '',
  };
};

export const SMS_TEMPLATE_PREVIEW_VARS = {
  customerName: 'Ama Mensah',
  businessName: 'Kofi Prints',
  branchName: 'Osu Branch',
  invoiceNumber: 'INV-2045',
  amount: 'GHS 150.00',
  paymentLink: 'https://abs.example/pay/abc',
  quoteNumber: 'QT-108',
  orderNumber: 'SR-9921',
  trackingLink: 'https://abs.example/track/xyz',
  dueDate: '15 Mar 2026',
};

export const SMS_SEGMENT_LENGTH = 160;
