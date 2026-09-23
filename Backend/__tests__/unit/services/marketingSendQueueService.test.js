jest.mock('node-cron', () => ({ schedule: jest.fn() }));

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    fn: jest.fn((name, value) => ({ fn: name, value })),
    col: jest.fn((name) => ({ col: name })),
  },
}));

jest.mock('../../../models', () => ({
  MarketingCampaign: {
    update: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
  MarketingCampaignRecipient: {
    bulkCreate: jest.fn(),
    count: jest.fn(),
    destroy: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
  },
  Tenant: { findByPk: jest.fn() },
}));

jest.mock('../../../services/emailService', () => ({ sendBulkTenantEmails: jest.fn() }));
jest.mock('../../../services/emailTemplates', () => ({ marketingPlainMessageEmail: jest.fn((body) => `<p>${body}</p>`) }));
jest.mock('../../../services/smsService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/whatsappService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../utils/tenantLogo', () => ({ getTenantLogoUrl: jest.fn(() => null) }));
jest.mock('../../../services/marketingChannelVerification', () => ({
  applyVerificationAfterBroadcast: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/marketingAudienceService', () => ({
  CHANNELS: ['email', 'sms', 'whatsapp'],
  MAX_AUDIENCE_SIZE: 20000,
  normalizeAudienceType: (value) => (value === 'lead' ? 'lead' : 'customer'),
  normalizeChannels: (channels) => channels || [],
  normalizeFilterForAudience: (type, filter) => filter,
  planCampaignRecipients: jest.fn(),
  resolveCapabilities: jest.fn(),
}));

const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const { MarketingCampaign, MarketingCampaignRecipient, Tenant } = require('../../../models');
const smsService = require('../../../services/smsService');
const { planCampaignRecipients, resolveCapabilities } = require('../../../services/marketingAudienceService');
const queue = require('../../../services/marketingSendQueueService');

const smsCampaign = (overrides = {}) => ({
  id: 'campaign-1',
  tenantId: 'tenant-1',
  status: 'draft',
  audienceType: 'customer',
  channels: ['sms'],
  audienceFilter: {},
  messageContent: { smsBody: 'Hi {{name}} from {{businessName}}' },
  metadata: {},
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  resolveCapabilities.mockResolvedValue({
    email: { available: true },
    sms: { available: true },
    whatsapp: { available: true },
  });
  MarketingCampaign.update.mockResolvedValue([1]);
  MarketingCampaign.findByPk.mockResolvedValue({ id: 'campaign-1', stats: {} });
  MarketingCampaignRecipient.findAll.mockResolvedValue([]);
  MarketingCampaignRecipient.update.mockResolvedValue([0]);
  Tenant.findByPk.mockResolvedValue({ id: 'tenant-1', name: 'ShopCyndy', metadata: {} });
});

describe('startCampaignSend', () => {
  it('refuses to start when another request already claimed the campaign', async () => {
    MarketingCampaign.update.mockResolvedValueOnce([0]);

    await expect(queue.startCampaignSend({ tenantId: 'tenant-1' }, smsCampaign()))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(planCampaignRecipients).not.toHaveBeenCalled();
    expect(MarketingCampaignRecipient.bulkCreate).not.toHaveBeenCalled();
  });

  it('claims only from startable statuses', async () => {
    planCampaignRecipients.mockResolvedValue({
      recipients: [{ recipientType: 'customer', recipientId: 'c1', recipientName: 'Ama', channel: 'sms', address: '+233241234567' }],
      skipped: { email: 0, sms: 2, whatsapp: 0 },
      total: 3,
      truncated: false,
    });

    await queue.startCampaignSend({ tenantId: 'tenant-1', userId: 'user-1' }, smsCampaign());

    const [, claimOptions] = MarketingCampaign.update.mock.calls[0];
    expect(MarketingCampaign.update.mock.calls[0][0]).toMatchObject({ status: 'sending' });
    expect(claimOptions.where.status[Op.in]).toEqual(['draft', 'scheduled', 'failed']);
  });

  it('queues one row per message and returns without sending', async () => {
    planCampaignRecipients.mockResolvedValue({
      recipients: [
        { recipientType: 'customer', recipientId: 'c1', recipientName: 'Ama', channel: 'sms', address: '+233241234567' },
        { recipientType: 'customer', recipientId: 'c2', recipientName: 'Kofi', channel: 'sms', address: '+233201234567' },
      ],
      skipped: { email: 0, sms: 1, whatsapp: 0 },
      total: 3,
      truncated: false,
    });
    MarketingCampaignRecipient.findAll.mockResolvedValue([{ channel: 'sms', status: 'pending', count: '2' }]);

    const result = await queue.startCampaignSend({ tenantId: 'tenant-1' }, smsCampaign());

    expect(MarketingCampaignRecipient.bulkCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({ campaignId: 'campaign-1', tenantId: 'tenant-1', address: '+233241234567', status: 'pending' }),
        expect.objectContaining({ address: '+233201234567', status: 'pending' }),
      ],
      { ignoreDuplicates: true }
    );
    expect(result).toMatchObject({ status: 'sending', queued: 2, skipped: { sms: 1 } });
    expect(smsService.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an audience nobody can receive and puts the draft back', async () => {
    planCampaignRecipients.mockResolvedValue({
      recipients: [],
      skipped: { email: 0, sms: 5, whatsapp: 0 },
      total: 5,
      truncated: false,
    });

    await expect(queue.startCampaignSend({ tenantId: 'tenant-1' }, smsCampaign()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(MarketingCampaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft' }),
      { where: { id: 'campaign-1' } }
    );
  });

  it('marks a scheduled campaign failed with the reason when it cannot start', async () => {
    planCampaignRecipients.mockResolvedValue({ recipients: [], skipped: {}, total: 0, truncated: false });

    await expect(queue.startCampaignSend({ tenantId: 'tenant-1' }, smsCampaign({ status: 'scheduled' })))
      .rejects.toThrow();
    expect(MarketingCampaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', metadata: expect.objectContaining({ lastError: expect.any(String) }) }),
      { where: { id: 'campaign-1' } }
    );
  });

  it('rejects channels that are not configured before claiming', async () => {
    resolveCapabilities.mockResolvedValue({ email: { available: false }, sms: { available: false }, whatsapp: { available: false } });

    await expect(queue.startCampaignSend({ tenantId: 'tenant-1' }, smsCampaign()))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(MarketingCampaign.update).not.toHaveBeenCalled();
  });
});

describe('worker', () => {
  const pendingSmsRow = (id, name, address) => ({
    id,
    campaignId: 'campaign-1',
    tenantId: 'tenant-1',
    recipientId: `${id}-customer`,
    recipientName: name,
    channel: 'sms',
    address,
  });

  it('sends claimed rows and records each outcome', async () => {
    const campaign = smsCampaign({ status: 'sending' });
    MarketingCampaign.findAll.mockResolvedValueOnce([campaign]).mockResolvedValue([]);
    sequelize.query
      .mockResolvedValueOnce([[pendingSmsRow('r1', 'Ama', '+233241234567'), pendingSmsRow('r2', 'Kofi', '+233201234567')]])
      .mockResolvedValue([[]]);
    smsService.sendMessage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Insufficient balance' });
    MarketingCampaignRecipient.count.mockResolvedValue(0);

    await queue.runWorker();

    expect(smsService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      '+233241234567',
      'Hi Ama from ShopCyndy',
      null,
      expect.objectContaining({ source: 'marketing_campaign' })
    );
    expect(MarketingCampaignRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' }),
      { where: { id: 'r1' } }
    );
    expect(MarketingCampaignRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'Insufficient balance' }),
      { where: { id: 'r2' } }
    );
  });

  it('fails interrupted rows instead of resending them', async () => {
    MarketingCampaign.findAll.mockResolvedValue([]);

    await queue.runWorker();

    expect(MarketingCampaignRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: queue.INTERRUPTED_ERROR }),
      expect.objectContaining({ where: expect.objectContaining({ status: 'processing' }) })
    );
  });

  it('marks a finished campaign failed when nothing was sent', async () => {
    const campaign = smsCampaign({ status: 'sending' });
    MarketingCampaign.findAll.mockResolvedValueOnce([campaign]).mockResolvedValue([]);
    sequelize.query.mockResolvedValue([[]]);
    MarketingCampaignRecipient.count.mockResolvedValue(0);
    MarketingCampaignRecipient.findAll.mockResolvedValue([{ channel: 'sms', status: 'failed', count: '3' }]);

    await queue.runWorker();

    expect(MarketingCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
      { where: { id: 'campaign-1', status: 'sending' } }
    );
  });

  it('marks a finished campaign sent when at least one message went out', async () => {
    const campaign = smsCampaign({ status: 'sending' });
    MarketingCampaign.findAll.mockResolvedValueOnce([campaign]).mockResolvedValue([]);
    sequelize.query.mockResolvedValue([[]]);
    MarketingCampaignRecipient.count.mockResolvedValue(0);
    MarketingCampaignRecipient.findAll.mockResolvedValue([
      { channel: 'sms', status: 'sent', count: '2' },
      { channel: 'sms', status: 'failed', count: '1' },
    ]);

    await queue.runWorker();

    expect(MarketingCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' }),
      { where: { id: 'campaign-1', status: 'sending' } }
    );
  });
});

