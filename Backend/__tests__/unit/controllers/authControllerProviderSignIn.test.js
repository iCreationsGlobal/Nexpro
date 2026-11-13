jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn() },
}));

jest.mock('../../../config/config', () => ({
  jwt: { secret: 'test-secret', expire: '1h' },
}));

jest.mock('../../../models', () => ({
  User: { findOne: jest.fn(), create: jest.fn(), unscoped: jest.fn() },
  UserTenant: { create: jest.fn(), findAll: jest.fn() },
  Tenant: { create: jest.fn(), findOne: jest.fn() },
  Setting: { bulkCreate: jest.fn() },
  InviteToken: {},
  PlatformAdminRole: {},
  PlatformAdminUserRole: {},
  PasswordResetToken: {},
  EmailVerificationToken: {},
  Shop: {},
  StudioLocation: {},
  OnlineStoreSettings: {},
  SubscriptionPlan: {},
}));

jest.mock('../../../middleware/cache', () => ({
  getAuthBootstrapCacheKey: jest.fn(),
  getCacheValue: jest.fn(),
  invalidateUserCache: jest.fn(),
  setCacheValue: jest.fn(),
}));

jest.mock('../../../services/emailService', () => ({}));
jest.mock('../../../services/platformAdminNotificationService', () => ({
  notifyAccountCreated: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/categorySeeder', () => ({
  seedDefaultCategories: jest.fn().mockResolvedValue(undefined),
  seedDefaultEquipmentCategories: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../../utils/seedAccountingAccounts', () => ({
  seedDefaultChartOfAccounts: jest.fn().mockResolvedValue({ created: false }),
}));
jest.mock('../../../utils/signupPlanAssignment', () => ({
  isMobileSignupClient: jest.fn(() => true),
  resolveSignupPlanAssignment: jest.fn().mockResolvedValue({
    planId: 'trial',
    trialEndsAt: '2026-12-13T00:00:00.000Z',
    metadataExtras: {},
  }),
  buildSignupSubscriptionSettingValue: jest.fn(() => ({ plan: 'trial' })),
}));
jest.mock('../../../services/salesAgentService', () => ({
  normalizeAgentCode: jest.fn(() => null),
  validateAgentCode: jest.fn(),
  applyAgentCodeToTenant: jest.fn(),
  AGENT_FREE_MONTHS: 1,
}));
jest.mock('../../../utils/appleIdentityToken', () => {
  const actual = jest.requireActual('../../../utils/appleIdentityToken');
  return { ...actual, verifyAppleIdentityToken: jest.fn() };
});
jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();
  return { OAuth2Client: jest.fn(() => ({ verifyIdToken })), __verifyIdToken: verifyIdToken };
});

const { sequelize } = require('../../../config/database');
const { User, UserTenant, Tenant, Setting } = require('../../../models');
const { notifyAccountCreated } = require('../../../services/platformAdminNotificationService');
const { verifyAppleIdentityToken, AppleTokenError } = require('../../../utils/appleIdentityToken');
const { __verifyIdToken: googleVerifyIdToken } = require('google-auth-library');
const authController = require('../../../controllers/authController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeUser = (fields = {}) => {
  const user = { id: 'user-1', isActive: true, name: 'Ama', email: 'ama@example.com', ...fields };
  user.update = jest.fn(async (changes) => Object.assign(user, changes));
  user.toJSON = () => ({ ...user });
  return user;
};

const unscopedFindOne = jest.fn();
const unscopedFindByPk = jest.fn();

const appleBody = (overrides = {}) => ({
  identityToken: 'apple.identity.token',
  nonce: 'raw-nonce',
  fullName: { givenName: 'Ama', familyName: 'Mensah' },
  signUp: true,
  acceptedTerms: true,
  termsVersion: '2026-05',
  companyName: 'My Business',
  ...overrides,
});

const appleIdentity = (overrides = {}) => ({
  sub: 'apple-sub-1',
  email: 'ama@example.com',
  emailVerified: true,
  isPrivateEmail: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  User.unscoped.mockReturnValue({ findOne: unscopedFindOne, findByPk: unscopedFindByPk });
  unscopedFindOne.mockResolvedValue(null);
  User.findOne.mockResolvedValue(null);
  UserTenant.findAll.mockResolvedValue([]);
  Tenant.findOne.mockResolvedValue(null);
  Tenant.create.mockImplementation(async (values) => ({ id: 'tenant-1', ...values }));
  Setting.bulkCreate.mockResolvedValue([]);
  UserTenant.create.mockResolvedValue({});
  sequelize.transaction.mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() });
});

