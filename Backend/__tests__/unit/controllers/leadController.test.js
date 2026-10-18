jest.mock('../../../models', () => ({
  Lead: {
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  },
  LeadActivity: {},
  User: {},
  Customer: {},
  Job: {},
}));

jest.mock('../../../config/config', () => ({
  nodeEnv: 'test',
}));

jest.mock('../../../utils/tenantUtils', () => ({
  applyTenantFilter: jest.fn((tenantId, where = {}) => ({ ...where, tenantId })),
  sanitizePayload: jest.fn((payload) => payload),
}));

jest.mock('../../../utils/studioLocationUtils', () => ({
  applyStudioLocationReadFilter: jest.fn((req, where = {}) => where),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyShopReadFilter: jest.fn((req, where = {}) => (
    req.shopFilterId ? { ...where, shopId: { in: [req.shopFilterId, null] } } : where
  )),
  attachScopedToPayload: jest.fn((req, payload = {}) => (
    req.shopFilterId ? { ...payload, shopId: req.shopFilterId } : payload
  )),
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));

jest.mock('../../../services/activityLogger', () => ({}));
jest.mock('../../../middleware/cache', () => ({
  invalidateCustomerListCache: jest.fn(),
}));

const { Lead } = require('../../../models');
const { getLeads, createLead } = require('../../../controllers/leadController');
const { applyShopReadFilter } = require('../../../utils/shopUtils');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('leadController shop scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Lead.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    Lead.create.mockResolvedValue({ id: 'lead-1' });
    Lead.findOne.mockResolvedValue({ id: 'lead-1' });
  });

  it('applies shop read filter when listing leads', async () => {
    const req = {
      tenantId: 'tenant-1',
      shopScoped: true,
      shopFilterId: 'shop-1',
      query: {},
    };
    const res = makeRes();
    const next = jest.fn();

    await getLeads(req, res, next);

    expect(applyShopReadFilter).toHaveBeenCalled();
    expect(Lead.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        shopId: { in: ['shop-1', null] },
      }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches shopId when creating a lead in a shop workspace', async () => {
    const req = {
      tenantId: 'tenant-1',
      shopScoped: true,
      shopFilterId: 'shop-1',
      user: { id: 'user-1' },
      body: { name: 'Jane Doe' },
    };
    const res = makeRes();
    const next = jest.fn();

    await createLead(req, res, next);

    expect(Lead.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Jane Doe',
      shopId: 'shop-1',
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
