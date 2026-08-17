const { invoiceNotification } = require('../../../services/emailTemplates');

describe('invoiceNotification paid CTA', () => {
  const customer = { name: 'Ama' };
  const company = { name: 'Test Press' };

  it('includes a pay button for unpaid invoices', () => {
    const result = invoiceNotification(
      { invoiceNumber: 'INV-1', status: 'sent', totalAmount: 100, balance: 100, currency: 'GHS' },
      customer,
      'https://app.example.com/pay-invoice/token',
      company
    );
    expect(result.html).toContain('View &amp; Pay Invoice');
    expect(result.text).toMatch(/view and pay/i);
    expect(result.subject).toMatch(/Due/i);
  });

  it('hides the pay CTA when the invoice is already paid', () => {
    const result = invoiceNotification(
      { invoiceNumber: 'INV-1', status: 'paid', totalAmount: 100, amountPaid: 100, balance: 0, currency: 'GHS' },
      customer,
      'https://app.example.com/pay-invoice/token',
      company
    );
    expect(result.html).not.toContain('View &amp; Pay Invoice');
    expect(result.text).not.toMatch(/view and pay/i);
    expect(result.text).toMatch(/paid in full/i);
  });
});