describe('POST /api/auth/apple', () => {
  it('creates the account and business the first time, with the name Apple shared', async () => {
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity());
    User.create.mockImplementation(async (values) => makeUser({ id: 'new-user', ...values }));
    unscopedFindByPk.mockImplementation(async () => makeUser({ id: 'new-user', appleId: 'apple-sub-1', name: 'Ama Mensah' }));

    const res = mockRes();
    const next = jest.fn();
    await authController.appleAuth({ body: appleBody(), headers: {}, ip: '127.0.0.1' }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(verifyAppleIdentityToken).toHaveBeenCalledWith('apple.identity.token', { rawNonce: 'raw-nonce' });
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ama Mensah', email: 'ama@example.com', appleId: 'apple-sub-1', role: 'admin' }),
      expect.anything()
    );
    expect(User.create.mock.calls[0][0]).not.toHaveProperty('googleId');
    expect(Tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ signupSource: 'apple_oauth' }) }),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toMatchObject({ isNewAccount: true, user: { authProvider: 'apple', paymentVerificationMethod: 'otp' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifyAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ source: 'apple_oauth_signup' }));
  });

  it('creates the account with a Hide My Email address', async () => {
    const relay = 'x7k2m9qz@privaterelay.appleid.com';
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity({ email: relay, isPrivateEmail: true }));
    User.create.mockImplementation(async (values) => makeUser({ id: 'new-user', ...values }));
    unscopedFindByPk.mockImplementation(async () => makeUser({ id: 'new-user', appleId: 'apple-sub-1', email: relay }));

    const res = mockRes();
    await authController.appleAuth({ body: appleBody({ fullName: null }), headers: {} }, res, jest.fn());

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: relay, name: 'ABS user', appleId: 'apple-sub-1' }),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('signs in an Apple ID that is already linked, without creating anything', async () => {
    const existing = makeUser({ appleId: 'apple-sub-1', emailVerifiedAt: new Date('2026-01-01') });
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity({ email: 'x@privaterelay.appleid.com' }));
    unscopedFindOne.mockImplementation(async ({ where }) => (where.appleId === 'apple-sub-1' ? existing : null));
    unscopedFindByPk.mockResolvedValue(existing);

    const res = mockRes();
    await authController.appleAuth({ body: appleBody({ fullName: null }), headers: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.isNewAccount).toBe(false);
    expect(existing.update).toHaveBeenCalledWith({ lastLogin: expect.any(Date) });
    expect(User.create).not.toHaveBeenCalled();
    expect(Tenant.create).not.toHaveBeenCalled();
  });

  it('links Apple to an existing ABS account with the same verified email', async () => {
    const existing = makeUser({ email: 'ama@example.com', emailVerifiedAt: new Date('2026-01-01') });
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity());
    unscopedFindOne.mockImplementation(async ({ where }) => (where.email === 'ama@example.com' ? existing : null));
    unscopedFindByPk.mockResolvedValue(existing);

    const res = mockRes();
    await authController.appleAuth({ body: appleBody(), headers: {} }, res, jest.fn());

    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ appleId: 'apple-sub-1' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('does not link by email when Apple has not verified it', async () => {
    const existing = makeUser({ email: 'ama@example.com' });
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity({ emailVerified: false }));
    unscopedFindOne.mockImplementation(async ({ where }) => (where.email ? existing : null));
    User.findOne.mockResolvedValue(existing);

    const res = mockRes();
    await authController.appleAuth({ body: appleBody(), headers: {} }, res, jest.fn());

    expect(existing.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/already exists/);
  });

  it('needs the terms accepted before creating an account', async () => {
    verifyAppleIdentityToken.mockResolvedValue(appleIdentity());
    const res = mockRes();
    await authController.appleAuth({ body: appleBody({ acceptedTerms: false }), headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('turns away a bad Apple token', async () => {
    verifyAppleIdentityToken.mockRejectedValue(new AppleTokenError('Invalid or expired Apple token'));
    const res = mockRes();
    await authController.appleAuth({ body: appleBody(), headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(unscopedFindOne).not.toHaveBeenCalled();
  });

  it('says Apple is unavailable when Apple’s keys cannot be fetched', async () => {
    verifyAppleIdentityToken.mockRejectedValue(new Error('timeout of 10000ms exceeded'));
    const res = mockRes();
    await authController.appleAuth({ body: appleBody(), headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('needs the identity token', async () => {
    const res = mockRes();
    await authController.appleAuth({ body: appleBody({ identityToken: undefined }), headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(verifyAppleIdentityToken).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/google still works the same', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'web-client';
    googleVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-1', email: 'Kofi@Example.com', name: 'Kofi', picture: 'https://pic' }),
    });
  });

  it('returns GOOGLE_USER_NOT_FOUND on sign-in with no account', async () => {
    const res = mockRes();
    await authController.googleAuth({ body: { idToken: 'g', signUp: false }, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: 'GOOGLE_USER_NOT_FOUND',
      message: 'No account found with this Google account. Sign up to create one.',
    });
  });

  it('links Google to the account with the same email and keeps its own photo', async () => {
    const existing = makeUser({ email: 'kofi@example.com', profilePicture: 'mine.jpg', emailVerifiedAt: new Date() });
    unscopedFindOne.mockImplementation(async ({ where }) => (where.email === 'kofi@example.com' ? existing : null));
    unscopedFindByPk.mockResolvedValue(existing);

    const res = mockRes();
    await authController.googleAuth({ body: { idToken: 'g' }, headers: {} }, res, jest.fn());

    expect(existing.update).toHaveBeenCalledWith({ lastLogin: expect.any(Date), googleId: 'google-sub-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user).toMatchObject({ authProvider: 'google', paymentVerificationMethod: 'otp' });
  });

  it('creates the account on sign-up', async () => {
    User.create.mockImplementation(async (values) => makeUser({ id: 'new-user', ...values }));
    unscopedFindByPk.mockImplementation(async () => makeUser({ id: 'new-user', googleId: 'google-sub-1' }));

    const res = mockRes();
    await authController.googleAuth(
      { body: { idToken: 'g', signUp: true, acceptedTerms: true, companyName: 'My Business' }, headers: {} },
      res,
      jest.fn()
    );

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'kofi@example.com', googleId: 'google-sub-1', profilePicture: 'https://pic' }),
      expect.anything()
    );
    expect(Tenant.create.mock.calls[0][0].metadata.signupSource).toBe('google_oauth');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
