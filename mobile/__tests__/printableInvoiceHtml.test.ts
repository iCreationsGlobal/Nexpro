import { buildPrintableInvoiceHtml } from '@/utils/printableInvoiceHtml';

describe('buildPrintableInvoiceHtml', () => {
  const baseInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-09-02T10:00:00.000Z',
    dueDate: '2026-09-16T10:00:00.000Z',
    totalAmount: 150,
    subtotal: 150,
    amountPaid: 50,
    balance: 100,
    taxRate: 0,
    taxAmount: 0,
    status: 'sent',
    customer: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '0241234567',
      company: 'Acme Ltd',
    },
    items: [
      {
        description: 'Widget A',
        quantity: 2,
        unitPrice: 50,
        total: 100,
        productCode: 'WGT-A',
      },
      {
        description: 'Widget B',
        quantity: 1,
        unitPrice: 50,
        total: 50,
        sku: 'WGT-B',
      },
    ],
    organization: {
      name: 'ABS Hardware',
      phone: '0301234567',
      email: 'shop@example.com',
      website: 'https://example.com',
      address: {
        line1: '12 Market Street',
        city: 'Accra',
        country: 'Ghana',
      },
      tax: {
        displayLabel: 'VAT',
        vatNumber: 'VAT123',
        tin: 'TIN456',
      },
      invoiceFooter: 'Thank you for shopping with us.',
      paymentDetailsEnabled: true,
      paymentDetails: 'MoMo: 0240000000\nBank: GCB 1234567890',
    },
    paymentTerms: 'Payment due within 14 days.',
    termsAndConditions: 'Goods sold are not returnable.',
  };

  it('renders web-style invoice sections and table headers', () => {
    const html = buildPrintableInvoiceHtml(baseInvoice, 'http://localhost:5001', {
      showProductCode: true,
    });

    expect(html).toContain('class="printable-invoice"');
    expect(html).toContain('INVOICE');
    expect(html).toContain('Invoice #');
    expect(html).toContain('INV-001');
    expect(html).toContain('Bill To:');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Description');
    expect(html).toContain('Product Code');
    expect(html).toContain('Unit Price');
    expect(html).toContain('Amount');
    expect(html).toContain('Widget A');
    expect(html).toContain('WGT-A');
    expect(html).toContain('Total Amount:');
    expect(html).toContain('Balance Due:');
    expect(html).toContain('Terms &amp; Conditions:');
    expect(html).toContain('Pay to');
    expect(html).toContain('MoMo: 0240000000');
    expect(html).toContain('Thank you for shopping with us.');
    expect(html).toContain('background-color: #f3f4f6');
  });

  it('hides product code column for studio-like invoices when not overridden', () => {
    const html = buildPrintableInvoiceHtml(
      { ...baseInvoice, sourceType: 'job', job: { jobNumber: 'JOB-9', title: 'Print job' } },
      'http://localhost:5001'
    );

    expect(html).toContain('Job Details:');
    expect(html).toContain('JOB-9');
    expect(html).not.toContain('Product Code');
  });

  it('shows rental details and Days column for rental invoices', () => {
    const html = buildPrintableInvoiceHtml(
      {
        ...baseInvoice,
        sourceType: 'rental',
        metadata: {
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          rentalDurationDays: 4,
        },
      },
      'http://localhost:5001'
    );

    expect(html).toContain('Rental Details:');
    expect(html).toContain('Duration:');
    expect(html).toContain('Days');
    expect(html).not.toContain('Product Code');
  });
});
