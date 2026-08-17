const {
  convertLineItemsFromTaxInclusive,
  computeTotalsFromSubtotalAndDiscount,
  computeDocumentTax,
} = require('../../../utils/taxCalculation');

describe('taxCalculation Ghana multi-levy', () => {
  it('sums levy rates and allocates levy amounts', () => {
    const result = computeDocumentTax({
      lines: [{ quantity: 1, unitPrice: 100, discount: 0 }],
      cartDiscount: 0,
      config: {
        enabled: true,
        defaultRatePercent: 0,
        pricesAreTaxInclusive: false,
        levies: [
          { code: 'vat', label: 'VAT', ratePercent: 12.5, enabled: true },
          { code: 'nhil', label: 'NHIL', ratePercent: 2.5, enabled: true },
          { code: 'getfund', label: 'GETFund', ratePercent: 2.5, enabled: true },
          { code: 'covid', label: 'COVID-19 HRL', ratePercent: 1, enabled: true },
        ],
      },
    });

    expect(result.appliedRatePercent).toBe(18.5);
    expect(result.taxAmount).toBe(18.5);
    expect(result.total).toBe(118.5);
    expect(result.levies).toHaveLength(4);
    expect(result.levies.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(18.5, 2);
  });
});

describe('taxCalculation inclusive invoice conversion', () => {
  it('converts tax-inclusive line prices to net values while preserving gross total', () => {
    const converted = convertLineItemsFromTaxInclusive([
      {
        description: 'Item',
        quantity: 1,
        unitPrice: 112,
        total: 112
      }
    ], 12);

    expect(converted).toEqual({
      items: [expect.objectContaining({
        unitPrice: 100,
        discountAmount: 0,
        total: 100
      })],
      subtotal: 100,
      discountTotal: 0
    });

    const totals = computeTotalsFromSubtotalAndDiscount({
      subtotal: converted.subtotal,
      discountTotal: converted.discountTotal,
      config: { enabled: true, defaultRatePercent: 12, pricesAreTaxInclusive: false }
    });

    expect(totals.taxAmount).toBe(12);
    expect(totals.total).toBe(112);
  });

  it('converts tax-inclusive line discounts to net discounts without double-subtracting', () => {
    const converted = convertLineItemsFromTaxInclusive([
      {
        description: 'Discounted item',
        quantity: 1,
        unitPrice: 112,
        discountAmount: 11.2,
        total: 100.8
      }
    ], 12);

    expect(converted.items[0]).toEqual(expect.objectContaining({
      unitPrice: 100,
      discountAmount: 10,
      total: 90
    }));
    expect(converted.subtotal).toBe(100);
    expect(converted.discountTotal).toBe(10);

    const totals = computeTotalsFromSubtotalAndDiscount({
      subtotal: converted.subtotal,
      discountTotal: converted.discountTotal,
      config: { enabled: true, defaultRatePercent: 12, pricesAreTaxInclusive: false }
    });

    expect(totals.taxAmount).toBe(10.8);
    expect(totals.total).toBe(100.8);
  });
});
