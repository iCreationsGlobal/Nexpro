import {
  SCAN_MESSAGES,
  formatAddedLine,
  formatCartSummary,
  lookUpScannedCode,
  planScanAdd,
  searchTextFromScan,
  summarizeCart,
  type SellScanProduct,
} from '@/utils/sellScan';

const gown: SellScanProduct = {
  id: 'p-gown',
  name: 'Gown',
  sellingPrice: 100,
  barcode: '111111',
  trackStock: true,
  quantityOnHand: 9,
  hasVariants: true,
  variants: [
    { id: 'v-m', name: 'M', barcode: '222222', sellingPrice: 120, quantityOnHand: 4, attributes: { size: 'M' } },
    { id: 'v-l', name: 'L', barcode: '333333', sellingPrice: 130, quantityOnHand: 0, attributes: { size: 'L' } },
  ],
};
const soap: SellScanProduct = { id: 'p-soap', name: 'Soap', sellingPrice: 5, barcode: '8886304600137', trackStock: true, quantityOnHand: 20 };

describe('the strip over the camera', () => {
  it('counts every unit in the cart and totals it the way the cart does', () => {
    const summary = summarizeCart([
      { quantity: 3, unitPrice: 120 },
      { quantity: 2, unitPrice: 130, discount: 20 },
    ]);
    expect(summary).toEqual({ count: 5, total: 600 });
    expect(formatCartSummary(summary)).toBe('5 items · ₵ 600.00');
  });

  it('says "1 item" for one and handles an empty cart', () => {
    expect(formatCartSummary(summarizeCart([{ quantity: 1, unitPrice: 12.5 }]))).toBe('1 item · ₵ 12.50');
    expect(formatCartSummary(summarizeCart([]))).toBe('0 items · ₵ 0.00');
  });

  it('shows the last item added with its size and price', () => {
    expect(formatAddedLine('Gown – M', 120)).toBe('Added: Gown – M · ₵ 120.00');
  });
});

describe('what a scanned product becomes', () => {
  it("adds a size's own barcode straight in (server returned selectedVariant)", () => {
    const step = planScanAdd({ ...gown, selectedVariant: gown.variants![0] });
    expect(step.kind).toBe('add');
    if (step.kind !== 'add') return;
    expect(step.label).toBe('Gown – M');
    expect(step.unitPrice).toBe(120);
    expect(step.input.selectedVariant?.id).toBe('v-m');
    expect(step.input.barcode).toBe('222222');
  });

  it('asks for a size when the main barcode of a product with sizes is scanned', () => {
    expect(planScanAdd(gown)).toEqual({ kind: 'choose-variant', product: gown });
  });

  it('adds the size chosen in the picker', () => {
    const step = planScanAdd(gown, gown.variants![0]);
    expect(step.kind === 'add' && step.label).toBe('Gown – M');
  });

  it('reports out of stock instead of adding', () => {
    expect(planScanAdd(gown, gown.variants![1])).toEqual({ kind: 'problem', message: 'Gown – L is out of stock' });
    expect(planScanAdd({ ...soap, quantityOnHand: 0 })).toEqual({ kind: 'problem', message: 'Soap is out of stock' });
  });

  it('adds a plain product', () => {
    const step = planScanAdd(soap);
    expect(step.kind === 'add' && [step.label, step.unitPrice]).toEqual(['Soap', 5]);
  });
});

describe('looking up a scanned code', () => {
  it('matches the loaded catalogue first without asking the server', async () => {
    const lookup = jest.fn();
    const result = await lookUpScannedCode('8886304600137', { loadedProducts: [soap, gown], lookup });
    expect(result).toEqual({ status: 'found', product: soap });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("asks the server otherwise (a size's barcode comes back with selectedVariant)", async () => {
    const lookup = jest.fn().mockResolvedValue({ success: true, data: { ...gown, selectedVariant: gown.variants![0] } });
    const result = await lookUpScannedCode('222222', { loadedProducts: [soap, gown], lookup });
    expect(lookup).toHaveBeenCalledWith(expect.arrayContaining(['222222']));
    expect(result.status === 'found' && result.product.selectedVariant?.id).toBe('v-m');
  });

  it('reports a barcode nobody has', async () => {
    const lookup = jest.fn().mockRejectedValue({ response: { status: 404 } });
    expect(await lookUpScannedCode('999999', { loadedProducts: [], lookup })).toEqual({
      status: 'not-found',
      message: SCAN_MESSAGES.notFound,
    });
    expect(SCAN_MESSAGES.notFound).toBe('No product for this barcode');
  });

  it('says when the lookup could not be done (no internet)', async () => {
    const lookup = jest.fn().mockRejectedValue(new Error('Network Error'));
    expect(await lookUpScannedCode('999999', { loadedProducts: [], lookup })).toEqual({
      status: 'error',
      message: SCAN_MESSAGES.lookupFailed,
    });
  });

  it('finds one of our QR labels by its product, then by its barcode, then uses the label', async () => {
    const lookup = jest.fn().mockRejectedValue({ response: { status: 404 } });
    const label = JSON.stringify({ id: 'p-soap', name: 'Soap', barcode: '8886304600137', sellingPrice: 5 });
    expect(await lookUpScannedCode(label, { loadedProducts: [soap], lookup })).toEqual({ status: 'found', product: soap });

    const byBarcode = JSON.stringify({ id: 'old-id', name: 'Soap', barcode: '8886304600137' });
    expect(await lookUpScannedCode(byBarcode, { loadedProducts: [soap], lookup })).toEqual({ status: 'found', product: soap });

    const unknown = JSON.stringify({ id: 'p-x', name: 'Candle', barcode: '444', sellingPrice: 3 });
    const result = await lookUpScannedCode(unknown, { loadedProducts: [], lookup });
    expect(result.status === 'found' && [result.product.id, result.product.name]).toEqual(['p-x', 'Candle']);
  });
});

describe('search box camera', () => {
  it('puts the code in the box, or the barcode for one of our QR labels', () => {
    expect(searchTextFromScan(' 8886304600137 ')).toBe('8886304600137');
    expect(searchTextFromScan(JSON.stringify({ name: 'Soap', barcode: '8886304600137' }))).toBe('8886304600137');
    expect(searchTextFromScan(JSON.stringify({ name: 'Soap', sku: 'SOAP-1' }))).toBe('SOAP-1');
  });
});
