/** Service integration with in-memory persistence; never contacts a live database or payout provider. */
jest.mock('../../../models', () => {
  const { Op } = require('sequelize');
  const { randomUUID } = require('crypto');
  const matches = (row, where = {}) => Reflect.ownKeys(where).every(key => {
    const value = where[key];
    if (key === Op.or) return value.some(condition => matches(row, condition));
    if (key === Op.and) return value.every(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) return Reflect.ownKeys(value).every(op => {
      if (op === Op.in) return value[op].includes(row[key]);
      if (op === Op.gte) return row[key] >= value[op];
      if (op === Op.gt) return row[key] > value[op];
      if (op === Op.iLike) return String(row[key]).toLowerCase() === String(value[op]).toLowerCase();
      if (op === Op.like) return String(row[key]).endsWith(String(value[op]).replace(/^%/, ''));
      throw new Error(`Unsupported operator ${String(op)}`);
    });
    return value === null ? row[key] == null : row[key] === value;
  });
  const table = () => {
    const rows = [];
    return {
      rows,
      async create(data) {
        const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
        Object.defineProperties(row, {
          update: { value: async function(values) { Object.assign(this, values); return this; } },
          reload: { value: async function() { return this; } },
          toJSON: { value: function() { return { ...this }; } },
        });
        rows.push(row); return row;
      },
      async findAll({ where, limit } = {}) { return rows.filter(row => matches(row, where)).slice(0, limit); },
      async findOne({ where } = {}) { return rows.find(row => matches(row, where)) || null; },
      async findByPk(id) { return rows.find(row => row.id === id) || null; },
      async count({ where } = {}) { return rows.filter(row => matches(row, where)).length; },
      async update(values, { where }) { const found = rows.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, values)); return [found.length]; },
    };
  };
  return Object.fromEntries(['Marketer','Tenant','PartnerProgramSettings','PartnershipApplication','Partnership','Customer','Job','Sale','Invoice','Payment','PartnerReferral','PartnerCommission','PartnerRemittance','PartnerCashoutRequest'].map(name => [name, table()]));
});
jest.mock('../../../config/database', () => ({ sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }) } }));
jest.mock('../../../config/config', () => ({ jwt: { secret: 'test-only-secret', expire: '1h' } }));
jest.mock('../../../services/sabitoAppPlatformService', () => ({ getPlatformFeePercent: async () => 20 }));
const models = require('../../../models');
const { registerMarketer } = require('../../../controllers/partnerProgramController');
const { applyToPartner, approveApplication } = require('../../../services/partnerProgramService');
const { createReferral, matchPendingReferralsForCustomer, getReferralForMarketer } = require('../../../services/partnerReferralService');
const { processPayment } = require('../../../services/partnerPaymentService');
const { createRemittance } = require('../../../services/partnerRemittanceService');
const { createCashout, getMarketerDashboard, markCashoutPaid } = require('../../../services/partnerCashoutService');

test('signup → approval → match → job progress → payment → remittance → cashout → paid', async () => {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await registerMarketer({ body: { name: 'Test Marketer', email: 'journey@example.test', password: 'test-password-only' } }, response, next);
  expect(next).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json.mock.calls[0][0].data.token).toBeTruthy();
  const marketer = models.Marketer.rows[0];
  await marketer.update({ momoNumber: '0241234567' });
  const tenant = await models.Tenant.create({ name: 'Test Print Shop' });
  await models.PartnerProgramSettings.create({ tenantId: tenant.id, enabled: true, listed: true, moderationStatus: 'approved', maxMarketers: 5, firstClientRatePercent: 10, returningClientRatePercent: 5, attributionMonths: 12 });
  const application = await applyToPartner({ tenantId: tenant.id, marketerId: marketer.id });
  expect(application.status).toBe('pending');
  const { partnership } = await approveApplication({ tenantId: tenant.id, applicationId: application.id });
  expect(partnership.status).toBe('active');
  const referral = await createReferral({ marketerId: marketer.id, partnershipId: partnership.id, clientName: 'Test Client', clientEmail: 'client@example.test' });
  expect(referral.status).toBe('pending');
  const customer = await models.Customer.create({ tenantId: tenant.id, name: 'Test Client', email: 'client@example.test' });
  await matchPendingReferralsForCustomer(customer);
  expect(referral.status).toBe('matched');
  const job = await models.Job.create({ tenantId: tenant.id, customerId: customer.id, partnershipId: partnership.id, partnerMarketerId: marketer.id, title: 'Print brochures', jobNumber: 'JOB-001', status: 'in_progress' });
  expect((await getReferralForMarketer(marketer.id, referral.id)).jobs[0].status).toBe('in_progress');
  await job.update({ status: 'completed' });
  expect((await getReferralForMarketer(marketer.id, referral.id)).jobs[0].status).toBe('completed');
  const payment = await models.Payment.create({ tenantId: tenant.id, customerId: customer.id, jobId: job.id, type: 'income', status: 'completed', amount: 1000 });
  await processPayment(payment);
  await processPayment(payment); // replay must not double-credit
  expect(models.PartnerCommission.rows).toHaveLength(1);
  const commission = models.PartnerCommission.rows[0];
  expect(commission.amount).toBe(100);
  expect(commission.marketerShareAmount).toBe(80);
  expect((await getMarketerDashboard(marketer.id)).availableBalance).toBe(0);
  await expect(createCashout({ marketerId: marketer.id, commissionIds: [commission.id] })).rejects.toThrow('unavailable');
  await createRemittance({ tenantId: tenant.id, commissionIds: [commission.id], payoutReference: 'TEST-REMIT' });
  expect((await getMarketerDashboard(marketer.id)).availableBalance).toBe(80);
  const cashout = await createCashout({ marketerId: marketer.id, commissionIds: [commission.id] });
  expect(cashout.amount).toBe(80);
  expect((await getMarketerDashboard(marketer.id)).pendingCashoutAmount).toBe(80);
  await markCashoutPaid({ cashoutId: cashout.id, payoutReference: 'TEST-PAYOUT' });
  expect(cashout.status).toBe('paid');
  expect(commission.status).toBe('paid');
  expect((await getMarketerDashboard(marketer.id)).availableBalance).toBe(0);
});
