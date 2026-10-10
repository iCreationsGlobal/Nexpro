// Short name for UI: header, body copy, CTAs. Use BRAND_SHORT everywhere else.
export const BRAND_SHORT = 'ABS';
export const BRAND_FULL = 'African Business Suite';
// Legacy compact display export. ABS Ghana is a domain/search alias, not the product name.
export const BRAND_ALTERNATE = BRAND_SHORT;
export const BRAND_DOMAIN_ALIAS = 'ABS Ghana';
export const BRAND_ALIASES = [
  BRAND_SHORT,
  BRAND_DOMAIN_ALIAS,
  BRAND_FULL,
] as const;
// Full name: metadata, SEO, OG image, legal. Use SITE_NAME only where the full meaning is important.
export const SITE_NAME = BRAND_FULL;

function normalizeUrl(url: string) {
  return url.replace(/\/$/, '');
}

function parseUrlList(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((url) => normalizeUrl(url.trim()))
    .filter(Boolean);
}

const DEMO_API_URL = 'https://demo-api.africanbusinesssuite.com';
const PRODUCTION_API_URL = 'https://api.africanbusinesssuite.com';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Analytics: production only unless a dev override env is true (local testing).
const isAnalyticsDevOverride =
  process.env.NEXT_PUBLIC_GA_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_GTM_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_GOOGLE_TAG_ENABLED === 'true';
const isAnalyticsProduction = process.env.NODE_ENV === 'production';

// Google Tag Manager (GTM- prefix). When set, configure GA4 inside GTM — direct gtag is skipped.
// Create a container at https://tagmanager.google.com and set NEXT_PUBLIC_GTM_ID.
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || '';
export const isGtmEnabled =
  Boolean(GTM_ID) && (isAnalyticsProduction || isAnalyticsDevOverride);

// Google tag (GT- prefix) — unified tag that routes to linked destinations (GA4, Ads, etc.).
export const GOOGLE_TAG_ID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || '';

// Google Analytics 4 measurement ID for the ABS marketing site (absghana.com / africanbusinesssuite.com).
// Default ships in production builds so Analytics works even if Vercel env is missing.
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-TJP79NHHRL';

/**
 * Prefer the GA4 measurement ID (G-) so Analytics Admin receives hits.
 * GT- (if set) is configured as an additional destination for Ads/other linked products.
 */
export const GTAG_PRIMARY_ID = GA_MEASUREMENT_ID || GOOGLE_TAG_ID;

export const isGaEnabled =
  Boolean(GTAG_PRIMARY_ID) && (isAnalyticsProduction || isAnalyticsDevOverride);

/** Direct gtag.js — disabled when GTM is active (add GA4 as a tag in the GTM container instead). */
export const isGaDirectEnabled = isGaEnabled && !isGtmEnabled;

// Marketing site base URL (canonicals, sitemap, OG). Set NEXT_PUBLIC_SITE_URL in env.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://africanbusinesssuite.com'
).replace(/\/$/, '');

// Other public domains that should be associated with this brand in SEO metadata.
export const ALTERNATE_SITE_URLS = Array.from(
  new Set(
    parseUrlList(process.env.NEXT_PUBLIC_ALTERNATE_SITE_URLS || 'https://absghana.com').filter(
      (url) => url !== SITE_URL
    )
  )
);

// App URL (signup/login links from marketing site → app). Set NEXT_PUBLIC_APP_URL in env.
export const APP_URL =
  (process.env.NEXT_PUBLIC_APP_URL || 'https://myapp.africanbusinesssuite.com').replace(/\/$/, '');

// WhatsApp contact for "Contact sales" when self-signup is off. Number in international format (Ghana 233).
const WHATSAPP_NUMBER = '233555155972';
const WHATSAPP_MSG = encodeURIComponent("Hi, I'm visiting from the ABS website and would like to learn more.");
export const WHATSAPP_CONTACT_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`;
const WHATSAPP_SUPPORT_MSG = encodeURIComponent('Hi, I need help with ABS.');
export const WHATSAPP_SUPPORT_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_SUPPORT_MSG}`;
export const SUPPORT_HOURS = 'Mon – Fri, 9:00 AM – 6:00 PM (GMT)';

