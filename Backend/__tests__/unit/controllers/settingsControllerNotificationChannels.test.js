jest.mock('../../../config/database', () => ({
  sequelize: {},
}));

jest.mock('../../../models', () => ({
  Setting: { findOne: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn(), create: jest.fn() },
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
  invalidateCache: jest.fn(),
  invalidateAuthBootstrapCache: jest.fn(),
  getCacheValue: jest.fn(() => undefined),
  setCacheValue: jest.fn(),
  getNotificationChannelsCacheKey: jest.fn((tenantId) => `settings:notification-channels:${tenantId}`),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn().mockResolvedValue(null),
}));

const { Setting } = require('../../../models');
const {
  getNotificationChannels,
  updateCustomerNotificationPreferences,
} = require('../../../controllers/settingsController');

const buildRes = () => ({
  statusCode: 200,
  body: null,
  set: jest.fn(),
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const mockPrefs = (value) => {
  Setting.findAll.mockResolvedValue(
    value === undefined ? [] : [{ key: 'customer-notification-preferences', value }]
  );
};

describe('settingsController receipt auto-send preference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports auto-send receipt as on when the workspace never set it', async () => {
    mockPrefs(undefined);
    const res = buildRes();

    await getNotificationChannels({ tenantId: 'tenant-1' }, res, jest.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.data.autoSendReceiptToCustomer).toBe(true);
  });

  it('reports auto-send receipt as on when other preferences exist but the key is unset', async () => {
    mockPrefs({ autoSendInvoiceToCustomer: false });
    const res = buildRes();

    await getNotificationChannels({ tenantId: 'tenant-1' }, res, jest.fn());

    expect(res.body.data.autoSendReceiptToCustomer).toBe(true);
    expect(res.body.data.autoSendInvoiceToCustomer).toBe(false);
  });

  it('reports auto-send receipt as off only when explicitly turned off', async () => {
    mockPrefs({ autoSendReceiptToCustomer: false });
    const res = buildRes();

    await getNotificationChannels({ tenantId: 'tenant-1' }, res, jest.fn());

    expect(res.body.data.autoSendReceiptToCustomer).toBe(false);
  });

  it('returns the effective value after saving other preferences', async () => {
    Setting.findOne.mockResolvedValue(null);
    Setting.create.mockResolvedValue({});
    const res = buildRes();

    await updateCustomerNotificationPreferences(
      { tenantId: 'tenant-1', body: { sendPaymentReminderEmail: true } },
      res,
      jest.fn()
    );

    expect(Setting.create).toHaveBeenCalledWith(expect.objectContaining({
      value: { sendPaymentReminderEmail: true },
    }));
    expect(res.body.data.autoSendReceiptToCustomer).toBe(true);
    expect(res.body.data.sendPaymentReminderEmail).toBe(true);
  });
});
