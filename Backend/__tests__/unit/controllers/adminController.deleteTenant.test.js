jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    col: jest.fn((name) => ({ col: name })),
    where: jest.fn((...args) => ({ where: args })),
    literal: jest.fn((value) => ({ literal: value })),
    transaction: jest.fn(async (fn) => fn({})),
  },
}));

jest.mock('../../../models', () => ({
  Tenant: { findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  User: {},
  UserTenant: {},
  Notification: {},
  Vendor: {},
  Job: {},
  InviteToken: {},
  SubscriptionPlan: { findOne: jest.fn(), create: jest.fn() },
  SubscriptionPayment: { findAll: jest.fn() },
  TenantAccessAudit: { create: jest.fn() },
  Setting: { findOrCreate: jest.fn() },
  Product: {},
  ProductVariant: {},
  ProductCategory: {},
  SaleItem: {},
  Invoice: {},
  Customer: {},
  Shop: {},
  Sale: {},
  JournalEntry: {},
  Barcode: {},
  OnlineProductListing: {},
  StockTransfer: {},
  StockCountItem: {},
  QuoteItem: {},
  Quote: {},
  QuoteActivity: {},
  SaleActivity: {},
}));

jest.mock('../../../services/subscriptionBillingService', () => ({
  resolveBillingStatus: jest.fn(),
  recordSubscriptionPaymentAndActivate: jest.fn(),
  resetTenantTrial: jest.fn(),
  toBillingPayload: jest.fn((status) => status),
  normalizePlan: jest.fn((plan) => plan),
  normalizeBillingPeriod: jest.fn((period) => period),
  normalizePaymentStatus: jest.fn((status) => status || 'success'),
  PAID_PLANS: ['starter', 'professional', 'enterprise'],
}));

jest.mock('../../../services/emailService', () => ({}));
jest.mock('../../../services/emailTemplates', () => ({
  inviteTenantEmail: jest.fn(),
}));
jest.mock('../../../utils/frontendUrl', () => ({
  getFrontendBaseUrl: jest.fn(() => 'https://app.example.com'),
}));
jest.mock('../../../utils/deleteTenantData', () => ({
  PLATFORM_TENANT_SLUG: 'platform',
  deleteTenantData: jest.fn(),
  deleteOrphanUsersWithoutTenants: jest.fn(),
}));
jest.mock('../../../services/permanentDeleteTenantService', () => ({
  permanentlyDeleteTenant: jest.fn(),
}));
jest.mock('../../../config/enterpriseTiers', () => ({
  ENTERPRISE_TIER_IDS: ['business', 'corporate'],
  getEnterpriseTier: jest.fn(),
}));
jest.mock('../../../services/subscriptionPlanCatalogService', () => ({
  buildEnterprisePaymentMetadata: jest.fn(),
}));
jest.mock('../../../utils/seatLimitHelper', () => ({
  getSeatUsageSummary: jest.fn(),
}));
jest.mock('../../../utils/storageLimitHelper', () => ({
  getStorageUsageSummary: jest.fn(),
}));
jest.mock('../../../middleware/cache', () => ({
  invalidateProductListCache: jest.fn(),
  invalidateInvoiceListCache: jest.fn(),
  invalidateSaleListCache: jest.fn(),
  invalidateAfterMutation: jest.fn(),
}));
jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn(),
}));
jest.mock('../../../utils/performanceLogger', () => ({
  getRecentSlowOperations: jest.fn(),
}));

const { permanentlyDeleteTenant } = require('../../../services/permanentDeleteTenantService');
const { deleteTenant } = require('../../../controllers/adminController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('adminController.deleteTenant', () => {
  const tenant = { id: 'tenant-1', name: 'Acme Print Shop', slug: 'acme-print-shop' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success when the service hard-deletes the tenant', async () => {
    permanentlyDeleteTenant.mockResolvedValue(tenant);
    const req = {
      params: { id: tenant.id },
      body: { confirmName: tenant.name },
      user: { id: 'admin-1', isPlatformAdmin: true },
      tenantId: 'platform-tenant-id',
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteTenant(req, res, next);

    expect(permanentlyDeleteTenant).toHaveBeenCalledWith({
      tenantId: tenant.id,
      confirmName: tenant.name,
      actor: {
        id: 'admin-1',
        isPlatformAdmin: true,
        tenantId: 'platform-tenant-id',
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns CONFIRM_NAME_REQUIRED for a wrong confirm name', async () => {
    const error = new Error('Type the tenant name exactly (or DELETE) to confirm permanent deletion.');
    error.statusCode = 400;
    error.errorCode = 'CONFIRM_NAME_REQUIRED';
    permanentlyDeleteTenant.mockRejectedValue(error);

    const req = {
      params: { id: tenant.id },
      body: { confirmName: 'wrong' },
      user: { id: 'admin-1', isPlatformAdmin: true },
      tenantId: 'platform-tenant-id',
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: error.message,
      errorCode: 'CONFIRM_NAME_REQUIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant is missing', async () => {
    const error = new Error('Tenant not found');
    error.statusCode = 404;
    error.errorCode = 'RESOURCE_NOT_FOUND';
    permanentlyDeleteTenant.mockRejectedValue(error);

    const req = {
      params: { id: 'missing' },
      body: { confirmName: 'DELETE' },
      user: { id: 'admin-1', isPlatformAdmin: true },
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Tenant not found',
      errorCode: 'RESOURCE_NOT_FOUND',
    });
  });

  it('returns 403 when the caller is not a platform admin', async () => {
    const error = new Error('Platform administrator access required');
    error.statusCode = 403;
    error.errorCode = 'FORBIDDEN';
    permanentlyDeleteTenant.mockRejectedValue(error);

    const req = {
      params: { id: tenant.id },
      body: { confirmName: tenant.name },
      user: { id: 'staff-1', isPlatformAdmin: false },
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteTenant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Platform administrator access required',
      errorCode: 'FORBIDDEN',
    });
  });
});
