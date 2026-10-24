const crypto = require('crypto');

jest.mock('../../../models', () => ({
  User: { findByPk: jest.fn() },
  Sale: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Customer: { findAll: jest.fn() },
  LynkAiSession: { findOne: jest.fn() },
  Tenant: { findByPk: jest.fn() },
}));
// The person's context, as ABS's own middleware would set it.
jest.mock('../../../middleware/tenant', () => ({
  tenantContext: jest.fn((req, res, next) => {
    req.tenantId = req.headers['x-tenant-id'];
    req.tenant = { id: req.tenantId, businessType: 'shop' };
    req.tenantRole = req.user.role;
    next();
  }),
}));
jest.mock('../../../middleware/shopContext', () => ({ shopContext: jest.fn((req, res, next) => { req.shopFilterId = req.headers['x-shop-id'] || 'shop-main'; next(); }) }));
jest.mock('../../../middleware/studioLocationContext', () => ({ studioLocationContext: jest.fn((req, res, next) => next()) }));
jest.mock('../../../middleware/auth', () => ({ getEffectiveRole: (req) => (['owner', 'admin'].includes(req.tenantRole) ? 'admin' : req.tenantRole) }));
jest.mock('../../../controllers/reportController', () => ({ getOverviewExtendedKpis: jest.fn(), getOutstandingPaymentsReport: jest.fn(), getProductSalesReport: jest.fn(), getTopCustomers: jest.fn(), getExpenseReport: jest.fn() }));
jest.mock('../../../controllers/saleController', () => ({ getSales: jest.fn(), getSale: jest.fn() }));
jest.mock('../../../controllers/invoiceController', () => ({ getInvoice: jest.fn(), getInvoices: jest.fn() }));
jest.mock('../../../services/lynkAi', () => ({ startAiSession: jest.fn() }));

const { User, LynkAiSession } = require('../../../models');
const { shopContext } = require('../../../middleware/shopContext');
const reports = require('../../../controllers/reportController');
const salesController = require('../../../controllers/saleController');
const invoices = require('../../../controllers/invoiceController');
const { answerQuestion, datesOf, AskError } = require('../../../services/lynkAsk');
const { lynkAsk } = require('../../../controllers/lynkAiController');

/** A controller that answers with this body. */
const answers = (body) => async (req, res) => res.status(200).json(body);
const SESSION = { tenantId: 't1', userId: 'u1', shopId: 'shop-osu', studioLocationId: null, client: 'web' };
const thisWeek = { from: '2026-10-19', to: '2026-10-25', label: 'this week', previous: { from: '2026-10-13', to: '2026-10-19', label: 'last week' } };

beforeEach(() => {
  jest.clearAllMocks();
  User.findByPk.mockResolvedValue({ id: 'u1', role: 'owner', isActive: true });
});

