jest.mock('../../../models', () => ({
  Invoice: {
    findOne: jest.fn(),
  },
  Payment: {
    findOne: jest.fn(),
  },
  Sale: {
    count: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  },
  SaleItem: {
    bulkCreate: jest.fn(),
  },
  SaleActivity: {
    create: jest.fn(),
  },
}));

jest.mock('../../../services/customerBalanceService', () => ({
  updateCustomerBalance: jest.fn(),
}));

jest.mock('../../../services/rentalInvoicePaymentService', () => ({
  isRentalSourcedInvoice: jest.fn((invoice) => (
    invoice?.sourceType === 'rental' || invoice?.metadata?.generatedFrom === 'rental'
  )),
  syncRentalFromPaidInvoice: jest.fn().mockResolvedValue({ rental: null, invoice: null }),
}));

const { Invoice, Payment, Sale, SaleItem, SaleActivity } = require('../../../models');
const { updateCustomerBalance } = require('../../../services/customerBalanceService');
const {
  ensureSaleFromPaidInvoice,
  syncLinkedInvoiceFromSale,
  syncSaleInvoiceAndRefreshCustomerBalance,
} = require('../../../services/invoiceSaleService');
const { syncRentalFromPaidInvoice } = require('../../../services/rentalInvoicePaymentService');

const buildInvoice = (overrides = {}) => ({
  id: 'invoice-1',
  tenantId: 'tenant-1',
  invoiceNumber: 'INV-001',
  customerId: 'customer-1',
  quoteId: 'quote-1',
  saleId: null,
  shopId: 'shop-1',
  subtotal: 100,
  taxAmount: 0,
  discountAmount: 0,
  totalAmount: 100,
  amountPaid: 40,
  status: 'partial',
  items: [
    {
      description: 'Quoted product',
      quantity: 2,
      unitPrice: 50,
      total: 100,
      productId: 'product-1',
    },
  ],
  update: jest.fn(async function update(payload) {
    Object.assign(this, payload);
    return this;
  }),
  ...overrides,
});

describe('invoiceSaleService.ensureSaleFromPaidInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Payment.findOne.mockResolvedValue({ id: 'payment-1', paymentMethod: 'mobile_money' });
    Sale.count.mockResolvedValue(3);
    Sale.findOne.mockResolvedValue(null);
    Sale.create.mockImplementation((payload) => Promise.resolve({
      id: 'sale-1',
      ...payload,
      update: jest.fn(async function update(updatePayload) {
        Object.assign(this, updatePayload);
        return this;
      }),
    }));
    SaleItem.bulkCreate.mockResolvedValue([]);
    SaleActivity.create.mockResolvedValue({});
  });

  it('creates a partially paid sale from an invoice once money is recorded', async () => {
    const invoice = buildInvoice();
    Invoice.findOne.mockResolvedValue(invoice);

    const result = await ensureSaleFromPaidInvoice('invoice-1', 'payment-1', {
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.created).toBe(true);
    expect(Sale.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      shopId: 'shop-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      paymentMethod: 'mobile_money',
      amountPaid: 40,
      total: 100,
      status: 'partially_paid',
      metadata: expect.objectContaining({
        invoiceId: 'invoice-1',
        quoteId: 'quote-1',
        inventoryStockAdjusted: false,
      }),
    }), { transaction: null });
    expect(SaleItem.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        saleId: 'sale-1',
        productId: 'product-1',
        name: 'Quoted product',
        quantity: 2,
        unitPrice: 50,
        total: 100,
      }),
    ], { transaction: null });
    expect(invoice.update).toHaveBeenCalledWith({ saleId: 'sale-1' }, { transaction: null });
    expect(SaleActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      saleId: 'sale-1',
      subject: 'Sale Created from Invoice Payment',
    }), { transaction: null });
  });

  it('does not create a sale from a rental invoice', async () => {
    const invoice = buildInvoice({
      sourceType: 'rental',
      metadata: { generatedFrom: 'rental', rentalId: 'rental-1' },
      amountPaid: 100,
    });
    Invoice.findOne.mockResolvedValue(invoice);

    const result = await ensureSaleFromPaidInvoice('invoice-1', 'payment-1', {
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({
      sale: null,
      created: false,
      updated: false,
      reason: 'rental_invoice',
    });
    expect(Sale.create).not.toHaveBeenCalled();
    expect(syncRentalFromPaidInvoice).toHaveBeenCalledWith('invoice-1', {
      tenantId: 'tenant-1',
      invoice,
    });
  });

  it('updates the existing invoice sale instead of creating a duplicate', async () => {
    const invoice = buildInvoice({
      saleId: 'sale-1',
      amountPaid: 100,
      status: 'paid',
    });
    const existingSale = {
      id: 'sale-1',
      tenantId: 'tenant-1',
      metadata: { existing: true },
      update: jest.fn().mockResolvedValue(undefined),
    };
    Invoice.findOne.mockResolvedValue(invoice);
    Sale.findOne.mockResolvedValue(existingSale);

    const result = await ensureSaleFromPaidInvoice('invoice-1', 'payment-1', {
      tenantId: 'tenant-1',
      paymentMethod: 'cash',
    });

    expect(result.updated).toBe(true);
    expect(Sale.create).not.toHaveBeenCalled();
    expect(SaleItem.bulkCreate).not.toHaveBeenCalled();
    expect(existingSale.update).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'invoice-1',
      amountPaid: 100,
      status: 'completed',
      paymentMethod: 'cash',
      metadata: expect.objectContaining({
        existing: true,
        invoiceId: 'invoice-1',
        lastPaymentId: 'payment-1',
      }),
    }), { transaction: null });
  });

  it('does not create a sale before any payment is recorded', async () => {
    Invoice.findOne.mockResolvedValue(buildInvoice({ amountPaid: 0, status: 'sent' }));

    const result = await ensureSaleFromPaidInvoice('invoice-1', null, { tenantId: 'tenant-1' });

    expect(result.reason).toBe('invoice_not_paid');
    expect(Sale.create).not.toHaveBeenCalled();
    expect(SaleItem.bulkCreate).not.toHaveBeenCalled();
  });
});

