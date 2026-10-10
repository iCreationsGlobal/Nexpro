jest.mock('../../../config/database', () => ({
  sequelize: {
    json: jest.fn((path) => ({ json: path })),
    where: jest.fn((left, right) => ({ where: [left, right] })),
    literal: jest.fn(),
    transaction: jest.fn(),
    fn: jest.fn(),
    col: jest.fn(),
  },
}));

jest.mock('../../../models', () => ({
  Sale: { findOne: jest.fn(), findByPk: jest.fn(), update: jest.fn() },
  Invoice: { findOne: jest.fn(), findByPk: jest.fn(), update: jest.fn() },
  Tenant: { findByPk: jest.fn() },
}));

jest.mock('../../../services/mobileMoneyService', () => ({ detectProvider: jest.fn() }));
jest.mock('../../../services/tenantMomoCollectionService', () => ({
  getResolvedMtnConfigForTenant: jest.fn(),
}));
jest.mock('../../../services/directMoMoChargeService', () => ({
  initiateDirectMoMoCharge: jest.fn(),
  checkDirectMoMoStatus: jest.fn(),
  buildMobileMoneyRefMeta: jest.fn(),
}));
jest.mock('../../../services/tenantHubtelCollectionService', () => ({
  parseHubtelCallback: jest.fn((body) => ({
    clientReference: body.ClientReference,
    status: body.Status,
    transactionId: body.TransactionId,
  })),
  getResolvedHubtelConfigForTenant: jest.fn(),
}));
jest.mock('../../../services/websocketService', () => ({ emitNewSale: jest.fn() }));