// Office and contact (contact page, footer, JSON-LD).
export const OFFICE_ADDRESS = '133 Balancer, Oyarifa School Junction, Accra';
export const CONTACT_PHONE = '0555155972';
export const CONTACT_PHONE_E164 = `+233${CONTACT_PHONE.replace(/^0/, '')}`; // +233555155972
export const CONTACT_EMAIL = 'info@africanbusinesssuite.com';

// Backend API URL for pricing, auth config, and contact forms. Set NEXT_PUBLIC_API_URL to override.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  (isDevelopment ? DEMO_API_URL : PRODUCTION_API_URL)
).replace(/\/$/, '');

// Fallback plan data when API is unavailable. Prices match Paystack (Backend/config/paystackPlans.js).
export const PLANS = [
  {
    id: 'trial',
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
    cta: {
      label: 'Start Trial',
      href: '/onboarding'
    }
  },
  {
    id: 'starter',
    name: 'Starter',
    description: '1 user and 1 branch/location.',
    price: {
      amount: 129,
      currency: 'GHS',
      display: 'GHS 129/mo',
      billingPeriodLabel: 'per month',
      billingDescription: 'GHS 99 per month when billed annually'
    },
    priceYearly: {
      amount: 1188,
      display: 'GHS 99/mo',
      billingDescription: 'GHS 99 per month when billed annually'
    },
    highlights: [
      '1 user',
      '1 branch/location/shop',
      'Unlimited invoices & jobs',
      'Accounting & payroll modules',
      'Email + chat support'
    ],
    perks: [
      '1 user',
      '1 branch/location/shop',
      'Quotes turn into jobs automatically',
      'Auto-generated invoices',
      'Email support'
    ],
    cta: {
      label: 'Start trial',
      href: '/onboarding'
    }
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Up to 3 users and 3 branches/locations.',
    price: {
      amount: 250,
      currency: 'GHS',
      display: 'GHS 250/mo',
      billingPeriodLabel: 'per month',
      billingDescription: 'GHS 199 per month when billed annually'
    },
    priceYearly: {
      amount: 2388,
      display: 'GHS 199/mo',
      billingDescription: 'GHS 199 per month when billed annually'
    },
    highlights: [
      'Everything in Starter',
      'Up to 3 users',
      'Up to 3 branches/locations/shops',
      'Advanced reporting & automation',
      'Inventory controls & vendor price lists',
      'Priority support with SLA'
    ],
    perks: [
      'Up to 3 users',
      'Up to 3 branches/locations/shops',
      'Inventory controls & vendor price lists',
      'Automated reminders & notifications',
      'Priority support'
    ],
    popular: true,
    cta: {
      label: 'Start trial',
      href: '/onboarding'
    }
  },
  {
    id: 'enterprise',
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
    perks: [
      'Up to 10 seats',
      'Up to 10 branches/locations/shops',
      'Dedicated success manager',
      'Custom workflow configuration',
      '24/7 priority support'
    ],
    cta: {
      label: 'Contact sales',
      href: '/contact?interest=enterprise'
    }
  }
];

// Business types
export const BUSINESS_TYPES = [
  {
    id: 'printing_press',
    name: 'Printing Press',
    description: 'Streamline your printing operations with automated quotes, job tracking, and pricing templates.',
    icon: 'Printer',
    features: [
      'Quote automation',
      'Job tracking & workflow',
      'Pricing templates',
      'Customer & vendor CRM',
      'Auto-generated invoices'
    ],
    color: 'green'
  },
  {
    id: 'shop',
    name: 'Shop',
    description: 'Manage your retail store with POS, inventory tracking, and sales analytics.',
    icon: 'ShoppingBag',
    features: [
      'Point of Sale (POS)',
      'Inventory management',
      'Sales tracking',
      'Product variants & barcodes',
      'Sales reports'
    ],
    color: 'lime'
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    description: 'Comprehensive pharmacy management with prescription tracking and regulatory compliance.',
    icon: 'Pill',
    features: [
      'Prescription management',
      'Drug inventory tracking',
      'Expiry alerts',
      'Drug interaction checker',
      'Regulatory compliance'
    ],
    color: 'green'
  }
];

