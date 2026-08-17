jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    transaction: jest.fn(async (fn) => fn({})),
  },
}));

jest.mock('../../../models', () => ({
  User: { findByPk: jest.fn() },
  UserTenant: { findOne: jest.fn(), count: jest.fn() },
  UserShop: { destroy: jest.fn() },
  UserStudioLocation: { destroy: jest.fn() },
  InviteToken: { destroy: jest.fn() },
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateUserCache: jest.fn(),
}));

jest.mock('../../../utils/seatLimitHelper', () => ({
  validateSeatLimit: jest.fn(),
}));

const { sequelize } = require('../../../config/database');
const {
  User,
  UserTenant,
  UserShop,
  UserStudioLocation,
  InviteToken,
} = require('../../../models');
const { invalidateUserCache } = require('../../../middleware/cache');
const { deleteUser } = require('../../../controllers/userController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('deleteUser', () => {
  const tenantId = 'tenant-1';
  const actorId = 'admin-1';
  const targetId = 'staff-1';
  let membership;

  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (fn) => fn({}));
    membership = { role: 'staff', destroy: jest.fn().mockResolvedValue(undefined) };
    UserTenant.findOne.mockResolvedValue(membership);
    UserTenant.count.mockResolvedValue(1);
    User.findByPk.mockResolvedValue({ id: targetId, email: 'staff@example.com' });
    UserShop.destroy.mockResolvedValue(1);
    UserStudioLocation.destroy.mockResolvedValue(1);
    InviteToken.destroy.mockResolvedValue(0);
  });

  it('returns TENANT_REQUIRED when tenant context is missing', async () => {
    const res = makeRes();
    await deleteUser({ params: { id: targetId }, user: { id: actorId }, headers: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'TENANT_REQUIRED',
    }));
    expect(membership.destroy).not.toHaveBeenCalled();
  });

  it('blocks removing yourself', async () => {
    const res = makeRes();
    await deleteUser(
      { params: { id: actorId }, tenantId, user: { id: actorId }, headers: {} },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'CANNOT_DELETE_SELF',
    }));
    expect(UserTenant.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the user is not in this tenant', async () => {
    UserTenant.findOne.mockResolvedValue(null);
    const res = makeRes();
    await deleteUser(
      { params: { id: targetId }, tenantId, user: { id: actorId }, headers: {} },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'USER_NOT_IN_TENANT',
    }));
  });

  it('blocks removing the last remaining owner or admin', async () => {
    membership.role = 'owner';
    UserTenant.count.mockResolvedValue(0);
    const res = makeRes();
    await deleteUser(
      { params: { id: targetId }, tenantId, user: { id: actorId }, headers: {} },
      res,
      jest.fn()
    );

    expect(UserTenant.count).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'CANNOT_REMOVE_LAST_ADMIN',
    }));
    expect(membership.destroy).not.toHaveBeenCalled();
  });

  it('unlinks membership without deleting the User record', async () => {
    const res = makeRes();
    await deleteUser(
      { params: { id: targetId }, tenantId, user: { id: actorId }, headers: {} },
      res,
      jest.fn()
    );

    expect(UserShop.destroy).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: targetId, tenantId },
    }));
    expect(UserStudioLocation.destroy).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: targetId, tenantId },
    }));
    expect(InviteToken.destroy).toHaveBeenCalled();
    expect(membership.destroy).toHaveBeenCalled();
    expect(User.destroy).toBeUndefined();
    expect(invalidateUserCache).toHaveBeenCalledWith(targetId);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Team member removed from workspace successfully',
    }));
  });

  it('allows removing an admin when another owner or admin remains', async () => {
    membership.role = 'admin';
    UserTenant.count.mockResolvedValue(1);
    const res = makeRes();
    await deleteUser(
      { params: { id: targetId }, tenantId, user: { id: actorId }, headers: {} },
      res,
      jest.fn()
    );

    expect(membership.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
