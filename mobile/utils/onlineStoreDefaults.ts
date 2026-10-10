/**
 * Port of Frontend online-store defaults helpers for the mobile setup wizard.
 * Ghana-first: GHS, classic template, pickup on / delivery off.
 */

import { formatDisplayPhone } from '@/utils/displayPhone';

export const STORE_CURRENCY_GHS = 'GHS';
export const STORE_TEMPLATE_CLASSIC = 'classic';
export const STORE_PRIMARY_FALLBACK = '#166534';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const CATEGORY_BY_BUSINESS_TYPE: Record<string, string> = {
  shop: 'Other',
  studio: 'Printing and creative services',
  printing_press: 'Printing and creative services',
  pharmacy: 'Health and pharmacy',
  barber: 'Beauty and salon',
  salon: 'Beauty and salon',
};

const CATEGORY_BY_SHOP_TYPE: Record<string, string> = {
  restaurant: 'Food and restaurants',
  bakery: 'Food and restaurants',
  supermarket: 'Groceries and provisions',
  groceries: 'Groceries and provisions',
  grocery: 'Groceries and provisions',
  convenience: 'Groceries and provisions',
  electronics: 'Electronics',
  clothing: 'Fashion and apparel',
  fashion: 'Fashion and apparel',
  beauty: 'Beauty and salon',
  furniture: 'Home and office',
};

export function compactString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function firstFilled(...values: unknown[]): string {
  return values.map(compactString).find(Boolean) || '';
}

export function getPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isValidPrimaryColor(value: unknown): boolean {
  return HEX_COLOR_PATTERN.test(String(value || '').trim());
}