describe('retryFailedRecipients', () => {
  it('requeues failed rows but never interrupted ones', async () => {
    MarketingCampaign.findOne.mockResolvedValue(smsCampaign({ status: 'sent' }));
    MarketingCampaignRecipient.update.mockResolvedValueOnce([4]);

    const result = await queue.retryFailedRecipients('tenant-1', 'campaign-1');

    const [changes, options] = MarketingCampaignRecipient.update.mock.calls[0];
    expect(changes).toMatchObject({ status: 'pending' });
    expect(options.where.status).toBe('failed');
    expect(options.where.error[Op.ne]).toBe(queue.INTERRUPTED_ERROR);
    expect(result).toEqual({ campaignId: 'campaign-1', requeued: 4 });
    expect(MarketingCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sending' }),
      { where: { id: 'campaign-1' } }
    );
  });

  it('refuses while the campaign is still sending', async () => {
    MarketingCampaign.findOne.mockResolvedValue(smsCampaign({ status: 'sending' }));

    await expect(queue.retryFailedRecipients('tenant-1', 'campaign-1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('computeCampaignStats', () => {
  it('totals per channel and progress from recipient rows', async () => {
    MarketingCampaignRecipient.findAll.mockResolvedValue([
      { channel: 'sms', status: 'sent', count: '6' },
      { channel: 'sms', status: 'failed', count: '2' },
      { channel: 'sms', status: 'pending', count: '2' },
    ]);

    const stats = await queue.computeCampaignStats('campaign-1', { email: 0, sms: 4, whatsapp: 0 });

    expect(stats.sms).toMatchObject({ queued: 10, sent: 6, failed: 2, pending: 2, skipped: 4 });
    expect(stats).toMatchObject({ totalQueued: 10, totalSent: 6, totalFailed: 2, totalSkipped: 4, progress: 80 });
  });
});
