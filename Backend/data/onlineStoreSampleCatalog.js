/**
 * Platform sample catalog for admin Online Store provisioning.
 * Seeded into tenant Product + OnlineProductListing rows with metadata.isSample.
 * Keep ids stable — they are used for idempotent seeding per tenant.
 */

const ONLINE_STORE_SAMPLE_CATALOG = [
  {
    id: 'sample-1',
    title: 'Everyday Essentials Pack',
    slug: 'everyday-essentials',
    shortDescription: 'Starter kit for your first customers',
    publicPrice: 89,
    compareAtPrice: 120,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'sample-2',
    title: 'Signature Collection',
    slug: 'signature-collection',
    shortDescription: 'Hero product with premium finish',
    publicPrice: 249,
    compareAtPrice: null,
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'sample-3',
    title: 'Weekend Bundle',
    slug: 'weekend-bundle',
    shortDescription: 'Value set for promotions',
    publicPrice: 149,
    compareAtPrice: 180,
    images: ['https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'sample-4',
    title: 'Gift Card',
    slug: 'gift-card',
    shortDescription: 'Flexible amount for any occasion',
    publicPrice: 50,
    compareAtPrice: null,
    images: ['https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'sample-5',
    title: 'Limited Drop Tee',
    slug: 'limited-drop-tee',
    shortDescription: 'Seasonal highlight SKU',
    publicPrice: 75,
    compareAtPrice: null,
    images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'sample-6',
    title: 'Care Kit',
    slug: 'care-kit',
    shortDescription: 'Add-on that lifts average order value',
    publicPrice: 35,
    compareAtPrice: 45,
    images: ['https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=800&q=80'],
  },
];

/** Rental-tenant sample catalog — daily rates, rent-only SKUs. */
const ONLINE_STORE_RENTAL_SAMPLE_CATALOG = [
  {
    id: 'rental-sample-1',
    title: 'Compact Excavator',
    slug: 'compact-excavator',
    shortDescription: 'Daily rental for landscaping and light construction',
    publicPrice: 450,
    compareAtPrice: null,
    isRentable: true,
    isSalable: false,
    rentalRatePerDay: 450,
    rentalTerms: 'Operator must be 21+. Fuel not included. Security deposit required at pickup.',
    images: ['https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'rental-sample-2',
    title: 'Mini Bus (14 Seater)',
    slug: 'mini-bus-14-seater',
    shortDescription: 'Ideal for group outings and airport transfers',
    publicPrice: 350,
    compareAtPrice: null,
    isRentable: true,
    isSalable: false,
    rentalRatePerDay: 350,
    rentalTerms: 'Licensed driver required. Daily mileage cap applies. Return with same fuel level.',
    images: ['https://images.unsplash.com/photo-1544628917-48d0d34105a9?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'rental-sample-3',
    title: 'Event Tent (10×10 m)',
    slug: 'event-tent-10x10',
    shortDescription: 'Weather-resistant tent for outdoor events',
    publicPrice: 120,
    compareAtPrice: 150,
    isRentable: true,
    isSalable: false,
    rentalRatePerDay: 120,
    rentalTerms: 'Setup assistance available on request. Customer responsible for stakes and weights.',
    images: ['https://images.unsplash.com/photo-1519167758481-83f550bb49b8?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'rental-sample-4',
    title: 'Industrial Generator 5kVA',
    slug: 'industrial-generator-5kva',
    shortDescription: 'Reliable backup power for sites and events',
    publicPrice: 85,
    compareAtPrice: null,
    isRentable: true,
    isSalable: false,
    rentalRatePerDay: 85,
    rentalTerms: 'Outdoor use only with proper ventilation. Fuel charged separately.',
    images: ['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'rental-sample-5',
    title: 'Professional Camera Kit',
    slug: 'professional-camera-kit',
    shortDescription: 'Body, lens, and accessories for shoots',
    publicPrice: 95,
    compareAtPrice: null,
    isRentable: true,
    isSalable: true,
    rentalRatePerDay: 95,
    rentalTerms: 'Handle with care. Loss/damage fees apply per agreement.',
    images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80'],
  },
  {
    id: 'rental-sample-6',
    title: 'Folding Chairs (Set of 20)',
    slug: 'folding-chairs-set-20',
    shortDescription: 'Stackable chairs for weddings and meetings',
    publicPrice: 40,
    compareAtPrice: null,
    isRentable: true,
    isSalable: false,
    rentalRatePerDay: 40,
    rentalTerms: 'Customer pickup and return. Cleaning fee may apply for heavily soiled items.',
    images: ['https://images.unsplash.com/photo-1519167758481-83f550bb49b8?auto=format&fit=crop&w=800&q=80'],
  },
];

/**
 * @param {{ businessType?: string|null }} [options]
 * @returns {Array<object>}
 */
const listSampleCatalog = ({ businessType = null } = {}) => {
  const catalog = businessType === 'rental'
    ? ONLINE_STORE_RENTAL_SAMPLE_CATALOG
    : ONLINE_STORE_SAMPLE_CATALOG;
  return catalog.map((item) => ({ ...item }));
};

/**
 * @param {string} id
 * @param {{ businessType?: string|null }} [options]
 * @returns {object|null}
 */
const getSampleById = (id, { businessType = null } = {}) => {
  const key = String(id || '').trim();
  if (!key) return null;
  const catalog = businessType === 'rental'
    ? ONLINE_STORE_RENTAL_SAMPLE_CATALOG
    : ONLINE_STORE_SAMPLE_CATALOG;
  return catalog.find((item) => item.id === key)
    || ONLINE_STORE_SAMPLE_CATALOG.find((item) => item.id === key)
    || ONLINE_STORE_RENTAL_SAMPLE_CATALOG.find((item) => item.id === key)
    || null;
};

module.exports = {
  ONLINE_STORE_SAMPLE_CATALOG,
  ONLINE_STORE_RENTAL_SAMPLE_CATALOG,
  listSampleCatalog,
  getSampleById,
};
