jest.mock('../../../config/database', () => ({
  sequelize: {
    col: jest.fn((name) => ({ col: name })),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    literal: jest.fn((value) => ({ literal: value })),
    where: jest.fn((left, right) => ({ where: [left, right] })),
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../../../models', () => ({
  Customer: { count: jest.fn(), findAll: jest.fn() },
  Invoice: { sum: jest.fn(), count: jest.fn(), findAll: jest.fn() },
  Expense: { sum: jest.fn() },
  Job: { count: jest.fn() },
  Sale: { sum: jest.fn(), findAll: jest.fn() },
  Tenant: { findByPk: jest.fn() },
  Setting: { findOne: jest.fn() },
  Product: { findAll: jest.fn() },
}));

jest.mock('../../../services/openaiService', () => ({
  chatWithContext: jest.fn(),
}));

jest.mock('../../../services/tenantAiSettingsService', () => ({
  getTenantAnthropicApiKey: jest.fn(),
}));

const openaiService = require('../../../services/openaiService');
const { getTenantAnthropicApiKey } = require('../../../services/tenantAiSettingsService');
const { Customer, Invoice, Expense, Job, Sale, Tenant, Setting, Product } = require('../../../models');
const { sequelize } = require('../../../config/database');
const { clearBillingCircuit } = require('../../../utils/aiProviderErrors');
const { chat, clearAssistantContextCache } = require('../../../controllers/assistantController');

const mockAssistantContextDependencies = () => {
  Customer.count.mockResolvedValue(0);
  Customer.findAll.mockResolvedValue([]);
  Invoice.sum.mockResolvedValue(0);
  Invoice.count.mockResolvedValue(0);
  Invoice.findAll.mockResolvedValue([]);
  Expense.sum.mockResolvedValue(0);
  Sale.sum.mockResolvedValue(0);
  Sale.findAll.mockResolvedValue([]);
  Product.findAll.mockResolvedValue([]);
  Job.count.mockResolvedValue(0);
  sequelize.query.mockResolvedValue([]);
};

const buildRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('assistantController.chat', () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAssistantContextCache();
    clearBillingCircuit('tenant-1');
    process.env.ANTHROPIC_API_KEY = 'system-key-123456789012345678901234567890';
    getTenantAnthropicApiKey.mockResolvedValue(null);
    mockAssistantContextDependencies();
    Tenant.findByPk.mockResolvedValue({
      businessType: 'shop',
      name: 'Test Shop',
      metadata: {},
    });
    Setting.findOne.mockResolvedValue({ value: {} });
  });

  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  it('returns 503 before context building when AI is not configured', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I add a customer?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      errorCode: 'OPENAI_NOT_CONFIGURED',
      code: 'OPENAI_NOT_CONFIGURED',
    });
    expect(openaiService.chatWithContext).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('answers small talk without Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'hi' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Ayebia/i);
    expect(res.body.meta).toMatchObject({
      source: 'small_talk',
      intent: 'small_talk_greeting',
    });
    expect(openaiService.chatWithContext).not.toHaveBeenCalled();
    expect(Customer.count).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('answers identity small talk without Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'who are you?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.meta.intent).toBe('small_talk_identity');
    expect(res.body.message).toMatch(/Ayebia/i);
    expect(openaiService.chatWithContext).not.toHaveBeenCalled();
  });

  it('returns 402 for provider billing errors instead of a generic 500', async () => {
    openaiService.chatWithContext.mockRejectedValue({
      status: 400,
      message: 'Your credit balance is too low to access the Anthropic API.',
      error: {
        type: 'invalid_request_error',
        message: 'Your credit balance is too low to access the Anthropic API.',
      },
    });

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I create an invoice?' }],
      },
      headers: {
        'x-client-submitted-at': String(Date.now() - 250),
      },
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      success: false,
      errorCode: 'AI_PROVIDER_BILLING_REQUIRED',
      code: 'AI_PROVIDER_BILLING_REQUIRED',
    });
    expect(res.body.error).toBe(
      'Platform AI credit is finished. Set up AI credit or add your AI API key in Settings → AI.'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 402 for Anthropic SDK body billing errors', async () => {
    openaiService.chatWithContext.mockRejectedValue({
      status: 400,
      message: '400 Bad Request',
      body: {
        error: {
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
      },
    });

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I record a payment on an invoice?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      success: false,
      errorCode: 'AI_PROVIDER_BILLING_REQUIRED',
    });
    expect(res.body.error).toBe(
      'Platform AI credit is finished. Set up AI credit or add your AI API key in Settings → AI.'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('short-circuits repeat billing failures via the circuit breaker', async () => {
    openaiService.chatWithContext.mockRejectedValue({
      status: 400,
      message: 'Your credit balance is too low to access the Anthropic API.',
    });

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I add an expense?' }],
      },
      headers: {},
    };
    const res1 = buildRes();
    const res2 = buildRes();
    const next = jest.fn();

    await chat(req, res1, next);
    await chat(req, res2, next);

    expect(res1.statusCode).toBe(402);
    expect(res2.statusCode).toBe(402);
    expect(openaiService.chatWithContext).toHaveBeenCalledTimes(1);
  });

  it('passes resolved API key and uses light context for support questions', async () => {
    openaiService.chatWithContext.mockResolvedValue('Open Settings → AI to add your API key.');
    getTenantAnthropicApiKey.mockResolvedValue('tenant-anthropic-key-1234567890');

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I add a customer?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(openaiService.chatWithContext).toHaveBeenCalledWith(
      req.body.messages,
      expect.objectContaining({
        businessType: 'shop',
        tenantName: 'Test Shop',
      }),
      expect.objectContaining({
        apiKey: 'tenant-anthropic-key-1234567890',
        contextTier: 'light',
        mode: 'support',
      })
    );
    expect(Customer.count).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('soft-blocks advisory questions when no tenant Anthropic key is configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'system-key-123456789012345678901234567890';
    getTenantAnthropicApiKey.mockResolvedValue(null);

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I get more customers?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta).toMatchObject({
      source: 'tenant_key_required',
      settingsPath: '/settings/ai',
    });
    expect(res.body.message).toMatch(/workspace Anthropic API key/i);
    expect(openaiService.chatWithContext).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('uses tenant-only Anthropic key for advisory questions', async () => {
    openaiService.chatWithContext.mockResolvedValue('Try WhatsApp promos and referral incentives.');
    getTenantAnthropicApiKey.mockResolvedValue('tenant-advisory-key-abcdef');

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I get more customers?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body.meta).toMatchObject({
      source: 'anthropic_advisory',
      keySource: 'tenant',
    });
    expect(openaiService.chatWithContext).toHaveBeenCalledWith(
      req.body.messages,
      expect.any(Object),
      expect.objectContaining({
        apiKey: 'tenant-advisory-key-abcdef',
        mode: 'advisory',
        contextTier: 'light',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('still allows support questions with system key when tenant has no key', async () => {
    openaiService.chatWithContext.mockResolvedValue('Go to Customers → Add customer.');
    getTenantAnthropicApiKey.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'system-key-123456789012345678901234567890';

    const req = {
      tenantId: 'tenant-1',
      tenant: { businessType: 'shop' },
      body: {
        messages: [{ role: 'user', content: 'How do I create an invoice?' }],
      },
      headers: {},
    };
    const res = buildRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(openaiService.chatWithContext).toHaveBeenCalledWith(
      req.body.messages,
      expect.any(Object),
      expect.objectContaining({
        apiKey: process.env.ANTHROPIC_API_KEY,
        mode: 'support',
        keySource: 'system',
      })
    );
    expect(res.body.meta.keySource).toBe('system');
  });
});
