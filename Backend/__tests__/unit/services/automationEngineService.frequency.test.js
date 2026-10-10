jest.mock('../../../models', () => ({
  AutomationRule: { findAll: jest.fn() },
  AutomationRun: { findOne: jest.fn(), create: jest.fn() },
  Customer: {},
  Invoice: {},
  Job: {},
  Lead: {},
  Prescription: {},
  PrescriptionItem: {},
  Product: {},
  Quote: {},
  Sale: {},
  SaleItem: {},
  Tenant: {},
  User: {},
  UserTask: { create: jest.fn() },
}));

jest.mock('../../../services/emailService', () => ({ sendPlatformMessage: jest.fn() }));
jest.mock('../../../services/smsService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/whatsappService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../../services/emailTemplates', () => ({ marketingPlainMessageEmail: jest.fn((body) => body) }));
jest.mock('../../../utils/resolveBusinessNameForContext', () => ({
  resolveBusinessNameForContext: jest.fn().mockResolvedValue({ businessName: 'Test Biz', branchName: '' }),
}));
jest.mock('../../../utils/documentOrganizationUtils', () => ({
  loadTenantOrganization: jest.fn().mockResolvedValue(null),
}));

const { AutomationRun } = require('../../../models');
const emailService = require('../../../services/emailService');
const {
  DEDUPE_WINDOW_HOURS,
  FREQUENCY_COOLDOWN_HOURS,
  executeRule,
  getTemplateByKey,
  hasSuccessfulLifetimeRun,
  resolveRuleSchedule,
} = require('../../../services/automationEngineService');

