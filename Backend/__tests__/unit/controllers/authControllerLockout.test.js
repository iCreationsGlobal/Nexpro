/** ABS sign-in lockout, with the real User model. Only the database calls are replaced. */
jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  // Never connects: every query in this file is stubbed.
  return { sequelize: new Sequelize('postgres://none:none@127.0.0.1:1/none', { dialect: 'postgres', logging: false }) };
});
jest.mock('../../../config/config', () => ({ jwt: { secret: 'test-secret', expire: '1h' } }));
jest.mock('../../../models', () => ({
  User: jest.requireActual('../../../models/User'),
  UserTenant: { findAll: jest.fn() },
  Tenant: {},
  Setting: {},
  InviteToken: {},
  PlatformAdminRole: {},
  PlatformAdminUserRole: {},
  PasswordResetToken: { findOne: jest.fn(), destroy: jest.fn() },
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

const bcrypt = require('bcryptjs');
const { sequelize } = require('../../../config/database');
const { User, UserTenant, PasswordResetToken } = require('../../../models');
const authController = require('../../../controllers/authController');
const { findUserWithLockout } = require('../../../utils/userLockout');

const DEFAULT_SCOPE_HIDES = ['failedLoginAttempts', 'lockoutUntil'];
let row; // the stored users row
let sqlSeen;

/** Return only the columns the query really asked for, as Postgres would. */
const loadFor = (options = {}) => {
  const include = options.attributes?.include || [];
  const values = { ...row };
  DEFAULT_SCOPE_HIDES.filter((field) => !include.includes(field)).forEach((field) => delete values[field]);
  const user = User.build(values, { isNewRecord: false, raw: true });
  user.save = jest.fn(async function save() {
    this.changed() && this.changed().forEach((field) => { row[field] = this.get(field); });
    return this;
  });
  user.update = jest.fn(async function update(changes) {
    Object.assign(row, changes);
    Object.entries(changes).forEach(([field, value]) => this.setDataValue(field, value));
    return this;
  });
  return user;
};

const call = async (handler, body) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  await authController[handler]({ body }, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
};
const login = (password = 'wrong') => call('login', { email: ' AMA@example.com ', password });
const failTimes = async (count) => {
  const statuses = [];
  for (let i = 0; i < count; i += 1) statuses.push((await login()).status);
  return statuses;
};

beforeEach(async () => {
  row = {
    id: '7b0f6f0e-0000-4000-8000-000000000001', name: 'Ama', email: 'ama@example.com', role: 'admin', isActive: true,
    password: await bcrypt.hash('right-password', 4), failedLoginAttempts: 0, lockoutUntil: null, lastLogin: null,
  };
  sqlSeen = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(sequelize, 'query').mockImplementation(async (sql) => { sqlSeen.push(sql); return null; });
  jest.spyOn(User, 'findOne').mockImplementation(async (options) => (options.where.email === row.email ? loadFor(options) : null));
  jest.spyOn(User, 'findByPk').mockImplementation(async (id, options) => loadFor(options));
  jest.spyOn(User, 'unscoped').mockReturnValue({ findByPk: async () => loadFor() });
  UserTenant.findAll.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('ABS sign-in lockout', () => {
  it('asks the database for the lockout columns that the default scope hides', async () => {
    User.findOne.mockRestore();
    await findUserWithLockout({ email: 'ama@example.com' });
    expect(sqlSeen[0]).toContain('"failed_login_attempts"');
    expect(sqlSeen[0]).toContain('"lockout_until"');
    expect(sqlSeen[0]).toContain('"isPlatformAdmin"');
  });

  it('locks after 5 wrong passwords and refuses even the right one', async () => {
    expect(await failTimes(5)).toEqual([401, 401, 401, 401, 423]);
    expect(row.lockoutUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    const blocked = await login('right-password');
    expect(blocked.status).toBe(423);
    expect(blocked.body.message).toMatch(/try again in 15 minutes/);
    expect(blocked.body.data).toBeUndefined();
  });

  it('counts down the attempts left', async () => {
    expect((await login()).body.message).toMatch(/4 attempts remaining/);
    expect((await login()).body.message).toMatch(/3 attempts remaining/);
  });

  it('does not extend the lock when someone keeps trying', async () => {
    await failTimes(5);
    const until = row.lockoutUntil;
    expect(await failTimes(3)).toEqual([423, 423, 423]);
    expect(row.lockoutUntil).toBe(until);
  });

  it('starts counting again after a successful sign-in', async () => {
    await failTimes(4);
    const ok = await login('right-password');
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lastLogin).toBeInstanceOf(Date);
    expect(await failTimes(4)).toEqual([401, 401, 401, 401]);
  });

  it('lets them in once the lock runs out, and one typo does not lock them again', async () => {
    await failTimes(5);
    row.lockoutUntil = new Date(Date.now() - 1000);
    const typo = await login();
    expect(typo.status).toBe(401);
    expect(typo.body.message).toMatch(/4 attempts remaining/);
    expect(row.lockoutUntil).toBeNull();
    expect((await login('right-password')).status).toBe(200);
  });

  it('locks again after 5 more wrong passwords once a lock has run out', async () => {
    await failTimes(5);
    row.lockoutUntil = new Date(Date.now() - 1000);
    expect(await failTimes(5)).toEqual([401, 401, 401, 401, 423]);
  });

  it('never sends the lockout fields to the client', async () => {
    const { body } = await login('right-password');
    expect(body.data.user).not.toHaveProperty('failedLoginAttempts');
    expect(body.data.user).not.toHaveProperty('lockoutUntil');
    expect(body.data.user).not.toHaveProperty('password');
  });

  it('unlocks straight away when the password is reset by email', async () => {
    await failTimes(5);
    PasswordResetToken.findOne.mockResolvedValue({ userId: row.id, user: { id: row.id }, expiresAt: new Date(Date.now() + 60000) });
    expect((await call('resetPassword', { token: 'reset-token', newPassword: 'new-password' })).status).toBe(200);
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lockoutUntil).toBeNull();
    expect(row.lastLogin).toBeNull();
  });

  it('still signs in on databases without the lockout columns', async () => {
    const missing = Object.assign(new Error('column does not exist'), { original: { code: '42703' } });
    User.findOne.mockRejectedValueOnce(missing);
    expect((await login('right-password')).status).toBe(200);
  });
});