// Business types carousel (full-width, one at a time). Each feature: { label, icon } (lucide-react icon name).
export const BUSINESS_CAROUSEL = [
  {
    id: 'printing_press',
    name: 'Printing press',
    description: 'Streamline printing operations with automated quotes, job tracking, and pricing templates.',
    features: [
      { label: 'Quote automation', icon: 'FileText' },
      { label: 'Job tracking & workflow', icon: 'ListTodo' },
      { label: 'Pricing templates', icon: 'Tag' },
      { label: 'Customer CRM & invoices', icon: 'Users' }
    ],
    image: 'https://images.unsplash.com/photo-1584556812950-a7643a223c36?w=1200&h=600&fit=crop',
    signupMode: 'studio'
  },
  {
    id: 'it_services',
    name: 'IT services',
    description: 'Manage projects, quotes, and billing for software development and IT support businesses.',
    features: [
      { label: 'Quotes & proposals', icon: 'FileText' },
      { label: 'Job & project tracking', icon: 'Kanban' },
      { label: 'Invoicing & payments', icon: 'Receipt' },
      { label: 'Client management', icon: 'Users' }
    ],
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=600&fit=crop',
    signupMode: 'studio'
  },
  {
    id: 'barber_salon',
    name: 'Barbering salon',
    description: 'Run your barbershop with appointments, service pricing, and payments in one place.',
    features: [
      { label: 'Appointments', icon: 'Calendar' },
      { label: 'Service menu & pricing', icon: 'ClipboardList' },
      { label: 'POS & payments', icon: 'CreditCard' },
      { label: 'Customer history', icon: 'History' }
    ],
    image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&h=600&fit=crop',
    signupMode: 'studio'
  },
  {
    id: 'hardware',
    name: 'Hardware shop',
    description: 'Manage building materials, stock, and sales for your hardware or construction supplies business.',
    features: [
      { label: 'Inventory & stock', icon: 'Package' },
      { label: 'POS & sales', icon: 'ShoppingCart' },
      { label: 'Suppliers & orders', icon: 'Truck' },
      { label: 'Reports', icon: 'BarChart3' }
    ],
    image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=1200&h=600&fit=crop',
    signupMode: 'shop'
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    description: 'Comprehensive pharmacy management with prescriptions, drug tracking, and compliance.',
    features: [
      { label: 'Prescriptions', icon: 'FileText' },
      { label: 'Drug inventory & expiry', icon: 'Pill' },
      { label: 'Drug interactions', icon: 'AlertTriangle' },
      { label: 'Regulatory compliance', icon: 'ShieldCheck' }
    ],
    image: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=1200&h=600&fit=crop',
    signupMode: 'pharmacy'
  },
  {
    id: 'shop',
    name: 'Retail shop',
    description: 'Run your store with POS, inventory, and sales analytics—from kiosk to supermarket.',
    features: [
      { label: 'Point of Sale (POS)', icon: 'ShoppingCart' },
      { label: 'Inventory & barcodes', icon: 'Package' },
      { label: 'Sales reports', icon: 'BarChart3' },
      { label: 'Customers & invoices', icon: 'Users' }
    ],
    image: 'https://images.unsplash.com/photo-1604717523929-5c2bb724ad63?w=1200&h=600&fit=crop',
    signupMode: 'shop'
  }
];

// Key features for features section (aligned with docs/APP_FEATURES_MARKETING.md)
export const KEY_FEATURES = [
  {
    name: 'Customers',
    description: 'Keep customer details, credit limits, and payment history in one place.',
    icon: 'Users'
  },
  {
    name: 'Products & inventory',
    description: 'Manage your product catalog, stock levels, and barcodes.',
    icon: 'Package'
  },
  {
    name: 'Invoicing & payments',
    description: 'Create and send invoices; get paid via link or record payments.',
    icon: 'Receipt'
  },
  {
    name: 'Reports & analytics',
    description: 'Reports and AI-powered insights on revenue, expenses, and performance.',
    icon: 'BarChart3'
  },
  {
    name: 'Employees & payroll',
    description: 'Manage staff and link to payroll.',
    icon: 'Shield'
  },
  {
    name: 'Sales & POS',
    description: 'Sell from your phone or laptop; accept cash, card, and mobile money; send receipts by SMS or WhatsApp.',
    icon: 'Smartphone'
  }
];

