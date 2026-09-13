import { describe, it, expect } from 'vitest';
import { resolveInvoiceDocumentContext } from '../../utils/invoiceDocumentContext';

describe('resolveInvoiceDocumentContext', () => {
  it('hides job details and product codes on rental invoices', () => {
    const context = resolveInvoiceDocumentContext({
      sourceType: 'rental',
      metadata: {
        generatedFrom: 'rental',
        startDate: '2026-08-30',
        endDate: '2026-09-01',
        rentalDurationDays: 3,
      },
    });

    expect(context.showJobDetails).toBe(false);
    expect(context.showProductCode).toBe(false);
    expect(context.showRentalDetails).toBe(true);
    expect(context.sourceDetailsTitle).toBe('Rental Details');
    expect(context.quantityColumnLabel).toBe('Days');
    expect(context.rentalDetails.periodLabel).toContain('August 30, 2026');
    expect(context.rentalDetails.durationDays).toBe(3);
  });

  it('hides job details on sale invoices even when job is empty', () => {
    const context = resolveInvoiceDocumentContext({
      sourceType: 'sale',
      job: null,
      sale: { saleNumber: 'SALE-1' },
    });

    expect(context.showJobDetails).toBe(false);
    expect(context.showSaleDetails).toBe(true);
    expect(context.sourceDetailsTitle).toBe('Sale Details');
    expect(context.showProductCode).toBe(true);
  });

  it('shows job details only when the invoice is actually tied to a job', () => {
    expect(resolveInvoiceDocumentContext({
      sourceType: 'job',
      job: { jobNumber: 'JOB-1', title: 'Banners' },
    }).showJobDetails).toBe(true);

    expect(resolveInvoiceDocumentContext({
      sourceType: 'job',
      job: null,
    }).showJobDetails).toBe(false);
  });

  it('does not invent a job column for a generic preview invoice', () => {
    const context = resolveInvoiceDocumentContext({
      invoiceNumber: 'INV-2024-001',
      items: [{ description: 'Sample', quantity: 1, unitPrice: 10 }],
    });
    expect(context.showJobDetails).toBe(false);
    expect(context.hasSourceDetails).toBe(false);
  });
});
