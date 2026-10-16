jest.mock('../../../models', () => ({
  Tenant: { findByPk: jest.fn() },
}));
jest.mock('../../../services/watchDeviceService', () => ({
  authenticateDeviceKey: jest.fn(),
}));
jest.mock('../../../middleware/featureAccess', () => ({
  getTenantFeatures: jest.fn(),
}));

const { Tenant } = require('../../../models');
const { authenticateDeviceKey } = require('../../../services/watchDeviceService');
const { getTenantFeatures } = require('../../../middleware/featureAccess');
const { requireWatchDevice } = require('../../../middleware/watchDeviceAuth');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('requireWatchDevice', () => {
  const device = { id: 'd1', tenantId: 't1', shopId: 's1' };

  beforeEach(() => {
    jest.clearAllMocks();
    authenticateDeviceKey.mockResolvedValue(device);
    Tenant.findByPk.mockResolvedValue({ id: 't1', status: 'active' });
    getTenantFeatures.mockResolvedValue(['watch']);
  });

  it('scopes the request to the device\'s workspace and shop', async () => {
    const req = { headers: { authorization: 'Bearer d1.secret' } };
    const next = jest.fn();
    await requireWatchDevice(req, makeRes(), next);

    expect(authenticateDeviceKey).toHaveBeenCalledWith('d1.secret');
    expect(next).toHaveBeenCalledWith();
    expect(req).toMatchObject({ watchDevice: device, tenantId: 't1', shopId: 's1' });
  });

  it('rejects requests without a valid device key', async () => {
    authenticateDeviceKey.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();
    await requireWatchDevice({ headers: { authorization: 'Bearer nope' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    const res2 = makeRes();
    await requireWatchDevice({ headers: {} }, res2, next);
    expect(res2.status).toHaveBeenCalledWith(401);
  });

  it('rejects suspended workspaces and workspaces without Watch', async () => {
    Tenant.findByPk.mockResolvedValue({ id: 't1', status: 'suspended' });
    const res = makeRes();
    await requireWatchDevice({ headers: { authorization: 'Bearer d1.secret' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);

    Tenant.findByPk.mockResolvedValue({ id: 't1', status: 'active' });
    getTenantFeatures.mockResolvedValue(['pos']);
    const res2 = makeRes();
    await requireWatchDevice({ headers: { authorization: 'Bearer d1.secret' } }, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(403);
  });
});
