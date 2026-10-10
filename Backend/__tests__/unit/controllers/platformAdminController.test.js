jest.mock('../../../models', () => ({
  User: { findOne: jest.fn(), create: jest.fn() },
  InviteToken: { findOne: jest.fn(), create: jest.fn() },
}));

jest.mock('../../../utils/frontendUrl', () => ({
  getFrontendBaseUrl: jest.fn(() => 'https://app.example.com'),
}));

const { User, InviteToken } = require('../../../models');
const {
  createPlatformAdmin,
  updatePlatformAdmin,
  generatePlatformAdminInvite,
} = require('../../../controllers/platformAdminController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const superAdmin = { id: 'super-1', email: 'info@absghana.com', isPlatformAdmin: true };
const staffAdmin = { id: 'staff-1', email: 'ops@absghana.com', isPlatformAdmin: true };

describe('platformAdminController super-admin protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updatePlatformAdmin', () => {
    const makeTarget = (email) => ({
      id: 'target-1',
      email,
      isPlatformAdmin: true,
      save: jest.fn().mockResolvedValue(undefined),
    });

    it("blocks a regular platform admin from resetting a super admin's password", async () => {
      const target = makeTarget('info@absghana.com');
      User.findOne.mockResolvedValue(target);
      const res = makeRes();

      await updatePlatformAdmin(
        { params: { id: target.id }, body: { password: 'new-password' }, user: staffAdmin },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(target.save).not.toHaveBeenCalled();
    });

    it("lets a super admin update a super admin's account", async () => {
      const target = makeTarget('superadmin@nexpro.com');
      User.findOne.mockResolvedValue(target);
      const res = makeRes();

      await updatePlatformAdmin(
        { params: { id: target.id }, body: { name: 'Owner' }, user: superAdmin },
        res,
        jest.fn()
      );

      expect(target.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('lets a platform admin update a regular platform admin', async () => {
      const target = makeTarget('media@absghana.com');
      User.findOne.mockResolvedValue(target);
      const res = makeRes();

      await updatePlatformAdmin(
        { params: { id: target.id }, body: { isActive: false }, user: staffAdmin },
        res,
        jest.fn()
      );

      expect(target.isActive).toBe(false);
      expect(target.save).toHaveBeenCalled();
    });
  });

  describe('reserved super-admin addresses', () => {
    it('stops a regular platform admin creating an account on a super-admin address', async () => {
      const res = makeRes();
      await createPlatformAdmin(
        {
          body: { name: 'Fake', email: ' SuperAdmin@nexpro.com ', password: 'secret123' },
          user: staffAdmin,
        },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(User.create).not.toHaveBeenCalled();
    });

    it('stops a regular platform admin inviting a super-admin address', async () => {
      const res = makeRes();
      await generatePlatformAdminInvite(
        { body: { email: 'superadmin@nexpro.com', role: 'Operations' }, user: staffAdmin, headers: {} },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(InviteToken.create).not.toHaveBeenCalled();
    });

    it('still creates regular platform admins', async () => {
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 'new-admin' });
      const res = makeRes();

      await createPlatformAdmin(
        { body: { name: 'Ops', email: 'ops2@absghana.com', password: 'secret123' }, user: staffAdmin },
        res,
        jest.fn()
      );

      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'ops2@absghana.com' }));
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