describe('answers to Lynk AI, from ABS\'s own reports', () => {
  it('turns Lynk\'s whole days into ABS\'s report dates', () => {
    expect(datesOf(thisWeek)).toEqual({ startDate: '2026-10-19', endDate: '2026-10-24' });
    expect(datesOf({ from: '2026-10-24', to: '2026-10-25' })).toEqual({ startDate: '2026-10-24', endDate: '2026-10-24' });
    expect(datesOf({ from: 'soon', to: 'later' })).toBeNull();
  });

  it('a summary is the Reports overview for the period and the one before, as the person in their shop', async () => {
    reports.getOverviewExtendedKpis.mockImplementation(answers({ data: {
      current: { totalRevenue: 1500, averageInvoiceValue: 50, operatingExpenses: 200, cogs: 600, grossProfit: 900, netProfit: 700, newCustomers: 3, totalOutstanding: 450, revenueSource: 'sales' },
      previous: { totalRevenue: 1000, averageInvoiceValue: 40, operatingExpenses: 150, cogs: 400, grossProfit: 600, netProfit: 450, newCustomers: 1 },
    } }));
    salesController.getSales.mockImplementation(async (req, res) => res.json({ summary: { completedCount: req.query.startDate === '2026-10-19' ? 30 : 25 } }));
    const a = await answerQuestion(SESSION, { kind: 'summary', period: thisWeek });
    const req = reports.getOverviewExtendedKpis.mock.calls[0][0];
    expect(req.query).toEqual({ startDate: '2026-10-19', endDate: '2026-10-24', compareStartDate: '2026-10-13', compareEndDate: '2026-10-18' });
    expect(req.shopFilterId).toBe('shop-osu');
    expect(req.tenantId).toBe('t1');
    expect(a.current).toEqual({ sales_total: 1500, sales_count: 30, average_sale: 50, expenses_total: 200, cost_of_goods: 600, gross_profit: 900, net_profit: 700, new_customers: 3 });
    expect(a.previous.sales_count).toBe(25);
    expect(a.money_owed_total).toBe(450);
    expect(a.link).toBe('/reports/overview');
  });

  it('money owed lists the unpaid invoices with how late they are, linked for the web or the app', async () => {
    const due = new Date(Date.now() - 12 * 86_400_000).toISOString();
    reports.getOutstandingPaymentsReport.mockImplementation(answers({ data: { totalOutstanding: 900, invoices: [
      { id: 'inv-42', invoiceNumber: 'INV-0042', balance: 600, totalAmount: 600, dueDate: due, customer: { name: 'Kofi', phone: '0244' } },
      { id: 'inv-43', invoiceNumber: 'INV-0043', balance: '300.00', totalAmount: 300, dueDate: null, customer: { name: 'Ama' } },
    ] } }));
    const web = await answerQuestion(SESSION, { kind: 'money_owed', limit: 5 });
    expect(web).toMatchObject({ total_amount: 900, count: 2, overdue_count: 1, link: '/invoices' });
    expect(web.items[0]).toMatchObject({ label: 'INV-0042 · Kofi', detail: 'GH₵600 due, 12 days late', days_overdue: 12, amount_due: 600, link: '/invoices?openInvoiceId=inv-42' });
    expect(web.items[1]).toMatchObject({ amount_due: 300, days_overdue: 0, detail: 'GH₵300 due' });
    const app = await answerQuestion({ ...SESSION, client: 'app' }, { kind: 'money_owed' });
    expect(app.items[0].link).toBe('/invoice/inv-42');
  });

  it('a record is the one the person has open, through ABS\'s own loader (its own access rules)', async () => {
    invoices.getInvoice.mockImplementation(async (req, res) => res.json({ data: { invoiceNumber: 'INV-0042', customer: { name: 'Kofi' }, status: 'overdue', totalAmount: 600, amountPaid: 0, balance: 600, items: [{ description: 'Kente cloth', quantity: 2, total: 600 }] } }));
    const a = await answerQuestion(SESSION, { kind: 'record', type: 'invoice', id: 'inv-42' });
    expect(invoices.getInvoice.mock.calls[0][0].params).toEqual({ id: 'inv-42' });
    expect(a).toMatchObject({ type: 'invoice', label: 'Invoice INV-0042', fields: { number: 'INV-0042', customer: 'Kofi', balance: 600, items: [{ name: 'Kente cloth', quantity: 2, total: 600 }] }, link: '/invoices?openInvoiceId=inv-42' });
    await expect(answerQuestion(SESSION, { kind: 'record', type: 'payroll', id: 'x' })).rejects.toBeInstanceOf(AskError);
  });

  it('ABS saying no (not found, no access) reaches Lynk as an error', async () => {
    invoices.getInvoice.mockImplementation(async (req, res) => res.status(404).json({ message: 'Invoice not found' }));
    await expect(answerQuestion(SESSION, { kind: 'record', type: 'invoice', id: 'nope' })).rejects.toMatchObject({ message: 'Invoice not found', status: 404 });
  });

  it('only owners, admins and managers, and only what their shop lets them see', async () => {
    User.findByPk.mockResolvedValue({ id: 'u1', role: 'staff', isActive: true });
    await expect(answerQuestion(SESSION, { kind: 'money_owed' })).rejects.toMatchObject({ status: 403 });
    User.findByPk.mockResolvedValue({ id: 'u1', role: 'manager', isActive: true });
    shopContext.mockImplementationOnce((req, res) => res.status(403).json({ message: 'You are not assigned to any shop.' }));
    await expect(answerQuestion(SESSION, { kind: 'money_owed' })).rejects.toMatchObject({ status: 403, message: 'You are not assigned to any shop.' });
    User.findByPk.mockResolvedValue({ id: 'u1', role: 'owner', isActive: false });
    await expect(answerQuestion(SESSION, { kind: 'money_owed' })).rejects.toMatchObject({ status: 403 });
    await expect(answerQuestion(SESSION, { kind: 'payroll' })).rejects.toBeInstanceOf(AskError);
  });
});

describe('Lynk\'s signed questions', () => {
  const SECRET = 'whsec_test';
  const signed = (body, secret = SECRET) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { body, rawBody, headers: { 'x-lynk-signature': crypto.createHmac('sha256', secret).update(rawBody).digest('hex') } };
  };
  const reply = () => {
    const res = { statusCode: 200, body: null };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
  };
  const body = { session_id: 'ses-1', user: { id: 't1' }, member: { id: 'u1', role: 'owner' }, question: { kind: 'money_owed', limit: 3 } };

  beforeEach(() => {
    process.env.LYNK_IMPORT_SECRET = SECRET;
    LynkAiSession.findOne.mockResolvedValue({ lynkSessionId: 'ses-1', tenantId: 't1', userId: 'u1', shopId: 'shop-osu', studioLocationId: null, client: 'app' });
    reports.getOutstandingPaymentsReport.mockImplementation(answers({ data: { totalOutstanding: 0, invoices: [] } }));
  });

  it('refuses a question not signed with the secret', async () => {
    const res = reply();
    await lynkAsk(signed(body, 'wrong'), res);
    expect(res.statusCode).toBe(401);
  });

  it('answers only for a session ABS opened, for the same business and person', async () => {
    let res = reply();
    await lynkAsk(signed({ ...body, member: { id: 'someone-else' } }), res);
    expect(res.statusCode).toBe(404);
    res = reply();
    await lynkAsk(signed({ ...body, user: { id: 'another-business' } }), res);
    expect(res.statusCode).toBe(404);
    LynkAiSession.findOne.mockResolvedValueOnce(null);
    res = reply();
    await lynkAsk(signed(body), res);
    expect(res.statusCode).toBe(404);
  });

  it('answers with ABS\'s numbers, in the shop the session was opened in', async () => {
    const res = reply();
    await lynkAsk(signed(body), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toMatchObject({ total_amount: 0, count: 0, link: '/invoices' });
    expect(reports.getOutstandingPaymentsReport.mock.calls[0][0].shopFilterId).toBe('shop-osu');
  });
});
