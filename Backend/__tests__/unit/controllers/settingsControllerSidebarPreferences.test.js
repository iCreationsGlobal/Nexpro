jest.mock('../../../config/database', () => ({
  sequelize: {},
}));

jest.mock('../../../models', () => ({
  Setting: { findOne: jest.fn(), findOrCreate: jest.fn() },
  User: { findByPk: jest.fn(), unscoped: () => ({ findByPk: jest.fn() }) },
  Tenant: { findByPk: jest.fn() },
  UserTenant: { update: jest.fn() },
  TenantAccessAudit: { create: jest.fn() },
}));

jest.mock('../../../middleware/upload', () => ({
  baseUploadDir: '/tmp/uploads',
}));

jest.mock('../../../utils/tenantUtils', () => ({
  sanitizePayload: jest.fn((body = {}) => ({ ...body })),
  findTenantWithOptionalColumns: jest.fn(),
}));

jest.mock('../../../utils/taxConfig', () => ({
  normalizeTaxConfig: jest.fn((value) => value || {}),
  validateMergedTaxPayload: jest.fn(),
  warmTaxConfigCache: jest.fn(),
}));

jest.mock('../../../config/customerSourceOptions', () => ({
  getCustomerSourceOptions: jest.fn(() => []),
}));

jest.mock('../../../config/leadSourceOptions', () => ({
  getLeadSourceOptions: jest.fn(() => []),
}));

jest.mock('../../../services/platformAdminNotificationService', () => ({
  notifyDataDeletionRequested: jest.fn(),
}));

jest.mock('../../../utils/tenantClassification', () => ({
  DEFAULT_SHOP_TYPE: 'general',
  normalizeTenantClassification: jest.fn((tenant) => tenant),
  normalizeTenantInstanceForRequest: jest.fn((tenant) => tenant),
}));

jest.mock('../../../services/paystackService', () => ({
  secretKey: 'sk_test',
  createSubaccount: jest.fn(),
  userFacingPaystackErrorMessage: jest.fn(() => null),
  paystackResponseIsUnusableHtml: jest.fn(() => false),
  getMoMoBankCode: jest.fn(() => 'MOMO'),
}));

jest.mock('../../../services/emailService', () => ({
  sendPlatformMessage: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../services/tenantMomoCollectionService', () => ({
  getMtnCollectionPublicSummary: jest.fn(() => ({ configured: false })),
  getMtnCollectionSettings: jest.fn(() => ({})),
  saveMtnCollectionSettings: jest.fn(),
  clearMtnCollectionSettings: jest.fn(),
}));

jest.mock('../../../services/tenantHubtelCollectionService', () => ({
  getHubtelCollectionPublicSummary: jest.fn(() => ({ configured: false })),
}));

jest.mock('../../../services/sidebarPreferenceHelper', () => ({
  getSidebarPreferences: jest.fn(),
  getTenantDefaultHiddenSidebarKeys: jest.fn(),
  sanitizeHiddenSidebarKeys: jest.fn((keys) => keys || []),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateTenantSettingsCache: jest.fn(),
  invalidateTenantMembershipCache: jest.fn(),
}));

const { Tenant, UserTenant, TenantAccessAudit } = require('../../../models');
const {
  getSidebarPreferences: buildSidebarPreferences,
  getTenantDefaultHiddenSidebarKeys,
  sanitizeHiddenSidebarKeys,
} = require('../../../services/sidebarPreferenceHelper');
const {
  getSidebarPreferences,
  updateSidebarPreferences,
} = require('../../../controllers/settingsController');

const buildRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('settingsController sidebar preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSidebarPreferences', () => {
    it('returns tenant defaults for read-only support access without membership', async () => {
      getTenantDefaultHiddenSidebarKeys.mockReturnValue(['reports', 'marketing']);

      const req = {
        isSupportAccess: true,
        supportAccessMode: 'read_only',
        tenantId: 'tenant-1',
        tenant: {
          businessType: 'shop',
          metadata: { defaultHiddenSidebarKeys: ['reports', 'marketing'] },
        },
      };
      const res = buildRes();
      const next = jest.fn();

      await getSidebarPreferences(req, res, next);

      expect(getTenantDefaultHiddenSidebarKeys).toHaveBeenCalled();
      expect(buildSidebarPreferences).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          hiddenSidebarKeys: ['reports', 'marketing'],
          source: 'tenant_default',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns tenant defaults for configuration support access', async () => {
      getTenantDefaultHiddenSidebarKeys.mockReturnValue(['pricing']);

      const req = {
        isSupportAccess: true,
        supportAccessMode: 'configuration',
        tenantId: 'tenant-1',
        tenant: {
          businessType: 'shop',
          metadata: {},
        },
      };
      const res = buildRes();

      await getSidebarPreferences(req, res, jest.fn());

      expect(res.body.data).toEqual({
        hiddenSidebarKeys: ['pricing'],
        source: 'tenant_default',
      });
    });

    it('returns 400 when membership is missing for non-support users', async () => {
      const req = {
        isSupportAccess: false,
        tenantId: 'tenant-1',
        tenantMembership: null,
      };
      const res = buildRes();

      await getSidebarPreferences(req, res, jest.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Tenant membership required');
    });

    it('uses membership preferences for regular tenants', async () => {
      buildSidebarPreferences.mockReturnValue({
        hiddenSidebarKeys: ['vendors'],
        source: 'user',
      });

      const req = {
        tenantId: 'tenant-1',
        tenantMembership: { id: 'm1', metadata: {} },
        tenant: { businessType: 'shop', metadata: {} },
      };
      const res = buildRes();

      await getSidebarPreferences(req, res, jest.fn());

      expect(buildSidebarPreferences).toHaveBeenCalled();
      expect(res.body.data).toEqual({
        hiddenSidebarKeys: ['vendors'],
        source: 'user',
      });
    });
  });

  describe('updateSidebarPreferences', () => {
    it('updates tenant defaults in configuration support mode', async () => {
      sanitizeHiddenSidebarKeys.mockReturnValue(['reports']);
      getTenantDefaultHiddenSidebarKeys.mockReturnValue([]);
      const tenant = {
        businessType: 'shop',
        metadata: {},
        save: jest.fn().mockResolvedValue(undefined),
      };
      Tenant.findByPk.mockResolvedValue(tenant);
      TenantAccessAudit.create.mockResolvedValue({});

      const req = {
        isSupportAccess: true,
        supportAccessMode: 'configuration',
        tenantId: 'tenant-1',
        tenant,
        user: { id: 'admin-1' },
        body: { hiddenSidebarKeys: ['reports'] },
        supportAccessSession: { reason: 'test' },
      };
      const res = buildRes();

      await updateSidebarPreferences(req, res, jest.fn());

      expect(tenant.metadata.defaultHiddenSidebarKeys).toEqual(['reports']);
      expect(tenant.save).toHaveBeenCalled();
      expect(UserTenant.update).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({
        hiddenSidebarKeys: ['reports'],
        source: 'tenant_default',
      });
    });

    it('returns 400 when membership is missing outside configuration support', async () => {
      sanitizeHiddenSidebarKeys.mockReturnValue([]);

      const req = {
        isSupportAccess: false,
        tenantId: 'tenant-1',
        tenantMembership: null,
        tenant: { businessType: 'shop', metadata: {} },
        body: { hiddenSidebarKeys: [] },
      };
      const res = buildRes();

      await updateSidebarPreferences(req, res, jest.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Tenant membership required');
    });
  });
});
