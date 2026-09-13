jest.mock('../../../utils/shopUtils', () => ({
  hasWorkspaceWideShopAccess: jest.fn(),
  getUserShopIds: jest.fn(),
  ensureDefaultShop: jest.fn(),
  isShopScopedBusinessType: jest.fn((type) => ['shop', 'pharmacy', 'rental'].includes(type)),
}));

const {
  hasWorkspaceWideShopAccess,
  getUserShopIds,
  ensureDefaultShop,
  isShopScopedBusinessType,
} = require('../../../utils/shopUtils');
const { shopContext } = require('../../../middleware/shopContext');

const runMiddleware = (req) =>
  new Promise((resolve, reject) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((body) => resolve({ status: res.status.mock.calls[0]?.[0], body })),
    };
    shopContext(req, res, (err) => (err ? reject(err) : resolve({ next: true, req })));
  });

describe('shopContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isShopScopedBusinessType.mockImplementation((type) => ['shop', 'pharmacy', 'rental'].includes(type));
    hasWorkspaceWideShopAccess.mockReturnValue(true);
    getUserShopIds.mockResolvedValue(['shop-valid']);
    ensureDefaultShop.mockResolvedValue({ id: 'shop-default' });
  });

  it('ignores stale x-shop-id for workspace-wide users', async () => {
    const req = {
      tenant: { businessType: 'shop', name: 'Shop' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenantRole: 'admin',
      headers: { 'x-shop-id': 'shop-deleted' },
    };

    await runMiddleware(req);

    expect(req.shopFilterId).toBe('shop-default');
  });

  it('sets shopFilterId when header matches an allowed shop', async () => {
    const req = {
      tenant: { businessType: 'shop', name: 'Shop' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenantRole: 'admin',
      headers: { 'x-shop-id': 'shop-valid' },
    };

    await runMiddleware(req);

    expect(req.shopFilterId).toBe('shop-valid');
  });

  it('activates shop scope for pharmacy tenants', async () => {
    const req = {
      tenant: { businessType: 'pharmacy', name: 'Pharmacy' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenantRole: 'admin',
      headers: { 'x-shop-id': 'shop-valid' },
    };

    await runMiddleware(req);

    expect(req.shopScoped).toBe(true);
    expect(req.shopFilterId).toBe('shop-valid');
  });

  it('creates a default main location for rental tenants', async () => {
    const req = {
      tenant: { businessType: 'rental', name: 'Hire Hub' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenantRole: 'admin',
      headers: {},
    };

    await runMiddleware(req);

    expect(req.shopScoped).toBe(true);
    expect(ensureDefaultShop).toHaveBeenCalledWith('tenant-1', { name: 'Hire Hub' });
    expect(req.defaultShopId).toBe('shop-default');
    expect(req.shopFilterId).toBe('shop-default');
  });

  it('skips shop scope for studio tenants', async () => {
    isShopScopedBusinessType.mockReturnValue(false);

    const req = {
      tenant: { businessType: 'studio', name: 'Studio' },
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenantRole: 'admin',
      headers: {},
    };

    await runMiddleware(req);

    expect(req.shopScoped).toBe(false);
    expect(ensureDefaultShop).not.toHaveBeenCalled();
  });
});
