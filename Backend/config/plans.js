/** Marketing copy defaults; live prices from Paystack via subscriptionPlanCatalogService */
const { PLAN_DEFINITIONS } = require('./paystackPlans');
const { getFeatureFlagsForPlan } = require('./features');

const pesewasToGhs = (p) => (p == null ? null : p / 100);

const plans = [
  {
    id: 'trial',
    order: 10,
    name: 'Free Trial',
    description: 'Try every feature with no commitment.',
    price: {
      amount: 0,
      currency: 'GHS',
      display: 'GHS 0',
      billingPeriodLabel: '1 month',
      billingDescription: '1-month full access'
    },
    highlights: ['All modules unlocked', 'Up to 5 team members', 'In-app support'],
    marketing: {
      enabled: false,
      perks: [],
      featureFlags: getFeatureFlagsForPlan('trial'),
      popular: false,
      priceDisplay: 'GHS 0',
      billing: '1-month full access',
      cta: {
        type: 'link',
        target: 'signup',
        label: 'Start trial'
      }
    },
    onboarding: {
      enabled: true,
      subtitle: '1 month',
      ctaLabel: 'Start Trial',
      badge: null,
      isDefault: true
    }
  },
  {
    id: 'starter',
    order: 20,
    name: 'Starter',
    description: '1 user and 1 branch/location.',
    price: {
      amount: pesewasToGhs(PLAN_DEFINITIONS.starter?.monthly ?? 12900),
      currency: 'GHS',
      display: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.starter?.monthly ?? 12900)}/mo`,
      billingPeriodLabel: 'per month',
      billingDescription: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.starter?.yearly ?? 118800) / 12} per month when billed annually`
    },
    highlights: [
      '1 user',
      '1 branch/location/shop',
      'Unlimited invoices & jobs',
      'Accounting & payroll modules',
      'Email + chat support'
    ],
    marketing: {
      enabled: true,
      perks: [
        '1 user',
        '1 branch/location/shop',
        'Quotes turn into jobs automatically',
        'Auto-generated invoices',
        'Email support'
      ],
      featureFlags: getFeatureFlagsForPlan('starter'),
      popular: false,
      priceDisplay: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.starter?.monthly ?? 12900)}`,
      billing: 'per month, billed annually',
      badgeLabel: null,
      cta: {
        type: 'link',
        target: 'signup',
        label: 'Start trial'
      }
    },
    onboarding: {
      enabled: true,
      subtitle: 'Recommended',
      ctaLabel: 'Choose Starter',
      badge: null,
      isDefault: false
    }
  },
  {
    id: 'professional',
    order: 30,
    name: 'Professional',
    description: 'Up to 3 users and 3 branches/locations.',
    price: {
      amount: pesewasToGhs(PLAN_DEFINITIONS.professional?.monthly ?? 25000),
      currency: 'GHS',
      display: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.professional?.monthly ?? 25000)}/mo`,
      billingPeriodLabel: 'per month',
      billingDescription: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.professional?.yearly ?? 238800) / 12} per month when billed annually`
    },
    highlights: [
      'Everything in Starter',
      'Up to 3 users',
      'Up to 3 branches/locations/shops',
      'Advanced reporting & data exports',
      'Priority support with SLA'
    ],
    marketing: {
      enabled: true,
      perks: [
        'Up to 3 users',
        'Up to 3 branches/locations/shops',
        'Materials controls & vendor price lists',
        'Invoice reminders & customer receipts',
        'Priority support'
      ],
      featureFlags: getFeatureFlagsForPlan('professional'),
      popular: true,
      priceDisplay: `GHS ${pesewasToGhs(PLAN_DEFINITIONS.professional?.monthly ?? 25000)}`,
      billing: 'per month, billed annually',
      badgeLabel: 'Recommended',
      cta: {
        type: 'link',
        target: 'signup',
        label: 'Start trial'
      }
    },
    onboarding: {
      enabled: true,
      subtitle: 'Growth-ready',
      ctaLabel: 'Choose Professional',
      badge: 'Popular',
      isDefault: false
    }
  },
  {
    id: 'enterprise',
    order: 40,
    name: 'Enterprise',
    description: 'Tailored workflows, security, and integrations for large-scale operations.',
    price: {
      amount: null,
      currency: 'GHS',
      display: "Let's talk",
      billingPeriodLabel: 'Custom',
      billingDescription: 'Custom contract, onboarding & integrations'
    },
    highlights: [
      'Dedicated success manager',
      'Custom workflow configuration',
      '24/7 priority support',
      'Up to 10 seats',
      'Up to 10 branches/locations/shops'
    ],
    marketing: {
      enabled: true,
      perks: [
        'Up to 10 seats',
        'Up to 10 branches/locations/shops',
        'Dedicated success manager',
        'Custom workflow configuration',
        '24/7 priority support'
      ],
      featureFlags: getFeatureFlagsForPlan('enterprise'),
      popular: false,
      priceDisplay: "Let's talk",
      billing: 'Custom contract, onboarding & integrations',
      badgeLabel: null,
      cta: {
        type: 'modal',
        target: 'contact-sales',
        label: 'Contact sales'
      }
    },
    onboarding: {
      enabled: false,
      subtitle: null,
      ctaLabel: null,
      badge: null,
      isDefault: false
    }
  }
];

module.exports = {
  plans,
  lastUpdated: new Date()
};
