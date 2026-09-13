jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../../models', () => ({
  Rental: {
    findAll: jest.fn(),
  },
  RentalItem: {},
  Product: {},
  Customer: {},
  Tenant: {
    findByPk: jest.fn(),
  },
  User: {
    findAll: jest.fn(),
  },
  UserTenant: {
    findAll: jest.fn(),
  },
  Notification: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  PreBooking: {},
  PreBookingItem: {},
  Invoice: {
    findAll: jest.fn(),
  },
}));

jest.mock('../../../services/emailService', () => ({
  getConfig: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../services/emailTemplates', () => ({
  rentalDueReminder: jest.fn(() => ({
    subject: 'Rental reminder',
    html: '<p>Reminder</p>',
    text: 'Reminder',
  })),
  rentalStaffAlert: jest.fn(() => ({
    subject: 'Staff alert',
    html: '<p>Alert</p>',
    text: 'Alert',
  })),
}));

jest.mock('../../../services/notificationPreferenceHelper', () => ({
  getPreferencesForUsers: jest.fn(),
  isNotificationChannelEnabled: jest.fn(),
}));

jest.mock('../../../services/websocketService', () => ({
  emitNotification: jest.fn(),
}));

jest.mock('../../../utils/tenantLogo', () => ({
  getTenantLogoUrl: jest.fn(() => ''),
}));

jest.mock('../../../services/customerNotificationBridgeService', () => ({
  shouldUseAutomationInsteadOfBuiltIn: jest.fn().mockResolvedValue(false),
}));

const { Rental, Tenant, UserTenant, User, Notification, Invoice } = require('../../../models');
const emailService = require('../../../services/emailService');
const { isNotificationChannelEnabled, getPreferencesForUsers } = require('../../../services/notificationPreferenceHelper');
const rentalNotificationService = require('../../../services/rentalNotificationService');
const { shouldUseAutomationInsteadOfBuiltIn } = require('../../../services/customerNotificationBridgeService');
const {
  NOTIFICATION_TYPES,
  notifyDamageReportCreated,
  processScheduledReminders,
} = require('../../../services/rentalNotificationService');

