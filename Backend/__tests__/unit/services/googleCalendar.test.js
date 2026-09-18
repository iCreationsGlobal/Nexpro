const mockRequest = jest.fn();
const mockGetToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({
  setCredentials: jest.fn(), request: mockRequest, getToken: mockGetToken,
  generateAuthUrl: jest.fn(args => JSON.stringify(args)),
})) }));
jest.mock('../../../config/database', () => ({ sequelize: {
  transaction: jest.fn(fn => fn({})), query: jest.fn(async () => [[{ locked: true }]]),
} }));
jest.mock('../../../models/CalendarConnection', () => ({ findByPk: jest.fn(), findOne: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn() }));
jest.mock('../../../models/CalendarTaskLink', () => ({ findAll: jest.fn(), findOrCreate: jest.fn(), destroy: jest.fn() }));
jest.mock('../../../models', () => ({ UserTask: { findAll: jest.fn(), findByPk: jest.fn() }, UserTenant: { findOne: jest.fn() } }));
const Connection = require('../../../models/CalendarConnection');
const Link = require('../../../models/CalendarTaskLink');
const { UserTask, UserTenant } = require('../../../models');
const { encryptSecret } = require('../../../utils/secretCrypto');
const { normalizeCalendar, eventForTask, eventId } = require('../../../utils/calendarTask');
const service = require('../../../services/googleCalendarService');
let connection, task, link;
beforeEach(() => {
  jest.resetAllMocks();
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test'; process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test';
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://example.com/callback';
  process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY = 'ab'.repeat(32);
  // Restore constructor after resetting mocks.
  require('google-auth-library').OAuth2Client.mockImplementation(() => ({ setCredentials: jest.fn(), request: mockRequest, getToken: mockGetToken, generateAuthUrl: args => JSON.stringify(args) }));
  const { sequelize } = require('../../../config/database');
  sequelize.transaction.mockImplementation(fn => fn({})); sequelize.query.mockResolvedValue([[{ locked: true }]]);
  connection = { id: 'connection', tenantId: 'tenant', userId: 'person', enabled: true, calendarId: 'primary', tokens: encryptSecret(JSON.stringify({ access_token: 'secret', refresh_token: 'refresh', expiry_date: Date.now() + 3600000 }), 'GOOGLE_CALENDAR_ENCRYPTION_KEY'), update: jest.fn(async function(values) { Object.assign(this, values); }) };
  task = { id: 'task', tenantId: 'tenant', userId: 'creator', assigneeId: 'person', title: 'Call customer', metadata: { calendar: { enabled: true, startAt: '2026-09-20T14:30:00Z', reminderMinutes: 10 } } };
  link = { taskId: 'task', eventId: eventId('connection', 'task'), update: jest.fn(async function(values) { Object.assign(this, values); }), destroy: jest.fn() };
  Connection.findByPk.mockResolvedValue(connection); Connection.findOrCreate.mockResolvedValue([connection]);
  UserTenant.findOne.mockResolvedValue({}); Link.findAll.mockResolvedValue([]); Link.findOrCreate.mockResolvedValue([link]);
  UserTask.findAll.mockResolvedValueOnce([task]).mockResolvedValue([]);
  mockRequest.mockResolvedValue({ data: {} });
});
it('rejects invalid reminder times and preserves explicit timezone offsets', () => {
  expect(() => normalizeCalendar({ enabled: true, startAt: 'not a date', reminderMinutes: 10 })).toThrow();
  expect(() => normalizeCalendar({ enabled: true, startAt: '2026-09-20T12:00:00Z', reminderMinutes: -1 })).toThrow();
  expect(normalizeCalendar({ enabled: true, startAt: '2026-09-20T12:00:00+02:00', reminderMinutes: 10 }).startAt).toBe('2026-09-20T10:00:00.000Z');
});
it('removes reminders from completed tasks', () => {
  expect(eventForTask({ ...task, status: 'completed' }).reminders).toEqual({ useDefault: false, overrides: [] });
});
it('creates one deterministic event after lookup misses, then handles ambiguous conflict', async () => {
  mockRequest.mockRejectedValueOnce({ response: { status: 404 } }).mockRejectedValueOnce({ response: { status: 409 } }).mockResolvedValue({ data: {} });
  await service.sync(connection.id);
  expect(mockRequest.mock.calls.map(([args]) => args.method)).toEqual(['PUT', 'POST', 'PUT']);
  expect(mockRequest.mock.calls[1][0].data.id).toBe(link.eventId);
  expect(link.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'synced' }), expect.anything());
});
it('retains deletion work after a network failure for a later retry', async () => {
  Link.findAll.mockResolvedValue([link]); UserTask.findByPk.mockResolvedValue(null); UserTask.findAll.mockReset().mockResolvedValue([]);
  mockRequest.mockRejectedValue(new Error('network'));
  await service.sync(connection.id);
  expect(link.destroy).not.toHaveBeenCalled();
  expect(link.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }), expect.anything());
});
it('removes events for reassigned tasks and never uploads another assignee task', async () => {
  task.assigneeId = 'other'; Link.findAll.mockResolvedValue([link]); UserTask.findByPk.mockResolvedValue(task);
  await service.sync(connection.id);
  expect(mockRequest).toHaveBeenCalledTimes(1); expect(mockRequest.mock.calls[0][0].method).toBe('DELETE');
  expect(Link.findOrCreate).not.toHaveBeenCalled();
});
it('stops sync when workspace membership has ended', async () => {
  UserTenant.findOne.mockResolvedValue(null);
  await service.sync(connection.id);
  expect(mockRequest).not.toHaveBeenCalled(); expect(connection.tokens).toBeNull(); expect(connection.enabled).toBe(false);
});
it('stores only a hashed OAuth state and encrypted PKCE verifier', async () => {
  const url = JSON.parse(await service.authorize('tenant', 'person'));
  expect(url.state).toHaveLength(64); expect(connection.stateHash).not.toBe(url.state);
  expect(connection.verifier).toMatch(/^enc:v1:/); expect(url.code_challenge_method).toBe('S256');
});
it('rejects expired or unknown callbacks without exchanging the code', async () => {
  Connection.findOne.mockResolvedValue(null);
  await expect(service.callback('code', 'ab'.repeat(32))).rejects.toThrow('expired');
  expect(mockGetToken).not.toHaveBeenCalled();
});
it('does not expose credentials in status responses', () => {
  const status = service.publicStatus(connection);
  expect(status.tokens).toBeUndefined(); expect(status.verifier).toBeUndefined();
});
it('refuses to start OAuth without a valid encryption key', async () => {
  process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY = 'invalid';
  await expect(service.authorize('tenant', 'person')).rejects.toThrow('not configured');
});

it('uses a new deterministic event ID when a removed reminder is enabled again', async () => {
  link.status = 'removed';
  const oldId = link.eventId;
  await service.sync(connection.id);
  expect(link.eventId).not.toBe(oldId);
  expect(link.eventId).toBe(eventId(oldId, task.id));
  expect(link.status).toBe('synced');
});
