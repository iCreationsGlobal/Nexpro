jest.mock('../../../models', () => ({ Payment: { findAll: jest.fn(), create: jest.fn() } }));
jest.mock('../../../services/partnerCommissionService', () => ({ maybeCreateCommissionForPayment: jest.fn() }));
const { Payment } = require('../../../models');
const { maybeCreateCommissionForPayment } = require('../../../services/partnerCommissionService');
const { processPayment, schedulePayment, recordSalePayment, reconcilePayments } = require('../../../services/partnerPaymentService');
const payment = { id: 'pay', tenantId: 'tenant', type: 'income', status: 'completed', amount: 100, customerId: 'customer', createdAt: new Date(), description: 'invoice:12345678-1234-1234-1234-123456789012' };
beforeEach(() => jest.clearAllMocks());
test('routes invoice and general job payments to the commission service', async () => {
  await processPayment(payment);
  expect(maybeCreateCommissionForPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay', paymentAmount: 100, invoiceId: '12345678-1234-1234-1234-123456789012' }));
  await processPayment({ ...payment, description: 'Job payment', jobId: 'job' });
  expect(maybeCreateCommissionForPayment).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: 'job', invoiceId: null }));
});
test('ignores pending, refunded, expense and zero payments', async () => {
  for (const row of [{ ...payment, status: 'pending' }, { ...payment, status: 'refunded' }, { ...payment, type: 'expense' }, { ...payment, amount: 0 }]) await processPayment(row);
  expect(maybeCreateCommissionForPayment).not.toHaveBeenCalled();
});
test('waits until commit before issuing commissions', async () => {
  const transaction = { afterCommit: jest.fn() };
  schedulePayment(payment, { transaction });
  expect(maybeCreateCommissionForPayment).not.toHaveBeenCalled();
  await transaction.afterCommit.mock.calls[0][0]();
  expect(maybeCreateCommissionForPayment).toHaveBeenCalledTimes(1);
});
test('replays a failed payment during reconciliation', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  maybeCreateCommissionForPayment.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ id: 'commission' });
  await schedulePayment(payment);
  Payment.findAll.mockResolvedValue([payment]);
  const result = await reconcilePayments();
  expect(result.failed).toBe(0);
  expect(maybeCreateCommissionForPayment).toHaveBeenCalledTimes(2);
  log.mockRestore();
});
test('records only collected sale value, atomically with the sale transaction', async () => {
  const transaction = {};
  await recordSalePayment({ id: 'sale', tenantId: 'tenant', total: 90, paymentMethod: 'card', customerId: 'customer' }, 100, { transaction });
  expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 90, description: 'sale:sale', paymentMethod: 'credit_card', status: 'completed' }), { transaction });
});