describe('rentalNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rentalNotificationService.isRunning = false;
    emailService.getConfig.mockResolvedValue({ provider: 'smtp' });
    emailService.sendMessage.mockResolvedValue({ success: true });
    Tenant.findByPk.mockResolvedValue({ id: 'tenant-1', name: 'Rental Co', metadata: {} });
    UserTenant.findAll.mockResolvedValue([{ userId: 'manager-1' }]);
    User.findAll.mockResolvedValue([{ id: 'manager-1', name: 'Manager', email: 'manager@test.com' }]);
    Notification.findOne.mockResolvedValue(null);
    Notification.create.mockResolvedValue({ id: 'notif-1', type: 'alert', metadata: {} });
    Invoice.findAll.mockResolvedValue([]);
    isNotificationChannelEnabled.mockReturnValue(true);
    getPreferencesForUsers.mockResolvedValue(new Map([
      ['manager-1', { categories: { alert: { in_app: true, email: true } } }],
    ]));
    shouldUseAutomationInsteadOfBuiltIn.mockResolvedValue(false);
  });

  it('sends due-today customer email and logs idempotency key', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const update = jest.fn().mockResolvedValue(undefined);
    const rental = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      status: 'active',
      startDate: today,
      endDate: today,
      metadata: {},
      update,
      customer: { id: 'cust-1', name: 'Ada', email: 'ada@test.com' },
      items: [{ product: { name: 'Drill' }, quantity: 1 }],
    };

    Rental.findAll.mockImplementation(async ({ where }) => {
      if (where.endDate === today) return [rental];
      return [];
    });

    const summary = await processScheduledReminders({
      types: [NOTIFICATION_TYPES.DUE_TODAY],
    });

    expect(emailService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'ada@test.com',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
    expect(update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        notificationLog: expect.arrayContaining([
          expect.objectContaining({ key: `due_today:rental-1:${today}` }),
        ]),
      }),
    });
    expect(summary.dueToday.sent).toBe(1);
  });

  it('skips built-in due email when a rental automation rule is enabled', async () => {
    shouldUseAutomationInsteadOfBuiltIn.mockResolvedValue(true);
    const today = new Date().toISOString().slice(0, 10);
    const rental = {
      id: 'rental-auto',
      tenantId: 'tenant-1',
      status: 'active',
      startDate: today,
      endDate: today,
      metadata: {},
      update: jest.fn(),
      customer: { id: 'cust-auto', name: 'Ama', email: 'ama@test.com' },
      items: [],
    };
    Rental.findAll.mockResolvedValue([rental]);

    const summary = await processScheduledReminders({
      types: [NOTIFICATION_TYPES.DUE_TODAY],
    });

    expect(shouldUseAutomationInsteadOfBuiltIn).toHaveBeenCalledWith('tenant-1', 'rental_due_reminder');
    expect(emailService.sendMessage).not.toHaveBeenCalled();
    expect(summary.dueToday.skipped).toBe(1);
    expect(rental.update).not.toHaveBeenCalled();
  });

  it('skips duplicate customer reminders without force', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rental = {
      id: 'rental-2',
      tenantId: 'tenant-1',
      status: 'active',
      startDate: today,
      endDate: today,
      metadata: {
        notificationLog: [{ key: `due_today:rental-2:${today}`, sentAt: new Date().toISOString() }],
      },
      update: jest.fn(),
      customer: { id: 'cust-2', name: 'Kofi', email: 'kofi@test.com' },
      items: [],
    };

    Rental.findAll.mockResolvedValue([rental]);

    const summary = await processScheduledReminders({
      types: [NOTIFICATION_TYPES.DUE_TODAY],
    });

    expect(emailService.sendMessage).not.toHaveBeenCalled();
    expect(summary.dueToday.skipped).toBe(1);
  });

  it('notifies managers for pending damage reports once', async () => {
    const result = await notifyDamageReportCreated({
      damageReport: {
        id: 'damage-1',
        damageType: 'dent',
        severity: 'moderate',
        estimatedRepairCost: 120,
      },
      rental: {
        id: 'rental-3',
        tenantId: 'tenant-1',
        status: 'active',
        customer: { name: 'Ama' },
      },
      productName: 'Pressure washer',
    });

    expect(emailService.sendMessage).toHaveBeenCalledWith(
      'tenant-1',
      'manager@test.com',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'manager-1',
        type: NOTIFICATION_TYPES.DAMAGE_PENDING,
        metadata: expect.objectContaining({ dedupeKey: 'damage:damage-1' }),
      })
    );
    expect(result.sent).toBe(1);

    Notification.findOne.mockResolvedValue({ id: 'existing' });
    const duplicate = await notifyDamageReportCreated({
      damageReport: { id: 'damage-1' },
      rental: { id: 'rental-3', tenantId: 'tenant-1', customer: { name: 'Ama' } },
      productName: 'Pressure washer',
    });
    expect(duplicate.skipped).toBe(1);
    expect(emailService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('alerts managers when a promised hire payment is due and unpaid', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rental = {
      id: 'rental-4',
      tenantId: 'tenant-1',
      status: 'active',
      amountPaid: 0,
      totalDue: 500,
      metadata: { promisedPaymentDate: today },
      customer: { name: 'Yaw' },
    };

    Rental.findAll.mockResolvedValue([rental]);

    const summary = await processScheduledReminders({
      types: [NOTIFICATION_TYPES.PAYMENT_PROMISED],
    });

    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'manager-1',
        type: NOTIFICATION_TYPES.PAYMENT_PROMISED,
        metadata: expect.objectContaining({
          dedupeKey: `staff_payment_promised:rental-4:${today}`,
          promisedPaymentDate: today,
        }),
      })
    );
    expect(summary.paymentPromised.sent).toBe(1);
  });

  it('skips promised-payment alerts when hire has been paid', async () => {
    const today = new Date().toISOString().slice(0, 10);
    Rental.findAll.mockResolvedValue([{
      id: 'rental-5',
      tenantId: 'tenant-1',
      status: 'active',
      amountPaid: 500,
      totalDue: 500,
      metadata: { promisedPaymentDate: today },
      customer: { name: 'Ama' },
    }]);

    const summary = await processScheduledReminders({
      types: [NOTIFICATION_TYPES.PAYMENT_PROMISED],
    });

    expect(Notification.create).not.toHaveBeenCalled();
    expect(summary.paymentPromised.sent).toBe(0);
  });
});
