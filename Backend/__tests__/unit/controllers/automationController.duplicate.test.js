jest.mock('../../../config/database', () => ({
  sequelize: {
    escape: (value) => `'${String(value).replace(/'/g, "''")}'`,
  },
}));

const mockFindAll = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../../models', () => ({
  AutomationRule: {
    findAll: (...args) => mockFindAll(...args),
    findOne: (...args) => mockFindOne(...args),
    create: (...args) => mockCreate(...args),
  },
  AutomationRun: {},
  Invoice: {},
  Product: {},
  WhatsAppMessageEvent: {},
}));

jest.mock('../../../services/automationEngineService', () => ({
  getTemplates: jest.fn(() => []),
  executeRule: jest.fn(),
  filterTemplatesForTenant: jest.fn((templates) => templates),
  isTriggerAllowedForTenant: jest.fn(() => true),
}));

jest.mock('../../../utils/resolveBusinessNameForContext', () => ({
  resolveBusinessNameForContext: jest.fn(),
}));

jest.mock('../../../utils/shopUtils', () => ({
  applyScopedReadFilters: jest.fn((_req, where) => where),
}));

jest.mock('../../../services/automationSchedulerService', () => ({}));
jest.mock('../../../services/openaiService', () => ({}));
jest.mock('../../../services/defaultAutomationService', () => ({
  ensureDefaultAutomationsSafe: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
  markSystemDefaultUserModified: jest.fn((rule) => rule),
  recordSkippedDefaultTemplate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/paginationUtils', () => ({
  getPagination: jest.fn(() => ({ page: 1, limit: 20, offset: 0 })),
}));

const automationController = require('../../../controllers/automationController');

describe('automationController duplicate messaging rules', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createRule rejects a second customer_birthday + send_sms rule', async () => {
    mockFindAll.mockResolvedValue([
      {
        id: 'existing-1',
        name: 'Birthday greeting',
        actionConfig: { actions: [{ type: 'send_sms', body: 'Happy birthday' }] },
      },
    ]);

    const req = {
      tenantId: 'tenant-1',
      user: { id: 'user-1' },
      tenant: { businessType: 'shop' },
      body: {
        name: 'Another birthday',
        triggerType: 'customer_birthday',
        actionConfig: { actions: [{ type: 'send_sms', body: 'Hi' }] },
        shopId: null,
        studioLocationId: null,
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await automationController.createRule(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorCode: 'DUPLICATE_AUTOMATION_RULE',
      })
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('updateRule allows saving the same rule (excludes current id)', async () => {
    const rule = {
      id: 'rule-1',
      name: 'Birthday greeting',
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_sms', body: 'Happy birthday' }] },
      shopId: null,
      studioLocationId: null,
      enabled: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindOne.mockResolvedValue(rule);
    mockFindAll.mockResolvedValue([]);

    const req = {
      tenantId: 'tenant-1',
      params: { id: 'rule-1' },
      user: { id: 'user-1' },
      tenant: { businessType: 'shop' },
      body: {
        name: 'Birthday greeting',
        triggerType: 'customer_birthday',
        actionConfig: { actions: [{ type: 'send_sms', body: 'Happy birthday to you' }] },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await automationController.updateRule(req, res, next);

    expect(mockFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          triggerType: 'customer_birthday',
          id: expect.anything(),
        }),
      })
    );
    const findAllWhere = mockFindAll.mock.calls[0][0].where;
    expect(findAllWhere.id).toBeDefined();
    const excludedId = findAllWhere.id[Object.getOwnPropertySymbols(findAllWhere.id)[0]]
      ?? Object.values(findAllWhere.id)[0];
    expect(excludedId).toBe('rule-1');
    expect(rule.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('updateRule still rejects a different existing duplicate', async () => {
    const rule = {
      id: 'rule-2',
      name: 'My birthday SMS',
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_sms', body: 'Hi' }] },
      shopId: null,
      studioLocationId: null,
      enabled: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindOne.mockResolvedValue(rule);
    mockFindAll.mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Birthday greeting',
        actionConfig: { actions: [{ type: 'send_sms', body: 'Happy birthday' }] },
      },
    ]);

    const req = {
      tenantId: 'tenant-1',
      params: { id: 'rule-2' },
      user: { id: 'user-1' },
      tenant: { businessType: 'shop' },
      body: {
        actionConfig: { actions: [{ type: 'send_sms', body: 'Updated' }] },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await automationController.updateRule(req, res, next);

    expect(rule.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorCode: 'DUPLICATE_AUTOMATION_RULE',
        data: expect.objectContaining({ existingRuleId: 'rule-1' }),
      })
    );
  });
});
