jest.mock('../../../models', () => ({
  Invoice: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
  Rental: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../services/rentalDepositService', () => ({
  getRentalDeposit: jest.fn(),
}));

const { Invoice, Rental } = require('../../../models');
const { updateCustomerBalance } = require('../../../services/customerBalanceService');
const { getRentalDeposit } = require('../../../services/rentalDepositService');
const {
  isRentalSourcedInvoice,
  getHirePaidFromInvoice,
  syncLinkedRentalFromInvoice,
  syncRentalFromPaidInvoice,
} = require('../../../services/rentalInvoicePaymentService');

describe('rentalInvoicePaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRentalDeposit.mockReturnValue({ status: 'held', paid: 0, appliedAmount: 0 });
  });

  it('detects rental invoices by sourceType or metadata', () => {
    expect(isRentalSourcedInvoice({ sourceType: 'rental' })).toBe(true);
    expect(isRentalSourcedInvoice({ sourceType: 'sale', metadata: { generatedFrom: 'rental' } })).toBe(true);
    expect(isRentalSourcedInvoice({ sourceType: 'sale', metadata: { rentalId: 'r-1' } })).toBe(true);
    expect(isRentalSourcedInvoice({ sourceType: 'sale', metadata: {} })).toBe(false);
  });

  it('excludes applied deposit from hire paid', () => {
    getRentalDeposit.mockReturnValue({ status: 'applied', paid: 200, appliedAmount: 200 });
    expect(getHirePaidFromInvoice({ amountPaid: 350 }, { totalDue: 400 })).toBe(150);
  });

  it('syncs rental amountPaid from a rental invoice and skips sales', async () => {
    const rental = {
      id: 'rental-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      amountPaid: 0,
      totalDue: 400,
      status: 'active',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const invoice = {
      id: 'inv-1',
      sourceType: 'rental',
      customerId: 'customer-1',
      amountPaid: 150,
      metadata: { rentalId: 'rental-1', generatedFrom: 'rental' },
    };

    Rental.findByPk.mockResolvedValue(rental);
    Invoice.findByPk.mockResolvedValue(invoice);

    const result = await syncRentalFromPaidInvoice('inv-1', { tenantId: 'tenant-1' });

    expect(rental.update).toHaveBeenCalledWith({ amountPaid: 150 });
    expect(updateCustomerBalance).toHaveBeenCalledWith('customer-1');
    expect(result.rental).toBe(rental);
  });

  it('does not sync a cancelled rental', async () => {
    const rental = {
      id: 'rental-1',
      status: 'cancelled',
      update: jest.fn(),
    };
    const invoice = {
      sourceType: 'rental',
      metadata: { rentalId: 'rental-1' },
      amountPaid: 50,
    };

    const result = await syncLinkedRentalFromInvoice(invoice, { rental });
    expect(result).toBeNull();
    expect(rental.update).not.toHaveBeenCalled();
  });
});
