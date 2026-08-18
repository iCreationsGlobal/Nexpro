/**
 * Settings hub card configuration and legacy tab → route mapping.
 */

import { isPricingUiEnabled } from './showPricing';

export const PAYMENT_COLLECTION_TAB = 'payment-collections';

export const SETTINGS_GROUPS = {
  you: 'You',
  business: 'Business',
  channels: 'Channels',
};

/** @typedef {'you' | 'business' | 'channels'} SettingsGroup */

/**
 * @typedef {Object} SettingsHubCard
 * @property {string} slug - Route slug or legacy identifier
 * @property {string} title
 * @property {string} subtitle
 * @property {SettingsGroup} group
 * @property {boolean} [managerOnly]
 * @property {string} [featureKey] - Auth feature gate
 * @property {boolean} [migrated] - Uses dedicated /settings/:slug route
 * @property {string} [legacyTab] - Legacy ?tab= value when not migrated
 * @property {string} [legacySubtab]
 * @property {boolean} [comingSoon]
 */

/** @type {SettingsHubCard[]} */
export const SETTINGS_HUB_CARDS = [
  {
    slug: 'profile',
    title: 'Profile',
    subtitle: 'Personal info, password, and profile photo',
    group: 'you',
    migrated: true,
  },
  {
    slug: 'appearance',
    title: 'Appearance',
    subtitle: 'Dark mode, hints, and sidebar menus',
    group: 'you',
    migrated: true,
  },
  {
    slug: 'notifications',
    title: 'Notifications',
    subtitle: 'In-app and email notification preferences',
    group: 'you',
    migrated: true,
  },
  {
    slug: 'organization',
    title: 'Organization',
    subtitle: 'Business profile, branding, and review links',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'invoices-receipts',
    title: 'Invoices & receipts',
    subtitle: 'Auto-send, quote/job workflow, POS receipts, print format, and preview',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'tracking',
    title: 'Customer tracking',
    subtitle: 'Public tracking page toggles and shareable link',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'delivery',
    title: 'Delivery fees',
    subtitle: 'Delivery bands, enable delivery, and checkout requirements',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'inventory',
    title: 'Inventory',
    subtitle: 'Product cost, COGS, and operating expenses',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'ai',
    title: 'Ayebia / AI',
    subtitle: 'Anthropic API key for Ask Ayebia and automations',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'billing',
    title: 'Billing & plan',
    subtitle: 'Subscription, seats, and ABS plan',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'payments',
    title: 'Payments',
    subtitle: 'Paystack settlements, MTN MoMo, and payout destination',
    group: 'business',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'sabito-partners',
    title: 'Sabito Partners',
    subtitle: 'Partner program, marketer applications, commissions, and payouts',
    group: 'channels',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'sms',
    title: 'SMS',
    subtitle: 'Platform usage, provider, templates, and SMS delivery rules',
    group: 'channels',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'whatsapp',
    title: 'WhatsApp',
    subtitle: 'WhatsApp Business API connection',
    group: 'channels',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'email',
    title: 'Email',
    subtitle: 'SMTP and email provider settings',
    group: 'channels',
    migrated: true,
    managerOnly: true,
  },
  {
    slug: 'delivery-rules',
    title: 'Delivery rules',
    subtitle: 'Which channels send each system message',
    group: 'channels',
    migrated: true,
    managerOnly: true,
  },
];

const MIGRATED_TAB_ROUTES = {
  profile: '/settings/profile',
  appearance: '/settings/appearance',
  notifications: '/settings/notifications',
  organization: '/settings/organization',
  workspace: '/settings/organization',
  workflows: '/settings/invoices-receipts',
  operations: '/settings/invoices-receipts',
  configurations: '/settings/invoices-receipts',
  tracking: '/settings/tracking',
  delivery: '/settings/delivery',
  inventory: '/settings/inventory',
  ai: '/settings/ai',
  billing: '/settings/billing',
  subscription: '/settings/billing',
  sms: '/settings/sms',
  'invoices-receipts': '/settings/invoices-receipts',
  payments: '/settings/payments',
  'sabito-partners': '/settings/sabito-partners',
  whatsapp: '/settings/whatsapp',
  email: '/settings/email',
  'delivery-rules': '/settings/delivery-rules',
  [PAYMENT_COLLECTION_TAB]: '/settings/payments',
};

/**
 * Normalize legacy main tab values (matches legacy Settings.jsx normalizeMainTab).
 * @param {string} tab
 * @param {boolean} canManageOrganization
 * @returns {string}
 */
export const normalizeMainTab = (tab, canManageOrganization) => {
  const value = String(tab || 'profile');
  if (!canManageOrganization) return 'profile';
  if (['workspace', 'operations', 'billing', 'notifications'].includes(value)) return value;
  if (['organization', 'appearance'].includes(value)) return 'workspace';
  if (value === 'subscription') return 'billing';
  if (value === 'payments' || value === PAYMENT_COLLECTION_TAB) return 'payments-redirect';
  if (['integration', 'messaging', 'whatsapp', 'sms', 'email', 'delivery-rules'].includes(value)) {
    return 'channels-redirect';
  }
  if (value === 'configurations') return 'operations';
  if (value === 'profile') return 'profile-redirect';
  return 'profile-redirect';
};

