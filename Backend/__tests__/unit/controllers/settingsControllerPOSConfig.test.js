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

jest.mock('../../../utils/taskAutomationConfig', () => ({
  normalizeTaskAutomation: jest.fn((value) => value || {}),
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
  invalidateCache: jest.fn(),
  invalidateAuthBootstrapCache: jest.fn(),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../services/customerNotificationBridgeService', () => ({
  getSaleReceiptAutomationCoverage: jest.fn().mockResolvedValue({ sms: false, email: false, whatsapp: false }),
}));

const { Setting } = require('../../../models');
const { getPOSConfig, updatePOSConfig } = require('../../../controllers/settingsController');

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

describe('settingsController POS config scanning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPOSConfig', () => {
    it('returns scanning defaults when pos_config is not stored', async () => {
      Setting.findOne.mockResolvedValue(null);

      const req = { tenantId: 'tenant-1' };
      const res = buildRes();

      await getPOSConfig(req, res, jest.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body.data.scanning).toEqual({
        enabled: true,
        allowManualBarcodeEntry: true,
        allowExternalScanner: true,
      });
    });

    it('merges stored scanning settings with defaults', async () => {
      Setting.findOne.mockImplementation(({ where }) => {
        if (where.key === 'pos_config') {
          return {
            value: {
              scanning: { enabled: true },
            },
          };
        }
        return null;
      });

      const req = { tenantId: 'tenant-1' };
      const res = buildRes();

      await getPOSConfig(req, res, jest.fn());

      expect(res.body.data.scanning).toEqual({
        enabled: true,
        allowManualBarcodeEntry: true,
        allowExternalScanner: true,
      });
    });
  });

  describe('updatePOSConfig', () => {
    it('persists scanning.enabled as boolean', async () => {
      const existingValue = {
        receipt: { mode: 'ask', channels: ['sms', 'print'] },
        print: { format: 'a4', showLogo: true, color: true, fontSize: 'normal' },
        customer: { phoneRequired: false, nameRequired: false },
      };
      Setting.findOne.mockResolvedValue({ value: existingValue });

      const settingRecord = {
        value: existingValue,
        save: jest.fn().mockResolvedValue(undefined),
      };
      Setting.findOrCreate.mockResolvedValue([settingRecord, false]);

      const req = {
        tenantId: 'tenant-1',
        body: { scanning: { enabled: 'yes' } },
      };
      const res = buildRes();
      const next = jest.fn();

      await updatePOSConfig(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body.data.scanning.enabled).toBe(true);
      expect(res.body.data.scanning.allowManualBarcodeEntry).toBe(true);
    });
  });
});
