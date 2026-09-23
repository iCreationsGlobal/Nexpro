jest.mock('../../../config/database', () => ({
  sequelize: {
    literal: jest.fn((sql) => ({ literal: sql })),
    escape: jest.fn((value) => `'${value}'`),
  },
}));

jest.mock('../../../models', () => ({
  Customer: { count: jest.fn(), findAll: jest.fn() },
  Lead: { count: jest.fn(), findAll: jest.fn() },
  Setting: { findOne: jest.fn() },
}));

jest.mock('../../../services/emailService', () => ({ getConfig: jest.fn() }));
jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn(),
  validatePhoneNumber: jest.fn((phone) => (phone ? `+233${String(phone).replace(/^0/, '')}` : null)),
}));
jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn(),
  validatePhoneNumber: jest.fn((phone) => (phone ? `233${String(phone).replace(/^0/, '')}` : null)),
}));

const { Op } = require('sequelize');
const { Customer, Lead } = require('../../../models');
const audience = require('../../../services/marketingAudienceService');

const customer = (overrides = {}) => ({
  id: 'c1',
  name: 'Ama',
  email: 'ama@example.com',
  phone: '0241234567',
  marketingConsent: true,
  smsConsent: true,
  whatsappConsent: true,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('planCampaignRecipients', () => {
  it('queues consenting contacts, skips the rest, and never queues an address twice', async () => {
    const rows = [
      customer({ id: 'c1' }),
      customer({ id: 'c2', name: 'Ama again', email: 'AMA@example.com', phone: '0241234567' }),
      customer({ id: 'c3', name: 'No consent', email: 'kofi@example.com', phone: '0201111111', marketingConsent: false }),
      customer({ id: 'c4', name: 'SMS opted out', email: 'esi@example.com', phone: '0202222222', smsConsent: false }),
      customer({ id: 'c5', name: 'No phone', email: 'yaw@example.com', phone: null }),
    ];
    Customer.count.mockResolvedValue(rows.length);
    Customer.findAll.mockResolvedValueOnce(rows);

    const plan = await audience.planCampaignRecipients(
      'tenant-1',
      'customer',
      audience.normalizeAudienceFilter({}),
      ['email', 'sms']
    );

    const byChannel = (channel) => plan.recipients.filter((r) => r.channel === channel).map((r) => r.recipientId);
    expect(byChannel('email')).toEqual(['c1', 'c4', 'c5']);
    expect(byChannel('sms')).toEqual(['c1']);
    expect(plan.skipped).toEqual({ email: 2, sms: 4, whatsapp: 0 });
    expect(plan).toMatchObject({ total: 5, truncated: false });
  });

  it('messages leads unless they are marked do-not-contact', async () => {
    Lead.count.mockResolvedValue(2);
    Lead.findAll.mockResolvedValueOnce([
      { id: 'l1', name: 'Lead A', phone: '0241111111', doNotContact: false },
      { id: 'l2', name: 'Lead B', phone: '0242222222', doNotContact: true },
    ]);

    const plan = await audience.planCampaignRecipients(
      'tenant-1',
      'lead',
      audience.normalizeLeadAudienceFilter({}),
      ['sms']
    );

    expect(plan.recipients.map((r) => r.recipientId)).toEqual(['l1']);
    expect(plan.skipped.sms).toBe(1);
  });

  it('flags audiences above the campaign limit as truncated', async () => {
    Customer.count.mockResolvedValue(audience.MAX_AUDIENCE_SIZE + 1);
    Customer.findAll.mockResolvedValue([]);

    const plan = await audience.planCampaignRecipients('tenant-1', 'customer', audience.normalizeAudienceFilter({}), ['sms']);

    expect(plan.truncated).toBe(true);
  });

  it('loads the audience in batches rather than stopping at the first page', async () => {
    Customer.count.mockResolvedValue(1500);
    Customer.findAll
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, i) => customer({ id: `a${i}`, email: `a${i}@x.com`, phone: `020${String(i).padStart(7, '0')}` })))
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => customer({ id: `b${i}`, email: `b${i}@x.com`, phone: `024${String(i).padStart(7, '0')}` })));

    const plan = await audience.planCampaignRecipients('tenant-1', 'customer', audience.normalizeAudienceFilter({}), ['email']);

    expect(Customer.findAll).toHaveBeenCalledTimes(2);
    expect(Customer.findAll.mock.calls[1][0]).toMatchObject({ offset: 1000, limit: 500 });
    expect(plan.recipients).toHaveLength(1500);
  });

  it('applies purchase-date filters in SQL across the whole audience', async () => {
    Customer.count.mockResolvedValue(0);

    await audience.planCampaignRecipients(
      'tenant-1',
      'customer',
      audience.normalizeAudienceFilter({ lastPurchaseWindowDays: 30, inactiveDays: 90 }),
      ['sms']
    );

    const { where } = Customer.count.mock.calls[0][0];
    const clauses = where[Op.and];
    expect(clauses).toHaveLength(2);
    expect(clauses[0].id[Op.in].literal).toContain('FROM sales');
    expect(clauses[1].id[Op.notIn].literal).toContain('FROM sales');
  });

  it('treats an empty hand-picked selection as nobody, not everyone', async () => {
    Customer.count.mockResolvedValue(0);
    Lead.count.mockResolvedValue(0);

    await audience.planCampaignRecipients('tenant-1', 'customer', audience.normalizeAudienceFilter({ customerIds: [] }), ['sms']);
    await audience.planCampaignRecipients('tenant-1', 'lead', audience.normalizeLeadAudienceFilter({ leadIds: [] }), ['sms']);

    expect(Customer.count.mock.calls[0][0].where[Op.and][0].id[Op.in]).toEqual([]);
    expect(Lead.count.mock.calls[0][0].where.id[Op.in]).toEqual([]);
  });
});
