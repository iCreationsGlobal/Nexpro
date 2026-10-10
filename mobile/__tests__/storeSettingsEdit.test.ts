import { buildLiveStoreEditPayload, canEditLiveStoreSettings } from '../utils/storeSettingsEdit';

const liveStore = {
  id: 'store-1',
  enabled: true,
  slug: 'sulas-enterprise',
  displayName: 'Sulas Enterprise',
  description: 'Lawn and garden equipment',
  contactPhone: '0201234567',
  whatsappNumber: '0241234567',
  contactEmail: 'shop@example.com',
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: '15.00',
  templateId: 'bold',
  primaryColor: '#0369a1',
  secondaryColor: '#f59e0b',
  heroSlides: [{ imageUrl: '/hero.png' }],
  bannerImageUrl: '/banner.png',
  metadata: { testimonials: [{ quote: 'Great' }] },
};

describe('buildLiveStoreEditPayload', () => {
  it('keeps the store published, its link and delivery when changing one field', () => {
    const payload = buildLiveStoreEditPayload(liveStore, { displayName: 'Sulas Garden' });

    expect(payload).toEqual({
      enabled: true,
      slug: 'sulas-enterprise',
      displayName: 'Sulas Garden',
      description: 'Lawn and garden equipment',
      contactPhone: '0201234567',
      whatsappNumber: '0241234567',
      contactEmail: 'shop@example.com',
      pickupEnabled: true,
      deliveryEnabled: true,
      deliveryFee: '15.00',
    });
  });

  it('leaves out fields the backend keeps on its own, so they are not reset or re-processed', () => {
    const payload = buildLiveStoreEditPayload(liveStore, { primaryColor: '#7c3aed' });

    expect(payload.primaryColor).toBe('#7c3aed');
    ['templateId', 'secondaryColor', 'heroSlides', 'bannerImageUrl', 'metadata', 'id'].forEach((field) => {
      expect(payload).not.toHaveProperty(field);
    });
  });

  it('lets changes override saved values', () => {
    const payload = buildLiveStoreEditPayload(liveStore, { whatsappNumber: '0551234567' });

    expect(payload.whatsappNumber).toBe('0551234567');
    expect(payload.contactPhone).toBe('0201234567');
  });
});

describe('canEditLiveStoreSettings', () => {
  it('requires loaded settings that include the published flag', () => {
    expect(canEditLiveStoreSettings(liveStore)).toBe(true);
    expect(canEditLiveStoreSettings(null)).toBe(false);
    expect(canEditLiveStoreSettings({})).toBe(false);
    expect(canEditLiveStoreSettings({ id: 'store-1', displayName: 'Local only' })).toBe(false);
  });
});