// Navigation items
export const NAV_ITEMS = [
  { label: 'For Shops', href: '/shops' },
  { label: 'For Pharmacies', href: '/pharmacies' },
  { label: 'For Studios', href: '/studios' },
  { label: 'Smart Report', href: '/smart-report' },
  // Pricing link gated by SHOW_PRICING in Header/Footer (see lib/featureFlags.ts)
];

/** Customer logos for the "They started here" section on the home page. */
export type CustomerLogo = {
  label: string;
  name: string;
  service: string;
  /** Initials fallback when no image is provided */
  text?: string;
  /** Tailwind background class for initials fallback */
  bg?: string;
  /** Public path to logo image (e.g. /sulas-enterprise-logo.png) */
  imageSrc?: string;
};

export const CUSTOMER_LOGOS: CustomerLogo[] = [
  {
    label: 'Restaurant',
    name: 'Barima Tripple 7',
    service: 'Restaurant · Accra',
    imageSrc: '/assets/images/barima-tripple-7-logo.png'
  },
  {
    label: 'Hardware',
    name: 'Sulas Enterprise',
    service: 'Pumps, tools & hardware',
    imageSrc: '/sulas-enterprise-logo.png'
  },
  {
    label: 'Shop',
    name: 'Jensah Engineering',
    service: 'Engineering Services',
    bg: 'bg-[#166534]',
    text: 'S'
  },
  {
    label: 'Studio',
    name: 'Deduce',
    service: 'Photography',
    bg: 'bg-gray-900',
    text: 'P'
  },
  {
    label: 'Pharmacy',
    name: 'Eden Expressions',
    service: 'Events & Wedding Planner',
    bg: 'bg-amber-800',
    text: 'Ph'
  },
  {
    label: 'Salon',
    name: 'Dohra',
    service: 'Retail & Distribution',
    bg: 'bg-rose-700',
    text: 'B'
  },
  {
    label: 'Retail',
    name: 'MiCaMa',
    service: 'Fresh. Just Like Home',
    bg: 'bg-teal-700',
    text: 'R'
  }
];

// Testimonials (placeholder data)
export const TESTIMONIALS = [
  {
    name: 'Emmanuel Nithan',
    role: 'Barima Tripple 7 · Restaurant · Accra',
    company: '',
    content:
      'ABS helps us keep restaurant operations organized from sales to stock.',
    rating: 5,
    image: '/assets/images/barima-tripple-7-logo.png'
  },
  {
    name: 'Sulas Enterprise',
    role: 'Hardware shop · pumps, tools & more',
    company: '',
    content:
      'We started exactly where you are — tracking pumps, tools, and hardware across notebooks and chats. Now we run sales, stock, and receipts from one place. Smart and easy.',
    rating: 5,
    image: '/sulas-enterprise-logo.png'
  },
  {
    name: 'Kwame Mensah',
    role: 'Owner',
    company: 'Accra Print Solutions',
    content: 'ABS has transformed how we manage quotes and jobs. The automation saves us hours every day.',
    rating: 5,
    image: null
  },
  {
    name: 'Ama Asante',
    role: 'Manager',
    company: 'City Pharmacy',
    content: 'The prescription management and drug tracking features are exactly what we needed. Highly recommended!',
    rating: 5,
    image: null
  }
];

// Trust indicators
export const TRUST_INDICATORS = {
  users: '500+',
  businesses: '200',
  industries: '16+'
};

// FAQ for marketing homepage (with category for tabs) – questions African businesses often ask
export const FAQ_CATEGORIES = ['General', 'Getting started', 'Plans & pricing', 'Security & support'] as const;

