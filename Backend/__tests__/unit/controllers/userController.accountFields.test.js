jest.mock('../../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    transaction: jest.fn(async (fn) => fn({})),
  },
}));

jest.mock('../../../models', () => ({
  User: { findByPk: jest.fn(), create: jest.fn() },
  UserTenant: { findOne: jest.fn(), count: jest.fn(), create: jest.fn() },
  UserShop: { destroy: jest.fn() },
  UserStudioLocation: { destroy: jest.fn() },
  InviteToken: { destroy: jest.fn() },
}));

jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateUserCache: jest.fn(),
  invalidateTenantMembershipCache: jest.fn(),
}));

jest.mock('../../../utils/seatLimitHelper', () => ({
  validateSeatLimit: jest.fn(),
}));

const { User, UserTenant } = require('../../../models');
const { validateSeatLimit } = require('../../../utils/seatLimitHelper');
const { createUser, updateUser, toggleUserStatus } = require('../../../controllers/userController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const tenantId = 'tenant-1';
const actorId = 'admin-1';
const targetId = 'staff-1';

const makeReq = (overrides = {}) => ({
  tenantId,
  params: { id: targetId },
  user: { id: actorId },
  headers: {},
  body: {},
  ...overrides,
});

describe('userController account-wide fields', () => {
  let membership;
  let target;

  beforeEach(() => {
    jest.clearAllMocks();
    membership = { role: 'staff', metadata: {}, update: jest.fn().mockResolvedValue(undefined) };
    target = {
      id: targetId,
      email: 'staff@example.com',
      isActive: true,
      isPlatformAdmin: false,
      update: jest.fn().mockResolvedValue(undefined),
    };
    UserTenant.findOne.mockResolvedValue(membership);
    UserTenant.count.mockResolvedValue(0);
    User.findByPk.mockResolvedValue(target);
  });

  describe('updateUser', () => {
    it('ignores the platform-admin flag and other account-wide fields', async () => {
      const res = makeRes();
      await updateUser(
        makeReq({
          body: {
            name: 'New Name',
            isPlatformAdmin: true,
            isActive: false,
            emailVerifiedAt: '2026-01-01',
            googleId: 'google-1',
            password: 'hunter2',
          },
        }),
        res,
        jest.fn()
      );

      expect(target.update).toHaveBeenCalledWith({ name: 'New Name' });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('lets the first-login flag be cleared but never set', async () => {
      await updateUser(makeReq({ body: { isFirstLogin: true } }), makeRes(), jest.fn());
      expect(target.update).toHaveBeenLastCalledWith({});

      await updateUser(makeReq({ body: { isFirstLogin: false } }), makeRes(), jest.fn());
      expect(target.update).toHaveBeenLastCalledWith({ isFirstLogin: false });
    });

    it('still applies role changes to the membership', async () => {
      await updateUser(makeReq({ body: { role: 'manager' } }), makeRes(), jest.fn());

      expect(membership.update).toHaveBeenCalledWith({ role: 'manager' });
      expect(target.update).toHaveBeenCalledWith({ role: 'manager' });
    });

    it('changes the email of an account that only belongs to this workspace', async () => {
      const res = makeRes();
      await updateUser(makeReq({ body: { email: 'new@example.com' } }), res, jest.fn());

      expect(UserTenant.count).toHaveBeenCalledWith({
        where: { userId: targetId, tenantId: expect.any(Object) },
      });
      expect(target.update).toHaveBeenCalledWith({ email: 'new@example.com' });
    });

    it('refuses to change the email of an account used in another workspace', async () => {
      UserTenant.count.mockResolvedValue(1);
      const res = makeRes();
      await updateUser(makeReq({ body: { email: 'attacker@example.com' } }), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(target.update).not.toHaveBeenCalled();
    });

    it('refuses to change the email of a platform admin', async () => {
      target.isPlatformAdmin = true;
      const res = makeRes();
      await updateUser(makeReq({ body: { email: 'attacker@example.com' } }), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(target.update).not.toHaveBeenCalled();
    });

    it('sends people changing their own email to profile settings', async () => {
      User.findByPk.mockResolvedValue({ ...target, id: actorId });
      const res = makeRes();
      await updateUser(
        makeReq({ params: { id: actorId }, body: { email: 'new@example.com' } }),
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('treats an unchanged email (any case) as no change', async () => {
      await updateUser(makeReq({ body: { email: ' STAFF@example.com ' } }), makeRes(), jest.fn());

      expect(UserTenant.count).not.toHaveBeenCalled();
      expect(target.update).toHaveBeenCalledWith({});
    });
  });

  describe('createUser', () => {
    it('never creates a platform admin or sets other account-wide fields', async () => {
      validateSeatLimit.mockResolvedValue(undefined);
      User.create.mockResolvedValue({ id: 'new-user' });
      UserTenant.create.mockResolvedValue({});

      const res = makeRes();
      await createUser(
        makeReq({
          body: {
            name: 'Ama',
            email: 'ama@example.com',
            password: 'secret123',
            role: 'staff',
            isPlatformAdmin: true,
            isActive: false,
            emailVerifiedAt: '2026-01-01',
          },
        }),
        res,
        jest.fn()
      );

      expect(User.create).toHaveBeenCalledWith({
        name: 'Ama',
        email: 'ama@example.com',
        role: 'staff',
        password: 'secret123',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('toggleUserStatus', () => {
    it('deactivates an account that only belongs to this workspace', async () => {
      const res = makeRes();
      await toggleUserStatus(makeReq(), res, jest.fn());

      expect(target.update).toHaveBeenCalledWith({ isActive: false });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('refuses to deactivate an account used in another workspace', async () => {
      UserTenant.count.mockResolvedValue(2);
      const res = makeRes();
      await toggleUserStatus(makeReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(target.update).not.toHaveBeenCalled();
    });

    it('refuses to deactivate a platform admin', async () => {
      target.isPlatformAdmin = true;
      const res = makeRes();
      await toggleUserStatus(makeReq(), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(target.update).not.toHaveBeenCalled();
    });

    it('refuses to deactivate your own account', async () => {
      User.findByPk.mockResolvedValue({ ...target, id: actorId });
      const res = makeRes();
      await toggleUserStatus(makeReq({ params: { id: actorId } }), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
