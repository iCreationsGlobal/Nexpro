jest.mock('../../../config/database', () => ({
  sequelize: { close: jest.fn() },
}));
jest.mock('../../../models', () => ({
  Tenant: { findAll: jest.fn(), findByPk: jest.fn() },
  Setting: { findOne: jest.fn() },
  SubscriptionPlan: { update: jest.fn() },
}));
jest.mock('../../../services/subscriptionBillingService', () => ({
  resetTenantTrial: jest.fn(),
}));

const { sequelize } = require('../../../config/database');
const { Tenant, Setting, SubscriptionPlan } = require('../../../models');
const { resetTenantTrial } = require('../../../services/subscriptionBillingService');
const { up } = require('../../../migrations/retire-free-plan');

describe('retire-free-plan migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    SubscriptionPlan.update.mockResolvedValue([1]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('moves each Free plan business to a fresh trial and clears what the Free plan left', async () => {
    Tenant.findAll.mockResolvedValue([{ id: 't1', name: 'Ama Shop' }]);
    const tenant = {
      metadata: { signupChannel: 'mobile', accessEndsAt: '2027-08-01', freeAccessMonths: 12, freePlanName: 'Free plan' },
      update: jest.fn(),
    };
    Tenant.findByPk.mockResolvedValue(tenant);
    const setting = {
      value: { plan: 'trial', status: 'trialing', complimentary: true, complimentaryReason: 'mobile_signup_free_plan', accessEndsAt: '2027-08-01', history: [] },
      update: jest.fn(),
    };
    Setting.findOne.mockResolvedValue(setting);

    await up({ closeConnection: false });

    expect(Tenant.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { plan: 'free_plan' } }));
    expect(resetTenantTrial).toHaveBeenCalledWith('t1', { reason: 'Free plan retired: moved to the free trial' });
    expect(tenant.update).toHaveBeenCalledWith({ metadata: { signupChannel: 'mobile' } });
    expect(setting.update).toHaveBeenCalledWith({ value: { plan: 'trial', status: 'trialing', history: [] } });
    expect(SubscriptionPlan.update).toHaveBeenCalledWith(
      { isActive: false },
      { where: { planId: 'free_plan', isActive: true } }
    );
    expect(sequelize.close).not.toHaveBeenCalled();
  });

  it('keeps going when one business cannot be moved', async () => {
    Tenant.findAll.mockResolvedValue([{ id: 't1', name: 'Paid Shop' }, { id: 't2', name: 'Kofi Store' }]);
    resetTenantTrial.mockRejectedValueOnce(new Error('active paid subscription')).mockResolvedValueOnce({});
    Tenant.findByPk.mockResolvedValue({ metadata: {}, update: jest.fn() });
    Setting.findOne.mockResolvedValue(null);

    await up({ closeConnection: false });

    expect(resetTenantTrial).toHaveBeenCalledTimes(2);
    expect(Tenant.findByPk).toHaveBeenCalledTimes(1);
    expect(Tenant.findByPk).toHaveBeenCalledWith('t2');
    expect(SubscriptionPlan.update).toHaveBeenCalled();
  });

  it('does nothing to businesses when none are on the Free plan, and closes the connection', async () => {
    Tenant.findAll.mockResolvedValue([]);
    SubscriptionPlan.update.mockResolvedValue([0]);

    await up();

    expect(resetTenantTrial).not.toHaveBeenCalled();
    expect(sequelize.close).toHaveBeenCalled();
  });
});
