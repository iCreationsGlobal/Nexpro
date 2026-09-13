jest.mock('../../../models', () => ({
  Invoice: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Rental: {
    findByPk: jest.fn(),
  },
  RentalItem: {},
  Product: {},
  LateCharge: {
    update: jest.fn().mockResolvedValue(undefined),
  },
  DamageReport: {},
}));

jest.mock('../../../services/rentalDepositService', () => ({
  applyDepositToInvoice: jest.fn(),
  getRentalDeposit: jest.fn(),
}));

jest.mock('../../../services/invoiceAccountingService', () => ({
  createInvoiceRevenueJournal: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../middleware/cache', () => ({
  invalidateInvoiceListCache: jest.fn(),
}));

const { Invoice, Rental, LateCharge } = require('../../../models');
const { applyDepositToInvoice, getRentalDeposit } = require('../../../services/rentalDepositService');
const { createInvoiceRevenueJournal } = require('../../../services/invoiceAccountingService');
const { updateCustomerBalance } = require('../../../services/customerBalanceService');
const { generateRentalInvoice } = require('../../../services/rentalInvoiceService');

const buildRental = (overrides = {}) => ({
  id: 'rental-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  customerId: 'customer-1',
  status: 'confirmed',
  startDate: '2026-08-30',
  endDate: '2026-08-31',
  rentalDurationDays: 2,
  discountAmount: 0,
  amountPaid: 0,
  items: [{ productId: 'p1', quantity: 1, rentalRatePerDay: 100, subtotal: 100, product: { name: 'Bus' } }],
  lateCharges: [],
  damageReports: [],
  metadata: {
    deposit: { amount: 200, paid: 200, status: 'held', paymentId: 'pay-1' },
  },
  reload: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('generateRentalInvoice deposit integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.findOne.mockResolvedValue(null);
  });

  it('creates invoice without applying held deposit by default', async () => {
    const rental = buildRental();
    Rental.findByPk.mockResolvedValue(rental);
    getRentalDeposit.mockReturnValue({
      amount: 200,
      paid: 200,
      status: 'held',
      paymentId: 'pay-1',
    });

    const invoice = {
      id: 'inv-1',
      reload: jest.fn().mockResolvedValue(undefined),
    };
    Invoice.create.mockResolvedValue(invoice);

    const result = await generateRentalInvoice('rental-1');

    expect(Invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'rental',
      status: 'sent',
      amountPaid: 0,
      metadata: expect.objectContaining({
        generatedFrom: 'rental',
        rentalDepositStatus: 'held',
      }),
    }));
    expect(applyDepositToInvoice).not.toHaveBeenCalled();
    expect(createInvoiceRevenueJournal).toHaveBeenCalled();
    expect(updateCustomerBalance).toHaveBeenCalledWith('customer-1');
    expect(rental.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({ invoiceId: 'inv-1' }),
    });
    expect(LateCharge.update).not.toHaveBeenCalled();
    expect(result).toEqual({ invoice, created: true });
  });

  it('applies held deposit when applyHeldDeposit is true', async () => {
    const rental = buildRental({ status: 'returned' });
    Rental.findByPk.mockResolvedValue(rental);
    getRentalDeposit.mockReturnValue({
      amount: 200,
      paid: 200,
      status: 'held',
      paymentId: 'pay-1',
    });

    const invoice = {
      id: 'inv-1',
      reload: jest.fn().mockResolvedValue(undefined),
    };
    Invoice.create.mockResolvedValue(invoice);
    applyDepositToInvoice.mockResolvedValue({ appliedAmount: 200, deposit: {}, invoiceUpdates: {} });

    const result = await generateRentalInvoice('rental-1', { applyHeldDeposit: true });

    expect(applyDepositToInvoice).toHaveBeenCalledWith(rental, invoice);
    expect(result).toEqual({ invoice, created: true });
  });

  it('sets paid status from hire amountPaid without applying deposit', async () => {
    const rental = buildRental({ amountPaid: 100 });
    Rental.findByPk.mockResolvedValue(rental);
    getRentalDeposit.mockReturnValue({
      amount: 200,
      paid: 200,
      status: 'held',
    });
    const invoice = { id: 'inv-2', reload: jest.fn().mockResolvedValue(undefined) };
    Invoice.create.mockResolvedValue(invoice);

    await generateRentalInvoice('rental-1');

    expect(Invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      amountPaid: 100,
      status: 'paid',
    }));
    expect(applyDepositToInvoice).not.toHaveBeenCalled();
  });
});
