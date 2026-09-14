jest.mock('../../../models', () => ({ Marketer: { findOne: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../../../config/database', () => ({ sequelize: { transaction: fn => fn({ LOCK: { UPDATE: 'UPDATE' } }) } }));
jest.mock('../../../services/emailService', () => ({ sendPlatformMessage: jest.fn().mockResolvedValue(undefined) }));
const crypto = require('crypto');
const { Marketer } = require('../../../models');
const email = require('../../../services/emailService');
const controller = require('../../../controllers/marketerAccountController');
const hash = code => crypto.createHash('sha256').update(code).digest('hex');
let marketer, res, next;
beforeEach(() => {
  jest.clearAllMocks();
  marketer = { id: 'marketer', email: 'marketer@example.test', metadata: { authVersion: 2 }, isActive: true, comparePassword: jest.fn().mockResolvedValue(true) };
  marketer.update = jest.fn(async values => Object.assign(marketer, values));
  Marketer.findOne.mockResolvedValue(marketer);
  Marketer.findByPk.mockResolvedValue(marketer);
  res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  next = jest.fn();
});
const request = body => ({ body, marketer: { id: 'marketer' } });
const reset = (overrides = {}) => { marketer.metadata.reset = { hash: hash('123456'), expires: Date.now() + 60000, attempts: 0, ...overrides }; };
test('recovery gives the same acknowledgement for known and unknown accounts', async () => {
  await controller.forgotPassword(request({ email: marketer.email }), res, next);
  const acknowledgement = res.json.mock.calls[0][0];
  expect(email.sendPlatformMessage).toHaveBeenCalledTimes(1);
  expect(marketer.metadata.reset.hash).toHaveLength(64);
  Marketer.findOne.mockResolvedValue(null);
  await controller.forgotPassword(request({ email: 'unknown@example.test' }), res, next);
  expect(res.json.mock.calls[1][0]).toEqual(acknowledgement);
  expect(email.sendPlatformMessage).toHaveBeenCalledTimes(1);
});
test('recovery throttles repeated email requests', async () => {
  reset({ sentAt: Date.now() });
  await controller.forgotPassword(request({ email: marketer.email }), res, next);
  expect(email.sendPlatformMessage).not.toHaveBeenCalled();
});
test('a wrong reset code increments attempts without changing the password', async () => {
  reset();
  await controller.resetPassword(request({ email: marketer.email, code: 'wrong', password: 'new-password' }), res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(marketer.metadata.reset.attempts).toBe(1);
  expect(marketer.password).toBeUndefined();
});
test.each([{ expires: Date.now() - 1000 }, { attempts: 5 }])('expired or exhausted reset cannot change a password: %j', async options => {
  reset(options);
  await controller.resetPassword(request({ email: marketer.email, code: '123456', password: 'new-password' }), res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(marketer.update).not.toHaveBeenCalled();
});
test('reset consumes the code and revokes prior session versions', async () => {
  reset();
  const req = request({ email: marketer.email, code: '123456', password: 'new-password' });
  await controller.resetPassword(req, res, next);
  expect(marketer.password).toBe('new-password');
  expect(marketer.metadata.authVersion).toBe(3);
  expect(marketer.metadata.reset).toBeUndefined();
  await controller.resetPassword(req, res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(marketer.metadata.authVersion).toBe(3);
});
test('changing a password requires the current password', async () => {
  marketer.comparePassword.mockResolvedValue(false);
  await controller.changePassword(request({ currentPassword: 'wrong', password: 'new-password' }), res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(marketer.update).not.toHaveBeenCalled();
});
test('account closure revokes access and preserves the financial identity', async () => {
  await controller.closeAccount(request({ password: 'current-password' }), res, next);
  expect(marketer.id).toBe('marketer');
  expect(marketer.isActive).toBe(false);
  expect(marketer.metadata.authVersion).toBe(3);
  expect(marketer.metadata.reset).toBeNull();
  expect(marketer.metadata.pushTokens).toEqual([]);
  expect(next).not.toHaveBeenCalled();
});
