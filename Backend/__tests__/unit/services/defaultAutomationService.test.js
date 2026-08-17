const mockTenantFindByPk = jest.fn();
const mockRuleFindAll = jest.fn();
const mockRuleCreate = jest.fn();

jest.mock('../../../models', () => ({
  Tenant: {
    findByPk: (...args) => mockTenantFindByPk(...args),
  },
  AutomationRule: {
    findAll: (...args) => mockRuleFindAll(...args),
    create: (...args) => mockRuleCreate(...args),
  },
}));

jest.mock('../../../services/whatsappService', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../../services/smsService', () => ({
  getResolvedConfig: jest.fn(),
}));

const whatsappService = require('../../../services/whatsappService');
const smsService = require('../../../services/smsService');
const { getDefaultTemplates, filterTemplatesForTenant } = require('../../../services/automationEngineService');
const {
  adaptActionsForChannels,
  ensureDefaultAutomations,
  mergeMissingChannelActions,
  markSystemDefaultUserModified,
} = require('../../../services/defaultAutomationService');

function makeTenant(overrides = {}) {
  return {
    id: 'tenant-1',
    name: 'Test Biz',
    businessType: 'shop',
    metadata: { shopType: 'supermarket' },
    changed: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRule(overrides = {}) {
  return {
    id: 'rule-1',
    name: 'Existing',
    enabled: true,
    triggerType: 'invoice_overdue',
    triggerConfig: {},
    conditionConfig: {},
    actionConfig: { actions: [{ type: 'send_email_platform', subject: 'x', body: 'y' }] },
    scheduleConfig: {},
    metadata: { templateKey: 'overdue_invoice_reminder', systemDefault: true, userModified: false },
    shopId: null,
    studioLocationId: null,
    changed: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('defaultAutomationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    whatsappService.getConfig.mockResolvedValue(null);
    smsService.getResolvedConfig.mockResolvedValue(null);
    mockRuleFindAll.mockResolvedValue([]);
    mockRuleCreate.mockImplementation(async (payload) => ({
      id: `created-${payload.name}`,
      ...payload,
    }));
  });

  it('marks only operational templates as business defaults', () => {
    const keys = getDefaultTemplates().map((template) => template.key);
    expect(keys).toEqual(expect.arrayContaining([
      'invoice_sent_notification',
      'invoice_due_reminder',
      'overdue_invoice_reminder',
      'payment_received_thank_you',
      'new_lead_staff',
      'birthday_greeting',
      'win_back_campaign',
      'customer_created_welcome',
    ]));
    expect(keys).not.toContain('review_request');
    expect(keys).not.toContain('high_value_invoice_alert');
  });

  it('filters default templates by business type', () => {
    const shopKeys = filterTemplatesForTenant(getDefaultTemplates(), {
      businessType: 'shop',
      metadata: { shopType: 'supermarket' },
    }).map((t) => t.key);
    expect(shopKeys).toContain('sale_completed_receipt');
    expect(shopKeys).toContain('low_stock_on_change');
    expect(shopKeys).toContain('daily_sales_summary');
    expect(shopKeys).toContain('birthday_greeting');
    expect(shopKeys).toContain('win_back_campaign');
    expect(shopKeys).toContain('customer_created_welcome');
    expect(shopKeys).not.toContain('job_completed_notification');
    expect(shopKeys).not.toContain('prescription_refill_reminder');
    expect(shopKeys).not.toContain('order_created_notification');

    const studioKeys = filterTemplatesForTenant(getDefaultTemplates(), {
      businessType: 'studio',
      metadata: {},
    }).map((t) => t.key);
    expect(studioKeys).toContain('job_completed_notification');
    expect(studioKeys).toContain('job_created_tracking_email');
    expect(studioKeys).toContain('job_due_reminder');
    expect(studioKeys).not.toContain('sale_completed_receipt');

    const pharmacyKeys = filterTemplatesForTenant(getDefaultTemplates(), {
      businessType: 'pharmacy',
      metadata: {},
    }).map((t) => t.key);
    expect(pharmacyKeys).toContain('prescription_refill_reminder');
    expect(pharmacyKeys).not.toContain('sale_completed_receipt');
    expect(pharmacyKeys).not.toContain('job_completed_notification');
  });

  it('strips WhatsApp and SMS actions when those channels are off', () => {
    const actions = [
      { type: 'create_task', title: 'Follow up' },
      { type: 'send_email_platform', subject: 'Hi', body: 'Hello' },
      { type: 'send_whatsapp', templateName: 'payment_reminder' },
      { type: 'send_sms', body: 'Pay now' },
    ];
    expect(adaptActionsForChannels(actions, { whatsapp: false, sms: false, email: true }).map((a) => a.type))
      .toEqual(['create_task', 'send_email_platform']);
    expect(adaptActionsForChannels(actions, { whatsapp: true, sms: true, email: true })).toHaveLength(4);
  });

  it('merges newly available channel actions without duplicating existing ones', () => {
    const merged = mergeMissingChannelActions(
      [{ type: 'send_email_platform', subject: 'Due' }],
      [
        { type: 'send_whatsapp', templateName: 'payment_reminder' },
        { type: 'send_email_platform', subject: 'Due' },
      ]
    );
    expect(merged.map((action) => action.type)).toEqual(['send_email_platform', 'send_whatsapp']);
  });

  it('creates enabled defaults and skips WhatsApp actions when WhatsApp is not configured', async () => {
    const tenant = makeTenant();
    mockTenantFindByPk.mockResolvedValue(tenant);

    const summary = await ensureDefaultAutomations('tenant-1', { tenant });

    expect(summary.created).toBeGreaterThan(0);
    expect(mockRuleCreate).toHaveBeenCalled();
    const createdPayloads = mockRuleCreate.mock.calls.map(([payload]) => payload);
    expect(createdPayloads.every((payload) => payload.enabled === true)).toBe(true);
    expect(createdPayloads.every((payload) => payload.metadata.systemDefault === true)).toBe(true);
    expect(createdPayloads.every((payload) => payload.metadata.templateKey)).toBe(true);
    expect(createdPayloads.some((payload) => payload.metadata.templateKey === 'sale_completed_receipt')).toBe(true);
    expect(createdPayloads.some((payload) => payload.metadata.templateKey === 'job_completed_notification')).toBe(false);

    const overdue = createdPayloads.find((payload) => payload.metadata.templateKey === 'overdue_invoice_reminder');
    expect(overdue.actionConfig.actions.map((action) => action.type)).toEqual(['send_sms', 'send_email_platform']);
    expect(createdPayloads.find((payload) => payload.metadata.templateKey === 'invoice_sent_notification')
      .actionConfig.actions.map((action) => action.type)).toEqual(['send_sms', 'send_email_platform']);
    expect(tenant.save).toHaveBeenCalled();
  });

  it('skips a templateKey that already exists', async () => {
    const tenant = makeTenant();
    mockRuleFindAll.mockResolvedValue([
      makeRule({ metadata: { templateKey: 'overdue_invoice_reminder', systemDefault: true, userModified: false } }),
    ]);

    const summary = await ensureDefaultAutomations('tenant-1', { tenant });
    const createdKeys = mockRuleCreate.mock.calls.map(([payload]) => payload.metadata.templateKey);
    expect(createdKeys).not.toContain('overdue_invoice_reminder');
    expect(summary.created).toBeGreaterThan(0);
  });

  it('does not recreate a deleted default recorded in skippedTemplateKeys', async () => {
    const tenant = makeTenant({
      metadata: {
        shopType: 'supermarket',
        automationDefaults: { skippedTemplateKeys: ['overdue_invoice_reminder'] },
      },
    });

    await ensureDefaultAutomations('tenant-1', { tenant });
    const createdKeys = mockRuleCreate.mock.calls.map(([payload]) => payload.metadata.templateKey);
    expect(createdKeys).not.toContain('overdue_invoice_reminder');
  });

  it('does not re-enable or rewrite a user-modified disabled default', async () => {
    const existing = makeRule({
      enabled: false,
      metadata: { templateKey: 'overdue_invoice_reminder', systemDefault: true, userModified: true },
    });
    const tenant = makeTenant();
    mockRuleFindAll.mockResolvedValue([existing]);

    await ensureDefaultAutomations('tenant-1', { tenant });
    expect(existing.save).not.toHaveBeenCalled();
    expect(existing.enabled).toBe(false);
  });

  it('adds a WhatsApp action to an unedited default after WhatsApp is connected', async () => {
    whatsappService.getConfig.mockResolvedValue({ enabled: true, phoneNumberId: '123' });
    const existing = makeRule({
      actionConfig: { actions: [{ type: 'send_sms', body: 'Pay' }, { type: 'send_email_platform', subject: 'Overdue' }] },
    });
    const tenant = makeTenant();
    mockRuleFindAll.mockResolvedValue([existing]);

    const summary = await ensureDefaultAutomations('tenant-1', { tenant });
    expect(summary.updated).toBeGreaterThan(0);
    expect(existing.actionConfig.actions.map((action) => action.type)).toEqual([
      'send_sms',
      'send_email_platform',
      'send_whatsapp',
    ]);
    expect(existing.save).toHaveBeenCalled();
    expect(existing.enabled).toBe(true);
  });

  it('does not add WhatsApp actions when the owner already edited the default', async () => {
    whatsappService.getConfig.mockResolvedValue({ enabled: true, phoneNumberId: '123' });
    const existing = makeRule({
      metadata: { templateKey: 'overdue_invoice_reminder', systemDefault: true, userModified: true },
      actionConfig: { actions: [{ type: 'send_email_platform', subject: 'Custom' }] },
    });
    const tenant = makeTenant();
    mockRuleFindAll.mockResolvedValue([existing]);

    await ensureDefaultAutomations('tenant-1', { tenant });
    expect(existing.save).not.toHaveBeenCalled();
    expect(existing.actionConfig.actions).toHaveLength(1);
  });

  it('marks system defaults as user-modified', () => {
    const rule = { metadata: { templateKey: 'invoice_sent_notification', systemDefault: true } };
    markSystemDefaultUserModified(rule);
    expect(rule.metadata.userModified).toBe(true);
    const custom = { metadata: { templateKey: 'custom' } };
    markSystemDefaultUserModified(custom);
    expect(custom.metadata.userModified).toBeUndefined();
  });
});