export const FAQ_ITEMS = [
  // General
  { category: 'General', question: 'What is African Business Suite?', answer: 'African Business Suite, or ABS, is a business management platform built for African businesses—shops, pharmacies, printing presses, salons, and more. You get POS, inventory, invoicing, customers, and reports in one place, so you don’t jump between apps.' },
  { category: 'General', question: 'Who is ABS for?', answer: 'Any African business that sells goods or services: retail shops, pharmacies, printing presses, salons, barbershops, hardware stores, and more. If you need POS, stock, invoices, or customer tracking in one place, ABS is for you.' },
  { category: 'General', question: 'Which countries do you support?', answer: 'ABS is built for businesses across Africa. We support local currencies (e.g. GHS, NGN, XAF) and work with payment providers like Paystack and Mobile Money. Your business can run in the currency you choose.' },
  { category: 'General', question: 'Can I sell on credit (memo/owó) and track who owes what?', answer: 'We’re adding customer credit and ledger so you can record sales on credit and see who owes what—no more relying only on WhatsApp or paper.' },
  { category: 'General', question: 'Do you support Mobile Money and card payments?', answer: 'Yes. We integrate with Paystack for card and Mobile Money so customers can pay you online or via link. You can also record cash and other payment types in POS.' },
  { category: 'General', question: 'Can I use ABS on my phone?', answer: 'Yes. There’s a mobile app so you can do sales, check stock, and view reports on your phone. The app works offline so you can sell even when the network is slow or down.' },
  // Getting started
  { category: 'Getting started', question: 'How do I sign up?', answer: 'Click Start Free Trial on the website, choose your business type (shop, pharmacy, studio, etc.), and create your account. You can add products, set prices, and invite your team right away.' },
  { category: 'Getting started', question: 'Can I use ABS when the internet is slow or off?', answer: 'Yes. The mobile app and POS work offline. Sales and data sync automatically when you’re back online, so you don’t lose sales during outages or in areas with poor connectivity.' },
  { category: 'Getting started', question: 'What currencies can I use?', answer: 'You can run your business in your local currency (e.g. GHS, NGN, XAF). Invoicing, sales, and reports all use the currency you set. We don’t lock you into a foreign currency.' },
  { category: 'Getting started', question: 'Do I need a card machine or special hardware?', answer: 'No. You can use your phone or tablet as a POS. For card and Mobile Money payments we use Paystack—customers pay via link or your payment page. No extra hardware required to start.' },
  { category: 'Getting started', question: 'How much data does ABS use?', answer: 'We keep data use low so it works well on mobile data. Once synced, you can work offline and only use data when syncing or loading new data. Ideal for areas where data is expensive or limited.' },
  { category: 'Getting started', question: 'Can I have more than one shop or branch?', answer: 'You can run one business (workspace) per account. If you have multiple branches, you can create separate workspaces or use one and track by location—depending on your plan. Contact us for multi-branch needs.' },
  // Plans & pricing
  { category: 'Plans & pricing', question: 'How does the free trial work?', answer: 'Start a free trial with no card required. Use all features for the trial period. When you’re ready, choose a plan in your local currency (e.g. GHS). You can change or cancel anytime.' },
  { category: 'Plans & pricing', question: 'Do you charge in GHS / NGN / my local currency?', answer: 'Yes. We price in local currency (e.g. GHS in Ghana) so you know exactly what you’re paying. Billing is through Paystack so you can use card or Mobile Money.' },
  { category: 'Plans & pricing', question: 'What’s included in each plan?', answer: 'All plans include POS, inventory, invoicing, customers, and reports. Higher plans add more team seats, advanced reporting, and priority support. Check the Pricing section on this site for full details.' },
  { category: 'Plans & pricing', question: 'Can I cancel if it doesn’t work for me?', answer: 'Yes. You can cancel your plan anytime. We don’t lock you into long contracts. If you’re on a trial, you can stop without being charged.' },
  // Security & support
  { category: 'Security & support', question: 'Is my data secure and private?', answer: 'Yes. Each business has its own isolated workspace. We don’t share your data with third parties for marketing. We use secure connections and follow good practices to protect your information.' },
  { category: 'Security & support', question: 'Where is my data stored?', answer: 'Your data is stored on secure servers. We use reliable infrastructure so your business data is available when you need it and protected from loss.' },
  { category: 'Security & support', question: 'How do I get help or support?', answer: 'Use in-app support or contact us through the website. We’re here to help you set up and get the most out of ABS. We respond to questions and can guide you through setup.' },
  { category: 'Security & support', question: 'Who is behind ABS?', answer: 'African Business Suite is built by a team focused on African SMEs. We’re building tools that fit how you run your business—offline-friendly, local currency, and features that matter on the ground.' },
];