describe('invoiceSaleService.syncLinkedInvoiceFromSale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates linked invoice amountPaid from sale payment state', async () => {
    const invoice = buildInvoice({
      saleId: 'sale-1',
      amountPaid: 0,
      status: 'sent',
      paidDate: null,
    });
    Invoice.findOne.mockResolvedValue(invoice);

    const result = await syncLinkedInvoiceFromSale({
      id: 'sale-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      amountPaid: 40,
    }, { tenantId: 'tenant-1' });

    expect(invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaid: 40 }),
      { transaction: null }
    );
    expect(result).toBe(invoice);
  });

  it('skips cancelled invoices', async () => {
    Invoice.findOne.mockResolvedValue(buildInvoice({ status: 'cancelled' }));

    const result = await syncLinkedInvoiceFromSale({
      id: 'sale-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      amountPaid: 40,
    }, { tenantId: 'tenant-1' });

    expect(result).toBeNull();
  });

  it('backfills invoice shopId from the linked sale when missing', async () => {
    const invoice = buildInvoice({
      saleId: 'sale-1',
      shopId: null,
      amountPaid: 0,
      status: 'sent',
    });
    Invoice.findOne.mockResolvedValue(invoice);

    await syncLinkedInvoiceFromSale({
      id: 'sale-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      shopId: 'shop-a',
      amountPaid: 40,
    }, { tenantId: 'tenant-1' });

    expect(invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaid: 40, shopId: 'shop-a' }),
      { transaction: null }
    );
  });
});

describe('invoiceSaleService.syncSaleInvoiceAndRefreshCustomerBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateCustomerBalance.mockResolvedValue(40);
  });

  it('refreshes customer balance after syncing invoice from sale', async () => {
    const invoice = buildInvoice({ saleId: 'sale-1', amountPaid: 0, status: 'sent' });
    Invoice.findOne.mockResolvedValue(invoice);

    await syncSaleInvoiceAndRefreshCustomerBalance({
      id: 'sale-1',
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      invoiceId: 'invoice-1',
      amountPaid: 40,
    }, { tenantId: 'tenant-1' });

    expect(updateCustomerBalance).toHaveBeenCalledWith('customer-1', null);
  });
});
