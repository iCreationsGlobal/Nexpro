const {
  getTemplate,
  preparePaymentReminder,
  preparePaymentReminderButtonParameters,
  validateParameters,
} = require('../../../services/whatsappTemplates');

describe('whatsappTemplates payment_reminder (Meta payment_overdue_2)', () => {
  it('defines four body params plus paymentPath button', () => {
    const template = getTemplate('payment_reminder');
    expect(template.parameters).toEqual(['customerName', 'invoiceNumber', 'balanceFormatted', 'dueDate']);
    expect(template.buttonParameters).toEqual(['paymentPath']);
  });

  it('prepares body parameters in Meta order', () => {
    const params = preparePaymentReminder(
      {
        invoiceNumber: 'INV-100',
        balance: 50,
        dueDate: '2026-01-15T00:00:00.000Z',
      },
      { name: 'Ama Mensah' }
    );
    expect(params).toHaveLength(4);
    expect(params[0]).toBe('Ama Mensah');
    expect(params[1]).toBe('INV-100');
    expect(params[2]).toContain('50');
    expect(params[3]).toMatch(/15/);
    expect(validateParameters('payment_reminder', params)).toBe(true);
  });

  it('prepares Pay now button path from paymentToken', () => {
    expect(
      preparePaymentReminderButtonParameters({ paymentToken: 'tok-abc' })
    ).toEqual(['pay-invoice/tok-abc']);
    expect(preparePaymentReminderButtonParameters({})).toEqual([]);
  });
});