describe('automationEngineService frequency / schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AutomationRun.findOne.mockResolvedValue(null);
    AutomationRun.create.mockResolvedValue({ id: 'run-1' });
    emailService.sendPlatformMessage.mockResolvedValue({ success: true });
  });

  describe('resolveRuleSchedule', () => {
    it('maps once and maxSends:1 to lifetime mode', () => {
      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: { frequency: 'once' },
      })).toMatchObject({ mode: 'lifetime', frequency: 'once', maxSends: 1 });

      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: { maxSends: 1 },
      })).toMatchObject({ mode: 'lifetime', maxSends: 1 });
    });

    it('maps daily / weekly / monthly / every_n_days to cooldown hours', () => {
      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: { frequency: 'daily' },
      })).toMatchObject({ mode: 'cooldown', cooldownHours: FREQUENCY_COOLDOWN_HOURS.daily });

      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: { frequency: 'weekly' },
      })).toMatchObject({ mode: 'cooldown', cooldownHours: FREQUENCY_COOLDOWN_HOURS.weekly });

      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: { frequency: 'monthly' },
      })).toMatchObject({ mode: 'cooldown', cooldownHours: FREQUENCY_COOLDOWN_HOURS.monthly });

      expect(resolveRuleSchedule({
        triggerType: 'low_stock_detected',
        scheduleConfig: { frequency: 'every_n_days', intervalDays: 3 },
      })).toMatchObject({ mode: 'cooldown', cooldownHours: 72, intervalDays: 3 });
    });

    it('falls back to legacy cooldownHours then sticky daily then dedupe', () => {
      expect(resolveRuleSchedule({
        triggerType: 'payment_received',
        scheduleConfig: { cooldownHours: 48 },
      })).toMatchObject({ mode: 'cooldown', cooldownHours: 48 });

      expect(resolveRuleSchedule({
        triggerType: 'invoice_overdue',
        scheduleConfig: {},
      })).toMatchObject({ mode: 'cooldown', frequency: 'daily', cooldownHours: 24 });

      expect(resolveRuleSchedule({
        triggerType: 'payment_received',
        scheduleConfig: {},
      })).toMatchObject({ mode: 'dedupe', cooldownHours: DEDUPE_WINDOW_HOURS });
    });
  });

  describe('win-back repeat', () => {
    it('repeats every 30 days per customer, including existing rules with no schedule saved', () => {
      expect(getTemplateByKey('win_back_campaign').scheduleConfig).toMatchObject({
        frequency: 'every_n_days',
        intervalDays: 30,
        cooldownHours: 720,
      });
      expect(resolveRuleSchedule({ triggerType: 'customer_inactive_days', scheduleConfig: {} }))
        .toMatchObject({ mode: 'cooldown', frequency: 'every_n_days', cooldownHours: 720, intervalDays: 30 });
      expect(resolveRuleSchedule({ triggerType: 'customer_inactive_days', scheduleConfig: { frequency: 'weekly' } }))
        .toMatchObject({ cooldownHours: 168 });
    });
  });

  describe('overdue template default', () => {
    it('defaults overdue_invoice_reminder template to weekly', () => {
      const template = getTemplateByKey('overdue_invoice_reminder');
      expect(template.scheduleConfig).toMatchObject({
        frequency: 'weekly',
        cooldownHours: 168,
      });
    });
  });

  describe('executeRule frequency gates', () => {
    const baseRule = {
      id: 'rule-1',
      name: 'Overdue reminder',
      enabled: true,
      triggerType: 'invoice_overdue',
      triggerConfig: {},
      conditionConfig: {},
      actionConfig: {
        actions: [{ type: 'send_email_platform', subject: 'Overdue', body: 'Please pay' }],
      },
    };

    it('skips once frequency after a prior success run (lifetime)', async () => {
      AutomationRun.findOne.mockResolvedValue({ id: 'prior-success' });

      const result = await executeRule({
        rule: { ...baseRule, scheduleConfig: { frequency: 'once', maxSends: 1 } },
        tenantId: 'tenant-1',
        triggerContext: {
          subjectKey: 'invoice_overdue:inv-1',
          email: 'customer@example.com',
          customerName: 'Ama',
        },
      });

      expect(result).toMatchObject({ skipped: true, reason: 'max_sends_reached' });
      expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
      expect(AutomationRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'success',
            triggerContext: { subjectKey: 'invoice_overdue:inv-1' },
          }),
        })
      );
    });

    it('skips daily when a run exists inside the 24h cooldown', async () => {
      AutomationRun.findOne.mockResolvedValue({ id: 'recent-run' });

      const result = await executeRule({
        rule: { ...baseRule, scheduleConfig: { frequency: 'daily', cooldownHours: 24 } },
        tenantId: 'tenant-1',
        triggerContext: {
          subjectKey: 'invoice_overdue:inv-1',
          email: 'customer@example.com',
        },
      });

      expect(result).toMatchObject({ skipped: true, reason: 'cooldown_window' });
      expect(emailService.sendPlatformMessage).not.toHaveBeenCalled();
    });

    it('skips weekly when a run exists inside the 168h cooldown', async () => {
      AutomationRun.findOne.mockResolvedValue({ id: 'recent-run' });

      const result = await executeRule({
        rule: { ...baseRule, scheduleConfig: { frequency: 'weekly', cooldownHours: 168 } },
        tenantId: 'tenant-1',
        triggerContext: {
          subjectKey: 'invoice_overdue:inv-1',
          email: 'customer@example.com',
        },
      });

      expect(result).toMatchObject({ skipped: true, reason: 'cooldown_window' });
      expect(AutomationRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.any(Object),
          }),
        })
      );
    });

    it('sends when weekly cooldown has expired', async () => {
      AutomationRun.findOne.mockResolvedValue(null);

      const result = await executeRule({
        rule: { ...baseRule, scheduleConfig: { frequency: 'weekly', cooldownHours: 168 } },
        tenantId: 'tenant-1',
        triggerContext: {
          subjectKey: 'invoice_overdue:inv-2',
          email: 'customer@example.com',
          customerName: 'Ama',
        },
      });

      expect(result.skipped).toBeFalsy();
      expect(emailService.sendPlatformMessage).toHaveBeenCalled();
      expect(AutomationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });
  });

  describe('hasSuccessfulLifetimeRun', () => {
    it('returns true when a success run exists for the subject', async () => {
      AutomationRun.findOne.mockResolvedValue({ id: 'run-ok' });
      await expect(hasSuccessfulLifetimeRun({
        tenantId: 't1',
        ruleId: 'r1',
        subjectKey: 'invoice_overdue:inv-1',
      })).resolves.toBe(true);
    });

    it('returns false when subjectKey is missing', async () => {
      await expect(hasSuccessfulLifetimeRun({
        tenantId: 't1',
        ruleId: 'r1',
        subjectKey: null,
      })).resolves.toBe(false);
      expect(AutomationRun.findOne).not.toHaveBeenCalled();
    });
  });
});