export function normalizePrimaryColor(value: unknown, fallback = STORE_PRIMARY_FALLBACK): string {
  const trimmed = String(value || '').trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

export function normalizeStoreSlug(value: unknown): string {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'store';
}

export function formatOrganizationAddress(address: Record<string, unknown> = {}): string {
  return [
    address.line1,
    address.line2,
    [address.city, address.state].map(compactString).filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ]
    .map(compactString)
    .filter(Boolean)
    .join(', ');
}

export function resolveStoreLogoUrl(...sources: unknown[]): string {
  return firstFilled(
    ...sources.flatMap((source) => {
      const obj = getPlainObject(source);
      return [
        obj.logoUrl,
        obj.logo,
        obj.companyLogoUrl,
        obj.companyLogo,
        obj.businessLogoUrl,
        obj.businessLogo,
        obj.tenantLogoUrl,
        obj.tenantLogo,
      ];
    })
  );
}

type TenantLike = {
  name?: string;
  businessType?: string;
  phone?: string;
  email?: string;
  currency?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  shopType?: string;
} | null | undefined;

type UserLike = {
  email?: string;
  phone?: string;
  phoneNumber?: string;
} | null | undefined;

export type OnlineStoreDefaults = {
  displayName: string;
  slug: string;
  description: string;
  category: string;
  whatsappNumber: string;
  contactPhone: string;
  contactEmail: string;
  primaryColor: string;
  /** True when org/tenant already had an explicit brand color (not fallback). */
  hasExplicitPrimaryColor: boolean;
  logoUrl: string;
  currency: string;
  pickupInstructions: string;
};

function resolveBusinessCategory(tenant: TenantLike, tenantMetadata: Record<string, unknown>): string {
  const shopType = compactString(
    tenant?.shopType ||
      tenantMetadata.shopType ||
      tenantMetadata.businessSubType ||
      tenantMetadata.shopTypeKey
  );
  return (
    CATEGORY_BY_SHOP_TYPE[shopType] ||
    CATEGORY_BY_BUSINESS_TYPE[tenant?.businessType || ''] ||
    'Other'
  );
}

/**
 * Seed Online Store wizard fields from tenant, organization, and user.
 */
export function buildOnlineStoreDefaultsFromTenant(
  tenant: TenantLike,
  user: UserLike,
  extras: { organization?: Record<string, unknown> | null; profile?: Record<string, unknown> | null } = {}
): OnlineStoreDefaults {
  const { organization, profile } = extras;
  const tenantMetadata = getPlainObject(tenant?.metadata);
  const organizationAddress = getPlainObject(organization?.address || tenantMetadata.address);
  const addressText = formatOrganizationAddress(organizationAddress);

  const displayName = firstFilled(
    organization?.name,
    organization?.legalName,
    tenant?.name,
    tenantMetadata.businessName,
    tenantMetadata.companyName
  );

  // Saved business phones can carry the dial code twice ("+233+233…"); never prefill that.
  const contactPhone = formatDisplayPhone(firstFilled(
    organization?.phone,
    tenantMetadata.businessPhone,
    tenantMetadata.companyPhone,
    tenantMetadata.phone,
    tenant?.phone,
    profile?.phone,
    profile?.phoneNumber,
    user?.phone,
    user?.phoneNumber
  ));

  const contactEmail = firstFilled(
    organization?.email,
    organization?.supportEmail,
    tenantMetadata.businessEmail,
    tenantMetadata.companyEmail,
    tenantMetadata.email,
    tenant?.email,
    profile?.email,
    user?.email
  );

  const rawPrimary = firstFilled(
    organization?.primaryColor,
    tenantMetadata.primaryColor,
    tenantMetadata.brandColor
  );

  return {
    displayName,
    slug: normalizeStoreSlug(displayName),
    description: firstFilled(
      tenantMetadata.storeDescription,
      tenantMetadata.businessDescription,
      tenantMetadata.description,
      tenant?.description
    ),
    category: resolveBusinessCategory(tenant, tenantMetadata),
    whatsappNumber: formatDisplayPhone(firstFilled(
      tenantMetadata.whatsappNumber,
      tenantMetadata.whatsapp,
      contactPhone
    )),
    contactPhone,
    contactEmail,
    primaryColor: normalizePrimaryColor(rawPrimary),
    hasExplicitPrimaryColor: isValidPrimaryColor(rawPrimary),
    // Prefer org → tenant metadata → tenant → profile (matches web + backend resolveStoreLogoFallback).
    logoUrl: resolveStoreLogoUrl(organization, tenantMetadata, tenant, profile),
    currency: STORE_CURRENCY_GHS,
    pickupInstructions: addressText ? `Pickup from ${addressText}` : '',
  };
}

export const defaultPaymentMethods = {
  mobileMoney: { enabled: true, configured: false },
  card: { enabled: true, configured: false },
  bankTransfer: { enabled: false, configured: false },
  payOnDelivery: { enabled: false, configured: false },
};

export const defaultDeliveryOptions = {
  localDelivery: { enabled: false, configured: false },
  nationwideDelivery: { enabled: false, configured: false },
  pickup: { enabled: true, configured: true },
  international: { enabled: false, configured: false },
};

/**
 * Auto-mark MoMo + card configured when payment collection is already linked.
 */
export function resolvePaymentMethodsForSetup(
  paymentConfigured: boolean,
  saved: Record<string, { enabled?: boolean; configured?: boolean }> = {}
) {
  const merged = {
    mobileMoney: { ...defaultPaymentMethods.mobileMoney, ...(saved.mobileMoney || {}) },
    card: { ...defaultPaymentMethods.card, ...(saved.card || {}) },
    bankTransfer: { ...defaultPaymentMethods.bankTransfer, ...(saved.bankTransfer || {}) },
    payOnDelivery: { ...defaultPaymentMethods.payOnDelivery, ...(saved.payOnDelivery || {}) },
  };
  return {
    ...merged,
    mobileMoney: { ...merged.mobileMoney, configured: paymentConfigured || merged.mobileMoney.configured },
    card: { ...merged.card, configured: paymentConfigured || merged.card.configured },
  };
}
