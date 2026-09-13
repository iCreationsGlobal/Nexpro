jest.mock('../../../models', () => ({
  Tenant: {
    findByPk: jest.fn(),
  },
  Shop: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../../utils/tenantEntitlements', () => ({
  getTenantEffectiveEntitlements: jest.fn(),
}));

jest.mock('../../../utils/shopUtils', () => ({
  ensureDefaultShop: jest.fn(),
}));

jest.mock('../../../services/rentalSettingsService', () => ({
  ensureRentalSettings: jest.fn(),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateAuthBootstrapCache: jest.fn(),
}));

const { Tenant, Shop } = require('../../../models');
const { getTenantEffectiveEntitlements } = require('../../../utils/tenantEntitlements');
const { ensureDefaultShop } = require('../../../utils/shopUtils');
const { ensureRentalSettings } = require('../../../services/rentalSettingsService');
const {
  getWorkspaceManifest,
  isWorkspaceLocked,
  buildRentalWorkspaceManifest,
  provisionRentalWorkspace,
} = require('../../../services/tenantProvisioningService');

describe('tenantProvisioningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureDefaultShop.mockResolvedValue({ id: 'shop-1' });
    ensureRentalSettings.mockResolvedValue({ dayBillingMode: 'end_of_day' });
    Shop.findOne
      .mockResolvedValueOnce({ id: 'shop-1' })
      .mockResolvedValue(null);
    getTenantEffectiveEntitlements.mockResolvedValue({
      enabledFeatures: ['rentals', 'shopsModule', 'crm'],
      effectiveFeatureFlags: { rentals: true, shopsModule: true, crm: true },
    });
  });

  it('returns existing manifest without rewriting when not forced', async () => {
    const existing = { version: 1, kind: 'rental', defaultBranchId: 'shop-1' };
    Tenant.findByPk.mockResolvedValue({
      id: 'tenant-1',
      businessType: 'rental',
      metadata: { workspaceManifest: existing },
    });

    const result = await provisionRentalWorkspace('tenant-1');
    expect(result.created).toBe(false);
    expect(result.manifest).toEqual(existing);
    expect(ensureRentalSettings).not.toHaveBeenCalled();
  });

  it('writes rental workspace manifest for rental tenants', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    Tenant.findByPk.mockResolvedValue({
      id: 'tenant-1',
      businessType: 'rental',
      metadata: {
        onboarding: { completedAt: '2026-08-29T10:00:00.000Z' },
        rentalType: 'equipment_rental',
      },
      save,
    });

    const result = await provisionRentalWorkspace('tenant-1', { subType: 'equipment_rental' });

    expect(result.created).toBe(true);
    expect(result.manifest.kind).toBe('rental');
    expect(result.manifest.defaultBranchId).toBe('shop-1');
    expect(result.manifest.enabledFeatures).toEqual(['crm', 'rentals', 'shopsModule']);
    expect(result.manifest.settingsKeys.rental.dayBillingMode).toBe('end_of_day');
    expect(save).toHaveBeenCalled();
    expect(ensureDefaultShop).toHaveBeenCalledWith('tenant-1');
    expect(ensureRentalSettings).toHaveBeenCalledWith('tenant-1');
  });

  it('buildRentalWorkspaceManifest includes rental UI defaults', () => {
    const manifest = buildRentalWorkspaceManifest({
      tenant: { metadata: { onboarding: { completedAt: '2026-08-29T10:00:00.000Z' } } },
      enabledFeatures: ['rentals'],
      effectiveFeatureFlags: { rentals: true },
      defaultBranchId: 'shop-1',
      rentalSettings: { dayBillingMode: 'overnight' },
    });

    expect(manifest.modules.rentals).toBe(true);
    expect(manifest.modules.quotes).toBe(false);
    expect(manifest.ui.hideNav).toContain('quotes');
    expect(getWorkspaceManifest({ metadata: { workspaceManifest: manifest } })).toEqual(manifest);
  });

  it('rejects non-rental tenants', async () => {
    Tenant.findByPk.mockResolvedValue({
      id: 'tenant-2',
      businessType: 'shop',
      metadata: {},
    });

    await expect(provisionRentalWorkspace('tenant-2')).rejects.toThrow('not a rental workspace');
  });

  it('isWorkspaceLocked is true when onboarding completed and manifest locked', () => {
    expect(
      isWorkspaceLocked({
        metadata: {
          onboarding: { completedAt: '2026-08-29T10:00:00.000Z' },
          workspaceManifest: { lockedAt: '2026-08-29T10:00:00.000Z' },
        },
      })
    ).toBe(true);
    expect(isWorkspaceLocked({ metadata: { onboarding: { completedAt: '2026-08-29T10:00:00.000Z' } } })).toBe(false);
  });
});