/**
 * Map legacy ?tab= (and optional subtab / smsSection) to a new path or null for legacy Settings.
 * @param {string} tab
 * @param {string|null} [subtab]
 * @param {string|null} [smsSection]
 * @param {boolean} [canManageOrganization=true]
 * @returns {string|null} New route path, or null to render legacy Settings
 */
export const legacyTabToRoute = (tab, subtab, smsSection, canManageOrganization = true) => {
  const rawTab = String(tab || 'profile');

  if (rawTab === 'profile') return '/settings/profile';

  if (rawTab === 'appearance') return '/settings/appearance';

  if (rawTab === 'notifications' || rawTab === 'messaging') {
    if (rawTab === 'messaging') {
      if (subtab === 'whatsapp') return '/settings/whatsapp';
      if (subtab === 'email') return '/settings/email';
      if (subtab === 'sms') {
        const section = smsSection && smsSection !== 'overview' ? smsSection : null;
        return section ? `/settings/sms?section=${encodeURIComponent(section)}` : '/settings/sms';
      }
    }
    return '/settings/notifications';
  }

  if (rawTab === 'workspace' || rawTab === 'organization') {
    return '/settings/organization';
  }

  if (rawTab === 'operations' || rawTab === 'configurations' || rawTab === 'workflows') {
    return '/settings/invoices-receipts';
  }

  if (rawTab === 'billing' || rawTab === 'subscription') {
    return isPricingUiEnabled() ? '/settings/billing' : '/settings';
  }

  if (rawTab === 'invoices-receipts' || rawTab === 'invoices' || rawTab === 'receipts') {
    return '/settings/invoices-receipts';
  }

  if (rawTab === 'payments' || rawTab === PAYMENT_COLLECTION_TAB) {
    const params = new URLSearchParams();
    if (
      subtab === 'mtn-collection' ||
      subtab === 'merchant-id' ||
      subtab === 'settlements' ||
      subtab === 'hubtel' ||
      subtab === 'hubtel-collection'
    ) {
      params.set('subtab', subtab === 'hubtel-collection' ? 'hubtel' : subtab === 'mtn-collection' ? 'merchant-id' : subtab);
    }
    const qs = params.toString();
    return qs ? `/settings/payments?${qs}` : '/settings/payments';
  }

  if (rawTab === 'delivery-rules') {
    return '/settings/delivery-rules';
  }

  if (rawTab === 'sms') {
    const section = smsSection && smsSection !== 'overview' ? smsSection : null;
    return section ? `/settings/sms?section=${encodeURIComponent(section)}` : '/settings/sms';
  }

  if (rawTab === 'whatsapp') {
    return '/settings/whatsapp';
  }

  if (rawTab === 'email') {
    return '/settings/email';
  }

  if (MIGRATED_TAB_ROUTES[rawTab]) {
    return MIGRATED_TAB_ROUTES[rawTab];
  }

  return '/settings';
};

/**
 * Build href for a hub card.
 * @param {SettingsHubCard} card
 * @returns {string}
 */
export const getSettingsCardHref = (card) => {
  if (card.comingSoon) return '#';
  if (card.migrated) return `/settings/${card.slug}`;
  const params = new URLSearchParams({ tab: card.legacyTab || card.slug });
  if (card.legacySubtab) params.set('subtab', card.legacySubtab);
  return `/settings?${params.toString()}`;
};

/**
 * Filter hub cards by role and feature gates.
 * @param {Object} options
 * @param {boolean} options.isManager
 * @param {(key: string) => boolean} [options.hasFeature]
 * @returns {SettingsHubCard[]}
 */
export const getVisibleSettingsCards = ({ isManager, hasFeature }) => {
  return SETTINGS_HUB_CARDS.filter((card) => {
    if (card.slug === 'billing' && !isPricingUiEnabled()) return false;
    if (card.managerOnly && !isManager) return false;
    if (card.featureKey && typeof hasFeature === 'function' && !hasFeature(card.featureKey)) {
      return false;
    }
    if (!isManager && card.group !== 'you') return false;
    return true;
  });
};

/**
 * Group visible cards by section header.
 * @param {SettingsHubCard[]} cards
 * @returns {Array<{ key: SettingsGroup, label: string, cards: SettingsHubCard[] }>}
 */
export const groupSettingsCards = (cards) => {
  const order = ['you', 'business', 'channels'];
  return order
    .map((key) => ({
      key,
      label: SETTINGS_GROUPS[key],
      cards: cards.filter((c) => c.group === key),
    }))
    .filter((g) => g.cards.length > 0);
};
