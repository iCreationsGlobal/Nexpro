const {
  getRentalDeposit,
  getDepositHeld,
  getDepositRefundableAmount,
  resolveSuggestedDepositAmount,
  parseDepositInput,
  buildDepositMetadata,
  applyDepositToInvoice,
  refundRentalDeposit,
  getDepositFinancialSummary,
  initializeRentalDeposit,
} = require('../../../services/rentalDepositService');

jest.mock('../../../models', () => ({
  Payment: {
    create: jest.fn(),
    update: jest.fn(),
  },
}));

describe('rentalDepositService', () => {
  describe('getRentalDeposit', () => {
    it('reads deposit from rental metadata', () => {
      const rental = {
        metadata: {
          deposit: {
            amount: 500,
            paid: 500,
            status: 'held',
            paymentId: 'pay-1',
          },
        },
      };

      expect(getRentalDeposit(rental)).toMatchObject({
        amount: 500,
        paid: 500,
        status: 'held',
        paymentId: 'pay-1',
      });
    });

    it('returns zeros when no deposit metadata exists', () => {
      expect(getRentalDeposit({ metadata: {} })).toMatchObject({
        amount: 0,
        paid: 0,
        status: null,
      });
    });
  });

  describe('getDepositHeld', () => {
    it('returns paid amount only while held', () => {
      const rental = {
        metadata: { deposit: { amount: 300, paid: 300, status: 'held' } },
      };
      expect(getDepositHeld(rental)).toBe(300);
    });

    it('returns zero when deposit was applied in full', () => {
      const rental = {
        metadata: { deposit: { amount: 300, paid: 300, status: 'applied', appliedAmount: 300 } },
      };
      expect(getDepositHeld(rental)).toBe(0);
    });

    it('returns remainder when deposit was partially applied', () => {
      const rental = {
        metadata: {
          deposit: { amount: 500, paid: 500, status: 'applied', appliedAmount: 300 },
        },
      };
      expect(getDepositRefundableAmount(rental)).toBe(200);
    });
  });

  describe('resolveSuggestedDepositAmount', () => {
    it('prefers customer standard deposit over workspace defaults', () => {
      const amount = resolveSuggestedDepositAmount({
        customer: { metadata: { rental: { deposit: { standardDepositAmount: 750 } } } },
        rentalSettings: { defaultDepositAmount: 200, defaultDepositPercent: 10 },
        rentalSubtotal: 1000,
      });
      expect(amount).toBe(750);
    });

    it('uses workspace percent when no customer deposit is set', () => {
      const amount = resolveSuggestedDepositAmount({
        customer: {},
        rentalSettings: { defaultDepositPercent: 25 },
        rentalSubtotal: 400,
      });
      expect(amount).toBe(100);
    });
  });

  describe('parseDepositInput', () => {
    it('treats depositPaid true as full amount collected', () => {
      const parsed = parseDepositInput({ depositAmount: 200, depositPaid: true });
      expect(parsed).toMatchObject({ amount: 200, paid: 200, status: 'held' });
    });

    it('treats depositPaid false as nothing collected while keeping the quoted amount', () => {
      const parsed = parseDepositInput({ depositAmount: 200, depositPaid: false });
      expect(parsed).toMatchObject({ amount: 200, paid: 0 });
    });

    it('treats a numeric depositPaid as a partial amount collected', () => {
      const parsed = parseDepositInput({ depositAmount: 200, depositPaid: 75 });
      expect(parsed).toMatchObject({ amount: 200, paid: 75, status: 'held' });
    });

    it('caps paid amount at deposit amount', () => {
      const parsed = parseDepositInput({ depositAmount: 100, depositPaid: 150 });
      expect(parsed.paid).toBe(100);
    });
  });

  describe('buildDepositMetadata', () => {
    it('returns null when no deposit amount or paid value', () => {
      expect(buildDepositMetadata({ amount: 0, paid: 0 })).toBeNull();
    });
  });

  describe('getDepositFinancialSummary', () => {
    it('reduces net balance when deposit is applied', () => {
      const summary = getDepositFinancialSummary({
        totalDue: 1000,
        amountPaid: 200,
        metadata: {
          deposit: {
            amount: 300,
            paid: 300,
            status: 'applied',
            appliedAmount: 300,
          },
        },
      });

      expect(summary.depositApplied).toBe(300);
      expect(summary.netBalance).toBe(500);
    });
  });

  describe('applyDepositToInvoice', () => {
    it('applies held deposit to invoice and updates rental metadata', async () => {
      const invoice = {
        id: 'inv-1',
        totalAmount: 1000,
        subtotal: 1000,
        amountPaid: 0,
        status: 'draft',
        paidDate: null,
        metadata: {},
        update: jest.fn().mockResolvedValue(undefined),
      };

      const rental = {
        id: 'rental-1',
        metadata: {
          deposit: {
            amount: 300,
            paid: 300,
            status: 'held',
            paymentId: 'pay-1',
            collectedAt: '2026-08-01T00:00:00.000Z',
          },
        },
        update: jest.fn().mockResolvedValue(undefined),
      };

      const result = await applyDepositToInvoice(rental, invoice);

      expect(result.appliedAmount).toBe(300);
      expect(invoice.update).toHaveBeenCalledWith(expect.objectContaining({
        amountPaid: 300,
        balance: 700,
        metadata: expect.objectContaining({ rentalDepositApplied: 300 }),
      }));
      expect(rental.update).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          deposit: expect.objectContaining({
            status: 'applied',
            appliedAmount: 300,
            invoiceId: 'inv-1',
          }),
        }),
      });
    });

    it('is idempotent when deposit already applied to the same invoice', async () => {
      const invoice = { id: 'inv-1', totalAmount: 1000, amountPaid: 300, status: 'sent' };
      const rental = {
        metadata: {
          deposit: {
            amount: 300,
            paid: 300,
            status: 'applied',
            appliedAmount: 300,
            invoiceId: 'inv-1',
          },
        },
        update: jest.fn(),
      };

      const result = await applyDepositToInvoice(rental, invoice);
      expect(result.appliedAmount).toBe(300);
      expect(rental.update).not.toHaveBeenCalled();
    });
  });

  describe('refundRentalDeposit', () => {
    const { Payment } = require('../../../models');

    beforeEach(() => {
      jest.clearAllMocks();
      Payment.create.mockResolvedValue({ id: 'refund-pay-1' });
      Payment.update.mockResolvedValue([1]);
    });

    it('refunds held deposit and records expense payment', async () => {
      const rental = {
        id: 'rental-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        paymentMethod: 'cash',
        metadata: {
          deposit: {
            amount: 300,
            paid: 300,
            status: 'held',
            paymentId: 'pay-1',
            collectedAt: '2026-08-01T00:00:00.000Z',
          },
        },
        update: jest.fn().mockResolvedValue(undefined),
      };

      const result = await refundRentalDeposit(rental, {
        amount: 300,
        reason: 'No damage on return',
        paymentMethod: 'cash',
      });

      expect(result.refundAmount).toBe(300);
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          amount: 300,
          description: 'rental-deposit-refund:rental-1',
        }),
        undefined
      );
      expect(Payment.update).toHaveBeenCalledWith(
        { status: 'refunded' },
        expect.objectContaining({ where: { id: 'pay-1', tenantId: 'tenant-1' } })
      );
      expect(rental.update).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          deposit: expect.objectContaining({
            status: 'refunded',
            refundedAmount: 300,
            refundPaymentId: 'refund-pay-1',
          }),
        }),
      });
    });

    it('supports partial refund while keeping held status', async () => {
      const rental = {
        id: 'rental-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        paymentMethod: 'cash',
        metadata: {
          deposit: {
            amount: 500,
            paid: 500,
            status: 'held',
            paymentId: 'pay-1',
          },
        },
        update: jest.fn().mockResolvedValue(undefined),
      };

      const result = await refundRentalDeposit(rental, {
        amount: 200,
        reason: 'Partial refund agreed',
      });

      expect(result.refundAmount).toBe(200);
      expect(Payment.update).not.toHaveBeenCalled();
      expect(rental.update).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          deposit: expect.objectContaining({
            status: 'held',
            refundedAmount: 200,
          }),
        }),
      });
    });

    it('rejects refund when nothing is refundable', async () => {
      const rental = {
        id: 'rental-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        metadata: {
          deposit: { amount: 300, paid: 300, status: 'refunded', refundedAmount: 300 },
        },
        update: jest.fn(),
      };

      await expect(
        refundRentalDeposit(rental, { amount: 100, reason: 'test' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('initializeRentalDeposit', () => {
    const { Payment } = require('../../../models');

    beforeEach(() => {
      jest.clearAllMocks();
      Payment.create.mockResolvedValue({ id: 'rdp-1' });
    });

    it('does not apply a suggested amount when depositAmount is explicitly 0', async () => {
      const result = await initializeRentalDeposit({
        tenantId: 'tenant-1',
        rentalId: 'rental-1',
        customerId: 'cust-1',
        paymentMethod: 'cash',
        body: { depositAmount: 0, depositPaid: false },
        suggestedAmount: 200,
      });

      expect(result.deposit).toBeNull();
      expect(Payment.create).not.toHaveBeenCalled();
    });

    it('records an RDP payment for a partial amount collected now', async () => {
      const result = await initializeRentalDeposit({
        tenantId: 'tenant-1',
        rentalId: 'rental-1',
        customerId: 'cust-1',
        paymentMethod: 'cash',
        body: { depositAmount: 200, depositPaid: 50 },
      });

      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentNumber: expect.stringMatching(/^RDP-/),
          amount: 50,
          description: 'rental-deposit:rental-1',
        }),
        undefined
      );
      expect(result.deposit).toMatchObject({
        amount: 200,
        paid: 50,
        status: 'held',
        paymentId: 'rdp-1',
      });
    });

    it('does not record a payment when collecting later', async () => {
      const result = await initializeRentalDeposit({
        tenantId: 'tenant-1',
        rentalId: 'rental-1',
        customerId: 'cust-1',
        paymentMethod: 'cash',
        body: { depositAmount: 200, depositPaid: false },
      });

      expect(Payment.create).not.toHaveBeenCalled();
      expect(result.deposit).toMatchObject({ amount: 200 });
      expect(result.deposit.paid).toBeUndefined();
      expect(result.deposit.status).toBeUndefined();
    });
  });
});