const { sequelize } = require('../../../config/database');
const { Sale, Invoice, Tenant } = require('../../../models');
const { checkDirectMoMoStatus } = require('../../../services/directMoMoChargeService');
const { emitNewSale } = require('../../../services/websocketService');
const {
  mtnWebhook,
  airtelWebhook,
  hubtelWebhook,
} = require('../../../controllers/mobileMoneyController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const tenant = { id: 'tenant-1' };

const makeSale = (provider = 'MTN', overrides = {}) => ({
  id: 'sale-1',
  tenantId: tenant.id,
  status: 'pending',
  total: 250,
  metadata: { mobileMoneyRef: { referenceId: 'ref-1', provider, status: 'PENDING' } },
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('mobile money webhooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Sale.findOne.mockResolvedValue(null);
    Sale.findByPk.mockResolvedValue(null);
    Invoice.findOne.mockResolvedValue(null);
    Invoice.findByPk.mockResolvedValue(null);
    Tenant.findByPk.mockResolvedValue(tenant);
  });

  it('does not complete a sale on a forged "SUCCESSFUL" callback the provider does not confirm', async () => {
    const sale = makeSale();
    Sale.findOne.mockResolvedValue(sale);
    checkDirectMoMoStatus.mockResolvedValue({ status: 'PENDING' });

    const res = makeRes();
    await mtnWebhook({ body: { referenceId: 'ref-1', status: 'SUCCESSFUL' }, query: {} }, res);

    expect(checkDirectMoMoStatus).toHaveBeenCalledWith({ tenant, referenceId: 'ref-1', provider: 'MTN' });
    expect(sale.update).toHaveBeenCalledTimes(1);
    expect(sale.update.mock.calls[0][0]).not.toHaveProperty('status');
    expect(sale.update.mock.calls[0][0].metadata.mobileMoneyRef.status).toBe('PENDING');
    expect(emitNewSale).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('completes the sale when the provider confirms the payment', async () => {
    const sale = makeSale();
    Sale.findOne.mockResolvedValue(sale);
    checkDirectMoMoStatus.mockResolvedValue({ status: 'SUCCESSFUL', financialTransactionId: 'fin-9' });

    await mtnWebhook({ body: { referenceId: 'ref-1' }, query: {} }, makeRes());

    expect(sale.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      paymentMethod: 'mobile_money',
      amountPaid: 250,
    }));
    expect(sale.update.mock.calls[0][0].metadata.mobileMoneyRef).toMatchObject({
      status: 'SUCCESSFUL',
      financialTransactionId: 'fin-9',
    });
    expect(emitNewSale).toHaveBeenCalledWith(tenant.id, sale);
  });

  it('passes the callback reference as a query value, never as SQL', async () => {
    const injection = "x' OR 1=1 --";
    await mtnWebhook({ body: { referenceId: injection, status: 'SUCCESSFUL' }, query: {} }, makeRes());

    expect(sequelize.literal).not.toHaveBeenCalled();
    expect(sequelize.where).toHaveBeenCalledWith({ json: 'metadata.mobileMoneyRef.referenceId' }, injection);
  });

  it('finds MTN payments by the externalId (sale id) MTN echoes back', async () => {
    const saleId = '3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b';
    const sale = makeSale('MTN', { id: saleId });
    Sale.findByPk.mockResolvedValue(sale);
    checkDirectMoMoStatus.mockResolvedValue({ status: 'SUCCESSFUL' });

    await mtnWebhook({ body: { externalId: saleId, status: 'SUCCESSFUL' }, query: {} }, makeRes());

    expect(Sale.findByPk).toHaveBeenCalledWith(saleId);
    expect(checkDirectMoMoStatus).toHaveBeenCalledWith({ tenant, referenceId: 'ref-1', provider: 'MTN' });
    expect(sale.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('ignores externalIds that are not record ids', async () => {
    await mtnWebhook({ body: { externalId: 'PAY-1712345', status: 'SUCCESSFUL' }, query: {} }, makeRes());

    expect(Sale.findByPk).not.toHaveBeenCalled();
    expect(Invoice.findByPk).not.toHaveBeenCalled();
  });

  it('leaves the record alone when the provider cannot give a definite answer', async () => {
    const sale = makeSale('AIRTEL');
    Sale.findOne.mockResolvedValue(sale);
    checkDirectMoMoStatus.mockResolvedValue({ success: false, status: 'UNKNOWN' });

    await airtelWebhook({ body: { transaction: { id: 'ref-1', status: 'TS' } } }, makeRes());

    expect(checkDirectMoMoStatus).toHaveBeenCalledWith({ tenant, referenceId: 'ref-1', provider: 'AIRTEL' });
    expect(sale.update).not.toHaveBeenCalled();
  });

  it('does not re-check a sale that is already completed', async () => {
    const sale = makeSale('MTN', {
      status: 'completed',
      metadata: { mobileMoneyRef: { referenceId: 'ref-1', provider: 'MTN', status: 'SUCCESSFUL' } },
    });
    Sale.findOne.mockResolvedValue(sale);

    await mtnWebhook({ body: { referenceId: 'ref-1', status: 'SUCCESSFUL' }, query: {} }, makeRes());

    expect(checkDirectMoMoStatus).not.toHaveBeenCalled();
    expect(sale.update).not.toHaveBeenCalled();
  });

  it('records only the provider-verified status on a Hubtel invoice', async () => {
    const invoice = {
      id: 'inv-1',
      tenantId: tenant.id,
      status: 'sent',
      metadata: { mobileMoneyRef: { referenceId: 'cref-1', provider: 'HUBTEL', status: 'PENDING' } },
      update: jest.fn().mockResolvedValue(undefined),
    };
    Invoice.findOne.mockResolvedValue(invoice);
    checkDirectMoMoStatus.mockResolvedValue({ status: 'FAILED' });

    const res = makeRes();
    await hubtelWebhook({ body: { ClientReference: 'cref-1', Status: 'Success' } }, res);

    expect(checkDirectMoMoStatus).toHaveBeenCalledWith({ tenant, referenceId: 'cref-1', provider: 'HUBTEL' });
    expect(invoice.update).toHaveBeenCalledWith({
      metadata: { mobileMoneyRef: expect.objectContaining({ status: 'FAILED' }) },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignores Hubtel callbacks without a client reference', async () => {
    const res = makeRes();
    await hubtelWebhook({ body: { Status: 'Success' } }, res);

    expect(Sale.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, ignored: true });
  });
});
